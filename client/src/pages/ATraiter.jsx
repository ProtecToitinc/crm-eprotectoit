import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Check, AlertCircle, ArrowRight, CalendarClock } from 'lucide-react';
import { api } from '../api';
import { cardStyle, btnGhost } from '../components/ui';
import { useLoad, ErrorNote, CallButton, Empty, Loading, Pill, dollars, notifyBadges } from '../components/bits';
import { fmtDay, parseDb, timeAgo } from '../lib/dates';

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
  const { data, error, loading, reload } = useLoad(() => api.attention());
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
  const refresh = async () => { try { setActionError(''); await api.relances.run(); await reload(); notifyBadges(); } catch (e) { setActionError(e.message || 'Actualisation impossible'); } };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: 'var(--fg-muted)' }}>{data ? (data.total ? `${data.total} élément(s) demandent ton attention.` : 'Rien d’urgent. Beau travail!') : ''}</p>
        <button style={btnGhost} onClick={refresh}><RefreshCw size={15} /> Actualiser</button>
      </div>
      {data && <section style={{ ...cardStyle, padding: 18, marginBottom: 18, borderLeft: '4px solid var(--accent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--accent)' }}><CalendarClock size={22} /></div>
          <div style={{ flex: 1, minWidth: 190 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{data.total ? `${data.total} actions à gérer` : 'Tout est à jour'}</div>
            <div style={{ color: 'var(--fg-muted)', fontSize: 12.5, marginTop: 3 }}>Traite les demandes, fais tes relances, puis planifie les chantiers.</div>
          </div>
          <Link to="/opportunites" style={{ ...btnGhost, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>Voir les prospects <ArrowRight size={14}/></Link>
        </div>
        <div style={{ display: 'flex', gap: 7, marginTop: 16, flexWrap: 'wrap' }} role="group" aria-label="Filtrer les actions">
          {[{ key: 'tous', label: 'Tout', count: data.total }, ...groups].map(g => (
            <button key={g.key} type="button" aria-pressed={view === g.key} onClick={() => setView(g.key)}
              style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '8px 11px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: view === g.key ? 'var(--accent)' : 'var(--surface-2)', color: view === g.key ? 'var(--accent-fg)' : 'var(--fg)' }}>
              {g.label} <span style={{ opacity: .7 }}>({g.count})</span>
            </button>
          ))}
        </div>
      </section>}
      <ErrorNote>{error || actionError}</ErrorNote>
      {loading && <Loading />}
      {data && data.total === 0 && <Empty>Aucun lead à rappeler, aucune relance en retard.</Empty>}
      {data && <>
        {visible('leads') && <Group title="Nouveaux leads à rappeler" hue="#c17a3f" items={data.leads_nouveaux}>
          {l => <Row key={l.id}><Main><strong>{name(l)}</strong><Sub>{[l.ville, l.campagne].filter(Boolean).join(' · ')} · reçu {timeAgo(l.recu_at) || ''}{l.en_charge ? ` · ${l.en_charge} s’en occupe` : ''}</Sub></Main>
            <CallButton phone={l.telephone} /><Link to="/opportunites" style={{ ...btnGhost, textDecoration: 'none' }}>Ouvrir</Link></Row>}
        </Group>}
        {visible('leads') && <Group title="Leads à rappeler" hue="#c8924a" items={data.leads_a_rappeler}>
          {l => <Row key={l.id}><Main><strong>{name(l)}</strong><Sub>Tentative {(l.tentatives || 0) + 1}{l.rappel_at ? ` · prévu ${parseDb(l.rappel_at)?.toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</Sub></Main>
            <CallButton phone={l.telephone} /><Link to="/opportunites" style={{ ...btnGhost, textDecoration: 'none' }}>Ouvrir</Link></Row>}
        </Group>}
        {visible('soumissions') && <Group title="Soumissions à relancer" hue="#6b8cae" items={data.soumissions_a_relancer}>
          {q => <Row key={q.id}><Main><strong>{name(q)}</strong><Sub>{q.reference} · {dollars(q.montant)}{q.prochain_suivi ? ` · suivi prévu ${fmtDay(q.prochain_suivi)}` : ''}</Sub></Main>
            <Link to={`/clients/${q.client_id}`} style={{ ...btnGhost, textDecoration: 'none' }}>Fiche client</Link><Link to="/suivi-soumissions" style={{ ...btnGhost, textDecoration: 'none' }}>Suivi</Link></Row>}
        </Group>}
        {visible('taches') && <Group title="Tâches et rappels du jour" hue="#9aa0a6" items={data.taches}>
          {t => <Row key={t.id}><Main><strong>{t.titre}</strong><Sub>{t.prenom || t.nom ? `${name(t)} · ` : ''}échéance {fmtDay(t.due_date)}</Sub></Main>
            {t.client_id && <Link to={`/clients/${t.client_id}`} style={{ ...btnGhost, textDecoration: 'none' }}>Fiche</Link>}
            <button style={btnGhost} onClick={() => done(t.id)}><Check size={15} /> Fait</button></Row>}
        </Group>}
        {visible('taches') && <Group title="Appels à rappeler" hue="#5f9d5f" items={data.appels_a_rappeler}>
          {a => <Row key={a.id}><Main><strong>{name(a)}</strong><Sub>{a.sujet || 'Rappel demandé'}{a.rappel_date ? ` · ${fmtDay(a.rappel_date)}` : ''}</Sub></Main>
            <CallButton phone={a.telephone} /><Link to={`/clients/${a.client_id}`} style={{ ...btnGhost, textDecoration: 'none' }}>Fiche</Link></Row>}
        </Group>}
        {visible('operations') && <Group title="Chantiers à planifier" hue="#b27a3e" items={data.chantiers_a_planifier}>
          {c => <Row key={c.id}><Main><strong>{name(c)}</strong><Sub>{c.titre}</Sub></Main><Link to="/chantiers" style={{ ...btnGhost, textDecoration: 'none' }}>Planifier</Link></Row>}
        </Group>}
        {visible('operations') && <Group title="Factures en retard" hue="#c4584f" items={data.factures_en_retard}>
          {i => <Row key={i.id}><Main><strong>{name(i)}</strong><Sub>{i.reference} · {dollars(i.montant)} · échéance {fmtDay(i.date_echeance)}</Sub></Main><Link to="/facturation" style={{ ...btnGhost, textDecoration: 'none' }}>Facturation</Link></Row>}
        </Group>}
      </>}
    </div>
  );
}
