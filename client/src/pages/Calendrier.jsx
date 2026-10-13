import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Link2, Unlink, Plus, ExternalLink } from 'lucide-react';
import { useUI } from '../context/UIContext';
import { EVENT_TYPES, soft } from '../constants';
import { api } from '../api';
import { dateKey, todayKey, fmtDay } from '../lib/dates';
import { fullName } from '../lib/search';
import { useMedia } from '../lib/useMedia';
import { Modal, Field, ClientPicker, inputStyle, btnGhost, btnAccent, btnDanger, cardStyle, iconBtn } from '../components/ui';

const JOURS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

// Les clés de jour sont en heure locale (toISOString les décalerait d'un jour le soir)
function buildMonthGrid(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = (new Date(year, month, 1).getDay() + 6) % 7;
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  return Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - leading + 1;
    const date = new Date(year, month, dayNum);
    return { dayNum: date.getDate(), inMonth: dayNum >= 1 && dayNum <= daysInMonth, key: dateKey(date) };
  });
}

const chipStyle = meta => ({
  fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: soft(meta.hue), color: meta.hue,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', border: 'none', textAlign: 'left',
  fontFamily: 'inherit', cursor: 'pointer', width: '100%', flexShrink: 0
});

export default function Calendrier() {
  const today = todayKey();
  const compact = useMedia('(max-width: 640px)');
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [events, setEvents] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [google, setGoogle] = useState({ configured: false, connected: false, calendarSelected: false });
  const [calendars, setCalendars] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState(today);
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const { refreshKey, openRdvModal, showToast, bumpRefresh } = useUI();
  const pollRef = useRef(null);

  const cells = useMemo(() => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const firstKey = cells[0].key;
  const lastKey = cells[cells.length - 1].key;

  useEffect(() => {
    let off = false;
    api.evenements.list(firstKey, lastKey)
      .then(r => { if (!off) { setEvents(r || []); setLoadError(''); } })
      .catch(e => { if (!off) setLoadError(e.message || 'Impossible de charger le calendrier'); });
    return () => { off = true; };
  }, [firstKey, lastKey, refreshKey]);

  useEffect(() => {
    let off = false;
    api.google.status().then(s => { if (!off && s) setGoogle(s); }).catch(() => {});
    return () => { off = true; };
  }, [refreshKey]);

  useEffect(() => {
    if (!google.connected) { setCalendars([]); return undefined; }
    let off = false;
    api.google.calendars().then(l => { if (!off) setCalendars(Array.isArray(l) ? l : []); }).catch(() => {});
    return () => { off = true; };
  }, [google.connected, refreshKey]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const eventsByDay = useMemo(() => {
    const map = {};
    events.forEach(e => { (map[e.date_debut] = map[e.date_debut] || []).push(e); });
    return map;
  }, [events]);

  const goMonth = delta => setCursor(c => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  const goToday = () => {
    const n = new Date();
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
    setSelected(todayKey());
  };

  async function guarded(fn) {
    try { return await fn(); } catch (e) { showToast(e.message || 'Une erreur est survenue'); return undefined; }
  }

  const handleConnect = () => guarded(async () => {
    const { url } = await api.google.authUrl();
    const popup = window.open(url, 'google-auth', 'width=500,height=650');
    if (!popup) { showToast('Autorisez les fenêtres surgissantes pour connecter Google Calendar'); return; }
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      if (!popup.closed) return;
      clearInterval(pollRef.current);
      try {
        const status = await api.google.status();
        setGoogle(status);
        if (status.connected) showToast('Google Calendar connecté');
      } catch { /* on réessaiera au prochain rafraîchissement */ }
    }, 800);
  });

  const handleSync = () => guarded(async () => {
    setSyncing(true);
    try {
      const r = await api.google.sync();
      if (r?.ok) {
        showToast(`Synchronisé — ${r.imported} événement(s) importé(s)`);
        bumpRefresh();
      } else {
        showToast(r?.message || 'Erreur de synchronisation');
      }
    } finally {
      setSyncing(false);
    }
  });

  const handleDisconnect = () => guarded(async () => {
    if (!confirm('Déconnecter Google Calendar ?')) return;
    await api.google.disconnect();
    setGoogle({ configured: google.configured, connected: false, calendarSelected: false });
    showToast('Google Calendar déconnecté');
  });

  const refreshGoogle = async () => {
    setGoogle(await api.google.status());
    setCalendars(await api.google.calendars());
  };

  const handleSelectCalendar = calendarId => guarded(async () => {
    if (!calendarId) return;
    await api.google.setCalendar(calendarId);
    await refreshGoogle();
    showToast('Calendrier sélectionné');
  });

  const handleCreateCalendar = () => guarded(async () => {
    await api.google.createCalendar();
    await refreshGoogle();
    showToast('Calendrier « CRM ProtecToit » créé');
  });

  const selectedEvents = eventsByDay[selected] || [];
  const selectedLabel = fmtDay(selected, { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, ch => ch.toUpperCase());

  return (
    <div className="fadein">
      <div style={{ ...cardStyle, padding: '16px 18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap' }}>{MOIS[cursor.getMonth()]} {cursor.getFullYear()}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => goMonth(-1)} className="iconbtn" aria-label="Mois précédent" style={iconBtn}><ChevronLeft size={15} /></button>
              <button onClick={() => goMonth(1)} className="iconbtn" aria-label="Mois suivant" style={iconBtn}><ChevronRight size={15} /></button>
              <button onClick={goToday} className="btn-ghost" style={{ ...btnGhost, height: 32, padding: '0 12px', fontSize: 12.5, borderRadius: 8 }}>Aujourd’hui</button>
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

        {loadError && <div role="alert" style={{ marginBottom: 12, color: '#c4584f', fontSize: 13, fontWeight: 600 }}>{loadError}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: compact ? 4 : 6, marginBottom: 8 }}>
          {JOURS.map(j => <div key={j} style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-faint)', textAlign: 'center' }}>{compact ? j[0] : j}</div>)}
        </div>

        <div className="cal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: compact ? 4 : 6 }}>
          {cells.map(cell => {
            const isToday = cell.key === today;
            const isSelected = compact && cell.key === selected;
            const dayEvents = eventsByDay[cell.key] || [];
            const showAll = expanded === cell.key;
            const visible = showAll ? dayEvents : dayEvents.slice(0, 3);
            return (
              <div
                key={cell.key}
                onClick={() => {
                  if (compact) setSelected(cell.key);
                  else if (cell.inMonth) openRdvModal(null, cell.key);
                }}
                style={{
                  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 9,
                  padding: compact ? '5px 4px' : '7px 8px', minHeight: compact ? 54 : 90,
                  background: !cell.inMonth ? 'var(--surface-2)' : isToday ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface)',
                  display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden', minWidth: 0,
                  cursor: compact || cell.inMonth ? 'pointer' : 'default',
                  boxShadow: isSelected ? '0 0 0 1px var(--accent)' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: compact ? 'center' : 'space-between', fontSize: 12, fontWeight: 700, color: !cell.inMonth ? 'var(--fg-faint)' : isToday ? 'var(--accent)' : 'var(--fg)' }}>
                  <span>{cell.dayNum}</span>
                  {isToday && !compact && <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '.06em', color: 'var(--accent-fg)', background: 'var(--accent)', padding: '1px 5px', borderRadius: 5 }}>AUJ</span>}
                </div>

                {compact ? (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 3, flexWrap: 'wrap' }}>
                    {dayEvents.slice(0, 4).map(e => <span key={e.id} style={{ width: 6, height: 6, borderRadius: '50%', background: (EVENT_TYPES[e.type] || EVENT_TYPES.rdv).hue }} />)}
                  </div>
                ) : (
                  <>
                    {visible.map(e => (
                      <button key={e.id} type="button" title={`${e.heure ? e.heure + ' ' : ''}${e.titre}${fullName(e) ? ' — ' + fullName(e) : ''}`}
                        onClick={ev => { ev.stopPropagation(); setEditing(e); }}
                        style={chipStyle(EVENT_TYPES[e.type] || EVENT_TYPES.rdv)}>{e.heure ? `${e.heure} ` : ''}{e.titre}</button>
                    ))}
                    {dayEvents.length > 3 && (
                      <button type="button" onClick={ev => { ev.stopPropagation(); setExpanded(showAll ? null : cell.key); }}
                        style={{ border: 'none', background: 'transparent', padding: 0, textAlign: 'left', fontFamily: 'inherit', fontSize: 9.5, color: 'var(--fg-faint)', fontWeight: 700, cursor: 'pointer' }}>
                        {showAll ? 'Réduire' : `+${dayEvents.length - 3} autre(s)`}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {compact && (
        <div style={{ ...cardStyle, padding: 16, marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{selectedLabel}</div>
            <button className="btn-accent" onClick={() => openRdvModal(null, selected)} style={{ ...btnAccent, height: 34, fontSize: 12.5 }}><Plus size={13} />Ajouter</button>
          </div>
          {selectedEvents.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-faint)' }}>Rien de prévu ce jour-là</p>}
          {selectedEvents.map(e => {
            const meta = EVENT_TYPES[e.type] || EVENT_TYPES.rdv;
            return (
              <button key={e.id} type="button" onClick={() => setEditing(e)} className="row-hover" style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '9px 6px', border: 'none', borderTop: '1px solid var(--border)',
                background: 'transparent', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', color: 'var(--fg)'
              }}>
                <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 3, background: meta.hue, flexShrink: 0 }} />
                <span style={{ width: 44, fontSize: 12.5, fontWeight: 800, color: 'var(--fg-muted)', flexShrink: 0 }}>{e.heure || '—'}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{e.titre}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--fg-muted)' }}>{[fullName(e), e.ville].filter(Boolean).join(' · ') || meta.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {editing && <EventModal event={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EventModal({ event, onClose }) {
  const { openDeal, showToast, bumpRefresh } = useUI();
  const [form, setForm] = useState({
    titre: event.titre || '', type: event.type || 'rdv', date_debut: event.date_debut || '',
    heure: event.heure || '', client_id: event.client_id || ''
  });
  const [clients, setClients] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.clients.list().then(r => setClients(r || [])).catch(() => {});
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    if (!form.titre.trim()) return setError('Le titre est requis');
    if (!form.date_debut) return setError('La date est requise');
    setSaving(true);
    try {
      await api.evenements.update(event.id, {
        titre: form.titre.trim(), type: form.type, date_debut: form.date_debut,
        heure: form.heure || null, client_id: form.client_id || null
      });
      bumpRefresh();
      showToast('Rendez-vous modifié');
      onClose();
    } catch (ex) {
      setError(ex.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Supprimer « ${event.titre} » ?`)) return;
    setSaving(true);
    try {
      await api.evenements.delete(event.id);
      bumpRefresh();
      showToast('Rendez-vous supprimé');
      onClose();
    } catch (ex) {
      setError(ex.message || 'Erreur');
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Modifier le rendez-vous"
      onClose={onClose}
      onSubmit={handleSave}
      width={480}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={handleDelete} disabled={saving} style={{ ...btnDanger, marginRight: 'auto' }}>Supprimer</button>
          <button type="button" className="btn-ghost" onClick={onClose} style={btnGhost}>Annuler</button>
          <button type="submit" className="btn-accent" disabled={saving} style={{ ...btnAccent, opacity: saving ? .6 : 1 }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      }
    >
      <Field label="Titre"><input autoFocus value={form.titre} onChange={e => set('titre', e.target.value)} style={inputStyle} /></Field>
      <Field label="Type">
        <select value={form.type} onChange={e => set('type', e.target.value)} style={inputStyle}>
          {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 13 }}>
        <Field label="Date"><input type="date" value={form.date_debut} onChange={e => set('date_debut', e.target.value)} style={inputStyle} /></Field>
        <Field label="Heure"><input type="time" value={form.heure} onChange={e => set('heure', e.target.value)} style={inputStyle} /></Field>
      </div>
      <Field label="Client (facultatif)">
        <ClientPicker clients={clients} value={form.client_id} onChange={id => set('client_id', id)} />
      </Field>
      {form.client_id && (
        <button type="button" className="linkbtn" onClick={() => { onClose(); openDeal(form.client_id); }} style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer' }}>
          <ExternalLink size={13} />Ouvrir le dossier du client
        </button>
      )}
      {event.type === 'relance' && (
        <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>Ce rendez-vous peut venir d’un rappel d’appel : modifier la date ici ne change pas l’appel.</div>
      )}
      {error && <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: '#c4584f', background: soft('#c4584f'), borderRadius: 9, padding: '9px 12px' }}>{error}</div>}
    </Modal>
  );
}

function GoogleControl({ google, calendars, syncing, onConnect, onSync, onDisconnect, onSelectCalendar, onCreateCalendar }) {
  if (!google.configured) {
    return <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>Google Calendar non configuré</span>;
  }
  if (!google.connected) {
    return (
      <button onClick={onConnect} className="btn-ghost" style={{ ...btnGhost, height: 34, padding: '0 13px', fontSize: 12.5, borderRadius: 9 }}>
        <Link2 size={13} />Connecter Google Calendar
      </button>
    );
  }

  const selectStyle = {
    height: 34, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--surface)',
    color: 'var(--fg)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', maxWidth: 200
  };
  const small = { ...btnGhost, height: 34, padding: '0 13px', fontSize: 12.5, borderRadius: 9 };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <select aria-label="Calendrier Google" value={calendars.find(c => c.selected)?.id || ''} onChange={e => onSelectCalendar(e.target.value)} style={selectStyle}>
        <option value="" disabled>Choisir un calendrier…</option>
        {calendars.map(c => <option key={c.id} value={c.id}>{c.name}{c.primary ? ' (principal)' : ''}</option>)}
      </select>
      {calendars.length === 0 && (
        <button onClick={onCreateCalendar} className="btn-ghost" style={small}>Créer un calendrier CRM</button>
      )}
      <button onClick={onSync} disabled={syncing || !google.calendarSelected} className="btn-ghost" style={{ ...small, opacity: (syncing || !google.calendarSelected) ? .5 : 1 }}>
        <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />{syncing ? 'Synchronisation…' : 'Synchroniser'}
      </button>
      <button onClick={onDisconnect} title="Déconnecter Google Calendar" aria-label="Déconnecter Google Calendar" className="iconbtn" style={iconBtn}><Unlink size={14} /></button>
    </div>
  );
}
