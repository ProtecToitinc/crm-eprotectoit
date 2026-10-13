import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pin, PinOff, Pencil, Trash2, Search, StickyNote, User } from 'lucide-react';
import { api } from '../api';
import { useUI } from '../context/UIContext';
import { norm, fullName } from '../lib/search';
import { fmtDbDay, parseDb } from '../lib/dates';
import { cmpText, useStoredChoice } from '../lib/sort';
import { SortSelect, Avatar, inputStyle, iconBtn, btnAccent, cardStyle } from '../components/ui';

const SORTS = [
  { value: 'recent', label: 'Plus récentes' },
  { value: 'ancien', label: 'Plus anciennes' },
  { value: 'az', label: 'Titre A → Z' },
  { value: 'za', label: 'Titre Z → A' },
  { value: 'client', label: 'Client A → Z' }
];

const title = n => n.titre || n.contenu.split('\n')[0];
const time = n => parseDb(n.updated_at)?.getTime() ?? 0;

function comparator(sort) {
  const byPin = (a, b) => (b.epingle ? 1 : 0) - (a.epingle ? 1 : 0);
  const rest = {
    recent: (a, b) => time(b) - time(a) || b.id - a.id,
    ancien: (a, b) => time(a) - time(b) || a.id - b.id,
    az: (a, b) => cmpText(title(a), title(b)),
    za: (a, b) => cmpText(title(b), title(a)),
    client: (a, b) => cmpText(fullName(a), fullName(b)) || time(b) - time(a)
  }[sort];
  return (a, b) => byPin(a, b) || rest(a, b);
}

function NoteCard({ n, showClient, onEdit, onPin, onDelete, onOpenClient }) {
  const [open, setOpen] = useState(false);
  const long = n.contenu.length > 240 || n.contenu.split('\n').length > 6;
  return (
    <article style={{ ...cardStyle, padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 9, borderColor: n.epingle ? 'color-mix(in srgb, var(--accent) 40%, var(--border))' : 'var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 800, lineHeight: 1.3, wordBreak: 'break-word' }}>
          {n.epingle ? <Pin size={13} style={{ color: 'var(--accent)', marginRight: 6, verticalAlign: '-1px' }} /> : null}
          {n.titre || <span style={{ fontWeight: 600, color: 'var(--fg-muted)' }}>Sans titre</span>}
        </div>
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <button type="button" className="iconbtn" title={n.epingle ? 'Détacher' : 'Épingler'} aria-label={n.epingle ? 'Détacher' : 'Épingler'} onClick={() => onPin(n)} style={iconBtn}>{n.epingle ? <PinOff size={14} /> : <Pin size={14} />}</button>
          <button type="button" className="iconbtn" title="Modifier" aria-label="Modifier" onClick={() => onEdit(n)} style={iconBtn}><Pencil size={14} /></button>
          <button type="button" className="iconbtn" title="Supprimer" aria-label="Supprimer" onClick={() => onDelete(n)} style={{ ...iconBtn, color: '#c4584f' }}><Trash2 size={14} /></button>
        </div>
      </div>

      <div
        onClick={() => long && setOpen(o => !o)}
        style={{
          fontSize: 13.5, lineHeight: 1.5, color: 'var(--fg)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          cursor: long ? 'pointer' : 'default',
          ...(open ? {} : { display: '-webkit-box', WebkitLineClamp: 7, WebkitBoxOrient: 'vertical', overflow: 'hidden' })
        }}
      >{n.contenu}</div>
      {long && <button type="button" className="linkbtn" onClick={() => setOpen(o => !o)} style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', padding: 0, color: 'var(--fg-muted)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{open ? 'Voir moins' : 'Voir tout'}</button>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2, fontSize: 12, color: 'var(--fg-faint)' }}>
        {showClient && (
          n.client_id ? (
            <button type="button" className="linkbtn" onClick={() => onOpenClient(n.client_id)} style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 5, minWidth: 0, maxWidth: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: 0, color: 'var(--fg-muted)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, lineHeight: 1.35, cursor: 'pointer' }}>
              <User size={12} style={{ flexShrink: 0, marginTop: 1.5 }} />{fullName(n)}
            </button>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, color: 'var(--fg-muted)' }}><StickyNote size={12} />Générale</span>
          )
        )}
        <span>{fmtDbDay(n.updated_at)}</span>
      </div>
    </article>
  );
}

export default function Notes() {
  const navigate = useNavigate();
  const { openNoteModal, openDeal, refreshKey, bumpRefresh, showToast } = useUI();
  const [notes, setNotes] = useState(null);
  const [clients, setClients] = useState([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useStoredChoice('crm_notes_filter', 'all', ['all', 'general', 'client']);
  const [sort, setSort] = useStoredChoice('crm_notes_sort', 'recent', SORTS.map(s => s.value));
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    api.notes.list().then(r => { setNotes(r || []); setError(''); }).catch(e => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  // Vue « Par client » : tous les clients, même sans note, pour pouvoir en ajouter une
  useEffect(() => { api.clients.list().then(l => setClients(l || [])).catch(() => {}); }, [refreshKey]);

  const counts = useMemo(() => {
    const all = notes || [];
    return { all: all.length, general: all.filter(n => !n.client_id).length, client: all.filter(n => n.client_id).length };
  }, [notes]);

  const visible = useMemo(() => {
    const words = q.trim().split(/\s+/).filter(Boolean).map(norm);
    return (notes || [])
      .filter(n => filter === 'all' || (filter === 'general' ? !n.client_id : !!n.client_id))
      .filter(n => { const hay = norm(`${n.titre || ''} ${n.contenu} ${fullName(n)}`); return words.every(w => hay.includes(w)); })
      .sort(comparator(sort));
  }, [notes, filter, q, sort]);

  // Vue « Par client » : un bloc par client, classé selon le tri choisi
  const groups = useMemo(() => {
    if (filter !== 'client') return [];
    const map = new Map();
    visible.forEach(n => {
      if (!map.has(n.client_id)) map.set(n.client_id, { id: n.client_id, prenom: n.prenom, nom: n.nom, notes: [] });
      map.get(n.client_id).notes.push(n);
    });
    const words = q.trim().split(/\s+/).filter(Boolean).map(norm);
    clients.forEach(c => {
      if (map.has(c.id)) return;
      const hay = norm(`${c.prenom || ''} ${c.nom || ''} ${c.telephone || ''} ${c.ville || ''}`);
      if (words.every(w => hay.includes(w))) map.set(c.id, { id: c.id, prenom: c.prenom, nom: c.nom, notes: [] });
    });
    const list = [...map.values()];
    const newest = g => (g.notes.length ? Math.max(...g.notes.map(time)) : -Infinity);
    const oldest = g => (g.notes.length ? Math.min(...g.notes.map(time)) : Infinity);
    const byName = (a, b) => cmpText(fullName(a), fullName(b));
    // Les clients qui ont des notes d'abord, puis les autres par ordre alphabétique
    const withNotes = list.filter(g => g.notes.length), without = list.filter(g => !g.notes.length).sort(byName);
    if (sort === 'recent') withNotes.sort((a, b) => newest(b) - newest(a));
    else if (sort === 'ancien') withNotes.sort((a, b) => oldest(a) - oldest(b));
    else if (sort === 'za') withNotes.sort((a, b) => cmpText(fullName(b), fullName(a)));
    else withNotes.sort(byName);
    return [...withNotes, ...without];
  }, [visible, filter, sort, clients, q]);

  const togglePin = async n => {
    try { await api.notes.update(n.id, { epingle: n.epingle ? 0 : 1 }); bumpRefresh(); } catch (e) { showToast(e.message); }
  };
  const remove = async n => {
    if (!window.confirm('Supprimer cette note ?')) return;
    try { await api.notes.delete(n.id); bumpRefresh(); showToast('Note supprimée'); } catch (e) { showToast(e.message); }
  };
  const cardProps = { onEdit: n => openNoteModal(null, n), onPin: togglePin, onDelete: remove, onOpenClient: id => navigate(`/clients/${id}?tab=notes`) };

  const chips = [['all', 'Toutes'], ['general', 'Générales'], ['client', 'Par client']];

  return (
    <div className="fadein" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 3, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
          {chips.map(([key, label]) => (
            <button key={key} type="button" className="seg" data-active={filter === key ? 'true' : 'false'} onClick={() => setFilter(key)} style={{
              border: 'none', background: 'transparent', color: 'var(--fg-muted)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              padding: '7px 12px', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap'
            }}>{label} <span style={{ opacity: 0.6, fontWeight: 600 }}>{counts[key]}</span></button>
          ))}
        </div>

        <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 150, maxWidth: 340 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={filter === 'client' ? 'Chercher un client ou une note…' : 'Filtrer les notes…'} style={{ ...inputStyle, height: 38, paddingLeft: 34 }} />
        </div>

        <SortSelect value={sort} onChange={setSort} options={SORTS} />

        <button type="button" className="btn-accent" onClick={() => openNoteModal(null)} style={{ ...btnAccent, marginLeft: 'auto' }}>
          <Plus size={16} strokeWidth={2.4} />Nouvelle note
        </button>
      </div>

      {error && <div role="alert" style={{ color: '#c4584f', fontSize: 13.5, fontWeight: 600 }}>{error}</div>}
      {!notes && !error && <div style={{ color: 'var(--fg-muted)', fontSize: 13.5 }}>Chargement…</div>}

      {notes && notes.length === 0 && (
        <div style={{ ...cardStyle, padding: '44px 20px', textAlign: 'center' }}>
          <StickyNote size={30} style={{ color: 'var(--fg-faint)' }} />
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 10 }}>Aucune note pour l’instant</div>
          <div style={{ fontSize: 13.5, color: 'var(--fg-muted)', margin: '4px 0 16px' }}>Écrivez une note générale ou une note liée à un client.</div>
          <button type="button" className="btn-accent" onClick={() => openNoteModal(null)} style={btnAccent}><Plus size={16} strokeWidth={2.4} />Nouvelle note</button>
        </div>
      )}
      {notes && notes.length > 0 && visible.length === 0 && filter !== 'client' && (
        <div style={{ ...cardStyle, padding: '30px 20px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13.5 }}>Aucune note ne correspond.</div>
      )}

      {filter === 'client' ? (
        groups.map(g => (
          <section key={g.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 2px 10px' }}>
              <Avatar client={g} size={30} />
              <button type="button" className="linkbtn" onClick={() => openDeal(g.id)} style={{ minWidth: 0, textAlign: 'left', border: 'none', background: 'transparent', padding: 0, color: 'var(--fg)', fontFamily: 'inherit', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>{fullName(g)}</button>
              <span style={{ flexShrink: 0, fontSize: 12.5, color: 'var(--fg-faint)', fontWeight: 600 }}>{g.notes.length ? `${g.notes.length} note${g.notes.length > 1 ? 's' : ''}` : 'aucune note'}</span>
              <button type="button" className="linkbtn" onClick={() => openNoteModal(g.id)} style={{ flexShrink: 0, marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--fg-muted)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>+ Ajouter</button>
            </div>
            {g.notes.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 14 }}>
              {g.notes.map(n => <NoteCard key={n.id} n={n} showClient={false} {...cardProps} />)}
            </div>}
          </section>
        ))
      ) : (
        visible.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 14, alignItems: 'start' }}>
            {visible.map(n => <NoteCard key={n.id} n={n} showClient {...cardProps} />)}
          </div>
        )
      )}
      {visible.length > 1 && <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>Les notes épinglées restent toujours en haut.</div>}
    </div>
  );
}
