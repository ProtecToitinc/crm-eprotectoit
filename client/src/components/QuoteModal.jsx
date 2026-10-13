import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useUI } from '../context/UIContext';
import { SERVICES, EVENT_TYPES, STAGES, soft } from '../constants';
import { todayKey } from '../lib/dates';
import { Modal, Field, ClientPicker, inputStyle, btnGhost, btnAccent } from './ui';

// Fenêtre « Nouvelle soumission » (modalMode = 'quote') et « Planifier un rendez-vous » (modalMode = 'rdv')
export default function QuoteModal() {
  const { modalMode, closeModal, prefillClientId, prefillDate, showToast, bumpRefresh } = useUI();
  const [clients, setClients] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
    if (!modalMode) return;
    api.clients.list().then(r => setClients(r || [])).catch(() => setClients([]));
    setClientId(prefillClientId || '');
    setService(SERVICES[0].name);
    setEtape('soumission');
    setAdresse(''); setMontant('');
    setDateVisite(prefillDate || (modalMode === 'rdv' ? todayKey() : ''));
    setType('rdv'); setHeure('09:00'); setTitre('');
    setError(''); setSaving(false);
  }, [modalMode, prefillClientId, prefillDate]);

  if (!modalMode) return null;
  const isQuote = modalMode === 'quote';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (isQuote && !clientId) return setError('Choisissez un client');
    if (!isQuote && !dateVisite) return setError('Choisissez une date');
    setSaving(true);
    try {
      if (isQuote) {
        const opp = await api.opportunites.create({
          client_id: clientId, titre: service, etape, service,
          valeur: Number(montant) || 0, notes: adresse || null, date_prevue: dateVisite || null
        });
        if (etape !== 'lead') {
          await api.quotes.create({
            client_id: clientId, opportunite_id: opp.id, service,
            montant: Number(montant) || 0, statut: 'envoyee', date_visite: dateVisite || null, notes: adresse || null
          });
        }
        showToast(etape === 'lead' ? 'Lead créé avec succès' : 'Soumission créée avec succès');
      } else {
        await api.evenements.create({
          client_id: clientId || null, titre: titre.trim() || EVENT_TYPES[type].label,
          type, date_debut: dateVisite, heure: heure || null
        });
        showToast('Rendez-vous planifié avec succès');
      }
      bumpRefresh();
      closeModal();
    } catch (ex) {
      setError(ex.message || 'Une erreur est survenue');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isQuote ? 'Nouvelle soumission' : 'Planifier un rendez-vous'}
      onClose={closeModal}
      onSubmit={handleSubmit}
      width={480}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={closeModal} style={btnGhost}>Annuler</button>
          <button type="submit" disabled={saving} className="btn-accent" style={{ ...btnAccent, opacity: saving ? .6 : 1 }}>
            {saving ? 'Enregistrement…' : isQuote ? 'Créer la soumission' : 'Planifier'}
          </button>
        </>
      }
    >
      <Field label={isQuote ? 'Client' : 'Client (facultatif)'}>
        <ClientPicker clients={clients} value={clientId} onChange={setClientId} autoFocus={!prefillClientId} />
      </Field>

      {isQuote ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 13 }}>
            <Field label="Service">
              <select value={service} onChange={e => setService(e.target.value)} style={inputStyle}>
                {SERVICES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Étape">
              <select value={etape} onChange={e => setEtape(e.target.value)} style={inputStyle}>
                {STAGES.filter(s => s.key !== 'complete').map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Adresse du chantier">
            <input value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="Adresse, ville" style={inputStyle} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 13 }}>
            <Field label="Montant estimé">
              <input type="number" min="0" step="0.01" inputMode="decimal" value={montant} onChange={e => setMontant(e.target.value)} placeholder="0 $" style={inputStyle} />
            </Field>
            <Field label="Date de visite">
              <input type="date" value={dateVisite} onChange={e => setDateVisite(e.target.value)} style={inputStyle} />
            </Field>
          </div>
        </>
      ) : (
        <>
          <Field label="Titre">
            <input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Ex. Inspection toiture" style={inputStyle} />
          </Field>
          <Field label="Type">
            <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
              {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 13 }}>
            <Field label="Date">
              <input type="date" value={dateVisite} onChange={e => setDateVisite(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Heure">
              <input type="time" value={heure} onChange={e => setHeure(e.target.value)} style={inputStyle} />
            </Field>
          </div>
        </>
      )}

      {error && <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: '#c4584f', background: soft('#c4584f'), borderRadius: 9, padding: '9px 12px' }}>{error}</div>}
    </Modal>
  );
}
