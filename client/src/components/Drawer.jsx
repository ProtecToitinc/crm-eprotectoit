import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { api } from '../api';
import { useUI } from '../context/UIContext';
import { STAGES, SERVICE_HUE, money, soft, initials, avatarColor } from '../constants';

export default function Drawer() {
  const { selectedDealId, closeDeal, openRdvModal } = useUI();
  const [client, setClient] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!selectedDealId) { setClient(null); return; }
    api.clients.get(selectedDealId).then(setClient);
  }, [selectedDealId]);

  if (!selectedDealId) return null;

  const opp = client?.opportunites?.[0];
  const stageIndex = opp ? STAGES.findIndex(s => s.key === opp.etape) : -1;
  const svcHue = opp?.service ? SERVICE_HUE[opp.service] : '#9aa0a6';
  const ah = client ? avatarColor(client.id) : '#9aa0a6';

  const history = client ? [
    ...client.historique.map(h => ({ text: h.description, time: new Date(h.created_at).toLocaleString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }))
  ] : [];

  return (
    <>
      <div className="fadein" onClick={closeDeal} style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,6,.42)', zIndex: 40 }} />
      <div className="drawer" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 432, maxWidth: '92vw',
        background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 41,
        display: 'flex', flexDirection: 'column', boxShadow: '-14px 0 44px rgba(0,0,0,.2)'
      }}>
        {!client ? (
          <div style={{ padding: 24, color: 'var(--fg-muted)', fontSize: 13.5 }}>Chargement...</div>
        ) : (
          <>
            <div style={{ padding: '22px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 13, alignItems: 'center' }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: '50%', background: soft(ah), color: ah,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, flexShrink: 0
                  }}>{initials(client.prenom, client.nom)}</div>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 800 }}>{client.prenom} {client.nom}</div>
                    <button className="linkbtn" onClick={() => { closeDeal(); navigate(`/clients/${client.id}`); }} style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 12.5, color: 'var(--fg-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {client.ville || '—'} · Dossier complet →
                    </button>
                  </div>
                </div>
                <button className="iconbtn" onClick={closeDeal} style={{
                  width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 9, background: 'var(--surface)',
                  cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}><X size={15} /></button>
              </div>
              {opp && (
                <div style={{ marginTop: 18, display: 'flex', alignItems: 'baseline', gap: 11 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>{money(opp.valeur)}</span>
                  {opp.service && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: soft(svcHue), color: svcHue }}>
                      {opp.service}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="drawerbody" style={{ flex: 1, overflow: 'auto', padding: '22px 24px' }}>
              {stageIndex >= 0 && (
                <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 26 }}>
                  {STAGES.map((st, i) => {
                    const done = i < stageIndex;
                    const cur = i === stageIndex;
                    return (
                      <div key={st.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: done ? 'var(--accent)' : cur ? 'var(--surface)' : 'var(--surface-2)',
                          border: `2px solid ${(done || cur) ? 'var(--accent)' : 'var(--border)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 800, color: done ? 'var(--accent-fg)' : 'var(--accent)'
                        }}>{done ? '✓' : cur ? '●' : ''}</div>
                        <span style={{ fontSize: 9, fontWeight: 700, color: (done || cur) ? 'var(--fg)' : 'var(--fg-faint)', textAlign: 'center', lineHeight: 1.25 }}>{st.short}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fg-faint)', textTransform: 'uppercase', marginBottom: 10 }}>Coordonnées</div>
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '4px 14px', marginBottom: 22 }}>
                <Row label="Tél." value={client.telephone || '—'} />
                <Row label="Courriel" value={client.email || '—'} />
                <Row label="Secteur" value={client.ville || '—'} last />
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fg-faint)', textTransform: 'uppercase', marginBottom: 10 }}>Historique</div>
              {history.length === 0 && <p style={{ fontSize: 13, color: 'var(--fg-faint)' }}>Aucun historique</p>}
              {history.map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '9px 0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', marginTop: 4 }} />
                    {i < history.length - 1 && <div style={{ flex: 1, width: 2, background: 'var(--border)', margin: '3px 0 -9px' }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{h.text}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 2 }}>{h.time}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <button className="btn-accent" onClick={() => openRdvModal(client.id)} style={{
                flex: 1, height: 42, border: 'none', borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-fg)',
                fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer'
              }}>Planifier un RDV</button>
              <button className="btn-ghost" onClick={closeDeal} style={{
                height: 42, padding: '0 18px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)',
                color: 'var(--fg)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer'
              }}>Fermer</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Row({ label, value, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderBottom: last ? 'none' : '1px solid var(--border)', fontSize: 13.5 }}>
      <span style={{ color: 'var(--fg-faint)', width: 64, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
