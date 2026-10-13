'use strict';
/**
 * Sauvegardes : copie cohérente de SQLite (VACUUM INTO) + documents, plusieurs versions conservées,
 * restauration à chaud et téléchargement. Stockées sur le même volume que la base (sous-dossier backups/).
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const db = require('./database');
const { localParts, getSetting, setSetting } = require('./lib');
const { audit } = require('./security');
const remoteBackup = require('./remote-backup');

const dataDir = path.dirname(db.dbPath);
const backupsDir = process.env.BACKUPS_DIR || path.join(dataDir, 'backups');
const NAME_RE = /^(auto|manuel|avant-restauration)-\d{4}-\d{2}-\d{2}_\d{4}$/;
const KEEP = { dailyDays: 14, weeks: 8, months: 12, manual: 10, preRestore: 5, minimum: 3 };
let uploadDirs = [];
let busy = false, restoring = false;
const isRestoring = () => restoring;

const dateOf = name => { const m = /(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})$/.exec(name); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : 0; };
const errText = e => String(e?.message || e).slice(0, 300);

function copyTree(src, dst, stats) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name), to = path.join(dst, entry.name);
    if (entry.isDirectory()) { copyTree(from, to, stats); continue; }
    if (fs.existsSync(to)) continue;
    try { fs.linkSync(from, to); } catch { fs.copyFileSync(from, to); } // lien physique : aucun espace en double pour les fichiers inchangés
    stats.files++;
  }
}
const readOnlyDb = file => new Promise((resolve, reject) => { const d = new sqlite3.Database(file, sqlite3.OPEN_READONLY, err => err ? reject(err) : resolve(d)); });
const q = (d, sql) => new Promise((resolve, reject) => d.all(sql, (err, rows) => err ? reject(err) : resolve(rows)));
async function inspect(file) {
  const d = await readOnlyDb(file);
  try {
    const integrity = (await q(d, 'PRAGMA integrity_check'))[0]?.integrity_check;
    const counts = {};
    for (const t of ['clients', 'opportunites', 'quotes', 'invoices', 'leads', 'chantiers']) counts[t] = (await q(d, `SELECT COUNT(*) n FROM ${t}`).catch(() => [{ n: null }]))[0].n;
    return { integrity, counts };
  } finally { await new Promise(r => d.close(() => r())); }
}

async function create(kind = 'auto') {
  if (busy) throw new Error('Une sauvegarde est déjà en cours');
  busy = true;
  try {
    const { date, time } = localParts();
    const name = `${kind}-${date}_${time.replace(':', '')}`;
    const dir = path.join(backupsDir, name);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); // même minute : on remplace
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'crm.db');
    await db.run(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const { integrity, counts } = await inspect(file);
    if (integrity !== 'ok') { fs.rmSync(dir, { recursive: true, force: true }); throw new Error(`Sauvegarde invalide (${integrity})`); }
    const stats = { files: 0 };
    for (const src of uploadDirs) copyTree(src, path.join(dir, 'uploads'), stats);
    const meta = { name, kind, at: new Date().toISOString(), size: fs.statSync(file).size, counts, uploads: stats.files };
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
    await setSetting('backup_last_ok', meta.at); await setSetting('backup_last_error', '');
    if (remoteBackup.configured()) {
      try {
        const remote = await remoteBackup.mirror(dir, name);
        await setSetting('backup_remote_last_ok', meta.at);
        await setSetting('backup_remote_last_error', '');
        meta.remote = remote;
      } catch (err) {
        await setSetting('backup_remote_last_error', errText(err));
        meta.remote = { ok: false, message: 'Copie distante échouée; sauvegarde locale conservée' };
        console.error('[backup-remote] échec :', errText(err));
      }
    }
    if (kind === 'auto') prune();
    return meta;
  } catch (e) {
    await setSetting('backup_last_error', errText(e)).catch(() => {});
    throw e;
  } finally { busy = false; }
}
function list() {
  if (!fs.existsSync(backupsDir)) return [];
  return fs.readdirSync(backupsDir).filter(n => NAME_RE.test(n) && fs.existsSync(path.join(backupsDir, n, 'crm.db')))
    .map(n => { try { return JSON.parse(fs.readFileSync(path.join(backupsDir, n, 'meta.json'), 'utf8')); } catch { return { name: n, kind: n.split('-')[0], at: new Date(dateOf(n)).toISOString() }; } })
    .sort((a, b) => dateOf(b.name) - dateOf(a.name));
}
function prune() {
  const all = list(), now = Date.now(), remove = [];
  const autos = all.filter(b => b.kind === 'auto');
  const keep = new Set(autos.slice(0, KEEP.minimum).map(b => b.name));
  const weeks = new Set(), months = new Set();
  for (const b of autos) { // du plus récent au plus ancien
    const age = (now - dateOf(b.name)) / 86400000, week = Math.floor(age / 7), month = b.name.slice(5, 12);
    if (age <= KEEP.dailyDays) keep.add(b.name);
    else if (week <= KEEP.weeks + 2 && !weeks.has(week)) { weeks.add(week); keep.add(b.name); }
    else if (age <= KEEP.months * 31 && !months.has(month)) { months.add(month); keep.add(b.name); }
  }
  for (const b of autos) if (!keep.has(b.name)) remove.push(b.name);
  all.filter(b => b.kind === 'manuel').slice(KEEP.manual).forEach(b => remove.push(b.name));
  all.filter(b => b.kind === 'avant-restauration').slice(KEEP.preRestore).forEach(b => remove.push(b.name));
  for (const n of remove) fs.rmSync(path.join(backupsDir, n), { recursive: true, force: true });
  return remove;
}

async function restore(name, actor = 'inconnu') {
  if (!NAME_RE.test(name)) return { ok: false, status: 400, message: 'Nom de sauvegarde invalide' };
  const dir = path.join(backupsDir, name), file = path.join(dir, 'crm.db');
  if (!fs.existsSync(file)) return { ok: false, status: 404, message: 'Sauvegarde introuvable' };
  const check = await inspect(file);
  if (check.integrity !== 'ok') return { ok: false, status: 409, message: 'Cette sauvegarde est endommagée' };
  const safety = await create('avant-restauration'); // filet de sécurité : l'état actuel reste récupérable
  restoring = true;
  try {
    const sessions = await db.all('SELECT * FROM sessions'); // garder la session en cours ouverte
    await db.close();
    for (const ext of ['-wal', '-shm', '-journal']) fs.rmSync(db.dbPath + ext, { force: true });
    fs.copyFileSync(file, db.dbPath);
    db.reopen();
    await db.init();
    for (const s of sessions) await db.run('INSERT OR REPLACE INTO sessions (token_hash,created_ms,last_seen_ms,ip,user_agent,user_name) VALUES (?,?,?,?,?,?)', [s.token_hash, s.created_ms, s.last_seen_ms, s.ip, s.user_agent, s.user_name]);
    const stats = { files: 0 };
    if (uploadDirs[0]) copyTree(path.join(dir, 'uploads'), uploadDirs[0], stats); // ne remplace jamais un fichier existant
    await audit({ actor, action: 'restauration-sauvegarde', details: `Restauré : ${name} (état précédent gardé dans ${safety.name}); ${stats.files} document(s) récupéré(s)` });
    return { ok: true, restored: name, safety: safety.name, counts: check.counts, documents: stats.files };
  } finally { restoring = false; }
}

function register(app, { auth, uploadsDirs }) {
  uploadDirs = uploadsDirs.filter(Boolean);
  app.get('/api/backups', auth, async (req, res) => res.json({
    backups: list(), lastOk: await getSetting('backup_last_ok'), lastError: await getSetting('backup_last_error'),
    remoteConfigured: remoteBackup.configured(), remoteLastOk: await getSetting('backup_remote_last_ok'), remoteLastError: await getSetting('backup_remote_last_error'),
    policy: `Une sauvegarde par jour (3 h), ${KEEP.dailyDays} jours gardés, puis 1 par semaine (${KEEP.weeks} semaines) et 1 par mois (${KEEP.months} mois).`
  }));
  app.post('/api/backups', auth, async (req, res) => {
    const meta = await create('manuel');
    await audit({ actor: req.session?.id, action: 'sauvegarde-manuelle', details: meta.name });
    res.status(201).json(meta);
  });
  app.get('/api/backups/:name/download', auth, async (req, res) => {
    if (!NAME_RE.test(req.params.name)) return res.status(400).json({ message: 'Nom invalide' });
    const file = path.join(backupsDir, req.params.name, 'crm.db');
    if (!fs.existsSync(file)) return res.status(404).json({ message: 'Sauvegarde introuvable' });
    await audit({ actor: req.session?.id, action: 'sauvegarde-téléchargée', details: req.params.name });
    res.download(file, `crm-eprotectoit-${req.params.name}.db`);
  });
  app.post('/api/backups/:name/restore', auth, async (req, res) => {
    if (req.body?.confirm !== req.params.name) return res.status(400).json({ message: 'Confirmation manquante : renvoie le nom de la sauvegarde dans « confirm ».' });
    const r = await restore(req.params.name, req.session?.id);
    res.status(r.status || 200).json(r);
  });
  app.delete('/api/backups/:name', auth, async (req, res) => {
    if (!/^manuel-/.test(req.params.name) || !NAME_RE.test(req.params.name)) return res.status(400).json({ message: 'Seules les sauvegardes manuelles peuvent être supprimées' });
    fs.rmSync(path.join(backupsDir, req.params.name), { recursive: true, force: true });
    res.json({ ok: true });
  });
}

/** Une sauvegarde par jour après 3 h (heure du Québec) ; rattrapage si la dernière a plus de 26 h. */
function startJob() {
  const tick = async () => {
    try {
      const last = list().find(b => b.kind === 'auto');
      const ageH = last ? (Date.now() - Date.parse(last.at)) / 3600000 : Infinity;
      const { date, time } = localParts();
      const doneToday = last && last.name.includes(`auto-${date}_`);
      if (ageH > 26 || (time >= '03:00' && !doneToday)) await create('auto');
    } catch (e) { console.error('[sauvegarde] échec :', errText(e)); }
  };
  setTimeout(tick, 2 * 60 * 1000).unref?.();
  setInterval(tick, 20 * 60 * 1000).unref?.();
}
module.exports = { register, create, list, prune, restore, startJob, isRestoring, backupsDir };
