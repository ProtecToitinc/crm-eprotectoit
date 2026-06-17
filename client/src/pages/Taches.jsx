import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Check, Trash2, Clock, AlertCircle } from 'lucide-react';
import { api } from '../api';

const PRIORITE_COLORS = { haute: 'bg-red-100 text-red-700', normale: 'bg-blue-100 text-blue-700', basse: 'bg-gray-100 text-gray-500' };
const PRIORITE_ORDER = { haute: 0, normale: 1, basse: 2 };

export default function Taches() {
  const [taches, setTaches] = useState([]);
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('en_cours');
  const [form, setForm] = useState({ client_id: '', titre: '', description: '', due_date: '', priorite: 'normale' });

  async function load() {
    const [t, c] = await Promise.all([api.taches.list(), api.clients.list()]);
    setTaches(t || []);
    setClients(c || []);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    await api.taches.create({ ...form, client_id: form.client_id || null });
    setShowForm(false);
    setForm({ client_id: '', titre: '', description: '', due_date: '', priorite: 'normale' });
    load();
  }

  async function toggle(t) {
    await api.taches.update(t.id, { ...t, completed: !t.completed });
    load();
  }

  async function del(id) {
    await api.taches.delete(id);
    load();
  }

  const today = new Date().toISOString().slice(0, 10);
  const filtered = taches
    .filter(t => {
      if (filter === 'en_cours') return !t.completed;
      if (filter === 'retard') return !t.completed && t.due_date && t.due_date < today;
      if (filter === 'terminees') return t.completed;
      return true;
    })
    .sort((a, b) => PRIORITE_ORDER[a.priorite] - PRIORITE_ORDER[b.priorite]);

  const enRetard = taches.filter(t => !t.completed && t.due_date && t.due_date < today).length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tâches & Rappels</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {taches.filter(t => !t.completed).length} tâche(s) en cours
            {enRetard > 0 && <span className="text-red-500 ml-2">· {enRetard} en retard</span>}
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} />Nouvelle tâche
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-5">
        {[
          { key: 'en_cours', label: 'En cours' },
          { key: 'retard', label: `En retard${enRetard ? ` (${enRetard})` : ''}` },
          { key: 'terminees', label: 'Terminées' },
          { key: 'toutes', label: 'Toutes' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === f.key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Check size={36} className="mx-auto mb-3 opacity-30" />
          <p>Aucune tâche dans cette catégorie</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(t => {
          const estEnRetard = !t.completed && t.due_date && t.due_date < today;
          return (
            <div key={t.id} className={`bg-white border rounded-xl p-4 flex items-center gap-3 transition-opacity ${t.completed ? 'opacity-60' : ''} ${estEnRetard ? 'border-red-200' : 'border-gray-100'}`}>
              <button onClick={() => toggle(t)}
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${t.completed ? 'bg-green-500 border-green-500' : estEnRetard ? 'border-red-400 hover:border-red-500' : 'border-gray-300 hover:border-green-400'}`}>
                {t.completed && <Check size={13} className="text-white" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${t.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>{t.titre}</div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {t.nom && (
                    <Link to={`/clients/${t.client_id}`} className="text-blue-600 text-xs hover:underline">
                      {t.prenom} {t.nom}
                    </Link>
                  )}
                  {t.due_date && (
                    <span className={`text-xs flex items-center gap-1 ${estEnRetard ? 'text-red-500' : 'text-gray-400'}`}>
                      {estEnRetard ? <AlertCircle size={10} /> : <Clock size={10} />}
                      {new Date(t.due_date).toLocaleDateString('fr-CA')}
                    </span>
                  )}
                  {t.description && <span className="text-xs text-gray-400 truncate">{t.description}</span>}
                </div>
              </div>
              <span className={`badge ${PRIORITE_COLORS[t.priorite]}`}>{t.priorite}</span>
              <button onClick={() => del(t.id)} className="text-gray-300 hover:text-red-400 flex-shrink-0"><Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Nouvelle tâche</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <input required placeholder="Titre *" value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Client (optionnel)</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
                <select value={form.priorite} onChange={e => setForm(f => ({ ...f, priorite: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm">
                  <option value="basse">Priorité basse</option>
                  <option value="normale">Priorité normale</option>
                  <option value="haute">Priorité haute</option>
                </select>
              </div>
              <textarea placeholder="Description" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
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
