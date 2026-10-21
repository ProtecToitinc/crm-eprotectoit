'use strict';
// CRM eProtectoIT — leads Meta (section « Opportunités »), webhook, suivi et notifications. Node >= 18.
const crypto = require('crypto');
const db = require('./database');
const google = require('./google');
const { phoneKey, emailKey, getSetting, setSetting, getSecret, setSecret, addHistory } = require('./lib');

const CRM_URL = process.env.CRM_PUBLIC_URL || 'https://crm-eprotectoit-production.up.railway.app';
const GRAPH_VERSION = /^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION || '') ? process.env.META_GRAPH_VERSION : 'v23.0';
const STATUSES = ['nouveau', 'a_rappeler', 'contacte', 'qualifie', 'negociation', 'non_admissible', 'perdu', 'converti'];
const statuses = new Set(STATUSES);
const NO_ANSWER_DELAYS_DAYS = [1, 2, 4]; // tentatives suivantes après « pas de réponse »
const LOCK_MINUTES = 30;                 // durée d'une prise en charge (évite que 2 personnes rappellent le même client)

const key = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const text = v => Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v).trim());
const short = (v, max = 2000) => text(v).slice(0, max);
const esc = s => text(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const setting = async (name, fallback = '') => (await getSetting(name)) || fallback;
const set = async (name, value) => setSetting(name, String(value ?? ''));
const errMsg = error => short(error?.message || error, 300).replace(/access_token=[^&\s]+/gi, 'access_token=[masqué]');
const fullName = lead => [lead.prenom, lead.nom].filter(Boolean).join(' ') || '(sans nom)';
const hash = data => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const userOf = req => req.session?.user || short(req.headers['x-crm-user'], 40) || 'quelqu’un';

async function matchingClient(lead) {
  const phone = phoneKey(lead.telephone), email = emailKey(lead.email);
  if (!phone && !email) return null;
  const candidates = await db.all('SELECT id, telephone, email FROM clients');
  const match = candidates.filter(c => (phone && phoneKey(c.telephone) === phone) || (email && emailKey(c.email) === email));
  return match.length === 1 ? match[0].id : null;
}

/** Transforme un lead Facebook (field_data) ou un JSON de webhook Make/Zapier en ligne `leads`. */
function normalize(body, source = 'webhook') {
  const input = (body && typeof body === 'object') ? body : {};
  const fields = {};
  for (const f of input.field_data || []) fields[key(f.name)] = text(f.values || f.value);
  for (const [k, v] of Object.entries(input)) if (k !== 'field_data') fields[key(k)] = v;
  const get = (...aliases) => {
    for (const a of aliases) if (fields[key(a)] != null && text(fields[key(a)]).trim()) return text(fields[key(a)]).trim();
    return '';
  };
  const full = get('full_name', 'name', 'nom_complet', 'nom complet');
  let prenom = get('first_name', 'prenom', 'prénom');
  let nom = get('last_name', 'nom_de_famille', 'lastname', 'nom');
  if (full && !prenom && !nom) { const words = full.trim().split(/\s+/); prenom = words.shift() || ''; nom = words.join(' '); }
  const used = new Set(['full_name', 'name', 'nom_complet', 'nom complet', 'first_name', 'prenom', 'prénom', 'last_name', 'nom_de_famille', 'lastname', 'nom', 'email', 'courriel', 'email_address', 'phone_number', 'phone', 'telephone', 'téléphone', 'mobile', 'city', 'ville', 'street_address', 'address', 'adresse', 'zip_code', 'postal_code', 'code_postal', 'message', 'campaign_name', 'campagne', 'adset_name', 'ensemble', 'ad_name', 'annonce', 'form_id', 'formulaire', 'form_name', 'platform', 'plateforme', 'id', 'lead_id', 'external_id', 'created_time', 'field_data', 'source', 'is_organic', 'ad_id', 'adset_id', 'campaign_id'].map(key));
  const extras = Object.entries(fields).filter(([k, v]) => !used.has(k) && v != null && text(v)).map(([k, v]) => `${k} : ${text(v)}`);
  const providerId = short(get('id', 'lead_id', 'external_id'), 180);
  const obj = {
    source, external_id: providerId, hashed: !providerId,
    prenom: short(prenom, 180), nom: short(nom, 180),
    email: short(get('email', 'courriel', 'email_address'), 320),
    telephone: short(get('phone_number', 'telephone', 'téléphone', 'phone', 'mobile'), 80),
    adresse: short(get('street_address', 'adresse', 'address'), 300),
    ville: short(get('city', 'ville'), 150), code_postal: short(get('zip_code', 'postal_code', 'code_postal'), 30),
    message: short([get('message'), ...extras].filter(Boolean).join('\n'), 5000),
    campagne: short(get('campaign_name', 'campagne'), 300), ensemble: short(get('adset_name', 'ensemble'), 300),
    annonce: short(get('ad_name', 'annonce'), 300), formulaire: short(get('form_id', 'formulaire'), 180),
    form_name: short(get('form_name'), 300), plateforme: short(get('platform', 'plateforme'), 100),
    campaign_id: short(get('campaign_id'), 100), adset_id: short(get('adset_id'), 100), ad_id: short(get('ad_id'), 100),
    donnees: JSON.stringify(input).slice(0, 25000),
    recu_at: get('created_time') || new Date().toISOString()
  };
  if (!obj.external_id) obj.external_id = hash({ source, full, prenom, nom, email: obj.email, telephone: obj.telephone, donnees: obj.donnees });
  return obj;
}

// ---------- notifications par courriel ----------
const recipientsOf = async () => (await setting('notify_emails', 'info@eprotectoit.com')).split(/[;,\s]+/).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
function leadRows(l) {
  return [['Nom', fullName(l)], ['Téléphone', l.telephone], ['Courriel', l.email], ['Adresse', [l.adresse, l.ville, l.code_postal].filter(Boolean).join(', ')],
    ['Campagne', l.campagne], ['Annonce', l.annonce], ['Formulaire', l.form_name || l.formulaire], ['Réponses', l.message]];
}
async function sendDigestOrSingle(leads, recipients) {
  const single = leads.length === 1;
  const l = leads[0];
  const subject = single
    ? `Nouveau lead${l.source === 'meta' ? ' Meta' : ''} : ${fullName(l)} — ${l.ville || 'ville inconnue'}`
    : `${leads.length} nouveaux leads à traiter`;
  const blocks = leads.map(x => leadRows(x));
  const plain = blocks.map(rows => rows.map(([k, v]) => `${k}: ${v || '—'}`).join('\n')).join('\n\n———\n\n') + `\n\nCRM : ${CRM_URL}/opportunites`;
  const html = (single ? '<h2>Nouveau lead</h2>' : `<h2>${leads.length} nouveaux leads</h2>`) +
    blocks.map(rows => `<table>${rows.map(([k, v]) => `<tr><th style="text-align:left;padding:6px;vertical-align:top">${esc(k)}</th><td style="padding:6px;white-space:pre-wrap">${esc(v || '—')}</td></tr>`).join('')}</table><hr>`).join('') +
    `<p><a href="${esc(CRM_URL)}/opportunites">Voir dans le CRM</a></p>`;
  // Un seul courriel pour tous les destinataires : un échec ne peut donc pas provoquer de doublons au renvoi.
  await google.sendMail({ to: recipients.join(', '), subject, text: plain, html });
}
/** Réservation atomique (notifie 0 -> 3) : deux appels simultanés ne peuvent pas envoyer deux courriels. */
async function notifyLead(id) {
  const claim = await db.run("UPDATE leads SET notifie=3, updated_at=datetime('now') WHERE id=? AND notifie=0", [id]);
  if (!claim.changes) return { skipped: true };
  const l = await db.get('SELECT * FROM leads WHERE id=?', [id]);
  const recipients = await recipientsOf();
  if (!recipients.length) {
    await db.run("UPDATE leads SET notifie=0, notif_erreur='Aucun destinataire valide' WHERE id=?", [id]);
    return { ok: false };
  }
  try {
    await sendDigestOrSingle([l], recipients);
    await db.run("UPDATE leads SET notifie=1, notif_erreur=NULL, updated_at=datetime('now') WHERE id=?", [id]);
    await set('notify_last_ok', new Date().toISOString()); await set('notify_last_error', '');
    return { ok: true };
  } catch (error) {
    await db.run("UPDATE leads SET notifie=0, notif_tentatives=notif_tentatives+1, notif_erreur=?, updated_at=datetime('now') WHERE id=?", [errMsg(error), id]);
    await set('notify_last_error', errMsg(error));
    return { ok: false, message: 'Envoi impossible; nouvelle tentative prévue' };
  }
}
/** Reprise des envois échoués ; au-delà de 3 leads en attente, un seul courriel récapitulatif. */
async function retryNotifications() {
  await db.run("UPDATE leads SET notifie=0 WHERE notifie=3 AND datetime(updated_at) < datetime('now','-15 minutes')"); // réservations oubliées (redémarrage)
  const rows = await db.all("SELECT id FROM leads WHERE notifie=0 AND datetime(created_at)>datetime('now','-14 days') ORDER BY id LIMIT 50");
  if (!rows.length) return { sent: 0 };
  if (rows.length < 4) { for (const row of rows) await notifyLead(row.id); return { sent: rows.length }; }
  const ids = rows.map(r => r.id);
  const claim = await db.run(`UPDATE leads SET notifie=3, updated_at=datetime('now') WHERE notifie=0 AND id IN (${ids.map(() => '?').join(',')})`, ids);
  if (!claim.changes) return { sent: 0 };
  const leads = await db.all(`SELECT * FROM leads WHERE notifie=3 AND id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids);
  const recipients = await recipientsOf();
  try {
    if (!recipients.length) throw new Error('Aucun destinataire valide');
    await sendDigestOrSingle(leads, recipients);
    await db.run(`UPDATE leads SET notifie=1, notif_erreur=NULL WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    await set('notify_last_ok', new Date().toISOString()); await set('notify_last_error', '');
    return { sent: leads.length };
  } catch (error) {
    await db.run(`UPDATE leads SET notifie=0, notif_tentatives=notif_tentatives+1, notif_erreur=? WHERE id IN (${ids.map(() => '?').join(',')})`, [errMsg(error), ...ids]);
    await set('notify_last_error', errMsg(error));
    return { sent: 0 };
  }
}

// ---------- ajout d'un lead (sans doublon) ----------
async function findDuplicate(l) {
  const sameId = await db.get('SELECT id FROM leads WHERE source=? AND external_id=?', [l.source, l.external_id]);
  if (sameId) return { id: sameId.id, reason: 'même identifiant' };
  // Un lead Meta reçu à la fois par Make et par l'API Meta garde le même identifiant fournisseur.
  if (!l.hashed) {
    const other = await db.get('SELECT id FROM leads WHERE external_id=?', [l.external_id]);
    if (other) return { id: other.id, reason: 'même identifiant (autre source)' };
  }
  const phone = phoneKey(l.telephone), mail = emailKey(l.email);
  if (phone || mail) {
    const recent = await db.all("SELECT id,telephone,email FROM leads WHERE datetime(created_at) > datetime('now','-1 day')");
    const hit = recent.find(r => (phone && phoneKey(r.telephone) === phone) || (mail && emailKey(r.email) === mail));
    if (hit) return { id: hit.id, reason: 'même contact dans les dernières 24 h' };
  }
  return null;
}
/** `silent` : lead déjà traité (vu, aucun envoi). `quiet` : lead nouveau, mais sans courriel ni réponse automatique (l'appelant prévient l'équipe lui-même). */
async function ingestLead(input, { silent = false, quiet = false, source = 'webhook' } = {}) {
  const l = input && input.source && input.donnees !== undefined ? input : normalize(input, source);
  const duplicate = await findDuplicate(l);
  if (duplicate) return { id: duplicate.id, duplicate: true, reason: duplicate.reason };
  const clientId = await matchingClient(l);
  const fields = ['source', 'external_id', 'prenom', 'nom', 'email', 'telephone', 'adresse', 'ville', 'code_postal', 'message', 'campagne', 'ensemble', 'annonce', 'formulaire', 'form_name', 'plateforme', 'campaign_id', 'adset_id', 'ad_id', 'donnees', 'recu_at'];
  const vals = fields.map(f => l[f] ?? null);
  try {
    const r = await db.run(`INSERT INTO leads (${fields.join(',')},statut,vu,client_id,notifie) VALUES (${fields.map(() => '?').join(',')},'nouveau',?,?,?)`, [...vals, silent ? 1 : 0, clientId, silent || quiet ? 2 : 0]);
    if (!silent && !quiet) {
      await notifyLead(r.lastID);
      require('./autoreply').queue(r.lastID).catch(e => console.error('[reponse-auto]', e.message)); // sans attendre : le webhook répond tout de suite
    }
    return { id: r.lastID, duplicate: false, client_id: clientId };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      const r = await db.get('SELECT id FROM leads WHERE source=? AND external_id=?', [l.source, l.external_id]);
      if (r) return { id: r.id, duplicate: true, reason: 'même identifiant' };
    }
    throw e;
  }
}

// ---------- webhook protégé par clé ----------
const truth = (a, b) => {
  if (!a || !b) return false;
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
async function webhookSecret() {
  let s = await getSecret('leads_webhook_key');
  if (!s) { s = crypto.randomBytes(32).toString('hex'); await setSecret('leads_webhook_key', s); }
  return s;
}
const badKeys = new Map(); // ip -> { n, since } : bloque les essais répétés de clés
function webhookBlocked(ip) { const f = badKeys.get(ip); return !!f && f.n >= 20 && Date.now() - f.since < 10 * 60 * 1000; }
function webhookFail(ip) { const f = badKeys.get(ip); if (!f || Date.now() - f.since > 10 * 60 * 1000) badKeys.set(ip, { n: 1, since: Date.now() }); else f.n++; }

// ---------- API Meta (Graph) ----------
let polling = false;
async function graphGet(endpoint, token, params = {}) {
  const u = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${endpoint.replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const response = await fetch(u, { headers: { Authorization: `Bearer ${token}` } }); // jeton en en-tête, jamais dans l'URL
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const detail = short(data.error?.message, 160).replace(/access_token=[^&\s]+/gi, '[masqué]');
    const e = new Error(data.error?.code === 190 ? 'Jeton Meta expiré ou révoqué : reconnecter Meta' : `Meta a refusé la requête${detail ? ` : ${detail}` : ''}`);
    e.code = data.error?.code; throw e;
  }
  return data;
}
async function graphPages(endpoint, token, params) {
  let cursor = null; const all = [];
  for (let i = 0; i < 30; i++) {
    const d = await graphGet(endpoint, token, { ...params, ...(cursor ? { after: cursor } : {}) });
    all.push(...(d.data || []));
    cursor = d.paging?.cursors?.after;
    if (!cursor || !d.paging?.next) break;
  }
  return all;
}
async function pollMeta({ historique = false } = {}) {
  if (polling) return { ok: false, message: 'Interrogation déjà en cours' };
  polling = true;
  try {
    const pageId = await setting('meta_page_id'), token = await getSecret('meta_page_token');
    if (!pageId || !token) return { ok: false, message: 'Meta non connecté' };
    if (!/^\d+$/.test(pageId)) return { ok: false, message: 'ID de Page invalide' };
    await set('meta_last_attempt', new Date().toISOString());
    const forms = await graphPages(`${pageId}/leadgen_forms`, token, { fields: 'id,name', limit: 100 });
    const lastOK = Date.parse(await setting('meta_last_ok'));
    // Reprise après une panne : on repart du dernier succès (marge de 10 min pour les arrivées tardives).
    const since = historique ? 0 : Math.floor(((Number.isFinite(lastOK) ? lastOK : Date.now()) - 10 * 60 * 1000) / 1000);
    let imported = 0, duplicates = 0;
    for (const f of forms) {
      const params = { fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,is_organic', limit: 100 };
      if (!historique) params.filtering = JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: since }]);
      const leads = await graphPages(`${f.id}/leads`, token, params);
      for (const lead of leads) {
        if (!historique && lead.created_time && Date.parse(lead.created_time) / 1000 < since) continue;
        const r = await ingestLead(normalize({ ...lead, form_id: lead.form_id || f.id, form_name: f.name }, 'meta'), { silent: historique });
        r.duplicate ? duplicates++ : imported++;
      }
    }
    await set('meta_last_ok', new Date().toISOString());
    await set('meta_last_error', '');
    return { ok: true, forms: forms.length, imported, duplicates };
  } catch (error) {
    await set('meta_last_error', errMsg(error));
    return { ok: false, message: errMsg(error) };
  } finally { polling = false; }
}

// ---------- suivi des leads ----------
async function convertLead(id) {
  const l = await db.get('SELECT * FROM leads WHERE id=?', [id]);
  if (!l) return null;
  if (l.statut === 'converti' && l.client_id) return { client_id: l.client_id, already: true };
  let clientId = l.client_id;
  if (!clientId) {
    clientId = await matchingClient(l);
    if (!clientId) {
      const r = await db.run('INSERT INTO clients (prenom,nom,email,telephone,adresse,ville,code_postal,notes) VALUES (?,?,?,?,?,?,?,?)',
        [l.prenom || '', l.nom || '', l.email, l.telephone, l.adresse, l.ville, l.code_postal, `Lead Meta : ${l.campagne || 'Formulaire'}`]);
      clientId = r.lastID;
    }
  }
  // Idempotent même si une conversion précédente a été interrompue
  const note = `Lead CRM #${l.id}`;
  let opp = await db.get('SELECT id FROM opportunites WHERE client_id=? AND notes LIKE ?', [clientId, `%${note}%`]);
  if (!opp) opp = await db.run('INSERT INTO opportunites (client_id,titre,etape,service,notes) VALUES (?,?,?,?,?)',
    [clientId, `Lead Meta - ${fullName(l)}`, 'lead', 'Protection Toiture', `${note}\n${l.message || ''}`]);
  await db.run("UPDATE leads SET client_id=?,statut='converti',vu=1,en_charge=NULL,en_charge_at=NULL,updated_at=datetime('now') WHERE id=?", [clientId, l.id]);
  await addHistory(clientId, 'lead', `Lead Meta converti en client${l.campagne ? ` (campagne : ${l.campagne})` : ''}`);
  return { client_id: clientId, opportunite_id: opp.id || opp.lastID };
}
const lockedBy = (lead, user) => {
  if (!lead.en_charge || !lead.en_charge_at) return null;
  const age = Date.now() - Date.parse(lead.en_charge_at.replace(' ', 'T') + 'Z');
  return age < LOCK_MINUTES * 60 * 1000 && lead.en_charge !== user ? lead.en_charge : null;
};
async function listLeads(query) {
  const params = [], conds = [];
  if (query.statut && statuses.has(query.statut)) { conds.push('l.statut=?'); params.push(query.statut); }
  if (query.q) { conds.push('(l.prenom LIKE ? OR l.nom LIKE ? OR l.email LIKE ? OR l.telephone LIKE ? OR l.ville LIKE ? OR l.campagne LIKE ?)'); params.push(...Array(6).fill(`%${short(query.q, 80)}%`)); }
  return db.all(`SELECT l.*, (SELECT COUNT(*) FROM lead_notes n WHERE n.lead_id=l.id) AS nb_notes
    FROM leads l ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''} ORDER BY datetime(l.recu_at) DESC, l.id DESC LIMIT 1000`, params);
}
function register(app, { auth }) {
  // Webhook public : clé secrète (en-tête x-webhook-key ou ?key=), jamais l'authentification du CRM.
  app.post('/api/webhooks/leads', async (req, res) => {
    const ip = req.ip || '';
    if (webhookBlocked(ip)) return res.status(429).json({ message: 'Trop d’essais' });
    if (!truth(req.headers['x-webhook-key'] || req.query.key, await webhookSecret())) { webhookFail(ip); return res.status(403).json({ message: 'Accès refusé' }); }
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ message: 'JSON invalide' });
    const r = await ingestLead(req.body, { source: 'webhook' });
    res.status(r.duplicate ? 200 : 201).json(r);
  });
  app.get('/api/leads', auth, async (req, res) => res.json(await listLeads(req.query)));
  app.get('/api/leads/count', auth, async (req, res) => {
    const r = await db.get("SELECT SUM(CASE WHEN vu=0 THEN 1 ELSE 0 END) AS count, SUM(CASE WHEN statut='nouveau' THEN 1 ELSE 0 END) AS nouveaux, SUM(CASE WHEN statut='a_rappeler' AND rappel_at IS NOT NULL AND datetime(rappel_at)<=datetime('now') THEN 1 ELSE 0 END) AS rappels FROM leads");
    res.json({ count: r.count || 0, nouveaux: r.nouveaux || 0, rappels: r.rappels || 0 });
  });
  app.post('/api/leads', auth, async (req, res) => res.status(201).json(await ingestLead(req.body, { source: 'manuel', silent: true })));
  app.post('/api/leads/mark-seen', auth, async (req, res) => { await db.run('UPDATE leads SET vu=1 WHERE vu=0'); res.json({ ok: true }); });
  app.post('/api/leads/import-historique', auth, async (req, res) => res.json(await pollMeta({ historique: true })));
  app.get('/api/leads/:id', auth, async (req, res) => {
    const lead = await db.get('SELECT * FROM leads WHERE id=?', [req.params.id]);
    if (!lead) return res.status(404).json({ message: 'Lead introuvable' });
    const [notes, client] = await Promise.all([
      db.all('SELECT * FROM lead_notes WHERE lead_id=? ORDER BY id DESC', [lead.id]),
      lead.client_id ? db.get('SELECT id,prenom,nom,telephone FROM clients WHERE id=?', [lead.client_id]) : null
    ]);
    res.json({ ...lead, donnees: undefined, notes, client, verrou: lockedBy(lead, userOf(req)) });
  });
  app.put('/api/leads/:id', auth, async (req, res) => {
    const allowed = ['statut', 'vu', 'prenom', 'nom', 'email', 'telephone', 'ville', 'adresse', 'code_postal', 'message', 'rappel_at', 'raison_perte'];
    const changes = Object.entries(req.body || {}).filter(([k]) => allowed.includes(k));
    if (changes.find(([k, v]) => k === 'statut' && !statuses.has(v))) return res.status(400).json({ message: 'Statut invalide' });
    if (!changes.length) return res.json({ ok: true });
    const extra = [];
    const st = changes.find(([k]) => k === 'statut')?.[1];
    if (st && ['contacte', 'qualifie', 'negociation'].includes(st)) extra.push(`dernier_contact='${nowSql()}'`);
    if (st && st !== 'a_rappeler' && !changes.some(([k]) => k === 'rappel_at')) extra.push('rappel_at=NULL');
    if (st) extra.push('vu=1');
    const q = [...changes.map(([k]) => `${k}=?`), ...extra, "updated_at=datetime('now')"].join(',');
    const r = await db.run(`UPDATE leads SET ${q} WHERE id=?`, [...changes.map(([k, v]) => k === 'vu' ? (v ? 1 : 0) : (v === '' && k === 'rappel_at' ? null : short(v, 5000))), req.params.id]);
    res.status(r.changes ? 200 : 404).json({ ok: !!r.changes });
  });
  // Résultat d'un appel : joint / pas de réponse (prochaine tentative automatique) / à rappeler à une date précise
  app.post('/api/leads/:id/contact', auth, async (req, res) => {
    const lead = await db.get('SELECT * FROM leads WHERE id=?', [req.params.id]);
    if (!lead) return res.status(404).json({ message: 'Lead introuvable' });
    const { resultat, note, rappel_at } = req.body || {};
    const who = userOf(req);
    let statut = lead.statut, rappel = null, tentatives = lead.tentatives, suggest = null;
    if (resultat === 'sans_reponse') {
      tentatives++;
      const days = NO_ANSWER_DELAYS_DAYS[tentatives - 1];
      statut = 'a_rappeler';
      if (days) { const d = new Date(Date.now() + days * 86400000); d.setUTCHours(14, 0, 0, 0); rappel = d.toISOString().replace('T', ' ').slice(0, 19); }
      else suggest = 'perdu';
    } else if (resultat === 'rappeler') {
      statut = 'a_rappeler'; rappel = rappel_at ? short(rappel_at, 30) : null;
    } else if (resultat === 'joint') {
      statut = ['qualifie', 'negociation', 'converti'].includes(lead.statut) ? lead.statut : 'contacte'; tentatives = 0;
    } else return res.status(400).json({ message: 'Résultat invalide' });
    await db.run("UPDATE leads SET statut=?, rappel_at=?, tentatives=?, dernier_contact=?, vu=1, en_charge=NULL, en_charge_at=NULL, updated_at=datetime('now') WHERE id=?", [statut, rappel, tentatives, nowSql(), lead.id]);
    const label = { joint: 'Client joint', sans_reponse: `Pas de réponse (tentative ${tentatives})`, rappeler: 'À rappeler' }[resultat];
    await db.run('INSERT INTO lead_notes (lead_id,contenu,auteur) VALUES (?,?,?)', [lead.id, [label, short(note, 2000)].filter(Boolean).join(' — '), who]);
    res.json({ ok: true, statut, rappel_at: rappel, tentatives, suggest });
  });
  app.post('/api/leads/:id/notes', auth, async (req, res) => {
    const contenu = short(req.body?.contenu, 4000);
    if (!contenu) return res.status(400).json({ message: 'La note est vide' });
    if (!(await db.get('SELECT id FROM leads WHERE id=?', [req.params.id]))) return res.status(404).json({ message: 'Lead introuvable' });
    const r = await db.run('INSERT INTO lead_notes (lead_id,contenu,auteur) VALUES (?,?,?)', [req.params.id, contenu, userOf(req)]);
    res.status(201).json({ id: r.lastID });
  });
  app.delete('/api/leads/:id/notes/:noteId', auth, async (req, res) => { await db.run('DELETE FROM lead_notes WHERE id=? AND lead_id=?', [req.params.noteId, req.params.id]); res.json({ ok: true }); });
  // Prise en charge : un seul « rappeleur » à la fois par lead (verrou de 30 min)
  app.post('/api/leads/:id/prendre', auth, async (req, res) => {
    const lead = await db.get('SELECT * FROM leads WHERE id=?', [req.params.id]);
    if (!lead) return res.status(404).json({ message: 'Lead introuvable' });
    const user = userOf(req), other = lockedBy(lead, user);
    if (other) return res.status(409).json({ ok: false, message: `${other} s’en occupe déjà`, en_charge: other });
    await db.run("UPDATE leads SET en_charge=?, en_charge_at=?, vu=1, updated_at=datetime('now') WHERE id=?", [user, nowSql(), lead.id]);
    res.json({ ok: true, en_charge: user });
  });
  app.post('/api/leads/:id/liberer', auth, async (req, res) => { await db.run('UPDATE leads SET en_charge=NULL,en_charge_at=NULL WHERE id=?', [req.params.id]); res.json({ ok: true }); });
  app.post('/api/leads/:id/convertir', auth, async (req, res) => {
    const r = await convertLead(req.params.id);
    res.status(r ? 200 : 404).json(r || { message: 'Lead introuvable' });
  });
  app.delete('/api/leads/:id', auth, async (req, res) => { await db.run('DELETE FROM leads WHERE id=?', [req.params.id]); res.json({ ok: true }); });

  app.post('/api/meta/poll', auth, async (req, res) => res.json(await pollMeta()));
  app.get('/api/integrations', auth, async (req, res) => {
    const token = await getSetting('meta_page_token');
    res.json({
      ads: { accountId: await setting('meta_ad_account_id'), hasToken: !!(await getSetting('meta_ads_token')), lastOk: await setting('ads_last_ok'), lastError: await setting('ads_last_error') },
      meta: { pageId: await setting('meta_page_id'), hasToken: !!token, lastOk: await setting('meta_last_ok'), lastError: await setting('meta_last_error') },
      notifications: { emails: await setting('notify_emails', 'info@eprotectoit.com') },
      webhook: { configured: !!(await getSetting('leads_webhook_key')) },
      drive: { rootId: await setting('drive_root_id', '1Xg_dEIz77yVxZQ20hfHXN4rd_uE7vLfN'), leadsId: await setting('drive_leads_id', '1eFQSjqzmzTseq31FJpp_D72mB2CUDr9S') }
    });
  });
  app.put('/api/integrations', auth, async (req, res) => {
    const b = req.body || {};
    if ('metaPageId' in b) {
      if (b.metaPageId && !/^\d+$/.test(String(b.metaPageId))) return res.status(400).json({ message: 'ID de Page invalide' });
      await set('meta_page_id', b.metaPageId);
    }
    if ('metaPageToken' in b && b.metaPageToken) await setSecret('meta_page_token', short(b.metaPageToken, 4000));
    if ('metaAdAccountId' in b) {
      const id = String(b.metaAdAccountId || '').replace(/^act_/, '');
      if (id && !/^d+$/.test(id)) return res.status(400).json({ message: 'ID de compte publicitaire invalide' });
      await set('meta_ad_account_id', id);
    }
    if ('metaAdsToken' in b && b.metaAdsToken) await setSecret('meta_ads_token', short(b.metaAdsToken, 4000));
    if ('notifyEmails' in b) {
      const list = short(b.notifyEmails, 1000).split(/[;,\s]+/).filter(Boolean);
      if (list.some(x => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) return res.status(400).json({ message: 'Adresse courriel invalide' });
      await set('notify_emails', list.join(', '));
    }
    if ('driveRootId' in b) await set('drive_root_id', short(b.driveRootId, 200));
    if ('driveLeadsId' in b) await set('drive_leads_id', short(b.driveLeadsId, 200));
    res.json({ ok: true });
  });
  app.post('/api/integrations/webhook/renew', auth, async (req, res) => {
    const newKey = crypto.randomBytes(32).toString('hex');
    await setSecret('leads_webhook_key', newKey);
    res.json({ key: newKey, url: `${CRM_URL}/api/webhooks/leads?key=${newKey}` });
  });
  app.get('/api/integrations/webhook', auth, async (req, res) => {
    const s = await webhookSecret(); res.json({ key: s, url: `${CRM_URL}/api/webhooks/leads?key=${s}` });
  });
  app.post('/api/integrations/test-email', auth, async (req, res) => {
    const to = short(req.body?.to || await setting('notify_emails', 'info@eprotectoit.com'), 320).split(/[;,\s]+/).filter(Boolean)[0] || '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ message: 'Une adresse valide est requise' });
    await google.sendMail({ to, subject: 'Test notification CRM ProtecToit', text: 'Les notifications du CRM fonctionnent.' });
    await set('notify_last_ok', new Date().toISOString()); await set('notify_last_error', '');
    res.json({ ok: true });
  });
  app.post('/api/meta/disconnect', auth, async (req, res) => { await setSecret('meta_page_token', ''); await set('meta_page_id', ''); res.json({ ok: true }); });
}
module.exports = { register, normalize, ingestLead, notifyLead, pollMeta, retryNotifications, convertLead, STATUSES };
