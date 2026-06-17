import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Plus, Home, Phone, Mail, MapPin, FileText, Clock, CheckSquare, Upload, X, Check } from 'lucide-react';
import { api } from '../api';

const ETAPE_COLORS = { prospect: 'bg-gray-100 text-gray-700', inspection: 'bg-blue-100 text-blue-700', devis: 'bg-yellow-100 text-yellow-700', contrat: 'bg-green-100 text-green-700', ferme: 'bg-purple-100 text-purple-700' };
const ETAPE_LABELS = { prospect: 'Prospect', inspection: 'Inspection', devis: 'Devis', contrat: 'Contrat', ferme: 'Fermé' };
const ETAPES = ['prospect', 'inspection', 'devis', 'contrat', 'ferme'];
const ETAT_TOIT = ['Bon', 'Acceptable', 'À surveiller', 'Mauvais', 'Urgence'];
const MAT_TOIT = ['Asphalte', 'Métal', 'Tuile', 'Bois', 'EPDM', 'TPO', 'Autre'];

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [tab, setTab] = useState('info');
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({});
  const [showOppForm, setShowOppForm] = useState(false);
  const [showTacheForm, setShowTacheForm] = useState(false);
  const [oppForm, setOppForm] = useState({ titre: '', etape: 'prospect', valeur: '', notes: '', date_prevue: '' });
  const [tacheForm, setTacheForm] = useState({ titre: '', description: '', due_date: '', priorite: 'normale' });
  const fileRef = useRef();

  async function load() {
    const data = await api.clients.get(id);
    setClient(data);
    setForm({
      nom: data.nom, prenom: data.prenom, email: data.email || '', telephone: data.telephone || '',
      adresse: data.adresse || '', ville: data.ville || '', code_postal: data.code_postal || '', notes: data.notes || '',
      toiture: data.toiture || { materiau: '', age_annees: '', superficie_m2: '', etat: '', notes: '' }
    });
  }

  useEffect(() => { load(); }, [id]);

  async function handleSave() {
    await api.clients.update(id, form);
    setEditMode(false);
    load();
  }

  async function handleDelete() {
    if (!confirm('Supprimer ce client et toutes ses données ?')) return;
    await api.clients.delete(id);
    navigate('/clients');
  }

  async function createOpp(e) {
    e.preventDefault();
    await api.opportunites.create({ client_id: id, ...oppForm });
    setShowOppForm(false);
    setOppForm({ titre: '', etape: 'prospect', valeur: '', notes: '', date_prevue: '' });
    load();
  }

  async function updateOppEtape(oppId, etape) {
    const opp = client.opportunites.find(o => o.id === oppId);
    await api.opportunites.update(oppId, { ...opp, etape });
    load();
  }

  async function deleteOpp(oppId) {
    if (!confirm('Supprimer cette opportunité ?')) return;
    await api.opportunites.delete(oppId);
    load();
  }

  async function createTache(e) {
    e.preventDefault();
    await api.taches.create({ client_id: id, ...tacheForm });
    setShowTacheForm(false);
    setTacheForm({ titre: '', description: '', due_date: '', priorite: 'normale' });
    load();
  }

  async function toggleTache(t) {
    await api.taches.update(t.id, { ...t, completed: !t.completed });
    load();
  }

  async function deleteTache(tId) {
    await api.taches.delete(tId);
    load();
  }

  async function uploadFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('client_id', id);
    fd.append('type_doc', 'autre');
    await api.documents.upload(fd);
    load();
  }

  async function deleteDoc(docId) {
    await api.documents.delete(docId);
    load();
  }

  if (!client) return <div className="flex items-center justify-center h-full"><div className="text-gray-400 text-sm">Chargement...</div></div>;

  const tabs = [
    { key: 'info', label: 'Informations', count: null },
    { key: 'opportunites', label: 'Opportunités', count: client.opportunites?.length },
    { key: 'taches', label: 'Tâches', count: client.taches?.filter(t => !t.completed).length },
    { key: 'documents', label: 'Documents', count: client.documents?.length },
    { key: 'historique', label: 'Historique', count: null },
  ];

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/clients" className="text-gray-400 hover:text-gray-700">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client.prenom} {client.nom}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              {client.telephone && <span className="flex items-center gap-1"><Phone size={12} />{client.telephone}</span>}
              {client.email && <span className="flex items-center gap-1"><Mail size={12} />{client.email}</span>}
              {client.ville && <span className="flex items-center gap-1"><MapPin size={12} />{client.ville}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {!editMode && <button onClick={() => setEditMode(true)} className="btn-secondary flex items-center gap-2"><Edit size={14} />Modifier</button>}
          <button onClick={handleDelete} className="btn-secondary text-red-500 flex items-center gap-2"><Trash2 size={14} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${tab === t.key ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}>
            {t.label}{t.count != null && t.count > 0 ? <span className="ml-1.5 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {/* INFO TAB */}
      {tab === 'info' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Phone size={16} className="text-blue-600" />Coordonnées</h3>
            {editMode ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Prénom" value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} className="border rounded px-2 py-1.5 text-sm w-full" />
                  <input placeholder="Nom" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} className="border rounded px-2 py-1.5 text-sm w-full" />
                </div>
                <input placeholder="Téléphone" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} className="border rounded px-2 py-1.5 text-sm w-full" />
                <input placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="border rounded px-2 py-1.5 text-sm w-full" />
                <input placeholder="Adresse" value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} className="border rounded px-2 py-1.5 text-sm w-full" />
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Ville" value={form.ville} onChange={e => setForm(f => ({ ...f, ville: e.target.value }))} className="border rounded px-2 py-1.5 text-sm w-full" />
                  <input placeholder="Code postal" value={form.code_postal} onChange={e => setForm(f => ({ ...f, code_postal: e.target.value }))} className="border rounded px-2 py-1.5 text-sm w-full" />
                </div>
                <textarea placeholder="Notes" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="border rounded px-2 py-1.5 text-sm w-full" />
              </div>
            ) : (
              <dl className="space-y-2 text-sm">
                {[
                  ['Téléphone', client.telephone],
                  ['Email', client.email],
                  ['Adresse', client.adresse],
                  ['Ville', client.ville],
                  ['Code postal', client.code_postal],
                ].map(([k, v]) => v ? (
                  <div key={k} className="flex gap-2">
                    <dt className="text-gray-400 w-24 flex-shrink-0">{k}</dt>
                    <dd className="text-gray-900">{v}</dd>
                  </div>
                ) : null)}
                {client.notes && <div className="pt-2 border-t border-gray-50 text-gray-600">{client.notes}</div>}
              </dl>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Home size={16} className="text-blue-600" />Toiture</h3>
            {editMode ? (
              <div className="space-y-3">
                <select value={form.toiture?.materiau || ''} onChange={e => setForm(f => ({ ...f, toiture: { ...f.toiture, materiau: e.target.value } }))} className="border rounded px-2 py-1.5 text-sm w-full">
                  <option value="">Matériau...</option>
                  {MAT_TOIT.map(m => <option key={m}>{m}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" placeholder="Âge (ans)" value={form.toiture?.age_annees || ''} onChange={e => setForm(f => ({ ...f, toiture: { ...f.toiture, age_annees: e.target.value } }))} className="border rounded px-2 py-1.5 text-sm w-full" />
                  <input type="number" placeholder="Superficie (m²)" value={form.toiture?.superficie_m2 || ''} onChange={e => setForm(f => ({ ...f, toiture: { ...f.toiture, superficie_m2: e.target.value } }))} className="border rounded px-2 py-1.5 text-sm w-full" />
                </div>
                <select value={form.toiture?.etat || ''} onChange={e => setForm(f => ({ ...f, toiture: { ...f.toiture, etat: e.target.value } }))} className="border rounded px-2 py-1.5 text-sm w-full">
                  <option value="">État...</option>
                  {ETAT_TOIT.map(e => <option key={e}>{e}</option>)}
                </select>
                <textarea placeholder="Notes toiture" rows={2} value={form.toiture?.notes || ''} onChange={e => setForm(f => ({ ...f, toiture: { ...f.toiture, notes: e.target.value } }))} className="border rounded px-2 py-1.5 text-sm w-full" />
              </div>
            ) : (
              <dl className="space-y-2 text-sm">
                {[
                  ['Matériau', client.toiture?.materiau],
                  ['Âge', client.toiture?.age_annees ? `${client.toiture.age_annees} ans` : null],
                  ['Superficie', client.toiture?.superficie_m2 ? `${client.toiture.superficie_m2} m²` : null],
                  ['État', client.toiture?.etat],
                ].map(([k, v]) => v ? (
                  <div key={k} className="flex gap-2">
                    <dt className="text-gray-400 w-24 flex-shrink-0">{k}</dt>
                    <dd className="text-gray-900">{v}</dd>
                  </div>
                ) : null)}
                {!client.toiture?.materiau && <p className="text-gray-400 text-sm">Aucune information de toiture</p>}
                {client.toiture?.notes && <div className="pt-2 border-t border-gray-50 text-gray-600">{client.toiture.notes}</div>}
              </dl>
            )}
          </div>

          {editMode && (
            <div className="md:col-span-2 flex gap-3 justify-end">
              <button onClick={() => setEditMode(false)} className="btn-secondary">Annuler</button>
              <button onClick={handleSave} className="btn-primary">Enregistrer</button>
            </div>
          )}
        </div>
      )}

      {/* OPPORTUNITES TAB */}
      {tab === 'opportunites' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowOppForm(true)} className="btn-primary flex items-center gap-2"><Plus size={14} />Nouvelle opportunité</button>
          </div>
          {client.opportunites?.length === 0 && <p className="text-center text-gray-400 py-12">Aucune opportunité</p>}
          <div className="space-y-3">
            {client.opportunites?.map(opp => (
              <div key={opp.id} className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{opp.titre}</div>
                    {opp.notes && <div className="text-sm text-gray-500 mt-1">{opp.notes}</div>}
                    {opp.valeur > 0 && <div className="text-sm font-semibold text-green-700 mt-1">{new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(opp.valeur)}</div>}
                  </div>
                  <button onClick={() => deleteOpp(opp.id)} className="text-gray-300 hover:text-red-400"><Trash2 size={14} /></button>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {ETAPES.map(e => (
                    <button key={e} onClick={() => updateOppEtape(opp.id, e)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${opp.etape === e ? ETAPE_COLORS[e] + ' ring-2 ring-offset-1 ring-blue-300' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                      {ETAPE_LABELS[e]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {showOppForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                <h2 className="text-lg font-bold mb-4">Nouvelle opportunité</h2>
                <form onSubmit={createOpp} className="space-y-3">
                  <input required placeholder="Titre *" value={oppForm.titre} onChange={e => setOppForm(f => ({ ...f, titre: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  <div className="grid grid-cols-2 gap-3">
                    <select value={oppForm.etape} onChange={e => setOppForm(f => ({ ...f, etape: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm">
                      {ETAPES.map(e => <option key={e} value={e}>{ETAPE_LABELS[e]}</option>)}
                    </select>
                    <input type="number" placeholder="Valeur ($)" value={oppForm.valeur} onChange={e => setOppForm(f => ({ ...f, valeur: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <input type="date" value={oppForm.date_prevue} onChange={e => setOppForm(f => ({ ...f, date_prevue: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  <textarea placeholder="Notes" rows={2} value={oppForm.notes} onChange={e => setOppForm(f => ({ ...f, notes: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setShowOppForm(false)} className="btn-secondary flex-1">Annuler</button>
                    <button type="submit" className="btn-primary flex-1">Créer</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TACHES TAB */}
      {tab === 'taches' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowTacheForm(true)} className="btn-primary flex items-center gap-2"><Plus size={14} />Nouvelle tâche</button>
          </div>
          {client.taches?.length === 0 && <p className="text-center text-gray-400 py-12">Aucune tâche</p>}
          <div className="space-y-2">
            {client.taches?.map(t => (
              <div key={t.id} className={`bg-white border rounded-xl p-4 flex items-center gap-3 ${t.completed ? 'opacity-50' : 'border-gray-100'}`}>
                <button onClick={() => toggleTache(t)} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${t.completed ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400'}`}>
                  {t.completed && <Check size={12} className="text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${t.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>{t.titre}</div>
                  {t.due_date && <div className="text-xs text-gray-400 mt-0.5"><Clock size={10} className="inline mr-1" />{new Date(t.due_date).toLocaleDateString('fr-CA')}</div>}
                </div>
                <button onClick={() => deleteTache(t.id)} className="text-gray-300 hover:text-red-400"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>

          {showTacheForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                <h2 className="text-lg font-bold mb-4">Nouvelle tâche</h2>
                <form onSubmit={createTache} className="space-y-3">
                  <input required placeholder="Titre *" value={tacheForm.titre} onChange={e => setTacheForm(f => ({ ...f, titre: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  <div className="grid grid-cols-2 gap-3">
                    <input type="date" value={tacheForm.due_date} onChange={e => setTacheForm(f => ({ ...f, due_date: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
                    <select value={tacheForm.priorite} onChange={e => setTacheForm(f => ({ ...f, priorite: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm">
                      <option value="basse">Basse</option>
                      <option value="normale">Normale</option>
                      <option value="haute">Haute</option>
                    </select>
                  </div>
                  <textarea placeholder="Description" rows={2} value={tacheForm.description} onChange={e => setTacheForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setShowTacheForm(false)} className="btn-secondary flex-1">Annuler</button>
                    <button type="submit" className="btn-primary flex-1">Créer</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DOCUMENTS TAB */}
      {tab === 'documents' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => fileRef.current.click()} className="btn-primary flex items-center gap-2"><Upload size={14} />Ajouter un fichier</button>
            <input ref={fileRef} type="file" className="hidden" onChange={uploadFile} />
          </div>
          {client.documents?.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <FileText size={36} className="mx-auto mb-3 opacity-30" />
              <p>Aucun document</p>
              <button onClick={() => fileRef.current.click()} className="mt-2 text-blue-600 text-sm hover:underline">Importer un fichier</button>
            </div>
          )}
          <div className="space-y-2">
            {client.documents?.map(doc => (
              <div key={doc.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-3">
                <FileText size={20} className="text-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <a href={`/uploads/${doc.chemin}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-600 hover:underline truncate block">{doc.nom}</a>
                  <div className="text-xs text-gray-400">{new Date(doc.created_at).toLocaleDateString('fr-CA')}{doc.taille ? ` · ${Math.round(doc.taille/1024)} Ko` : ''}</div>
                </div>
                <button onClick={() => deleteDoc(doc.id)} className="text-gray-300 hover:text-red-400"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HISTORIQUE TAB */}
      {tab === 'historique' && (
        <div className="space-y-2">
          {client.historique?.length === 0 && <p className="text-center text-gray-400 py-12">Aucun historique</p>}
          {client.historique?.map(h => (
            <div key={h.id} className="flex gap-3 items-start py-3 border-b border-gray-50">
              <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-sm text-gray-800">{h.description}</div>
                <div className="text-xs text-gray-400 mt-0.5">{new Date(h.created_at).toLocaleString('fr-CA')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
