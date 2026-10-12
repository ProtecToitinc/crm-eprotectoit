import React, { useState } from 'react';
import { api } from '../api';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await api.login(password);
    setLoading(false);
    if (res?.ok) {
      localStorage.setItem('crm_token', res.token);
      onLogin();
    } else {
      setError('Mot de passe incorrect');
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
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#9b958c', marginBottom: 6 }}>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: '100%', height: 42, padding: '0 13px', borderRadius: 10, fontFamily: 'inherit', fontSize: 13.5,
                border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: '#efece6'
              }}
              placeholder="••••••••••"
              autoFocus
            />
          </div>
          {error && <p style={{ color: '#e08877', fontSize: 13, margin: 0 }}>{error}</p>}
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
