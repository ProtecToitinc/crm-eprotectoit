'use strict';
/**
 * Sécurité du CRM : sessions qui expirent, limitation des tentatives de connexion,
 * état OAuth (anti-CSRF), en-têtes HTTP et journal d'audit des modifications.
 */
const crypto = require('crypto');
const db = require('./database');
const { redactUrl } = require('./lib');

const DAY = 86400000;
const MAX_AGE = 30 * DAY;   // une session ne dure jamais plus de 30 jours
const IDLE_AGE = 7 * DAY;   // ...ni plus de 7 jours sans activité
const sha = v => crypto.createHash('sha256').update(String(v)).digest();
const hex = v => sha(v).toString('hex');
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
// Les deux utilisateurs du CRM. Mot de passe : CRM_PASSWORD pour tous, sauf si CRM_PASSWORD_<PRENOM> est défini pour l'un d'eux.
const USERS = ['Mathys Caron', 'Ramy Farah'];
const passwordFor = (user, fallback) => process.env['CRM_PASSWORD_' + user.split(' ')[0].toUpperCase()] || fallback;
const ipOf = req => req.ip || req.socket?.remoteAddress || 'inconnue';

// ---------- limitation des tentatives de connexion ----------
const WINDOW = 15 * 60 * 1000, MAX_FAILS = 5;
const failures = new Map(); // ip -> { n, first, lockedUntil, locks }
function lockedSeconds(ip) {
  const f = failures.get(ip), now = Date.now();
  return f && f.lockedUntil > now ? Math.ceil((f.lockedUntil - now) / 1000) : 0;
}
function recordFailure(ip) {
  const now = Date.now();
  for (const [k, f] of failures) if (now - f.first > 6 * 3600 * 1000 && f.lockedUntil < now) failures.delete(k);
  const f = failures.get(ip) || { n: 0, first: now, lockedUntil: 0, locks: 0 };
  if (now - f.first > WINDOW) { f.n = 0; f.first = now; }
  f.n++;
  if (f.n >= MAX_FAILS) { f.locks++; f.lockedUntil = now + Math.min(15 * 60 * 1000 * 2 ** (f.locks - 1), 6 * 3600 * 1000); f.n = 0; f.first = now; }
  failures.set(ip, f);
}
const recordSuccess = ip => failures.delete(ip);

// ---------- sessions ----------
async function createSession(req, user) {
  const token = crypto.randomBytes(32).toString('base64url'), now = Date.now();
  await db.run('INSERT INTO sessions (token_hash,created_ms,last_seen_ms,ip,user_agent,user_name) VALUES (?,?,?,?,?,?)',
    [hex(token), now, now, ipOf(req), String(req.headers['user-agent'] || '').slice(0, 200), user]);
  return token;
}
const bearer = req => { const h = String(req.headers.authorization || ''); return h.startsWith('Bearer ') ? h.slice(7).trim() : ''; };
async function findSession(token) {
  if (!token || token.length < 20 || token.length > 200) return null;
  const row = await db.get('SELECT * FROM sessions WHERE token_hash=?', [hex(token)]);
  if (!row) return null;
  const now = Date.now();
  if (now - row.created_ms > MAX_AGE || now - row.last_seen_ms > IDLE_AGE) { await db.run('DELETE FROM sessions WHERE token_hash=?', [row.token_hash]); return null; }
  if (now - row.last_seen_ms > 10 * 60 * 1000) await db.run('UPDATE sessions SET last_seen_ms=? WHERE token_hash=?', [now, row.token_hash]);
  return row;
}
async function auth(req, res, next) {
  const session = await findSession(bearer(req));
  if (!session) return res.status(401).json({ message: 'Non autorisé' });
  req.session = { id: session.token_hash.slice(0, 10), user: session.user_name || USERS[0] };
  next();
}
async function destroySession(token) { if (token) await db.run('DELETE FROM sessions WHERE token_hash=?', [hex(token)]); }
async function purgeExpired() {
  const now = Date.now();
  await db.run('DELETE FROM sessions WHERE created_ms<? OR last_seen_ms<?', [now - MAX_AGE, now - IDLE_AGE]);
  await db.run('DELETE FROM oauth_states WHERE expires_ms<?', [now]);
}

/** Routes /api/auth/* ; le mot de passe vient uniquement de l'environnement (aucune valeur par défaut). */
function registerAuth(app, password) {
  app.post('/api/auth/login', async (req, res) => {
    const ip = ipOf(req), wait = lockedSeconds(ip);
    if (wait) { res.set('Retry-After', String(wait)); return res.status(429).json({ ok: false, message: `Trop de tentatives. Réessaie dans ${Math.ceil(wait / 60)} min.` }); }
    const given = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = USERS.includes(req.body?.user) ? req.body.user : null;
    if (!user) return res.status(400).json({ ok: false, message: 'Choisis ton nom (Mathys Caron ou Ramy Farah).' });
    if (given && safeEqual(given, passwordFor(user, password))) {
      recordSuccess(ip);
      const token = await createSession(req, user);
      await audit({ actor: user, action: 'connexion', ip, details: 'Connexion réussie' });
      return res.json({ ok: true, token, user });
    }
    recordFailure(ip);
    await new Promise(r => setTimeout(r, 400)); // ralentit les essais automatisés
    await audit({ actor: user, action: 'connexion-échec', ip, details: 'Mot de passe incorrect' });
    res.status(401).json({ ok: false, message: 'Mot de passe incorrect' });
  });
  app.post('/api/auth/verify', async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : bearer(req);
    const s = await findSession(token);
    res.json({ ok: !!s, user: s ? s.user_name || USERS[0] : null });
  });
  app.post('/api/auth/logout', async (req, res) => { await destroySession(bearer(req)); res.json({ ok: true }); });
  app.get('/api/auth/sessions', auth, async (req, res) => {
    const rows = await db.all('SELECT token_hash,created_ms,last_seen_ms,ip,user_agent,user_name FROM sessions ORDER BY last_seen_ms DESC');
    res.json(rows.map(r => ({ user: r.user_name, id: r.token_hash.slice(0, 10), created: new Date(r.created_ms).toISOString(), last_seen: new Date(r.last_seen_ms).toISOString(), ip: r.ip, user_agent: r.user_agent, current: r.token_hash.slice(0, 10) === req.session.id })));
  });
  // Déconnecte tous les autres appareils
  app.post('/api/auth/sessions/revoke-others', auth, async (req, res) => {
    const r = await db.run('DELETE FROM sessions WHERE substr(token_hash,1,10)<>?', [req.session.id]);
    await audit({ actor: req.session.user, action: 'sessions-révoquées', ip: ipOf(req), details: `${r.changes} session(s)` });
    res.json({ ok: true, revoked: r.changes });
  });
}

// ---------- état OAuth (anti-CSRF) ----------
async function newOAuthState() {
  const state = crypto.randomBytes(24).toString('base64url');
  await db.run('INSERT INTO oauth_states (state_hash,expires_ms) VALUES (?,?)', [hex(state), Date.now() + 10 * 60 * 1000]);
  return state;
}
async function consumeOAuthState(state) {
  if (!state || typeof state !== 'string' || state.length > 200) return false;
  const row = await db.get('SELECT * FROM oauth_states WHERE state_hash=?', [hex(state)]);
  if (!row) return false;
  await db.run('DELETE FROM oauth_states WHERE state_hash=?', [row.state_hash]); // usage unique
  return row.expires_ms > Date.now();
}

// ---------- en-têtes HTTP ----------
function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "frame-ancestors 'none'",
    'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=()',
    'Cross-Origin-Opener-Policy': 'same-origin'
  });
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') res.set('Strict-Transport-Security', 'max-age=15552000');
  if (req.path.startsWith('/api/') ) res.set('Cache-Control', 'no-store');
  next();
}

// ---------- journal d'audit ----------
const AUDITED = new Set(['clients', 'opportunites', 'taches', 'quotes', 'invoices', 'evenements', 'notes', 'appels', 'documents', 'leads', 'chantiers', 'rentabilite']);
const CHILDREN = { clients: ['toitures', 'opportunites', 'taches', 'documents', 'historique', 'quotes', 'invoices', 'evenements', 'notes', 'appels'] };
const cap = v => { const s = JSON.stringify(v ?? null); return s.length > 60000 ? JSON.stringify({ tronque: true, taille: s.length }) : s; };
async function audit({ actor = 'système', action, entity = null, entity_id = null, before = null, after = null, details = null, ip = null }) {
  try {
    await db.run('INSERT INTO audit_log (actor,ip,action,entity,entity_id,before_json,after_json,details) VALUES (?,?,?,?,?,?,?,?)',
      [actor, ip, action, entity, entity_id, before == null ? null : cap(before), after == null ? null : cap(after), details]);
  } catch (e) { console.error('[audit] écriture impossible :', e.message); }
}
async function snapshot(table, id) {
  const row = await db.get(`SELECT * FROM ${table} WHERE id=?`, [id]);
  if (!row || !CHILDREN[table]) return row;
  const children = {};
  for (const child of CHILDREN[table]) {
    const col = child === 'clients' ? 'id' : 'client_id';
    children[child] = await db.all(`SELECT * FROM ${child} WHERE ${col}=?`, [id]).catch(() => []);
  }
  return { row, children };
}
/** Journalise automatiquement chaque création / modification / suppression sur les tables importantes. */
function auditMiddleware(req, res, next) {
  if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return next();
  const m = /^\/api\/([a-z_]+)(?:\/(\d+))?(?:\/([a-z_-]+))?\/?$/.exec(req.path);
  if (!m || !AUDITED.has(m[1])) return next();
  const [, table, idText, sub] = m;
  const id = idText ? Number(idText) : null;
  (async () => {
    const before = id ? await snapshot(table, id).catch(() => null) : null;
    let createdId = null;
    const json = res.json.bind(res);
    res.json = body => { if (body && typeof body === 'object' && Number.isInteger(body.id)) createdId = body.id; return json(body); };
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      (async () => {
        const entityId = id || createdId;
        const action = req.method === 'DELETE' ? 'suppression' : req.method === 'POST' && !id ? 'création' : sub ? sub : 'modification';
        const after = req.method === 'DELETE' || !entityId ? null : await db.get(`SELECT * FROM ${table} WHERE id=?`, [entityId]).catch(() => null);
        const user = req.session?.user || 'inconnu';
        await audit({ actor: user, ip: ipOf(req), action, entity: table, entity_id: entityId, before, after });
        // Attribution : le nom de la personne s'inscrit sur la fiche du client concerné.
        const clientId = table === 'clients' ? entityId : (after?.client_id ?? (before?.row || before)?.client_id);
        if (clientId && !(table === 'clients' && action === 'suppression') && req.session?.user) {
          await db.run("UPDATE clients SET modifie_par=?, modifie_at=datetime('now'), responsable=COALESCE(NULLIF(responsable,''),?) WHERE id=?", [user, user, clientId]).catch(() => {});
        }
      })();
    });
    next();
  })().catch(next);
}
async function restoreDeleted(auditId) {
  const entry = await db.get("SELECT * FROM audit_log WHERE id=? AND action='suppression'", [auditId]);
  if (!entry || !entry.before_json) return { ok: false, status: 404, message: 'Entrée introuvable' };
  const snap = JSON.parse(entry.before_json);
  const table = entry.entity;
  if (!AUDITED.has(table)) return { ok: false, status: 400, message: 'Table non restaurable' };
  const row = snap.row || snap;
  if (!row?.id) return { ok: false, status: 409, message: 'Aucune donnée à restaurer' };
  if (await db.get(`SELECT id FROM ${table} WHERE id=?`, [row.id])) return { ok: false, status: 409, message: 'Cet élément existe déjà' };
  const insert = async (t, r) => {
    const cols = new Set((await db.all(`PRAGMA table_info(${t})`)).map(c => c.name));
    const pairs = Object.entries(r).filter(([k]) => cols.has(k));
    await db.run(`INSERT OR IGNORE INTO ${t} (${pairs.map(([k]) => `"${k}"`).join(',')}) VALUES (${pairs.map(() => '?').join(',')})`, pairs.map(([, v]) => v));
  };
  await insert(table, row);
  let restored = 1;
  for (const [t, rows] of Object.entries(snap.children || {})) for (const r of rows) { await insert(t, r); restored++; }
  await audit({ actor: 'système', action: 'restauration', entity: table, entity_id: row.id, details: `${restored} ligne(s) restaurée(s) depuis l'entrée d'audit #${auditId}` });
  return { ok: true, restored };
}
function registerAudit(app) {
  app.get('/api/audit', auth, async (req, res) => {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100)), conds = [], params = [];
    if (req.query.entity) { conds.push('entity=?'); params.push(String(req.query.entity)); }
    if (req.query.entity_id) { conds.push('entity_id=?'); params.push(Number(req.query.entity_id)); }
    if (req.query.action) { conds.push('action=?'); params.push(String(req.query.action)); }
    const rows = await db.all(`SELECT id,at,actor,ip,action,entity,entity_id,details,before_json,after_json FROM audit_log ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`, [...params, limit]);
    res.json(rows.map(r => {
      let changed = null;
      try {
        const b = JSON.parse(r.before_json || 'null'), a = JSON.parse(r.after_json || 'null'), bb = b?.row || b;
        if (bb && a) changed = Object.keys(a).filter(k => !['updated_at'].includes(k) && JSON.stringify(a[k]) !== JSON.stringify(bb[k])).map(k => ({ champ: k, avant: bb[k], apres: a[k] }));
        else if (a) changed = null;
      } catch { /* ignore */ }
      return { id: r.id, at: r.at, actor: r.actor, action: r.action, entity: r.entity, entity_id: r.entity_id, details: r.details, changed, restorable: r.action === 'suppression' && !!r.before_json };
    }));
  });
  app.post('/api/audit/:id/restore', auth, async (req, res) => { const r = await restoreDeleted(Number(req.params.id)); res.status(r.status || 200).json(r); });
}

module.exports = { USERS, auth, registerAuth, registerAudit, auditMiddleware, securityHeaders, newOAuthState, consumeOAuthState, purgeExpired, audit, restoreDeleted, ipOf, redactUrl, safeEqual };
