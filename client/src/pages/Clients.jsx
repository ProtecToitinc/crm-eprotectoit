import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, User, Phone, MapPin, ChevronRight } from 'lucide-react';
import { api } from '../api';

const ETAPE_COLORS = {
  prospect: 'bg-gray-100 text-gray-700',
  inspection: 'bg-blue-100 text-blue-700',
  devis: 'bg-yellow-100 text-yellow-700',
  contrat: 'bg-green-100 text-green-700',
  ferme: 'bg-purple-100 text-purple-700'
};
const ETAPE_LABELS = { prospect: 'Prospect', inspection: 'Inspection', devis: 'Devis', contrat: 'Contrat', ferme: 'Fermé' };

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nom: '', prenom: '', email: '', telephone: '', adresse: '', ville: '', code_postal: '', notes: '' });
  const [loading, setLoading] = useState(false);

  async function load(q = '') {
    const data = await api.clients.list(q);
    setClients(data || []);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function handleCreate(e) {
    e.preventDefault();
    setLoading(true);
    await api.clients.create(form);
    setLoading(false);
    setShowForm(false);
    setForm({ nom: '', prenom: '', email: '', telephone: '', adresse: '', ville: '', code_postal: '', notes: '' });
    load();
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-500 text-sm mt-0.5">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nouveau client
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom, téléphone, ville..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      {/* Liste */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {clients.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <User size={36} className="mx-auto mb-3 opacity-30" />
            <p>Aucun client trouvé</p>
            <button onClick={() => setShowForm(true)} className="mt-3 text-blue-600 text-sm hover:underline">Ajouter le premier client</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Client</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium hidden md:table-cell">Téléphone</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium hidden lg:table-cell">Ville</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Étape</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium hidden md:table-cell">Dossiers</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{c.prenom} {c.nom}</div>
                    {c.email && <div className="text-gray-400 text-xs">{c.email}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                    {c.telephone ? (
                      <div className="flex items-center gap-1.5">
                        <Phone size={12} className="text-gray-400" />
                        {c.telephone}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">
                    {c.ville ? (
                      <div className="flex items-center gap-1.5">
                        <MapPin size={12} className="text-gray-400" />
                        {c.ville}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {c.derniere_etape
                      ? <span className={`badge ${ETAPE_COLORS[c.derniere_etape]}`}>{ETAPE_LABELS[c.derniere_etape]}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{c.nb_opportunites}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/clients/${c.id}`} className="text-blue-600 hover:text-blue-800 flex items-center gap-1 justify-end">
                      <span className="text-xs">Voir</span><ChevronRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal nouveau client */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-bold mb-5">Nouveau client</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Prénom *</label>
                    <input required value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
                    <input required value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
                    <input value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Adresse</label>
                  <input value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Ville</label>
                    <input value={form.ville} onChange={e => setForm(f => ({ ...f, ville: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Code postal</label>
                    <input value={form.code_postal} onChange={e => setForm(f => ({ ...f, code_postal: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annuler</button>
                  <button type="submit" disabled={loading} className="btn-primary flex-1 disabled:opacity-50">
                    {loading ? 'Création...' : 'Créer le client'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
