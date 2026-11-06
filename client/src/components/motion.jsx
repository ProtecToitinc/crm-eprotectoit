import React, { useEffect, useRef, useState } from 'react';
import { motion, animate, useInView, useReducedMotion, AnimatePresence, MotionConfig } from 'framer-motion';

// Réglage global : respecte « réduire les animations » du système
export function Motion({ children }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

// Fondu + montée à chaque changement de page (sans filtre : un filtre casserait les fenêtres en position fixe)
export function PageTransition({ id, children }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }} transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// Les enfants apparaissent l'un après l'autre
const container = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const item = { hidden: { opacity: 0, y: 18, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } } };
export function Stagger({ children, style, className }) {
  return <motion.div variants={container} initial="hidden" animate="show" style={style} className={className}>{children}</motion.div>;
}
export function Rise({ children, style, className, lift = true, ...rest }) {
  return <motion.div variants={item} whileHover={lift ? { y: -4, transition: { duration: 0.18 } } : undefined} style={style} className={className} {...rest}>{children}</motion.div>;
}

// Chiffre qui « se compte » : 41 734 $ -> compte de 0 à 41 734 $. Les textes non numériques s'affichent tels quels.
export function CountUp({ value, duration = 0.9 }) {
  const text = String(value ?? '');
  const m = text.match(/^(\D*?)(-?\d[\d\s ]*)([.,]\d{1,2})?(\D*)$/);
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [shown, setShown] = useState(m && !reduce ? 0 : null);
  const target = m ? Number(m[2].replace(/[\s ]/g, '')) : 0;
  const dec = m?.[3] ? m[3].length - 1 : 0;
  const decSep = m?.[3]?.[0] || ',';
  const decimals = m?.[3] ? Number(m[3].slice(1)) / 10 ** dec : 0;
  useEffect(() => {
    if (!m || reduce || !inView) return undefined;
    const c = animate(0, target + decimals, { duration, ease: 'easeOut', onUpdate: v => setShown(v) });
    return () => c.stop();
  }, [text, inView, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m || reduce || shown === null) return <span ref={ref}>{text}</span>;
  const intPart = Math.floor(Math.abs(shown)) * Math.sign(target || 1);
  const grouped = intPart.toLocaleString('fr-CA');
  const frac = dec ? decSep + (Math.abs(shown) % 1).toFixed(dec).slice(2) : '';
  const done = Math.abs(shown - (target + decimals)) < 0.0001;
  return <span ref={ref}>{done ? text : `${m[1]}${grouped}${frac}${m[4]}`}</span>;
}

// Barre qui pousse (graphiques, jauges)
export function GrowBar({ pct, color = 'var(--accent)', height = 10, style }) {
  return (
    <div style={{ height, borderRadius: height, background: 'var(--surface-2)', overflow: 'hidden', ...style }}>
      <motion.div initial={{ width: 0 }} whileInView={{ width: `${Math.max(0, Math.min(100, pct))}%` }} viewport={{ once: true }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        style={{ height: '100%', borderRadius: height, background: color }} />
    </div>
  );
}

// Tracé qui se dessine (courbes SVG)
export function DrawPath({ d, stroke, strokeWidth = 2.5, delay = 0 }) {
  return <motion.path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round"
    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 1.1, delay, ease: 'easeInOut' }} />;
}
