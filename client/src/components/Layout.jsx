import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import Drawer from './Drawer';
import QuoteModal from './QuoteModal';
import CallModal from './CallModal';
import NoteModal from './NoteModal';
import Toast from './Toast';
import { useUI } from '../context/UIContext';

export default function Layout({ children, user, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { showToast } = useUI();
  // Après la connexion : rappel de la dernière connexion et des essais échoués depuis
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('crm_last_login'); if (!raw) return;
      sessionStorage.removeItem('crm_last_login');
      const d = JSON.parse(raw), when = new Date(String(d.at).replace(' ', 'T') + (/Z$/.test(d.at) ? '' : 'Z'));
      if (Number.isNaN(when.getTime())) return;
      showToast(`Dernière connexion : ${when.toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })}${d.meme ? '' : ' (autre appareil ou réseau)'}${d.echecs ? ` · ${d.echecs} essai${d.echecs > 1 ? 's' : ''} échoué${d.echecs > 1 ? 's' : ''} depuis` : ''}`);
    } catch { /* note facultative */ }
  }, [showToast]);

  return (
    <div className="crm-root" style={{ display: 'flex', minHeight: '100vh', fontSize: 14 }}>
      <div className="ambient" aria-hidden="true" />
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} user={user} onLogout={onLogout} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header mobileOpen={mobileOpen} onToggleMobile={() => setMobileOpen(o => !o)} />
        <main style={{ flex: 1, overflow: 'auto' }} className="p-4 pb-8 md:pt-[26px] md:px-[30px] md:pb-10">
          {children}
        </main>
      </div>

      <Drawer />
      <QuoteModal />
      <CallModal />
      <NoteModal />
      <Toast />
    </div>
  );
}
