import React, { useEffect, useState } from 'react';
import { Receipt, Plus } from 'lucide-react';
import { useUI } from '../context/UIContext';
import { INVOICE_STATUSES, money, soft } from '../constants';
import { api } from '../api';

const inputStyle = {
  width: '100%', height: 42, padding: '0 13px', border: '1px solid var(--border)', borderRadius: 10,
  background: 'var(--surface-2)', color: 'var(--fg)', fontFamily: 'inherit', fontSize: 13.5
};
const labelStyle = { fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', marginBottom: 6 };

export default function Facturation() {
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ client_id: '', montant: '', date_echeance: '', statut: 'en_attente' });
  const { refreshKey, openDeal, bumpRefresh, showToast } = useUI();

  async function load() {
    setInvoices(await api.invoices.list() || []);
  }

  useEffect(() => { load(); }, [refreshKey]);
  useEffect(() => { if (showForm) api.clients.list().then(setClients); }, [showForm]);

  async function changeStatus(inv, statut) {
    await api.invoices.update(inv.id, { ...inv, statut });
    load();
    bumpRefresh();
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.client_id) return;
    await api.invoices.create(form);
    setShowForm(false);
    setForm({ client_id: '', montant: '', date_echeance: '', statut: 'en_attente' });
    load();
    bumpRefresh();
    showToast('Facture créée avec succès');
  }

  const sum = (statut) => invoices.filter(i => i.statut === statut).reduce((a, i) => a + (i.montant || 0), 0);
  const stats = [
    { label: 'Encaissé ce mois', value: money(sum('payee')), hue: '#5f9d5f' },
    { label: 'En attente', value: money(sum('en_attente')), hue: 'var(--accent)' },
    { label: 'En retard', value: money(sum('en_retard')), hue: '#c4584f' }
  ];

  return (
    <div className="fadein">
      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8, color: s.hue }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Factures</div>
          <button onClick={() => setShowForm(true)} className="btn-ghost" style={{
            display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', border: '1px solid var(--border)',
            borderRadius: 9, background: 'var(--surface)', color: 'var(--fg)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer'
          }}><Plus size={13} strokeWidth={2.4} />Nouvelle facture</button>
        </div>

        {invoices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--fg-faint)' }}>
            <Receipt size={32} style={{ margin: '0 auto 12px', opacity: .4 }} />
            <p style={{ margin: 0 }}>Aucune facture</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 640 }}>
              <div className="invoices-row" style={{ padding: '11px 20px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fg-faint)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>
                <div>Facture</div><div>Client</div><div>Montant</div><div>Statut</div><div>Échéance</div>
              </div>
              {invoices.map(inv => {
                const stc = INVOICE_STATUSES[inv.statut] || INVOICE_STATUSES.en_attente;
                return (
                  <div key={inv.id} className="row-hover invoices-row" style={{ padding: '13px 20px', borderBottom: '1px solid var(--border)', fontSize: 13.5, alignItems: 'center' }}>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)' }}>{inv.reference}</div>
                    <button onClick={() => openDeal(inv.client_id)} style={{ border: 'none', background: 'transparent', padding: 0, fontWeight: 700, fontFamily: 'inherit', fontSize: 13.5, color: 'var(--fg)', cursor: 'pointer', textAlign: 'left' }}>{inv.prenom} {inv.nom}</button>
                    <div style={{ fontWeight: 800 }}>{money(inv.montant)}</div>
                    <div>
                      <select value={inv.statut} onChange={e => changeStatus(inv, e.target.value)} style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: soft(stc.hue), color: stc.hue,
                        border: 'none', fontFamily: 'inherit', cursor: 'pointer'
                      }}>
                        {Object.entries(INVOICE_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div style={{ color: 'var(--fg-muted)' }}>{inv.date_echeance ? new Date(inv.date_echeance).toLocaleDateString('fr-CA') : '—'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fadein" onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,6,.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div className="popin" onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.35)', padding: 24 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>Nouvelle facture</h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div>
                <div style={labelStyle}>Client</div>
                <select required value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} style={inputStyle}>
                  <option value="">Sélectionner un client…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Montant</div>
                  <input type="number" value={form.montant} onChange={e => setForm(f => ({ ...f, montant: e.target.value }))} placeholder="0 $" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Échéance</div>
                  <input type="date" value={form.date_echeance} onChange={e => setForm(f => ({ ...f, date_echeance: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, height: 42, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', color: 'var(--fg)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
                <button type="submit" style={{ flex: 1, height: 42, border: 'none', borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-fg)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Créer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
