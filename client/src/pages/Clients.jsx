import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Users, Search, X, Phone, ListChecks, Trash2 } from 'lucide-react';
import { useSelection, SelectionBar } from '../components/bits';
import { useUI } from '../context/UIContext';
import { SERVICE_HUE, STAGE_MAP, money, soft, initials, avatarColor } from '../constants';
import { api } from '../api';
import { matchClient, fullName } from '../lib/search';
import { fmtDbDay, parseDb, relativeDay } from '../lib/dates';
import { cmpText, cmpValue, useStoredChoice } from '../lib/sort';
import { Modal, Field, SortSelect, inputStyle, btnGhost, btnAccent, cardStyle } from '../components/ui';

const SORTS = [
  { value: 'recent', label: 'Plus récents' },
  { value: 'ancien', label: 'Plus anciens' },
  { value: 'nom', label: 'Nom A → Z' },
  { value: 'nom_za', label: 'Nom Z → A' },
  { value: 'prenom', label: 'Prénom A → Z' },
  { value: 'ville', label: 'Ville A → Z' },
  { value: 'valeur', label: 'Valeur (plus élevée)' },
  { value: 'appel', label: 'Dernier appel' },
  { value: 'nb_appels', label: 'Plus d’appels' }
];

const createdAt = c => parseDb(c.created_at)?.getTime() ?? 0;

function comparator(sort) {
  const byRecent = (a, b) => createdAt(b) - createdAt(a) || b.id - a.id;
  return {
    recent: byRecent,
    ancien: (a, b) => createdAt(a) - createdAt(b) || a.id - b.id,
    nom: (a, b) => cmpText(a.nom || a.prenom, b.nom || b.prenom) || cmpText(a.prenom, b.prenom),
    nom_za: (a, b) => cmpText(b.nom || b.prenom, a.nom || a.prenom) || cmpText(b.prenom, a.prenom),
    prenom: (a, b) => cmpText(a.prenom || a.nom, b.prenom || b.nom) || cmpText(a.nom, b.nom),
    ville: (a, b) => cmpText(a.ville, b.ville) || cmpText(a.nom, b.nom),
    valeur: (a, b) => cmpValue(Number(a.derniere_valeur) || 0, Number(b.derniere_valeur) || 0, -1) || byRecent(a, b),
    appel: (a, b) => cmpValue(a.dernier_appel, b.dernier_appel, -1) || byRecent(a, b),
    nb_appels: (a, b) => (b.nb_appels || 0) - (a.nb_appels || 0) || byRecent(a, b)
  }[sort] || byRecent;
}

const EMPTY_FORM = { nom: '', prenom: '', email: '', telephone: '', adresse: '', ville: '', code_postal: '', notes: '' };

export default function Clients() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const { openDeal, openCallModal, refreshKey, bumpRefresh, showToast } = useUI();
  const [clients, setClients] = useState(null);
  const [error, setError] = useState('');
  const [chip, setChip] = useState('all'); // all | called | callback
  const [sort, setSort] = useStoredChoice('crm_clients_sort', 'recent', SORTS.map(s => s.value));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const sel = useSelection();
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    api.clients.list().then(r => { setClients(r || []); setError(''); }).catch(e => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const setQ = value => {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value); else next.delete('q');
    setParams(next, { replace: true });
  };

  const counts = useMemo(() => {
    const all = (clients || []).filter(c => matchClient(c, q));
    return {
      all: all.length,
      called: all.filter(c => c.nb_appels_recus > 0).length,
      callback: all.filter(c => c.nb_rappels > 0).length
    };
  }, [clients, q]);

  const rows = useMemo(() => (clients || [])
    .filter(c => matchClient(c, q))
    .filter(c => chip === 'all' || (chip === 'called' ? c.nb_appels_recus > 0 : c.nb_rappels > 0))
    .sort(comparator(sort)), [clients, q, chip, sort]);

  async function handleCreate(e) {
    e.preventDefault();
    setFormError('');
    if (!form.prenom.trim() && !form.nom.trim()) return setFormError('Indiquez au moins le prénom ou le nom');
    setSaving(true);
    try {
      await api.clients.create(form);
      setShowForm(false);
      setForm(EMPTY_FORM);
      bumpRefresh();
      showToast('Client ajouté avec succès');
    } catch (ex) {
      setFormError(ex.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function removeClient(c) {
    const name = fullName(c) || 'ce client';
    if (!window.confirm(`Supprimer ${name} et toutes ses données dans le CRM (dossiers, soumissions, appels et documents) ? Cette action est destructive.`)) return;
    setDeleting(true);
    try {
      await api.clients.delete(c.id);
      showToast(`Client ${name} supprimé`);
      bumpRefresh();
      load();
    } catch (e) {
      showToast(e.message || 'Impossible de supprimer le client');
      setError(e.message || 'Impossible de supprimer le client');
    } finally {
      setDeleting(false);
    }
  }

  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));
  const chips = [['all', 'Tous'], ['called', 'Ont appelé'], ['callback', 'À rappeler']];

  return (
    <div className="fadein" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 160, maxWidth: 360 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrer les clients…" aria-label="Filtrer les clients" style={{ ...inputStyle, height: 38, paddingLeft: 34, paddingRight: q ? 34 : 13 }} />
          {q && <button type="button" aria-label="Effacer" onClick={() => setQ('')} style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, border: 'none', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={15} /></button>}
        </div>

        <div style={{ display: 'flex', gap: 3, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
          {chips.map(([key, label]) => (
            <button key={key} type="button" className="seg" data-active={chip === key ? 'true' : 'false'} onClick={() => setChip(key)} style={{
              border: 'none', background: 'transparent', color: 'var(--fg-muted)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              padding: '7px 12px', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap'
            }}>{label} <span style={{ opacity: 0.6, fontWeight: 600 }}>{counts[key]}</span></button>
          ))}
        </div>

        <SortSelect value={sort} onChange={setSort} options={SORTS} />

        <button type="button" className="btn-ghost" onClick={sel.on ? sel.exit : sel.enter} style={{ ...btnGhost, marginLeft: 'auto' }}><ListChecks size={16} />{sel.on ? 'Annuler la sélection' : 'Sélectionner'}</button>
        <button className="btn-accent" onClick={() => setShowForm(true)} style={btnAccent}>
          <Plus size={16} strokeWidth={2.4} />Ajouter un client
        </button>
      </div>

      {sel.on && <SelectionBar noun="client" count={sel.ids.size} total={rows.length} busy={deleting} onSelectAll={() => sel.selectAll(rows.map(c => c.id))} onClear={sel.clear} onExit={sel.exit} onDelete={async () => {
        const n = sel.ids.size;
        if (!n || !window.confirm(`Supprimer ${n} client${n > 1 ? 's' : ''} avec TOUT leur dossier (opportunités, soumissions, notes, appels, documents)?\n\nRécupérable ensuite depuis Sécurité et sauvegardes → Historique des modifications.`)) return;
        setDeleting(true); let ok = 0;
        try { for (const id of sel.ids) { await api.clients.delete(id); ok++; } } catch (e) { showToast(e.message); }
        setDeleting(false); sel.exit(); bumpRefresh(); load(); showToast(`${ok} client${ok > 1 ? 's' : ''} supprimé${ok > 1 ? 's' : ''}`);
      }} />}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 800 }}>
          {clients ? `${rows.length} client${rows.length !== 1 ? 's' : ''}` : 'Clients'}
          {clients && rows.length !== clients.length && <span style={{ fontWeight: 600, color: 'var(--fg-faint)' }}> sur {clients.length}</span>}
        </div>

        {error && <div role="alert" style={{ padding: '20px', color: '#c4584f', fontSize: 13.5, fontWeight: 600 }}>{error}</div>}
        {!clients && !error && <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13.5 }}>Chargement…</div>}

        {clients && rows.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--fg-faint)' }}>
            <Users size={32} style={{ margin: '0 auto 12px', opacity: .4 }} />
            <p style={{ margin: 0 }}>Aucun client trouvé</p>
            {q && (
              <button className="btn-ghost" onClick={() => openCallModal(null, null, { prenom: q.split(/\s+/)[0], nom: q.split(/\s+/).slice(1).join(' ') })} style={{ ...btnGhost, margin: '16px auto 0' }}>
                <Phone size={15} />Enregistrer un appel de « {q} »
              </button>
            )}
          </div>
        )}

        {clients && rows.length > 0 && (
          <div className="clients-wrap">
            <div>
              <div className="clients-row clients-head" style={{ padding: '11px 20px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fg-faint)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>
                <div>Client</div><div>Ville</div><div>Service</div><div>Valeur</div><div>Étape</div><div>Appels</div><div>Dernier contact</div><div>Actions</div>
              </div>
              {rows.map(c => {
                const ah = avatarColor(c.id);
                const sh = c.dernier_service ? SERVICE_HUE[c.dernier_service] || '#9aa0a6' : null;
                const stage = c.derniere_etape ? STAGE_MAP[c.derniere_etape] : null;
                return (
                  <div key={c.id} className="row-hover clients-row" onClick={() => (sel.on ? sel.toggle(c.id) : openDeal(c.id))} style={{ padding: '13px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13.5, alignItems: 'center', background: sel.has(c.id) ? soft('#c4584f') : undefined }}>
                    <div className="c-name" style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                      {sel.on && <input type="checkbox" aria-label={`Sélectionner ${fullName(c)}`} checked={sel.has(c.id)} onChange={() => sel.toggle(c.id)} onClick={e => e.stopPropagation()} style={{ width: 18, height: 18, flexShrink: 0, accentColor: '#c4584f' }} />}
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: soft(ah), color: ah, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                        {initials(c.prenom, c.nom) || '?'}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(c) || '—'}</div>
                        <div className="c-sub" style={{ fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[c.ville, c.telephone].filter(Boolean).join(' · ')}</div>
                      </div>
                    </div>
                    <div className="c-ville" style={{ color: 'var(--fg-muted)' }}>{c.ville || '—'}</div>
                    <div className="c-service">{sh ? <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: soft(sh), color: sh }}>{c.dernier_service}</span> : <span style={{ color: 'var(--fg-faint)' }}>—</span>}</div>
                    <div className="c-valeur" data-empty={c.derniere_valeur ? 'false' : 'true'} style={{ fontWeight: 800 }}>{c.derniere_valeur ? money(c.derniere_valeur) : '—'}</div>
                    <div className="c-etape" data-empty={stage ? 'false' : 'true'}>{stage ? <span style={{ fontSize: 11, fontWeight: 700, color: stage.hue }}>● {stage.short}</span> : <span style={{ color: 'var(--fg-faint)' }}>—</span>}</div>
                    <div className="c-appels" data-empty={c.nb_appels > 0 ? 'false' : 'true'}>
                      {c.nb_appels > 0 ? (
                        <div style={{ lineHeight: 1.3 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700 }}>
                            <Phone size={12} style={{ color: c.nb_rappels > 0 ? '#c8924a' : 'var(--fg-faint)' }} />{c.nb_appels}
                            {c.nb_rappels > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: soft('#c8924a'), color: '#c8924a' }}>À rappeler</span>}
                          </span>
                          <div className="c-sub-app" style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{c.dernier_appel ? relativeDay(c.dernier_appel).toLowerCase() : ''}</div>
                        </div>
                      ) : <span style={{ color: 'var(--fg-faint)' }}>—</span>}
                    </div>
                    <div className="c-contact" style={{ color: 'var(--fg-muted)' }}>{c.dernier_contact ? fmtDbDay(c.dernier_contact, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</div>
                    <div className="c-delete" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="button" aria-label={`Supprimer ${fullName(c)}`} title={`Supprimer ${fullName(c)}`} disabled={deleting}
                        onClick={e => { e.stopPropagation(); removeClient(c); }}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: '#c4584f', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: deleting ? .5 : 1 }}>
                        <Trash2 size={15} /> Supprimer
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <Modal
          title="Nouveau client"
          onClose={() => setShowForm(false)}
          onSubmit={handleCreate}
          width={500}
          footer={
            <>
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost" style={btnGhost}>Annuler</button>
              <button type="submit" disabled={saving} className="btn-accent" style={{ ...btnAccent, opacity: saving ? 0.7 : 1 }}>{saving ? 'Création…' : 'Créer le client'}</button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Field label="Prénom"><input autoFocus value={form.prenom} onChange={set('prenom')} style={inputStyle} /></Field>
            <Field label="Nom"><input value={form.nom} onChange={set('nom')} style={inputStyle} /></Field>
            <Field label="Téléphone"><input value={form.telephone} onChange={set('telephone')} inputMode="tel" style={inputStyle} /></Field>
            <Field label="Courriel"><input type="email" value={form.email} onChange={set('email')} style={inputStyle} /></Field>
          </div>
          <Field label="Adresse"><input value={form.adresse} onChange={set('adresse')} style={inputStyle} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Field label="Ville"><input value={form.ville} onChange={set('ville')} style={inputStyle} /></Field>
            <Field label="Code postal"><input value={form.code_postal} onChange={set('code_postal')} style={inputStyle} /></Field>
          </div>
          <Field label="Notes"><textarea rows={2} value={form.notes} onChange={set('notes')} style={{ ...inputStyle, height: 'auto', padding: '10px 13px', resize: 'vertical' }} /></Field>
          {formError && <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: '#c4584f', background: soft('#c4584f'), borderRadius: 9, padding: '9px 12px' }}>{formError}</div>}
        </Modal>
      )}
    </div>
  );
}
