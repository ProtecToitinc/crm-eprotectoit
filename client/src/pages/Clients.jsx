import React, { useEffect, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { useUI } from '../context/UIContext';
import { SERVICE_HUE, STAGE_MAP, money, soft, initials, avatarColor } from '../constants';
import { api } from '../api';

const inputStyle = {
  width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px',
  fontSize: 13.5, fontFamily: 'inherit', background: 'var(--surface-2)', color: 'var(--fg)'
};
const labelStyle = { fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', marginBottom: 6 };

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nom: '', prenom: '', email: '', telephone: '', adresse: '', ville: '', code_postal: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const { search, setSearch, openDeal, refreshKey, bumpRefresh, showToast } = useUI();

  async function load(q = '') {
    setClients(await api.clients.list(q) || []);
  }

  useEffect(() => { load(); }, [refreshKey]);
  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.clients.create(form);
      setShowForm(false);
      setForm({ nom: '', prenom: '', email: '', telephone: '', adresse: '', ville: '', code_postal: '', notes: '' });
      bumpRefresh();
      showToast('Client ajouté avec succès');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fadein">
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap' }}>{clients.length} client{clients.length !== 1 ? 's' : ''}</div>
          <button className="btn-ghost" onClick={() => setShowForm(true)} style={{
            display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', border: '1px solid var(--border)',
            borderRadius: 9, background: 'var(--surface)', color: 'var(--fg)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap'
          }}>
            <Plus size={14} strokeWidth={2.4} />Ajouter un client
          </button>
        </div>

        {clients.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--fg-faint)' }}>
            <Users size={32} style={{ margin: '0 auto 12px', opacity: .4 }} />
            <p style={{ margin: 0 }}>Aucun client trouvé</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div className="clients-grid" style={{ minWidth: 760 }}>
              <div className="clients-row" style={{ padding: '11px 20px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fg-faint)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>
                <div>Client</div><div>Ville</div><div>Service</div><div>Valeur</div><div>Étape</div><div>Dernier contact</div>
              </div>
              {clients.map(c => {
                const ah = avatarColor(c.id);
                const sh = c.dernier_service ? SERVICE_HUE[c.dernier_service] : null;
                const stage = c.derniere_etape ? STAGE_MAP[c.derniere_etape] : null;
                return (
                  <div key={c.id} className="row-hover clients-row" onClick={() => openDeal(c.id)} style={{ padding: '13px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13.5, alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: soft(ah), color: ah, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                        {initials(c.prenom, c.nom)}
                      </div>
                      <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.prenom} {c.nom}</div>
                    </div>
                    <div style={{ color: 'var(--fg-muted)' }}>{c.ville || '—'}</div>
                    <div>{sh ? <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: soft(sh), color: sh }}>{c.dernier_service}</span> : <span style={{ color: 'var(--fg-faint)' }}>—</span>}</div>
                    <div style={{ fontWeight: 800 }}>{c.derniere_valeur ? money(c.derniere_valeur) : '—'}</div>
                    <div>{stage ? <span style={{ fontSize: 11, fontWeight: 700, color: stage.hue }}>● {stage.short}</span> : <span style={{ color: 'var(--fg-faint)' }}>—</span>}</div>
                    <div style={{ color: 'var(--fg-muted)' }}>{c.dernier_contact ? new Date(c.dernier_contact).toLocaleDateString('fr-CA') : '—'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fadein" onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,6,.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div className="popin" onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.35)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', fontSize: 16, fontWeight: 800 }}>Nouveau client</div>
            <form onSubmit={handleCreate} style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Prénom *</div>
                  <input required value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Nom *</div>
                  <input required value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Téléphone</div>
                  <input value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Email</div>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <div style={labelStyle}>Adresse</div>
                <input value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Ville</div>
                  <input value={form.ville} onChange={e => setForm(f => ({ ...f, ville: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Code postal</div>
                  <input value={form.code_postal} onChange={e => setForm(f => ({ ...f, code_postal: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <div style={labelStyle}>Notes</div>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost" style={{ flex: 1, height: 42, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', color: 'var(--fg)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
                <button type="submit" disabled={saving} className="btn-accent" style={{ flex: 1, height: 42, border: 'none', borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-fg)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: saving ? .6 : 1 }}>
                  {saving ? 'Création...' : 'Créer le client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
