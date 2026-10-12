import React, { useEffect, useState } from 'react';
import { STAGES, SERVICE_HUE, money, soft, initials, avatarColor } from '../constants';
import { useUI } from '../context/UIContext';
import { api } from '../api';

export default function Pipeline() {
  const [opps, setOpps] = useState([]);
  const { refreshKey, openDeal, bumpRefresh } = useUI();
  const [dragId, setDragId] = useState(null);

  async function load() {
    setOpps(await api.opportunites.list());
  }

  useEffect(() => { load(); }, [refreshKey]);

  async function onDrop(stageKey) {
    if (dragId == null) return;
    const opp = opps.find(o => o.id === dragId);
    if (!opp || opp.etape === stageKey) { setDragId(null); return; }
    await api.opportunites.update(dragId, { ...opp, etape: stageKey });
    setDragId(null);
    load();
    bumpRefresh();
  }

  const columns = STAGES.map(st => {
    const deals = opps.filter(o => o.etape === st.key);
    const total = deals.reduce((a, d) => a + (d.valeur || 0), 0);
    return { ...st, deals, count: deals.length, total: money(total) };
  });

  return (
    <div className="fadein">
      <div className="kanban" style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 10, alignItems: 'flex-start' }}>
        {columns.map(c => (
          <div
            key={c.key}
            onDragOver={e => e.preventDefault()}
            onDrop={() => onDrop(c.key)}
            style={{ width: 288, flexShrink: 0, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: 12 }}
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
                const ah = avatarColor(d.client_id);
                const sh = d.service ? SERVICE_HUE[d.service] : '#9aa0a6';
                return (
                  <div
                    key={d.id}
                    className="kard"
                    draggable
                    onDragStart={() => setDragId(d.id)}
                    onClick={() => openDeal(d.client_id)}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, padding: 13, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,.03)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800 }}>{d.prenom} {d.nom}</div>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', background: soft(ah), color: ah,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0
                      }}>{initials(d.prenom, d.nom)}</div>
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
