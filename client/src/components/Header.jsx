import React from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Sun, Moon, Plus, Menu, X } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useUI } from '../context/UIContext';
import { titleFor } from '../constants';

const ROUTE_SCREEN = {
  '/': 'dashboard',
  '/pipeline': 'pipeline',
  '/clients': 'clients',
  '/calendrier': 'calendar',
  '/soumissions': 'quotes',
  '/carte': 'map',
  '/facturation': 'billing'
};

export default function Header({ mobileOpen, onToggleMobile }) {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { search, setSearch, openModal } = useUI();
  const isClientDetail = /^\/clients\/.+/.test(location.pathname);
  const screen = ROUTE_SCREEN[location.pathname] || 'dashboard';
  const [title, subtitle] = isClientDetail ? ['Fiche client', 'Détails, dossiers et documents'] : titleFor(screen);
  const showSearch = screen === 'clients' && !isClientDetail;

  return (
    <header style={{
      height: 66, flex: 'none', display: 'flex', alignItems: 'center', gap: 16,
      padding: '0 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)'
    }}>
      <button onClick={onToggleMobile} className="md:hidden iconbtn" style={{
        width: 36, height: 36, border: '1px solid var(--border)', borderRadius: 9, background: 'var(--surface)',
        color: 'var(--fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
      }}>
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      <div style={{ minWidth: 0 }} className="hidden sm:block">
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-.01em', whiteSpace: 'nowrap' }}>{title}</h1>
        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</p>
      </div>

      <div style={{ flex: 1 }} />

      {showSearch && (
        <div style={{ position: 'relative', width: 200, maxWidth: '40vw' }} className="hidden xs:block">
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un client…"
            style={{
              width: '100%', height: 40, padding: '0 12px 0 36px', border: '1px solid var(--border)',
              borderRadius: 10, background: 'var(--surface-2)', color: 'var(--fg)', fontFamily: 'inherit', fontSize: 13.5
            }}
          />
        </div>
      )}

      <div className="hidden md:flex" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, gap: 2 }}>
        <button className="seg" data-active={theme === 'light' ? 'true' : 'false'} onClick={() => setTheme('light')} style={segStyle}>
          <Sun size={14} />Clair
        </button>
        <button className="seg" data-active={theme === 'dark' ? 'true' : 'false'} onClick={() => setTheme('dark')} style={segStyle}>
          <Moon size={14} />Sombre
        </button>
      </div>

      <button className="btn-accent" onClick={() => openModal(null)} style={{
        display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px', border: 'none',
        borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-fg)', fontFamily: 'inherit',
        fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap'
      }}>
        <Plus size={16} strokeWidth={2.4} />
        <span className="hidden sm:inline">Nouvelle soumission</span>
      </button>
    </header>
  );
}

const segStyle = {
  border: 'none', background: 'transparent', color: 'var(--fg-muted)', fontFamily: 'inherit',
  fontSize: 12.5, fontWeight: 700, padding: '6px 11px', borderRadius: 7, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 6
};
