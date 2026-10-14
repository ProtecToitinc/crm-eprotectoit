import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Trash2, Plus, ListChecks } from 'lucide-react';
import { api } from '../api';
import { cardStyle, btnGhost, btnAccent, btnDanger, inputStyle, textareaStyle, Field, Modal, ClientPicker } from '../components/ui';
import { useLoad, ErrorNote, CallButton, Empty, Loading, Pill, Stat, statGrid, dollars, dollars2, notifyBadges, useSelection, SelectionBar } from '../components/bits';
import { fmtDay } from '../lib/dates';
import { useUI } from '../context/UIContext';
import Inventaire from './Inventaire';
import { VERDICT } from '../components/Meteo';

export const CH_STATUTS = [
  ['contrat_signe', 'Contrat signé', '#b27a3e'],
  ['planifie', 'Travaux planifiés', '#6b8cae'],
  ['en_cours', 'Travaux en cours', '#c8924a'],
  ['termine', 'Travaux terminés', '#5f9d5f'],
  ['paye', 'Facture payée', '#3f7f4f']
];
const statutInfo = k => CH_STATUTS.find(s => s[0] === k) || CH_STATUTS[0];
export default function Chantiers() {
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('chantiers_tab') === 'inventaire' ? 'inventaire' : 'chantiers'; } catch { return 'chantiers'; } });
  const pick = t => { setTab(t); try { sessionStorage.setItem('chantiers_tab', t); } catch { /* sans stockage */ } };
  return (
    <div>
      <div role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['chantiers', 'Chantiers'], ['inventaire', 'Inventaire']].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => pick(k)} style={{ ...btnGhost, height: 40, background: tab === k ? 'var(--accent)' : 'var(--surface)', color: tab === k ? 'var(--accent-fg)' : 'var(--fg)', fontWeight: 800 }}>{label}</button>
        ))}
      </div>
      {tab === 'inventaire' ? <Inventaire /> : <ChantiersListe />}
    </div>
  );
}
const fullName = c => [c.prenom, c.nom].filter(Boolean).join(' ') || 'Client';

function ChantiersListe() {
  const { data, error, loading, reload } = useLoad(() => api.chantiers.list());
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState('actifs');
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState('');
  const sel = useSelection();
  const [deleting, setDeleting] = useState(false);
  const { data: prevs } = useLoad(() => api.meteo.chantiers());
  const { data: cfg, reload: reloadCfg } = useLoad(() => api.meteo.config());
  const prevOf = id => (prevs || []).find(p => p.id === id)?.jour;
  const toggleAuto = async e => { try { await api.meteo.setConfig(e.target.checked); reloadCfg(); } catch (ex) { setMsg(ex.message); } };
  const removeOne = async c => {
    if (!window.confirm(`Supprimer le chantier de ${fullName(c)} (et ses photos)? Le client, l'opportunité et la soumission ne sont pas touchés.`)) return;
    try { await api.chantiers.delete(c.id); setMsg(''); reload(); notifyBadges(); } catch (e) { setMsg(e.message); }
  };
  const removeSelected = async () => {
    const n = sel.ids.size;
    if (!n || !window.confirm(`Supprimer ${n} chantier${n > 1 ? 's' : ''} (et leurs photos)? Les clients, opportunités et soumissions ne sont pas touchés.`)) return;
    setDeleting(true);
    try { for (const id of sel.ids) await api.chantiers.delete(id); setMsg(''); } catch (e) { setMsg(e.message); }
    setDeleting(false); sel.exit(); reload(); notifyBadges();
  };
  const list = (data || []).filter(c => filter === 'tous' || (filter === 'actifs' ? !['paye'].includes(c.statut) : c.statut === filter));

  return (
    <div>
      <ErrorNote>{error || msg}</ErrorNote>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <button style={{ ...btnAccent, height: 46 }} onClick={() => setCreating(true)}><Plus size={18} /> Nouveau chantier</button>
        {(data || []).length > 0 && <button style={btnGhost} onClick={sel.on ? sel.exit : sel.enter}><ListChecks size={16} /> {sel.on ? 'Annuler la sélection' : 'Sélectionner pour supprimer'}</button>}
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--fg-muted)', marginBottom: 12 }}>
        <input type="checkbox" checked={!!cfg?.auto} onChange={toggleAuto} style={{ width: 18, height: 18 }} />
        Envoyer automatiquement le rappel au client la veille (courriel, vers 16 h). Désactivé par défaut.
      </label>
      {sel.on && <div style={{ marginBottom: 12 }}><SelectionBar noun="chantier" count={sel.ids.size} total={list.length} busy={deleting} onSelectAll={() => sel.selectAll(list.map(c => c.id))} onClear={sel.clear} onExit={sel.exit} onDelete={removeSelected} /></div>}
      <div style={statGrid}>
        {CH_STATUTS.slice(0, 4).map(([k, label, hue]) => <Stat key={k} label={label} value={(data || []).filter(c => c.statut === k).length} hue={hue} />)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {[['actifs', 'En cours (non payés)'], ...CH_STATUTS.map(s => [s[0], s[1]]), ['tous', 'Tous']].map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ ...btnGhost, height: 36, background: filter === k ? 'var(--accent)' : 'var(--surface)', color: filter === k ? 'var(--accent-fg)' : 'var(--fg)' }}>{label}</button>
        ))}
      </div>
      {loading && <Loading />}
      <div style={{ display: 'grid', gap: 12 }}>
        {list.map(c => {
          const [, label, hue] = statutInfo(c.statut);
          return (
            <article key={c.id} style={{ ...cardStyle, padding: 16, borderColor: sel.has(c.id) ? '#c4584f' : undefined }} onClick={sel.on ? () => sel.toggle(c.id) : undefined}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                {sel.on && <input type="checkbox" aria-label={`Sélectionner ${fullName(c)}`} checked={sel.has(c.id)} onChange={() => sel.toggle(c.id)} onClick={e => e.stopPropagation()} style={{ width: 20, height: 20, accentColor: '#c4584f', marginRight: 4 }} />}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <button onClick={() => setOpenId(c.id)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 800, fontSize: 16 }}>{fullName(c)}</button>
                  <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 3 }}>{[c.adresse, c.ville].filter(Boolean).join(', ') || c.titre}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 2 }}>{c.date_debut ? `Début : ${fmtDay(c.date_debut)}` : 'Date non planifiée'} · {c.nb_photos} photo(s) · {dollars(c.valeur)}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <Pill hue={hue}>{label}</Pill>
                  {prevOf(c.id) && <Pill hue={VERDICT[prevOf(c.id).verdict][1]}>{`Météo : ${VERDICT[prevOf(c.id).verdict][0]}`}</Pill>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <CallButton phone={c.telephone} label="Appeler" />
                <button style={btnAccent} onClick={() => setOpenId(c.id)}>Ouvrir le chantier</button>
                {!sel.on && <button type="button" style={{ ...btnDanger, marginLeft: 'auto' }} onClick={() => removeOne(c)}><Trash2 size={15} /> Supprimer</button>}
              </div>
            </article>
          );
        })}
        {!loading && !list.length && <Empty>Aucun chantier ici. Ils sont créés automatiquement quand un contrat est signé.</Empty>}
      </div>
      {openId && <ChantierModal id={openId} onClose={() => { setOpenId(null); reload(); notifyBadges(); }} />}
      {creating && <NewChantier onClose={() => setCreating(false)} onCreated={id => { setCreating(false); reload(); notifyBadges(); setOpenId(id); }} />}
    </div>
  );
}

function NewChantier({ onClose, onCreated }) {
  const { data: clients } = useLoad(() => api.clients.list());
  const [clientId, setClientId] = useState('');
  const { data: client } = useLoad(() => (clientId ? api.clients.get(clientId) : Promise.resolve(null)), [clientId]);
  const [f, setF] = useState({ titre: '', opportunite_id: '', statut: 'contrat_signe', date_debut: '', notes_inspection: '', materiaux: '' });
  const [err, setErr] = useState('');
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const submit = async e => {
    e.preventDefault(); setErr('');
    if (!clientId) { setErr('Choisis un client'); return; }
    try { const r = await api.chantiers.create({ ...f, client_id: Number(clientId), opportunite_id: f.opportunite_id || null, titre: f.titre || 'Chantier' }); onCreated(r.id); }
    catch (ex) { setErr(ex.message); }
  };
  return (
    <Modal title="Nouveau chantier" onClose={onClose} onSubmit={submit} width={600}
      footer={<><button type="button" style={btnGhost} onClick={onClose}>Annuler</button><button type="submit" style={btnAccent}>Créer le chantier</button></>}>
      <ErrorNote>{err}</ErrorNote>
      <Field label="Client"><ClientPicker clients={clients || []} value={clientId} onChange={v => { setClientId(v); set('opportunite_id', ''); }} autoFocus /></Field>
      {client?.opportunites?.length > 0 && (
        <Field label="Projet lié (optionnel)">
          <select style={inputStyle} value={f.opportunite_id} onChange={e => { set('opportunite_id', e.target.value); const o = client.opportunites.find(x => String(x.id) === e.target.value); if (o && !f.titre) set('titre', o.titre); }}>
            <option value="">— aucun —</option>
            {client.opportunites.map(o => <option key={o.id} value={o.id}>{o.titre}{o.valeur ? ` — ${Math.round(o.valeur)} $` : ''}</option>)}
          </select>
        </Field>
      )}
      <Field label="Titre"><input style={inputStyle} value={f.titre} onChange={e => set('titre', e.target.value)} placeholder="Ex. Protection Noxnano — toiture principale" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Étape">
          <select style={inputStyle} value={f.statut} onChange={e => set('statut', e.target.value)}>{CH_STATUTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select>
        </Field>
        <Field label="Date de début"><input type="date" style={inputStyle} value={f.date_debut} onChange={e => set('date_debut', e.target.value)} /></Field>
      </div>
      <Field label="Notes d’inspection"><textarea style={textareaStyle} rows={3} value={f.notes_inspection} onChange={e => set('notes_inspection', e.target.value)} /></Field>
      <Field label="Matériaux"><textarea style={textareaStyle} rows={2} value={f.materiaux} onChange={e => set('materiaux', e.target.value)} /></Field>
    </Modal>
  );
}

function RappelVeille({ id, dateDebut }) {
  const { showToast } = useUI();
  const { data: r, reload } = useLoad(() => api.meteo.rappel(id), [id, dateDebut]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!r) return null;
  if (!r.pret) return <Field label="Rappel de la veille"><div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{r.message}</div></Field>;
  const send = async () => {
    if (!window.confirm(`Envoyer ce rappel par courriel à ${r.to}?`)) return;
    setBusy(true); setErr('');
    try { await api.meteo.envoyerRappel(id); showToast('Rappel envoyé'); reload(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const copy = () => { try { navigator.clipboard.writeText(r.text); showToast('Message copié'); } catch { setErr('Copie impossible'); } };
  return (
    <Field label="Rappel de la veille">
      <ErrorNote>{err}</ErrorNote>
      {r.meteo && <div style={{ marginBottom: 8 }}><Pill hue={VERDICT[r.meteo.verdict][1]}>{`Météo prévue : ${r.meteo.label}, ${Math.round(r.meteo.tmax)} °C — ${VERDICT[r.meteo.verdict][0]}`}</Pill>{r.meteo.raisons.length > 0 && <span style={{ fontSize: 12, color: 'var(--fg-muted)', marginLeft: 8 }}>{r.meteo.raisons.join(' · ')}</span>}</div>}
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, background: 'var(--surface-2)', borderRadius: 10, padding: 12, margin: '0 0 10px' }}>{r.text}</pre>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" style={btnAccent} disabled={busy || !r.to} onClick={send}>Envoyer le rappel{r.to ? ` à ${r.to}` : ''}</button>
        <button type="button" style={btnGhost} onClick={copy}>Copier le message (SMS)</button>
        {!r.to && <span style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>Pas de courriel pour ce client.</span>}
        {r.envoye_at && <span style={{ fontSize: 12.5, color: '#5f9d5f' }}>Déjà envoyé le {fmtDay(r.envoye_at)}</span>}
      </div>
    </Field>
  );
}

function ChantierModal({ id, onClose }) {
  const { showToast } = useUI();
  const { data: ch, error, reload } = useLoad(() => api.chantiers.get(id), [id]);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');
  const [photoType, setPhotoType] = useState('avant');
  const fileRef = useRef(null);
  const run = async (fn, ok) => { setErr(''); try { const r = await fn(); if (ok) showToast(ok); await reload(); return r; } catch (e) { setErr(e.message); return null; } };
  const f = form || (ch && { date_debut: ch.date_debut || '', date_fin: ch.date_fin || '', notes_inspection: ch.notes_inspection || '', materiaux: ch.materiaux || '' });
  if (!ch) return <Modal title="Chantier" onClose={onClose}>{error ? <ErrorNote>{error}</ErrorNote> : <Loading />}</Modal>;
  const set = (k, v) => setForm({ ...f, [k]: v });

  const upload = async e => {
    for (const file of e.target.files) {
      const fd = new FormData();
      fd.append('file', file); fd.append('type', photoType);
      await run(() => api.chantiers.addPhoto(id, fd), 'Photo ajoutée');
    }
    e.target.value = '';
  };

  return (
    <Modal title={fullName(ch)} onClose={onClose} width={680}>
      <ErrorNote>{err}</ErrorNote>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <CallButton phone={ch.telephone} label="Appeler" />
        <Link to={`/clients/${ch.client_id}`} style={{ ...btnGhost, height: 46, textDecoration: 'none' }}>Fiche client</Link>
      </div>
      <Field label="Étape (un clic pour changer)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
          {CH_STATUTS.map(([k, label, hue]) => (
            <button key={k} onClick={() => ch.statut !== k && run(() => api.chantiers.update(id, { statut: k }), label)} aria-pressed={ch.statut === k}
              style={{ ...btnGhost, height: 46, background: ch.statut === k ? hue : 'var(--surface)', color: ch.statut === k ? '#fff' : 'var(--fg)', borderColor: ch.statut === k ? hue : undefined }}>{label}</button>
          ))}
        </div>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Début"><input type="date" style={inputStyle} value={f.date_debut} onChange={e => set('date_debut', e.target.value)} /></Field>
        <Field label="Fin"><input type="date" style={inputStyle} value={f.date_fin} onChange={e => set('date_fin', e.target.value)} /></Field>
      </div>
      <Field label="Notes d’inspection"><textarea style={textareaStyle} rows={3} value={f.notes_inspection} onChange={e => set('notes_inspection', e.target.value)} placeholder="État du toit, accès, particularités…" /></Field>
      <Field label="Matériaux utilisés"><textarea style={textareaStyle} rows={2} value={f.materiaux} onChange={e => set('materiaux', e.target.value)} placeholder="Produit, quantités…" /></Field>
      <div><button style={btnAccent} disabled={!form} onClick={() => run(() => api.chantiers.update(id, form), 'Chantier enregistré').then(() => setForm(null))}>Enregistrer les notes</button></div>

      <RappelVeille id={id} dateDebut={ch.date_debut} />
      <Field label="Photos">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <select style={{ ...inputStyle, width: 'auto' }} value={photoType} onChange={e => setPhotoType(e.target.value)} aria-label="Type de photo">
            <option value="avant">Avant</option><option value="apres">Après</option><option value="inspection">Inspection</option><option value="autre">Autre</option>
          </select>
          <button style={{ ...btnAccent, height: 46 }} onClick={() => fileRef.current?.click()}><Camera size={18} /> Prendre / ajouter une photo</button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={upload} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
          {ch.photos.map(p => (
            <figure key={p.id} style={{ margin: 0, position: 'relative' }}>
              <PrivatePhoto filename={p.chemin} alt={p.legende || p.type} />
              <figcaption style={{ fontSize: 11.5, color: 'var(--fg-muted)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{p.type}</span>
                <button aria-label="Supprimer la photo" onClick={() => window.confirm('Supprimer cette photo?') && run(() => api.chantiers.deletePhoto(id, p.id))} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--fg-faint)' }}><Trash2 size={12} /></button>
              </figcaption>
            </figure>
          ))}
        </div>
      </Field>

      {ch.opportunite_id && <Rentabilite oppId={ch.opportunite_id} />}
      <div><button style={btnDanger} onClick={async () => { if (window.confirm('Supprimer ce chantier (les photos aussi)?')) { await api.chantiers.delete(id); onClose(); } }}><Trash2 size={15} /> Supprimer le chantier</button></div>
    </Modal>
  );
}

function PrivatePhoto({ filename, alt }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let active = true;
    let currentUrl = null;
    api.privateFiles.get(filename).then(blob => {
      currentUrl = URL.createObjectURL(blob);
      if (active) setUrl(currentUrl);
      else URL.revokeObjectURL(currentUrl);
    }).catch(() => { if (active) setUrl(null); });
    return () => {
      active = false;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [filename]);
  if (!url) return <div style={{ height: 110, borderRadius: 10, background: 'var(--surface-2)' }} role="img" aria-label={alt} />;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={alt} loading="lazy" style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} /></a>;
}

function Rentabilite({ oppId }) {
  const { showToast } = useUI();
  const { data, reload } = useLoad(() => api.rentabilite.get(oppId), [oppId]);
  const [v, setV] = useState(null);
  if (!data) return null;
  const f = v || data;
  const set = (k, val) => setV({ ...f, [k]: val });
  const n = x => (x === '' || x == null ? 0 : Number(x));
  // Aperçu instantané (le serveur recalcule à l'enregistrement)
  const revenu = f.revenu !== '' && f.revenu != null ? n(f.revenu) : (f.superficie_pi2 && f.prix_pi2 ? n(f.superficie_pi2) * n(f.prix_pi2) : data.revenu);
  const cout = n(f.cout_produits) + n(f.main_oeuvre) + n(f.deplacement) + n(f.autres);
  const profit = revenu - cout, marge = revenu > 0 ? profit / revenu * 100 : null;
  const num = (k, label, ph) => <Field label={label}><input type="number" min="0" step="any" inputMode="decimal" style={inputStyle} value={f[k] ?? ''} placeholder={ph} onChange={e => set(k, e.target.value)} /></Field>;
  return (
    <section style={{ ...cardStyle, padding: 14 }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800 }}>Rentabilité du projet</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {num('superficie_pi2', 'Superficie (pi²)', data.superficie_suggeree_pi2 ? `≈ ${data.superficie_suggeree_pi2}` : '')}
        {num('prix_pi2', 'Prix vendu ($/pi²)')}
        {num('revenu', 'Revenu (si autre)', 'auto')}
        {num('cout_produits', 'Coût des produits ($)')}
        {num('main_oeuvre', 'Main-d’œuvre ($)')}
        {num('deplacement', 'Déplacement ($)')}
        {num('autres', 'Autres dépenses ($)')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, margin: '12px 0' }}>
        <Stat label="Revenu" value={dollars2(revenu)} />
        <Stat label="Coût total" value={dollars2(cout)} />
        <Stat label="Profit brut" value={dollars2(profit)} hue={profit >= 0 ? '#5f9d5f' : '#c4584f'} />
        <Stat label="Marge brute" value={marge == null ? '—' : `${marge.toFixed(1)} %`} hue={marge != null && marge < 20 ? '#c4584f' : '#5f9d5f'} />
      </div>
      <button style={btnAccent} disabled={!v} onClick={async () => { await api.rentabilite.save(oppId, v); showToast('Rentabilité enregistrée'); setV(null); reload(); }}>Enregistrer</button>
    </section>
  );
}
