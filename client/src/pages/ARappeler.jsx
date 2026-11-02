import React, { useEffect, useMemo, useState } from 'react';
import { Phone, PhoneOff, Check } from 'lucide-react';
import { api } from '../api';
import { useUI } from '../context/UIContext';
import { soft } from '../constants';
import { fullName, telHref } from '../lib/search';
import { todayKey, addDays, nowTime, daysFromToday, fmtDay, relativeDay } from '../lib/dates';
import { Avatar, iconBtn, cardStyle } from '../components/ui';

const MAX_ESSAIS = 3;
const stamp = a => `${a.date_appel || ''} ${a.heure || '00:00'}`;
const pending = a => !!a.a_rappeler && !a.rappel_fait;
// Délai avant le prochain essai : lendemain, puis 2 jours
const DELAI = { 1: 1, 2: 2 };

// Une fiche par client : nombre d’essais « sans réponse » depuis le dernier contact réel (appel reçu ou fait)
function buildRows(calls) {
  const byClient = new Map();
  for (const a of calls) {
    if (!byClient.has(a.client_id)) byClient.set(a.client_id, []);
    byClient.get(a.client_id).push(a);
  }
  const rows = [];
  for (const [id, list] of byClient) {
    list.sort((x, y) => stamp(y).localeCompare(stamp(x)));
    let essais = 0;
    let contactIdx = list.findIndex(a => a.direction === 'entrant' || a.direction === 'sortant');
    if (contactIdx < 0) contactIdx = list.length;
    for (const a of list.slice(0, contactIdx)) if (a.direction === 'sans_reponse') essais += 1;
    // Un rappel d’essai devient caduc quand le client a été joint depuis
    const rappels = list.filter((a, i) => pending(a) && (a.direction !== 'sans_reponse' || i < contactIdx));
    if (!essais && !rappels.length) continue;
    const next = rappels.map(r => r.rappel_date).filter(Boolean).sort()[0] || null;
    const c = list[0];
    rows.push({ id, prenom: c.prenom, nom: c.nom, telephone: c.telephone, ville: c.ville, essais, rappels, next, last: stamp(list[0]) });
  }
  // En retard d’abord, puis le rappel le plus proche, puis les sans date
  rows.sort((a, b) => (a.next || '9999').localeCompare(b.next || '9999') || b.essais - a.essais);
  return rows;
}

export default function ARappeler() {
  const { refreshKey, bumpRefresh, showToast, openDeal } = useUI();
  const [calls, setCalls] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let off = false;
    api.appels.list()
      .then(r => { if (!off) { setCalls(r || []); setError(''); } })
      .catch(e => { if (!off) { setError(e.message || 'Impossible de charger les appels'); setCalls([]); } });
    return () => { off = true; };
  }, [refreshKey]);

  const rows = useMemo(() => buildRows(calls || []), [calls]);

  async function closePending(row) {
    await Promise.all(row.rappels.map(r => api.appels.update(r.id, { rappel_fait: 1 })));
  }

  async function noAnswer(row) {
    const essai = row.essais + 1;
    setBusy(row.id);
    try {
      await closePending(row);
      const delai = DELAI[essai];
      await api.appels.create({
        client_id: row.id, direction: 'sans_reponse', date_appel: todayKey(), heure: nowTime(),
        sujet: `Essai ${essai}/${MAX_ESSAIS} — pas de réponse`,
        a_rappeler: delai ? 1 : 0, rappel_date: delai ? addDays(todayKey(), delai) : '', rappel_heure: delai ? '10:00' : ''
      });
      bumpRefresh();
      showToast(delai ? `Essai ${essai}/${MAX_ESSAIS} noté — rappel ${relativeDay(addDays(todayKey(), delai)).toLowerCase()}` : `Essai ${essai}/${MAX_ESSAIS} noté — dernier essai, passez par courriel ou message`);
    } catch (e) { showToast(e.message || 'Impossible d’enregistrer l’essai'); }
    setBusy(null);
  }

  async function reached(row) {
    setBusy(row.id);
    try {
      await closePending(row);
      await api.appels.create({
        client_id: row.id, direction: 'sortant', date_appel: todayKey(), heure: nowTime(),
        sujet: row.essais ? `Client joint à l’essai ${row.essais + 1}` : 'Client joint', a_rappeler: 0
      });
      bumpRefresh();
      showToast('Client joint — retiré de la liste');
    } catch (e) { showToast(e.message || 'Impossible d’enregistrer l’appel'); }
    setBusy(null);
  }

  const late = rows.filter(r => r.next && daysFromToday(r.next) < 0).length;

  return (
    <div className="fadein">
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 14 }}>
        {calls === null ? 'Chargement…' : `${rows.length} client${rows.length !== 1 ? 's' : ''} à rappeler${late ? ` — ${late} en retard` : ''}`}
        {' '}— « Pas de réponse » ajoute un essai (max {MAX_ESSAIS}) et planifie le prochain rappel.
      </div>
      {error && <div role="alert" style={{ marginBottom: 12, color: '#c4584f', fontSize: 13, fontWeight: 600 }}>{error}</div>}
      {calls !== null && !rows.length && !error && (
        <p style={{ color: 'var(--fg-faint)', fontSize: 13.5 }}>Personne à rappeler. Quand un client ne répond pas, notez-le ici avec « Pas de réponse » depuis un appel ou la fiche client.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(r => {
          const href = telHref(r.telephone);
          const diff = r.next ? daysFromToday(r.next) : null;
          const isLate = diff !== null && diff < 0;
          const maxed = r.essais >= MAX_ESSAIS;
          const hue = maxed ? '#c4584f' : r.essais ? '#c8924a' : '#6b8cae';
          return (
            <div key={r.id} style={{ ...cardStyle, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderLeft: isLate ? '3px solid #c4584f' : cardStyle.border }}>
              <div onClick={() => openDeal(r.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 220px', minWidth: 0, cursor: 'pointer' }}>
                <Avatar client={{ id: r.id, prenom: r.prenom, nom: r.nom }} size={36} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, overflowWrap: 'anywhere' }}>{fullName(r) || 'Client sans nom'}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>{[r.telephone, r.ville].filter(Boolean).join(' · ') || '—'}</div>
                </div>
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: soft(hue), color: hue, whiteSpace: 'nowrap' }}>
                {r.essais ? `Essai ${Math.min(r.essais, MAX_ESSAIS)}/${MAX_ESSAIS}${r.essais > MAX_ESSAIS ? ` (+${r.essais - MAX_ESSAIS})` : ''}` : 'Rappel'}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: isLate ? '#c4584f' : 'var(--fg-muted)', minWidth: 120 }}>
                {maxed ? 'Dernier essai fait — courriel ou message' : r.next ? `${isLate ? 'En retard · ' : ''}${diff >= -1 && diff <= 1 ? relativeDay(r.next) : fmtDay(r.next, { day: 'numeric', month: 'short' })}` : 'À appeler'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {href && <a className="iconbtn" href={href} title="Appeler" aria-label="Appeler" style={{ ...iconBtn, textDecoration: 'none' }}><Phone size={14} /></a>}
                <button type="button" className="iconbtn" title="Pas de réponse (+1 essai)" aria-label="Pas de réponse" disabled={busy === r.id} onClick={() => noAnswer(r)} style={{ ...iconBtn, color: '#c8924a' }}><PhoneOff size={14} /></button>
                <button type="button" className="iconbtn" title="Client joint" aria-label="Client joint" disabled={busy === r.id} onClick={() => reached(r)} style={{ ...iconBtn, color: '#5f9d5f' }}><Check size={15} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
