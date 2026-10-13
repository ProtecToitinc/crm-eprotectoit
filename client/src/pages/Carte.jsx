import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useUI } from '../context/UIContext';
import { STAGE_MAP } from '../constants';
import { api } from '../api';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default function Carte() {
  const [clients, setClients] = useState([]);
  const [pending, setPending] = useState(0);
  const { refreshKey, openDeal } = useUI();
  const mapEl = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const openDealRef = useRef(openDeal);
  openDealRef.current = openDeal;

  const load = () => api.clients.list().then(c => setClients(c || []));
  useEffect(() => { load(); }, [refreshKey]);

  useEffect(() => {
    let stop = false;
    (async () => {
      while (!stop) {
        const r = await api.geocode();
        if (!r || stop) return;
        setPending(Math.max(r.remaining, 0));
        await load();
        if (r.remaining <= 0) return;
      }
    })();
    return () => { stop = true; };
  }, []);

  useEffect(() => {
    map.current = L.map(mapEl.current).setView([45.65, -73.7], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap'
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    window.__openDeal = id => openDealRef.current(id);
    return () => { map.current.remove(); map.current = null; };
  }, []);

  const located = clients.filter(c => c.lat && c.lng);

  useEffect(() => {
    if (!map.current) return;
    layer.current.clearLayers();
    const pts = [];
    located.forEach(c => {
      const st = STAGE_MAP[c.derniere_etape];
      const color = st ? st.hue : '#9aa0a6';
      const m = L.circleMarker([c.lat, c.lng], { radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 });
      m.bindPopup(
        `<b>${esc(c.prenom)} ${esc(c.nom)}</b><br>${esc(c.adresse)}${c.adresse ? ', ' : ''}${esc(c.ville)}` +
        `${c.telephone ? `<br>${esc(c.telephone)}` : ''}` +
        `${st ? `<br><span style="color:${st.hue};font-weight:700">${esc(st.short)}</span>` : ''}` +
        `${c.derniere_valeur ? ` — ${Math.round(c.derniere_valeur).toLocaleString('fr-CA')} $` : ''}` +
        `<br><a href="#" onclick="window.__openDeal(${c.id});return false;">Ouvrir le dossier</a>`
      );
      m.addTo(layer.current);
      pts.push([c.lat, c.lng]);
    });
    if (pts.length) map.current.fitBounds(pts, { padding: [40, 40], maxZoom: 12 });
  }, [located.length]);

  const byCity = {};
  clients.forEach(c => {
    const ville = (c.ville || 'Non précisé').trim();
    byCity[ville] = (byCity[ville] || 0) + 1;
  });
  const cities = Object.entries(byCity).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(1, ...cities.map(c => c[1]));
  const total = clients.length;

  return (
    <div className="fadein map-grid">
      <div style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', minHeight: 520, boxShadow: 'var(--shadow)' }}>
        <div ref={mapEl} style={{ position: 'absolute', inset: 0 }} />
        <div style={{
          position: 'absolute', left: 12, bottom: 12, zIndex: 500, fontSize: 11.5, fontWeight: 700, color: 'var(--fg-muted)',
          background: 'var(--surface)', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)'
        }}>
          {located.length} / {total} clients localisés{pending > 0 ? ` — recherche des adresses (${pending})…` : ''}
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: 'var(--shadow)', maxHeight: 560, overflowY: 'auto' }}>
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
