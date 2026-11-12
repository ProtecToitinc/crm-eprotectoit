import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import Drawer from './Drawer';
import QuoteModal from './QuoteModal';
import CallModal from './CallModal';
import NoteModal from './NoteModal';
import Toast from './Toast';

export default function Layout({ children, user, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Lueur dorée qui suit le curseur sur les cartes
  useEffect(() => {
    const onMove = e => { const el = e.target.closest?.('.spot, main article'); if (!el) return; const r = el.getBoundingClientRect(); el.style.setProperty('--mx', (e.clientX - r.left) + 'px'); el.style.setProperty('--my', (e.clientY - r.top) + 'px'); };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => document.removeEventListener('pointermove', onMove);
  }, []);

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
