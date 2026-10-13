import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutGrid, BarChart3, Calendar, MapPin, Users, FileText, Receipt, Phone, StickyNote, Target, PlugZap, BellRing, HardHat, TrendingUp, Megaphone, ShieldCheck, LogOut } from 'lucide-react';
import { api } from '../api';

const PRINCIPAL = [
  { to: '/', icon: LayoutGrid, label: 'Tableau de bord', end: true },
  { to: '/a-traiter', icon: BellRing, label: 'À traiter', badge: 'attention' },
  { to: '/opportunites', icon: Target, label: 'Opportunités', badge: 'leads' },
  { to: '/pipeline', icon: BarChart3, label: 'Pipeline' },
  { to: '/calendrier', icon: Calendar, label: 'Calendrier' },
  { to: '/carte', icon: MapPin, label: 'Carte des projets' }
];

const GESTION = [
  { to: '/clients', icon: Users, label: 'Clients' },
  { to: '/appels', icon: Phone, label: 'Appels' },
  { to: '/notes', icon: StickyNote, label: 'Notes' },
  { to: '/soumissions', icon: FileText, label: 'Soumissions' },
  { to: '/suivi-soumissions', icon: TrendingUp, label: 'Suivi des ventes' },
  { to: '/chantiers', icon: HardHat, label: 'Chantiers' },
  { to: '/facturation', icon: Receipt, label: 'Facturation' },
  { to: '/publicites', icon: Megaphone, label: 'Publicités Meta' },
  { to: '/integrations', icon: PlugZap, label: 'Intégrations', badge: 'health' },
  { to: '/parametres', icon: ShieldCheck, label: 'Sécurité et sauvegardes' }
];

// Pastilles : à traiter, nouveaux leads non vus, problème d'intégration
function useBadges() {
  const [badges, setBadges] = useState({});
  useEffect(() => {
    let off = false;
    const load = async () => {
      try {
        const [a, l, h] = await Promise.all([api.attention(), api.leads.count(), api.health()]);
        if (!off) setBadges({ attention: a?.total || 0, leads: l?.count || 0, health: h?.problems?.filter(p => p.level === 'erreur').length || 0 });
      } catch { /* silencieux : les pastilles ne sont qu'un confort */ }
    };
    load();
    const t = setInterval(load, 60000);
    const refresh = () => load();
    window.addEventListener('crm-refresh-badges', refresh);
    return () => { off = true; clearInterval(t); window.removeEventListener('crm-refresh-badges', refresh); };
  }, []);
  return badges;
}

function NavGroup({ title, items, onItemClick, badges }) {
  return (
    <>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: 'var(--sidebar-muted)', padding: '4px 12px 6px' }}>
        {title}
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map(({ to, icon: Icon, label, end, badge }) => {
          const n = badge ? badges[badge] : 0;
          return (
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
                  <span style={{ flex: 1 }}>{label}</span>
                  {n > 0 && (
                    <span aria-label={`${n} à voir`} style={{
                      minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10, fontSize: 11, fontWeight: 800,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: isActive ? 'var(--accent-fg)' : badge === 'health' ? '#c4584f' : 'var(--accent)',
                      color: isActive ? 'var(--accent)' : '#fff'
                    }}>{n > 99 ? '99+' : n}</span>
                  )}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}

function UserBlock({ user, onLogout }) {
  const initials = (user || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 11,
      padding: '12px 8px 4px', borderTop: '1px solid var(--sidebar-border)'
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-fg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12.5, flexShrink: 0
      }}>{initials}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sidebar-fg)' }}>{user || 'Utilisateur'}</div>
        <div style={{ fontSize: 11, color: 'var(--sidebar-muted)' }}>Connecté</div>
      </div>
      <button onClick={onLogout} title="Se déconnecter" aria-label="Se déconnecter" style={{
        border: '1px solid var(--sidebar-border)', background: 'transparent', color: 'var(--sidebar-muted)',
        borderRadius: 8, width: 34, height: 34, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
      }}><LogOut size={15} /></button>
    </div>
  );
}

export default function Sidebar({ mobileOpen, onCloseMobile, user, onLogout }) {
  const badges = useBadges();
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
        <NavGroup title="PRINCIPAL" items={PRINCIPAL} badges={badges} />
        <div style={{ height: 10 }} />
        <NavGroup title="GESTION" items={GESTION} badges={badges} />
        <UserBlock user={user} onLogout={onLogout} />
      </aside>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30" style={{ background: 'var(--sidebar-bg)', paddingTop: 66, overflowY: 'auto' }}>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
            <NavGroup title="PRINCIPAL" items={PRINCIPAL} onItemClick={onCloseMobile} badges={badges} />
            <div style={{ height: 10 }} />
            <NavGroup title="GESTION" items={GESTION} onItemClick={onCloseMobile} badges={badges} />
            <div style={{ height: 18 }} />
            <UserBlock user={user} onLogout={onLogout} />
          </div>
        </div>
      )}
    </>
  );
}
