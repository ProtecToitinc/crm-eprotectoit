import React, { useState } from 'react';
import { api } from '../api';

const USERS = ['Mathys Caron', 'Ramy Farah'];

export default function Login({ onLogin }) {
  const [user, setUser] = useState(() => { try { return localStorage.getItem('crm_user') || ''; } catch { return ''; } });
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user) { setError('Choisis ton nom.'); return; }
    setLoading(true);
    setError('');
    const res = await api.login(password, user);
    setLoading(false);
    if (res?.ok) {
      localStorage.setItem('crm_token', res.token);
      localStorage.setItem('crm_user', res.user || user);
      onLogin(res.user || user);
    } else {
      setError(res?.message || 'Mot de passe incorrect');
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, background: '#0a0a0b', fontFamily: "'Manrope', system-ui, sans-serif"
    }}>
      <div style={{ width: '100%', maxWidth: 360, background: '#161618', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 32, boxShadow: '0 30px 80px rgba(0,0,0,.4)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo-white.png" alt="PROTECTOIT" style={{ height: 64, margin: '0 auto 12px', display: 'block', objectFit: 'contain' }} />
          <p style={{ color: '#9b958c', fontSize: 12.5, margin: 0 }}>CRM — Accès équipe</p>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#9b958c', marginBottom: 6 }}>Qui es-tu?</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {USERS.map(u => (
                <button type="button" key={u} onClick={() => setUser(u)} aria-pressed={user === u} style={{
                  height: 46, borderRadius: 10, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                  border: user === u ? '1px solid #cf8a48' : '1px solid rgba(255,255,255,.12)',
                  background: user === u ? 'rgba(207,138,72,.18)' : 'rgba(255,255,255,.05)', color: '#efece6'
                }}>{u}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#9b958c', marginBottom: 6 }}>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{
                width: '100%', height: 42, padding: '0 13px', borderRadius: 10, fontFamily: 'inherit', fontSize: 13.5,
                border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: '#efece6'
              }}
              placeholder="••••••••••"
              autoFocus={!!user}
            />
          </div>
          {error && <p role="alert" style={{ color: '#e08877', fontSize: 13, margin: 0 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', height: 44, border: 'none', borderRadius: 10, fontFamily: 'inherit',
              background: '#cf8a48', color: '#14110c', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
              opacity: loading ? .6 : 1, marginTop: 4
            }}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
