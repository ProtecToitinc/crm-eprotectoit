'use strict';
// À appeler une seule fois après l'initialisation de la base SQLite actuelle.
// Ne supprime ni ne réécrit aucune table existante.
const db=require('./database');
async function migrate() {
  await db.run(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL DEFAULT 'manuel',
    external_id TEXT NOT NULL,
    prenom TEXT DEFAULT '',nom TEXT DEFAULT '',email TEXT DEFAULT '',telephone TEXT DEFAULT '',
    adresse TEXT DEFAULT '',ville TEXT DEFAULT '',code_postal TEXT DEFAULT '',message TEXT DEFAULT '',
    campagne TEXT DEFAULT '',ensemble TEXT DEFAULT '',annonce TEXT DEFAULT '',formulaire TEXT DEFAULT '',
    plateforme TEXT DEFAULT '',donnees TEXT DEFAULT '{}',
    statut TEXT NOT NULL DEFAULT 'nouveau',vu INTEGER NOT NULL DEFAULT 0,
    client_id INTEGER,notifie INTEGER NOT NULL DEFAULT 0,
    notif_tentatives INTEGER NOT NULL DEFAULT 0,notif_erreur TEXT,
    recu_at TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_source_external ON leads(source,external_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(statut,vu)');
  await db.run(`CREATE TABLE IF NOT EXISTS drive_items (
    drive_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,name TEXT NOT NULL,parent_id TEXT,
    client_id INTEGER,opportunite_id INTEGER,quote_id INTEGER,document_id INTEGER,
    modified_time TEXT,web_link TEXT,snapshot TEXT,
    status TEXT NOT NULL DEFAULT 'ok',message TEXT,synced_at TEXT
  )`);
  // decision : choix manuel de l'utilisateur pour un élément à valider ('lier' | 'creer' | 'ignorer')
  const driveCols = await db.all('PRAGMA table_info(drive_items)');
  if (!driveCols.some(c => c.name === 'decision')) await db.run('ALTER TABLE drive_items ADD COLUMN decision TEXT');
  await db.run('CREATE INDEX IF NOT EXISTS idx_drive_items_client ON drive_items(client_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_drive_items_parent ON drive_items(parent_id)');
}
module.exports={migrate};