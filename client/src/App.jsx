import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Pipeline from './pages/Pipeline';
import Taches from './pages/Taches';
import { api } from './api';

export default function App() {
  const [auth, setAuth] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('crm_token');
    if (token) {
      api.verify(token).then(res => setAuth(res?.ok ? true : false));
    } else {
      setAuth(false);
    }
  }, []);

  if (auth === null) return (
    <div className="min-h-screen bg-blue-900 flex items-center justify-center">
      <div className="text-blue-300 text-sm">Chargement...</div>
    </div>
  );

  if (!auth) return <Login onLogin={() => setAuth(true)} />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/taches" element={<Taches />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
