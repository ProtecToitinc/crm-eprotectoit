import React, { useEffect, useMemo, useState } from 'react';
import { STAGES, STAGE_MAP, SERVICE_HUE, money, soft } from '../constants';
import { useUI } from '../context/UIContext';
import { api } from '../api';
import { fullName } from '../lib/search';
import { useMedia } from '../lib/useMedia';
import { cmpText, cmpValue, useStoredChoice } from '../lib/sort';
import { Avatar, SortSelect, inputStyle } from '../components/ui';

const SORTS = [
  { value: 'recent', label: 'Plus récent' },
  { value: 'ancien', label: 'Plus ancien' },
  { value: 'az', label: 'Nom A → Z' },
  { value: 'za', label: 'Nom Z → A' },
  { value: 'valeur', label: 'Valeur la plus haute' }
];

const COMPARE = {
  recent: (a, b) => cmpValue(a.updated_at, b.updated_at, -1),
  ancien: (a, b) => cmpValue(a.updated_at, b.updated_at, 1),
  az: (a, b) => cmpText(fullName(a), fullName(b)),
  za: (a, b) => {
    const x = fullName(a), y = fullName(b);
    return x && y ? cmpText(y, x) : cmpText(x, y);
  },
  valeur: (a, b) => cmpValue(a.valeur, b.valeur, -1)
};

export default function Pipeline() {
  const [opps, setOpps] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const { refreshKey, openDeal, bumpRefresh, showToast } = useUI();
  const [dragId, setDragId] = useState(null);
  const [overKey, setOverKey] = useState(null);
  const [sort, setSort] = useStoredChoice('crm_sort_pipeline', 'recent', SORTS.map(s => s.value));
  // Au toucher (ou sur petit écran), le glisser-déposer est peu pratique : on offre un menu d’étape sur chaque carte
  const stageMenu = useMedia('(hover: none), (max-width: 900px)');

  useEffect(() => {
    let off = false;
    api.opportunites.list()
      .then(r => { if (!off) { setOpps(r || []); setLoadError(''); setLoaded(true); } })
      .catch(e => { if (!off) { setLoadError(e.message || 'Impossible de charger le pipeline'); setLoaded(true); } });
    return () => { off = true; };
  }, [refreshKey]);

  async function moveTo(opp, etape) {
    if (!opp || opp.etape === etape) return;
    const before = opps;
    setOpps(list => list.map(o => (o.id === opp.id ? { ...o, etape } : o)));
    try {
      await api.opportunites.update(opp.id, { etape });
      showToast(`Dossier déplacé vers « ${STAGE_MAP[etape]?.label || etape} »`);
      bumpRefresh();
    } catch (e) {
      setOpps(before);
      showToast(e.message || 'Impossible de déplacer le dossier');
    }
  }

  function endDrag() {
    setDragId(null);
    setOverKey(null);
  }

  function onDrop(stageKey) {
    const opp = opps.find(o => o.id === dragId);
    endDrag();
    if (opp) moveTo(opp, stageKey);
  }

  const columns = useMemo(() => STAGES.map(st => {
    const deals = opps.filter(o => o.etape === st.key).sort(COMPARE[sort] || COMPARE.recent);
    const total = deals.reduce((a, d) => a + (d.valeur || 0), 0);
    return { ...st, deals, count: deals.length, total: money(total) };
  }), [opps, sort]);

  return (
    <div className="fadein">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-muted)' }}>
          {opps.length} dossier{opps.length !== 1 ? 's' : ''}{stageMenu ? ' — changez l’étape avec le menu de chaque carte' : ' — glissez une carte pour changer son étape'}
        </div>
        <SortSelect value={sort} onChange={setSort} options={SORTS} />
      </div>

      {loadError && <div role="alert" style={{ marginBottom: 12, color: '#c4584f', fontSize: 13, fontWeight: 600 }}>{loadError}</div>}
      {!loaded && <p style={{ color: 'var(--fg-faint)', fontSize: 13.5 }}>Chargement…</p>}

      <div className="kanban" style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 10, alignItems: 'flex-start' }}>
        {columns.map(c => (
          <div
            key={c.key}
            onDragOver={e => { e.preventDefault(); if (overKey !== c.key) setOverKey(c.key); }}
            onDrop={() => onDrop(c.key)}
            style={{
              width: 288, flexShrink: 0, background: 'var(--surface-2)', borderRadius: 14, padding: 12,
              border: `1px solid ${dragId != null && overKey === c.key ? c.hue : 'var(--border)'}`,
              boxShadow: dragId != null && overKey === c.key ? `0 0 0 2px ${soft(c.hue)}` : 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.hue }} />
                <span style={{ fontSize: 13, fontWeight: 800 }}>{c.short}</span>
                <span style={{ fontSize: 12, color: 'var(--fg-faint)', fontWeight: 600 }}>{c.count}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--fg-muted)' }}>{c.total}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 60 }}>
              {c.deals.map(d => {
                const sh = d.service ? SERVICE_HUE[d.service] || '#9aa0a6' : '#9aa0a6';
                return (
                  <div
                    key={d.id}
                    className="kard"
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={() => setDragId(d.id)}
                    onDragEnd={endDrag}
                    onClick={() => openDeal(d.client_id)}
                    onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDeal(d.client_id); } }}
                    style={{
                      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, padding: 13, cursor: 'pointer',
                      boxShadow: '0 1px 2px rgba(0,0,0,.03)', opacity: dragId === d.id ? .5 : 1
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, minWidth: 0, overflowWrap: 'anywhere' }}>{fullName(d) || 'Client sans nom'}</div>
                      <Avatar client={{ id: d.client_id, prenom: d.prenom, nom: d.nom }} size={28} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 3 }}>{d.ville || '—'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
                      {d.service ? (
                        <span style={{
                          fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: soft(sh), color: sh,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140
                        }}>{d.service}</span>
                      ) : <span />}
                      <span style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{money(d.valeur)}</span>
                    </div>
                    {stageMenu && (
                      <select
                        aria-label="Changer l’étape du dossier"
                        value={d.etape}
                        onClick={e => e.stopPropagation()}
                        onChange={e => moveTo(d, e.target.value)}
                        style={{ ...inputStyle, height: 36, marginTop: 11, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                      >
                        {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
