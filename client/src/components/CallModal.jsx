import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../api';
import { useUI } from '../context/UIContext';
import { CALL_DIRECTIONS, soft } from '../constants';
import { Modal, Field, ClientPicker, DirectionIcon, inputStyle, textareaStyle, btnGhost, btnAccent, btnDanger } from './ui';
import { todayKey, nowTime, addDays } from '../lib/dates';
import { looksLikePhone, fullName } from '../lib/search';

// Rendu monté seulement quand une fenêtre d'appel est ouverte → le formulaire repart à zéro à chaque ouverture
export default function CallModal() {
  const { callModal } = useUI();
  return callModal ? <CallForm modal={callModal} /> : null;
}

const quickBtn = {
  height: 32, padding: '0 11px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)',
  color: 'var(--fg-muted)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer'
};

function CallForm({ modal }) {
  const { closeCallModal, bumpRefresh, showToast } = useUI();
  const a = modal.appel;
  const editing = !!a;

  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState(a?.client_id ?? modal.clientId ?? '');
  const [isNew, setIsNew] = useState(!a && !modal.clientId && !!modal.prefillNew);
  const [nc, setNc] = useState({
    prenom: modal.prefillNew?.prenom || '', nom: modal.prefillNew?.nom || '', telephone: modal.prefillNew?.telephone || ''
  });
  const [direction, setDirection] = useState(a?.direction || 'entrant');
  const [date, setDate] = useState(a?.date_appel || todayKey());
  const [heure, setHeure] = useState(a ? (a.heure || '') : nowTime());
  const [duree, setDuree] = useState(a?.duree_min ?? '');
  const [sujet, setSujet] = useState(a?.sujet || '');
  const [resume, setResume] = useState(a?.resume || '');
  const [rappeler, setRappeler] = useState(!!a?.a_rappeler);
  const [rappelDate, setRappelDate] = useState(a?.rappel_date || '');
  const [rappelHeure, setRappelHeure] = useState(a?.rappel_heure || '');
  const [rappelFait, setRappelFait] = useState(!!a?.rappel_fait);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    api.clients.list().then(list => { if (alive) setClients(list || []); }).catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, []);

  const turnOnReminder = () => {
    setRappeler(true);
    if (!rappelDate) setRappelDate(addDays(todayKey(), 1));
    if (!rappelHeure) setRappelHeure('09:00');
  };

  // Un appel manqué se rappelle presque toujours : on propose le rappel de demain
  const pickDirection = key => {
    setDirection(key);
    if (key === 'manque' && !editing && !rappeler) turnOnReminder();
  };

  const startNew = typed => {
    const t = String(typed || '').trim();
    if (looksLikePhone(t)) setNc({ prenom: '', nom: '', telephone: t });
    else if (t) setNc({ prenom: t.split(/\s+/)[0], nom: t.split(/\s+/).slice(1).join(' '), telephone: '' });
    setIsNew(true);
  };

  const save = async e => {
    e?.preventDefault();
    if (saving) return;
    setErr('');
    const prenom = nc.prenom.trim(), nom = nc.nom.trim(), tel = nc.telephone.trim();
    if (isNew && !prenom && !nom && !tel) return setErr('Indiquez le nom ou le téléphone du client');
    if (!isNew && !clientId) return setErr('Choisissez le client');
    if (rappeler && !rappelDate) return setErr('Choisissez la date du rappel');
    setSaving(true);
    try {
      let cid = clientId;
      if (isNew) {
        const created = await api.clients.create({
          prenom: prenom || (nom ? '' : 'Inconnu'),
          nom: nom || (prenom ? '' : tel),
          telephone: tel
        });
        cid = created.id;
        // si l'enregistrement de l'appel échoue plus bas, un nouvel essai réutilise ce client (pas de doublon)
        setClients(list => [{ id: cid, prenom: prenom || (nom ? '' : 'Inconnu'), nom: nom || (prenom ? '' : tel), telephone: tel }, ...list]);
        setClientId(cid);
        setIsNew(false);
      }
      const body = {
        direction, date_appel: date, heure: heure || null, duree_min: duree === '' ? null : Number(duree),
        sujet: sujet.trim(), resume: resume.trim(),
        a_rappeler: rappeler, rappel_date: rappeler ? rappelDate : null, rappel_heure: rappeler ? (rappelHeure || null) : null,
        rappel_fait: rappeler && rappelFait
      };
      if (editing) await api.appels.update(a.id, body);
      else await api.appels.create({ client_id: cid, ...body });
      bumpRefresh();
      closeCallModal();
      showToast(editing ? 'Appel modifié' : (isNew ? 'Appel enregistré — nouveau client créé' : 'Appel enregistré'));
    } catch (ex) {
      setErr(ex.message || 'Erreur');
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Supprimer cet appel ?')) return;
    setSaving(true);
    try {
      await api.appels.delete(a.id);
      bumpRefresh();
      closeCallModal();
      showToast('Appel supprimé');
    } catch (ex) {
      setErr(ex.message || 'Erreur');
      setSaving(false);
    }
  };

  const selectedClient = clients.find(c => String(c.id) === String(clientId));

  return (
    <Modal
      title={editing ? 'Modifier l’appel' : 'Enregistrer un appel'}
      onClose={closeCallModal}
      onSubmit={save}
      width={560}
      footer={
        <>
          {editing && <button type="button" onClick={remove} disabled={saving} style={{ ...btnDanger, marginRight: 'auto' }}><Trash2 size={15} />Supprimer</button>}
          <button type="button" onClick={closeCallModal} className="btn-ghost" style={btnGhost}>Annuler</button>
          <button type="submit" disabled={saving} className="btn-accent" style={{ ...btnAccent, opacity: saving ? 0.7 : 1 }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      }
    >
      <Field label="Client">
        {isNew ? (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--surface-2)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input autoFocus value={nc.prenom} onChange={e => setNc({ ...nc, prenom: e.target.value })} placeholder="Prénom" style={inputStyle} />
              <input value={nc.nom} onChange={e => setNc({ ...nc, nom: e.target.value })} placeholder="Nom" style={inputStyle} />
            </div>
            <input value={nc.telephone} onChange={e => setNc({ ...nc, telephone: e.target.value })} placeholder="Téléphone" inputMode="tel" style={{ ...inputStyle, marginTop: 10 }} />
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Un nouveau client sera créé avec cet appel.</span>
              <button type="button" className="linkbtn" onClick={() => setIsNew(false)} style={{ border: 'none', background: 'transparent', color: 'var(--fg-muted)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Choisir un client existant</button>
            </div>
          </div>
        ) : editing ? (
          <ClientPicker clients={selectedClient ? clients : [{ id: a.client_id, prenom: a.prenom, nom: a.nom, telephone: a.telephone, ville: a.ville }]} value={clientId} />
        ) : (
          <ClientPicker clients={clients} value={clientId} onChange={setClientId} onNew={startNew} autoFocus={!modal.clientId} />
        )}
      </Field>

      <Field label="Type d’appel">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {Object.entries(CALL_DIRECTIONS).map(([key, d]) => {
            const on = direction === key;
            return (
              <button type="button" key={key} onClick={() => pickDirection(key)} aria-pressed={on} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 6px',
                border: `1.5px solid ${on ? d.hue : 'var(--border)'}`, borderRadius: 10, cursor: 'pointer',
                background: on ? soft(d.hue) : 'var(--surface)', color: on ? d.hue : 'var(--fg-muted)',
                fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, lineHeight: 1.2, textAlign: 'center'
              }}>
                <DirectionIcon direction={key} size={18} />
                {d.pick}
              </button>
            );
          })}
        </div>
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
        <Field label="Date"><input type="date" required value={date} onChange={e => setDate(e.target.value)} style={inputStyle} /></Field>
        <Field label="Heure"><input type="time" value={heure} onChange={e => setHeure(e.target.value)} style={inputStyle} /></Field>
        <Field label="Durée (min)"><input type="number" min="0" max="600" inputMode="numeric" value={duree} onChange={e => setDuree(e.target.value)} placeholder="—" style={inputStyle} /></Field>
      </div>

      <Field label="Sujet">
        <input value={sujet} onChange={e => setSujet(e.target.value)} placeholder="Ex. : demande de soumission, toiture qui coule…" style={inputStyle} />
      </Field>

      <Field label="Résumé / ce qui a été dit">
        <textarea value={resume} onChange={e => setResume(e.target.value)} rows={4} placeholder="Détails de la conversation, prochaines étapes…" style={textareaStyle} />
      </Field>

      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: rappeler ? 'var(--surface-2)' : 'transparent' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5, fontWeight: 700 }}>
          <input type="checkbox" checked={rappeler} onChange={e => (e.target.checked ? turnOnReminder() : setRappeler(false))} style={{ width: 17, height: 17, accentColor: 'var(--accent)' }} />
          À rappeler
          <span style={{ fontWeight: 500, fontSize: 12.5, color: 'var(--fg-muted)' }}>(ajouté au calendrier)</span>
        </label>
        {rappeler && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
              <Field label="Rappeler le"><input type="date" required value={rappelDate} onChange={e => setRappelDate(e.target.value)} style={inputStyle} /></Field>
              <Field label="À"><input type="time" value={rappelHeure} onChange={e => setRappelHeure(e.target.value)} style={inputStyle} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn-ghost" style={quickBtn} onClick={() => setRappelDate(addDays(todayKey(), 1))}>Demain</button>
              <button type="button" className="btn-ghost" style={quickBtn} onClick={() => setRappelDate(addDays(todayKey(), 3))}>Dans 3 jours</button>
              <button type="button" className="btn-ghost" style={quickBtn} onClick={() => setRappelDate(addDays(todayKey(), 7))}>Dans 1 semaine</button>
            </div>
            {editing && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={rappelFait} onChange={e => setRappelFait(e.target.checked)} style={{ width: 17, height: 17, accentColor: 'var(--accent)' }} />
                Rappel déjà fait
              </label>
            )}
          </div>
        )}
      </div>

      {err && <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: '#c4584f', background: soft('#c4584f'), borderRadius: 9, padding: '9px 12px' }}>{err}</div>}
      {!editing && selectedClient && !isNew && (
        <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>L’appel sera ajouté à l’historique de {fullName(selectedClient)}.</div>
      )}
    </Modal>
  );
}
