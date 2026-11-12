import React, { useState } from 'react';
import { Printer, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api';
import { money } from '../constants';
import { btnGhost, btnAccent } from '../components/ui';
import { useLoad, ErrorNote, Loading } from '../components/bits';
import { GrowBar, CountUp } from '../components/motion';

const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const shift = (mois, n) => { const [y, m] = mois.split('-').map(Number); return key(new Date(y, m - 1 + n, 1)); };
const title = mois => new Date(`${mois}-15T12:00:00`).toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' });
const delta = (a, b) => (b ? Math.round(((a - b) / b) * 100) : a ? 100 : 0);

function Figure({ label, value, prev, isMoney }) {
  const d = delta(value, prev);
  return (
    <div className="glass" style={{ padding: '16px 18px' }}>
      <div className="eyebrow" style={{ color: 'var(--fg-muted)', fontSize: 10.5 }}>{label}</div>
      <div className="numeral" style={{ fontSize: 28, marginTop: 8 }}><CountUp value={isMoney ? money(value) : String(value)} /></div>
      <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: d > 0 ? '#5f9d5f' : d < 0 ? '#c4584f' : 'var(--fg-muted)' }}>
        {d > 0 ? '+' : ''}{d} % <span style={{ color: 'var(--fg-faint)', fontWeight: 500 }}>vs mois précédent ({isMoney ? money(prev) : prev})</span>
      </div>
    </div>
  );
}

// Rapport mensuel d'une page : chiffres du mois, comparaison, services, meilleures ventes — prêt à imprimer
export default function Rapport() {
  const [mois, setMois] = useState(() => key(new Date()));
  const { data, error, loading } = useLoad(() => api.rapport(mois), [mois]);
  const c = data?.courant, p = data?.precedent;
  const taux = c && c.prospects ? Math.round((c.prospects_convertis / c.prospects) * 100) : 0;
  const maxService = Math.max(1, ...(data?.services || []).map(s => s.v));
  return (
    <div className="rapport">
      <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button type="button" style={btnGhost} aria-label="Mois précédent" onClick={() => setMois(m => shift(m, -1))}><ChevronLeft size={16} /></button>
          <input type="month" aria-label="Mois du rapport" value={mois} max={key(new Date())} onChange={e => e.target.value && setMois(e.target.value)} style={{ height: 40, padding: '0 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', font: 'inherit', fontWeight: 700 }} />
          <button type="button" style={btnGhost} aria-label="Mois suivant" disabled={mois >= key(new Date())} onClick={() => setMois(m => shift(m, 1))}><ChevronRight size={16} /></button>
        </div>
        <button type="button" style={btnAccent} onClick={() => window.print()}><Printer size={15} /> Imprimer ou enregistrer en PDF</button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {loading && <Loading />}
      {c && (
        <>
          <header style={{ marginBottom: 18 }}>
            <div className="eyebrow">ProtecToit — rapport mensuel</div>
            <h2 style={{ margin: '6px 0 2px', fontSize: 30, fontWeight: 600, letterSpacing: '-.025em', textTransform: 'capitalize' }}>{title(mois)}</h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>Comparé à {title(data.precedent_mois)}. Montants des soumissions acceptées et des factures payées, taxes possiblement incluses.</p>
          </header>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', marginBottom: 16 }}>
            <Figure label="Ventes signées" value={c.vendu} prev={p.vendu} isMoney />
            <Figure label="Encaissé" value={c.encaisse} prev={p.encaisse} isMoney />
            <Figure label="Nombre de ventes" value={c.ventes} prev={p.ventes} />
            <Figure label="Prospects reçus" value={c.prospects} prev={p.prospects} />
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginBottom: 16 }}>
            <section className="glass" style={{ padding: 18 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Activité du mois</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <tbody>
                  {[['Prospects devenus clients', `${c.prospects_convertis} (${taux} %)`], ['Soumissions préparées', `${c.soumissions} · ${money(c.soumissions_valeur)}`], ['Soumissions perdues', c.soumissions_perdues], ['Chantiers terminés', c.chantiers_termines], ['Appels enregistrés', c.appels], ['Nouveaux clients', c.nouveaux_clients], ['Factures payées', c.factures_payees]].map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}><th scope="row" style={{ textAlign: 'left', fontWeight: 500, color: 'var(--fg-muted)', padding: '9px 0' }}>{k}</th><td style={{ textAlign: 'right', fontWeight: 700 }}>{v}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="glass" style={{ padding: 18 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Ventes par service</h3>
              {!data.services.length && <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>Aucune vente ce mois-ci.</p>}
              {data.services.map(s => (
                <div key={s.service} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, marginBottom: 5 }}><span style={{ fontWeight: 700 }}>{s.service}</span><span style={{ color: 'var(--fg-muted)' }}>{s.n} · {money(s.v)}</span></div>
                  <GrowBar pct={(s.v / maxService) * 100} height={7} />
                </div>
              ))}
              {data.raisons.length > 0 && <>
                <h3 style={{ margin: '18px 0 8px', fontSize: 15, fontWeight: 700 }}>Pourquoi on a perdu des soumissions</h3>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.7 }}>{data.raisons.map(r => <li key={r.raison}>{r.raison} ({r.n})</li>)}</ul>
              </>}
            </section>
          </div>
          <section className="glass" style={{ padding: 18 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Meilleures ventes du mois</h3>
            {!data.meilleures.length ? <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>Aucune vente ce mois-ci.</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--fg-muted)', fontSize: 11.5 }}><th scope="col" style={{ padding: '6px 0', fontWeight: 600 }}>Client</th><th scope="col" style={{ fontWeight: 600 }}>Service</th><th scope="col" style={{ fontWeight: 600 }}>Soumission</th><th scope="col" style={{ textAlign: 'right', fontWeight: 600 }}>Montant</th></tr></thead>
                <tbody>{data.meilleures.map(x => <tr key={x.reference} style={{ borderTop: '1px solid var(--border)' }}><td style={{ padding: '9px 0', fontWeight: 700 }}>{x.client}</td><td>{x.service || '—'}</td><td style={{ color: 'var(--fg-muted)' }}>{x.reference}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{money(x.montant)}</td></tr>)}</tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
