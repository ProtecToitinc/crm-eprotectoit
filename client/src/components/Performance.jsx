import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { BarChart } from './charts';

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
  return <section style={{ marginTop: 0, minWidth: 0, background: 'var(--glass)', backdropFilter: 'blur(18px) saturate(150%)', WebkitBackdropFilter: 'blur(18px) saturate(150%)', border: '1px solid var(--border)', borderRadius: 20, padding: 20, boxShadow: 'var(--shadow)' }}>
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
      <div>
        <div style={{ color: 'var(--accent)', fontWeight: 800, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase' }}>Performance commerciale</div>
        <h2 style={{ margin: '6px 0 3px', fontWeight: 800, fontSize: 20 }}>Ventes et chiffre d’affaires</h2>
        <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>Soumissions acceptées et factures payées — pas le profit net.</div>
      </div>
      <div role="group" aria-label="Période du graphique" style={{ display: 'flex', flexWrap: 'wrap', gap: 5, borderRadius: 11, padding: 4, background: 'var(--glass-2)' }}>
        {periods.map(([key, label]) => <button key={key} onClick={() => setPeriod(key)} aria-pressed={period === key} style={{ padding: '9px 13px', border: '1px solid ' + (period === key ? 'var(--border)' : 'transparent'), background: period === key ? 'var(--surface)' : 'transparent', color: 'var(--fg)', borderRadius: 9, cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit' }}>{label}</button>)}
      </div>
    </div>
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      {periods.map(([key, label]) => <div key={key} style={{ padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--glass-2)' }}>
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
      <div style={{ marginTop: 10, border: '1px solid var(--border)', background: 'var(--glass-2)', borderRadius: 14, padding: '18px 12px 10px' }}>
        <BarChart points={points} cash={cash} />
        <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>Passe sur une barre pour voir les montants (bleu : vendu, vert : encaissé). Les périodes sans transactions ne sont pas encore représentées.</div>
      </div>}

    <p style={{ margin: '15px 0 0', fontSize: 11, color: 'var(--fg-muted)' }}>Les montants proviennent des soumissions acceptées et des factures payées (taxes possiblement incluses). Les dates utilisées sont celles de la dernière modification des statuts. Pour calculer le profit, remplir les coûts dans la rentabilité de chaque chantier.</p>
  </section>;
}
