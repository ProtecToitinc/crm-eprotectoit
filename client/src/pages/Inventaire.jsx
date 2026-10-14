import React, { useState } from 'react';
import { Plus, Trash2, Minus, PackagePlus, Pencil, History } from 'lucide-react';
import { api } from '../api';
import { cardStyle, btnGhost, btnAccent, btnDanger, inputStyle, textareaStyle, Field, Modal } from '../components/ui';
import { useLoad, ErrorNote, Empty, Loading, Pill, Stat, statGrid } from '../components/bits';
import { fmtDay } from '../lib/dates';

const STATUTS = {
  critique: ['Critique', '#c4584f'],
  bas: ['Stock bas', '#c8924a'],
  ok: ['OK', '#5f9d5f'],
  surplus: ['Surplus', '#6b8cae']
};
const nb = v => (v == null || v === '' ? '—' : Number(v).toLocaleString('fr-CA', { maximumFractionDigits: 2 }));

// Jauge : critique / minimum / maximum repérés sur la barre
function Gauge({ item }) {
  const max = Math.max(Number(item.seuil_max) || 0, Number(item.quantite) || 0, Number(item.seuil_min) || 0, 1) * 1.05;
  const pos = v => `${Math.min(100, Math.max(0, (Number(v) / max) * 100))}%`;
  const hue = STATUTS[item.statut][1];
  return (
    <div style={{ position: 'relative', height: 10, borderRadius: 6, background: 'var(--surface-2)', margin: '10px 0 4px' }} aria-hidden="true">
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pos(item.quantite), borderRadius: 6, background: hue }} />
      {[['seuil_critique', '#c4584f'], ['seuil_min', '#c8924a'], ['seuil_max', '#6b8cae']].map(([k, c]) => item[k] != null && (
        <div key={k} style={{ position: 'absolute', top: -3, bottom: -3, left: pos(item[k]), width: 2, background: c }} />
      ))}
    </div>
  );
}

export default function Inventaire() {
  const { data, error, loading, reload } = useLoad(() => api.inventaire.list());
  const { data: chantiers } = useLoad(() => api.chantiers.list());
  const [edit, setEdit] = useState(null); // {} = nouveau, objet = modifier
  const [move, setMove] = useState(null); // { item, type }
  const [hist, setHist] = useState(null);
  const [msg, setMsg] = useState('');
  const items = data || [];
  const count = s => items.filter(i => i.statut === s).length;
  const remove = async i => {
    if (!window.confirm(`Supprimer « ${i.nom} » de l'inventaire (et son historique)?`)) return;
    try { await api.inventaire.delete(i.id); setMsg(''); reload(); } catch (e) { setMsg(e.message); }
  };

  return (
    <div>
      <ErrorNote>{error || msg}</ErrorNote>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <button style={{ ...btnAccent, height: 46 }} onClick={() => setEdit({})}><Plus size={18} /> Ajouter un produit</button>
      </div>
      <div style={statGrid}>
        <Stat label="Produits" value={items.length} />
        <Stat label="Critiques" value={count('critique')} hue="#c4584f" hint="À commander tout de suite" />
        <Stat label="Stock bas" value={count('bas')} hue="#c8924a" hint="Sous le minimum" />
        <Stat label="Total utilisé" value={nb(items.reduce((s, i) => s + (i.utilise_total || 0), 0))} hint="Toutes unités confondues" />
      </div>
      {loading && <Loading />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
        {items.map(i => {
          const [label, hue] = STATUTS[i.statut];
          return (
            <article key={i.id} style={{ ...cardStyle, padding: 16, borderColor: i.statut === 'critique' ? '#c4584f' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, overflowWrap: 'anywhere' }}>{i.nom}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, color: hue }}>{nb(i.quantite)} <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-muted)' }}>{i.unite || ''}</span></div>
                </div>
                <Pill hue={hue}>{label}</Pill>
              </div>
              <Gauge item={i} />
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--fg-muted)' }}>
                <span style={{ color: '#c4584f' }}>Critique : {nb(i.seuil_critique)}</span>
                <span style={{ color: '#c8924a' }}>Min : {nb(i.seuil_min)}</span>
                <span style={{ color: '#6b8cae' }}>Max : {nb(i.seuil_max)}</span>
                <span>Utilisé : {nb(i.utilise_total)}</span>
              </div>
              {i.notes && <div style={{ fontSize: 12.5, color: 'var(--fg-faint)', marginTop: 8, whiteSpace: 'pre-wrap' }}>{i.notes}</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button style={{ ...btnAccent, height: 40 }} onClick={() => setMove({ item: i, type: 'utilise' })}><Minus size={15} /> Utilisé</button>
                <button style={{ ...btnGhost, height: 40 }} onClick={() => setMove({ item: i, type: 'recu' })}><PackagePlus size={15} /> Reçu</button>
                <button style={{ ...btnGhost, height: 40 }} aria-label="Historique" onClick={() => setHist(i)}><History size={15} /></button>
                <button style={{ ...btnGhost, height: 40 }} aria-label="Modifier" onClick={() => setEdit(i)}><Pencil size={15} /></button>
                <button style={{ ...btnDanger, height: 40, marginLeft: 'auto' }} aria-label="Supprimer" onClick={() => remove(i)}><Trash2 size={15} /></button>
              </div>
            </article>
          );
        })}
      </div>
      {!loading && !items.length && <Empty>Aucun produit. Clique « Ajouter un produit » (ex. Noxnano, scellant, rouleaux…).</Empty>}
      {edit && <ItemModal item={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {move && <MoveModal item={move.item} type={move.type} chantiers={chantiers || []} onClose={() => setMove(null)} onSaved={() => { setMove(null); reload(); }} />}
      {hist && <HistModal item={hist} onClose={() => setHist(null)} />}
    </div>
  );
}

function ItemModal({ item, onClose, onSaved }) {
  const isNew = !item.id;
  const [f, setF] = useState({ nom: item.nom || '', unite: item.unite || '', quantite: item.quantite ?? '', seuil_critique: item.seuil_critique ?? '', seuil_min: item.seuil_min ?? '', seuil_max: item.seuil_max ?? '', notes: item.notes || '' });
  const [err, setErr] = useState('');
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const submit = async e => {
    e.preventDefault(); setErr('');
    const c = Number(f.seuil_critique), m = Number(f.seuil_min), x = Number(f.seuil_max);
    if (f.seuil_critique !== '' && f.seuil_min !== '' && c > m) { setErr('Le seuil critique doit être plus petit ou égal au minimum'); return; }
    if (f.seuil_min !== '' && f.seuil_max !== '' && m > x) { setErr('Le minimum doit être plus petit ou égal au maximum'); return; }
    try { isNew ? await api.inventaire.create(f) : await api.inventaire.update(item.id, f); onSaved(); } catch (ex) { setErr(ex.message); }
  };
  const num = (k, label, hint) => <Field label={label} hint={hint}><input type="number" min="0" step="any" inputMode="decimal" style={inputStyle} value={f[k]} onChange={e => set(k, e.target.value)} /></Field>;
  return (
    <Modal title={isNew ? 'Nouveau produit' : 'Modifier le produit'} onClose={onClose} onSubmit={submit} width={560}
      footer={<><button type="button" style={btnGhost} onClick={onClose}>Annuler</button><button type="submit" style={btnAccent}>Enregistrer</button></>}>
      <ErrorNote>{err}</ErrorNote>
      <Field label="Nom du produit"><input style={inputStyle} value={f.nom} onChange={e => set('nom', e.target.value)} autoFocus placeholder="Ex. Noxnano 20 L" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Unité"><input style={inputStyle} value={f.unite} onChange={e => set('unite', e.target.value)} placeholder="seaux, L, rouleaux…" /></Field>
        {num('quantite', 'Quantité en stock')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {num('seuil_critique', 'Seuil critique')}
        {num('seuil_min', 'Minimum')}
        {num('seuil_max', 'Maximum')}
      </div>
      <Field label="Notes"><textarea style={textareaStyle} rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Fournisseur, prix, endroit de rangement…" /></Field>
    </Modal>
  );
}

function MoveModal({ item, type, chantiers, onClose, onSaved }) {
  const used = type === 'utilise';
  const [quantite, setQuantite] = useState('');
  const [chantierId, setChantierId] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault(); setErr('');
    try { await api.inventaire.move(item.id, { type, quantite, chantier_id: chantierId || null, note }); onSaved(); } catch (ex) { setErr(ex.message); }
  };
  return (
    <Modal title={`${used ? 'Produit utilisé' : 'Produit reçu'} — ${item.nom}`} onClose={onClose} onSubmit={submit} width={480}
      footer={<><button type="button" style={btnGhost} onClick={onClose}>Annuler</button><button type="submit" style={btnAccent}>{used ? 'Retirer du stock' : 'Ajouter au stock'}</button></>}>
      <ErrorNote>{err}</ErrorNote>
      <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 10 }}>En stock : <strong>{nb(item.quantite)} {item.unite || ''}</strong></div>
      <Field label={`Quantité ${used ? 'utilisée' : 'reçue'}`}><input type="number" min="0" step="any" inputMode="decimal" style={inputStyle} value={quantite} onChange={e => setQuantite(e.target.value)} autoFocus /></Field>
      {used && (
        <Field label="Chantier (optionnel)">
          <select style={inputStyle} value={chantierId} onChange={e => setChantierId(e.target.value)}>
            <option value="">— aucun —</option>
            {chantiers.map(c => <option key={c.id} value={c.id}>{[c.prenom, c.nom].filter(Boolean).join(' ') || 'Client'} — {c.titre}</option>)}
          </select>
        </Field>
      )}
      <Field label="Note (optionnel)"><input style={inputStyle} value={note} onChange={e => setNote(e.target.value)} placeholder={used ? 'Ex. 2e couche' : 'Ex. Commande fournisseur'} /></Field>
    </Modal>
  );
}

function HistModal({ item, onClose }) {
  const { data, loading } = useLoad(() => api.inventaire.moves(item.id));
  const label = { utilise: 'Utilisé', recu: 'Reçu', ajustement: 'Correction' };
  return (
    <Modal title={`Historique — ${item.nom}`} onClose={onClose} width={560} footer={<button type="button" style={btnGhost} onClick={onClose}>Fermer</button>}>
      {loading && <Loading />}
      {data && !data.length && <div style={{ color: 'var(--fg-muted)' }}>Aucun mouvement.</div>}
      {(data || []).map(m => (
        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 13.5 }}>
          <div style={{ minWidth: 0 }}>
            <strong>{label[m.type] || m.type}</strong> {m.quantite > 0 ? '+' : ''}{nb(m.quantite)} {item.unite || ''}
            <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>
              {fmtDay(m.created_at)}{m.par ? ` · ${m.par}` : ''}{m.nom || m.prenom ? ` · ${[m.prenom, m.nom].filter(Boolean).join(' ')}` : ''}{m.note ? ` · ${m.note}` : ''}
            </div>
          </div>
          <span style={{ color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>reste {nb(m.solde)}</span>
        </div>
      ))}
    </Modal>
  );
}
