import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../api';
import { useUI } from '../context/UIContext';
import { SERVICES, EVENT_TYPES, STAGES } from '../constants';

const inputStyle = {
  width: '100%', height: 42, padding: '0 13px', border: '1px solid var(--border)', borderRadius: 10,
  background: 'var(--surface-2)', color: 'var(--fg)', fontFamily: 'inherit', fontSize: 13.5
};
const labelStyle = { fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', marginBottom: 6 };

export default function QuoteModal() {
  const { modalMode, closeModal, prefillClientId, prefillDate, showToast, bumpRefresh } = useUI();
  const [clients, setClients] = useState([]);
  const [saving, setSaving] = useState(false);

  const [clientId, setClientId] = useState('');
  const [service, setService] = useState(SERVICES[0].name);
  const [etape, setEtape] = useState('soumission');
  const [adresse, setAdresse] = useState('');
  const [montant, setMontant] = useState('');
  const [dateVisite, setDateVisite] = useState('');
  const [type, setType] = useState('rdv');
  const [heure, setHeure] = useState('09:00');
  const [titre, setTitre] = useState('');

  useEffect(() => {
    if (modalMode) {
      api.clients.list().then(setClients);
      setClientId(prefillClientId || '');
      setService(SERVICES[0].name);
      setEtape('soumission');
      setAdresse(''); setMontant(''); setDateVisite(prefillDate || '');
      setType('rdv'); setHeure('09:00'); setTitre('');
    }
  }, [modalMode, prefillClientId, prefillDate]);

  if (!modalMode) return null;

  async function handleCreateQuote(e) {
    e.preventDefault();
    if (!clientId) return;
    setSaving(true);
    try {
      const client = clients.find(c => String(c.id) === String(clientId));
      const opp = await api.opportunites.create({
        client_id: clientId, titre: service, etape, service,
        valeur: Number(montant) || 0, notes: adresse, date_prevue: dateVisite
      });
      if (etape !== 'lead') {
        await api.quotes.create({
          client_id: clientId, opportunite_id: opp.id, service,
          montant: Number(montant) || 0, statut: 'envoyee', date_visite: dateVisite, notes: adresse
        });
      }
      bumpRefresh();
      closeModal();
      showToast(etape === 'lead' ? 'Lead créé avec succès' : 'Soumission créée avec succès');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateRdv(e) {
    e.preventDefault();
    if (!clientId) return;
    setSaving(true);
    try {
      await api.evenements.create({
        client_id: clientId, titre: titre || EVENT_TYPES[type].label,
        type, date_debut: dateVisite, heure
      });
      bumpRefresh();
      closeModal();
      showToast('Rendez-vous planifié avec succès');
    } finally {
      setSaving(false);
    }
  }

  const isQuote = modalMode === 'quote';

  return (
    <div className="fadein" onClick={closeModal} style={{
      position: 'fixed', inset: 0, background: 'rgba(10,8,6,.5)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
    }}>
      <div className="popin" onClick={e => e.stopPropagation()} style={{
        width: 480, maxWidth: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.35)', overflow: 'hidden'
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{isQuote ? 'Nouvelle soumission' : 'Planifier un rendez-vous'}</div>
          <button className="iconbtn" onClick={closeModal} style={{
            width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)',
            cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}><X size={14} /></button>
        </div>

        <form onSubmit={isQuote ? handleCreateQuote : handleCreateRdv}>
          <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 15 }}>
            <div>
              <div style={labelStyle}>Client</div>
              <select required value={clientId} onChange={e => setClientId(e.target.value)} style={inputStyle}>
                <option value="">Sélectionner un client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
              </select>
            </div>

            {isQuote ? (
              <>
                <div style={{ display: 'flex', gap: 13 }}>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>Service</div>
                    <select value={service} onChange={e => setService(e.target.value)} style={inputStyle}>
                      {SERVICES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>Étape</div>
                    <select value={etape} onChange={e => setEtape(e.target.value)} style={inputStyle}>
                      {STAGES.filter(s => s.key !== 'complete').map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>Adresse du chantier</div>
                  <input value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="Adresse, ville" style={inputStyle} />
                </div>
                <div style={{ display: 'flex', gap: 13 }}>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>Montant estimé</div>
                    <input type="number" value={montant} onChange={e => setMontant(e.target.value)} placeholder="0 $" style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>Date de visite</div>
                    <input type="date" value={dateVisite} onChange={e => setDateVisite(e.target.value)} style={inputStyle} />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div style={labelStyle}>Titre</div>
                  <input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Ex. Inspection toiture" style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>Type</div>
                  <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
                    {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 13 }}>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>Date</div>
                    <input required type="date" value={dateVisite} onChange={e => setDateVisite(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>Heure</div>
                    <input type="time" value={heure} onChange={e => setHeure(e.target.value)} style={inputStyle} />
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn-ghost" onClick={closeModal} style={{
              height: 42, padding: '0 18px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)',
              color: 'var(--fg)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer'
            }}>Annuler</button>
            <button type="submit" disabled={saving} className="btn-accent" style={{
              height: 42, padding: '0 18px', border: 'none', borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-fg)',
              fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: saving ? .6 : 1
            }}>{isQuote ? 'Créer la soumission' : 'Planifier'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
