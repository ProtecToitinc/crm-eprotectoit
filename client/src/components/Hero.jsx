import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../api';
import { money } from '../constants';
import { Stagger, Rise, CountUp } from './motion';

// Bandeau d'accueil façon eprotectoit.com : photo de bardeaux, lumière dorée qui suit le curseur
export default function Hero({ stats }) {
  const navigate = useNavigate();
  const ref = useRef(null);
  const [todo, setTodo] = useState(null);
  useEffect(() => { let on = true; api.attention().then(a => on && setTodo(a.total)).catch(() => {}); return () => { on = false; }; }, []);
  let prenom = '';
  try { prenom = (localStorage.getItem('crm_user') || '').split(' ')[0]; } catch { /* sans stockage */ }
  const onMove = e => {
    if (e.pointerType === 'touch') return;
    const el = ref.current, r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--hx', `${(x * 100).toFixed(1)}%`); el.style.setProperty('--hy', `${(y * 100).toFixed(1)}%`);
    el.style.setProperty('--px', (x * 2 - 1).toFixed(3)); el.style.setProperty('--py', (y * 2 - 1).toFixed(3));
  };
  const today = new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <section ref={ref} className="hero" onPointerMove={onMove} aria-label="Accueil">
      <div className="hero-photo" aria-hidden="true" /><div className="hero-shade" aria-hidden="true" /><div className="hero-light" aria-hidden="true" />
      <Stagger>
        <Rise lift={false}><div className="eyebrow">Tableau de bord — {today}</div></Rise>
        <Rise lift={false}><h1>Bonjour{prenom ? `, ${prenom}` : ''}.</h1></Rise>
        <Rise lift={false}>
          <p style={{ margin: 0, fontSize: 14.5, color: '#b8b2a8', maxWidth: 520 }}>
            {todo == null ? 'Voici où en est ProtecToit aujourd’hui.' : todo ? `${todo} action${todo > 1 ? 's' : ''} à traiter.` : 'Tout est à jour. Beau travail!'}
          </p>
        </Rise>
        <Rise lift={false}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
            <button type="button" className="cta cta-gold" onClick={() => navigate('/a-traiter')}>Voir ma journée</button>
            <button type="button" className="cta cta-line" onClick={() => navigate('/pipeline')}>Pipeline de vente <ArrowRight size={14} /></button>
          </div>
        </Rise>
        <Rise lift={false}>
          <div className="hero-stats">
            <div className="hero-stat"><div className="numeral"><CountUp value={money(stats.valeurPipeline)} duration={1.4} /></div><small>Valeur du pipeline</small></div>
            <div className="hero-stat"><div className="numeral"><CountUp value={String(stats.totalClients)} duration={1.4} /></div><small>Clients</small></div>
            <div className="hero-stat"><div className="numeral">{stats.tauxSoumissionsAcceptees == null ? '—' : <CountUp value={`${String(stats.tauxSoumissionsAcceptees).replace('.', ',')} %`} duration={1.4} />}</div><small>Soumissions acceptées · 90 jours</small></div>
          </div>
        </Rise>
      </Stagger>
    </section>
  );
}
