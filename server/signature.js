'use strict';
/**
 * Signature en ligne d'une soumission et rapport mensuel.
 * - Le CRM crée un lien privé (jeton aléatoire, valable 30 jours, haché en base).
 * - Le client ouvre le lien sans compte, lit le résumé, écrit son nom et signe au doigt.
 * - La signature (image), le nom, la date, l'adresse IP et l'appareil sont conservés comme preuve.
 */
const crypto = require('crypto');
const db = require('./database');
const google = require('./google');
const { addHistory, getSetting } = require('./lib');

const CRM_URL = process.env.CRM_PUBLIC_URL || 'https://crm-eprotectoit-production.up.railway.app';
const DAYS = 30;
const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const nom = c => [c.prenom, c.nom].filter(Boolean).join(' ') || 'Client';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cash = n => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(Number(n) || 0);

// Limite simple contre les essais de jetons au hasard : 30 requêtes par 10 min et par adresse
const hits = new Map();
function limited(ip) {
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h.since > 600000) { hits.set(ip, { n: 1, since: now }); if (hits.size > 5000) hits.clear(); return false; }
  return ++h.n > 30;
}

async function migrate() {
  await db.run(`CREATE TABLE IF NOT EXISTS signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    created_by TEXT,
    signed_at TEXT,
    signer_name TEXT,
    signature_png TEXT,
    ip TEXT,
    user_agent TEXT
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_signatures_quote ON signatures(quote_id)');
}

const quoteRow = id => db.get('SELECT q.*, c.prenom, c.nom, c.email, c.telephone, c.adresse, c.ville FROM quotes q JOIN clients c ON c.id=q.client_id WHERE q.id=?', [id]);
async function byToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  return db.get('SELECT * FROM signatures WHERE token_hash=?', [hash(token)]);
}
const expired = s => Date.parse(String(s.expires_at).replace(' ', 'T') + 'Z') < Date.now();

function register(app, { auth }) {
  migrate().catch(e => console.error('[signature] migration', e.message));

  // --- côté CRM (protégé)
  app.get('/api/quotes/:id/signature', auth, async (req, res) => {
    const s = await db.get('SELECT id, created_at, expires_at, signed_at, signer_name, signature_png, ip FROM signatures WHERE quote_id=? ORDER BY (signed_at IS NULL), id DESC LIMIT 1', [req.params.id]);
    res.json(s ? { ...s, expire: !s.signed_at && expired(s) } : null);
  });
  app.post('/api/quotes/:id/signature', auth, async (req, res) => {
    const q = await quoteRow(req.params.id);
    if (!q) return res.status(404).json({ message: 'Soumission introuvable' });
    if (await db.get('SELECT 1 FROM signatures WHERE quote_id=? AND signed_at IS NOT NULL', [q.id])) return res.status(409).json({ message: 'Cette soumission est déjà signée.' });
    const token = crypto.randomBytes(32).toString('base64url');
    await db.run('DELETE FROM signatures WHERE quote_id=? AND signed_at IS NULL', [q.id]); // un seul lien actif à la fois
    await db.run("INSERT INTO signatures (quote_id, token_hash, expires_at, created_by) VALUES (?, ?, datetime('now', ?), ?)", [q.id, hash(token), `+${DAYS} days`, req.session?.user || null]);
    const url = `${CRM_URL}/signer/${token}`;
    let envoye = false, erreur = '';
    if (req.body?.envoyer) {
      if (!q.email) erreur = 'Ce client n’a pas de courriel : copie le lien et envoie-le par texto.';
      else {
        try {
          const text = `Bonjour${q.prenom ? ' ' + q.prenom : ''},\n\nVoici votre soumission ProtecToit ${q.reference}${q.service ? ` (${q.service})` : ''} au montant de ${cash(q.montant)}.\n\nPour l’accepter, signez en ligne ici (lien valable ${DAYS} jours) :\n${url}\n\nMerci de votre confiance,\nL’équipe ProtecToit`;
          await google.sendMail({ to: q.email, subject: `Votre soumission ProtecToit ${q.reference} — signature en ligne`, text, html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${esc(text).replace(/\n/g, '<br>').replace(esc(url), `<a href="${esc(url)}">Signer ma soumission</a>`)}</div>` });
          envoye = true;
          await addHistory(q.client_id, 'soumission', `Lien de signature de ${q.reference} envoyé par courriel`);
        } catch (e) { erreur = 'Envoi du courriel impossible : copie le lien.'; }
      }
    }
    res.status(201).json({ url, expire_dans_jours: DAYS, envoye, erreur, courriel: q.email || null });
  });

  // --- côté client (public, par jeton)
  app.get('/api/signature/:token', async (req, res) => {
    if (limited(req.ip || '')) return res.status(429).json({ message: 'Trop de demandes. Réessayez plus tard.' });
    const s = await byToken(req.params.token);
    if (!s) return res.status(404).json({ message: 'Lien invalide.' });
    const q = await quoteRow(s.quote_id);
    if (!q) return res.status(404).json({ message: 'Lien invalide.' });
    if (!s.signed_at && expired(s)) return res.status(410).json({ message: 'Ce lien a expiré. Demandez-en un nouveau à ProtecToit.' });
    res.json({ reference: q.reference, service: q.service, montant: q.montant, client: nom(q), adresse: [q.adresse, q.ville].filter(Boolean).join(', '), notes: q.notes && !/import[ée]\s*drive/i.test(q.notes) ? String(q.notes).slice(0, 1500) : '',
      signe: !!s.signed_at, signe_le: s.signed_at, signe_par: s.signed_at ? s.signer_name : null, entreprise: 'ProtecToit inc.' });
  });
  app.post('/api/signature/:token', async (req, res) => {
    if (limited(req.ip || '')) return res.status(429).json({ message: 'Trop de demandes. Réessayez plus tard.' });
    const s = await byToken(req.params.token);
    if (!s) return res.status(404).json({ message: 'Lien invalide.' });
    if (s.signed_at) return res.status(409).json({ message: 'Cette soumission est déjà signée.' });
    if (expired(s)) return res.status(410).json({ message: 'Ce lien a expiré. Demandez-en un nouveau à ProtecToit.' });
    const name = String(req.body?.nom || '').trim().slice(0, 120), png = String(req.body?.signature || '');
    if (name.length < 3) return res.status(400).json({ message: 'Écrivez votre nom complet.' });
    if (req.body?.accepte !== true) return res.status(400).json({ message: 'Cochez la case pour accepter la soumission.' });
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]{800,400000}$/.test(png)) return res.status(400).json({ message: 'Signez dans le cadre avant d’envoyer.' });
    const done = await db.run("UPDATE signatures SET signed_at=datetime('now'), signer_name=?, signature_png=?, ip=?, user_agent=? WHERE id=? AND signed_at IS NULL", [name, png, req.ip || '', String(req.headers['user-agent'] || '').slice(0, 200), s.id]);
    if (!done.changes) return res.status(409).json({ message: 'Cette soumission est déjà signée.' });
    const q = await quoteRow(s.quote_id);
    await db.run("UPDATE quotes SET statut='acceptee', updated_at=datetime('now') WHERE id=? AND statut<>'acceptee'", [q.id]);
    await addHistory(q.client_id, 'soumission', `Soumission ${q.reference} signée en ligne par ${name}`);
    res.json({ ok: true });
    // Avis à l'équipe (sans bloquer la réponse au client)
    try {
      const to = ((await getSetting('notify_emails')) || 'info@eprotectoit.com').split(/[;,\s]+/).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
      if (to.length) await google.sendMail({ to: to.join(', '), subject: `Soumission ${q.reference} signée — ${nom(q)}`, text: `${name} vient de signer la soumission ${q.reference} (${cash(q.montant)}).\n\nCRM : ${CRM_URL}/soumissions`, html: `<p><strong>${esc(name)}</strong> vient de signer la soumission ${esc(q.reference)} (${esc(cash(q.montant))}).</p><p><a href="${esc(CRM_URL)}/soumissions">Voir dans le CRM</a></p>` });
    } catch { /* l'avis est facultatif */ }
  });

  // --- rapport mensuel (protégé)
  app.get('/api/rapport', auth, async (req, res) => {
    const now = new Date();
    const mois = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.mois || '') ? req.query.mois : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [y, m] = mois.split('-').map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    const one = async month => {
      const g = (sql, p = [month]) => db.get(sql, p);
      const [ventes, encaisse, leads, convertis, soumissions, perdues, chantiers, appels, clients] = await Promise.all([
        g("SELECT COUNT(*) n, COALESCE(SUM(montant),0) v FROM quotes WHERE statut='acceptee' AND substr(updated_at,1,7)=?"),
        g("SELECT COUNT(*) n, COALESCE(SUM(montant),0) v FROM invoices WHERE statut='payee' AND substr(updated_at,1,7)=?"),
        g('SELECT COUNT(*) n FROM leads WHERE substr(recu_at,1,7)=?'),
        g("SELECT COUNT(*) n FROM leads WHERE statut='converti' AND substr(recu_at,1,7)=?"),
        g('SELECT COUNT(*) n, COALESCE(SUM(montant),0) v FROM quotes WHERE substr(created_at,1,7)=?'),
        g("SELECT COUNT(*) n FROM quotes WHERE statut='refusee' AND substr(updated_at,1,7)=?"),
        g("SELECT COUNT(*) n FROM chantiers WHERE statut IN ('termine','paye') AND substr(updated_at,1,7)=?"),
        g('SELECT COUNT(*) n FROM appels WHERE substr(date_appel,1,7)=?'),
        g('SELECT COUNT(*) n FROM clients WHERE substr(created_at,1,7)=?')
      ]);
      return { ventes: ventes.n, vendu: ventes.v, factures_payees: encaisse.n, encaisse: encaisse.v, prospects: leads.n, prospects_convertis: convertis.n, soumissions: soumissions.n, soumissions_valeur: soumissions.v, soumissions_perdues: perdues.n, chantiers_termines: chantiers.n, appels: appels.n, nouveaux_clients: clients.n };
    };
    const [courant, precedent, services, raisons, meilleures] = await Promise.all([
      one(mois), one(prev),
      db.all("SELECT COALESCE(service,'Non précisé') service, COUNT(*) n, COALESCE(SUM(montant),0) v FROM quotes WHERE statut='acceptee' AND substr(updated_at,1,7)=? GROUP BY 1 ORDER BY v DESC", [mois]),
      db.all("SELECT COALESCE(NULLIF(TRIM(raison_perte),''),'Non précisée') raison, COUNT(*) n FROM quotes WHERE statut='refusee' AND substr(updated_at,1,7)=? GROUP BY 1 ORDER BY n DESC LIMIT 5", [mois]),
      db.all("SELECT q.reference, q.montant, q.service, c.prenom, c.nom FROM quotes q JOIN clients c ON c.id=q.client_id WHERE q.statut='acceptee' AND substr(q.updated_at,1,7)=? ORDER BY q.montant DESC LIMIT 5", [mois])
    ]);
    res.json({ mois, precedent_mois: prev, courant, precedent, services, raisons, meilleures: meilleures.map(x => ({ reference: x.reference, montant: x.montant, service: x.service, client: nom(x) })) });
  });
}

module.exports = { register };
