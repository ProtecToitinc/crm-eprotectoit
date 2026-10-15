import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Trash2, ExternalLink } from 'lucide-react';
import { useUI } from '../context/UIContext';
import { QUOTE_STATUSES, SERVICE_HUE, money, soft } from '../constants';
import { api } from '../api';
import { parseDb, fmtDbDay } from '../lib/dates';
import { fullName } from '../lib/search';
import { cmpText, cmpValue, useStoredChoice } from '../lib/sort';
import { SortSelect } from '../components/ui';

const SORTS = [
  { value: 'recent', label: 'Plus récentes' },
  { value: 'ancien', label: 'Plus anciennes' },
  { value: 'client', label: 'Client A → Z' },
  { value: 'client_za', label: 'Client Z → A' },
  { value: 'montant', label: 'Montant (plus élevé)' },
  { value: 'montant_asc', label: 'Montant (plus petit)' },
  { value: 'statut', label: 'Statut' },
  { value: 'ref', label: 'Référence' }
];

const STATUS_ORDER = Object.keys(QUOTE_STATUSES);
const stamp = q => parseDb(q.created_at)?.getTime() ?? 0;

function comparator(sort) {
  const recent = (a, b) => stamp(b) - stamp(a) || b.id - a.id;
  return {
    recent,
    ancien: (a, b) => stamp(a) - stamp(b) || a.id - b.id,
    client: (a, b) => cmpText(fullName(a), fullName(b)) || recent(a, b),
    client_za: (a, b) => cmpText(fullName(b), fullName(a)) || recent(a, b),
    montant: (a, b) => (Number(b.montant) || 0) - (Number(a.montant) || 0) || recent(a, b),
    montant_asc: (a, b) => (Number(a.montant) || 0) - (Number(b.montant) || 0) || recent(a, b),
    statut: (a, b) => STATUS_ORDER.indexOf(a.statut) - STATUS_ORDER.indexOf(b.statut) || recent(a, b),
    ref: (a, b) => cmpText(a.reference, b.reference)
  }[sort] || recent;
}

export default function Soumissions() {
  const [quotes, setQuotes] = useState(null);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [sort, setSort] = useStoredChoice('crm_quotes_sort', 'recent', SORTS.map(s => s.value));
  const { refreshKey, openDeal, bumpRefresh, showToast } = useUI();

  const load = useCallback(() => {
    api.quotes.list().then(r => { setQuotes(r || []); setError(''); }).catch(e => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  async function changeStatus(q, statut) {
    try {
      await api.quotes.update(q.id, { statut });
      load();
      bumpRefresh();
    } catch (e) {
      showToast(e.message || 'Impossible de changer le statut');
    }
  }

  async function removeQuote(q) {
    if (!window.confirm(`Supprimer la soumission ${q.reference} de ${fullName(q)} du CRM ? Le document original Google Drive sera conservé.`)) return;
    setDeletingId(q.id);
    try { await api.quotes.delete(q.id); load(); bumpRefresh(); showToast('Soumission supprimée du CRM'); }
    catch (e) { showToast(e.message || 'Suppression impossible'); }
    finally { setDeletingId(null); }
  }
  const list = quotes || [];
  const sorted = useMemo(() => [...list].sort(comparator(sort)), [list, sort]);

  const now = new Date();
  const acceptedThisMonth = list.filter(q => {
    if (q.statut !== 'acceptee') return false;
    const d = parseDb(q.updated_at || q.created_at);
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const decided = list.filter(q => ['acceptee', 'refusee'].includes(q.statut)).length;
  const acceptedTotal = list.filter(q => q.statut === 'acceptee').length;
  const tauxAcceptation = decided > 0 ? Math.round((acceptedTotal / decided) * 100) : 0;

  const stats = [
    { label: 'Soumissions envoyées', value: String(list.filter(q => q.statut !== 'brouillon').length) },
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Soumissions</div>
          <SortSelect value={sort} onChange={setSort} options={SORTS} />
        </div>

        {error && <div role="alert" style={{ padding: 20, color: '#c4584f', fontSize: 13.5, fontWeight: 600 }}>{error}</div>}
        {!quotes && !error && <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13.5 }}>Chargement…</div>}

        {quotes && quotes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--fg-faint)' }}>
            <FileText size={32} style={{ margin: '0 auto 12px', opacity: .4 }} />
            <p style={{ margin: 0 }}>Aucune soumission. Utilisez « Nouvelle soumission » en haut.</p>
          </div>
        )}

        {quotes && quotes.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 960 }}>
              <div className="quotes-row" style={{ padding: '11px 20px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fg-faint)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>
                <div>Référence</div><div>Client</div><div>Service</div><div>Montant</div><div>Statut</div><div>Date</div><div>Actions</div>
              </div>
              {sorted.map(q => {
                const sh = q.service ? SERVICE_HUE[q.service] || '#9aa0a6' : '#9aa0a6';
                const stc = QUOTE_STATUSES[q.statut] || QUOTE_STATUSES.brouillon;
                return (
                  <div key={q.id} className="row-hover quotes-row" style={{ padding: '13px 20px', borderBottom: '1px solid var(--border)', fontSize: 13.5, alignItems: 'center' }}>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)' }}>{q.reference}</div>
                    <button onClick={() => openDeal(q.client_id)} style={{ border: 'none', background: 'transparent', padding: 0, fontWeight: 700, fontFamily: 'inherit', fontSize: 13.5, color: 'var(--fg)', cursor: 'pointer', textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName(q) || '—'}</button>
                    <div>{q.service ? <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: soft(sh), color: sh }}>{q.service}</span> : '—'}</div>
                    <div style={{ fontWeight: 800 }}>{money(q.montant)}</div>
                    <div>
                      <select value={q.statut} onChange={e => changeStatus(q, e.target.value)} aria-label="Statut de la soumission" style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: soft(stc.hue), color: stc.hue,
                        border: 'none', fontFamily: 'inherit', cursor: 'pointer'
                      }}>
                        {Object.entries(QUOTE_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div style={{ color: 'var(--fg-muted)' }}>{fmtDbDay(q.created_at)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
                      {q.drive_url && <a href={q.drive_url} target="_blank" rel="noopener noreferrer" aria-label={`Voir la soumission ${q.reference} dans Drive`} title="Voir la soumission Drive" style={{ fontSize: 11, color: 'var(--fg)', textDecoration: 'none', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><ExternalLink size={14}/> Voir soumission</a>}
                      <button type="button" disabled={deletingId === q.id} title="Supprimer cette soumission du CRM" aria-label={`Supprimer ${q.reference}`} onClick={() => removeQuote(q)} style={{ color: '#c4584f', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', padding: '7px', cursor: 'pointer', opacity: deletingId === q.id ? .45 : 1 }}><Trash2 size={15}/></button>
                    </div>
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
