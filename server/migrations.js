'use strict';
// Tables ajoutées après la version initiale. Idempotent : ne supprime ni ne réécrit aucune donnée existante.
const db = require('./database');

async function addColumn(table, column, definition) {
  const cols = await db.all(`PRAGMA table_info(${table})`);
  if (!cols.some(c => c.name === column)) await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function migrate() {
  // Sécurité : sessions qui expirent, états OAuth à usage unique, journal d'audit
  await db.run(`CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    created_ms INTEGER NOT NULL,
    last_seen_ms INTEGER NOT NULL,
    ip TEXT,
    user_agent TEXT
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS oauth_states (
    state_hash TEXT PRIMARY KEY,
    expires_ms INTEGER NOT NULL
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL DEFAULT (datetime('now')),
    actor TEXT,
    ip TEXT,
    action TEXT NOT NULL,
    entity TEXT,
    entity_id INTEGER,
    before_json TEXT,
    after_json TEXT,
    details TEXT
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at)');

  // Deux utilisateurs : chaque session porte un nom ; les fiches clients montrent qui s'en occupe
  await addColumn('sessions', 'user_name', 'TEXT');
  for (const [col, def] of [['responsable', 'TEXT'], ['modifie_par', 'TEXT'], ['modifie_at', 'TEXT']]) await addColumn('clients', col, def);

  // Leads : provenance exacte de la publicité, suivi et prise en charge
  for (const [col, def] of [['campaign_id', 'TEXT'], ['adset_id', 'TEXT'], ['ad_id', 'TEXT'], ['form_name', 'TEXT'],
    ['dernier_contact', 'TEXT'], ['rappel_at', 'TEXT'], ['tentatives', 'INTEGER NOT NULL DEFAULT 0'],
    ['en_charge', 'TEXT'], ['en_charge_at', 'TEXT'], ['raison_perte', 'TEXT']]) await addColumn('leads', col, def);
  // Réponse automatique aux leads (texto / courriel) et liste des désabonnés
  for (const [col, def] of [['reponse_statut', 'TEXT'], ['reponse_canal', 'TEXT'], ['reponse_texte', 'TEXT'], ['reponse_at', 'TEXT'],
    ['reponse_tentatives', 'INTEGER NOT NULL DEFAULT 0'], ['reponse_erreur', 'TEXT']]) await addColumn('leads', col, def);
  await db.run('CREATE TABLE IF NOT EXISTS desabonnements (contact TEXT PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  // Agent Messenger : conversations (une par personne) et messages (dédoublonnés par identifiant Meta)
  await db.run(`CREATE TABLE IF NOT EXISTS messenger_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, psid TEXT NOT NULL UNIQUE, lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    prenom TEXT DEFAULT '', nom TEXT DEFAULT '', adresse TEXT DEFAULT '', heure TEXT DEFAULT '',
    etat TEXT NOT NULL DEFAULT 'auto', attendu TEXT DEFAULT '', escalade_raison TEXT, nb_echanges INTEGER NOT NULL DEFAULT 0,
    premiere_reponse_ms INTEGER, last_in_at TEXT, last_out_at TEXT, alerte_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  await db.run(`CREATE TABLE IF NOT EXISTS messenger_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL REFERENCES messenger_conversations(id) ON DELETE CASCADE,
    sens TEXT NOT NULL, texte TEXT DEFAULT '', mid TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_messenger_messages_conv ON messenger_messages(conversation_id)');
  await db.run(`CREATE TABLE IF NOT EXISTS lead_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    contenu TEXT NOT NULL,
    auteur TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes(lead_id)');

  // Tâches / relances automatiques
  for (const [col, def] of [['type', "TEXT DEFAULT 'manuel'"], ['source_key', 'TEXT'], ['lead_id', 'INTEGER'], ['quote_id', 'INTEGER'],
    ['auto', 'INTEGER DEFAULT 0'], ['due_time', 'TEXT']]) await addColumn('taches', col, def);
  await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_taches_source_key ON taches(source_key) WHERE source_key IS NOT NULL');

  // Soumissions : suivi des ventes non conclues
  for (const [col, def] of [['date_envoi', 'TEXT'], ['raison_perte', 'TEXT'], ['prochain_suivi', 'TEXT']]) await addColumn('quotes', col, def);

  // Chantiers (suivi des travaux), photos et rentabilité
  // (rappel_envoye_at ajouté plus bas, après la création de la table)
  await db.run(`CREATE TABLE IF NOT EXISTS chantiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    opportunite_id INTEGER REFERENCES opportunites(id) ON DELETE SET NULL,
    quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
    titre TEXT NOT NULL,
    statut TEXT NOT NULL DEFAULT 'contrat_signe',
    date_debut TEXT,
    date_fin TEXT,
    notes_inspection TEXT,
    materiaux TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_chantiers_opp ON chantiers(opportunite_id) WHERE opportunite_id IS NOT NULL');
  await addColumn('chantiers', 'rappel_envoye_at', 'TEXT');
  await db.run(`CREATE TABLE IF NOT EXISTS chantier_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chantier_id INTEGER NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'autre',
    chemin TEXT NOT NULL,
    legende TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  // Inventaire (produits en stock, seuils, mouvements)
  await db.run(`CREATE TABLE IF NOT EXISTS inventaire (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    unite TEXT,
    quantite REAL NOT NULL DEFAULT 0,
    seuil_min REAL,
    seuil_max REAL,
    seuil_critique REAL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS inventaire_mouvements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES inventaire(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    quantite REAL NOT NULL,
    solde REAL,
    chantier_id INTEGER REFERENCES chantiers(id) ON DELETE SET NULL,
    note TEXT,
    par TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_invmv_item ON inventaire_mouvements(item_id)');
  await db.run(`CREATE TABLE IF NOT EXISTS rentabilite (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunite_id INTEGER NOT NULL UNIQUE REFERENCES opportunites(id) ON DELETE CASCADE,
    superficie_pi2 REAL,
    prix_pi2 REAL,
    revenu REAL,
    cout_produits REAL DEFAULT 0,
    main_oeuvre REAL DEFAULT 0,
    deplacement REAL DEFAULT 0,
    autres REAL DEFAULT 0,
    notes TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  // Publicités Meta : dépenses par campagne et par jour (si l'accès aux données publicitaires est autorisé)
  await db.run(`CREATE TABLE IF NOT EXISTS ad_spend (
    date TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    campaign_name TEXT,
    spend REAL DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    leads INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (date, campaign_id)
  )`);
}

module.exports = { migrate, addColumn };
