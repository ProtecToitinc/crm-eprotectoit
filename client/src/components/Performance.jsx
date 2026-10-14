import React, { useEffect, useState } from 'react';
import { api } from '../api';

const cash = value => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(value || 0);
const periods = [['semaine', 'Semaine'], ['mois', 'Mois'], ['annee', 'Année']];

export default function Performance() {
  const [period, setPeriod] = useState('mois');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError('');
    api.performance(period).then(d => { if (active) setData(d); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [period]);
  const points = data?.periode === period ? data.points : [];
  const max = Math.max(1, ...points.map(p => Math.max(p.vendu, p.encaisse)));
  const coords = values => values.map((p, i) => ({ x: 26 + (points.length === 1 ? 300 : i * 600 / (points.length - 1)), y: 172 - 146 * p / max }));
  const sold = coords(points.map(p => p.vendu));
  const paid = coords(points.map(p => p.encaisse));
  const linePath = coordinates => coordinates.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const total = data?.summary || {};
  return <section style={{ marginTop: 18, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow)' }}>
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
      <div>
        <div style={{ color: 'var(--accent)', fontWeight: 800, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase' }}>Performance commerciale</div>
        <h2 style={{ margin: '6px 0 3px', fontWeight: 800, fontSize: 20 }}>Ventes et chiffre d’affaires</h2>
        <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Soumissions acceptées et factures payées — pas le profit net.</div>
      </div>
      <div role="group" aria-label="Période du graphique" style={{ display: 'flex', flexWrap: 'wrap', gap: 5, borderRadius: 11, padding: 4, background: 'var(--surface-2)' }}>
        {periods.map(([key, label]) => <button key={key} onClick={() => setPeriod(key)} aria-pressed={period === key} style={{ padding: '9px 13px', border: '1px solid ' + (period === key ? 'var(--border)' : 'transparent'), background: period === key ? 'var(--surface)' : 'transparent', color: 'var(--fg)', borderRadius: 9, cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit' }}>{label}</button>)}
      </div>
    </div>
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      {periods.map(([key, label]) => <div key={key} style={{ padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-2)' }}>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', fontWeight: 700 }}>{label}</div>
        <div style={{ fontWeight: 800, fontSize: 22, marginTop: 7 }}>{total[key]?.ventes ?? '—'} <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>ventes</span></div>
        <div style={{ color: 'var(--fg)', marginTop: 7, fontSize: 15, fontWeight: 750 }}>{cash(total[key]?.vendu)}</div>
        <div style={{ color: 'var(--fg-muted)', marginTop: 4, fontSize: 11 }}>Vendu · encaissé {cash(total[key]?.encaisse)}</div>
      </div>)}
    </div>
    {error && <p role="alert" style={{ color: '#c4584f' }}>{error}</p>}
    <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 15, fontSize: 12, color: 'var(--fg-muted)', fontWeight: 600 }}>
      <span><span style={{ background: '#8b9bb1', display: 'inline-block', width: 11, height: 11, borderRadius: 3, marginRight: 6 }}/> Montant vendu</span>
      <span><span style={{ background: '#5f9d5f', display: 'inline-block', width: 11, height: 11, borderRadius: 3, marginRight: 6 }}/> Montant encaissé</span>
    </div>
    {!points.length ? <p style={{ padding: '20px 0', color: 'var(--fg-muted)', fontSize: 13 }}>Aucune vente ni facture payée sur cette période.</p> :
      <div style={{ marginTop: 16, border: '1px solid var(--border)', background: 'var(--surface-2)', borderRadius: 12, padding: '14px 12px 9px' }}>
        <svg role="img" aria-label={'Évolution des montants vendus et encaissés : ' + points.map(p => p.label + ', vendu ' + cash(p.vendu) + ', encaissé ' + cash(p.encaisse)).join('; ')} viewBox="0 0 650 198" preserveAspectRatio="none" style={{ width: '100%', height: 195, display: 'block', overflow: 'visible' }}>
          {[26, 75, 124, 172].map(y => <line key={y} x1="24" x2="628" y1={y} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 6" />)}
          {points.length > 1 && <path d={linePath(sold)} fill="none" stroke="#8b9bb1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          {points.length > 1 && <path d={linePath(paid)} fill="none" stroke="#579c81" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          {sold.map((p, i) => <circle key={'v' + i} cx={p.x} cy={p.y} r="3.8" stroke="var(--surface-2)" strokeWidth="1.5" fill="#8b9bb1"><title>{points[i].label} · {points[i].ventes} ventes · {cash(points[i].vendu)} vendus</title></circle>)}
          {paid.map((p, i) => <circle key={'e' + i} cx={p.x} cy={p.y} r="3.8" stroke="var(--surface-2)" strokeWidth="1.5" fill="#579c81"><title>{points[i].label} · {cash(points[i].encaisse)} encaissés</title></circle>)}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, overflowX: 'auto', fontSize: 11, color: 'var(--fg-muted)', marginTop: 5 }}>
          <span>{points[0]?.label}</span>
          {points.length > 2 && <span>{points[Math.floor((points.length - 1) / 2)]?.label}</span>}
          {points.length > 1 && <span>{points[points.length - 1]?.label}</span>}
        </div>
        <p style={{ fontSize: 11, color: 'var(--fg-muted)', margin: '8px 0 0' }}>Survole les points pour voir le montant et le nombre de ventes.</p>
      </div>}

    <p style={{ margin: '15px 0 0', fontSize: 11, color: 'var(--fg-muted)' }}>Les montants proviennent des soumissions acceptées et des factures payées (taxes possiblement incluses). Les dates utilisées sont celles de la dernière modification des statuts. Pour calculer le profit, remplir les coûts dans la rentabilité de chaque chantier.</p>
  </section>;
}
