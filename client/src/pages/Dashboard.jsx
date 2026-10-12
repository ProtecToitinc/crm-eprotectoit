import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../context/UIContext';
import { STAGES, SERVICE_HUE, money, soft } from '../constants';
import { api } from '../api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const { refreshKey, openDeal } = useUI();
  const navigate = useNavigate();

  useEffect(() => {
    api.stats().then(setStats);
  }, [refreshKey]);

  if (!stats) return <div style={{ color: 'var(--fg-muted)', fontSize: 13.5 }}>Chargement...</div>;

  const maxCount = Math.max(1, ...STAGES.map(st => stats.parEtape.find(p => p.etape === st.key)?.count || 0));
  const columns = STAGES.map(st => {
    const row = stats.parEtape.find(p => p.etape === st.key);
    const count = row?.count || 0;
    return { ...st, count, total: money(row?.valeur || 0), barPct: Math.round((count / maxCount) * 100) + '%' };
  });

  const maxService = Math.max(1, ...stats.servicesRows.map(s => s.total));
  const services = stats.servicesRows.map(s => ({
    name: s.service, value: money(s.total), pct: Math.round((s.total / maxService) * 100) + '%', hue: SERVICE_HUE[s.service] || '#9aa0a6'
  }));

  const kpis = [
    { label: 'Revenus du mois', value: money(stats.revenuMois), delta: fmtDelta(stats.revenuMoisDelta), deltaColor: stats.revenuMoisDelta >= 0 ? '#5f9d5f' : '#c4584f', sub: 'vs mois dernier' },
    { label: 'Soumissions actives', value: String(stats.quotesActives), delta: `+${stats.quotesActivesSemaine}`, deltaColor: '#5f9d5f', sub: 'cette semaine' },
    { label: 'Projets en cours', value: String(stats.projetsEnCours), delta: `${stats.evenementsProjetsAvenir} à venir`, deltaColor: 'var(--accent)', sub: 'sur le terrain' },
    { label: 'Taux de conversion', value: `${stats.tauxConversion} %`, delta: '90 jours', deltaColor: '#5f9d5f', sub: 'lead → complété' }
  ];

  return (
    <div className="fadein">
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {kpis.map((k, i) => (
          <div key={i} className="kard" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.02em', marginTop: 9 }}>{k.value}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, fontSize: 12, fontWeight: 700, color: k.deltaColor }}>
              {k.delta}<span style={{ color: 'var(--fg-faint)', fontWeight: 500 }}>· {k.sub}</span>
            </div>
          </div>
        ))}
      </div>

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
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{a.prenom} {a.nom} — {a.description}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 2 }}>{timeAgo(a.created_at)}</div>
                  </div>
                </div>
              ))}
            </Card>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <Card title="Prochains rendez-vous" link="Agenda →" onLink={() => navigate('/calendrier')}>
              {stats.upcoming.length === 0 && <Empty text="Aucun rendez-vous à venir" />}
              {stats.upcoming.map(u => {
                const d = new Date(u.date_debut);
                return (
                  <div key={u.id} className="row-hover" onClick={() => u.client_id && openDeal(u.client_id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '10px 8px', borderRadius: 10, cursor: u.client_id ? 'pointer' : 'default' }}>
                    <div style={{ width: 46, flexShrink: 0, textAlign: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '5px 0' }}>
                      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.08em', color: 'var(--accent)' }}>{d.toLocaleDateString('fr-CA', { month: 'short' }).toUpperCase()}</div>
                      <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.05 }}>{d.getDate()}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{u.nom ? `${u.prenom} ${u.nom}` : u.titre}</div>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div>
        {link && <button className="linkbtn" onClick={onLink} style={{ border: 'none', background: 'transparent', color: 'var(--fg-muted)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{link}</button>}
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
  const map = { creation: '#9aa0a6', modification: '#9aa0a6', opportunite: '#6b8cae', etape: '#c17a3f', soumission: '#6b8cae', facture: '#5f9d5f', document: '#a86b8c', evenement: '#c17a3f' };
  return map[type] || '#9aa0a6';
}

function timeAgo(dateStr) {
  const d = new Date(dateStr + (dateStr.includes('Z') ? '' : 'Z'));
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'À l’instant';
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hier';
  return `Il y a ${days} jours`;
}
