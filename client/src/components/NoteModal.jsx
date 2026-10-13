import React, { useEffect, useState } from 'react';
import { Trash2, Pin } from 'lucide-react';
import { api } from '../api';
import { useUI } from '../context/UIContext';
import { soft } from '../constants';
import { Modal, Field, ClientPicker, inputStyle, textareaStyle, btnGhost, btnAccent, btnDanger } from './ui';

// Rendu monté seulement quand la fenêtre de note est ouverte → formulaire neuf à chaque ouverture
export default function NoteModal() {
  const { noteModal } = useUI();
  return noteModal ? <NoteForm modal={noteModal} /> : null;
}

function NoteForm({ modal }) {
  const { closeNoteModal, bumpRefresh, showToast } = useUI();
  const n = modal.note;
  const editing = !!n;
  const locked = !!modal.clientId; // ouverte depuis la fiche d'un client : la note reste à ce client

  const [scope, setScope] = useState(n ? (n.client_id ? 'client' : 'general') : (modal.clientId ? 'client' : 'general'));
  const [clientId, setClientId] = useState(n?.client_id ?? modal.clientId ?? '');
  const [titre, setTitre] = useState(n?.titre || '');
  const [contenu, setContenu] = useState(n?.contenu || '');
  const [pinned, setPinned] = useState(!!n?.epingle);
  const [clients, setClients] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    api.clients.list().then(list => { if (alive) setClients(list || []); }).catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, []);

  const save = async e => {
    e?.preventDefault();
    if (saving) return;
    setErr('');
    if (!contenu.trim()) return setErr('Écrivez le contenu de la note');
    if (scope === 'client' && !clientId) return setErr('Choisissez le client de la note');
    setSaving(true);
    try {
      const body = { client_id: scope === 'client' ? clientId : null, titre: titre.trim(), contenu: contenu.trim(), epingle: pinned };
      if (editing) await api.notes.update(n.id, body);
      else await api.notes.create(body);
      bumpRefresh();
      closeNoteModal();
      showToast(editing ? 'Note modifiée' : 'Note enregistrée');
    } catch (ex) {
      setErr(ex.message || 'Erreur');
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Supprimer cette note ?')) return;
    setSaving(true);
    try {
      await api.notes.delete(n.id);
      bumpRefresh();
      closeNoteModal();
      showToast('Note supprimée');
    } catch (ex) {
      setErr(ex.message || 'Erreur');
      setSaving(false);
    }
  };

  const clientsForPicker = locked && !clients.some(c => String(c.id) === String(clientId)) && n
    ? [{ id: n.client_id, prenom: n.prenom, nom: n.nom }, ...clients]
    : clients;

  return (
    <Modal
      title={editing ? 'Modifier la note' : 'Nouvelle note'}
      onClose={closeNoteModal}
      onSubmit={save}
      width={560}
      footer={
        <>
          {editing && <button type="button" onClick={remove} disabled={saving} style={{ ...btnDanger, marginRight: 'auto' }}><Trash2 size={15} />Supprimer</button>}
          <button type="button" onClick={closeNoteModal} className="btn-ghost" style={btnGhost}>Annuler</button>
          <button type="submit" disabled={saving} className="btn-accent" style={{ ...btnAccent, opacity: saving ? 0.7 : 1 }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      }
    >
      {!locked && (
        <Field label="Type de note">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[['general', 'Note générale'], ['client', 'Pour un client']].map(([key, label]) => {
              const on = scope === key;
              return (
                <button type="button" key={key} onClick={() => setScope(key)} aria-pressed={on} style={{
                  height: 40, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, cursor: 'pointer',
                  background: on ? soft('#c17a3f') : 'var(--surface)', color: on ? 'var(--accent)' : 'var(--fg-muted)',
                  fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700
                }}>{label}</button>
              );
            })}
          </div>
        </Field>
      )}

      {scope === 'client' && (
        <Field label="Client">
          <ClientPicker clients={clientsForPicker} value={clientId} onChange={locked ? undefined : setClientId} autoFocus={!clientId} />
        </Field>
      )}

      <Field label="Titre (facultatif)">
        <input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Ex. : Accès au toit, code de la boîte à clé…" style={inputStyle} />
      </Field>

      <Field label="Note">
        <textarea autoFocus={scope === 'general' || !!clientId} value={contenu} onChange={e => setContenu(e.target.value)} rows={7} placeholder="Écrivez votre note ici…" style={textareaStyle} />
      </Field>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>
        <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} style={{ width: 17, height: 17, accentColor: 'var(--accent)' }} />
        <Pin size={14} style={{ color: 'var(--accent)' }} />Épingler en haut
      </label>

      {err && <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: '#c4584f', background: soft('#c4584f'), borderRadius: 9, padding: '9px 12px' }}>{err}</div>}
    </Modal>
  );
}
