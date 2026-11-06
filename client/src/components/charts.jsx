import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CountUp } from './motion';

const ease = [0.22, 1, 0.36, 1];
const short = v => (v >= 1000 ? `${Math.round(v / 100) / 10} k` : String(Math.round(v)));

// Graphique à barres : les barres poussent l'une après l'autre ; la dernière est mise en valeur
export function BarChart({ points, cash, colors = ['#5cc8ee', '#5dbea0'], labels = ['Vendu', 'Encaissé'] }) {
  const [hov, setHov] = useState(null);
  const W = 640, H = 235, left = 54, right = 600, base = 184, top = 30;
  const max = Math.max(1, ...points.map(p => Math.max(p.vendu, p.encaisse)));
  const slot = (right - left) / Math.max(points.length, 1);
  const bw = Math.min(26, slot * 0.34);
  const hOf = v => ((base - top) * v) / max;
  const active = hov ?? points.length - 1;
  return (
    <svg role="img" aria-label={'Ventes par période : ' + points.map(p => `${p.label}, ${cash(p.vendu)} vendus et ${cash(p.encaisse)} encaissés`).join('; ')}
      viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 300 }} onMouseLeave={() => setHov(null)}>
      <defs>
        {colors.map((c, i) => <linearGradient key={i} id={`bar-g${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity=".95" /><stop offset="100%" stopColor={c} stopOpacity=".35" /></linearGradient>)}
      </defs>
      {[0, 1, 2, 3].map(i => {
        const y = base - ((base - top) * i) / 3;
        return <g key={i}><line x1={left} x2={right} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 6" /><text x={left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="var(--fg-muted)">{short((max * i) / 3)}</text></g>;
      })}
      {points.map((p, i) => {
        const cx = left + slot * i + slot / 2;
        const on = active === i;
        return (
          <g key={p.key} tabIndex="0" onMouseEnter={() => setHov(i)} onFocus={() => setHov(i)} aria-label={`${p.label} : ${cash(p.vendu)} vendus et ${cash(p.encaisse)} encaissés`} style={{ outline: 'none' }}>
            <rect x={cx - slot / 2} y={top - 6} width={slot} height={base - top + 6} fill="transparent" />
            {[p.vendu, p.encaisse].map((v, k) => (
              <motion.rect key={k} x={cx - bw - 1 + k * (bw + 2)} width={bw} rx="6" fill={`url(#bar-g${k})`} opacity={on ? 1 : 0.62}
                initial={{ y: base, height: 0 }} animate={{ y: base - hOf(v), height: Math.max(hOf(v), v > 0 ? 3 : 0) }}
                transition={{ duration: 0.9, delay: 0.1 + i * 0.07 + k * 0.05, ease }} />
            ))}
            <text x={cx} y="210" textAnchor="middle" fontSize="11" fill={on ? 'var(--fg)' : 'var(--fg-muted)'} fontWeight={on ? 800 : 500}>{p.label}</text>
            {on && (
              <g>
                <rect x={Math.min(Math.max(cx - 58, left), right - 116)} y="2" width="116" height="24" rx="8" fill="var(--fg)" opacity=".92" />
                <text x={Math.min(Math.max(cx, left + 58), right - 58)} y="18" textAnchor="middle" fontSize="11.5" fontWeight="800" fill="var(--surface)">{cash(p.vendu)}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Anneau : les segments se dessinent ; le total est au centre
export function Donut({ items, total, centerLabel, format }) {
  const [hov, setHov] = useState(null);
  const R = 62, C = 2 * Math.PI * R, gap = 3;
  const sum = items.reduce((s, i) => s + i.value, 0) || 1;
  let acc = 0;
  const shown = hov != null ? items[hov] : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <div style={{ position: 'relative', width: 180, height: 180 }}>
        <svg viewBox="0 0 160 160" width="180" height="180" role="img" aria-label={'Répartition : ' + items.map(i => `${i.name} ${format(i.value)}`).join(', ')}>
          <circle cx="80" cy="80" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="16" />
          {items.map((it, i) => {
            const len = Math.max(0, (it.value / sum) * C - gap);
            const off = -acc; acc += (it.value / sum) * C;
            return (
              <motion.circle key={it.name} cx="80" cy="80" r={R} fill="none" stroke={it.hue} strokeWidth={hov === i ? 20 : 16} strokeLinecap="round"
                transform="rotate(-90 80 80)" strokeDashoffset={off} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} style={{ cursor: 'pointer', transition: 'stroke-width .15s' }}
                initial={{ strokeDasharray: `0 ${C}` }} animate={{ strokeDasharray: `${len} ${C}` }} transition={{ duration: 1, delay: 0.15 + i * 0.12, ease }} />
            );
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', textAlign: 'center', padding: 30 }}>
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.02em' }}>{shown ? format(shown.value) : <CountUp value={format(total)} />}</div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', fontWeight: 600 }}>{shown ? shown.name : centerLabel}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', width: '100%' }}>
        {items.map((it, i) => (
          <div key={it.name} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, minWidth: 0, opacity: hov == null || hov === i ? 1 : 0.5, transition: 'opacity .15s' }}>
            <span style={{ width: 9, height: 9, borderRadius: 9, background: it.hue, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{it.name}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--fg-muted)', fontWeight: 700 }}>{format(it.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
