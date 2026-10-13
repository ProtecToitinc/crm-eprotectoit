require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const db = require('./database');
const { STAGES, SERVICES, QUOTE_STATUSES, INVOICE_STATUSES } = require('./constants');
const google = require('./google');
const security = require('./security');
const backup = require('./backup');
const sales = require('./sales');
const { migrateSecrets, redactUrl } = require('./lib');

const app = express();
const PORT = process.env.PORT || 3001;
// Aucun mot de passe par défaut : il doit être défini dans l'environnement (Railway → Variables).
const PASSWORD = process.env.CRM_PASSWORD;
if (!PASSWORD || PASSWORD.length < 8) {
  console.error('CRM_PASSWORD est absent ou trop court (8 caractères minimum). Définis-le dans les variables d\'environnement avant de démarrer.');
  process.exit(1);
}
const { auth } = security;
app.set('trust proxy', 1); // Railway : l'adresse IP réelle vient de X-Forwarded-For
app.disable('x-powered-by');

// Express 4 n'attrape pas les erreurs des handlers async : on les envoie au middleware d'erreur
// (sinon une requête qui échoue reste sans réponse et peut faire tomber le processus).
for (const method of ['get', 'post', 'put', 'delete']) {
  const original = app[method].bind(app);
  app[method] = (route, ...handlers) => {
    if (!handlers.length) return original(route); // app.get('réglage')
    return original(route, ...handlers.map(h => (typeof h !== 'function' || h.length === 4) ? h : (req, res, next) => {
      try { Promise.resolve(h(req, res, next)).catch(next); } catch (e) { next(e); }
    }));
  };
}

// Même origine seulement, sauf si CORS_ORIGIN liste explicitement d'autres origines.
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : false }));
app.use(security.securityHeaders);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => (backup.isRestoring() && req.path.startsWith('/api/')
  ? res.status(503).json({ message: 'Restauration en cours, réessaie dans quelques secondes.' }) : next()));
app.use(security.auditMiddleware);

// Sur Railway, DB_PATH pointe vers le volume persistant : on y range aussi les fichiers
// (le disque du conteneur est effacé à chaque déploiement).
const legacyUploadsDir = path.join(__dirname, 'uploads');
const uploadsDir = process.env.UPLOADS_DIR ||
  (process.env.DB_PATH ? path.join(path.dirname(db.dbPath), 'uploads') : legacyUploadsDir);
fs.mkdirSync(uploadsDir, { recursive: true });
// Client documents and chantier photos are private. Never expose this directory as static.
app.get('/api/uploads/:name', auth, async (req, res) => {
  const name = req.params.name;
  if (!name || name !== path.basename(name) || name.startsWith('.')) {
    return res.status(400).json({ message: 'Nom de fichier invalide' });
  }
  const document = await db.get('SELECT id FROM documents WHERE chemin=?', [name]);
  const photo = await db.get('SELECT id FROM chantier_photos WHERE chemin=?', [name]);
  if (!document && !photo) return res.status(404).json({ message: 'Fichier introuvable' });
  for (const dir of [uploadsDir, legacyUploadsDir]) {
    const full = path.join(dir, name);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      res.set('Cache-Control', 'private, no-store');
      res.set('X-Content-Type-Options', 'nosniff');
      return res.sendFile(full);
    }
  }
  return res.status(404).json({ message: 'Fichier introuvable' });
});
// Reject legacy direct links instead of serving private files without authentication.
app.use('/uploads', (req, res) => res.status(401).json({ message: 'Accès au fichier via le CRM seulement' }));

const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ---- Utilitaires ----
const TZ = 'America/Toronto';

// Date / heure locales (Québec) : le serveur Railway tourne en UTC.
function localParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

const bad = (res, message) => res.status(400).json({ message });
const clean = v => { const t = v == null ? '' : String(v).trim(); return t || null; };
const snippet = s => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > 60 ? t.slice(0, 57) + '…' : t; };
// Valeur du corps de requête si présente, sinon valeur actuelle (évite d'effacer un champ non envoyé)
const pick = (body, cur, key) => (key in body ? body[key] : cur[key]);
const addHistory = (client_id, type, description) =>
  db.run('INSERT INTO historique (client_id,type,description) VALUES (?,?,?)', [client_id, type, description]);

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const digitsOf = s => String(s ?? '').replace(/\D/g, '');

// Recherche tolérante : sans accents, sans casse, tous les mots doivent être trouvés
// (nom, courriel, adresse, ville, code postal, notes) ou, pour un numéro, dans le téléphone.
function filterClients(rows, q) {
  const raw = String(q || '').trim().split(/\s+/).filter(Boolean);
  if (!raw.length) return rows;
  const terms = raw.map(norm);
  const matches = c => {
    const hay = norm([c.prenom, c.nom, c.email, c.adresse, c.ville, c.code_postal, c.notes].join(' '));
    const phone = digitsOf(c.telephone);
    return terms.every((t, i) => hay.includes(t) ||
      (/^[\d\s().+-]+$/.test(raw[i]) && digitsOf(raw[i]).length >= 3 && phone.includes(digitsOf(raw[i]))));
  };
  const rank = c => { const nm = norm(`${c.prenom} ${c.nom}`); return terms.every(t => nm.includes(t)) ? 0 : 1; };
  return rows.filter(matches).sort((a, b) => rank(a) - rank(b));
}

// Connexion, sessions qui expirent, limitation des tentatives (voir security.js)
security.registerAuth(app, PASSWORD);

app.get('/api/meta', auth, (req, res) => {
  res.json({ stages: STAGES, services: SERVICES, quoteStatuses: QUOTE_STATUSES, invoiceStatuses: INVOICE_STATUSES });
});

// ---- CLIENTS ----
const CLIENTS_LIST_SQL = `
  SELECT c.*,
    (SELECT COUNT(*) FROM opportunites WHERE client_id = c.id) as nb_opportunites,
    (SELECT etape FROM opportunites WHERE client_id = c.id ORDER BY updated_at DESC LIMIT 1) as derniere_etape,
    (SELECT service FROM opportunites WHERE client_id = c.id ORDER BY updated_at DESC LIMIT 1) as dernier_service,
    (SELECT valeur FROM opportunites WHERE client_id = c.id ORDER BY updated_at DESC LIMIT 1) as derniere_valeur,
    (SELECT MAX(updated_at) FROM opportunites WHERE client_id = c.id) as dernier_contact,
    (SELECT COUNT(*) FROM appels WHERE client_id = c.id) as nb_appels,
    (SELECT COUNT(*) FROM appels WHERE client_id = c.id AND direction IN ('entrant','manque')) as nb_appels_recus,
    (SELECT MAX(date_appel) FROM appels WHERE client_id = c.id) as dernier_appel,
    (SELECT COUNT(*) FROM appels WHERE client_id = c.id AND a_rappeler = 1 AND rappel_fait = 0) as nb_rappels,
    (SELECT COUNT(*) FROM notes WHERE client_id = c.id) as nb_notes
  FROM clients c
  ORDER BY c.created_at DESC, c.id DESC`;

app.get('/api/clients', auth, async (req, res) => {
  res.json(filterClients(await db.all(CLIENTS_LIST_SQL), req.query.q));
});

app.get('/api/clients/:id', auth, async (req, res) => {
  const client = await db.get('SELECT * FROM clients WHERE id = ?', [req.params.id]);
  if (!client) return res.status(404).json({ message: 'Client introuvable' });
  const id = req.params.id;
  const [toiture, opportunites, taches, documents, historique, quotes, invoices, evenements, notes_client, appels] = await Promise.all([
    db.get('SELECT * FROM toitures WHERE client_id = ?', [id]),
    db.all('SELECT * FROM opportunites WHERE client_id = ? ORDER BY updated_at DESC', [id]),
    db.all('SELECT * FROM taches WHERE client_id = ? ORDER BY completed ASC, due_date ASC', [id]),
    db.all('SELECT * FROM documents WHERE client_id = ? ORDER BY created_at DESC', [id]),
    db.all('SELECT * FROM historique WHERE client_id = ? ORDER BY created_at DESC, id DESC LIMIT 50', [id]),
    db.all('SELECT * FROM quotes WHERE client_id = ? ORDER BY created_at DESC', [id]),
    db.all('SELECT * FROM invoices WHERE client_id = ? ORDER BY created_at DESC', [id]),
    db.all('SELECT * FROM evenements WHERE client_id = ? ORDER BY date_debut DESC', [id]),
    db.all('SELECT * FROM notes WHERE client_id = ? ORDER BY epingle DESC, updated_at DESC, id DESC', [id]),
    db.all(`SELECT * FROM appels WHERE client_id = ? ORDER BY date_appel DESC, IFNULL(heure,'') DESC, id DESC`, [id]),
  ]);
  res.json({ ...client, toiture, opportunites, taches, documents, historique, quotes, invoices, evenements, notes_client, appels });
});

app.post('/api/clients', auth, async (req, res) => {
  const { email, telephone, adresse, ville, code_postal, notes, toiture } = req.body;
  const nom = String(req.body.nom || '').trim();
  const prenom = String(req.body.prenom || '').trim();
  if (!nom && !prenom) return bad(res, 'Le nom du client est requis');
  const r = await db.run(
    'INSERT INTO clients (nom,prenom,email,telephone,adresse,ville,code_postal,notes) VALUES (?,?,?,?,?,?,?,?)',
    [nom, prenom, email, telephone, adresse, ville, code_postal, notes]
  );
  if (toiture?.materiau) {
    await db.run('INSERT INTO toitures (client_id,materiau,age_annees,superficie_m2,etat,notes) VALUES (?,?,?,?,?,?)',
      [r.lastID, toiture.materiau, toiture.age_annees, toiture.superficie_m2, toiture.etat, toiture.notes]);
  }
  await addHistory(r.lastID, 'creation', 'Client créé');
  res.json({ id: r.lastID });
});

app.put('/api/clients/:id', auth, async (req, res) => {
  const { email, telephone, adresse, ville, code_postal, notes, toiture } = req.body;
  const nom = String(req.body.nom || '').trim();
  const prenom = String(req.body.prenom || '').trim();
  const id = req.params.id;
  if (!nom && !prenom) return bad(res, 'Le nom du client est requis');
  if (!(await db.get('SELECT id FROM clients WHERE id=?', [id]))) return res.status(404).json({ message: 'Client introuvable' });
  await db.run(`UPDATE clients SET
      lat = CASE WHEN IFNULL(adresse,'')=IFNULL(?,'') AND IFNULL(ville,'')=IFNULL(?,'') AND IFNULL(code_postal,'')=IFNULL(?,'') THEN lat END,
      lng = CASE WHEN IFNULL(adresse,'')=IFNULL(?,'') AND IFNULL(ville,'')=IFNULL(?,'') AND IFNULL(code_postal,'')=IFNULL(?,'') THEN lng END,
      nom=?,prenom=?,email=?,telephone=?,adresse=?,ville=?,code_postal=?,notes=? WHERE id=?`,
    [adresse, ville, code_postal, adresse, ville, code_postal, nom, prenom, email, telephone, adresse, ville, code_postal, notes, id]);
  if (toiture) {
    const ex = await db.get('SELECT id FROM toitures WHERE client_id=?', [id]);
    if (ex) {
      await db.run('UPDATE toitures SET materiau=?,age_annees=?,superficie_m2=?,etat=?,notes=? WHERE client_id=?',
        [toiture.materiau, toiture.age_annees, toiture.superficie_m2, toiture.etat, toiture.notes, id]);
    } else {
      await db.run('INSERT INTO toitures (client_id,materiau,age_annees,superficie_m2,etat,notes) VALUES (?,?,?,?,?,?)',
        [id, toiture.materiau, toiture.age_annees, toiture.superficie_m2, toiture.etat, toiture.notes]);
    }
  }
  await addHistory(id, 'modification', 'Fiche client modifiée');
  res.json({ ok: true });
});

app.delete('/api/clients/:id', auth, async (req, res) => {
  // Les événements liés au client sont supprimés en cascade : on les retire aussi de Google Calendar
  const evs = await db.all('SELECT * FROM evenements WHERE client_id=?', [req.params.id]);
  for (const ev of evs) await google.deleteEventOut(ev).catch(() => {});
  await db.run('DELETE FROM clients WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// Qui s'occupe de ce client (choix manuel ; sinon la première personne qui le modifie)
app.put('/api/clients/:id/responsable', auth, async (req, res) => {
  const who = req.body?.responsable || null;
  if (who !== null && !security.USERS.includes(who)) return bad(res, 'Utilisateur inconnu');
  const r = await db.run('UPDATE clients SET responsable=? WHERE id=?', [who, req.params.id]);
  if (!r.changes) return res.status(404).json({ message: 'Client introuvable' });
  await security.audit({ actor: req.session.user, action: 'responsable', entity: 'clients', entity_id: Number(req.params.id), details: who ? `Pris en charge par ${who}` : 'Responsable retiré' });
  res.json({ ok: true, responsable: who });
});

// ---- RECHERCHE GLOBALE (barre du haut) ----
app.get('/api/search', auth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ clients: [], totalClients: 0, notes: [], appels: [] });
  const terms = q.split(/\s+/).map(norm);
  const textMatch = text => { const hay = norm(text); return terms.every(t => hay.includes(t)); };

  const found = filterClients(await db.all(CLIENTS_LIST_SQL), q);
  const notes = (await db.all(
    `SELECT n.*, c.nom, c.prenom FROM notes n LEFT JOIN clients c ON n.client_id = c.id ORDER BY n.updated_at DESC`))
    .filter(n => textMatch(`${n.titre || ''} ${n.contenu} ${n.prenom || ''} ${n.nom || ''}`)).slice(0, 5);
  const appels = (await db.all(
    `SELECT a.*, c.nom, c.prenom FROM appels a JOIN clients c ON a.client_id = c.id
     ORDER BY a.date_appel DESC, IFNULL(a.heure,'') DESC`))
    .filter(a => textMatch(`${a.sujet || ''} ${a.resume || ''}`)).slice(0, 4);
  res.json({ clients: found.slice(0, 8), totalClients: found.length, notes, appels });
});

// ---- GEOCODAGE (OpenStreetMap Nominatim) ----
async function nominatim(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'CRM-eProtectoIT/1.0 (info@eprotectoit.com)' } });
  if (!r.ok) throw new Error('nominatim ' + r.status);
  const j = await r.json();
  return j[0] ? { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) } : null;
}

app.post('/api/geocode', auth, async (req, res) => {
  const pending = `lat IS NULL AND (IFNULL(adresse,'')<>'' OR IFNULL(ville,'')<>'')`;
  const rows = await db.all(`SELECT * FROM clients WHERE ${pending} LIMIT 4`);
  for (const c of rows) {
    let pos = null;
    try {
      const full = [c.adresse, c.ville, c.code_postal, 'Québec, Canada'].filter(Boolean).join(', ');
      pos = await nominatim(full);
      if (!pos && c.ville) { await new Promise(r => setTimeout(r, 1100)); pos = await nominatim(`${c.ville}, Québec, Canada`); }
    } catch (e) { return res.json({ remaining: -1, error: e.message }); }
    await db.run('UPDATE clients SET lat=?, lng=? WHERE id=?', pos ? [pos.lat, pos.lng, c.id] : [0, 0, c.id]);
    await new Promise(r => setTimeout(r, 1100));
  }
  const left = await db.get(`SELECT COUNT(*) n FROM clients WHERE ${pending}`);
  res.json({ remaining: left.n });
});

// ---- OPPORTUNITES (deals) ----
app.get('/api/opportunites', auth, async (req, res) => {
  res.json(await db.all(`
    SELECT o.*, c.nom, c.prenom, c.telephone, c.email, c.ville FROM opportunites o
    JOIN clients c ON o.client_id = c.id ORDER BY o.updated_at DESC`));
});

app.post('/api/opportunites', auth, async (req, res) => {
  const { client_id, titre, etape, service, valeur, notes, date_prevue } = req.body;
  if (!client_id) return bad(res, 'Client requis');
  if (!clean(titre)) return bad(res, 'Le titre du dossier est requis');
  const r = await db.run(
    'INSERT INTO opportunites (client_id,titre,etape,service,valeur,notes,date_prevue) VALUES (?,?,?,?,?,?,?)',
    [client_id, titre, etape || 'lead', service, valeur || 0, notes, date_prevue]);
  await addHistory(client_id, 'opportunite', `Dossier créé : ${titre}`);
  res.json({ id: r.lastID });
});

app.put('/api/opportunites/:id', auth, async (req, res) => {
  const opp = await db.get('SELECT * FROM opportunites WHERE id=?', [req.params.id]);
  if (!opp) return res.status(404).json({ message: 'Dossier introuvable' });
  const b = req.body;
  const titre = pick(b, opp, 'titre'), etape = pick(b, opp, 'etape'), service = pick(b, opp, 'service');
  const valeur = pick(b, opp, 'valeur'), notes = pick(b, opp, 'notes'), date_prevue = pick(b, opp, 'date_prevue');
  await db.run(
    `UPDATE opportunites SET titre=?,etape=?,service=?,valeur=?,notes=?,date_prevue=?,updated_at=datetime('now') WHERE id=?`,
    [titre, etape, service, valeur || 0, notes, date_prevue, req.params.id]);
  if (opp.etape !== etape) {
    const L = Object.fromEntries(STAGES.map(s => [s.key, s.short]));
    await addHistory(opp.client_id, 'etape', `Pipeline : ${L[opp.etape] || opp.etape} → ${L[etape] || etape}`);
  }
  res.json({ ok: true });
});

app.delete('/api/opportunites/:id', auth, async (req, res) => {
  await db.run('DELETE FROM opportunites WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ---- TACHES ----
app.get('/api/taches', auth, async (req, res) => {
  res.json(await db.all(`
    SELECT t.*, c.nom, c.prenom FROM taches t
    LEFT JOIN clients c ON t.client_id = c.id
    ORDER BY t.completed ASC, t.due_date ASC, t.created_at DESC`));
});

app.post('/api/taches', auth, async (req, res) => {
  const { client_id, opportunite_id, titre, description, due_date, priorite } = req.body;
  if (!clean(titre)) return bad(res, 'Le titre de la tâche est requis');
  const r = await db.run(
    'INSERT INTO taches (client_id,opportunite_id,titre,description,due_date,priorite) VALUES (?,?,?,?,?,?)',
    [client_id || null, opportunite_id || null, titre, description, due_date, priorite || 'normale']);
  res.json({ id: r.lastID });
});

app.put('/api/taches/:id', auth, async (req, res) => {
  const cur = await db.get('SELECT * FROM taches WHERE id=?', [req.params.id]);
  if (!cur) return res.status(404).json({ message: 'Tâche introuvable' });
  const b = req.body;
  await db.run('UPDATE taches SET titre=?,description=?,due_date=?,completed=?,priorite=? WHERE id=?',
    [pick(b, cur, 'titre'), pick(b, cur, 'description'), pick(b, cur, 'due_date'),
      pick(b, cur, 'completed') ? 1 : 0, pick(b, cur, 'priorite'), req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/taches/:id', auth, async (req, res) => {
  await db.run('DELETE FROM taches WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ---- DOCUMENTS ----
app.post('/api/documents', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Fichier manquant' });
  const { client_id, type_doc } = req.body;
  if (!client_id) {
    fs.unlink(req.file.path, () => {});
    return bad(res, 'Client requis');
  }
  const r = await db.run('INSERT INTO documents (client_id,nom,type_doc,chemin,taille) VALUES (?,?,?,?,?)',
    [client_id, req.file.originalname, type_doc, req.file.filename, req.file.size]);
  await addHistory(client_id, 'document', `Document ajouté : ${req.file.originalname}`);
  res.json({ id: r.lastID, nom: req.file.originalname, chemin: req.file.filename });
});

app.delete('/api/documents/:id', auth, async (req, res) => {
  const doc = await db.get('SELECT * FROM documents WHERE id=?', [req.params.id]);
  if (doc) {
    for (const dir of [uploadsDir, legacyUploadsDir]) {
      if (/^https:\/\//i.test(doc.chemin)) continue;
      const fp = path.join(dir, doc.chemin);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await db.run('DELETE FROM documents WHERE id=?', [req.params.id]);
  }
  res.json({ ok: true });
});

// ---- QUOTES (soumissions) ----
// Numéro suivant = plus grand numéro existant + 1 (compter les lignes donnait un doublon après une suppression)
async function nextReference(prefix, table) {
  const year = localParts().date.slice(0, 4);
  const p = `${prefix}-${year}-`;
  const row = await db.get(
    `SELECT MAX(CAST(SUBSTR(reference, ?) AS INTEGER)) as m FROM ${table} WHERE reference LIKE ?`,
    [p.length + 1, `${p}%`]);
  return `${p}${String((row?.m || 0) + 1).padStart(4, '0')}`;
}

app.get('/api/quotes', auth, async (req, res) => {
  res.json(await db.all(`
    SELECT q.*, c.nom, c.prenom FROM quotes q
    JOIN clients c ON q.client_id = c.id ORDER BY q.created_at DESC, q.id DESC`));
});

app.post('/api/quotes', auth, async (req, res) => {
  const { client_id, opportunite_id, service, montant, statut, date_visite, notes } = req.body;
  if (!client_id) return bad(res, 'Client requis');
  const reference = await nextReference('SOU', 'quotes');
  const r = await db.run(
    'INSERT INTO quotes (reference,client_id,opportunite_id,service,montant,statut,date_visite,notes) VALUES (?,?,?,?,?,?,?,?)',
    [reference, client_id, opportunite_id || null, service, montant || 0, statut || 'brouillon', date_visite, notes]);
  await addHistory(client_id, 'soumission', `Soumission ${reference} créée`);
  res.json({ id: r.lastID, reference });
});

app.put('/api/quotes/:id', auth, async (req, res) => {
  const cur = await db.get('SELECT * FROM quotes WHERE id=?', [req.params.id]);
  if (!cur) return res.status(404).json({ message: 'Soumission introuvable' });
  const b = req.body;
  await db.run(`UPDATE quotes SET service=?,montant=?,statut=?,date_visite=?,notes=?,updated_at=datetime('now') WHERE id=?`,
    [pick(b, cur, 'service'), pick(b, cur, 'montant') || 0, pick(b, cur, 'statut'),
      pick(b, cur, 'date_visite'), pick(b, cur, 'notes'), req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/quotes/:id', auth, async (req, res) => {
  await db.run('DELETE FROM quotes WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ---- INVOICES (factures) ----
app.get('/api/invoices', auth, async (req, res) => {
  res.json(await db.all(`
    SELECT i.*, c.nom, c.prenom FROM invoices i
    JOIN clients c ON i.client_id = c.id ORDER BY i.created_at DESC, i.id DESC`));
});

app.post('/api/invoices', auth, async (req, res) => {
  const { client_id, quote_id, montant, statut, date_echeance } = req.body;
  if (!client_id) return bad(res, 'Client requis');
  const reference = await nextReference('FAC', 'invoices');
  const r = await db.run(
    'INSERT INTO invoices (reference,client_id,quote_id,montant,statut,date_echeance) VALUES (?,?,?,?,?,?)',
    [reference, client_id, quote_id || null, montant || 0, statut || 'en_attente', date_echeance]);
  await addHistory(client_id, 'facture', `Facture ${reference} créée`);
  res.json({ id: r.lastID, reference });
});

app.put('/api/invoices/:id', auth, async (req, res) => {
  const cur = await db.get('SELECT * FROM invoices WHERE id=?', [req.params.id]);
  if (!cur) return res.status(404).json({ message: 'Facture introuvable' });
  const b = req.body;
  await db.run(`UPDATE invoices SET montant=?,statut=?,date_echeance=?,updated_at=datetime('now') WHERE id=?`,
    [pick(b, cur, 'montant') || 0, pick(b, cur, 'statut'), pick(b, cur, 'date_echeance'), req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/invoices/:id', auth, async (req, res) => {
  await db.run('DELETE FROM invoices WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ---- EVENEMENTS (calendrier) ----
app.get('/api/evenements', auth, async (req, res) => {
  const { debut, fin } = req.query;
  let sql = `SELECT e.*, c.nom, c.prenom, c.ville FROM evenements e LEFT JOIN clients c ON e.client_id = c.id`;
  const params = [];
  if (debut && fin) {
    sql += ` WHERE e.date_debut BETWEEN ? AND ?`;
    params.push(debut, fin);
  }
  sql += ` ORDER BY e.date_debut ASC, IFNULL(e.heure,'') ASC`;
  res.json(await db.all(sql, params));
});

app.post('/api/evenements', auth, async (req, res) => {
  const { client_id, opportunite_id, titre, type, date_debut, heure, google_event_id } = req.body;
  if (!clean(titre)) return bad(res, 'Le titre est requis');
  if (!clean(date_debut)) return bad(res, 'La date est requise');
  const r = await db.run(
    'INSERT INTO evenements (client_id,opportunite_id,titre,type,date_debut,heure,google_event_id) VALUES (?,?,?,?,?,?,?)',
    [client_id || null, opportunite_id || null, titre, type || 'rdv', date_debut, heure, google_event_id || null]);
  if (client_id) {
    await addHistory(client_id, 'evenement', `RDV planifié : ${titre}`);
  }
  const ev = await db.get('SELECT * FROM evenements WHERE id=?', [r.lastID]);
  google.syncEventOut(ev).catch(() => {});
  res.json({ id: r.lastID });
});

app.put('/api/evenements/:id', auth, async (req, res) => {
  const cur = await db.get('SELECT * FROM evenements WHERE id=?', [req.params.id]);
  if (!cur) return res.status(404).json({ message: 'Événement introuvable' });
  const b = req.body;
  const client_id = 'client_id' in b ? (b.client_id || null) : cur.client_id;
  const titre = pick(b, cur, 'titre');
  const date_debut = pick(b, cur, 'date_debut');
  if (!clean(titre) || !clean(date_debut)) return bad(res, 'Le titre et la date sont requis');
  await db.run(`UPDATE evenements SET client_id=?,titre=?,type=?,date_debut=?,heure=?,updated_at=datetime('now') WHERE id=?`,
    [client_id, titre, pick(b, cur, 'type'), date_debut, pick(b, cur, 'heure'), req.params.id]);
  const ev = await db.get('SELECT * FROM evenements WHERE id=?', [req.params.id]);
  google.syncEventOut(ev).catch(() => {});
  res.json({ ok: true });
});

app.delete('/api/evenements/:id', auth, async (req, res) => {
  const ev = await db.get('SELECT * FROM evenements WHERE id=?', [req.params.id]);
  if (ev) await google.deleteEventOut(ev).catch(() => {});
  await db.run('DELETE FROM evenements WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ---- NOTES (générales : client_id NULL, ou liées à un client) ----
app.get('/api/notes', auth, async (req, res) => {
  const { client_id, general } = req.query;
  const where = [];
  const params = [];
  if (general) where.push('n.client_id IS NULL');
  else if (client_id) { where.push('n.client_id = ?'); params.push(client_id); }
  res.json(await db.all(`
    SELECT n.*, c.nom, c.prenom FROM notes n LEFT JOIN clients c ON n.client_id = c.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY n.epingle DESC, n.updated_at DESC, n.id DESC`, params));
});

app.post('/api/notes', auth, async (req, res) => {
  const { client_id, titre, contenu, epingle } = req.body;
  const text = String(contenu || '').trim();
  if (!text) return bad(res, 'La note est vide');
  const cid = client_id ? Number(client_id) : null;
  if (cid && !(await db.get('SELECT id FROM clients WHERE id=?', [cid]))) return bad(res, 'Client introuvable');
  const r = await db.run('INSERT INTO notes (client_id,titre,contenu,epingle) VALUES (?,?,?,?)',
    [cid, clean(titre), text, epingle ? 1 : 0]);
  if (cid) await addHistory(cid, 'note', `Note ajoutée : ${snippet(titre || text)}`);
  res.json({ id: r.lastID });
});

app.put('/api/notes/:id', auth, async (req, res) => {
  const cur = await db.get('SELECT * FROM notes WHERE id=?', [req.params.id]);
  if (!cur) return res.status(404).json({ message: 'Note introuvable' });
  const b = req.body;
  const contenu = 'contenu' in b ? String(b.contenu || '').trim() : cur.contenu;
  if (!contenu) return bad(res, 'La note est vide');
  const client_id = 'client_id' in b ? (b.client_id ? Number(b.client_id) : null) : cur.client_id;
  if (client_id && !(await db.get('SELECT id FROM clients WHERE id=?', [client_id]))) return bad(res, 'Client introuvable');
  const titre = 'titre' in b ? clean(b.titre) : cur.titre;
  const epingle = 'epingle' in b ? (b.epingle ? 1 : 0) : cur.epingle;
  await db.run(`UPDATE notes SET client_id=?,titre=?,contenu=?,epingle=?,updated_at=datetime('now') WHERE id=?`,
    [client_id, titre, contenu, epingle, cur.id]);
  res.json({ ok: true });
});

app.delete('/api/notes/:id', auth, async (req, res) => {
  await db.run('DELETE FROM notes WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ---- APPELS (journal des appels, par client) ----
const DIRECTIONS = ['entrant', 'sortant', 'manque'];
const DIRECTION_LABEL = { entrant: 'Appel reçu', sortant: 'Appel fait', manque: 'Appel manqué' };

// Crée / met à jour / supprime l'événement « Rappeler » du calendrier lié à un appel
async function syncRappelEvent(appel) {
  const wanted = appel.a_rappeler && !appel.rappel_fait && appel.rappel_date;
  const existing = appel.evenement_id ? await db.get('SELECT * FROM evenements WHERE id=?', [appel.evenement_id]) : null;
  if (!wanted) {
    if (existing) {
      await google.deleteEventOut(existing).catch(() => {});
      await db.run('DELETE FROM evenements WHERE id=?', [existing.id]);
    }
    if (appel.evenement_id) await db.run('UPDATE appels SET evenement_id=NULL WHERE id=?', [appel.id]);
    return;
  }
  const who = await db.get('SELECT nom, prenom FROM clients WHERE id=?', [appel.client_id]);
  const titre = `Rappeler — ${`${who?.prenom || ''} ${who?.nom || ''}`.trim()}`;
  const heure = appel.rappel_heure || '09:00';
  let evId;
  if (existing) {
    evId = existing.id;
    await db.run(`UPDATE evenements SET client_id=?,titre=?,type='relance',date_debut=?,heure=?,updated_at=datetime('now') WHERE id=?`,
      [appel.client_id, titre, appel.rappel_date, heure, evId]);
  } else {
    const r = await db.run('INSERT INTO evenements (client_id,titre,type,date_debut,heure) VALUES (?,?,?,?,?)',
      [appel.client_id, titre, 'relance', appel.rappel_date, heure]);
    evId = r.lastID;
    await db.run('UPDATE appels SET evenement_id=? WHERE id=?', [evId, appel.id]);
  }
  google.syncEventOut(await db.get('SELECT * FROM evenements WHERE id=?', [evId])).catch(() => {});
}

app.get('/api/appels', auth, async (req, res) => {
  const { client_id, direction, rappel } = req.query;
  const where = [];
  const params = [];
  if (client_id) { where.push('a.client_id = ?'); params.push(client_id); }
  if (direction) { where.push('a.direction = ?'); params.push(direction); }
  if (rappel) where.push('a.a_rappeler = 1 AND a.rappel_fait = 0');
  res.json(await db.all(`
    SELECT a.*, c.nom, c.prenom, c.telephone, c.ville FROM appels a
    JOIN clients c ON a.client_id = c.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY a.date_appel DESC, IFNULL(a.heure,'') DESC, a.id DESC LIMIT 2000`, params));
});

app.post('/api/appels', auth, async (req, res) => {
  const b = req.body;
  const cid = Number(b.client_id);
  if (!cid || !(await db.get('SELECT id FROM clients WHERE id=?', [cid]))) return bad(res, 'Client introuvable');
  const now = localParts();
  const direction = DIRECTIONS.includes(b.direction) ? b.direction : 'entrant';
  const rappeler = b.a_rappeler ? 1 : 0;
  const r = await db.run(
    `INSERT INTO appels (client_id,direction,date_appel,heure,duree_min,sujet,resume,a_rappeler,rappel_date,rappel_heure)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [cid, direction, clean(b.date_appel) || now.date, clean(b.heure) || now.time,
      b.duree_min ? Number(b.duree_min) : null, clean(b.sujet), clean(b.resume), rappeler,
      rappeler ? clean(b.rappel_date) : null, rappeler ? clean(b.rappel_heure) : null]);
  const appel = await db.get('SELECT * FROM appels WHERE id=?', [r.lastID]);
  await syncRappelEvent(appel).catch(e => console.error('rappel', e));
  await addHistory(cid, 'appel', `${DIRECTION_LABEL[direction]}${appel.sujet ? ` — ${snippet(appel.sujet)}` : ''}`);
  res.json({ id: r.lastID });
});

app.put('/api/appels/:id', auth, async (req, res) => {
  const cur = await db.get('SELECT * FROM appels WHERE id=?', [req.params.id]);
  if (!cur) return res.status(404).json({ message: 'Appel introuvable' });
  const b = req.body;
  const direction = DIRECTIONS.includes(b.direction) ? b.direction : cur.direction;
  const rappeler = pick(b, cur, 'a_rappeler') ? 1 : 0;
  const fait = rappeler && pick(b, cur, 'rappel_fait') ? 1 : 0;
  await db.run(
    `UPDATE appels SET direction=?,date_appel=?,heure=?,duree_min=?,sujet=?,resume=?,a_rappeler=?,rappel_date=?,rappel_heure=?,
       rappel_fait=?,updated_at=datetime('now') WHERE id=?`,
    [direction, clean(pick(b, cur, 'date_appel')) || cur.date_appel, clean(pick(b, cur, 'heure')),
      pick(b, cur, 'duree_min') ? Number(pick(b, cur, 'duree_min')) : null,
      clean(pick(b, cur, 'sujet')), clean(pick(b, cur, 'resume')), rappeler,
      rappeler ? clean(pick(b, cur, 'rappel_date')) : null, rappeler ? clean(pick(b, cur, 'rappel_heure')) : null,
      fait, cur.id]);
  await syncRappelEvent(await db.get('SELECT * FROM appels WHERE id=?', [cur.id])).catch(e => console.error('rappel', e));
  if (fait && !cur.rappel_fait) await addHistory(cur.client_id, 'appel', 'Rappel effectué');
  res.json({ ok: true });
});

app.delete('/api/appels/:id', auth, async (req, res) => {
  const cur = await db.get('SELECT * FROM appels WHERE id=?', [req.params.id]);
  if (cur) {
    await syncRappelEvent({ ...cur, a_rappeler: 0 }).catch(e => console.error('rappel', e));
    await db.run('DELETE FROM appels WHERE id=?', [cur.id]);
  }
  res.json({ ok: true });
});

// ---- GOOGLE CALENDAR ----
app.get('/api/google/status', auth, async (req, res) => {
  res.json(await google.status());
});

app.get('/api/google/auth-url', auth, async (req, res) => {
  res.json({ url: google.getAuthUrl(await security.newOAuthState()) });
});

// Le paramètre `state` (usage unique, 10 min) empêche qu'un tiers fasse brancher son propre compte Google.
app.get('/api/google/callback', async (req, res) => {
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  try {
    if (req.query.error) throw new Error('Autorisation refusée dans Google');
    if (!(await security.consumeOAuthState(req.query.state))) throw new Error('Demande de connexion expirée ou invalide : relance la connexion depuis le CRM');
    await google.handleCallback(req.query.code);
    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px;">Connexion Google réussie (Agenda, Drive et Gmail selon les autorisations accordées). Tu peux fermer cette fenêtre. <script>setTimeout(()=>window.close(),1500)</script></body></html>');
  } catch (e) {
    res.status(400).send('Erreur de connexion Google : ' + escapeHtml(e.message));
  }
});

app.post('/api/google/disconnect', auth, async (req, res) => {
  await google.disconnect();
  res.json({ ok: true });
});

app.post('/api/google/sync', auth, async (req, res) => {
  const result = await google.syncAll();
  res.json(result);
});

app.get('/api/google/calendars', auth, async (req, res) => {
  res.json(await google.listCalendars());
});

app.post('/api/google/calendar', auth, async (req, res) => {
  await google.setCalendarId(req.body.calendarId);
  res.json({ ok: true });
});

app.post('/api/google/calendar/create', auth, async (req, res) => {
  const calendarId = await google.createDedicatedCalendar();
  res.json({ ok: true, calendarId });
});

// ---- STATS ----
app.get('/api/stats', auth, async (req, res) => {
  const activeStages = STAGES.filter(s => s.key !== 'complete').map(s => s.key);
  const placeholders = activeStages.map(() => '?').join(',');
  // « Aujourd'hui » à l'heure du Québec (SQLite date('now') est en UTC : il bascule à 20 h)
  const today = localParts().date;
  const weekAgo = localParts(new Date(Date.now() - 6 * 86400000)).date;

  const [
    { n: totalClients },
    { n: totalOpportunites },
    { v: valeurPipeline },
    parEtape,
    recents,
    upcoming,
    servicesRows,
    { v: revenuMois },
    { v: revenuMoisPrecedent },
    quotesActives,
    quotesActivesSemaineDerniere,
    projetsEnCours,
    evenementsProjetsAvenir,
    { total: totalConversion90 },
    { complete: completeConversion90 },
    appelsARappeler,
    appelsSemaine,
    { n: nbRappels }
  ] = await Promise.all([
    db.get('SELECT COUNT(*) as n FROM clients'),
    db.get(`SELECT COUNT(*) as n FROM opportunites WHERE etape IN (${placeholders})`, activeStages),
    db.get(`SELECT COALESCE(SUM(valeur),0) as v FROM opportunites WHERE etape IN (${placeholders})`, activeStages),
    db.all(`SELECT etape, COUNT(*) as count, COALESCE(SUM(valeur),0) as valeur FROM opportunites GROUP BY etape`),
    db.all(`SELECT c.*, o.etape, o.service, o.titre as opp_titre, o.valeur FROM clients c
      LEFT JOIN opportunites o ON o.client_id = c.id ORDER BY c.created_at DESC LIMIT 5`),
    db.all(`SELECT e.*, c.nom, c.prenom, c.ville FROM evenements e
      LEFT JOIN clients c ON e.client_id = c.id
      WHERE e.date_debut >= ? ORDER BY e.date_debut ASC, e.heure ASC LIMIT 6`, [today]),
    db.all(`SELECT service, COALESCE(SUM(valeur),0) as total FROM opportunites WHERE service IS NOT NULL GROUP BY service`),
    db.get(`SELECT COALESCE(SUM(montant),0) as v FROM invoices WHERE statut='payee' AND strftime('%Y-%m', updated_at) = strftime('%Y-%m', 'now')`),
    db.get(`SELECT COALESCE(SUM(montant),0) as v FROM invoices WHERE statut='payee' AND strftime('%Y-%m', updated_at) = strftime('%Y-%m', date('now','-1 month'))`),
    db.get(`SELECT COUNT(*) as n FROM quotes WHERE statut IN ('brouillon','envoyee')`),
    db.get(`SELECT COUNT(*) as n FROM quotes WHERE statut IN ('brouillon','envoyee') AND created_at >= datetime('now','-7 days')`),
    db.get(`SELECT COUNT(*) as n FROM opportunites WHERE etape='contrat'`),
    db.get(`SELECT COUNT(*) as n FROM evenements WHERE type='projet' AND date_debut >= ?`, [today]),
    db.get(`SELECT COUNT(*) as total FROM opportunites WHERE etape != 'lead' AND created_at >= datetime('now','-90 days')`),
    db.get(`SELECT COUNT(*) as complete FROM opportunites WHERE etape='complete' AND created_at >= datetime('now','-90 days')`),
    db.all(`SELECT a.*, c.nom, c.prenom, c.telephone FROM appels a JOIN clients c ON a.client_id = c.id
      WHERE a.a_rappeler = 1 AND a.rappel_fait = 0
      ORDER BY (a.rappel_date IS NULL), a.rappel_date ASC, IFNULL(a.rappel_heure,'') ASC LIMIT 8`),
    db.get(`SELECT COUNT(*) as n FROM appels WHERE date_appel >= ?`, [weekAgo]),
    db.get(`SELECT COUNT(*) as n FROM appels WHERE a_rappeler = 1 AND rappel_fait = 0`)
  ]);

  const historiqueActivite = await db.all(`
    SELECT h.*, c.nom, c.prenom FROM historique h
    JOIN clients c ON h.client_id = c.id
    ORDER BY h.created_at DESC, h.id DESC LIMIT 6`);

  const pctDelta = (cur, prev) => prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : (cur > 0 ? 100 : 0);
  const tauxConversion = totalConversion90 > 0 ? Math.round((completeConversion90 / totalConversion90) * 1000) / 10 : 0;

  res.json({
    totalClients, totalOpportunites, valeurPipeline,
    parEtape, recents, upcoming, servicesRows,
    revenuMois, revenuMoisDelta: pctDelta(revenuMois, revenuMoisPrecedent),
    quotesActives: quotesActives.n, quotesActivesSemaine: quotesActivesSemaineDerniere.n,
    projetsEnCours: projetsEnCours.n, evenementsProjetsAvenir: evenementsProjetsAvenir.n,
    tauxConversion,
    appelsARappeler, appelsSemaine: appelsSemaine.n, nbRappels,
    today,
    historiqueActivite
  });
});

// Intégrations Drive / Meta : webhooks protégés par leur clé, routes CRM par auth.
const integrations = require('./integrations-setup');
integrations.register(app, { auth });
security.registerAudit(app);
backup.register(app, { auth, uploadsDirs: [uploadsDir, legacyUploadsDir] });
sales.register(app, { auth, upload, uploadsDir });

// Route API inconnue → JSON (et non la page React)
app.use('/api', (req, res) => res.status(404).json({ message: 'Route introuvable' }));

// Toutes les autres routes → React app
if (fs.existsSync(clientDist)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Erreurs : réponse JSON propre au lieu d'une requête qui reste sans réponse
app.use((err, req, res, next) => {
  // On journalise le message seulement : l'objet d'erreur complet (googleapis, fetch) peut contenir des jetons.
  console.error(req.method, redactUrl(req.originalUrl), err?.code || '', err?.message || err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ message: err.message || 'Erreur serveur' });
});

process.on('unhandledRejection', err => console.error('unhandledRejection', err?.code || '', err?.message || err));

db.init().then(async () => {
  await migrateSecrets();          // chiffre les jetons encore en clair
  await security.purgeExpired();
  app.listen(PORT, () => {
    console.log(`CRM eProtectoIT démarré sur http://localhost:${PORT}`);
    if (process.env.DISABLE_JOBS !== '1') {
      // One-shot administrative Drive sync, opt-in through Railway. No OAuth token or client details logged.
      if (process.env.CRM_DRIVE_ONESHOT === 'preview' || process.env.CRM_DRIVE_ONESHOT === 'import') {
        setTimeout(async () => {
          const mode = process.env.CRM_DRIVE_ONESHOT;
          try {
            const { getSetting, setSetting } = require('./lib');
            const drive = require('./drive');
            const previous = await getSetting('crm_drive_oneshot_completed');
            if (previous === mode + ':' + process.env.CRM_DRIVE_ONESHOT_ID) {
              console.info('[drive-oneshot] already completed');
              return;
            }
            const health = await require('./google').status();
            if (!health.connected || !health.drive) { console.warn('[drive-oneshot] Google Drive authorization missing'); return; }
            if (mode === 'import' && !(await getSetting('backup_remote_last_ok'))) {
              console.error('[drive-oneshot] import blocked: no confirmed off-volume backup');
              return;
            }
            const opts = { dry: mode === 'preview', full: true };
            const result = await drive.sync(opts);
            const report = { ok: result.ok, dry: result.dry, created: result.created, matched: result.matched, unchanged: result.unchanged, review: result.review, errors: result.errors, message: result.message || '' };
            console.info('[drive-oneshot] ' + JSON.stringify(report));
            if (result.ok) await setSetting('crm_drive_oneshot_completed', mode + ':' + process.env.CRM_DRIVE_ONESHOT_ID);
          } catch (error) {
            console.error('[drive-oneshot] failed:', String(error?.message || error).slice(0,150));
          }
        }, 30000).unref?.();
      }
      integrations.startJobs();
      backup.startJob();
      sales.startJobs();
      setInterval(() => security.purgeExpired().catch(() => {}), 6 * 3600 * 1000).unref();
    }
  });
}).catch(err => {
  console.error('Erreur initialisation DB:', err);
  process.exit(1);
});
