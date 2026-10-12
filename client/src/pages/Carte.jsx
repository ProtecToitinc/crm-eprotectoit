import React, { useEffect, useState } from 'react';
import { useUI } from '../context/UIContext';
import { api } from '../api';

function hashPercent(str, min, max) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return min + (hash % 1000) / 1000 * (max - min);
}

export default function Carte() {
  const [clients, setClients] = useState([]);
  const { refreshKey } = useUI();

  useEffect(() => { api.clients.list().then(c => setClients(c || [])); }, [refreshKey]);

  const byCity = {};
  clients.forEach(c => {
    const ville = (c.ville || 'Non précisé').trim();
    byCity[ville] = (byCity[ville] || 0) + 1;
  });
  const cities = Object.entries(byCity).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(1, ...cities.map(c => c[1]));
  const total = clients.length;

  const pins = cities.map(([city, count]) => ({
    city, count,
    top: `${hashPercent(city + 'top', 18, 82).toFixed(0)}%`,
    left: `${hashPercent(city + 'left', 12, 88).toFixed(0)}%`
  }));

  return (
    <div className="fadein map-grid">
      <div style={{
        position: 'relative', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', minHeight: 480,
        boxShadow: 'var(--shadow)', backgroundColor: 'var(--surface-2)',
        backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
        backgroundSize: '46px 46px'
      }}>
        <div style={{ position: 'absolute', left: 0, top: '42%', width: '100%', height: 14, background: 'color-mix(in srgb, var(--accent) 14%, transparent)', transform: 'rotate(-7deg)' }} />
        <div style={{ position: 'absolute', left: 0, top: '64%', width: '100%', height: 10, background: 'color-mix(in srgb, #6b8cae 16%, transparent)', transform: 'rotate(4deg)' }} />

        {pins.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-faint)', fontSize: 13.5 }}>
            Aucun client avec une ville renseignée
          </div>
        )}

        {pins.map(p => (
          <div key={p.city} style={{ position: 'absolute', top: p.top, left: p.left, transform: 'translate(-50%,-100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50% 50% 50% 0', transform: 'rotate(45deg)', background: 'var(--accent)',
              boxShadow: '0 3px 9px rgba(0,0,0,.28)', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span style={{ transform: 'rotate(-45deg)', color: 'var(--accent-fg)', fontSize: 12, fontWeight: 800 }}>{p.count}</span>
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg)', background: 'var(--surface)', padding: '1px 8px', borderRadius: 10, border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{p.city}</span>
          </div>
        ))}

        <div style={{
          position: 'absolute', left: 16, bottom: 14, fontFamily: 'ui-monospace, monospace', fontSize: 11, color: 'var(--fg-faint)',
          background: 'var(--surface)', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)'
        }}>// carte interactive — intégration Google Maps à venir</div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: 'var(--shadow)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>Projets par secteur</div>
        {cities.length === 0 && <p style={{ color: 'var(--fg-faint)', fontSize: 13.5 }}>Aucune donnée</p>}
        {cities.map(([city, count]) => (
          <div key={city} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 15 }}>
            <div style={{ width: 108, flexShrink: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{city}</div>
            <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((count / maxCount) * 100)}%`, background: 'var(--accent)', borderRadius: 6 }} />
            </div>
            <div style={{ width: 24, textAlign: 'right', fontSize: 13, fontWeight: 800 }}>{count}</div>
          </div>
        ))}
        <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--fg-muted)', fontWeight: 600 }}>Total des clients</span>
          <span style={{ fontWeight: 800 }}>{total} client{total !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}
