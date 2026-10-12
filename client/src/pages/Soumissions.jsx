import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { useUI } from '../context/UIContext';
import { QUOTE_STATUSES, SERVICE_HUE, money, soft } from '../constants';
import { api } from '../api';

export default function Soumissions() {
  const [quotes, setQuotes] = useState([]);
  const { refreshKey, openDeal, bumpRefresh } = useUI();

  async function load() {
    setQuotes(await api.quotes.list() || []);
  }

  useEffect(() => { load(); }, [refreshKey]);

  async function changeStatus(q, statut) {
    await api.quotes.update(q.id, { ...q, statut });
    load();
    bumpRefresh();
  }

  const now = new Date();
  const acceptedThisMonth = quotes.filter(q => q.statut === 'acceptee' && new Date(q.created_at).getMonth() === now.getMonth() && new Date(q.created_at).getFullYear() === now.getFullYear()).length;
  const decided = quotes.filter(q => ['acceptee', 'refusee'].includes(q.statut)).length;
  const acceptedTotal = quotes.filter(q => q.statut === 'acceptee').length;
  const tauxAcceptation = decided > 0 ? Math.round((acceptedTotal / decided) * 100) : 0;

  const stats = [
    { label: 'Soumissions envoyées', value: String(quotes.length) },
    { label: 'Acceptées ce mois', value: String(acceptedThisMonth), hue: '#5f9d5f' },
    { label: "Taux d'acceptation", value: `${tauxAcceptation} %`, hue: 'var(--accent)' }
  ];

  return (
    <div className="fadein">
      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8, color: s.hue || 'var(--fg)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 800 }}>Soumissions récentes</div>
        {quotes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--fg-faint)' }}>
            <FileText size={32} style={{ margin: '0 auto 12px', opacity: .4 }} />
            <p style={{ margin: 0 }}>Aucune soumission. Utilisez « Nouvelle soumission » en haut.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 760 }}>
              <div className="quotes-row" style={{ padding: '11px 20px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fg-faint)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>
                <div>Référence</div><div>Client</div><div>Service</div><div>Montant</div><div>Statut</div><div>Date</div>
              </div>
              {quotes.map(q => {
                const sh = q.service ? SERVICE_HUE[q.service] : '#9aa0a6';
                const stc = QUOTE_STATUSES[q.statut] || QUOTE_STATUSES.brouillon;
                return (
                  <div key={q.id} className="row-hover quotes-row" style={{ padding: '13px 20px', borderBottom: '1px solid var(--border)', fontSize: 13.5, alignItems: 'center' }}>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)' }}>{q.reference}</div>
                    <button onClick={() => openDeal(q.client_id)} style={{ border: 'none', background: 'transparent', padding: 0, fontWeight: 700, fontFamily: 'inherit', fontSize: 13.5, color: 'var(--fg)', cursor: 'pointer', textAlign: 'left' }}>{q.prenom} {q.nom}</button>
                    <div>{q.service ? <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: soft(sh), color: sh }}>{q.service}</span> : '—'}</div>
                    <div style={{ fontWeight: 800 }}>{money(q.montant)}</div>
                    <div>
                      <select value={q.statut} onChange={e => changeStatus(q, e.target.value)} style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: soft(stc.hue), color: stc.hue,
                        border: 'none', fontFamily: 'inherit', cursor: 'pointer'
                      }}>
                        {Object.entries(QUOTE_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div style={{ color: 'var(--fg-muted)' }}>{new Date(q.created_at).toLocaleDateString('fr-CA')}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
