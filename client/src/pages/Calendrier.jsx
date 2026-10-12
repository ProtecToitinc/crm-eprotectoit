import React, { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Link2, Unlink } from 'lucide-react';
import { useUI } from '../context/UIContext';
import { EVENT_TYPES, soft } from '../constants';
import { api } from '../api';

const JOURS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - leading + 1;
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
    const date = new Date(year, month, dayNum);
    cells.push({ date, dayNum: date.getDate(), inMonth, key: date.toISOString().slice(0, 10) });
  }
  return cells;
}

export default function Calendrier() {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState([]);
  const [google, setGoogle] = useState({ configured: false, connected: false, calendarSelected: false });
  const [calendars, setCalendars] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const { refreshKey, openDeal, openRdvModal, showToast, bumpRefresh } = useUI();

  const todayKey = today.toISOString().slice(0, 10);
  const cells = buildMonthGrid(cursor.getFullYear(), cursor.getMonth());

  const load = useCallback(() => {
    const debut = cells[0].key;
    const fin = cells[cells.length - 1].key;
    api.evenements.list(debut, fin).then(r => setEvents(r || []));
  }, [cursor]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { api.google.status().then(setGoogle); }, [refreshKey]);
  useEffect(() => {
    if (google.connected) api.google.calendars().then(setCalendars);
  }, [google.connected, refreshKey]);

  function prevMonth() { setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1)); }
  function nextMonth() { setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1)); }

  async function handleConnect() {
    const { url } = await api.google.authUrl();
    const popup = window.open(url, 'google-auth', 'width=500,height=650');
    const interval = setInterval(async () => {
      if (popup.closed) {
        clearInterval(interval);
        const status = await api.google.status();
        setGoogle(status);
        if (status.connected) showToast('Google Calendar connecté');
      }
    }, 800);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await api.google.sync();
      if (r.ok) {
        showToast(`Synchronisé — ${r.imported} événement(s) importé(s)`);
        bumpRefresh();
      } else {
        showToast(r.message || 'Erreur de synchronisation');
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    await api.google.disconnect();
    setGoogle({ configured: google.configured, connected: false, calendarSelected: false });
    showToast('Google Calendar déconnecté');
  }

  async function handleSelectCalendar(calendarId) {
    if (!calendarId) return;
    await api.google.setCalendar(calendarId);
    const status = await api.google.status();
    setGoogle(status);
    const list = await api.google.calendars();
    setCalendars(list);
    showToast('Calendrier sélectionné');
  }

  async function handleCreateCalendar() {
    await api.google.createCalendar();
    const status = await api.google.status();
    setGoogle(status);
    const list = await api.google.calendars();
    setCalendars(list);
    showToast('Calendrier « CRM ProtecToit » créé');
  }

  const eventsByDay = {};
  events.forEach(e => {
    (eventsByDay[e.date_debut] = eventsByDay[e.date_debut] || []).push(e);
  });

  return (
    <div className="fadein">
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: '16px 18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap' }}>{MOIS[cursor.getMonth()]} {cursor.getFullYear()}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={prevMonth} className="iconbtn" style={iconBtnStyle}><ChevronLeft size={15} /></button>
              <button onClick={nextMonth} className="iconbtn" style={iconBtnStyle}><ChevronRight size={15} /></button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11.5, fontWeight: 600, color: 'var(--fg-muted)', flexWrap: 'wrap' }}>
            {Object.entries(EVENT_TYPES).map(([k, v]) => (
              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: v.hue }} />{v.label}
              </span>
            ))}
          </div>

          <GoogleControl
            google={google} calendars={calendars} syncing={syncing}
            onConnect={handleConnect} onSync={handleSync} onDisconnect={handleDisconnect}
            onSelectCalendar={handleSelectCalendar} onCreateCalendar={handleCreateCalendar}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 8 }}>
          {JOURS.map(j => <div key={j} style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-faint)', textAlign: 'center' }}>{j}</div>)}
        </div>

        <div className="cal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
          {cells.map(cell => {
            const isToday = cell.key === todayKey;
            const dayEvents = eventsByDay[cell.key] || [];
            return (
              <div
                key={cell.key}
                onClick={() => cell.inMonth && openRdvModal(null, cell.key)}
                style={{
                  border: '1px solid var(--border)', borderRadius: 9, padding: '7px 8px', minHeight: 90,
                  background: !cell.inMonth ? 'var(--surface-2)' : isToday ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface)',
                  display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden', cursor: cell.inMonth ? 'pointer' : 'default'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: !cell.inMonth ? 'var(--fg-faint)' : isToday ? 'var(--accent)' : 'var(--fg)' }}>
                  <span>{cell.dayNum}</span>
                  {isToday && <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '.06em', color: 'var(--accent-fg)', background: 'var(--accent)', padding: '1px 5px', borderRadius: 5 }}>AUJ</span>}
                </div>
                {dayEvents.slice(0, 3).map(e => {
                  const meta = EVENT_TYPES[e.type] || EVENT_TYPES.rdv;
                  return (
                    <div
                      key={e.id}
                      onClick={ev => { ev.stopPropagation(); if (e.client_id) openDeal(e.client_id); }}
                      style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: soft(meta.hue), color: meta.hue,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      }}
                    >{e.heure ? `${e.heure} ` : ''}{e.titre}</div>
                  );
                })}
                {dayEvents.length > 3 && <div style={{ fontSize: 9.5, color: 'var(--fg-faint)', fontWeight: 700 }}>+{dayEvents.length - 3} autre(s)</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const iconBtnStyle = { width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', color: 'var(--fg)', display: 'flex', alignItems: 'center', justifyContent: 'center' };

function GoogleControl({ google, calendars, syncing, onConnect, onSync, onDisconnect, onSelectCalendar, onCreateCalendar }) {
  if (!google.configured) {
    return <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>Google Calendar non configuré</span>;
  }
  if (!google.connected) {
    return (
      <button onClick={onConnect} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--surface)', color: 'var(--fg)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
        <Link2 size={13} />Connecter Google Calendar
      </button>
    );
  }

  const selectStyle = {
    height: 34, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--surface)',
    color: 'var(--fg)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', maxWidth: 200
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <select value={calendars.find(c => c.selected)?.id || ''} onChange={e => onSelectCalendar(e.target.value)} style={selectStyle}>
        <option value="" disabled>Choisir un calendrier…</option>
        {calendars.map(c => <option key={c.id} value={c.id}>{c.name}{c.primary ? ' (principal)' : ''}</option>)}
      </select>
      {calendars.length === 0 && (
        <button onClick={onCreateCalendar} className="btn-ghost" style={{ height: 34, padding: '0 13px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--surface)', color: 'var(--fg)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          Créer un calendrier CRM
        </button>
      )}
      <button onClick={onSync} disabled={syncing || !google.calendarSelected} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--surface)', color: 'var(--fg)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: (syncing || !google.calendarSelected) ? .5 : 1 }}>
        <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />{syncing ? 'Synchronisation...' : 'Synchroniser'}
      </button>
      <button onClick={onDisconnect} title="Déconnecter Google Calendar" className="iconbtn" style={iconBtnStyle}><Unlink size={14} /></button>
    </div>
  );
}
