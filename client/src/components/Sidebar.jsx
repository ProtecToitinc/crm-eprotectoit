import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutGrid, BarChart3, Calendar, MapPin, Users, FileText, Receipt, Phone, StickyNote } from 'lucide-react';

const PRINCIPAL = [
  { to: '/', icon: LayoutGrid, label: 'Tableau de bord', end: true },
  { to: '/pipeline', icon: BarChart3, label: 'Pipeline' },
  { to: '/calendrier', icon: Calendar, label: 'Calendrier' },
  { to: '/carte', icon: MapPin, label: 'Carte des projets' }
];

const GESTION = [
  { to: '/clients', icon: Users, label: 'Clients' },
  { to: '/appels', icon: Phone, label: 'Appels' },
  { to: '/notes', icon: StickyNote, label: 'Notes' },
  { to: '/soumissions', icon: FileText, label: 'Soumissions' },
  { to: '/facturation', icon: Receipt, label: 'Facturation' }
];

function NavGroup({ title, items, onItemClick }) {
  return (
    <>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: 'var(--sidebar-muted)', padding: '4px 12px 6px' }}>
        {title}
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onItemClick} style={{ textDecoration: 'none' }}>
            {({ isActive }) => (
              <span
                className="nav-item"
                data-active={isActive ? 'true' : 'false'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '10px 12px', borderRadius: 9, fontSize: 13.5, fontWeight: 600,
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'var(--accent-fg)' : 'var(--sidebar-muted)', cursor: 'pointer'
                }}
              >
                <Icon size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                <span>{label}</span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

export default function Sidebar({ mobileOpen, onCloseMobile }) {
  return (
    <>
      <aside
        className="hidden md:flex"
        style={{
          width: 250, flex: 'none', background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--sidebar-border)', flexDirection: 'column',
          padding: '22px 16px 16px', gap: 6, position: 'sticky', top: 0, height: '100vh',
          overflowY: 'auto'
        }}
      >
        <div style={{ padding: '2px 8px 22px' }}>
          <img src="/logo-white.png" alt="PROTECTOIT" style={{ width: 152, height: 'auto', display: 'block', objectFit: 'contain' }} />
        </div>
        <NavGroup title="PRINCIPAL" items={PRINCIPAL} />
        <div style={{ height: 10 }} />
        <NavGroup title="GESTION" items={GESTION} />
        <div style={{
          marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 11,
          padding: '12px 8px 4px', borderTop: '1px solid var(--sidebar-border)'
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-fg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12.5, flexShrink: 0
          }}>MC</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sidebar-fg)' }}>Mathys Caron</div>
            <div style={{ fontSize: 11, color: 'var(--sidebar-muted)' }}>Propriétaire · RBQ</div>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30" style={{ background: 'var(--sidebar-bg)', paddingTop: 66, overflowY: 'auto' }}>
          <div style={{ padding: 16 }}>
            <NavGroup title="PRINCIPAL" items={PRINCIPAL} onItemClick={onCloseMobile} />
            <div style={{ height: 10 }} />
            <NavGroup title="GESTION" items={GESTION} onItemClick={onCloseMobile} />
          </div>
        </div>
      )}
    </>
  );
}
