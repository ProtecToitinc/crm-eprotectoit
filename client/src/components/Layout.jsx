import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import Drawer from './Drawer';
import QuoteModal from './QuoteModal';
import Toast from './Toast';

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="crm-root" style={{ display: 'flex', minHeight: '100vh', background: 'var(--app-bg)', fontSize: 14 }}>
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header mobileOpen={mobileOpen} onToggleMobile={() => setMobileOpen(o => !o)} />
        <main style={{ flex: 1, overflow: 'auto' }} className="p-4 pb-8 md:pt-[26px] md:px-[30px] md:pb-10">
          {children}
        </main>
      </div>

      <Drawer />
      <QuoteModal />
      <Toast />
    </div>
  );
}
