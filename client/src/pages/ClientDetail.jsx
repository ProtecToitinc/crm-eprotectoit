import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Plus, Home, Phone, Mail, MapPin, FileText, Clock, Upload, Check, StickyNote, Pin, PinOff, Pencil, BellRing } from 'lucide-react';
import { api } from '../api';
import { useUI } from '../context/UIContext';
import { STAGES, SERVICES, SERVICE_HUE, CALL_DIRECTIONS, money, soft } from '../constants';
import { fmtDay, fmtDbDay, fmtDbDateTime, daysFromToday, relativeDay } from '../lib/dates';
import { telHref, fullName } from '../lib/search';
import { Modal, Field, Avatar, DirectionChip, inputStyle, textareaStyle, btnGhost, btnAccent, btnDanger, iconBtn, cardStyle } from '../components/ui';

const ETAT_TOIT = ['Bon', 'Acceptable', 'À surveiller', 'Mauvais', 'Urgence'];
const MAT_TOIT = ['Asphalte', 'Métal', 'Tuile', 'Bois', 'EPDM', 'TPO', 'Autre'];
const TAB_KEYS = ['info', 'opportunites', 'appels', 'notes', 'taches', 'documents', 'historique'];
const HIST_HUE = {
  appel: '#5f9d5f', note: '#c8924a', soumission: '#6b8cae', facture: '#a86b8c', etape: '#c17a3f',
  opportunite: '#b27a3e', document: '#8a8580', evenement: '#6b8cae', creation: '#5f9d5f', modification: '#9aa0a6'
};
const EMPTY_OPP = { titre: '', etape: 'lead', service: SERVICES[0].name, valeur: '', notes: '', date_prevue: '' };
const EMPTY_TACHE = { titre: '', description: '', due_date: '', priorite: 'normale' };

const emptyToNull = v => (v === '' || v === undefined ? null : v);

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { bumpRefresh, showToast, refreshKey, openCallModal, openNoteModal } = useUI();
  const [client, setClient] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showOppForm, setShowOppForm] = useState(false);
  const [showTacheForm, setShowTacheForm] = useState(false);
  const [oppForm, setOppForm] = useState(EMPTY_OPP);
  const [tacheForm, setTacheForm] = useState(EMPTY_TACHE);
  const [modalError, setModalError] = useState('');
  const fileRef = useRef();
  const tabsRef = useRef(null);

  const tab = TAB_KEYS.includes(params.get('tab')) ? params.get('tab') : 'info';
  const setTab = key => {
    const next = new URLSearchParams(params);
    if (key === 'info') next.delete('tab'); else next.set('tab', key);
    setParams(next, { replace: true });
  };

  // Sur petit écran, la barre d'onglets défile : l'onglet actif (ex. lien direct vers Notes) reste visible
  useEffect(() => {
    const el = tabsRef.current && tabsRef.current.querySelector('[aria-selected="true"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [tab, !!client]);

  // Autre client → on repart de zéro (pas d'édition ni de formulaire ouverts qui traînent)
  useEffect(() => {
    setLoadError('');
    setEditMode(false);
    setShowOppForm(false);
    setShowTacheForm(false);
  }, [id]);

  useEffect(() => {
    let off = false;
    api.clients.get(id)
      .then(d => { if (!off) { setClient(d); setLoadError(''); } })
      .catch(e => { if (!off) setLoadError(e.message || 'Client introuvable'); });
    return () => { off = true; };
  }, [id, refreshKey]);

  // Exécute une action, rafraîchit tout le CRM, et affiche l'erreur au lieu de planter en silence
  async function act(fn, okMsg) {
    try {
      await fn();
      bumpRefresh();
      if (okMsg) showToast(okMsg);
      return true;
    } catch (e) {
      showToast(e.message || 'Une erreur est survenue');
      return false;
    }
  }

  const ready = client && String(client.id) === String(id);
  if (!ready) {
    if (loadError) {
      return (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--fg-muted)' }}>
          <p style={{ margin: '0 0 14px', fontWeight: 600 }}>{loadError}</p>
          <Link to="/clients" style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>← Retour aux clients</Link>
        </div>
      );
    }
    return <div style={{ color: 'var(--fg-muted)', fontSize: 13.5 }}>Chargement…</div>;
  }

  const notes = client.notes_client || [];
  const appels = client.appels || [];
  const rappelsEnCours = appels.filter(a => a.a_rappeler && !a.rappel_fait).length;

  function startEdit() {
    setForm({
      nom: client.nom || '', prenom: client.prenom || '', email: client.email || '', telephone: client.telephone || '',
      adresse: client.adresse || '', ville: client.ville || '', code_postal: client.code_postal || '', notes: client.notes || '',
      toiture: {
        materiau: client.toiture?.materiau || '', age_annees: client.toiture?.age_annees ?? '',
        superficie_m2: client.toiture?.superficie_m2 ?? '', etat: client.toiture?.etat || '', notes: client.toiture?.notes || ''
      }
    });
    setFormError('');
    setEditMode(true);
    setTab('info');
  }

  async function handleSave() {
    if (!form.prenom.trim() && !form.nom.trim()) return setFormError('Indiquez au moins le prénom ou le nom');
    const t = form.toiture;
    const hasToiture = client.toiture || Object.values(t).some(v => v !== '' && v != null);
    const payload = {
      ...form,
      toiture: hasToiture ? {
        materiau: emptyToNull(t.materiau), etat: emptyToNull(t.etat), notes: emptyToNull(t.notes),
        age_annees: t.age_annees === '' ? null : Number(t.age_annees),
        superficie_m2: t.superficie_m2 === '' ? null : Number(t.superficie_m2)
      } : undefined
    };
    setSaving(true);
    setFormError('');
    try {
      await api.clients.update(id, payload);
      setEditMode(false);
      bumpRefresh();
      showToast('Fiche enregistrée');
    } catch (e) {
      setFormError(e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Supprimer ce client et toutes ses données ?')) return;
    if (await act(() => api.clients.delete(id), 'Client supprimé')) navigate('/clients');
  }

  async function createOpp(e) {
    e.preventDefault();
    setModalError('');
    setSaving(true);
    try {
      await api.opportunites.create({ client_id: id, ...oppForm, valeur: oppForm.valeur === '' ? 0 : Number(oppForm.valeur), date_prevue: emptyToNull(oppForm.date_prevue) });
      setShowOppForm(false);
      setOppForm(EMPTY_OPP);
      bumpRefresh();
      showToast('Dossier créé avec succès');
    } catch (ex) {
      setModalError(ex.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function createTache(e) {
    e.preventDefault();
    setModalError('');
    setSaving(true);
    try {
      await api.taches.create({ client_id: id, ...tacheForm, due_date: emptyToNull(tacheForm.due_date) });
      setShowTacheForm(false);
      setTacheForm(EMPTY_TACHE);
      bumpRefresh();
    } catch (ex) {
      setModalError(ex.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('client_id', id);
    fd.append('type_doc', 'autre');
    await act(() => api.documents.upload(fd), 'Document ajouté');
  }

  const tabs = [
    { key: 'info', label: 'Informations' },
    { key: 'opportunites', label: 'Dossiers', count: client.opportunites?.length },
    { key: 'appels', label: 'Appels', count: appels.length, alert: rappelsEnCours > 0 },
    { key: 'notes', label: 'Notes', count: notes.length },
    { key: 'taches', label: 'Tâches', count: client.taches?.filter(t => !t.completed).length },
    { key: 'documents', label: 'Documents', count: client.documents?.length },
    { key: 'historique', label: 'Historique' }
  ];

  const tel = telHref(client.telephone);
  const linkStyle = { color: 'inherit', textDecoration: 'none' };

  return (
    <div className="fadein" style={{ maxWidth: 920, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <Link to="/clients" aria-label="Retour aux clients" style={{ color: 'var(--fg-faint)', display: 'flex' }}><ArrowLeft size={20} /></Link>
          <Avatar client={client} size={44} />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, wordBreak: 'break-word' }}>{fullName(client) || 'Client sans nom'}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px 14px', marginTop: 4, fontSize: 12.5, color: 'var(--fg-muted)', flexWrap: 'wrap' }}>
              {client.telephone && <a href={tel || undefined} style={{ ...linkStyle, display: 'flex', alignItems: 'center', gap: 5 }}><Phone size={12} />{client.telephone}</a>}
              {client.email && <a href={`mailto:${client.email}`} style={{ ...linkStyle, display: 'flex', alignItems: 'center', gap: 5 }}><Mail size={12} />{client.email}</a>}
              {client.ville && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><MapPin size={12} />{client.ville}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12.5, flexWrap: 'wrap' }}>
              <label style={{ color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Pris en charge par
                <select aria-label="Responsable du client" value={client.responsable || ''} onChange={e => act(() => api.clients.setResponsable(client.id, e.target.value || null))}
                  style={{ ...inputStyle, width: 'auto', height: 30, fontWeight: 700, color: client.responsable ? 'var(--accent)' : 'var(--fg-muted)' }}>
                  <option value="">— personne —</option>
                  <option value="Mathys Caron">Mathys Caron</option>
                  <option value="Ramy Farah">Ramy Farah</option>
                </select>
              </label>
              {client.modifie_par && <span style={{ color: 'var(--fg-faint)' }}>Dernière modification : {client.modifie_par}{client.modifie_at ? ` · ${fmtDbDateTime(client.modifie_at)}` : ''}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-ghost" onClick={() => openCallModal(client.id)} style={btnGhost}><Phone size={14} />Appel</button>
          <button className="btn-ghost" onClick={() => openNoteModal(client.id)} style={btnGhost}><StickyNote size={14} />Note</button>
          {!editMode && <button className="btn-ghost" onClick={startEdit} style={btnGhost}><Edit size={14} />Modifier</button>}
          <button className="btn-ghost" onClick={handleDelete} aria-label="Supprimer le client" title="Supprimer le client" style={{ ...btnDanger, padding: '0 12px' }}><Trash2 size={14} /></button>
        </div>
      </div>

      {(client.driveQuotes || []).length > 0 && (
        <section aria-label="Soumissions Google Drive" style={{ ...cardStyle, padding: '14px 18px', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <FileText size={18} color="var(--accent)"/>
            <strong style={{ fontSize: 14 }}>Soumissions Google Drive</strong>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Documents d’origine liés à ce client</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {client.driveQuotes.map(d => <a key={d.web_link} href={d.web_link} target="_blank" rel="noopener noreferrer" style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none', height: 38, fontSize: 12.5 }} title={d.name}>Voir soumission ↗ {d.name && <span style={{ maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--fg-muted)' }}>{d.name}</span>}</a>)}
          </div>
        </section>
      )}

      <div ref={tabsRef} role="tablist" className="hscroll" style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 22 }}>
        {tabs.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 14px', flexShrink: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', border: 'none', background: 'transparent',
            cursor: 'pointer', fontFamily: 'inherit', color: tab === t.key ? 'var(--accent)' : 'var(--fg-muted)',
            borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent'
          }}>
            {t.label}
            {t.count > 0 ? <span style={{ marginLeft: 6, background: soft(t.alert ? '#c8924a' : '#6b8cae'), color: t.alert ? '#c8924a' : '#6b8cae', fontSize: 11, padding: '1px 7px', borderRadius: 20 }}>{t.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="grid md:grid-cols-2 gap-5">
          <div style={{ ...cardStyle, padding: 20 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px', fontSize: 14, fontWeight: 800 }}><Phone size={15} style={{ color: 'var(--accent)' }} />Coordonnées</h3>
            {editMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="grid grid-cols-2 gap-2">
                  <input aria-label="Prénom" placeholder="Prénom" value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} style={inputStyle} />
                  <input aria-label="Nom" placeholder="Nom" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} style={inputStyle} />
                </div>
                <input aria-label="Téléphone" placeholder="Téléphone" inputMode="tel" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} style={inputStyle} />
                <input aria-label="Courriel" placeholder="Courriel" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} />
                <input aria-label="Adresse" placeholder="Adresse" value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} style={inputStyle} />
                <div className="grid grid-cols-2 gap-2">
                  <input aria-label="Ville" placeholder="Ville" value={form.ville} onChange={e => setForm(f => ({ ...f, ville: e.target.value }))} style={inputStyle} />
                  <input aria-label="Code postal" placeholder="Code postal" value={form.code_postal} onChange={e => setForm(f => ({ ...f, code_postal: e.target.value }))} style={inputStyle} />
                </div>
                <textarea aria-label="Note du dossier" placeholder="Note du dossier" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={textareaStyle} />
              </div>
            ) : (
              <dl style={{ fontSize: 13.5, margin: 0 }}>
                {[
                  ['Téléphone', client.telephone, tel],
                  ['Courriel', client.email, client.email ? `mailto:${client.email}` : null],
                  ['Adresse', client.adresse],
                  ['Ville', client.ville],
                  ['Code postal', client.code_postal]
                ].map(([k, v, href]) => v ? (
                  <div key={k} style={{ display: 'flex', gap: 10, padding: '4px 0' }}>
                    <dt style={{ color: 'var(--fg-faint)', width: 96, flexShrink: 0 }}>{k}</dt>
                    <dd style={{ margin: 0, minWidth: 0, wordBreak: 'break-word' }}>{href ? <a href={href} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>{v}</a> : v}</dd>
                  </div>
                ) : null)}
                {client.notes && <div style={{ paddingTop: 10, marginTop: 6, borderTop: '1px solid var(--border)', color: 'var(--fg-muted)', whiteSpace: 'pre-wrap' }}>{client.notes}</div>}
              </dl>
            )}
          </div>

          <div style={{ ...cardStyle, padding: 20 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px', fontSize: 14, fontWeight: 800 }}><Home size={15} style={{ color: 'var(--accent)' }} />Toiture</h3>
            {editMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <select aria-label="Matériau" value={form.toiture.materiau} onChange={e => setForm(f => ({ ...f, toiture: { ...f.toiture, materiau: e.target.value } }))} style={inputStyle}>
                  <option value="">Matériau…</option>
                  {MAT_TOIT.map(m => <option key={m}>{m}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input aria-label="Âge (ans)" type="number" min="0" placeholder="Âge (ans)" value={form.toiture.age_annees} onChange={e => setForm(f => ({ ...f, toiture: { ...f.toiture, age_annees: e.target.value } }))} style={inputStyle} />
                  <input aria-label="Superficie (m²)" type="number" min="0" placeholder="Superficie (m²)" value={form.toiture.superficie_m2} onChange={e => setForm(f => ({ ...f, toiture: { ...f.toiture, superficie_m2: e.target.value } }))} style={inputStyle} />
                </div>
                <select aria-label="État" value={form.toiture.etat} onChange={e => setForm(f => ({ ...f, toiture: { ...f.toiture, etat: e.target.value } }))} style={inputStyle}>
                  <option value="">État…</option>
                  {ETAT_TOIT.map(x => <option key={x}>{x}</option>)}
                </select>
                <textarea aria-label="Notes toiture" placeholder="Notes toiture" rows={2} value={form.toiture.notes} onChange={e => setForm(f => ({ ...f, toiture: { ...f.toiture, notes: e.target.value } }))} style={textareaStyle} />
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
                {!client.toiture?.materiau && !client.toiture?.age_annees && !client.toiture?.superficie_m2 && !client.toiture?.etat && <p style={{ color: 'var(--fg-faint)', fontSize: 13.5, margin: 0 }}>Aucune information de toiture</p>}
                {client.toiture?.notes && <div style={{ paddingTop: 10, marginTop: 6, borderTop: '1px solid var(--border)', color: 'var(--fg-muted)', whiteSpace: 'pre-wrap' }}>{client.toiture.notes}</div>}
              </dl>
            )}
          </div>

          {editMode && (
            <div className="md:col-span-2" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
              {formError && <div role="alert" style={{ marginRight: 'auto', fontSize: 13, fontWeight: 600, color: '#c4584f' }}>{formError}</div>}
              <button className="btn-ghost" onClick={() => setEditMode(false)} style={btnGhost}>Annuler</button>
              <button className="btn-accent" onClick={handleSave} disabled={saving} style={{ ...btnAccent, opacity: saving ? 0.7 : 1 }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          )}
        </div>
      )}

      {tab === 'opportunites' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button className="btn-accent" onClick={() => { setModalError(''); setShowOppForm(true); }} style={btnAccent}><Plus size={14} />Nouveau dossier</button>
          </div>
          {client.opportunites?.length === 0 && <Empty text="Aucun dossier" />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {client.opportunites?.map(opp => {
              const sh = opp.service ? SERVICE_HUE[opp.service] || '#9aa0a6' : null;
              const linkedQuotes = (client.driveQuotes || []).filter(d => d.opportunite_id === opp.id || (d.quote_id && client.quotes?.some(q => q.id === d.quote_id && q.opportunite_id === opp.id)));
              return (
                <div key={opp.id} style={{ ...cardStyle, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {linkedQuotes.length ? <a href={linkedQuotes[0].web_link} target="_blank" rel="noopener noreferrer" title="Ouvrir la soumission dans Google Drive" style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: 3 }}>{opp.titre} ↗</a> : opp.titre}
                      </div>
                      {linkedQuotes.length > 0 && <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
                        {linkedQuotes.map((d, index) => <a key={d.quote_id || d.web_link} href={d.web_link} target="_blank" rel="noopener noreferrer" style={{ ...btnGhost, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', padding: '7px 10px', fontSize: 12 }}>Ouvrir la soumission Drive{linkedQuotes.length > 1 ? ` ${index + 1}` : ''} ↗</a>)}
                      </div>}
                      {sh && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: soft(sh), color: sh, display: 'inline-block', marginTop: 6 }}>{opp.service}</span>}
                      {opp.notes && <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 6, whiteSpace: 'pre-wrap' }}>{opp.notes}</div>}
                      {opp.date_prevue && <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 6 }}>Prévu le {fmtDay(opp.date_prevue)}</div>}
                      {opp.valeur > 0 && <div style={{ fontSize: 14, fontWeight: 800, marginTop: 6 }}>{money(opp.valeur)}</div>}
                    </div>
                    <button aria-label="Supprimer le dossier" onClick={() => { if (confirm('Supprimer ce dossier ?')) act(() => api.opportunites.delete(opp.id)); }} style={{ border: 'none', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer', padding: 4 }}><Trash2 size={14} /></button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                    {STAGES.map(st => (
                      <button key={st.key} onClick={() => opp.etape !== st.key && act(() => api.opportunites.update(opp.id, { etape: st.key }))} style={{
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
            <Modal
              title="Nouveau dossier"
              onClose={() => setShowOppForm(false)}
              onSubmit={createOpp}
              width={460}
              footer={
                <>
                  <button type="button" className="btn-ghost" onClick={() => setShowOppForm(false)} style={btnGhost}>Annuler</button>
                  <button type="submit" className="btn-accent" disabled={saving} style={{ ...btnAccent, opacity: saving ? 0.7 : 1 }}>Créer</button>
                </>
              }
            >
              <Field label="Titre *"><input required autoFocus value={oppForm.titre} onChange={e => setOppForm(f => ({ ...f, titre: e.target.value }))} style={inputStyle} /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                <Field label="Service">
                  <select value={oppForm.service} onChange={e => setOppForm(f => ({ ...f, service: e.target.value }))} style={inputStyle}>
                    {SERVICES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                </Field>
                <Field label="Étape">
                  <select value={oppForm.etape} onChange={e => setOppForm(f => ({ ...f, etape: e.target.value }))} style={inputStyle}>
                    {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label="Valeur ($)"><input type="number" min="0" inputMode="decimal" value={oppForm.valeur} onChange={e => setOppForm(f => ({ ...f, valeur: e.target.value }))} style={inputStyle} /></Field>
                <Field label="Date prévue"><input type="date" value={oppForm.date_prevue} onChange={e => setOppForm(f => ({ ...f, date_prevue: e.target.value }))} style={inputStyle} /></Field>
              </div>
              <Field label="Notes"><textarea rows={2} value={oppForm.notes} onChange={e => setOppForm(f => ({ ...f, notes: e.target.value }))} style={textareaStyle} /></Field>
              {modalError && <ErrorBox text={modalError} />}
            </Modal>
          )}
        </div>
      )}

      {tab === 'appels' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button className="btn-accent" onClick={() => openCallModal(client.id)} style={btnAccent}><Phone size={14} />Enregistrer un appel</button>
          </div>
          {appels.length === 0 && <Empty text="Aucun appel enregistré pour ce client" icon={<Phone size={32} style={{ opacity: .3 }} />} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {appels.map(a => {
              const pending = !!a.a_rappeler && !a.rappel_fait;
              const late = pending && a.rappel_date && daysFromToday(a.rappel_date) < 0;
              const hue = late ? '#c4584f' : '#c8924a';
              return (
                <div key={a.id} style={{ ...cardStyle, padding: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <DirectionChip direction={a.direction} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>{CALL_DIRECTIONS[a.direction]?.label || 'Appel'}</span>
                      <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                        {fmtDay(a.date_appel)}{a.heure ? ` · ${a.heure}` : ''}{a.duree_min ? ` · ${a.duree_min} min` : ''}
                      </span>
                    </div>
                    {a.sujet && <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 3 }}>{a.sujet}</div>}
                    {a.resume && <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 3, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{a.resume}</div>}
                    {pending && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: soft(hue), color: hue }}>
                        <BellRing size={12} />À rappeler{a.rappel_date ? ` · ${late ? fmtDay(a.rappel_date) : relativeDay(a.rappel_date).toLowerCase()}` : ''}{a.rappel_heure ? ` à ${a.rappel_heure}` : ''}
                      </div>
                    )}
                    {a.a_rappeler && a.rappel_fait ? <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 600, color: 'var(--fg-faint)' }}>Rappel fait ✓</div> : null}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {pending && <button className="iconbtn" title="Rappel fait" aria-label="Marquer le rappel comme fait" onClick={() => act(() => api.appels.update(a.id, { rappel_fait: 1 }), 'Rappel marqué comme fait')} style={{ ...iconBtn, color: '#5f9d5f' }}><Check size={15} /></button>}
                    <button className="iconbtn" title="Modifier l’appel" aria-label="Modifier l’appel" onClick={() => openCallModal(client.id, a)} style={iconBtn}><Pencil size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'notes' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button className="btn-accent" onClick={() => openNoteModal(client.id)} style={btnAccent}><Plus size={14} />Nouvelle note</button>
          </div>
          {notes.length === 0 && !client.notes && <Empty text="Aucune note pour ce client" icon={<StickyNote size={32} style={{ opacity: .3 }} />} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {client.notes && (
              <div style={{ ...cardStyle, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--surface-2)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fg-faint)', textTransform: 'uppercase', marginBottom: 4 }}>Note du dossier</div>
                  <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{client.notes}</div>
                </div>
                <button className="iconbtn" title="Modifier" aria-label="Modifier la note du dossier" onClick={startEdit} style={iconBtn}><Pencil size={14} /></button>
              </div>
            )}
            {notes.map(n => (
              <div key={n.id} style={{ ...cardStyle, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    {n.epingle ? <Pin size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} /> : null}
                    {n.titre && <span style={{ fontWeight: 700, fontSize: 14 }}>{n.titre}</span>}
                  </div>
                  <div style={{ fontSize: 13.5, marginTop: n.titre ? 4 : 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{n.contenu}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 8 }}>{fmtDbDateTime(n.updated_at || n.created_at)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="iconbtn" title={n.epingle ? 'Désépingler' : 'Épingler'} aria-label={n.epingle ? 'Désépingler la note' : 'Épingler la note'} onClick={() => act(() => api.notes.update(n.id, { epingle: n.epingle ? 0 : 1 }))} style={iconBtn}>{n.epingle ? <PinOff size={14} /> : <Pin size={14} />}</button>
                  <button className="iconbtn" title="Modifier" aria-label="Modifier la note" onClick={() => openNoteModal(client.id, n)} style={iconBtn}><Pencil size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'taches' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button className="btn-accent" onClick={() => { setModalError(''); setShowTacheForm(true); }} style={btnAccent}><Plus size={14} />Nouvelle tâche</button>
          </div>
          {client.taches?.length === 0 && <Empty text="Aucune tâche" />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {client.taches?.map(t => {
              const late = !t.completed && t.due_date && daysFromToday(t.due_date) < 0;
              return (
                <div key={t.id} style={{ ...cardStyle, padding: 14, display: 'flex', alignItems: 'center', gap: 12, opacity: t.completed ? .5 : 1 }}>
                  <button aria-label={t.completed ? 'Rouvrir la tâche' : 'Terminer la tâche'} onClick={() => act(() => api.taches.update(t.id, { completed: !t.completed }))} style={{
                    width: 22, height: 22, borderRadius: '50%', border: `2px solid ${t.completed ? '#5f9d5f' : 'var(--border)'}`,
                    background: t.completed ? '#5f9d5f' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', padding: 0
                  }}>{t.completed ? <Check size={12} color="white" /> : null}</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, textDecoration: t.completed ? 'line-through' : 'none' }}>{t.titre}</div>
                    {t.description && <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{t.description}</div>}
                    {t.due_date && <div style={{ fontSize: 11.5, color: late ? '#c4584f' : 'var(--fg-faint)', fontWeight: late ? 700 : 400, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={10} />{fmtDay(t.due_date)}{late ? ' · en retard' : ''}</div>}
                  </div>
                  <button aria-label="Supprimer la tâche" onClick={() => act(() => api.taches.delete(t.id))} style={{ border: 'none', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer', padding: 4 }}><Trash2 size={14} /></button>
                </div>
              );
            })}
          </div>

          {showTacheForm && (
            <Modal
              title="Nouvelle tâche"
              onClose={() => setShowTacheForm(false)}
              onSubmit={createTache}
              width={440}
              footer={
                <>
                  <button type="button" className="btn-ghost" onClick={() => setShowTacheForm(false)} style={btnGhost}>Annuler</button>
                  <button type="submit" className="btn-accent" disabled={saving} style={{ ...btnAccent, opacity: saving ? 0.7 : 1 }}>Créer</button>
                </>
              }
            >
              <Field label="Titre *"><input required autoFocus value={tacheForm.titre} onChange={e => setTacheForm(f => ({ ...f, titre: e.target.value }))} style={inputStyle} /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <Field label="Échéance"><input type="date" value={tacheForm.due_date} onChange={e => setTacheForm(f => ({ ...f, due_date: e.target.value }))} style={inputStyle} /></Field>
                <Field label="Priorité">
                  <select value={tacheForm.priorite} onChange={e => setTacheForm(f => ({ ...f, priorite: e.target.value }))} style={inputStyle}>
                    <option value="basse">Basse</option>
                    <option value="normale">Normale</option>
                    <option value="haute">Haute</option>
                  </select>
                </Field>
              </div>
              <Field label="Description"><textarea rows={2} value={tacheForm.description} onChange={e => setTacheForm(f => ({ ...f, description: e.target.value }))} style={textareaStyle} /></Field>
              {modalError && <ErrorBox text={modalError} />}
            </Modal>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button className="btn-accent" onClick={() => fileRef.current?.click()} style={btnAccent}><Upload size={14} />Ajouter un fichier</button>
            <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={uploadFile} />
          </div>
          {client.documents?.length === 0 && <Empty text="Aucun document" icon={<FileText size={32} style={{ opacity: .3 }} />} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {client.documents?.map(doc => (
              <div key={doc.id} style={{ ...cardStyle, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <FileText size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/^https:\/\//i.test(doc.chemin) ? <a href={doc.chemin} target="_blank" rel="noreferrer" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent)' }}>{doc.nom}</a> : <button type="button" onClick={() => api.privateFiles.download(doc.chemin, doc.nom).catch(e => window.alert(e.message))} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontWeight: 700, fontSize: 13.5, textAlign: 'left' }}>{doc.nom}</button>}
                  <div style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>{fmtDbDay(doc.created_at)}{doc.taille ? ` · ${Math.round(doc.taille / 1024)} Ko` : ''}</div>
                </div>
                <button aria-label="Supprimer le document" onClick={() => { if (confirm(`Supprimer « ${doc.nom} » ?`)) act(() => api.documents.delete(doc.id)); }} style={{ border: 'none', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer', padding: 4 }}><Trash2 size={14} /></button>
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
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: HIST_HUE[h.type] || 'var(--accent)', marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, wordBreak: 'break-word' }}>{h.description}</div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 2 }}>{fmtDbDateTime(h.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorBox({ text }) {
  return <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: '#c4584f', background: soft('#c4584f'), borderRadius: 9, padding: '9px 12px' }}>{text}</div>;
}

function Empty({ text, icon }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-faint)' }}>
      {icon && <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}>{icon}</div>}
      <p style={{ margin: 0 }}>{text}</p>
    </div>
  );
}
