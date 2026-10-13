'use strict';
const db = require('./database');
const { localParts } = require('./lib');
const money = x => Math.round((Number(x) || 0) * 100) / 100;
const iso = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null;
const asTorontoDay = value => {
  const d = new Date(String(value || '').replace(' ', 'T') + (String(value || '').includes('Z') ? '' : 'Z'));
  return Number.isFinite(d.getTime()) ? localParts(d).date : null;
};
function monday(day) {
  const d = new Date(day + 'T12:00:00Z');
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}
function windowFor(period, today) {
  const year = today.slice(0, 4), month = today.slice(0, 7);
  if (period === 'semaine') {
    const start = monday(today);
    const beginning = new Date(start + 'T12:00:00Z'); beginning.setUTCDate(beginning.getUTCDate() - 7 * 11);
    return { start: beginning.toISOString().slice(0, 10), key: day => monday(day), label: key => key.slice(5) };
  }
  if (period === 'annee') {
    const start = String(Number(year) - 4) + '-01-01';
    return { start, key: day => day.slice(0, 7), label: key => key };
  }
  return { start: year + '-01-01', key: day => day.slice(0, 7), label: key => key };
}
function register(app, { auth }) {
  app.get('/api/performance', auth, async (req, res) => {
    const period = ['semaine', 'mois', 'annee'].includes(req.query.periode) ? req.query.periode : 'mois';
    const today = localParts().date;
    const from = windowFor(period, today);
    // A sale is an accepted quote, never an open quote or an invoice counted again.
    // Montants de soumission peuvent inclure taxes : libellé explicite côté UI.
    const [quotes, invoices] = await Promise.all([
      db.all("SELECT id, montant, updated_at FROM quotes WHERE statut='acceptee' AND updated_at >= ?", [from.start + ' 00:00:00']),
      db.all("SELECT id, montant, updated_at FROM invoices WHERE statut='payee' AND updated_at >= ?", [from.start + ' 00:00:00'])
    ]);
    const grouped = new Map();
    const upsert = key => { if (!grouped.has(key)) grouped.set(key, { key, label: from.label(key), ventes: 0, vendu: 0, encaisse: 0 }); return grouped.get(key); };
    for (const q of quotes) {
      const day = asTorontoDay(q.updated_at);
      if (!iso(day) || day > today || day < from.start) continue;
      const row = upsert(from.key(day));
      row.ventes++; row.vendu += Number(q.montant) || 0;
    }
    for (const i of invoices) {
      const day = asTorontoDay(i.updated_at);
      if (!iso(day) || day > today || day < from.start) continue;
      upsert(from.key(day)).encaisse += Number(i.montant) || 0;
    }
    const points = [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key)).map(p => ({ ...p, vendu: money(p.vendu), encaisse: money(p.encaisse) }));
    const summarize = fn => {
      const todayDate = new Date(today + 'T12:00:00Z'), year = today.slice(0, 4), month = today.slice(0, 7), week = monday(today);
      const match = day => (fn === 'semaine' ? monday(day) === week : fn === 'mois' ? day.slice(0, 7) === month : day.slice(0, 4) === year);
      const val = { ventes: 0, vendu: 0, encaisse: 0 };
      for (const q of quotes) { const day = asTorontoDay(q.updated_at); if (iso(day) && day <= today && match(day)) { val.ventes++; val.vendu += Number(q.montant) || 0; } }
      for (const i of invoices) { const day = asTorontoDay(i.updated_at); if (iso(day) && day <= today && match(day)) val.encaisse += Number(i.montant) || 0; }
      return { ventes: val.ventes, vendu: money(val.vendu), encaisse: money(val.encaisse) };
    };
    const summary = { semaine: summarize('semaine'), mois: summarize('mois'), annee: summarize('annee') };
    // Full-year boundaries are covered because from.start is no later than Jan 1 of current year.
    res.json({ periode: period, today, summary, points, definition: 'Ventes = soumissions acceptées; montants basés sur les soumissions et factures, potentiellement taxes incluses. La date reflète la dernière modification du statut, pas nécessairement la signature ou le paiement. Le profit n’est pas calculé ici.' });
  });
}
module.exports = { register, monday, windowFor };
