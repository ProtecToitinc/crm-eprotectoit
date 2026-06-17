const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;
const PASSWORD = process.env.CRM_PASSWORD || 'eprotectoit2024';

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Servir le frontend React en production
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

// Auth
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

// ---- CLIENTS ----
app.get('/api/clients', auth, async (req, res) => {
  const { q } = req.query;
  const like = `%${q || ''}%`;
  const sql = `
    SELECT c.*,
      (SELECT COUNT(*) FROM opportunites WHERE client_id = c.id) as nb_opportunites,
      (SELECT etape FROM opportunites WHERE client_id = c.id ORDER BY updated_at DESC LIMIT 1) as derniere_etape
    FROM clients c
    ${q ? 'WHERE c.nom LIKE ? OR c.prenom LIKE ? OR c.email LIKE ? OR c.telephone LIKE ? OR c.ville LIKE ?' : ''}
    ORDER BY c.created_at DESC`;
  const params = q ? [like, like, like, like, like] : [];
  res.json(await db.all(sql, params));
});

app.get('/api/clients/:id', auth, async (req, res) => {
  const client = await db.get('SELECT * FROM clients WHERE id = ?', [req.params.id]);
  if (!client) return res.status(404).json({ message: 'Client introuvable' });
  const [toiture, opportunites, taches, documents, historique] = await Promise.all([
    db.get('SELECT * FROM toitures WHERE client_id = ?', [req.params.id]),
    db.all('SELECT * FROM opportunites WHERE client_id = ? ORDER BY updated_at DESC', [req.params.id]),
    db.all('SELECT * FROM taches WHERE client_id = ? ORDER BY completed ASC, due_date ASC', [req.params.id]),
    db.all('SELECT * FROM documents WHERE client_id = ? ORDER BY created_at DESC', [req.params.id]),
    db.all('SELECT * FROM historique WHERE client_id = ? ORDER BY created_at DESC LIMIT 50', [req.params.id]),
  ]);
  res.json({ ...client, toiture, opportunites, taches, documents, historique });
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

// ---- OPPORTUNITES ----
app.get('/api/opportunites', auth, async (req, res) => {
  res.json(await db.all(`
    SELECT o.*, c.nom, c.prenom, c.telephone FROM opportunites o
    JOIN clients c ON o.client_id = c.id ORDER BY o.updated_at DESC`));
});

app.post('/api/opportunites', auth, async (req, res) => {
  const { client_id, titre, etape, valeur, notes, date_prevue } = req.body;
  const r = await db.run(
    'INSERT INTO opportunites (client_id,titre,etape,valeur,notes,date_prevue) VALUES (?,?,?,?,?,?)',
    [client_id, titre, etape || 'prospect', valeur || 0, notes, date_prevue]);
  await db.run('INSERT INTO historique (client_id,type,description) VALUES (?,?,?)', [client_id, 'opportunite', `Opportunité créée : ${titre}`]);
  res.json({ id: r.lastID });
});

app.put('/api/opportunites/:id', auth, async (req, res) => {
  const { titre, etape, valeur, notes, date_prevue } = req.body;
  const opp = await db.get('SELECT * FROM opportunites WHERE id=?', [req.params.id]);
  await db.run(
    `UPDATE opportunites SET titre=?,etape=?,valeur=?,notes=?,date_prevue=?,updated_at=datetime('now') WHERE id=?`,
    [titre, etape, valeur || 0, notes, date_prevue, req.params.id]);
  if (opp && opp.etape !== etape) {
    const L = { prospect: 'Prospect', inspection: 'Inspection', devis: 'Devis', contrat: 'Contrat', ferme: 'Fermé' };
    await db.run('INSERT INTO historique (client_id,type,description) VALUES (?,?,?)',
      [opp.client_id, 'etape', `Pipeline : ${L[opp.etape]} → ${L[etape]}`]);
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

// ---- STATS ----
app.get('/api/stats', auth, async (req, res) => {
  const [
    { n: totalClients }, { n: totalOpportunites }, { v: valeurPipeline },
    { n: tachesEnCours }, { n: tachesEnRetard },
    parEtape, recents, tachesAujourdhui
  ] = await Promise.all([
    db.get('SELECT COUNT(*) as n FROM clients'),
    db.get("SELECT COUNT(*) as n FROM opportunites WHERE etape != 'ferme'"),
    db.get("SELECT COALESCE(SUM(valeur),0) as v FROM opportunites WHERE etape != 'ferme'"),
    db.get("SELECT COUNT(*) as n FROM taches WHERE completed=0"),
    db.get("SELECT COUNT(*) as n FROM taches WHERE completed=0 AND due_date < date('now')"),
    db.all("SELECT etape, COUNT(*) as count, COALESCE(SUM(valeur),0) as valeur FROM opportunites WHERE etape != 'ferme' GROUP BY etape"),
    db.all(`SELECT c.*, o.etape, o.titre as opp_titre FROM clients c
      LEFT JOIN opportunites o ON o.client_id = c.id ORDER BY c.created_at DESC LIMIT 5`),
    db.all(`SELECT t.*, c.nom, c.prenom FROM taches t
      LEFT JOIN clients c ON t.client_id = c.id
      WHERE t.completed=0 AND (t.due_date IS NULL OR t.due_date <= date('now'))
      ORDER BY t.due_date ASC LIMIT 10`)
  ]);
  res.json({ totalClients, totalOpportunites, valeurPipeline, tachesEnCours, tachesEnRetard, parEtape, recents, tachesAujourdhui });
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
