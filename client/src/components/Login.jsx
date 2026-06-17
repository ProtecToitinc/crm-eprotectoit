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
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="bg-black border border-white/10 rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="ProtectoIT" className="h-24 mx-auto mb-2 object-contain" />
          <p className="text-white/50 text-sm mt-1">CRM — Accès équipe</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-white/20 bg-white/10 text-white rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-white/50 placeholder-white/30"
              placeholder="••••••••••"
              autoFocus
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black py-2.5 rounded-lg font-semibold hover:bg-white/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
