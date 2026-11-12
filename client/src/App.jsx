import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Motion, PageTransition } from './components/motion';
import Login from './components/Login';
import Layout from './components/Layout';
import { ThemeProvider } from './context/ThemeContext';
import { UIProvider } from './context/UIContext';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Clients = lazy(() => import('./pages/Clients'));
const ClientDetail = lazy(() => import('./pages/ClientDetail'));
const Pipeline = lazy(() => import('./pages/Pipeline'));
const Calendrier = lazy(() => import('./pages/Calendrier'));
const Carte = lazy(() => import('./pages/Carte'));
const Soumissions = lazy(() => import('./pages/Soumissions'));
const Facturation = lazy(() => import('./pages/Facturation'));
const Notes = lazy(() => import('./pages/Notes'));
const Appels = lazy(() => import('./pages/Appels'));
const ARappeler = lazy(() => import('./pages/ARappeler'));
const Opportunites = lazy(() => import('./pages/Opportunites'));
const Integrations = lazy(() => import('./pages/Integrations'));
const ATraiter = lazy(() => import('./pages/ATraiter'));
const SuiviVentes = lazy(() => import('./pages/SuiviVentes'));
const Chantiers = lazy(() => import('./pages/Chantiers'));
const Publicites = lazy(() => import('./pages/Publicites'));
const Parametres = lazy(() => import('./pages/Parametres'));
const Seo = lazy(() => import('./pages/Seo'));
const Rapport = lazy(() => import('./pages/Rapport'));
const Signer = lazy(() => import('./pages/Signer'));
import { api } from './api';

const IDLE_MS = 60 * 60 * 1000; // verrouillage après 1 h sans activité
const PageLoading = () => <div role="status" aria-label="Chargement" style={{ display: 'grid', gap: 16 }}>{[90, 220, 140].map((h, i) => <div key={i} className="shimmer" style={{ height: h, borderRadius: 14 }} />)}</div>;

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

  // Verrouillage automatique : sans clic, touche ou défilement pendant 1 h, la session se ferme
  useEffect(() => {
    if (!auth) return undefined;
    let last = Date.now();
    const touch = () => { last = Date.now(); };
    const events = ['pointerdown', 'keydown', 'scroll', 'visibilitychange'];
    events.forEach(e => window.addEventListener(e, touch, { passive: true, capture: true }));
    const timer = setInterval(() => { if (Date.now() - last > IDLE_MS) { try { sessionStorage.setItem('crm_login_note', 'Session fermée après 1 heure sans activité.'); } catch { /* sans stockage */ } logout(); } }, 30000);
    return () => { clearInterval(timer); events.forEach(e => window.removeEventListener(e, touch, { capture: true })); };
  }, [auth]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Page publique de signature : ouverte par le client, sans compte
  if (location.pathname.startsWith('/signer/')) return <Suspense fallback={null}><Signer token={location.pathname.split('/')[2] || ''} /></Suspense>;

  if (!auth) return <Login onLogin={name => { setUser(name); setWelcomeFade(true); setAuth(true); }} />;

  return (
    <Motion>
    <ThemeProvider>
      <UIProvider>
        <Layout user={user} onLogout={logout}>
          <PageTransition id={location.pathname.split('/')[1] || 'accueil'}>
          <Suspense fallback={<PageLoading />}>
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
            <Route path="/seo" element={<Seo />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/parametres" element={<Parametres />} />
            <Route path="/rapport" element={<Rapport />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
          </Suspense>
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
