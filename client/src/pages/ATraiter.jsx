import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Check, AlertCircle, ArrowRight, CalendarClock, Trash2 } from 'lucide-react';
import { api } from '../api';
import { cardStyle, btnGhost, btnDanger, btnAccent, Field, Modal, inputStyle } from '../components/ui';
import { useLoad, ErrorNote, CallButton, Empty, Loading, Pill, dollars, notifyBadges } from '../components/bits';
import { fmtDay, parseDb, timeAgo } from '../lib/dates';

import { followLabel, quoteLink } from '../lib/quoteFollow';

const name = x => [x.prenom, x.nom].filter(Boolean).join(' ') || 'Sans nom';

function Group({ title, hue, items, children }) {
  if (!items?.length) return null;
  return (
    <section style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        {title} <Pill hue={hue}>{items.length}</Pill>
      </h2>
      <div style={{ display: 'grid', gap: 10 }}>{items.map(children)}</div>
    </section>
  );
}
const Row = ({ children }) => <div style={{ ...cardStyle, padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>{children}</div>;
const Main = ({ children }) => <div style={{ flex: '1 1 220px', minWidth: 0 }}>{children}</div>;
const Sub = ({ children }) => <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 2 }}>{children}</div>;

export default function ATraiter() {
  const { data: actions, error, loading, reload } = useLoad(() => api.attention(true));
  const [period, setPeriod] = useState('a_traiter');
  const [report, setReport] = useState(null);
  const today = actions?.today;
  const inPeriod = date => {
    const day = date || today;
    if (period === 'retard') return day < today;
    if (period === 'aujourdhui') return day === today;
    if (period === 'avenir') return day > today;
    return day <= today;
  };
  const data = actions && {
    leads_nouveaux: actions.leads_nouveaux.filter(() => inPeriod()),
    leads_a_rappeler: actions.leads_a_rappeler.filter(l => inPeriod(l.date_action)),
    taches: actions.taches.filter(t => inPeriod(t.due_date)),
    appels_a_rappeler: actions.appels_a_rappeler.filter(a => inPeriod(a.rappel_date)),
    soumissions_a_relancer: actions.soumissions_a_relancer.filter(q => inPeriod(q.echeance_suivi)),
    chantiers_a_planifier: actions.chantiers_a_planifier.filter(() => inPeriod()),
    factures_en_retard: actions.factures_en_retard.filter(i => inPeriod(i.date_echeance))
  };
  const total = data ? Object.values(data).reduce((sum, items) => sum + items.length, 0) : 0;
  const [view, setView] = useState('tous');
  const [actionError, setActionError] = useState('');
  const groups = [
    { key: 'leads', label: 'Prospects', count: (data?.leads_nouveaux?.length || 0) + (data?.leads_a_rappeler?.length || 0) },
    { key: 'soumissions', label: 'Soumissions', count: data?.soumissions_a_relancer?.length || 0 },
    { key: 'taches', label: 'Tâches et appels', count: (data?.taches?.length || 0) + (data?.appels_a_rappeler?.length || 0) },
    { key: 'operations', label: 'Chantiers et factures', count: (data?.chantiers_a_planifier?.length || 0) + (data?.factures_en_retard?.length || 0) }
  ];
  const visible = group => view === 'tous' || view === group;
  const done = async id => { try { setActionError(''); await api.taches.update(id, { completed: true }); notifyBadges(); await reload(); } catch (e) { setActionError(e.message || 'Impossible de terminer la tâche'); } };
  const act = async (fn) => { try { setActionError(''); await fn(); notifyBadges(); await reload(); return true; } catch (e) { setActionError(e.message || 'Action impossible'); } };
  const doneBtn = (fn, title = 'Retirer de la liste') => <button type="button" style={btnGhost} title={title} onClick={() => act(fn)}><Check size={15} /> Fait</button>;
  const delBtn = (fn, msg) => <button type="button" style={{ ...btnDanger, height: 40 }} aria-label="Supprimer" onClick={() => { if (window.confirm(msg)) act(fn); }}><Trash2 size={15} /> Supprimer</button>;
  const refresh = async () => { try { setActionError(''); await api.relances.run(); await reload(); notifyBadges(); } catch (e) { setActionError(e.message || 'Actualisation impossible'); } };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: 'var(--fg-muted)' }}>{data ? (total ? `${total} action${total === 1 ? '' : 's'} dans cette vue.` : 'Aucune action dans cette vue.') : ''}</p>
        <button style={btnGhost} onClick={refresh}><RefreshCw size={15} /> Actualiser</button>
      </div>
      {data && <section style={{ ...cardStyle, padding: 18, marginBottom: 18, borderLeft: '4px solid var(--accent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--accent)' }}><CalendarClock size={22} /></div>
          <div style={{ flex: 1, minWidth: 190 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Actions à traiter</div>
            <div style={{ color: 'var(--fg-muted)', fontSize: 12.5, marginTop: 3 }}>Traite les demandes, fais tes relances, puis planifie les chantiers.</div>
          </div>
          <Link to="/opportunites" style={{ ...btnGhost, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>Voir les prospects <ArrowRight size={14}/></Link>
        </div>
        <div style={{ display: 'flex', gap: 7, marginTop: 16, flexWrap: 'wrap' }} role="group" aria-label="Filtrer par échéance">
          {[['a_traiter', 'À traiter'], ['retard', 'En retard'], ['aujourdhui', 'Aujourd’hui'], ['avenir', 'À venir']].map(([key, label]) =>
            <button key={key} type="button" style={period === key ? btnAccent : btnGhost} aria-pressed={period === key} onClick={() => setPeriod(key)}>{label}</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 7, marginTop: 10, flexWrap: 'wrap' }} role="group" aria-label="Filtrer les actions">
          {[{ key: 'tous', label: 'Tout', count: total }, ...groups].map(g => (
            <button key={g.key} type="button" aria-pressed={view === g.key} onClick={() => setView(g.key)}
              style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '8px 11px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: view === g.key ? 'var(--accent)' : 'var(--surface-2)', color: view === g.key ? 'var(--accent-fg)' : 'var(--fg)' }}>
              {g.label} <span style={{ opacity: .7 }}>({g.count})</span>
            </button>
          ))}
        </div>
      </section>}
      <ErrorNote>{error || actionError}</ErrorNote>
      {loading && <Loading />}
      {data && (view === 'tous' ? !total : !groups.find(g => g.key === view)?.count) && <Empty>Aucune action pour ces filtres.</Empty>}
      {data && <>
        {visible('leads') && <Group title="Nouveaux leads à rappeler" hue="#c17a3f" items={data.leads_nouveaux}>
          {l => <Row key={l.id}><Main><strong>{name(l)}</strong><Sub>{[l.ville, l.campagne].filter(Boolean).join(' · ')} · reçu {timeAgo(l.recu_at) || ''}{l.en_charge ? ` · ${l.en_charge} s’en occupe` : ''}</Sub></Main>
            <CallButton phone={l.telephone} /><Link to="/opportunites" style={{ ...btnGhost, textDecoration: 'none' }}>Ouvrir</Link>{doneBtn(() => api.masquerAttention('lead', l.id))}{delBtn(() => api.leads.remove(l.id), 'Supprimer ce prospect du CRM? Il ne reviendra pas de Facebook.')}</Row>}
        </Group>}
        {visible('leads') && <Group title="Leads à rappeler" hue="#c8924a" items={data.leads_a_rappeler}>
          {l => <Row key={l.id}><Main><strong>{name(l)}</strong><Sub>Tentative {(l.tentatives || 0) + 1}{l.rappel_at ? ` · prévu ${parseDb(l.rappel_at)?.toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</Sub></Main>
            <CallButton phone={l.telephone} /><Link to="/opportunites" style={{ ...btnGhost, textDecoration: 'none' }}>Ouvrir</Link>{doneBtn(() => api.masquerAttention('lead_rappel', l.id))}{delBtn(() => api.leads.remove(l.id), 'Supprimer ce prospect du CRM? Il ne reviendra pas de Facebook.')}</Row>}
        </Group>}
        {visible('soumissions') && <Group title="Soumissions à relancer" hue="#6b8cae" items={data.soumissions_a_relancer}>
          {q => <Row key={q.id}><Main><strong>{name(q)}</strong><Sub>{q.reference} · {dollars(q.montant)} · {followLabel(q, today)}</Sub></Main>
            <CallButton phone={q.telephone} label="Appeler" />
            <Link to={quoteLink(q)} style={{ ...btnGhost, textDecoration: 'none' }}>Ouvrir la soumission</Link>
            <button type="button" style={btnGhost} onClick={() => setReport({ ...q, date: '' })}>Reporter</button>
            <button type="button" style={btnGhost} onClick={() => act(() => api.suiviSoumissions.followUp(q.id, { cloturer: true }))}>Clore le suivi</button>
          </Row>}
        </Group>}
        {visible('taches') && <Group title="Tâches et rappels" hue="#9aa0a6" items={data.taches}>
          {t => <Row key={t.id}><Main><strong>{t.titre}</strong><Sub>{t.prenom || t.nom ? `${name(t)} · ` : ''}échéance {fmtDay(t.due_date)}</Sub></Main>
            {t.client_id && <Link to={`/clients/${t.client_id}`} style={{ ...btnGhost, textDecoration: 'none' }}>Fiche</Link>}
            <button style={btnGhost} onClick={() => done(t.id)}><Check size={15} /> Fait</button>{delBtn(() => api.taches.delete(t.id), 'Supprimer cette tâche?')}</Row>}
        </Group>}
        {visible('taches') && <Group title="Appels à rappeler" hue="#5f9d5f" items={data.appels_a_rappeler}>
          {a => <Row key={a.id}><Main><strong>{name(a)}</strong><Sub>{a.sujet || 'Rappel demandé'}{a.rappel_date ? ` · ${fmtDay(a.rappel_date)}` : ''}</Sub></Main>
            <CallButton phone={a.telephone} /><Link to={`/clients/${a.client_id}`} style={{ ...btnGhost, textDecoration: 'none' }}>Fiche</Link>{doneBtn(() => api.appels.update(a.id, { rappel_fait: 1 }), 'Marquer le rappel comme fait')}</Row>}
        </Group>}
        {visible('operations') && <Group title="Chantiers à planifier" hue="#b27a3e" items={data.chantiers_a_planifier}>
          {c => <Row key={c.id}><Main><strong>{name(c)}</strong><Sub>{c.titre}</Sub></Main><Link to="/chantiers" style={{ ...btnGhost, textDecoration: 'none' }}>Planifier</Link>{doneBtn(() => api.masquerAttention('chantier', c.id), 'Retirer de la liste (le chantier reste intact)')}</Row>}
        </Group>}
        {visible('operations') && <Group title="Factures en retard" hue="#c4584f" items={data.factures_en_retard}>
          {i => <Row key={i.id}><Main><strong>{name(i)}</strong><Sub>{i.reference} · {dollars(i.montant)} · échéance {fmtDay(i.date_echeance)}</Sub></Main><Link to="/facturation" style={{ ...btnGhost, textDecoration: 'none' }}>Facturation</Link>{doneBtn(() => api.masquerAttention('facture', i.id), 'Retirer de la liste (la facture reste intacte)')}</Row>}
        </Group>}
      </>}
      {report && <Modal title={`Reporter ${report.reference}`} onClose={() => setReport(null)}
        onSubmit={async e => {
          e.preventDefault();
          if (await act(() => api.suiviSoumissions.followUp(report.id, { prochain_suivi: report.date }))) setReport(null);
        }}
        footer={<><button type="button" style={btnGhost} onClick={() => setReport(null)}>Annuler</button><button type="submit" style={btnAccent}>Enregistrer</button></>}>
        <ErrorNote>{actionError}</ErrorNote>
        <Field label="Nouvelle date de suivi">
          <input type="date" required min={today} value={report.date} style={inputStyle} onChange={e => setReport({ ...report, date: e.target.value })} />
        </Field>
      </Modal>}
    </div>
  );
}
