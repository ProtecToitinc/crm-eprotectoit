import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Receipt, Plus, Trash2 } from 'lucide-react';
import { useUI } from '../context/UIContext';
import { INVOICE_STATUSES, money, soft } from '../constants';
import { api } from '../api';
import { parseDb, fmtDay, fmtDbDay, daysFromToday } from '../lib/dates';
import { fullName } from '../lib/search';
import { cmpText, cmpValue, useStoredChoice } from '../lib/sort';
import { Modal, Field, ClientPicker, SortSelect, inputStyle, btnGhost, btnAccent } from '../components/ui';

const SORTS = [
  { value: 'recent', label: 'Plus récentes' },
  { value: 'ancien', label: 'Plus anciennes' },
  { value: 'client', label: 'Client A → Z' },
  { value: 'client_za', label: 'Client Z → A' },
  { value: 'montant', label: 'Montant (plus élevé)' },
  { value: 'montant_asc', label: 'Montant (plus petit)' },
  { value: 'echeance', label: 'Échéance la plus proche' },
  { value: 'statut', label: 'Statut' }
];

const STATUS_ORDER = Object.keys(INVOICE_STATUSES);
const stamp = i => parseDb(i.created_at)?.getTime() ?? 0;

function comparator(sort) {
  const recent = (a, b) => stamp(b) - stamp(a) || b.id - a.id;
  return {
    recent,
    ancien: (a, b) => stamp(a) - stamp(b) || a.id - b.id,
    client: (a, b) => cmpText(fullName(a), fullName(b)) || recent(a, b),
    client_za: (a, b) => cmpText(fullName(b), fullName(a)) || recent(a, b),
    montant: (a, b) => (Number(b.montant) || 0) - (Number(a.montant) || 0) || recent(a, b),
    montant_asc: (a, b) => (Number(a.montant) || 0) - (Number(b.montant) || 0) || recent(a, b),
    echeance: (a, b) => cmpValue(a.date_echeance, b.date_echeance, 1) || recent(a, b),
    statut: (a, b) => STATUS_ORDER.indexOf(a.statut) - STATUS_ORDER.indexOf(b.statut) || recent(a, b)
  }[sort] || recent;
}

const EMPTY_FORM = { client_id: '', montant: '', date_echeance: '', statut: 'en_attente' };

export default function Facturation() {
  const [invoices, setInvoices] = useState(null);
  const [error, setError] = useState('');
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [sort, setSort] = useStoredChoice('crm_invoices_sort', 'recent', SORTS.map(s => s.value));
  const { refreshKey, openDeal, bumpRefresh, showToast } = useUI();

  const load = useCallback(() => {
    api.invoices.list().then(r => { setInvoices(r || []); setError(''); }).catch(e => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    if (showForm) api.clients.list().then(r => setClients(r || [])).catch(() => {});
  }, [showForm]);

  async function changeStatus(inv, statut) {
    try {
      await api.invoices.update(inv.id, { statut });
      load();
      bumpRefresh();
    } catch (e) {
      showToast(e.message || 'Impossible de changer le statut');
    }
  }

  async function deleteInvoice(inv) {
    if (!window.confirm(`Supprimer définitivement la facture ${inv.reference} de ${fullName(inv)} ? Le client et sa soumission seront conservés.`)) return;
    setDeletingId(inv.id);
    try {
      await api.invoices.delete(inv.id);
      load();
      bumpRefresh();
      showToast('Facture supprimée');
    } catch (e) {
      showToast(e.message || 'Suppression impossible');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setFormError('');
    if (!form.client_id) return setFormError('Choisissez un client');
    setSaving(true);
    try {
      await api.invoices.create(form);
      setShowForm(false);
      setForm(EMPTY_FORM);
      load();
      bumpRefresh();
      showToast('Facture créée avec succès');
    } catch (ex) {
      setFormError(ex.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  const list = invoices || [];
  const sorted = useMemo(() => [...list].sort(comparator(sort)), [list, sort]);

  const now = new Date();
  const sameMonth = i => {
    const d = parseDb(i.updated_at || i.created_at);
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };
  const sum = (statut, filter = () => true) => list.filter(i => i.statut === statut && filter(i)).reduce((a, i) => a + (Number(i.montant) || 0), 0);
  const stats = [
    { label: 'Encaissé ce mois', value: money(sum('payee', sameMonth)), hue: '#5f9d5f' },
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Factures</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <SortSelect value={sort} onChange={setSort} options={SORTS} />
            <button onClick={() => setShowForm(true)} className="btn-ghost" style={{ ...btnGhost, height: 38, fontSize: 12.5 }}>
              <Plus size={13} strokeWidth={2.4} />Nouvelle facture
            </button>
          </div>
        </div>

        {error && <div role="alert" style={{ padding: 20, color: '#c4584f', fontSize: 13.5, fontWeight: 600 }}>{error}</div>}
        {!invoices && !error && <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13.5 }}>Chargement…</div>}

        {invoices && invoices.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--fg-faint)' }}>
            <Receipt size={32} style={{ margin: '0 auto 12px', opacity: .4 }} />
            <p style={{ margin: 0 }}>Aucune facture</p>
          </div>
        )}

        {invoices && invoices.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 760 }}>
              <div className="invoices-row" style={{ padding: '11px 20px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', color: 'var(--fg-faint)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>
                <div>Facture</div><div>Client</div><div>Montant</div><div>Statut</div><div>Échéance</div><div>Actions</div>
              </div>
              {sorted.map(inv => {
                const stc = INVOICE_STATUSES[inv.statut] || INVOICE_STATUSES.en_attente;
                const late = inv.statut !== 'payee' && inv.date_echeance && daysFromToday(inv.date_echeance) < 0;
                return (
                  <div key={inv.id} className="row-hover invoices-row" style={{ padding: '13px 20px', borderBottom: '1px solid var(--border)', fontSize: 13.5, alignItems: 'center' }}>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)' }}>{inv.reference}</div>
                    <button onClick={() => openDeal(inv.client_id)} style={{ border: 'none', background: 'transparent', padding: 0, fontWeight: 700, fontFamily: 'inherit', fontSize: 13.5, color: 'var(--fg)', cursor: 'pointer', textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName(inv) || '—'}</button>
                    <div style={{ fontWeight: 800 }}>{money(inv.montant)}</div>
                    <div>
                      <select value={inv.statut} onChange={e => changeStatus(inv, e.target.value)} aria-label="Statut de la facture" style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: soft(stc.hue), color: stc.hue,
                        border: 'none', fontFamily: 'inherit', cursor: 'pointer'
                      }}>
                        {Object.entries(INVOICE_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div style={{ color: late ? '#c4584f' : 'var(--fg-muted)', fontWeight: late ? 700 : 400 }}>{inv.date_echeance ? fmtDay(inv.date_echeance) : '—'}</div>
                    <button type="button" disabled={deletingId === inv.id} onClick={() => deleteInvoice(inv)} aria-label={`Supprimer la facture ${inv.reference}`} title="Supprimer la facture" style={{ ...btnGhost, color: '#c4584f', justifySelf: 'start', opacity: deletingId === inv.id ? .5 : 1 }}><Trash2 size={15} /> Supprimer</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <Modal
          title="Nouvelle facture"
          onClose={() => setShowForm(false)}
          onSubmit={handleCreate}
          width={460}
          footer={
            <>
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost" style={btnGhost}>Annuler</button>
              <button type="submit" disabled={saving} className="btn-accent" style={{ ...btnAccent, opacity: saving ? 0.7 : 1 }}>{saving ? 'Création…' : 'Créer'}</button>
            </>
          }
        >
          <Field label="Client">
            <ClientPicker clients={clients} value={form.client_id} onChange={id => setForm(f => ({ ...f, client_id: id }))} autoFocus />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <Field label="Montant">
              <input type="number" min="0" step="0.01" inputMode="decimal" value={form.montant} onChange={e => setForm(f => ({ ...f, montant: e.target.value }))} placeholder="0 $" style={inputStyle} />
            </Field>
            <Field label="Échéance">
              <input type="date" value={form.date_echeance} onChange={e => setForm(f => ({ ...f, date_echeance: e.target.value }))} style={inputStyle} />
            </Field>
          </div>
          {formError && <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: '#c4584f', background: soft('#c4584f'), borderRadius: 9, padding: '9px 12px' }}>{formError}</div>}
        </Modal>
      )}
    </div>
  );
}
