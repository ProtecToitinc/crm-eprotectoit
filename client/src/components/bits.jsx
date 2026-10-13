import React, { useCallback, useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { cardStyle, btnAccent } from './ui';
import { soft } from '../constants';
import { telHref } from '../lib/search';

// Chargement d'une ressource avec erreur lisible et rechargement
export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try { setData(await fn()); setError(''); }
    catch (e) { setError(e.message || 'Chargement impossible'); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

export function ErrorNote({ children }) {
  return children ? <div role="alert" style={{ ...cardStyle, padding: 14, color: '#c4584f', fontWeight: 600, marginBottom: 14 }}>{children}</div> : null;
}

export function Pill({ hue = '#9aa0a6', children, style }) {
  return <span style={{ background: soft(hue), color: hue, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', ...style }}>{children}</span>;
}

export function Stat({ label, value, hint, hue }) {
  return (
    <div style={{ ...cardStyle, padding: '14px 16px', minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: hue || 'var(--fg)' }}>{value}</div>
      {hint && <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export const statGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 };

// Gros bouton « Appeler » (utilisable au pouce, sur le toit)
export function CallButton({ phone, label, style }) {
  if (!phone) return null;
  return (
    <a href={telHref(phone)} style={{ ...btnAccent, height: 46, padding: '0 18px', textDecoration: 'none', fontSize: 14.5, ...style }}>
      <Phone size={18} /> {label || phone}
    </a>
  );
}

export function Empty({ children }) {
  return <div style={{ ...cardStyle, padding: 28, textAlign: 'center', color: 'var(--fg-muted)' }}>{children}</div>;
}

export function Loading() {
  return <div style={{ color: 'var(--fg-muted)', padding: 20 }}>Chargement…</div>;
}

export const dollars = n => (n == null ? '—' : new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n));
export const dollars2 = n => (n == null ? '—' : new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n));
export const notifyBadges = () => window.dispatchEvent(new Event('crm-refresh-badges'));
