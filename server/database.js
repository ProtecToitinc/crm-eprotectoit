const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'crm.db');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function columnExists(table, column) {
  const cols = await all(`PRAGMA table_info(${table})`);
  return cols.some(c => c.name === column);
}

async function init() {
  await run('PRAGMA foreign_keys = ON');

  await run(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    email TEXT,
    telephone TEXT,
    adresse TEXT,
    ville TEXT,
    code_postal TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  if (!(await columnExists('clients', 'lat'))) {
    await run(`ALTER TABLE clients ADD COLUMN lat REAL`);
    await run(`ALTER TABLE clients ADD COLUMN lng REAL`);
  }

  await run(`CREATE TABLE IF NOT EXISTS toitures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    materiau TEXT,
    age_annees INTEGER,
    superficie_m2 REAL,
    etat TEXT,
    notes TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS opportunites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    titre TEXT NOT NULL,
    etape TEXT NOT NULL DEFAULT 'lead',
    service TEXT,
    valeur REAL DEFAULT 0,
    notes TEXT,
    date_prevue TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  // Migration: add service column if missing (upgrade from older schema)
  if (!(await columnExists('opportunites', 'service'))) {
    await run(`ALTER TABLE opportunites ADD COLUMN service TEXT`);
  }

  // Migration: remap old stage names to new pipeline stages
  const stageMap = { prospect: 'lead', inspection: 'rdv', devis: 'soumission', contrat: 'contrat', ferme: 'complete' };
  for (const [oldStage, newStage] of Object.entries(stageMap)) {
    await run(`UPDATE opportunites SET etape = ? WHERE etape = ?`, [newStage, oldStage]);
  }

  await run(`CREATE TABLE IF NOT EXISTS taches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    opportunite_id INTEGER REFERENCES opportunites(id) ON DELETE SET NULL,
    titre TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    completed INTEGER DEFAULT 0,
    priorite TEXT DEFAULT 'normale',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  await run(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    nom TEXT NOT NULL,
    type_doc TEXT,
    chemin TEXT NOT NULL,
    taille INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  await run(`CREATE TABLE IF NOT EXISTS historique (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  await run(`CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    opportunite_id INTEGER REFERENCES opportunites(id) ON DELETE SET NULL,
    service TEXT,
    montant REAL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'brouillon',
    date_visite TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  await run(`CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
    montant REAL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'en_attente',
    date_echeance TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  await run(`CREATE TABLE IF NOT EXISTS evenements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    opportunite_id INTEGER REFERENCES opportunites(id) ON DELETE SET NULL,
    titre TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'rdv',
    date_debut TEXT NOT NULL,
    heure TEXT,
    google_event_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  await run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // Notes : client_id NULL = note générale
  await run(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    titre TEXT,
    contenu TEXT NOT NULL,
    epingle INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_notes_client ON notes(client_id)`);

  // Journal d'appels : direction = entrant (le client a appelé) | sortant (on l'a appelé) | manque
  await run(`CREATE TABLE IF NOT EXISTS appels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    direction TEXT NOT NULL DEFAULT 'entrant',
    date_appel TEXT NOT NULL,
    heure TEXT,
    duree_min INTEGER,
    sujet TEXT,
    resume TEXT,
    a_rappeler INTEGER DEFAULT 0,
    rappel_date TEXT,
    rappel_heure TEXT,
    rappel_fait INTEGER DEFAULT 0,
    evenement_id INTEGER REFERENCES evenements(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_appels_client ON appels(client_id)`);
}

module.exports = { run, get, all, init, dbPath };
