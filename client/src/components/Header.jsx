import React from 'react';
import { useLocation } from 'react-router-dom';
import { Sun, Moon, Plus, Menu, X, Phone } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useUI } from '../context/UIContext';
import { titleFor } from '../constants';
import GlobalSearch from './GlobalSearch';

const ROUTE_SCREEN = {
  '/': 'dashboard',
  '/pipeline': 'pipeline',
  '/clients': 'clients',
  '/calendrier': 'calendar',
  '/soumissions': 'quotes',
  '/carte': 'map',
  '/facturation': 'billing',
  '/notes': 'notes',
  '/appels': 'calls',
  '/opportunites': 'leads',
  '/integrations': 'integrations'
};

export default function Header({ mobileOpen, onToggleMobile }) {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { openModal, openCallModal } = useUI();
  const isClientDetail = /^\/clients\/.+/.test(location.pathname);
  const screen = ROUTE_SCREEN[location.pathname] || 'dashboard';
  const [title, subtitle] = isClientDetail ? ['Fiche client', 'Détails, dossiers et documents'] : titleFor(screen);

  return (
    <header style={{
      height: 66, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 31,
      padding: '0 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)'
    }}>
      <button onClick={onToggleMobile} aria-label="Menu" className="flex md:hidden iconbtn" style={{
        width: 36, height: 36, border: '1px solid var(--border)', borderRadius: 9, background: 'var(--surface)',
        color: 'var(--fg)', alignItems: 'center', justifyContent: 'center', flexShrink: 0
      }}>
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      <div style={{ minWidth: 0, flex: '0 1 auto' }} className="block md:hidden xl:block">
        <h1 style={{ margin: 0, fontSize: 'clamp(14px, 4vw, 18px)', fontWeight: 800, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
        <p className="hidden xl:block" style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</p>
      </div>

      <div style={{ flex: 1 }} />

      <GlobalSearch />

      <div className="hidden md:flex" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, gap: 2, flexShrink: 0 }}>
        <button className="seg" aria-label="Thème clair" title="Clair" data-active={theme === 'light' ? 'true' : 'false'} onClick={() => setTheme('light')} style={segStyle}>
          <Sun size={14} /><span className="hidden xl:inline">Clair</span>
        </button>
        <button className="seg" aria-label="Thème sombre" title="Sombre" data-active={theme === 'dark' ? 'true' : 'false'} onClick={() => setTheme('dark')} style={segStyle}>
          <Moon size={14} /><span className="hidden xl:inline">Sombre</span>
        </button>
      </div>

      <button className="btn-ghost" onClick={() => openCallModal()} title="Enregistrer un appel" aria-label="Enregistrer un appel" style={{
        display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', border: '1px solid var(--border)',
        borderRadius: 10, background: 'var(--surface)', color: 'var(--fg)', fontFamily: 'inherit',
        fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0
      }}>
        <Phone size={16} />
        <span className="hidden xl:inline">Appel</span>
      </button>

      <button className="btn-accent" onClick={() => openModal(null)} title="Nouvelle soumission" aria-label="Nouvelle soumission" style={{
        display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 14px', border: 'none',
        borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-fg)', fontFamily: 'inherit',
        fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0
      }}>
        <Plus size={16} strokeWidth={2.4} />
        <span className="hidden lg:inline">Nouvelle soumission</span>
      </button>
    </header>
  );
}

const segStyle = {
  border: 'none', background: 'transparent', color: 'var(--fg-muted)', fontFamily: 'inherit',
  fontSize: 12.5, fontWeight: 700, padding: '6px 10px', borderRadius: 7, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 6
};
