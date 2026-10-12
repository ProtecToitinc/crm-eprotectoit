import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Plus, Home, Phone, Mail, MapPin, FileText, Clock, Upload, Check } from 'lucide-react';
import { api } from '../api';
import { useUI } from '../context/UIContext';
import { STAGES, SERVICES, SERVICE_HUE, money, soft } from '../constants';

const ETAT_TOIT = ['Bon', 'Acceptable', 'À surveiller', 'Mauvais', 'Urgence'];
const MAT_TOIT = ['Asphalte', 'Métal', 'Tuile', 'Bois', 'EPDM', 'TPO', 'Autre'];

const inputStyle = {
  width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px',
  fontSize: 13.5, fontFamily: 'inherit', background: 'var(--surface-2)', color: 'var(--fg)'
};
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: 20 };
const btnGhost = { height: 38, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', color: 'var(--fg)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 };
const btnAccent = { ...btnGhost, border: 'none', background: 'var(--accent)', color: 'var(--accent-fg)' };

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { bumpRefresh, showToast } = useUI();
  const [client, setClient] = useState(null);
  const [tab, setTab] = useState('info');
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({});
  const [showOppForm, setShowOppForm] = useState(false);
  const [showTacheForm, setShowTacheForm] = useState(false);
  const [oppForm, setOppForm] = useState({ titre: '', etape: 'lead', service: SERVICES[0].name, valeur: '', notes: '', date_prevue: '' });
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
    bumpRefresh();
  }

  async function handleDelete() {
    if (!confirm('Supprimer ce client et toutes ses données ?')) return;
    await api.clients.delete(id);
    bumpRefresh();
    navigate('/clients');
  }

  async function createOpp(e) {
    e.preventDefault();
    await api.opportunites.create({ client_id: id, ...oppForm });
    setShowOppForm(false);
    setOppForm({ titre: '', etape: 'lead', service: SERVICES[0].name, valeur: '', notes: '', date_prevue: '' });
    load();
    bumpRefresh();
    showToast('Dossier créé avec succès');
  }

  async function updateOppEtape(oppId, etape) {
    const opp = client.opportunites.find(o => o.id === oppId);
    await api.opportunites.update(oppId, { ...opp, etape });
    load();
    bumpRefresh();
  }

  async function deleteOpp(oppId) {
    if (!confirm('Supprimer ce dossier ?')) return;
    await api.opportunites.delete(oppId);
    load();
    bumpRefresh();
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
    showToast('Document ajouté');
  }

  async function deleteDoc(docId) {
    await api.documents.delete(docId);
    load();
  }

  if (!client) return <div style={{ color: 'var(--fg-muted)', fontSize: 13.5 }}>Chargement...</div>;

  const tabs = [
    { key: 'info', label: 'Informations', count: null },
    { key: 'opportunites', label: 'Dossiers', count: client.opportunites?.length },
    { key: 'taches', label: 'Tâches', count: client.taches?.filter(t => !t.completed).length },
    { key: 'documents', label: 'Documents', count: client.documents?.length },
    { key: 'historique', label: 'Historique', count: null },
  ];

  return (
    <div className="fadein" style={{ maxWidth: 920, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/clients" style={{ color: 'var(--fg-faint)', display: 'flex' }}><ArrowLeft size={20} /></Link>
          <div>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800 }}>{client.prenom} {client.nom}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, fontSize: 12.5, color: 'var(--fg-muted)', flexWrap: 'wrap' }}>
              {client.telephone && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Phone size={12} />{client.telephone}</span>}
              {client.email && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Mail size={12} />{client.email}</span>}
              {client.ville && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><MapPin size={12} />{client.ville}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!editMode && <button onClick={() => setEditMode(true)} style={btnGhost}><Edit size={14} />Modifier</button>}
          <button onClick={handleDelete} style={{ ...btnGhost, color: '#c4584f' }}><Trash2 size={14} /></button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 22, overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 16px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', border: 'none', background: 'transparent',
            cursor: 'pointer', fontFamily: 'inherit', color: tab === t.key ? 'var(--accent)' : 'var(--fg-muted)',
            borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent'
          }}>
            {t.label}{t.count > 0 ? <span style={{ marginLeft: 6, background: soft('#6b8cae'), color: '#6b8cae', fontSize: 11, padding: '1px 7px', borderRadius: 20 }}>{t.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="grid md:grid-cols-2 gap-5">
          <div style={cardStyle}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px', fontSize: 14, fontWeight: 800 }}><Phone size={15} style={{ color: 'var(--accent)' }} />Coordonnées</h3>
            {editMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Prénom" value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} style={inputStyle} />
                  <input placeholder="Nom" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} style={inputStyle} />
                </div>
                <input placeholder="Téléphone" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} style={inputStyle} />
                <input placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} />
                <input placeholder="Adresse" value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} style={inputStyle} />
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Ville" value={form.ville} onChange={e => setForm(f => ({ ...f, ville: e.target.value }))} style={inputStyle} />
                  <input placeholder="Code postal" value={form.code_postal} onChange={e => setForm(f => ({ ...f, code_postal: e.target.value }))} style={inputStyle} />
                </div>
                <textarea placeholder="Notes" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            ) : (
              <dl style={{ fontSize: 13.5, margin: 0 }}>
                {[['Téléphone', client.telephone], ['Email', client.email], ['Adresse', client.adresse], ['Ville', client.ville], ['Code postal', client.code_postal]]
                  .map(([k, v]) => v ? (
                    <div key={k} style={{ display: 'flex', gap: 10, padding: '4px 0' }}>
                      <dt style={{ color: 'var(--fg-faint)', width: 96, flexShrink: 0 }}>{k}</dt>
                      <dd style={{ margin: 0 }}>{v}</dd>
                    </div>
                  ) : null)}
                {client.notes && <div style={{ paddingTop: 10, marginTop: 6, borderTop: '1px solid var(--border)', color: 'var(--fg-muted)' }}>{client.notes}</div>}
              </dl>
            )}
          </div>

          <div style={cardStyle}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px', fontSize: 14, fontWeight: 800 }}><Home size={15} style={{ color: 'var(--accent)' }} />Toiture</h3>
            {editMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <select value={form.toiture?.materiau || ''} onChange={e => setForm(f => ({ ...f, toiture: { ...f.toiture, materiau: e.target.value } }))} style={inputStyle}>
                  <option value="">Matériau...</option>
                  {MAT_TOIT.map(m => <option key={m}>{m}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" placeholder="Âge (ans)" value={form.toiture?.age_annees || ''} onChange={e => setForm(f => ({ ...f, toiture: { ...f.toiture, age_annees: e.target.value } }))} style={inputStyle} />
                  <input type="number" placeholder="Superficie (m²)" value={form.toiture?.superficie_m2 || ''} onChange={e => setForm(f => ({ ...f, toiture: { ...f.toiture, superficie_m2: e.target.value } }))} style={inputStyle} />
                </div>
                <select value={form.toiture?.etat || ''} onChange={e => setForm(f => ({ ...f, toiture: { ...f.toiture, etat: e.target.value } }))} style={inputStyle}>
                  <option value="">État...</option>
                  {ETAT_TOIT.map(e => <option key={e}>{e}</option>)}
                </select>
                <textarea placeholder="Notes toiture" rows={2} value={form.toiture?.notes || ''} onChange={e => setForm(f => ({ ...f, toiture: { ...f.toiture, notes: e.target.value } }))} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            ) : (
              <dl style={{ fontSize: 13.5, margin: 0 }}>
                {[['Matériau', client.toiture?.materiau], ['Âge', client.toiture?.age_annees ? `${client.toiture.age_annees} ans` : null], ['Superficie', client.toiture?.superficie_m2 ? `${client.toiture.superficie_m2} m²` : null], ['État', client.toiture?.etat]]
                  .map(([k, v]) => v ? (
                    <div key={k} style={{ display: 'flex', gap: 10, padding: '4px 0' }}>
                      <dt style={{ color: 'var(--fg-faint)', width: 96, flexShrink: 0 }}>{k}</dt>
                      <dd style={{ margin: 0 }}>{v}</dd>
                    </div>
                  ) : null)}
                {!client.toiture?.materiau && <p style={{ color: 'var(--fg-faint)', fontSize: 13.5, margin: 0 }}>Aucune information de toiture</p>}
                {client.toiture?.notes && <div style={{ paddingTop: 10, marginTop: 6, borderTop: '1px solid var(--border)', color: 'var(--fg-muted)' }}>{client.toiture.notes}</div>}
              </dl>
            )}
          </div>

          {editMode && (
            <div className="md:col-span-2" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditMode(false)} style={btnGhost}>Annuler</button>
              <button onClick={handleSave} style={btnAccent}>Enregistrer</button>
            </div>
          )}
        </div>
      )}

      {tab === 'opportunites' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button onClick={() => setShowOppForm(true)} style={btnAccent}><Plus size={14} />Nouveau dossier</button>
          </div>
          {client.opportunites?.length === 0 && <Empty text="Aucun dossier" />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {client.opportunites?.map(opp => {
              const sh = opp.service ? SERVICE_HUE[opp.service] : null;
              return (
                <div key={opp.id} style={{ ...cardStyle, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{opp.titre}</div>
                      {sh && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: soft(sh), color: sh, display: 'inline-block', marginTop: 6 }}>{opp.service}</span>}
                      {opp.notes && <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 6 }}>{opp.notes}</div>}
                      {opp.valeur > 0 && <div style={{ fontSize: 14, fontWeight: 800, marginTop: 6 }}>{money(opp.valeur)}</div>}
                    </div>
                    <button onClick={() => deleteOpp(opp.id)} style={{ border: 'none', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                    {STAGES.map(st => (
                      <button key={st.key} onClick={() => updateOppEtape(opp.id, st.key)} style={{
                        padding: '4px 11px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        background: opp.etape === st.key ? soft(st.hue) : 'var(--surface-2)',
                        color: opp.etape === st.key ? st.hue : 'var(--fg-faint)',
                        outline: opp.etape === st.key ? `1px solid ${st.hue}` : 'none'
                      }}>{st.short}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {showOppForm && (
            <Modal onClose={() => setShowOppForm(false)} title="Nouveau dossier">
              <form onSubmit={createOpp} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input required placeholder="Titre *" value={oppForm.titre} onChange={e => setOppForm(f => ({ ...f, titre: e.target.value }))} style={inputStyle} />
                <div className="grid grid-cols-2 gap-3">
                  <select value={oppForm.service} onChange={e => setOppForm(f => ({ ...f, service: e.target.value }))} style={inputStyle}>
                    {SERVICES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                  <select value={oppForm.etape} onChange={e => setOppForm(f => ({ ...f, etape: e.target.value }))} style={inputStyle}>
                    {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <input type="number" placeholder="Valeur ($)" value={oppForm.valeur} onChange={e => setOppForm(f => ({ ...f, valeur: e.target.value }))} style={inputStyle} />
                <input type="date" value={oppForm.date_prevue} onChange={e => setOppForm(f => ({ ...f, date_prevue: e.target.value }))} style={inputStyle} />
                <textarea placeholder="Notes" rows={2} value={oppForm.notes} onChange={e => setOppForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => setShowOppForm(false)} style={{ ...btnGhost, flex: 1, justifyContent: 'center' }}>Annuler</button>
                  <button type="submit" style={{ ...btnAccent, flex: 1, justifyContent: 'center' }}>Créer</button>
                </div>
              </form>
            </Modal>
          )}
        </div>
      )}

      {tab === 'taches' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button onClick={() => setShowTacheForm(true)} style={btnAccent}><Plus size={14} />Nouvelle tâche</button>
          </div>
          {client.taches?.length === 0 && <Empty text="Aucune tâche" />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {client.taches?.map(t => (
              <div key={t.id} style={{ ...cardStyle, padding: 14, display: 'flex', alignItems: 'center', gap: 12, opacity: t.completed ? .5 : 1 }}>
                <button onClick={() => toggleTache(t)} style={{
                  width: 20, height: 20, borderRadius: '50%', border: `2px solid ${t.completed ? '#5f9d5f' : 'var(--border)'}`,
                  background: t.completed ? '#5f9d5f' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer'
                }}>{t.completed && <Check size={12} color="white" />}</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, textDecoration: t.completed ? 'line-through' : 'none' }}>{t.titre}</div>
                  {t.due_date && <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={10} />{new Date(t.due_date).toLocaleDateString('fr-CA')}</div>}
                </div>
                <button onClick={() => deleteTache(t.id)} style={{ border: 'none', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer' }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>

          {showTacheForm && (
            <Modal onClose={() => setShowTacheForm(false)} title="Nouvelle tâche">
              <form onSubmit={createTache} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input required placeholder="Titre *" value={tacheForm.titre} onChange={e => setTacheForm(f => ({ ...f, titre: e.target.value }))} style={inputStyle} />
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={tacheForm.due_date} onChange={e => setTacheForm(f => ({ ...f, due_date: e.target.value }))} style={inputStyle} />
                  <select value={tacheForm.priorite} onChange={e => setTacheForm(f => ({ ...f, priorite: e.target.value }))} style={inputStyle}>
                    <option value="basse">Basse</option>
                    <option value="normale">Normale</option>
                    <option value="haute">Haute</option>
                  </select>
                </div>
                <textarea placeholder="Description" rows={2} value={tacheForm.description} onChange={e => setTacheForm(f => ({ ...f, description: e.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => setShowTacheForm(false)} style={{ ...btnGhost, flex: 1, justifyContent: 'center' }}>Annuler</button>
                  <button type="submit" style={{ ...btnAccent, flex: 1, justifyContent: 'center' }}>Créer</button>
                </div>
              </form>
            </Modal>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button onClick={() => fileRef.current.click()} style={btnAccent}><Upload size={14} />Ajouter un fichier</button>
            <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={uploadFile} />
          </div>
          {client.documents?.length === 0 && <Empty text="Aucun document" icon={<FileText size={32} style={{ opacity: .3 }} />} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {client.documents?.map(doc => (
              <div key={doc.id} style={{ ...cardStyle, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <FileText size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a href={`/uploads/${doc.chemin}`} target="_blank" rel="noreferrer" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.nom}</a>
                  <div style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>{new Date(doc.created_at).toLocaleDateString('fr-CA')}{doc.taille ? ` · ${Math.round(doc.taille / 1024)} Ko` : ''}</div>
                </div>
                <button onClick={() => deleteDoc(doc.id)} style={{ border: 'none', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer' }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'historique' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {client.historique?.length === 0 && <Empty text="Aucun historique" />}
          {client.historique?.map(h => (
            <div key={h.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5 }}>{h.description}</div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 2 }}>{new Date(h.created_at).toLocaleString('fr-CA')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ text, icon }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-faint)' }}>
      {icon && <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}>{icon}</div>}
      <p style={{ margin: 0 }}>{text}</p>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fadein" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,6,.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="popin" onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.35)', padding: 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
