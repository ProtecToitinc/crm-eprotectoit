import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Motion, PageTransition } from './components/motion';
import Login from './components/Login';
import Layout from './components/Layout';
import { ThemeProvider } from './context/ThemeContext';
import { UIProvider } from './context/UIContext';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Pipeline from './pages/Pipeline';
import Calendrier from './pages/Calendrier';
import Carte from './pages/Carte';
import Soumissions from './pages/Soumissions';
import Facturation from './pages/Facturation';
import Notes from './pages/Notes';
import Appels from './pages/Appels';
import ARappeler from './pages/ARappeler';
import Opportunites from './pages/Opportunites';
import Integrations from './pages/Integrations';
import ATraiter from './pages/ATraiter';
import SuiviVentes from './pages/SuiviVentes';
import Chantiers from './pages/Chantiers';
import Publicites from './pages/Publicites';
import Parametres from './pages/Parametres';
import { api } from './api';

export default function App() {
  const location = useLocation();
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(() => { try { return localStorage.getItem('crm_user') || ''; } catch { return ''; } });
  const [welcomeFade, setWelcomeFade] = useState(false); // fondu d'entrée juste après la connexion

  const logout = async () => {
    try { await api.logout(); } catch { /* session déjà expirée */ }
    localStorage.removeItem('crm_token');
    setAuth(false);
  };

  useEffect(() => {
    const token = localStorage.getItem('crm_token');
    if (token) {
      api.verify(token).then(res => { setAuth(res?.ok ? true : false); if (res?.user) { setUser(res.user); localStorage.setItem('crm_user', res.user); } });
    } else {
      setAuth(false);
    }
  }, []);

  if (auth === null) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0b' }}>
      <div style={{ color: '#8f8a82', fontSize: 13.5, fontFamily: 'Manrope, sans-serif' }}>Chargement...</div>
    </div>
  );

  if (!auth) return <Login onLogin={name => { setUser(name); setWelcomeFade(true); setAuth(true); }} />;

  return (
    <Motion>
    <ThemeProvider>
      <UIProvider>
        <Layout user={user} onLogout={logout}>
          <PageTransition id={location.pathname.split('/')[1] || 'accueil'}>
          <Routes location={location}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/clients/:id" element={<ClientDetail />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/calendrier" element={<Calendrier />} />
            <Route path="/carte" element={<Carte />} />
            <Route path="/soumissions" element={<Soumissions />} />
            <Route path="/facturation" element={<Facturation />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/appels" element={<Appels />} />
            <Route path="/a-rappeler" element={<ARappeler />} />
            <Route path="/opportunites" element={<Opportunites user={user} />} />
            <Route path="/a-traiter" element={<ATraiter />} />
            <Route path="/suivi-soumissions" element={<SuiviVentes />} />
            <Route path="/chantiers" element={<Chantiers />} />
            <Route path="/publicites" element={<Publicites />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/parametres" element={<Parametres />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
          </PageTransition>
        </Layout>
        {welcomeFade && (
          <motion.div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#0a0a0b', pointerEvents: 'none' }}
            initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }}
            onAnimationComplete={() => setWelcomeFade(false)} />
        )}
      </UIProvider>
    </ThemeProvider>
    </Motion>
  );
}
