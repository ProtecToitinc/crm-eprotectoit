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
  const [hovered, setHovered] = useState(null);
  const coords = values => values.map((v, i) => ({ x: 54 + (points.length === 1 ? 265 : i * 530 / (points.length - 1)), y: 184 - 150 * v / max }));
  const sold = coords(points.map(p => p.vendu));
  const paid = coords(points.map(p => p.encaisse));
  const curve = ps => ps.length < 2 ? '' : ps.reduce((d, p, i) => {
    if (!i) return `M ${p.x} ${p.y}`;
    const prev = ps[i - 1], cx = (prev.x + p.x) / 2;
    return d + ` C ${cx} ${prev.y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
  }, '');
  const graphPoints = points.length > 1 ? points : [];
  const active = Number.isInteger(hovered) && hovered >= 0 && hovered < points.length ? hovered : null;
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
    <div style={{ marginTop: 22, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', gap: 18, fontSize: 12, color: 'var(--fg-muted)', fontWeight: 700 }}>
        <span><span style={{ background: '#819cb7', display: 'inline-block', width: 9, height: 9, borderRadius: 20, marginRight: 7 }}/> Ventes</span>
        <span><span style={{ background: '#5dbea0', display: 'inline-block', width: 9, height: 9, borderRadius: 20, marginRight: 7 }}/> Encaissé</span>
      </div>
      {active !== null && <span style={{ color: 'var(--fg)', fontSize: 12, fontWeight: 750 }}>{points[active].label} · {cash(points[active].vendu)} vendus · {cash(points[active].encaisse)} encaissés</span>}
    </div>
    {error && <div role="alert" style={{ marginTop: 8, color: '#c4584f' }}>{error}</div>}
    {!points.length ? <p style={{ padding: '28px 0', color: 'var(--fg-muted)', fontSize: 13 }}>Aucune vente ni facture payée sur cette période.</p> :
      <div style={{ marginTop: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', borderRadius: 14, padding: '18px 12px 10px' }}>
        <svg role="img" aria-label={'Évolution des ventes : ' + points.map(p => p.label + ', ' + cash(p.vendu) + ' vendus et ' + cash(p.encaisse) + ' encaissés').join('; ')}
          viewBox="0 0 640 235" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 290 }}
          onMouseLeave={() => setHovered(null)}>
          <defs>
            <linearGradient id="crm-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#819cb7" stopOpacity=".19"/><stop offset="100%" stopColor="#819cb7" stopOpacity="0"/></linearGradient>
          </defs>
          {[34, 84, 134, 184].map((y, i) => <g key={y}><line x1="54" x2="584" y1={y} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 6"/><text x="44" y={y + 4} textAnchor="end" fontSize="11" fill="var(--fg-muted)">{cash(max * (3 - i) / 3)}</text></g>)}
          {graphPoints.length > 0 && <>
            <path d={curve(sold) + ' L 584 184 L 54 184 Z'} fill="url(#crm-chart-fill)" />
            <path d={curve(sold)} fill="none" stroke="#819cb7" strokeWidth="2.5" strokeLinecap="round"/>
            <path d={curve(paid)} fill="none" stroke="#5dbea0" strokeWidth="2.5" strokeLinecap="round"/>
          </>}
          {points.map((p, i) => <g key={p.key} onMouseEnter={() => setHovered(i)} onFocus={() => setHovered(i)} tabIndex="0" aria-label={p.label + ' : ' + cash(p.vendu) + ' vendus et ' + cash(p.encaisse) + ' encaissés'} style={{ outline: 'none' }}>
            <rect x={sold[i].x - 18} y="25" width="36" height="178" fill="transparent" />
            {active === i && <line x1={sold[i].x} x2={sold[i].x} y1="29" y2="184" stroke="var(--fg-muted)" strokeWidth="1" strokeDasharray="4 5" opacity=".5" />}
            <circle cx={sold[i].x} cy={sold[i].y} r={active === i ? 5 : 3.5} stroke="var(--surface-2)" strokeWidth="2" fill="#819cb7"/>
            <circle cx={paid[i].x} cy={paid[i].y} r={active === i ? 5 : 3.5} stroke="var(--surface-2)" strokeWidth="2" fill="#5dbea0"/>
          </g>)}
          {points.filter((p,i) => points.length <= 8 || i % Math.ceil(points.length / 7) === 0 || i === points.length - 1).map(p => { const i = points.indexOf(p); return <text key={p.key} x={sold[i].x} y="217" fontSize="11" textAnchor="middle" fill="var(--fg-muted)">{p.label}</text>; })}
        </svg>
        <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>Passe sur un point ou sélectionne-le au clavier pour voir les montants. Les périodes sans transactions ne sont pas encore représentées.</div>
      </div>}

    <p style={{ margin: '15px 0 0', fontSize: 11, color: 'var(--fg-muted)' }}>Les montants proviennent des soumissions acceptées et des factures payées (taxes possiblement incluses). Les dates utilisées sont celles de la dernière modification des statuts. Pour calculer le profit, remplir les coûts dans la rentabilité de chaque chantier.</p>
  </section>;
}
