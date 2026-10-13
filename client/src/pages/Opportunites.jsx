import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Trash2, RefreshCw, Plus, PhoneOff, PhoneCall, CalendarClock, Hand, Eye } from 'lucide-react';
import { api } from '../api';
import { cardStyle, btnGhost, btnAccent, btnDanger, inputStyle, textareaStyle, Field, Modal, SortSelect } from '../components/ui';
import { useLoad, ErrorNote, CallButton, Empty, Loading, Pill, Stat, statGrid, notifyBadges } from '../components/bits';
import { parseDb, timeAgo } from '../lib/dates';
import { useUI } from '../context/UIContext';

export const LEAD_STATUTS = {
  nouveau: { label: 'Nouveau', hue: '#c17a3f' },
  a_rappeler: { label: 'À rappeler', hue: '#c8924a' },
  contacte: { label: 'Contacté', hue: '#6b8cae' },
  qualifie: { label: 'Intéressé', hue: '#5f9d5f' },
  negociation: { label: 'En négociation', hue: '#a86b8c' },
  non_admissible: { label: 'Non admissible', hue: '#8a8580' },
  perdu: { label: 'Perdu', hue: '#c4584f' },
  converti: { label: 'Converti', hue: '#5f9d5f' }
};
const FILTERS = ['tous', 'nouveau', 'a_rappeler', 'contacte', 'qualifie', 'negociation', 'converti', 'non_admissible', 'perdu'];
const fullName = l => [l.prenom, l.nom].filter(Boolean).join(' ') || 'Sans nom';
const when = s => { const d = parseDb(s); return d ? d.toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; };

export default function Opportunites({ user }) {
  const { showToast } = useUI();
  const { data: leads, error, loading, reload } = useLoad(() => api.leads.list());
  const [filter, setFilter] = useState('tous');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recents');
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [err, setErr] = useState('');

  const counts = useMemo(() => {
    const c = { tous: leads?.length || 0 };
    for (const l of leads || []) c[l.statut] = (c[l.statut] || 0) + 1;
    return c;
  }, [leads]);
  const unseen = (leads || []).filter(l => !l.vu).length;
  const shown = useMemo(() => (leads || []).filter(l => filter === 'tous' || l.statut === filter)
    .filter(l => !q || [l.prenom, l.nom, l.telephone, l.email, l.ville, l.campagne, l.annonce].some(v => String(v || '').toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => {
      if (sort === 'nom') return fullName(a).localeCompare(fullName(b), 'fr');
      const d = (parseDb(b.recu_at) || 0) - (parseDb(a.recu_at) || 0);
      return sort === 'anciens' ? -d : d;
    }), [leads, filter, q, sort]);

  const run = async (fn, ok) => {
    setErr('');
    try { const r = await fn(); if (ok) showToast(ok); await reload(); notifyBadges(); return r; }
    catch (e) { setErr(e.message || 'Erreur'); return null; }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 16 }}>
        <p style={{ margin: 0, color: 'var(--fg-muted)' }}>Prospects des publicités Meta et des formulaires connectés.{unseen > 0 && <strong style={{ color: 'var(--accent)' }}> {unseen} non consulté(s).</strong>}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {unseen > 0 && <button style={btnGhost} onClick={() => run(() => api.leads.markSeen(), 'Tous marqués comme vus')}><Eye size={15} /> Tout marquer comme vu</button>}
          <button style={btnGhost} onClick={reload}><RefreshCw size={15} /> Actualiser</button>
          <button style={btnAccent} onClick={() => setDraft({ prenom: '', nom: '', telephone: '', email: '', ville: '', message: '' })}><Plus size={16} /> Ajouter</button>
        </div>
      </div>

      <div style={statGrid}>
        <Stat label="Nouveaux" value={counts.nouveau || 0} hue="#c17a3f" />
        <Stat label="À rappeler" value={counts.a_rappeler || 0} hue="#c8924a" />
        <Stat label="Intéressés / négociation" value={(counts.qualifie || 0) + (counts.negociation || 0)} hue="#5f9d5f" />
        <Stat label="Convertis" value={counts.converti || 0} hue="#5f9d5f" />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {FILTERS.map(k => (
          <button key={k} onClick={() => setFilter(k)} style={{ ...btnGhost, height: 36, background: filter === k ? 'var(--accent)' : 'var(--surface)', color: filter === k ? 'var(--accent-fg)' : 'var(--fg)' }}>
            {k === 'tous' ? 'Tous' : LEAD_STATUTS[k].label} ({counts[k] || 0})
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input aria-label="Rechercher un prospect" placeholder="Nom, téléphone, ville, campagne…" value={q} onChange={e => setQ(e.target.value)} style={{ ...inputStyle, flex: '1 1 240px', width: 'auto' }} />
        <SortSelect value={sort} onChange={setSort} options={[{ value: 'recents', label: 'Plus récents' }, { value: 'anciens', label: 'Plus anciens' }, { value: 'nom', label: 'Nom A–Z' }]} />
      </div>
      <ErrorNote>{error || err}</ErrorNote>
      {loading && <Loading />}
      <div style={{ display: 'grid', gap: 12 }}>
        {shown.map(l => (
          <article key={l.id} style={{ ...cardStyle, padding: 16, borderLeft: !l.vu ? '4px solid var(--accent)' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'start' }}>
              <div style={{ minWidth: 0 }}>
                <button onClick={() => setOpenId(l.id)} style={{ all: 'unset', cursor: 'pointer', fontSize: 17, fontWeight: 800 }}>{fullName(l)}</button>
                {!l.vu && <Pill hue="#c17a3f" style={{ marginLeft: 8 }}>Nouveau</Pill>}
                <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 4 }}>{[l.ville, l.campagne, l.annonce].filter(Boolean).join(' · ') || 'Saisie manuelle'}</div>
                <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 2 }}>
                  Reçu {timeAgo(l.recu_at) || when(l.recu_at)} · dernier contact : {l.dernier_contact ? timeAgo(l.dernier_contact) : 'aucun'}
                  {l.en_charge && <strong style={{ color: '#a86b8c' }}> · {l.en_charge} s’en occupe</strong>}
                </div>
              </div>
              <Pill hue={LEAD_STATUTS[l.statut]?.hue}>{LEAD_STATUTS[l.statut]?.label || l.statut}</Pill>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <CallButton phone={l.telephone} />
              <button style={btnGhost} onClick={() => setOpenId(l.id)}>Détails et notes{l.nb_notes ? ` (${l.nb_notes})` : ''}</button>
              {l.statut === 'converti' && l.client_id
                ? <Link to={`/clients/${l.client_id}`} style={{ ...btnGhost, textDecoration: 'none' }}>Ouvrir la fiche client</Link>
                : <button style={btnGhost} onClick={() => run(() => api.leads.convert(l.id), 'Converti en client')}><UserPlus size={15} /> Convertir en client</button>}
            </div>
          </article>
        ))}
        {!loading && !shown.length && <Empty>Aucun prospect pour ce filtre.</Empty>}
      </div>

      {openId && <LeadModal id={openId} user={user} onClose={() => { setOpenId(null); reload(); notifyBadges(); }} />}
      {draft && (
        <Modal title="Ajouter un prospect" onClose={() => setDraft(null)} onSubmit={async e => { e.preventDefault(); await run(() => api.leads.create(draft), 'Prospect ajouté'); setDraft(null); }}
          footer={<><button type="button" style={btnGhost} onClick={() => setDraft(null)}>Annuler</button><button type="submit" style={btnAccent}>Ajouter</button></>}>
          {[['prenom', 'Prénom'], ['nom', 'Nom'], ['telephone', 'Téléphone'], ['email', 'Courriel'], ['ville', 'Ville']].map(([k, label]) => (
            <Field key={k} label={label}><input style={inputStyle} value={draft[k]} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} /></Field>))}
          <Field label="Message"><textarea style={textareaStyle} rows={3} value={draft.message} onChange={e => setDraft(d => ({ ...d, message: e.target.value }))} /></Field>
        </Modal>
      )}
    </div>
  );
}

// Fiche d'un lead : ouvrir = marquer comme vu (volontairement), notes, résultat d'appel, prise en charge
function LeadModal({ id, user, onClose }) {
  const { showToast } = useUI();
  const { data: lead, error, reload } = useLoad(() => api.leads.get(id), [id]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [rappel, setRappel] = useState('');
  const [raison, setRaison] = useState('');

  React.useEffect(() => { api.leads.update(id, { vu: true }).catch(() => {}); }, [id]);
  const run = async (fn, ok) => { setErr(''); try { const r = await fn(); if (ok) showToast(ok); await reload(); return r; } catch (e) { setErr(e.message); return null; } };
  if (!lead) return <Modal title="Prospect" onClose={onClose}>{error ? <ErrorNote>{error}</ErrorNote> : <Loading />}</Modal>;
  const mine = lead.en_charge === user;
  const verrou = lead.verrou;

  return (
    <Modal title={[lead.prenom, lead.nom].filter(Boolean).join(' ') || 'Prospect'} onClose={onClose} width={620}>
      <ErrorNote>{err}</ErrorNote>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Pill hue={LEAD_STATUTS[lead.statut]?.hue}>{LEAD_STATUTS[lead.statut]?.label}</Pill>
        {lead.en_charge && <Pill hue="#a86b8c">{lead.en_charge} s’en occupe</Pill>}
        {lead.rappel_at && <Pill hue="#c8924a">Rappel : {when(lead.rappel_at)}</Pill>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, fontSize: 13.5 }}>
        <div><b>Téléphone</b><br />{lead.telephone || '—'}</div>
        <div><b>Courriel</b><br />{lead.email || '—'}</div>
        <div><b>Adresse</b><br />{[lead.adresse, lead.ville, lead.code_postal].filter(Boolean).join(', ') || '—'}</div>
        <div><b>Dernier contact</b><br />{lead.dernier_contact ? when(lead.dernier_contact) : 'Aucun'}</div>
      </div>
      <div style={{ ...cardStyle, padding: 12, fontSize: 13 }}>
        <b>Provenance de la publicité</b>
        <div style={{ color: 'var(--fg-muted)', marginTop: 4, lineHeight: 1.6 }}>
          Plateforme : {lead.plateforme || '—'} · Campagne : {lead.campagne || '—'}<br />
          Ensemble : {lead.ensemble || '—'} · Annonce : {lead.annonce || '—'}<br />
          Formulaire : {lead.form_name || lead.formulaire || '—'} · Reçu le {when(lead.recu_at)} ({lead.source})
        </div>
      </div>
      {lead.message && <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, background: 'var(--surface-2)', padding: 12, borderRadius: 10 }}>{lead.message}</div>}

      {verrou
        ? <div role="status" style={{ ...cardStyle, padding: 12, color: '#a86b8c', fontWeight: 700 }}>{verrou} s’en occupe en ce moment : attends avant de rappeler.</div>
        : <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <CallButton phone={lead.telephone} label="Appeler" />
            {!mine
              ? <button style={btnGhost} onClick={() => run(() => api.leads.take(id), 'Tu t’en occupes')}><Hand size={15} /> Je m’en occupe</button>
              : <button style={btnGhost} onClick={() => run(() => api.leads.release(id), 'Libéré')}>Libérer</button>}
          </div>}

      <Field label="Résultat de l’appel">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btnGhost} onClick={() => run(() => api.leads.contact(id, { resultat: 'joint', note }).then(() => setNote('')), 'Noté : client joint')}><PhoneCall size={15} /> Client joint</button>
          <button style={btnGhost} onClick={async () => { const r = await run(() => api.leads.contact(id, { resultat: 'sans_reponse', note }), 'Prochaine tentative programmée'); setNote(''); if (r?.suggest === 'perdu') showToast('4 tentatives sans réponse : tu peux le classer « Perdu »'); }}><PhoneOff size={15} /> Pas de réponse</button>
        </div>
      </Field>
      <Field label="Ou programmer un rappel">
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="datetime-local" style={inputStyle} value={rappel} onChange={e => setRappel(e.target.value)} />
          <button style={btnGhost} disabled={!rappel} onClick={() => run(() => api.leads.contact(id, { resultat: 'rappeler', rappel_at: new Date(rappel).toISOString().replace('T', ' ').slice(0, 19), note }), 'Rappel programmé')}><CalendarClock size={15} /> Programmer</button>
        </div>
      </Field>
      <Field label="Statut">
        <select style={inputStyle} value={lead.statut} onChange={e => run(() => api.leads.update(id, { statut: e.target.value }), 'Statut mis à jour')}>
          {Object.entries(LEAD_STATUTS).filter(([k]) => k !== 'converti').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </Field>
      {['perdu', 'non_admissible'].includes(lead.statut) && (
        <Field label="Raison"><input style={inputStyle} defaultValue={lead.raison_perte || ''} onChange={e => setRaison(e.target.value)} onBlur={() => raison && run(() => api.leads.update(id, { raison_perte: raison }))} placeholder="Ex. hors secteur, a déjà un entrepreneur" /></Field>
      )}

      <Field label="Notes">
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea style={{ ...textareaStyle, flex: 1 }} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Ce qui a été dit, prochaine étape…" />
          <button style={btnAccent} disabled={!note.trim()} onClick={() => run(() => api.leads.addNote(id, note).then(() => setNote('')), 'Note ajoutée')}>Ajouter</button>
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {lead.notes.map(n => (
            <div key={n.id} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '9px 12px', fontSize: 13 }}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{n.contenu}</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>{n.auteur || '—'} · {when(n.created_at)}</span>
                <button onClick={() => run(() => api.leads.deleteNote(id, n.id))} aria-label="Supprimer la note" style={{ border: 0, background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer' }}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      </Field>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {lead.client_id
          ? <Link to={`/clients/${lead.client_id}`} style={{ ...btnAccent, textDecoration: 'none' }}>Ouvrir la fiche client{lead.client ? ` — ${[lead.client.prenom, lead.client.nom].filter(Boolean).join(' ')}` : ''}</Link>
          : <button style={btnAccent} onClick={() => run(() => api.leads.convert(id), 'Converti en client')}><UserPlus size={15} /> Convertir en client</button>}
        <button style={btnDanger} onClick={async () => { if (window.confirm('Supprimer ce prospect du CRM?')) { await api.leads.remove(id); onClose(); } }}><Trash2 size={15} /> Supprimer</button>
      </div>
    </Modal>
  );
}
