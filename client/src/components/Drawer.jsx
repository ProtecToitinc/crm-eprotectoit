import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Phone, StickyNote, Pin, BellRing } from 'lucide-react';
import { api } from '../api';
import { useUI } from '../context/UIContext';
import { STAGES, SERVICE_HUE, CALL_DIRECTIONS, money, soft } from '../constants';
import { fmtDay, fmtDbDateTime } from '../lib/dates';
import { telHref, fullName } from '../lib/search';
import { Avatar, DirectionChip, btnAccent, btnGhost, iconBtn } from './ui';

const SECTION = { fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fg-faint)', textTransform: 'uppercase' };
const clamp2 = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' };

export default function Drawer() {
  const { selectedDealId, closeDeal, openRdvModal, openCallModal, openNoteModal, refreshKey, bumpRefresh, showToast } = useUI();
  const [client, setClient] = useState(null);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setClient(null);
    setError('');
  }, [selectedDealId]);

  // Recharge aussi quand un appel / une note / une étape change ailleurs dans le CRM
  useEffect(() => {
    if (!selectedDealId) return undefined;
    let off = false;
    api.clients.get(selectedDealId)
      .then(c => { if (!off) { setClient(c); setError(''); } })
      .catch(e => { if (!off) setError(e.message || 'Client introuvable'); });
    return () => { off = true; };
  }, [selectedDealId, refreshKey]);

  if (!selectedDealId) return null;

  const ready = client && String(client.id) === String(selectedDealId);
  const opp = ready ? client.opportunites?.[0] : null;
  const stageIndex = opp ? STAGES.findIndex(s => s.key === opp.etape) : -1;
  const svcHue = opp?.service ? SERVICE_HUE[opp.service] || '#9aa0a6' : '#9aa0a6';
  const appels = ready ? client.appels || [] : [];
  const notes = ready ? client.notes_client || [] : [];
  const history = ready ? client.historique || [] : [];
  const tel = ready ? telHref(client.telephone) : null;

  const openFull = tab => {
    const id = client.id;
    closeDeal();
    navigate(`/clients/${id}${tab ? `?tab=${tab}` : ''}`);
  };

  async function moveTo(key) {
    if (!opp || opp.etape === key || moving) return;
    setMoving(true);
    try {
      await api.opportunites.update(opp.id, { etape: key });
      bumpRefresh();
    } catch (e) {
      showToast(e.message || 'Impossible de changer l’étape');
    } finally {
      setMoving(false);
    }
  }

  return (
    <>
      <div className="fadein" onClick={closeDeal} style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,6,.42)', zIndex: 40 }} />
      <div className="drawer" role="dialog" aria-label="Fiche client" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 432, maxWidth: '92vw',
        background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 41,
        display: 'flex', flexDirection: 'column', boxShadow: '-14px 0 44px rgba(0,0,0,.2)'
      }}>
        {!ready ? (
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="iconbtn" onClick={closeDeal} aria-label="Fermer" style={iconBtn}><X size={15} /></button>
            </div>
            {error
              ? <div role="alert" style={{ marginTop: 10, color: '#c4584f', fontSize: 13.5, fontWeight: 600 }}>{error}</div>
              : <div style={{ color: 'var(--fg-muted)', fontSize: 13.5 }}>Chargement…</div>}
          </div>
        ) : (
          <>
            <div style={{ padding: '22px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ display: 'flex', gap: 13, alignItems: 'center', minWidth: 0 }}>
                  <Avatar client={client} size={46} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, wordBreak: 'break-word' }}>{fullName(client) || 'Client sans nom'}</div>
                    <button className="linkbtn" onClick={() => openFull()} style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 12.5, color: 'var(--fg-muted)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                      {client.ville || '—'} · Dossier complet →
                    </button>
                  </div>
                </div>
                <button className="iconbtn" onClick={closeDeal} aria-label="Fermer" style={{ ...iconBtn, width: 34, height: 34, borderRadius: 9 }}><X size={15} /></button>
              </div>

              {opp && (
                <div style={{ marginTop: 18, display: 'flex', alignItems: 'baseline', gap: 11, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>{money(opp.valeur)}</span>
                  {opp.service && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: soft(svcHue), color: svcHue }}>
                      {opp.service}
                    </span>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                {tel && (
                  <a href={tel} className="btn-ghost" style={{ ...btnGhost, height: 36, fontSize: 12.5, textDecoration: 'none' }}>
                    <Phone size={13} />Appeler
                  </a>
                )}
                <button className="btn-ghost" onClick={() => openCallModal(client.id)} style={{ ...btnGhost, height: 36, fontSize: 12.5 }}>
                  <Phone size={13} />Noter un appel
                </button>
                <button className="btn-ghost" onClick={() => openNoteModal(client.id)} style={{ ...btnGhost, height: 36, fontSize: 12.5 }}>
                  <StickyNote size={13} />Note
                </button>
              </div>
            </div>

            <div className="drawerbody" style={{ flex: 1, overflow: 'auto', padding: '22px 24px' }}>
              {stageIndex >= 0 && (
                <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 26 }}>
                  {STAGES.map((st, i) => {
                    const done = i < stageIndex;
                    const cur = i === stageIndex;
                    return (
                      <button key={st.key} onClick={() => moveTo(st.key)} disabled={moving} aria-label={`Étape : ${st.label}`} aria-current={cur ? 'step' : undefined} style={{
                        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, border: 'none', background: 'transparent',
                        padding: 0, fontFamily: 'inherit', cursor: cur ? 'default' : 'pointer', opacity: moving ? .6 : 1
                      }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: done ? 'var(--accent)' : cur ? 'var(--surface)' : 'var(--surface-2)',
                          border: `2px solid ${(done || cur) ? 'var(--accent)' : 'var(--border)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 800, color: done ? 'var(--accent-fg)' : 'var(--accent)'
                        }}>{done ? '✓' : cur ? '●' : ''}</div>
                        <span style={{ fontSize: 9, fontWeight: 700, color: (done || cur) ? 'var(--fg)' : 'var(--fg-faint)', textAlign: 'center', lineHeight: 1.25 }}>{st.short}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div style={{ ...SECTION, marginBottom: 10 }}>Coordonnées</div>
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '4px 14px', marginBottom: 22 }}>
                <Row label="Tél." value={client.telephone} href={tel} />
                <Row label="Courriel" value={client.email} href={client.email ? `mailto:${client.email}` : null} />
                <Row label="Secteur" value={client.ville} last />
              </div>

              <SectionHead title="Appels" count={appels.length} onAll={() => openFull('appels')} />
              {appels.length === 0 && <p style={{ fontSize: 13, color: 'var(--fg-faint)', margin: '0 0 22px' }}>Aucun appel enregistré</p>}
              <div style={{ marginBottom: appels.length ? 22 : 0 }}>
                {appels.slice(0, 3).map(a => {
                  const pending = !!a.a_rappeler && !a.rappel_fait;
                  return (
                    <div key={a.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '8px 0' }}>
                      <DirectionChip direction={a.direction} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, ...clamp2 }}>{a.sujet || CALL_DIRECTIONS[a.direction]?.label || 'Appel'}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span>{fmtDay(a.date_appel)}{a.heure ? ` · ${a.heure}` : ''}</span>
                          {pending && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: '#c8924a' }}><BellRing size={11} />À rappeler</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <SectionHead title="Notes" count={notes.length} onAll={() => openFull('notes')} />
              {notes.length === 0 && !client.notes && <p style={{ fontSize: 13, color: 'var(--fg-faint)', margin: '0 0 22px' }}>Aucune note</p>}
              <div style={{ marginBottom: notes.length || client.notes ? 22 : 0 }}>
                {client.notes && (
                  <div style={{ padding: '8px 0', fontSize: 13, color: 'var(--fg-muted)', whiteSpace: 'pre-wrap', ...clamp2, WebkitLineClamp: 3 }}>{client.notes}</div>
                )}
                {notes.slice(0, 3).map(n => (
                  <div key={n.id} style={{ padding: '8px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {n.epingle ? <Pin size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} /> : null}
                      <span style={{ fontSize: 13, fontWeight: 600, ...clamp2, WebkitLineClamp: 1 }}>{n.titre || n.contenu}</span>
                    </div>
                    {n.titre && <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 2, ...clamp2 }}>{n.contenu}</div>}
                    <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 2 }}>{fmtDbDateTime(n.updated_at || n.created_at)}</div>
                  </div>
                ))}
              </div>

              <div style={{ ...SECTION, marginBottom: 10 }}>Historique</div>
              {history.length === 0 && <p style={{ fontSize: 13, color: 'var(--fg-faint)', margin: 0 }}>Aucun historique</p>}
              {history.slice(0, 10).map((h, i, arr) => (
                <div key={h.id} style={{ display: 'flex', gap: 12, padding: '9px 0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', marginTop: 4 }} />
                    {i < arr.length - 1 && <div style={{ flex: 1, width: 2, background: 'var(--border)', margin: '3px 0 -9px' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, wordBreak: 'break-word' }}>{h.description}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 2 }}>{fmtDbDateTime(h.created_at)}</div>
                  </div>
                </div>
              ))}
              {history.length > 10 && (
                <button className="linkbtn" onClick={() => openFull('historique')} style={{ border: 'none', background: 'transparent', padding: '6px 0 0', fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Voir tout l’historique →
                </button>
              )}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <button className="btn-accent" onClick={() => openRdvModal(client.id)} style={{ ...btnAccent, flex: 1, height: 42 }}>Planifier un RDV</button>
              <button className="btn-ghost" onClick={closeDeal} style={{ ...btnGhost, height: 42, padding: '0 18px' }}>Fermer</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function SectionHead({ title, count, onAll }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
      <div style={SECTION}>{title}{count > 0 ? ` (${count})` : ''}</div>
      {count > 0 && (
        <button className="linkbtn" onClick={onAll} style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 12, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit' }}>
          Voir tout →
        </button>
      )}
    </div>
  );
}

function Row({ label, value, href, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderBottom: last ? 'none' : '1px solid var(--border)', fontSize: 13.5 }}>
      <span style={{ color: 'var(--fg-faint)', width: 64, flexShrink: 0 }}>{label}</span>
      {value && href
        ? <a href={href} style={{ fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', minWidth: 0, wordBreak: 'break-word' }}>{value}</a>
        : <span style={{ fontWeight: 600, minWidth: 0, wordBreak: 'break-word' }}>{value || '—'}</span>}
    </div>
  );
}
