import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { TrendingUp, Receipt, BadgeDollarSign } from 'lucide-react';

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
      <span><span style={{ background: 'var(--accent)', display: 'inline-block', width: 11, height: 11, borderRadius: 3, marginRight: 6 }}/> Montant vendu</span>
      <span><span style={{ background: '#5f9d5f', display: 'inline-block', width: 11, height: 11, borderRadius: 3, marginRight: 6 }}/> Montant encaissé</span>
    </div>
    {!points.length ? <p style={{ padding: '20px 0', color: 'var(--fg-muted)', fontSize: 13 }}>Aucune vente ni facture payée sur cette période.</p> :
      <div style={{ overflowX: 'auto', marginTop: 13 }}>
        <div role="img" aria-label={'Évolution des montants vendus et encaissés : ' + points.map(p => p.label + ', vendu ' + cash(p.vendu) + ', encaissé ' + cash(p.encaisse)).join('; ')} style={{ display: 'flex', alignItems: 'flex-end', gap: 13, height: 222, minWidth: Math.max(460, points.length * 52), borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
          {points.map(p => <div key={p.key} title={p.label + ' — ' + p.ventes + ' ventes, ' + cash(p.vendu) + ' vendus, ' + cash(p.encaisse) + ' encaissés'} style={{ display: 'flex', flex: 1, alignItems: 'flex-end', flexDirection: 'column', justifyContent: 'flex-end', minWidth: 28, height: '100%' }}>
            <div style={{ display: 'flex', flex: 1, alignItems: 'flex-end', justifyContent: 'center', width: '100%', gap: 3 }}>
              <div style={{ width: '42%', height: Math.max(p.vendu > 0 ? 3 : 0, 100 * p.vendu / max) + '%', background: 'var(--accent)', borderRadius: '5px 5px 0 0' }}/>
              <div style={{ width: '42%', height: Math.max(p.encaisse > 0 ? 3 : 0, 100 * p.encaisse / max) + '%', background: '#5f9d5f', borderRadius: '5px 5px 0 0' }}/>
            </div>
            <div style={{ marginTop: 8, width: '100%', textAlign: 'center', color: 'var(--fg-muted)', fontWeight: 650, fontSize: 10 }}>{p.label}</div>
            <div style={{ textAlign: 'center', width: '100%', fontSize: 10, fontWeight: 800 }}>{p.ventes} vente{p.ventes > 1 ? 's' : ''}</div>
          </div>)}
        </div>
      </div>}
    <p style={{ margin: '15px 0 0', fontSize: 11, color: 'var(--fg-muted)' }}>Les montants proviennent des soumissions acceptées et des factures payées (taxes possiblement incluses). Les dates utilisées sont celles de la dernière modification des statuts. Pour calculer le profit, remplir les coûts dans la rentabilité de chaque chantier.</p>
  </section>;
}
