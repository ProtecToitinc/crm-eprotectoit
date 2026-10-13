import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, UserPlus, ArrowUpDown, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed } from 'lucide-react';
import { soft, initials, avatarColor, CALL_DIRECTIONS } from '../constants';
import { matchClient, fullName } from '../lib/search';

export const inputStyle = {
  width: '100%', height: 42, padding: '0 13px', border: '1px solid var(--border)', borderRadius: 10,
  background: 'var(--surface-2)', color: 'var(--fg)', fontFamily: 'inherit', fontSize: 13.5
};
export const textareaStyle = { ...inputStyle, height: 'auto', padding: '10px 13px', resize: 'vertical', lineHeight: 1.45 };
export const labelStyle = { fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', marginBottom: 6 };
export const btnGhost = {
  height: 40, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)',
  color: 'var(--fg)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, whiteSpace: 'nowrap'
};
export const btnAccent = { ...btnGhost, border: 'none', background: 'var(--accent)', color: 'var(--accent-fg)' };
export const btnDanger = { ...btnGhost, color: '#c4584f' };
export const iconBtn = {
  width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)',
  cursor: 'pointer', color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
};
export const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)' };

export function Field({ label, children, style }) {
  return (
    <div style={style}>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

// Menu « Trier par » (alphabétique, plus récent, plus ancien…) ; options = [{ value, label }]
export function SortSelect({ value, onChange, options, style }) {
  return (
    <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0, ...style }}>
      <ArrowUpDown size={14} style={{ position: 'absolute', left: 11, color: 'var(--fg-faint)', pointerEvents: 'none' }} />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label="Trier par"
        style={{ ...inputStyle, width: 'auto', height: 38, paddingLeft: 32, paddingRight: 10, cursor: 'pointer', fontWeight: 600 }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Avatar({ client, size = 32 }) {
  const ah = avatarColor(client?.id);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: soft(ah), color: ah, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.34), fontWeight: 800
    }}>{initials(client?.prenom, client?.nom) || '?'}</div>
  );
}

const DIRECTION_ICON = { entrant: PhoneIncoming, sortant: PhoneOutgoing, manque: PhoneMissed };

export function DirectionIcon({ direction, size = 14 }) {
  const Icon = DIRECTION_ICON[direction] || Phone;
  return <Icon size={size} />;
}

// Pastille colorée « reçu / fait / manqué »
export function DirectionChip({ direction, size = 32 }) {
  const hue = CALL_DIRECTIONS[direction]?.hue || '#9aa0a6';
  return (
    <div title={CALL_DIRECTIONS[direction]?.label} style={{
      width: size, height: size, borderRadius: Math.round(size * 0.3), background: soft(hue), color: hue,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
    }}><DirectionIcon direction={direction} size={Math.round(size * 0.48)} /></div>
  );
}

// Fenêtre modale : fond cliquable, Échap pour fermer, pied de page optionnel, <form> si onSubmit
export function Modal({ title, onClose, children, footer, onSubmit, width = 520 }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const Wrap = onSubmit ? 'form' : 'div';
  return (
    <div className="fadein" onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(10,8,6,.5)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div className="popin" onClick={e => e.stopPropagation()} style={{
        width, maxWidth: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
        boxShadow: '0 30px 80px rgba(0,0,0,.35)', overflow: 'hidden'
      }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Fermer" style={iconBtn}><X size={14} /></button>
        </div>
        <Wrap onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 15, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {children}
          </div>
          {footer && (
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              {footer}
            </div>
          )}
        </Wrap>
      </div>
    </div>
  );
}

// Choix d'un client par recherche (liste affichée sous le champ, sans menu flottant qui serait coupé)
export function ClientPicker({ clients, value, onChange, autoFocus, onNew }) {
  const [q, setQ] = useState('');
  const selected = clients.find(c => String(c.id) === String(value));
  const matches = useMemo(() => clients.filter(c => matchClient(c, q)), [clients, q]);

  if (selected) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)' }}>
        <Avatar client={selected} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName(selected)}</div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{[selected.telephone, selected.ville].filter(Boolean).join(' · ') || '—'}</div>
        </div>
        {onChange && <button type="button" className="linkbtn" onClick={() => { onChange(''); setQ(''); }} style={{ border: 'none', background: 'transparent', color: 'var(--fg-muted)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Changer</button>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)' }} />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (matches[0]) onChange(matches[0].id); } }}
          placeholder="Chercher par nom, téléphone, ville…"
          style={{ ...inputStyle, paddingLeft: 36 }}
        />
      </div>
      <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
        <div style={{ maxHeight: 264, overflowY: 'auto' }}>
        {matches.map(c => (
          <div key={c.id} className="row-hover" onClick={() => onChange(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
            <Avatar client={c} size={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName(c)}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[c.telephone, c.ville].filter(Boolean).join(' · ') || '—'}</div>
            </div>
          </div>
        ))}
        {matches.length === 0 && <div style={{ padding: '12px', fontSize: 13, color: 'var(--fg-faint)', borderBottom: onNew ? '1px solid var(--border)' : 'none' }}>Aucun client trouvé</div>}
        </div>
        <div style={{ padding: '6px 12px', fontSize: 11.5, color: 'var(--fg-faint)', borderTop: '1px solid var(--border)' }}>{matches.length} client{matches.length > 1 ? 's' : ''} sur {clients.length} — fais défiler ou tape pour chercher</div>
        {onNew && (
          <div className="row-hover" onClick={() => onNew(q)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
            <UserPlus size={15} />Nouveau client{q.trim() ? ` « ${q.trim()} »` : ''}
          </div>
        )}
      </div>
    </div>
  );
}
