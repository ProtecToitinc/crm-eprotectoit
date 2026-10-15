import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Plus, Pencil, Trash2, Check, Search, BellRing } from 'lucide-react';
import { api } from '../api';
import { useUI } from '../context/UIContext';
import { CALL_DIRECTIONS, soft } from '../constants';
import { norm, fullName, telHref } from '../lib/search';
import { todayKey, addDays, daysFromToday, fmtDay, relativeDay } from '../lib/dates';
import { cmpText, cmpValue, useStoredChoice } from '../lib/sort';
import { SortSelect, Avatar, DirectionChip, inputStyle, iconBtn, btnAccent, cardStyle } from '../components/ui';

const JOURNAL_SORTS = [
  { value: 'recent', label: 'Plus récents' },
  { value: 'ancien', label: 'Plus anciens' },
  { value: 'client', label: 'Client A → Z' },
  { value: 'client_za', label: 'Client Z → A' },
  { value: 'duree', label: 'Plus longs' },
  { value: 'rappel', label: 'Rappel le plus proche' }
];
const CLIENT_SORTS = [
  { value: 'recent', label: 'Dernier appel récent' },
  { value: 'ancien', label: 'Dernier appel ancien' },
  { value: 'client', label: 'Client A → Z' },
  { value: 'client_za', label: 'Client Z → A' },
  { value: 'nb', label: 'Plus d’appels' }
];

const FILTERS = [
  ['all', 'Tous'],
  ['entrant', 'Reçus'],
  ['sortant', 'Faits'],
  ['manque', 'Manqués'],
  ['rappel', 'À rappeler']
];

const stamp = a => `${a.date_appel || ''} ${a.heure || '00:00'}`;
const pending = a => !!a.a_rappeler && !a.rappel_fait;

function journalComparator(sort) {
  return {
    recent: (a, b) => cmpValue(stamp(a), stamp(b), -1) || b.id - a.id,
    ancien: (a, b) => cmpValue(stamp(a), stamp(b), 1) || a.id - b.id,
    client: (a, b) => cmpText(fullName(a), fullName(b)) || cmpValue(stamp(a), stamp(b), -1),
    client_za: (a, b) => cmpText(fullName(b), fullName(a)) || cmpValue(stamp(a), stamp(b), -1),
    duree: (a, b) => cmpValue(a.duree_min, b.duree_min, -1) || cmpValue(stamp(a), stamp(b), -1),
    rappel: (a, b) => cmpValue(pending(a) ? `${a.rappel_date || '9999'} ${a.rappel_heure || ''}` : null, pending(b) ? `${b.rappel_date || '9999'} ${b.rappel_heure || ''}` : null, 1) || cmpValue(stamp(a), stamp(b), -1)
  }[sort];
}

function ReminderBadge({ a }) {
  if (!pending(a)) return null;
  const diff = a.rappel_date ? daysFromToday(a.rappel_date) : null;
  const late = diff !== null && diff < 0;
  const hue = late ? '#c4584f' : '#c8924a';
  const label = a.rappel_date
    ? `${late ? 'En retard · ' : 'À rappeler · '}${diff !== null && diff >= -1 && diff <= 1 ? relativeDay(a.rappel_date).toLowerCase() : fmtDay(a.rappel_date, { day: 'numeric', month: 'short' })}${a.rappel_heure ? ` à ${a.rappel_heure}` : ''}`
    : 'À rappeler';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: soft(hue), color: hue, whiteSpace: 'nowrap' }}>
      <BellRing size={11} />{label}
    </span>
  );
}

function dayTitle(key) {
  const diff = daysFromToday(key);
  if (diff === 0) return 'Aujourd’hui';
  if (diff === -1) return 'Hier';
  return fmtDay(key, { weekday: 'long', day: 'numeric', month: 'long', year: diff !== null && diff < -300 ? 'numeric' : undefined });
}

function CallRow({ a, showDate, onEdit, onDelete, onDone, onClient }) {
  const href = telHref(a.telephone);
  const dir = CALL_DIRECTIONS[a.direction];
  return (
    <div className="row-hover" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
      <DirectionChip direction={a.direction} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="linkbtn" onClick={() => onClient(a.client_id)} style={{ border: 'none', background: 'transparent', padding: 0, color: 'var(--fg)', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer', textAlign: 'left' }}>{fullName(a) || '—'}</button>
          <span style={{ fontSize: 12.5, color: dir?.hue, fontWeight: 700 }}>{dir?.label}</span>
        </div>
        {(a.sujet || a.resume) && (
          <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 3, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {a.sujet && <b style={{ color: 'var(--fg)', fontWeight: 700 }}>{a.sujet}</b>}{a.sujet && a.resume ? ' — ' : ''}{a.resume}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6, fontSize: 12, color: 'var(--fg-faint)' }}>
          {showDate && <span>{fmtDay(a.date_appel, { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
          {a.heure && <span>{a.heure}</span>}
          {a.duree_min ? <span>{a.duree_min} min</span> : null}
          {a.ville ? <span>{a.ville}</span> : null}
          <ReminderBadge a={a} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 130 }}>
        {pending(a) && <button type="button" className="iconbtn" title="Rappel fait" aria-label="Rappel fait" onClick={() => onDone(a)} style={{ ...iconBtn, color: '#5f9d5f' }}><Check size={15} /></button>}
        {href && <a className="iconbtn" href={href} title="Appeler" aria-label="Appeler" style={{ ...iconBtn, textDecoration: 'none' }}><Phone size={14} /></a>}
        <button type="button" className="iconbtn" title="Modifier" aria-label="Modifier" onClick={() => onEdit(a)} style={iconBtn}><Pencil size={14} /></button>
        <button type="button" className="iconbtn" title="Supprimer" aria-label="Supprimer" onClick={() => onDelete(a)} style={{ ...iconBtn, color: '#c4584f' }}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

export default function Appels() {
  const navigate = useNavigate();
  const { openCallModal, openDeal, refreshKey, bumpRefresh, showToast } = useUI();
  const [calls, setCalls] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useStoredChoice('crm_appels_view', 'journal', ['journal', 'clients']);
  const [filter, setFilter] = useStoredChoice('crm_appels_filter', 'all', FILTERS.map(f => f[0]));
  const [sortJ, setSortJ] = useStoredChoice('crm_appels_sort', 'recent', JOURNAL_SORTS.map(s => s.value));
  const [sortC, setSortC] = useStoredChoice('crm_appels_sort_clients', 'recent', CLIENT_SORTS.map(s => s.value));
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    api.appels.list().then(r => { setCalls(r || []); setError(''); }).catch(e => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const stats = useMemo(() => {
    const all = calls || [];
    const weekStart = addDays(todayKey(), -6);
    return {
      total: all.length,
      semaine: all.filter(a => a.date_appel >= weekStart).length,
      clientsAppele: new Set(all.filter(a => a.direction !== 'sortant').map(a => a.client_id)).size,
      rappels: all.filter(pending).length
    };
  }, [calls]);

  const counts = useMemo(() => {
    const all = calls || [];
    return {
      all: all.length,
      entrant: all.filter(a => a.direction === 'entrant').length,
      sortant: all.filter(a => a.direction === 'sortant').length,
      manque: all.filter(a => a.direction === 'manque').length,
      rappel: all.filter(pending).length
    };
  }, [calls]);

  const filtered = useMemo(() => {
    const words = q.trim().split(/\s+/).filter(Boolean).map(norm);
    return (calls || []).filter(a => {
      if (filter === 'rappel' ? !pending(a) : (filter !== 'all' && a.direction !== filter)) return false;
      const hay = norm(`${fullName(a)} ${a.sujet || ''} ${a.resume || ''} ${a.ville || ''} ${a.telephone || ''}`);
      return words.every(w => hay.includes(w));
    });
  }, [calls, filter, q]);

  const journal = useMemo(() => [...filtered].sort(journalComparator(sortJ)), [filtered, sortJ]);

  // Regroupé par jour seulement quand le tri est chronologique
  const dayGroups = useMemo(() => {
    if (sortJ !== 'recent' && sortJ !== 'ancien') return null;
    const groups = [];
    journal.forEach(a => {
      const last = groups[groups.length - 1];
      if (last && last.date === a.date_appel) last.items.push(a);
      else groups.push({ date: a.date_appel, items: [a] });
    });
    return groups;
  }, [journal, sortJ]);

  const byClient = useMemo(() => {
    const map = new Map();
    filtered.forEach(a => {
      if (!map.has(a.client_id)) map.set(a.client_id, { id: a.client_id, prenom: a.prenom, nom: a.nom, telephone: a.telephone, ville: a.ville, calls: [], last: '', rappels: 0, recus: 0 });
      const g = map.get(a.client_id);
      g.calls.push(a);
      if (stamp(a) > g.last) g.last = stamp(a);
      if (pending(a)) g.rappels += 1;
      if (a.direction !== 'sortant') g.recus += 1;
    });
    const list = [...map.values()];
    const cmp = {
      recent: (a, b) => cmpValue(a.last, b.last, -1),
      ancien: (a, b) => cmpValue(a.last, b.last, 1),
      client: (a, b) => cmpText(fullName(a), fullName(b)),
      client_za: (a, b) => cmpText(fullName(b), fullName(a)),
      nb: (a, b) => b.calls.length - a.calls.length || cmpValue(a.last, b.last, -1)
    }[sortC];
    return list.sort(cmp);
  }, [filtered, sortC]);

  const markDone = async a => {
    try { await api.appels.update(a.id, { rappel_fait: 1 }); bumpRefresh(); showToast('Rappel marqué comme fait'); } catch (e) { showToast(e.message); }
  };
  const remove = async a => {
    if (!window.confirm('Supprimer cet appel du CRM ?')) return;
    if (!window.confirm('Supprimer cet appel ?')) return;
    try { await api.appels.delete(a.id); bumpRefresh(); showToast('Appel supprimé'); } catch (e) { showToast(e.message); }
  };
  const rowProps = { onEdit: a => openCallModal(a.client_id, a), onDelete: remove, onDone: markDone, onClient: id => openDeal(id) };

  const statCards = [
    ['Appels au total', stats.total, '#6b8cae'],
    ['Cette semaine', stats.semaine, '#5f9d5f'],
    ['Clients qui ont appelé', stats.clientsAppele, '#c17a3f'],
    ['À rappeler', stats.rappels, stats.rappels ? '#c4584f' : '#9aa0a6']
  ];

  return (
    <div className="fadein" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {statCards.map(([label, value, hue]) => (
          <div key={label} style={{ ...cardStyle, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)' }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: hue, marginTop: 4, letterSpacing: '-.02em' }}>{calls ? value : '—'}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 3, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
          {[['journal', 'Journal'], ['clients', 'Par client']].map(([key, label]) => (
            <button key={key} type="button" className="seg" data-active={view === key ? 'true' : 'false'} onClick={() => setView(key)} style={{
              border: 'none', background: 'transparent', color: 'var(--fg-muted)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              padding: '7px 13px', borderRadius: 7, cursor: 'pointer'
            }}>{label}</button>
          ))}
        </div>

        <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 150, maxWidth: 320 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrer les appels…" style={{ ...inputStyle, height: 38, paddingLeft: 34 }} />
        </div>

        {view === 'journal'
          ? <SortSelect value={sortJ} onChange={setSortJ} options={JOURNAL_SORTS} />
          : <SortSelect value={sortC} onChange={setSortC} options={CLIENT_SORTS} />}

        <button type="button" className="btn-accent" onClick={() => openCallModal()} style={{ ...btnAccent, marginLeft: 'auto' }}>
          <Plus size={16} strokeWidth={2.4} />Enregistrer un appel
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map(([key, label]) => {
          const on = filter === key;
          return (
            <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={on} style={{
              height: 34, padding: '0 13px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? soft('#c17a3f') : 'var(--surface)',
              color: on ? 'var(--accent)' : 'var(--fg-muted)'
            }}>{label} <span style={{ opacity: 0.65, fontWeight: 600 }}>{counts[key]}</span></button>
          );
        })}
      </div>

      {error && <div role="alert" style={{ color: '#c4584f', fontSize: 13.5, fontWeight: 600 }}>{error}</div>}
      {!calls && !error && <div style={{ color: 'var(--fg-muted)', fontSize: 13.5 }}>Chargement…</div>}

      {calls && calls.length === 0 && (
        <div style={{ ...cardStyle, padding: '44px 20px', textAlign: 'center' }}>
          <Phone size={30} style={{ color: 'var(--fg-faint)' }} />
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 10 }}>Aucun appel enregistré</div>
          <div style={{ fontSize: 13.5, color: 'var(--fg-muted)', margin: '4px 0 16px' }}>Notez chaque appel reçu ou fait : il apparaît dans la fiche du client et peut créer un rappel.</div>
          <button type="button" className="btn-accent" onClick={() => openCallModal()} style={btnAccent}><Plus size={16} strokeWidth={2.4} />Enregistrer un appel</button>
        </div>
      )}
      {calls && calls.length > 0 && filtered.length === 0 && (
        <div style={{ ...cardStyle, padding: '30px 20px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13.5 }}>Aucun appel ne correspond.</div>
      )}

      {view === 'journal' && filtered.length > 0 && (
        dayGroups ? dayGroups.map(g => (
          <section key={g.date}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--fg-muted)', textTransform: 'capitalize', margin: '2px 4px 8px' }}>{dayTitle(g.date)} <span style={{ fontWeight: 600, color: 'var(--fg-faint)' }}>· {g.items.length}</span></div>
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              {g.items.map(a => <CallRow key={a.id} a={a} showDate={false} {...rowProps} />)}
            </div>
          </section>
        )) : (
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            {journal.map(a => <CallRow key={a.id} a={a} showDate {...rowProps} />)}
          </div>
        )
      )}

      {view === 'clients' && byClient.length > 0 && (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          {byClient.map(g => {
            const href = telHref(g.telephone);
            const lastDate = g.last.slice(0, 10);
            return (
              <div key={g.id} className="row-hover" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <div onClick={() => navigate(`/clients/${g.id}?tab=appels`)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 220px', minWidth: 0, cursor: 'pointer' }}>
                  <Avatar client={g} size={38} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName(g) || '—'}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[g.telephone, g.ville].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: '1 1 240px' }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{g.calls.length} appel{g.calls.length > 1 ? 's' : ''}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>dernier : {relativeDay(lastDate).toLowerCase() || fmtDay(lastDate)}</span>
                  {g.rappels > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: soft('#c8924a'), color: '#c8924a' }}>{g.rappels} à rappeler</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                  {href && <a className="iconbtn" href={href} title="Appeler" aria-label="Appeler" style={{ ...iconBtn, textDecoration: 'none' }}><Phone size={14} /></a>}
                  <button type="button" className="iconbtn" title="Enregistrer un appel" aria-label="Enregistrer un appel" onClick={() => openCallModal(g.id)} style={iconBtn}><Plus size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
