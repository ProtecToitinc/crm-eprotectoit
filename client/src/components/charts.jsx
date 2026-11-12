import React, { useId, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CountUp } from './motion';

const ease = [0.22, 1, 0.36, 1];
const short = v => (v >= 1000 ? `${Math.round(v / 100) / 10} k` : String(Math.round(v)));
export const SERIES = [
  { key: 'vendu', label: 'Vendu', color: 'var(--accent)' },
  { key: 'encaisse', label: 'Encaissé', color: 'var(--series-2)' }
];
const W = 640, H = 240, LEFT = 50, RIGHT = 624, BASE = 196, TOP = 26;

// Légende cliquable : chaque série s'affiche ou se masque
export function LegendToggle({ show, onToggle }) {
  return (
    <div role="group" aria-label="Séries affichées" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {SERIES.map(s => (
        <button key={s.key} type="button" className="chip-btn" aria-pressed={show[s.key]} onClick={() => onToggle(s.key)} title={show[s.key] ? `Masquer ${s.label.toLowerCase()}` : `Afficher ${s.label.toLowerCase()}`}>
          <span style={{ width: 9, height: 9, borderRadius: 9, flexShrink: 0, border: `2px solid ${s.color}`, background: show[s.key] ? s.color : 'transparent' }} />
          {s.label}
        </button>
      ))}
    </div>
  );
}

function Grid({ max }) {
  return [0, 1, 2, 3].map(i => {
    const y = BASE - ((BASE - TOP) * i) / 3;
    return <g key={i}><line x1={LEFT} x2={RIGHT} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 6" /><text x={LEFT - 10} y={y + 4} textAnchor="end" fontSize="11" fill="var(--fg-muted)">{short((max * i) / 3)}</text></g>;
  });
}
function XLabels({ points, xOf, active }) {
  const step = Math.ceil(points.length / 8);
  return points.map((p, i) => ((i % step === 0 && i + step / 2 < points.length) || i === points.length - 1 || i === active) && (
    <text key={p.key} x={xOf(i)} y={H - 22} textAnchor="middle" fontSize="11" fill={active === i ? 'var(--fg)' : 'var(--fg-muted)'} fontWeight={active === i ? 800 : 500}
      opacity={active != null && active !== i && Math.abs(active - i) < step ? 0 : 1}>{p.label}</text>
  ));
}
// Bulle d'information qui suit le point survolé
function Tip({ x, y, point, keys, format }) {
  return (
    <AnimatePresence>
      {point && (
        <motion.div className="chart-tip" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}
          style={{ left: `${Math.min(86, Math.max(14, (x / W) * 100))}%`, top: `${(y / H) * 100}%` }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>{point.long || point.label}</div>
          {keys.map(s => <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: 8, background: s.color }} />{s.label}<strong style={{ marginLeft: 'auto', paddingLeft: 14 }}>{format(point[s.key])}</strong></div>)}
          {point.ventes != null && <div style={{ marginTop: 4, color: 'var(--fg-muted)' }}>{point.ventes} vente{point.ventes > 1 ? 's' : ''}</div>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
const describe = (points, format) => points.map(p => `${p.long || p.label} : ${format(p.vendu)} vendus, ${format(p.encaisse)} encaissés`).join('; ');

// Barres : elles poussent l'une après l'autre ; survol ou flèches du clavier pour lire les montants
export function BarChart({ points, format, show = { vendu: true, encaisse: true } }) {
  const [hov, setHov] = useState(null);
  const ref = useRef(null), id = useId().replace(/:/g, '');
  const keys = SERIES.filter(s => show[s.key]);
  const max = Math.max(1, ...points.flatMap(p => keys.map(s => p[s.key])));
  const slot = (RIGHT - LEFT) / Math.max(points.length, 1);
  const bw = Math.max(2, Math.min(26, (slot * 0.62) / Math.max(keys.length, 1)));
  const xOf = i => LEFT + slot * i + slot / 2;
  const hOf = v => ((BASE - TOP) * v) / max;
  const onMove = e => { const r = ref.current.getBoundingClientRect(); const i = Math.floor((((e.clientX - r.left) / r.width) * W - LEFT) / slot); setHov(i >= 0 && i < points.length ? i : null); };
  const onKey = e => { if (e.key === 'ArrowRight') setHov(h => Math.min(points.length - 1, (h ?? -1) + 1)); else if (e.key === 'ArrowLeft') setHov(h => Math.max(0, (h ?? points.length) - 1)); };
  const lit = hov ?? points.length - 1;
  const tipY = hov == null ? 0 : BASE - Math.max(...keys.map(s => hOf(points[hov][s.key])), 0) - 8;
  return (
    <div ref={ref} className="chart-wrap" tabIndex={0} role="img" aria-label={'Ventes par période. ' + describe(points, format)} onPointerMove={onMove} onPointerLeave={() => setHov(null)} onKeyDown={onKey} onBlur={() => setHov(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" style={{ display: 'block', width: '100%', height: 'auto' }}>
        <defs>{SERIES.map(s => <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity="1" /><stop offset="100%" stopColor={s.color} stopOpacity=".3" /></linearGradient>)}</defs>
        <Grid max={max} />
        {hov != null && <rect x={xOf(hov) - slot / 2} y={TOP - 8} width={slot} height={BASE - TOP + 8} rx="6" fill="var(--glass-2)" />}
        {points.map((p, i) => keys.map((s, k) => {
          const h = Math.max(hOf(p[s.key]), p[s.key] > 0 ? 3 : 0);
          return <motion.rect key={`${p.key}-${s.key}`} x={xOf(i) - (keys.length * bw + (keys.length - 1) * 3) / 2 + k * (bw + 3)} width={bw} rx={Math.min(4, bw / 2)} fill={`url(#${id}-${s.key})`}
            initial={{ y: BASE, height: 0 }} animate={{ y: BASE - h, height: h, opacity: lit === i ? 1 : 0.55 }} transition={{ duration: 0.8, delay: Math.min(0.9, i * 0.05) + k * 0.05, ease, opacity: { duration: 0.15, delay: 0 } }} />;
        }))}
        <XLabels points={points} xOf={xOf} active={hov} />
      </svg>
      <Tip x={hov == null ? 0 : xOf(hov)} y={tipY} point={hov == null ? null : points[hov]} keys={keys} format={format} />
    </div>
  );
}

// Courbe : le tracé se dessine, une ligne verticale suit la souris
export function AreaChart({ points, format, show = { vendu: true, encaisse: true } }) {
  const [hov, setHov] = useState(null);
  const ref = useRef(null), id = useId().replace(/:/g, '');
  const keys = SERIES.filter(s => show[s.key]);
  const max = Math.max(1, ...points.flatMap(p => keys.map(s => p[s.key])));
  const step = points.length > 1 ? (RIGHT - LEFT - 16) / (points.length - 1) : 0;
  const xOf = i => (points.length > 1 ? LEFT + 8 + i * step : (LEFT + RIGHT) / 2);
  const yOf = v => BASE - ((BASE - TOP) * v) / max;
  const line = k => points.map((p, i) => ({ x: xOf(i), y: yOf(p[k]) })).reduce((d, p, i, a) => {
    if (!i) return `M ${p.x} ${p.y}`;
    const cx = (a[i - 1].x + p.x) / 2;
    return `${d} C ${cx} ${a[i - 1].y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
  }, '');
  const onMove = e => { const r = ref.current.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W; setHov(step ? Math.max(0, Math.min(points.length - 1, Math.round((x - LEFT - 8) / step))) : 0); };
  const onKey = e => { if (e.key === 'ArrowRight') setHov(h => Math.min(points.length - 1, (h ?? -1) + 1)); else if (e.key === 'ArrowLeft') setHov(h => Math.max(0, (h ?? points.length) - 1)); };
  const sig = points.map(p => p.key).join();
  const last = points.length - 1;
  const tipY = hov == null ? 0 : Math.min(...keys.map(s => yOf(points[hov][s.key])), BASE) - 12;
  return (
    <div ref={ref} className="chart-wrap" tabIndex={0} role="img" aria-label={'Évolution des ventes. ' + describe(points, format)} onPointerMove={onMove} onPointerLeave={() => setHov(null)} onKeyDown={onKey} onBlur={() => setHov(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" style={{ display: 'block', width: '100%', height: 'auto' }}>
        <defs><linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity=".34" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
        <Grid max={max} />
        {points.length > 1 && keys.map((s, k) => (
          <g key={`${sig}-${s.key}`}>
            {s.key === keys[0].key && <motion.path d={`${line(s.key)} L ${xOf(last)} ${BASE} L ${xOf(0)} ${BASE} Z`} fill={`url(#${id}-area)`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, delay: 0.45 }} />}
            <motion.path d={line(s.key)} fill="none" stroke={s.color} strokeWidth="2.6" strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 1.2, delay: k * 0.18, ease: 'easeInOut' }} />
          </g>
        ))}
        {hov == null && keys.map(s => (
          <g key={s.key}>
            <motion.circle cx={xOf(last)} cy={yOf(points[last][s.key])} fill="none" stroke={s.color} strokeWidth="1.5" initial={{ r: 4, opacity: 0.7 }} animate={{ r: 13, opacity: 0 }} transition={{ duration: 1.9, repeat: Infinity, delay: 1.2 }} />
            <motion.circle cx={xOf(last)} cy={yOf(points[last][s.key])} r="4.5" fill={s.color} stroke="var(--surface)" strokeWidth="2" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.1 }} />
          </g>
        ))}
        {hov != null && <>
          <line x1={xOf(hov)} x2={xOf(hov)} y1={TOP - 6} y2={BASE} stroke="var(--fg-muted)" strokeDasharray="4 5" opacity=".6" />
          {keys.map(s => <circle key={s.key} cx={xOf(hov)} cy={yOf(points[hov][s.key])} r="5.5" fill={s.color} stroke="var(--surface)" strokeWidth="2.5" />)}
        </>}
        <XLabels points={points} xOf={xOf} active={hov} />
      </svg>
      <Tip x={hov == null ? 0 : xOf(hov)} y={tipY} point={hov == null ? null : points[hov]} keys={keys} format={format} />
    </div>
  );
}

// Anneau : les segments se dessinent ; le total est au centre ; survol = détail du segment
export function Donut({ items, total, centerLabel, format, hover, onHover }) {
  const [own, setOwn] = useState(null);
  const hov = hover !== undefined ? hover : own, setHov = onHover || setOwn;
  const R = 62, C = 2 * Math.PI * R, gap = 3;
  const sum = items.reduce((s, i) => s + i.value, 0) || 1;
  let acc = 0;
  const shown = hov != null ? items[hov] : null;
  return (
    <div style={{ position: 'relative', width: 190, height: 190, flexShrink: 0 }}>
      <svg viewBox="0 0 160 160" width="190" height="190" role="img" aria-label={'Répartition : ' + items.map(i => `${i.name} ${format(i.value)}`).join(', ')}>
        <circle cx="80" cy="80" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="14" />
        {items.map((it, i) => {
          const len = Math.max(0, (it.value / sum) * C - gap);
          const off = -acc; acc += (it.value / sum) * C;
          return (
            <motion.circle key={it.name} cx="80" cy="80" r={R} fill="none" stroke={it.hue} strokeWidth={hov === i ? 20 : 14} strokeLinecap="butt" opacity={hov == null || hov === i ? 1 : 0.35}
              transform="rotate(-90 80 80)" strokeDashoffset={off} onPointerEnter={() => setHov(i)} onPointerLeave={() => setHov(null)} style={{ cursor: 'pointer', transition: 'stroke-width .18s, opacity .18s' }}
              initial={{ strokeDasharray: `0 ${C}` }} animate={{ strokeDasharray: `${len} ${C}` }} transition={{ duration: 1, delay: 0.15 + i * 0.12, ease }} />
          );
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', textAlign: 'center', padding: 34 }}>
        <div className="numeral" style={{ fontSize: 22 }}>{shown ? format(shown.value) : <CountUp value={format(total)} />}</div>
        <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontWeight: 600, marginTop: 2 }}>{shown ? `${shown.name} · ${Math.round((shown.value / sum) * 100)} %` : centerLabel}</div>
      </div>
    </div>
  );
}

// Entonnoir : chaque étape rétrécit selon le nombre de dossiers qui l'ont atteinte
export function Funnel({ stages, format, onSelect }) {
  const [hov, setHov] = useState(null);
  const top = Math.max(1, stages[0]?.count || 0);
  const pct = stages.map(s => Math.max(7, (s.count / top) * 100));
  const cur = hov != null ? stages[hov] : null;
  return (
    <div onPointerLeave={() => setHov(null)}>
      <div style={{ display: 'grid', gap: 5 }}>
        {stages.map((s, i) => {
          const a = pct[i], b = pct[i + 1] ?? Math.max(5, a * 0.82);
          const rate = i ? (stages[i - 1].count ? Math.round((s.count / stages[i - 1].count) * 100) : 0) : null;
          return (
            <button key={s.key} type="button" className="funnel-row" onPointerEnter={() => setHov(i)} onFocus={() => setHov(i)} onBlur={() => setHov(null)} onClick={() => onSelect?.(s)}
              aria-label={`${s.label} : ${s.count} dossier${s.count > 1 ? 's' : ''}${rate != null ? `, ${rate} % de l’étape précédente` : ''}. Ouvrir le pipeline.`}>
              <span className="funnel-label">{s.short}</span>
              <span style={{ display: 'block', height: 42, minWidth: 0 }}>
                <motion.span initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: hov == null || hov === i ? 1 : 0.4 }} transition={{ duration: 0.75, delay: 0.08 + i * 0.11, ease, opacity: { duration: 0.18, delay: 0 } }}
                  style={{ display: 'block', height: '100%', transformOrigin: '50% 50%', clipPath: `polygon(${50 - a / 2}% 0, ${50 + a / 2}% 0, ${50 + b / 2}% 100%, ${50 - b / 2}% 100%)`,
                    background: `linear-gradient(180deg, color-mix(in srgb, var(--accent) ${100 - i * 14}%, var(--surface-2)), color-mix(in srgb, var(--accent) ${86 - i * 14}%, var(--surface-2)))` }} />
              </span>
              <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <strong style={{ fontSize: 15 }}>{s.count}</strong>
                {rate != null && <span style={{ display: 'block', fontSize: 11, color: 'var(--fg-muted)', fontWeight: 600 }}>{rate} %</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div aria-live="polite" style={{ minHeight: 40, marginTop: 12, fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
        {cur
          ? <><strong style={{ color: 'var(--fg)' }}>{cur.label}</strong> — {cur.count} dossier{cur.count > 1 ? 's ont' : ' a'} atteint cette étape ({Math.round((cur.count / top) * 100)} % du total), dont {cur.here} y {cur.here > 1 ? 'sont' : 'est'} en ce moment. Valeur : {format(cur.value)}.</>
          : 'Passe sur une étape pour voir le détail. Clique pour ouvrir le pipeline.'}
      </div>
    </div>
  );
}

// Jauge en arc : se remplit jusqu'à la valeur
export function Gauge({ value, max = 100, label, size = 150, suffix = ' %' }) {
  const id = useId().replace(/:/g, '');
  const R = 54, C = 2 * Math.PI * R, sweep = 0.75;
  const frac = Math.max(0, Math.min(1, (Number(value) || 0) / max));
  return (
    <div style={{ position: 'relative', width: size, height: size * 0.92, flexShrink: 0 }} role="img" aria-label={`${label} : ${value}${suffix}`}>
      <svg viewBox="0 0 140 140" width={size} height={size} aria-hidden="true">
        <defs><linearGradient id={id} x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor="var(--accent-deep)" /><stop offset="100%" stopColor="var(--accent)" /></linearGradient></defs>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${C * sweep} ${C}`} transform="rotate(135 70 70)" />
        <motion.circle cx="70" cy="70" r={R} fill="none" stroke={`url(#${id})`} strokeWidth="10" strokeLinecap="round" transform="rotate(135 70 70)"
          initial={{ strokeDasharray: `0.01 ${C}` }} whileInView={{ strokeDasharray: `${Math.max(0.01, C * sweep * frac)} ${C}` }} viewport={{ once: true }} transition={{ duration: 1.3, delay: 0.2, ease }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingTop: size * 0.04 }}>
        <div className="numeral" style={{ fontSize: size * 0.2 }}><CountUp value={`${String(value).replace('.', ',')}${suffix}`} /></div>
        <div style={{ fontSize: Math.max(9.5, size * 0.07), color: 'var(--fg-muted)', fontWeight: 600, maxWidth: size * 0.62 }}>{label}</div>
      </div>
    </div>
  );
}

// Mini-courbe pour une tuile
export function Sparkline({ values, width = 110, height = 34, color = 'var(--accent)' }) {
  const id = useId().replace(/:/g, '');
  if (!values || values.length < 2) return <svg width={width} height={height} aria-hidden="true"><line x1="2" x2={width - 2} y1={height - 6} y2={height - 6} stroke="var(--border)" strokeDasharray="3 5" strokeWidth="2" /></svg>;
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const pts = values.map((v, i) => [2 + (i * (width - 4)) / (values.length - 1), height - 4 - ((v - min) / (max - min || 1)) * (height - 10)]);
  const d = pts.reduce((s, [x, y], i, a) => (i ? `${s} C ${(a[i - 1][0] + x) / 2} ${a[i - 1][1]}, ${(a[i - 1][0] + x) / 2} ${y}, ${x} ${y}` : `M ${x} ${y}`), '');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ overflow: 'visible' }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".35" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <motion.path d={`${d} L ${lx} ${height} L 2 ${height} Z`} fill={`url(#${id})`} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.6 }} />
      <motion.path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.1, delay: 0.2, ease: 'easeInOut' }} />
      <motion.circle cx={lx} cy={ly} r="3" fill={color} initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 1.2 }} />
    </svg>
  );
}

// Une barre par jour (30 derniers jours) ; survol = date et nombre
export function DayBars({ days, height = 130, noun = 'prospect' }) {
  const [hov, setHov] = useState(null);
  const max = Math.max(1, ...days.map(d => d.count));
  const cur = hov != null ? days[hov] : null;
  return (
    <div className="chart-wrap" role="img" aria-label={`${noun}s par jour : ` + days.filter(d => d.count).map(d => `${d.label} ${d.count}`).join(', ')} onPointerLeave={() => setHov(null)}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }}>
        {days.map((d, i) => (
          <div key={d.date} onPointerEnter={() => setHov(i)} style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'default' }}>
            <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.6, delay: i * 0.018, ease }}
              style={{ width: '100%', transformOrigin: '50% 100%', height: d.count ? `${Math.max(6, (d.count / max) * 100)}%` : 3, borderRadius: 3,
                background: hov === i || (hov == null && i === days.length - 1) ? 'var(--accent)' : d.count ? 'color-mix(in srgb, var(--series-2) 55%, transparent)' : 'var(--border)', transition: 'background .15s' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 11, color: 'var(--fg-muted)' }}><span>{days[0]?.label}</span><span>{days[Math.floor(days.length / 2)]?.label}</span><span>Aujourd’hui</span></div>
      <AnimatePresence>
        {cur && (
          <motion.div className="chart-tip" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}
            style={{ left: `${Math.min(88, Math.max(12, ((hov + 0.5) / days.length) * 100))}%`, top: `${(1 - Math.max(0.06, cur.count / max)) * height - 8}px` }}>
            <strong>{cur.count} {noun}{cur.count > 1 ? 's' : ''}</strong><div style={{ color: 'var(--fg-muted)' }}>{cur.long}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
