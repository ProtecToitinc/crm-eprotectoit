require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const db = require('./database');
const { STAGES, SERVICES, QUOTE_STATUSES, INVOICE_STATUSES } = require('./constants');
const google = require('./google');

const app = express();
const PORT = process.env.PORT || 3001;
const PASSWORD = process.env.CRM_PASSWORD || 'eprotectoit2024';

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

const TOKEN = Buffer.from(PASSWORD).toString('base64');

app.post('/api/auth/login', (req, res) => {
  if (req.body.password === PASSWORD) res.json({ ok: true, token: TOKEN });
  else res.status(401).json({ ok: false, message: 'Mot de passe incorrect' });
});

app.post('/api/auth/verify', (req, res) => {
  res.json({ ok: req.body.token === TOKEN });
});

function auth(req, res, next) {
  if (req.headers.authorization?.replace('Bearer ', '') !== TOKEN)
    return res.status(401).json({ message: 'Non autorisé' });
  next();
}

app.get('/api/meta', auth, (req, res) => {
  res.json({ stages: STAGES, services: SERVICES, quoteStatuses: QUOTE_STATUSES, invoiceStatuses: INVOICE_STATUSES });
});

// ---- CLIENTS ----
app.get('/api/clients', auth, async (req, res) => {
  const { q } = req.query;
  const like = `%${q || ''}%`;
  const sql = `
    SELECT c.*,
      (SELECT COUNT(*) FROM opportunites WHERE client_id = c.id) as nb_opportunites,
      (SELECT etape FROM opportunites WHERE client_id = c.id ORDER BY updated_at DESC LIMIT 1) as derniere_etape,
      (SELECT service FROM opportunites WHERE client_id = c.id ORDER BY updated_at DESC LIMIT 1) as dernier_service,
      (SELECT valeur FROM opportunites WHERE client_id = c.id ORDER BY updated_at DESC LIMIT 1) as derniere_valeur,
      (SELECT MAX(updated_at) FROM opportunites WHERE client_id = c.id) as dernier_contact
    FROM clients c
    ${q ? 'WHERE c.nom LIKE ? OR c.prenom LIKE ? OR c.email LIKE ? OR c.telephone LIKE ? OR c.ville LIKE ?' : ''}
    ORDER BY c.created_at DESC`;
  const params = q ? [like, like, like, like, like] : [];
  res.json(await db.all(sql, params));
});

app.get('/api/clients/:id', auth, async (req, res) => {
  const client = await db.get('SELECT * FROM clients WHERE id = ?', [req.params.id]);
  if (!client) return res.status(404).json({ message: 'Client introuvable' });
  const [toiture, opportunites, taches, documents, historique, quotes, invoices, evenements] = await Promise.all([
    db.get('SELECT * FROM toitures WHERE client_id = ?', [req.params.id]),
    db.all('SELECT * FROM opportunites WHERE client_id = ? ORDER BY updated_at DESC', [req.params.id]),
    db.all('SELECT * FROM taches WHERE client_id = ? ORDER BY completed ASC, due_date ASC', [req.params.id]),
    db.all('SELECT * FROM documents WHERE client_id = ? ORDER BY created_at DESC', [req.params.id]),
    db.all('SELECT * FROM historique WHERE client_id = ? ORDER BY created_at DESC LIMIT 50', [req.params.id]),
    db.all('SELECT * FROM quotes WHERE client_id = ? ORDER BY created_at DESC', [req.params.id]),
    db.all('SELECT * FROM invoices WHERE client_id = ? ORDER BY created_at DESC', [req.params.id]),
    db.all('SELECT * FROM evenements WHERE client_id = ? ORDER BY date_debut DESC', [req.params.id]),
  ]);
  res.json({ ...client, toiture, opportunites, taches, documents, historique, quotes, invoices, evenements });
});

app.post('/api/clients', auth, async (req, res) => {
  const { nom, prenom, email, telephone, adresse, ville, code_postal, notes, toiture } = req.body;
  const r = await db.run(
    'INSERT INTO clients (nom,prenom,email,telephone,adresse,ville,code_postal,notes) VALUES (?,?,?,?,?,?,?,?)',
    [nom, prenom, email, telephone, adresse, ville, code_postal, notes]
  );
  if (toiture?.materiau) {
    await db.run('INSERT INTO toitures (client_id,materiau,age_annees,superficie_m2,etat,notes) VALUES (?,?,?,?,?,?)',
      [r.lastID, toiture.materiau, toiture.age_annees, toiture.superficie_m2, toiture.etat, toiture.notes]);
  }
  await db.run('INSERT INTO historique (client_id,type,description) VALUES (?,?,?)', [r.lastID, 'creation', 'Client créé']);
  res.json({ id: r.lastID });
});

app.put('/api/clients/:id', auth, async (req, res) => {
  const { nom, prenom, email, telephone, adresse, ville, code_postal, notes, toiture } = req.body;
  const id = req.params.id;
  await db.run('UPDATE clients SET nom=?,prenom=?,email=?,telephone=?,adresse=?,ville=?,code_postal=?,notes=? WHERE id=?',
    [nom, prenom, email, telephone, adresse, ville, code_postal, notes, id]);
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
  await db.run('INSERT INTO historique (client_id,type,description) VALUES (?,?,?)', [id, 'modification', 'Fiche client modifiée']);
  res.json({ ok: true });
});

app.delete('/api/clients/:id', auth, async (req, res) => {
  await db.run('DELETE FROM clients WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ---- OPPORTUNITES (deals) ----
app.get('/api/opportunites', auth, async (req, res) => {
  res.json(await db.all(`
    SELECT o.*, c.nom, c.prenom, c.telephone, c.email, c.ville FROM opportunites o
    JOIN clients c ON o.client_id = c.id ORDER BY o.updated_at DESC`));
});

app.post('/api/opportunites', auth, async (req, res) => {
  const { client_id, titre, etape, service, valeur, notes, date_prevue } = req.body;
  const r = await db.run(
    'INSERT INTO opportunites (client_id,titre,etape,service,valeur,notes,date_prevue) VALUES (?,?,?,?,?,?,?)',
    [client_id, titre, etape || 'lead', service, valeur || 0, notes, date_prevue]);
  await db.run('INSERT INTO historique (client_id,type,description) VALUES (?,?,?)', [client_id, 'opportunite', `Dossier créé : ${titre}`]);
  res.json({ id: r.lastID });
});

app.put('/api/opportunites/:id', auth, async (req, res) => {
  const { titre, etape, service, valeur, notes, date_prevue } = req.body;
  const opp = await db.get('SELECT * FROM opportunites WHERE id=?', [req.params.id]);
  await db.run(
    `UPDATE opportunites SET titre=?,etape=?,service=?,valeur=?,notes=?,date_prevue=?,updated_at=datetime('now') WHERE id=?`,
    [titre, etape, service, valeur || 0, notes, date_prevue, req.params.id]);
  if (opp && opp.etape !== etape) {
    const L = Object.fromEntries(STAGES.map(s => [s.key, s.short]));
    await db.run('INSERT INTO historique (client_id,type,description) VALUES (?,?,?)',
      [opp.client_id, 'etape', `Pipeline : ${L[opp.etape] || opp.etape} → ${L[etape] || etape}`]);
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
  const r = await db.run(
    'INSERT INTO taches (client_id,opportunite_id,titre,description,due_date,priorite) VALUES (?,?,?,?,?,?)',
    [client_id || null, opportunite_id || null, titre, description, due_date, priorite || 'normale']);
  res.json({ id: r.lastID });
});

app.put('/api/taches/:id', auth, async (req, res) => {
  const { titre, description, due_date, completed, priorite } = req.body;
  await db.run('UPDATE taches SET titre=?,description=?,due_date=?,completed=?,priorite=? WHERE id=?',
    [titre, description, due_date, completed ? 1 : 0, priorite, req.params.id]);
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
  const r = await db.run('INSERT INTO documents (client_id,nom,type_doc,chemin,taille) VALUES (?,?,?,?,?)',
    [client_id, req.file.originalname, type_doc, req.file.filename, req.file.size]);
  await db.run('INSERT INTO historique (client_id,type,description) VALUES (?,?,?)',
    [client_id, 'document', `Document ajouté : ${req.file.originalname}`]);
  res.json({ id: r.lastID, nom: req.file.originalname, chemin: req.file.filename });
});

app.delete('/api/documents/:id', auth, async (req, res) => {
  const doc = await db.get('SELECT * FROM documents WHERE id=?', [req.params.id]);
  if (doc) {
    const fp = path.join(uploadsDir, doc.chemin);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    await db.run('DELETE FROM documents WHERE id=?', [req.params.id]);
  }
  res.json({ ok: true });
});

// ---- QUOTES (soumissions) ----
async function nextReference(prefix, table) {
  const year = new Date().getFullYear();
  const row = await db.get(`SELECT COUNT(*) as n FROM ${table} WHERE reference LIKE ?`, [`${prefix}-${year}-%`]);
  const num = String((row?.n || 0) + 1).padStart(4, '0');
  return `${prefix}-${year}-${num}`;
}

app.get('/api/quotes', auth, async (req, res) => {
  res.json(await db.all(`
    SELECT q.*, c.nom, c.prenom FROM quotes q
    JOIN clients c ON q.client_id = c.id ORDER BY q.created_at DESC`));
});

app.post('/api/quotes', auth, async (req, res) => {
  const { client_id, opportunite_id, service, montant, statut, date_visite, notes } = req.body;
  const reference = await nextReference('SOU', 'quotes');
  const r = await db.run(
    'INSERT INTO quotes (reference,client_id,opportunite_id,service,montant,statut,date_visite,notes) VALUES (?,?,?,?,?,?,?,?)',
    [reference, client_id, opportunite_id || null, service, montant || 0, statut || 'brouillon', date_visite, notes]);
  await db.run('INSERT INTO historique (client_id,type,description) VALUES (?,?,?)', [client_id, 'soumission', `Soumission ${reference} créée`]);
  res.json({ id: r.lastID, reference });
});

app.put('/api/quotes/:id', auth, async (req, res) => {
  const { service, montant, statut, date_visite, notes } = req.body;
  await db.run(`UPDATE quotes SET service=?,montant=?,statut=?,date_visite=?,notes=?,updated_at=datetime('now') WHERE id=?`,
    [service, montant || 0, statut, date_visite, notes, req.params.id]);
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
    JOIN clients c ON i.client_id = c.id ORDER BY i.created_at DESC`));
});

app.post('/api/invoices', auth, async (req, res) => {
  const { client_id, quote_id, montant, statut, date_echeance } = req.body;
  const reference = await nextReference('FAC', 'invoices');
  const r = await db.run(
    'INSERT INTO invoices (reference,client_id,quote_id,montant,statut,date_echeance) VALUES (?,?,?,?,?,?)',
    [reference, client_id, quote_id || null, montant || 0, statut || 'en_attente', date_echeance]);
  await db.run('INSERT INTO historique (client_id,type,description) VALUES (?,?,?)', [client_id, 'facture', `Facture ${reference} créée`]);
  res.json({ id: r.lastID, reference });
});

app.put('/api/invoices/:id', auth, async (req, res) => {
  const { montant, statut, date_echeance } = req.body;
  await db.run(`UPDATE invoices SET montant=?,statut=?,date_echeance=?,updated_at=datetime('now') WHERE id=?`,
    [montant || 0, statut, date_echeance, req.params.id]);
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
  sql += ` ORDER BY e.date_debut ASC`;
  res.json(await db.all(sql, params));
});

app.post('/api/evenements', auth, async (req, res) => {
  const { client_id, opportunite_id, titre, type, date_debut, heure } = req.body;
  const r = await db.run(
    'INSERT INTO evenements (client_id,opportunite_id,titre,type,date_debut,heure) VALUES (?,?,?,?,?,?)',
    [client_id || null, opportunite_id || null, titre, type || 'rdv', date_debut, heure]);
  if (client_id) {
    await db.run('INSERT INTO historique (client_id,type,description) VALUES (?,?,?)', [client_id, 'evenement', `RDV planifié : ${titre}`]);
  }
  const ev = await db.get('SELECT * FROM evenements WHERE id=?', [r.lastID]);
  google.syncEventOut(ev).catch(() => {});
  res.json({ id: r.lastID });
});

app.put('/api/evenements/:id', auth, async (req, res) => {
  const { titre, type, date_debut, heure } = req.body;
  await db.run(`UPDATE evenements SET titre=?,type=?,date_debut=?,heure=?,updated_at=datetime('now') WHERE id=?`,
    [titre, type, date_debut, heure, req.params.id]);
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

// ---- GOOGLE CALENDAR ----
app.get('/api/google/status', auth, async (req, res) => {
  res.json(await google.status());
});

app.get('/api/google/auth-url', auth, async (req, res) => {
  res.json({ url: google.getAuthUrl() });
});

app.get('/api/google/callback', async (req, res) => {
  try {
    await google.handleCallback(req.query.code);
    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px;">Connexion Google Calendar réussie. <script>setTimeout(()=>window.close(),1500)</script></body></html>');
  } catch (e) {
    res.status(500).send('Erreur de connexion Google : ' + e.message);
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
    { complete: completeConversion90 }
  ] = await Promise.all([
    db.get('SELECT COUNT(*) as n FROM clients'),
    db.get(`SELECT COUNT(*) as n FROM opportunites WHERE etape IN (${placeholders})`, activeStages),
    db.get(`SELECT COALESCE(SUM(valeur),0) as v FROM opportunites WHERE etape IN (${placeholders})`, activeStages),
    db.all(`SELECT etape, COUNT(*) as count, COALESCE(SUM(valeur),0) as valeur FROM opportunites GROUP BY etape`),
    db.all(`SELECT c.*, o.etape, o.service, o.titre as opp_titre, o.valeur FROM clients c
      LEFT JOIN opportunites o ON o.client_id = c.id ORDER BY c.created_at DESC LIMIT 5`),
    db.all(`SELECT e.*, c.nom, c.prenom, c.ville FROM evenements e
      LEFT JOIN clients c ON e.client_id = c.id
      WHERE e.date_debut >= date('now') ORDER BY e.date_debut ASC, e.heure ASC LIMIT 6`),
    db.all(`SELECT service, COALESCE(SUM(valeur),0) as total FROM opportunites WHERE service IS NOT NULL GROUP BY service`),
    db.get(`SELECT COALESCE(SUM(montant),0) as v FROM invoices WHERE statut='payee' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`),
    db.get(`SELECT COALESCE(SUM(montant),0) as v FROM invoices WHERE statut='payee' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', date('now','-1 month'))`),
    db.get(`SELECT COUNT(*) as n FROM quotes WHERE statut IN ('brouillon','envoyee')`),
    db.get(`SELECT COUNT(*) as n FROM quotes WHERE statut IN ('brouillon','envoyee') AND created_at >= datetime('now','-7 days')`),
    db.get(`SELECT COUNT(*) as n FROM opportunites WHERE etape='contrat'`),
    db.get(`SELECT COUNT(*) as n FROM evenements WHERE type='projet' AND date_debut >= date('now')`),
    db.get(`SELECT COUNT(*) as total FROM opportunites WHERE etape != 'lead' AND created_at >= datetime('now','-90 days')`),
    db.get(`SELECT COUNT(*) as complete FROM opportunites WHERE etape='complete' AND created_at >= datetime('now','-90 days')`)
  ]);

  const historiqueActivite = await db.all(`
    SELECT h.*, c.nom, c.prenom FROM historique h
    JOIN clients c ON h.client_id = c.id
    ORDER BY h.created_at DESC LIMIT 6`);

  const pctDelta = (cur, prev) => prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : (cur > 0 ? 100 : 0);
  const tauxConversion = totalConversion90 > 0 ? Math.round((completeConversion90 / totalConversion90) * 1000) / 10 : 0;

  res.json({
    totalClients, totalOpportunites, valeurPipeline,
    parEtape, recents, upcoming, servicesRows,
    revenuMois, revenuMoisDelta: pctDelta(revenuMois, revenuMoisPrecedent),
    quotesActives: quotesActives.n, quotesActivesSemaine: quotesActivesSemaineDerniere.n,
    projetsEnCours: projetsEnCours.n, evenementsProjetsAvenir: evenementsProjetsAvenir.n,
    tauxConversion,
    historiqueActivite
  });
});

// Toutes les autres routes → React app
if (fs.existsSync(clientDist)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

db.init().then(() => {
  app.listen(PORT, () => {
    console.log(`CRM eProtectoIT démarré sur http://localhost:${PORT}`);
    console.log(`Mot de passe : ${PASSWORD}`);
  });
}).catch(err => {
  console.error('Erreur initialisation DB:', err);
  process.exit(1);
});
