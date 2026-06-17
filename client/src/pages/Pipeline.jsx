import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, DollarSign, Plus } from 'lucide-react';
import { api } from '../api';

const ETAPES = [
  { key: 'prospect', label: 'Prospect', color: 'border-gray-300', header: 'bg-gray-100 text-gray-700' },
  { key: 'inspection', label: 'Inspection', color: 'border-blue-300', header: 'bg-blue-100 text-blue-700' },
  { key: 'devis', label: 'Devis', color: 'border-yellow-300', header: 'bg-yellow-100 text-yellow-700' },
  { key: 'contrat', label: 'Contrat', color: 'border-green-300', header: 'bg-green-100 text-green-700' },
];

function fmt(n) {
  if (!n) return '';
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);
}

export default function Pipeline() {
  const [opps, setOpps] = useState([]);
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ client_id: '', titre: '', etape: 'prospect', valeur: '', notes: '', date_prevue: '' });
  const [drag, setDrag] = useState(null);

  async function load() {
    const [o, c] = await Promise.all([api.opportunites.list(), api.clients.list()]);
    setOpps(o || []);
    setClients(c || []);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    await api.opportunites.create(form);
    setShowForm(false);
    setForm({ client_id: '', titre: '', etape: 'prospect', valeur: '', notes: '', date_prevue: '' });
    load();
  }

  async function onDrop(etape) {
    if (!drag || drag.etape === etape) return;
    await api.opportunites.update(drag.id, { ...drag, etape });
    setDrag(null);
    load();
  }

  const byEtape = (etape) => opps.filter(o => o.etape === etape);

  const totalValeur = (etape) => byEtape(etape).reduce((s, o) => s + (o.valeur || 0), 0);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline de ventes</h1>
          <p className="text-gray-500 text-sm mt-0.5">Glissez les cartes pour changer l'étape</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} />Nouvelle opportunité
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 min-h-[60vh]">
        {ETAPES.map(col => (
          <div
            key={col.key}
            className={`bg-gray-50 rounded-xl border-2 ${col.color} flex flex-col`}
            onDragOver={e => e.preventDefault()}
            onDrop={() => onDrop(col.key)}
          >
            <div className={`px-4 py-3 rounded-t-xl ${col.header} flex items-center justify-between`}>
              <span className="font-semibold text-sm">{col.label}</span>
              <span className="text-xs">{byEtape(col.key).length} · {fmt(totalValeur(col.key))}</span>
            </div>
            <div className="flex-1 p-3 space-y-2 min-h-[200px]">
              {byEtape(col.key).map(opp => (
                <div
                  key={opp.id}
                  draggable
                  onDragStart={() => setDrag(opp)}
                  className="kanban-card"
                >
                  <div className="font-medium text-gray-900 text-sm mb-1">{opp.titre}</div>
                  <Link to={`/clients/${opp.client_id}`} className="text-blue-600 text-xs hover:underline">
                    {opp.prenom} {opp.nom}
                  </Link>
                  <div className="flex items-center justify-between mt-2">
                    {opp.telephone && (
                      <div className="flex items-center gap-1 text-gray-400 text-xs">
                        <Phone size={10} />{opp.telephone}
                      </div>
                    )}
                    {opp.valeur > 0 && (
                      <div className="flex items-center gap-1 text-green-700 text-xs font-medium">
                        <DollarSign size={10} />{fmt(opp.valeur)}
                      </div>
                    )}
                  </div>
                  {opp.date_prevue && (
                    <div className="text-xs text-gray-400 mt-1">
                      Prévu : {new Date(opp.date_prevue).toLocaleDateString('fr-CA')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Nouvelle opportunité</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <select required value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Sélectionner un client *</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
              </select>
              <input required placeholder="Titre *" value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.etape} onChange={e => setForm(f => ({ ...f, etape: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm">
                  {ETAPES.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                </select>
                <input type="number" placeholder="Valeur ($)" value={form.valeur} onChange={e => setForm(f => ({ ...f, valeur: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
              </div>
              <input type="date" value={form.date_prevue} onChange={e => setForm(f => ({ ...f, date_prevue: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <textarea placeholder="Notes" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annuler</button>
                <button type="submit" className="btn-primary flex-1">Créer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
