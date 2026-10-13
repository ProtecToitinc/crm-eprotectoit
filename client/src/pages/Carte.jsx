import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useUI } from '../context/UIContext';
import { STAGES, STAGE_MAP } from '../constants';
import { api } from '../api';
import { fullName, norm } from '../lib/search';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default function Carte() {
  const [clients, setClients] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState(0);
  const [geoBusy, setGeoBusy] = useState(true);
  const [geoStopped, setGeoStopped] = useState(false);
  const { refreshKey, openDeal } = useUI();
  const mapEl = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const fittedCount = useRef(-1);
  const openDealRef = useRef(openDeal);
  openDealRef.current = openDeal;

  useEffect(() => {
    let off = false;
    api.clients.list()
      .then(c => { if (!off) { setClients(c || []); setLoadError(''); } })
      .catch(e => { if (!off) setLoadError(e.message || 'Impossible de charger les clients'); });
    return () => { off = true; };
  }, [refreshKey]);

  // Localisation des adresses en arrière-plan (4 clients par appel) ; une erreur réseau n’empêche pas d’utiliser la carte
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        while (!stop) {
          const r = await api.geocode();
          if (!r || stop) return;
          setPending(Math.max(r.remaining, 0));
          const list = await api.clients.list();
          if (stop) return;
          setClients(list || []);
          if (r.error) setGeoStopped(true);
          if (r.remaining <= 0) return;
        }
      } catch {
        if (!stop) setGeoStopped(true);
      } finally {
        if (!stop) setGeoBusy(false);
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
    const ro = new ResizeObserver(() => map.current && map.current.invalidateSize());
    ro.observe(mapEl.current);
    const t = setTimeout(() => map.current && map.current.invalidateSize(), 300);
    fittedCount.current = -1;
    return () => {
      clearTimeout(t);
      ro.disconnect();
      map.current.remove();
      map.current = null;
      delete window.__openDeal;
    };
  }, []);

  const located = useMemo(() => clients.filter(c => c.lat && c.lng), [clients]);

  // Les repères suivent les données (adresse, étape…) ; la vue ne se recadre que lorsque le nombre de clients localisés change
  useEffect(() => {
    if (!map.current) return;
    layer.current.clearLayers();
    const pts = [];
    located.forEach(c => {
      const st = STAGE_MAP[c.derniere_etape];
      const color = st ? st.hue : '#9aa0a6';
      const m = L.circleMarker([c.lat, c.lng], { radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 });
      m.bindPopup(
        `<b>${esc(fullName(c))}</b><br>${esc(c.adresse)}${c.adresse && c.ville ? ', ' : ''}${esc(c.ville)}` +
        `${c.telephone ? `<br>${esc(c.telephone)}` : ''}` +
        `${st ? `<br><span style="color:${st.hue};font-weight:700">${esc(st.short)}</span>` : ''}` +
        `${c.derniere_valeur ? ` — ${Math.round(c.derniere_valeur).toLocaleString('fr-CA')} $` : ''}` +
        `<br><a href="#" onclick="window.__openDeal(${Number(c.id)});return false;">Ouvrir le dossier</a>`
      );
      m.addTo(layer.current);
      pts.push([c.lat, c.lng]);
    });
    if (pts.length && fittedCount.current !== pts.length) {
      map.current.fitBounds(pts, { padding: [40, 40], maxZoom: 12 });
    }
    fittedCount.current = pts.length;
  }, [located]);

  // Secteurs regroupés sans tenir compte des accents ni de la casse ; on affiche la graphie la plus soignée du groupe
  const cities = useMemo(() => {
    const groups = new Map();
    const neatness = s => (s[0] === s[0].toUpperCase() ? 2 : 0) + (s !== s.normalize('NFD').replace(/[̀-ͯ]/g, '') ? 1 : 0);
    clients.forEach(c => {
      const label = (c.ville || '').trim() || 'Non précisé';
      const key = norm(label);
      const g = groups.get(key);
      if (!g) groups.set(key, { label, count: 1 });
      else { g.count += 1; if (neatness(label) > neatness(g.label)) g.label = label; }
    });
    return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));
  }, [clients]);
  const maxCount = Math.max(1, ...cities.map(c => c.count));
  const total = clients.length;

  return (
    <div className="fadein map-grid">
      <div style={{ position: 'relative', isolation: 'isolate', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', minHeight: 'min(520px, 68vh)', boxShadow: 'var(--shadow)' }}>
        <div ref={mapEl} style={{ position: 'absolute', inset: 0 }} />
        <div style={{
          position: 'absolute', left: 12, bottom: 12, right: 12, width: 'fit-content', maxWidth: 'calc(100% - 24px)', zIndex: 500, fontSize: 11.5, fontWeight: 700, color: 'var(--fg-muted)',
          background: 'var(--surface)', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)'
        }}>
          {located.length} / {total} clients localisés
          {geoBusy && !geoStopped ? ` — recherche des adresses${pending > 0 ? ` (${pending})` : ''}…` : ''}
          {geoStopped ? ' — recherche des adresses interrompue, réessayez plus tard' : ''}
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: 'var(--shadow)', maxHeight: 560, overflowY: 'auto' }}>
        {loadError && <div role="alert" style={{ marginBottom: 12, color: '#c4584f', fontSize: 13, fontWeight: 600 }}>{loadError}</div>}
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>Projets par secteur</div>
        {cities.length === 0 && <p style={{ color: 'var(--fg-faint)', fontSize: 13.5 }}>Aucune donnée</p>}
        {cities.map(c => (
          <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 15 }}>
            <div style={{ width: 118, flexShrink: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{c.label}</div>
            <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((c.count / maxCount) * 100)}%`, background: 'var(--accent)', borderRadius: 6 }} />
            </div>
            <div style={{ width: 24, textAlign: 'right', fontSize: 13, fontWeight: 800 }}>{c.count}</div>
          </div>
        ))}
        <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--fg-muted)', fontWeight: 600 }}>Total des clients</span>
          <span style={{ fontWeight: 800 }}>{total} client{total !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', marginBottom: 9 }}>Couleur des repères = dernière étape</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px 14px' }}>
            {STAGES.map(s => (
              <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.hue }} />{s.short}
              </span>
            ))}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#9aa0a6' }} />Aucun dossier
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
