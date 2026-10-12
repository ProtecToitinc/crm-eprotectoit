import React from 'react';
import { useUI } from '../context/UIContext';

export default function Toast() {
  const { toast } = useUI();
  if (!toast) return null;
  return (
    <div className="popin" style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 60, background: 'var(--sidebar-bg)', color: 'var(--sidebar-fg)',
      padding: '13px 18px', borderRadius: 11, boxShadow: '0 14px 34px rgba(0,0,0,.3)', fontSize: 13.5, fontWeight: 700,
      display: 'flex', alignItems: 'center', gap: 10
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
      {toast}
    </div>
  );
}
