'use strict';
// node --test tests/   — démarre un vrai serveur sur une base temporaire (aucune donnée de production).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('../server/node_modules/sqlite3');
const { startServer, TEST_PASSWORD } = require('./helpers');

let srv, token;
const dbAll = (file, sql) => new Promise((resolve, reject) => {
  const d = new sqlite3.Database(file, sqlite3.OPEN_READONLY, e => e ? reject(e) : d.all(sql, (err, rows) => { d.close(); err ? reject(err) : resolve(rows); }));
});
before(async () => { srv = await startServer(); token = await srv.login(); });
after(async () => { await srv.stop(); });

test('le serveur refuse de démarrer sans mot de passe défini', async () => {
  await assert.rejects(() => startServer({ CRM_PASSWORD: '' }), /CRM_PASSWORD/);
});

test('routes protégées : sans jeton, ancien jeton Base64 et faux jeton refusés', async () => {
  assert.equal((await srv.call('GET', '/api/clients')).status, 401);
  const legacy = Buffer.from(TEST_PASSWORD).toString('base64');
  assert.equal((await srv.call('GET', '/api/clients', { token: legacy })).status, 401);
  assert.equal((await srv.call('GET', '/api/clients', { token: 'x'.repeat(43) })).status, 401);
  assert.equal((await srv.call('GET', '/api/leads/count')).status, 401);
});

test('connexion : bonne session, déconnexion, limitation des tentatives', async () => {
  const bad = await srv.call('POST', '/api/auth/login', { body: { password: 'faux', user: 'Mathys Caron' }, ip: '10.9.9.9' });
  assert.equal(bad.status, 401);
  for (let i = 0; i < 4; i++) await srv.call('POST', '/api/auth/login', { body: { password: 'faux', user: 'Mathys Caron' }, ip: '10.9.9.9' });
  const locked = await srv.call('POST', '/api/auth/login', { body: { password: TEST_PASSWORD, user: 'Mathys Caron' }, ip: '10.9.9.9' });
  assert.equal(locked.status, 429, 'même le bon mot de passe est refusé pendant le blocage');
  assert.ok(Number(locked.headers.get('retry-after')) > 0);
  const t = await srv.login('10.8.8.8');
  assert.ok(t && t.length >= 40);
  assert.equal((await srv.call('GET', '/api/clients', { token: t })).status, 200);
  await srv.call('POST', '/api/auth/logout', { token: t });
  assert.equal((await srv.call('GET', '/api/clients', { token: t })).status, 401);
});

test('en-têtes de sécurité et pas de CORS ouvert', async () => {
  const r = await srv.call('GET', '/api/clients', { token, headers: { origin: 'https://evil.example' } });
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  assert.equal(r.headers.get('x-powered-by'), null);
  // Les tuiles de la carte (OpenStreetMap) exigent l'origine du site : pas de « same-origin » strict
  assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
});

test('callback Google : état OAuth invalide refusé', async () => {
  const r = await srv.call('GET', '/api/google/callback?code=abc&state=invalide');
  assert.equal(r.status, 400);
});

test('journal d’audit : création, modification, suppression puis restauration complète', async () => {
  const created = await srv.call('POST', '/api/clients', { token, body: { nom: 'Testeur', prenom: 'Alice', telephone: '514-555-0101' } });
  assert.equal(created.status, 200);
  const id = created.data.id;
  await srv.call('POST', '/api/opportunites', { token, body: { client_id: id, titre: 'Nano', etape: 'lead', valeur: 1000 } });
  await srv.call('PUT', `/api/clients/${id}`, { token, body: { nom: 'Testeur', prenom: 'Alice', ville: 'Laval' } });
  await srv.call('DELETE', `/api/clients/${id}`, { token });
  assert.equal((await srv.call('GET', `/api/clients/${id}`, { token })).status, 404);
  await new Promise(r => setTimeout(r, 300));
  const log = (await srv.call('GET', `/api/audit?entity=clients&entity_id=${id}`, { token })).data;
  const actions = log.map(l => l.action);
  for (const a of ['création', 'modification', 'suppression']) assert.ok(actions.includes(a), `action ${a} journalisée`);
  const del = log.find(l => l.action === 'suppression');
  assert.equal(del.restorable, true);
  const restored = await srv.call('POST', `/api/audit/${del.id}/restore`, { token });
  assert.equal(restored.status, 200);
  const back = await srv.call('GET', `/api/clients/${id}`, { token });
  assert.equal(back.status, 200);
  assert.equal(back.data.opportunites.length, 1, 'les opportunités du client sont restaurées avec lui');
});

test('webhook : clé requise, doublons évités, jetons chiffrés au repos', async () => {
  assert.equal((await srv.call('POST', '/api/webhooks/leads', { body: { id: 'a1', full_name: 'Marie Test' } })).status, 403);
  const { key } = (await srv.call('GET', '/api/integrations/webhook', { token })).data;
  assert.ok(key && key.length >= 32);
  const payload = { id: 'fb-777', full_name: 'Marie Dubois', phone_number: '514 444 6666', email: 'marie@example.test', city: 'Laval', campaign_name: 'Automne', ad_name: 'Annonce A' };
  const first = await srv.call('POST', '/api/webhooks/leads', { body: payload, headers: { 'x-webhook-key': key } });
  assert.equal(first.status, 201);
  const again = await srv.call('POST', `/api/webhooks/leads?key=${key}`, { body: payload });
  assert.equal(again.status, 200); assert.equal(again.data.duplicate, true);
  const sameContact = await srv.call('POST', '/api/webhooks/leads', { body: { id: 'fb-778', full_name: 'Marie D.', phone_number: '(514) 444-6666' }, headers: { 'x-webhook-key': key } });
  assert.equal(sameContact.data.duplicate, true, 'même téléphone dans les 24 h = même lead');
  const leads = (await srv.call('GET', '/api/leads', { token })).data;
  assert.equal(leads.filter(l => l.external_id === 'fb-777').length, 1);
  assert.equal(leads[0].campagne, 'Automne');
  const settings = await dbAll(srv.dbFile, "SELECT key,value FROM settings WHERE key='leads_webhook_key'");
  assert.match(settings[0].value, /^enc:v1:/);
  assert.ok(!srv.log().includes(key), 'la clé du webhook n’apparaît pas dans les journaux');
});

test('notification : échec d’envoi mémorisé (Google non connecté) puis visible dans la santé', async () => {
  const leads = (await srv.call('GET', '/api/leads', { token })).data;
  assert.equal(leads[0].notifie, 0);
  assert.match(leads[0].notif_erreur || '', /Google/);
  const health = (await srv.call('GET', '/api/health', { token })).data;
  assert.ok(health.problems.some(p => p.id === 'mail-error'));
  assert.equal((await srv.call('POST', '/api/integrations/test-email', { token, body: { to: 'pas-un-courriel' } })).status, 400);
});

test('suivi des leads : pas de réponse, rappel programmé, verrou de prise en charge', async () => {
  const { key } = (await srv.call('GET', '/api/integrations/webhook', { token })).data;
  const created = await srv.call('POST', '/api/webhooks/leads', { body: { id: 'fb-900', full_name: 'Paul Test', phone_number: '4385550000' }, headers: { 'x-webhook-key': key } });
  const id = created.data.id;
  const noAnswer = (await srv.call('POST', `/api/leads/${id}/contact`, { token, body: { resultat: 'sans_reponse', note: 'Boîte vocale' } })).data;
  assert.equal(noAnswer.statut, 'a_rappeler'); assert.equal(noAnswer.tentatives, 1); assert.ok(noAnswer.rappel_at);
  const detail = (await srv.call('GET', `/api/leads/${id}`, { token })).data;
  assert.equal(detail.notes.length, 1); assert.match(detail.notes[0].contenu, /Pas de réponse/);
  assert.equal((await srv.call('POST', `/api/leads/${id}/prendre`, { token })).status, 200);
  const ramyToken = await srv.login('10.5.5.5', 'Ramy Farah');
  const other = await srv.call('POST', `/api/leads/${id}/prendre`, { token: ramyToken });
  assert.equal(other.status, 409); assert.match(other.data.message, /Mathys/);
  assert.equal((await srv.call('POST', `/api/leads/${id}/prendre`, { token })).status, 200, 'la même personne peut reprendre');
  const converted = await srv.call('POST', `/api/leads/${id}/convertir`, { token });
  assert.ok(converted.data.client_id);
  const twice = await srv.call('POST', `/api/leads/${id}/convertir`, { token });
  assert.equal(twice.data.already, true);
  assert.equal((await srv.call('GET', '/api/leads/count', { token })).data.count >= 1, true);
});

test('sauvegarde : création, contenu vérifié, restauration sans perdre la session', async () => {
  const c = await srv.call('POST', '/api/clients', { token, body: { nom: 'Avant', prenom: 'Sauvegarde' } });
  const meta = (await srv.call('POST', '/api/backups', { token })).data;
  assert.ok(meta.name.startsWith('manuel-')); assert.ok(meta.counts.clients >= 1);
  await srv.call('DELETE', `/api/clients/${c.data.id}`, { token });
  assert.equal((await srv.call('GET', `/api/clients/${c.data.id}`, { token })).status, 404);
  assert.equal((await srv.call('POST', `/api/backups/${meta.name}/restore`, { token, body: {} })).status, 400, 'confirmation obligatoire');
  const restored = await srv.call('POST', `/api/backups/${meta.name}/restore`, { token, body: { confirm: meta.name } });
  assert.equal(restored.status, 200, JSON.stringify(restored.data));
  assert.equal((await srv.call('GET', `/api/clients/${c.data.id}`, { token })).status, 200, 'client revenu et session toujours valide');
  const list = (await srv.call('GET', '/api/backups', { token })).data.backups;
  assert.ok(list.some(b => b.kind === 'avant-restauration'), 'l’état précédent est conservé');
  assert.equal((await srv.call('GET', '/api/backups/..%2F..%2Fcrm.db/download', { token })).status, 400, 'pas de traversée de dossier');
});

test('Drive : sans autorisation Google, l’aperçu répond proprement et l’activation auto est refusée', async () => {
  const dry = (await srv.call('POST', '/api/drive/sync', { token, body: { dry: true } })).data; // refusé tout de suite : Google non autorisé
  assert.equal(dry.ok, false); assert.match(dry.message, /Drive/);
  const auto = await srv.call('POST', '/api/drive/auto', { token, body: { enabled: true } });
  assert.equal(auto.status, 403);
});

test('deux utilisateurs : le nom de la personne s’inscrit sur le client et dans le journal', async () => {
  const ramy = await srv.login('10.2.2.2', 'Ramy Farah');
  const mathys = await srv.login('10.3.3.3', 'Mathys Caron');
  assert.equal((await srv.call('POST', '/api/auth/login', { body: { password: TEST_PASSWORD, user: 'Inconnu' }, ip: '10.4.4.4' })).status, 400);
  assert.equal((await srv.call('POST', '/api/auth/verify', { token: ramy, body: { token: ramy } })).data.user, 'Ramy Farah');
  const c = await srv.call('POST', '/api/clients', { token: ramy, body: { nom: 'Suivi', prenom: 'Client' } });
  await new Promise(r => setTimeout(r, 300));
  let fiche = (await srv.call('GET', `/api/clients/${c.data.id}`, { token: mathys })).data;
  assert.equal(fiche.responsable, 'Ramy Farah'); assert.equal(fiche.modifie_par, 'Ramy Farah');
  await srv.call('POST', '/api/notes', { token: mathys, body: { client_id: c.data.id, contenu: 'Appelé' } });
  await new Promise(r => setTimeout(r, 300));
  fiche = (await srv.call('GET', `/api/clients/${c.data.id}`, { token: mathys })).data;
  assert.equal(fiche.modifie_par, 'Mathys Caron'); assert.equal(fiche.responsable, 'Ramy Farah', 'le responsable ne change pas tout seul');
  assert.equal((await srv.call('PUT', `/api/clients/${c.data.id}/responsable`, { token: mathys, body: { responsable: 'Mathys Caron' } })).status, 200);
  assert.equal((await srv.call('GET', `/api/clients/${c.data.id}`, { token: mathys })).data.responsable, 'Mathys Caron');
  const log = (await srv.call('GET', `/api/audit?entity=clients&entity_id=${c.data.id}`, { token: mathys })).data;
  assert.ok(log.some(l => l.actor === 'Ramy Farah' && l.action === 'création'));
});
