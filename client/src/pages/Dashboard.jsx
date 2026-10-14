import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Check, ArrowUpRight, BellRing, Target, FileText, HardHat } from 'lucide-react';
import { useUI } from '../context/UIContext';
import { STAGES, SERVICE_HUE, money } from '../constants';
import { api } from '../api';
import Performance from '../components/Performance';
import Meteo from '../components/Meteo';
import { parseDay, daysFromToday, relativeDay, timeAgo } from '../lib/dates';
import { telHref, fullName } from '../lib/search';
import { iconBtn } from '../components/ui';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const { refreshKey, openDeal, bumpRefresh, showToast } = useUI();
  const navigate = useNavigate();

  useEffect(() => {
    let off = false;
    api.stats()
      .then(s => { if (!off) { setStats(s); setError(''); } })
      .catch(e => { if (!off) setError(e.message || 'Impossible de charger le tableau de bord'); });
    return () => { off = true; };
  }, [refreshKey]);

  async function rappelFait(a) {
    try {
      await api.appels.update(a.id, { rappel_fait: 1 });
      bumpRefresh();
      showToast('Rappel marqué comme fait');
    } catch (e) {
      showToast(e.message || 'Une erreur est survenue');
    }
  }

  if (!stats) {
    return error
      ? <div role="alert" style={{ color: '#c4584f', fontSize: 13.5, fontWeight: 600 }}>{error}</div>
      : <div style={{ color: 'var(--fg-muted)', fontSize: 13.5 }}>Chargement…</div>;
  }

  const parEtape = stats.parEtape || [];
  const maxCount = Math.max(1, ...STAGES.map(st => parEtape.find(p => p.etape === st.key)?.count || 0));
  const columns = STAGES.map(st => {
    const row = parEtape.find(p => p.etape === st.key);
    const count = row?.count || 0;
    return { ...st, count, total: money(row?.valeur || 0), barPct: Math.round((count / maxCount) * 100) + '%' };
  });

  const maxService = Math.max(1, ...stats.servicesRows.map(s => s.total));
  const services = stats.servicesRows.map(s => ({
    name: s.service, value: money(s.total), pct: Math.round((s.total / maxService) * 100) + '%', hue: SERVICE_HUE[s.service] || '#9aa0a6'
  }));

  const rappels = stats.appelsARappeler || [];
  const nbRappels = stats.nbRappels || 0;

  const kpis = [
    { label: 'Revenus du mois', value: money(stats.revenuMois), delta: fmtDelta(stats.revenuMoisDelta), deltaColor: stats.revenuMoisDelta >= 0 ? '#5f9d5f' : '#c4584f', sub: 'vs mois dernier' },
    { label: 'Soumissions actives', value: String(stats.quotesActives), delta: `+${stats.quotesActivesSemaine}`, deltaColor: '#5f9d5f', sub: 'cette semaine' },
    { label: 'Projets en cours', value: String(stats.projetsEnCours), delta: `${stats.evenementsProjetsAvenir} à venir`, deltaColor: 'var(--accent)', sub: 'sur le terrain' },
    { label: 'Taux de conversion', value: `${stats.tauxConversion} %`, delta: '90 jours', deltaColor: '#5f9d5f', sub: 'lead → complété' },
    { label: 'Appels (7 jours)', value: String(stats.appelsSemaine || 0), delta: `${nbRappels} à rappeler`, deltaColor: nbRappels > 0 ? '#c8924a' : '#5f9d5f', sub: 'en attente' }
  ];

  return (
    <div className="fadein">
      <Meteo />
      <section style={{ marginBottom: 20, padding: '20px 22px', borderRadius: 16, border: '1px solid var(--border)', background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: '.11em', textTransform: 'uppercase' }}>Centre de travail</div>
            <h2 style={{ margin: '5px 0 3px', fontSize: 21, fontWeight: 800, letterSpacing: '-.025em' }}>Chaque client, à la bonne étape.</h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>Commence par les demandes urgentes, puis avance les soumissions et les chantiers.</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          {[
            { label: 'À faire aujourd’hui', detail: 'Rappels et priorités', icon: BellRing, to: '/a-traiter' },
            { label: 'Prospects', detail: 'Répondre aux demandes', icon: Target, to: '/opportunites' },
            { label: 'Soumissions', detail: 'Préparer et envoyer', icon: FileText, to: '/soumissions' },
            { label: 'Chantiers', detail: 'Planifier les travaux', icon: HardHat, to: '/chantiers' }
          ].map(({ label, detail, icon: Icon, to }) => (
            <button key={to} onClick={() => navigate(to)} style={{ textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center', padding: '13px 12px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-2)', color: 'var(--fg)', fontFamily: 'inherit', cursor: 'pointer' }}>
              <span style={{ display: 'grid', placeItems: 'center', flexShrink: 0, width: 36, height: 36, borderRadius: 9, background: 'var(--surface)', color: 'var(--accent)' }}><Icon size={19} /></span>
              <span style={{ flex: 1, minWidth: 0 }}><strong style={{ display: 'block', fontSize: 12.8 }}>{label}</strong><span style={{ display: 'block', fontSize: 11, marginTop: 3, color: 'var(--fg-muted)' }}>{detail}</span></span>
              <ArrowUpRight size={15} style={{ flexShrink: 0, color: 'var(--fg-muted)' }} />
            </button>
          ))}
        </div>
      </section>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {kpis.map((k, i) => (
          <div key={i} className="kard" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.02em', marginTop: 9 }}>{k.value}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, fontSize: 12, fontWeight: 700, color: k.deltaColor, flexWrap: 'wrap' }}>
              {k.delta}<span style={{ color: 'var(--fg-faint)', fontWeight: 500 }}>· {k.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <Performance />

      <div className="dash-grid" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card title="Aperçu du pipeline" link="Voir tout →" onLink={() => navigate('/pipeline')}>
            {columns.map(c => (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{ width: 92, flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--fg-muted)' }}>{c.short}</div>
                <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: c.barPct, background: c.hue, borderRadius: 6 }} />
                </div>
                <div style={{ width: 34, textAlign: 'right', fontSize: 13.5, fontWeight: 800 }}>{c.count}</div>
                <div style={{ width: 84, textAlign: 'right', fontSize: 12.5, color: 'var(--fg-muted)', fontWeight: 600 }}>{c.total}</div>
              </div>
            ))}
          </Card>

          <Card title="Activité récente">
            {stats.historiqueActivite.length === 0 && <Empty text="Aucune activité récente" />}
            {stats.historiqueActivite.map(a => (
              <div key={a.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: dotForType(a.type), marginTop: 5, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, wordBreak: 'break-word' }}>{fullName(a)} — {a.description}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 2 }}>{timeAgo(a.created_at)}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card title={nbRappels > 0 ? `Appels à rappeler (${nbRappels})` : 'Appels à rappeler'} link="Tous les appels →" onLink={() => navigate('/appels')}>
            {rappels.length === 0 && <Empty text="Aucun appel à rappeler" />}
            {rappels.map(a => {
              const late = a.rappel_date && daysFromToday(a.rappel_date) < 0;
              const when = !a.rappel_date ? 'Sans date' : late ? 'En retard' : relativeDay(a.rappel_date);
              const tel = telHref(a.telephone);
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className="row-hover" onClick={() => openDeal(a.client_id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer', borderRadius: 8, padding: '2px 6px', margin: '-2px -6px' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName(a)}</div>
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 700, color: late ? '#c4584f' : '#c8924a' }}>{when}{a.rappel_heure ? ` · ${a.rappel_heure}` : ''}</span>
                      {a.sujet ? ` · ${a.sujet}` : ''}
                    </div>
                  </div>
                  {tel && <a href={tel} className="iconbtn" aria-label={`Appeler ${fullName(a)}`} title={a.telephone} style={{ ...iconBtn, textDecoration: 'none' }}><Phone size={14} /></a>}
                  <button className="iconbtn" aria-label="Rappel fait" title="Rappel fait" onClick={() => rappelFait(a)} style={{ ...iconBtn, color: '#5f9d5f' }}><Check size={15} /></button>
                </div>
              );
            })}
            {nbRappels > rappels.length && (
              <div style={{ paddingTop: 10, fontSize: 12, color: 'var(--fg-faint)', textAlign: 'center' }}>+ {nbRappels - rappels.length} autre{nbRappels - rappels.length > 1 ? 's' : ''}</div>
            )}
          </Card>

          <Card title="Prochains rendez-vous" link="Agenda →" onLink={() => navigate('/calendrier')}>
            {stats.upcoming.length === 0 && <Empty text="Aucun rendez-vous à venir" />}
            {stats.upcoming.map(u => {
              const d = parseDay(u.date_debut);
              return (
                <div key={u.id} className="row-hover" onClick={() => u.client_id && openDeal(u.client_id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '10px 8px', borderRadius: 10, cursor: u.client_id ? 'pointer' : 'default' }}>
                  <div style={{ width: 46, flexShrink: 0, textAlign: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '5px 0' }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.08em', color: 'var(--accent)' }}>{d ? d.toLocaleDateString('fr-CA', { month: 'short' }).replace('.', '').toUpperCase() : ''}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.05 }}>{d ? d.getDate() : ''}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{fullName(u) || u.titre}</div>
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{u.titre}{u.ville ? ` · ${u.ville}` : ''}</div>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--fg-muted)' }}>{u.heure || ''}</div>
                </div>
              );
            })}
          </Card>

          <Card title="Répartition des services">
            {services.length === 0 && <Empty text="Aucune donnée de service" />}
            {services.map(s => (
              <div key={s.name} style={{ marginBottom: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700 }}>{s.name}</span>
                  <span style={{ color: 'var(--fg-muted)', fontWeight: 600 }}>{s.value}</span>
                </div>
                <div style={{ height: 7, background: 'var(--surface-2)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: s.pct, background: s.hue, borderRadius: 5 }} />
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, link, onLink, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: 'var(--shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div>
        {link && <button className="linkbtn" onClick={onLink} style={{ border: 'none', background: 'transparent', color: 'var(--fg-muted)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{link}</button>}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }) {
  return <p style={{ color: 'var(--fg-faint)', fontSize: 13, textAlign: 'center', padding: '20px 0', margin: 0 }}>{text}</p>;
}

function fmtDelta(pct) {
  if (pct === 0) return '0 %';
  return (pct > 0 ? '+' : '') + pct.toLocaleString('fr-CA') + ' %';
}

function dotForType(type) {
  const map = {
    creation: '#9aa0a6', modification: '#9aa0a6', opportunite: '#6b8cae', etape: '#c17a3f', soumission: '#6b8cae',
    facture: '#5f9d5f', document: '#a86b8c', evenement: '#c17a3f', appel: '#5f9d5f', note: '#c8924a'
  };
  return map[type] || '#9aa0a6';
}
