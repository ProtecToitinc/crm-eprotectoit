import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CloudSun, MapPin, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { cardStyle, inputStyle, btnGhost } from './ui';
import { useLoad, Pill } from './bits';
import { fmtDay } from '../lib/dates';

export const VERDICT = { bon: ['Bon pour travailler', '#5f9d5f'], moyen: ['Risque', '#c8924a'], mauvais: ['À reporter?', '#c4584f'] };
const dayName = d => new Date(`${d}T12:00:00`).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric' });
const fullName = c => [c.prenom, c.nom].filter(Boolean).join(' ') || 'Client';

// Météo en temps réel + prévisions pour planifier les travaux
export default function Meteo() {
  const { data, error, loading, reload } = useLoad(() => api.meteo.get());
  const { data: chantiers } = useLoad(() => api.meteo.chantiers());
  const [edit, setEdit] = useState(false);
  const [ville, setVille] = useState('');
  const [err, setErr] = useState('');
  const save = async e => {
    e.preventDefault(); setErr('');
    try { await api.meteo.setVille(ville); setEdit(false); reload(); } catch (ex) { setErr(ex.message); }
  };
  const now = data?.maintenant;
  return (
    <section aria-label="Météo" style={{ ...cardStyle, padding: '16px 18px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <CloudSun size={26} color="var(--accent)" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: '.11em', textTransform: 'uppercase' }}>Météo des travaux</div>
            {now ? <div style={{ fontSize: 22, fontWeight: 800 }}>{Math.round(now.temp)} °C <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-muted)' }}>{now.label} · vent {Math.round(now.vent)} km/h</span></div>
              : <div style={{ color: 'var(--fg-muted)', fontSize: 14 }}>{loading ? 'Chargement…' : error || 'Météo indisponible'}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {edit ? (
            <form onSubmit={save} style={{ display: 'flex', gap: 6 }}>
              <input style={{ ...inputStyle, height: 36, width: 150 }} value={ville} onChange={e => setVille(e.target.value)} placeholder="Ville" aria-label="Ville" autoFocus />
              <button type="submit" style={{ ...btnGhost, height: 36 }}>OK</button>
            </form>
          ) : (
            <button type="button" style={{ ...btnGhost, height: 36 }} onClick={() => { setVille(data?.lieu?.split(',')[0] || ''); setEdit(true); }}><MapPin size={14} /> {data?.lieu || 'Ville'}</button>
          )}
          <button type="button" aria-label="Actualiser la météo" style={{ ...btnGhost, height: 36 }} onClick={reload}><RefreshCw size={14} /></button>
        </div>
      </div>
      {err && <div style={{ color: '#c4584f', fontSize: 13, marginBottom: 8 }}>{err}</div>}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))', gap: 8 }}>
          {data.jours.slice(0, 7).map((j, i) => {
            const [, hue] = VERDICT[j.verdict];
            return (
              <div key={j.date} title={`${j.label}${j.raisons.length ? ' — ' + j.raisons.join(' · ') : ''}`} style={{ border: '1px solid var(--border)', borderTop: `3px solid ${hue}`, borderRadius: 10, padding: '8px 8px', textAlign: 'center', fontSize: 12 }}>
                <div style={{ fontWeight: 800 }}>{i === 0 ? 'Aujourd’hui' : dayName(j.date)}</div>
                <div style={{ fontSize: 17, fontWeight: 800, margin: '2px 0' }}>{Math.round(j.tmax)}° <span style={{ fontSize: 12, color: 'var(--fg-faint)', fontWeight: 600 }}>{Math.round(j.tmin)}°</span></div>
                <div style={{ color: 'var(--fg-muted)', minHeight: 30 }}>{j.label}</div>
                <div style={{ color: hue, fontWeight: 700 }}>{j.prob != null ? `${j.prob} % pluie` : ''}</div>
              </div>
            );
          })}
        </div>
      )}
      {chantiers && chantiers.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--fg-muted)', marginBottom: 6 }}>Chantiers des 7 prochains jours</div>
          {chantiers.map(c => {
            const v = c.jour && VERDICT[c.jour.verdict];
            return (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13.5, flexWrap: 'wrap' }}>
                <Link to="/chantiers" style={{ color: 'inherit', fontWeight: 700, textDecoration: 'none' }}>{fullName(c)} <span style={{ color: 'var(--fg-faint)', fontWeight: 500 }}>· {fmtDay(c.date_debut)}</span></Link>
                {v ? <Pill hue={v[1]}>{v[0]}{c.jour.raisons[0] ? ` — ${c.jour.raisons[0]}` : ''}</Pill> : <span style={{ color: 'var(--fg-faint)', fontSize: 12 }}>pas de prévision</span>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
