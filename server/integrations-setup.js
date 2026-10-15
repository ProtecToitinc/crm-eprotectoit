'use strict';
/**
 * Dans server.js, APRÈS avoir déclaré `auth` et AVANT app.use('/api', 404) :
 *   const integrations = require('./integrations-setup');
 *   integrations.register(app, { auth });
 * Après app.listen(...) :
 *   integrations.startJobs();
 */
const db = require('./database');
const google = require('./google');
const leads = require('./leads');
const drive = require('./drive');
const { getSetting } = require('./lib');
let started = false;

/** État de santé affiché dans le CRM : chaque problème est une phrase claire et une action à faire. */
async function health() {
  const problems = [];
  const add = (id, level, message) => problems.push({ id, level, message });
  const g = await google.status();
  const minutesAgo = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? Math.round((Date.now() - t) / 60000) : null; };
  if (g.authError) add('google-auth', 'erreur', 'Google a refusé la connexion (autorisation expirée ou retirée) : reconnecte Google depuis Intégrations.');
  else if (!g.connected) add('google', 'avertissement', 'Google n’est pas connecté : Drive, Gmail et Agenda sont inactifs.');
  else {
    if (!g.drive) add('drive-scope', 'avertissement', 'Autorisation Google Drive manquante : reconnecte Google pour synchroniser le Drive.');
    if (!g.gmail) add('gmail-scope', 'avertissement', 'Autorisation Gmail manquante : les notifications par courriel ne partiront pas.');
  }
  const driveErr = await getSetting('drive_last_error');
  const driveAuto = (await getSetting('drive_sync_enabled')) === '1';
  const pending = (await db.get("SELECT COUNT(*) n FROM drive_items WHERE status IN ('validation','erreur')")).n;
  if (driveErr) add('drive-error', 'erreur', `Synchronisation Drive en échec : ${driveErr}`);
  if (pending) add('drive-review', 'avertissement', `${pending} élément(s) Drive à valider avant d’activer la synchronisation automatique.`);
  const metaToken = await getSetting('meta_page_token'), metaPage = await getSetting('meta_page_id');
  const metaLastOk = await getSetting('meta_last_ok'), metaErr = await getSetting('meta_last_error');
  if (metaToken && metaPage) {
    if (metaErr) add('meta-error', 'erreur', `Meta ne répond plus : ${metaErr}`);
    else if ((minutesAgo(metaLastOk) ?? 999) > 20) add('meta-stale', 'avertissement', 'Aucune vérification Meta réussie depuis plus de 20 minutes.');
  }
  const notifyErr = await getSetting('notify_last_error');
  const waiting = (await db.get("SELECT COUNT(*) n FROM leads WHERE notifie=0 AND datetime(created_at)>datetime('now','-14 days')")).n;
  if (notifyErr) add('mail-error', 'erreur', `Courriel de notification non envoyé : ${notifyErr}${waiting ? ` (${waiting} lead(s) en attente)` : ''}`);
  const backupErr = await getSetting('backup_last_error');
  if (backupErr) add('backup-error', 'erreur', `Sauvegarde automatique en échec : ${backupErr}`);
  return {
    problems, ok: !problems.some(p => p.level === 'erreur'),
    google: { connected: g.connected, drive: g.drive, gmail: g.gmail, calendar: g.calendar },
    drive: { lastSync: await getSetting('drive_last_sync'), autoEnabled: driveAuto, pending },
    meta: { configured: !!(metaToken && metaPage), lastOk: metaLastOk, lastError: metaErr },
    notifications: { lastOk: await getSetting('notify_last_ok'), lastError: notifyErr, waiting },
    backups: { lastOk: await getSetting('backup_last_ok'), lastError: backupErr }
  };
}

function register(app, { auth }) {
  if (typeof auth !== 'function') throw new Error('Middleware auth requis');
  leads.register(app, { auth });
  drive.register(app, { auth });
  app.get('/api/health', auth, async (req, res) => res.json(await health()));
}
function startJobs() {
  if (started || process.env.DISABLE_JOBS === '1') return;
  started = true;
  // Drive : jamais de première synchronisation réelle automatique — activée à la main (/api/drive/auto) après validation.
  const driveJob = async () => {
    try { if ((await getSetting('drive_sync_enabled')) === '1') await drive.sync({ dry: false }); }
    catch (e) { console.error('[drive] tâche en erreur :', e.message); }
  };
  const metaJob = async () => { try { await leads.pollMeta(); } catch (e) { console.error('[meta] tâche en erreur :', e.message); } };
  const emailJob = async () => { try { await leads.retryNotifications(); } catch (e) { console.error('[mail] tâche en erreur :', e.message); } };
  const every = (fn, interval, first) => { const t = setInterval(fn, interval); t.unref?.(); if (first) setTimeout(fn, first).unref?.(); };
  // Importation Drive désactivée : les soumissions sont ajoutées manuellement par client.
  // Ne pas relancer driveJob, même si l'ancien réglage était activé.
  // Meta : un passage 30 s après le démarrage rattrape les leads arrivés pendant une interruption.
  every(metaJob, 3 * 60 * 1000, 30 * 1000);
  every(emailJob, 10 * 60 * 1000, 60 * 1000);
}
module.exports = { register, startJobs, health };
