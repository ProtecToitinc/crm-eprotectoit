'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

let srv, token;
before(async () => { srv = await startServer(); token = await srv.login(); });
after(async () => { await srv.stop(); });
const api = (m, u, body) => srv.call(m, u, { token, body });

test('nouveau lead : tâche de rappel automatique, fermée dès que le lead est contacté', async () => {
  const { key } = (await api('GET', '/api/integrations/webhook')).data;
  const lead = await srv.call('POST', '/api/webhooks/leads', { body: { id: 'L1', full_name: 'Sophie Nouveau', phone_number: '5145550001' }, headers: { 'x-webhook-key': key } });
  assert.equal((await api('POST', '/api/relances/run')).status, 200);
  let a = (await api('GET', '/api/attention')).data;
  assert.equal(a.leads_nouveaux.length, 1);
  assert.ok(a.taches.some(t => /Sophie/.test(t.titre) && t.priorite === 'haute'));
  await api('POST', `/api/relances/run`); // idempotent
  const tasks = (await api('GET', '/api/taches')).data.filter(t => /Sophie/.test(t.titre));
  assert.equal(tasks.length, 1, 'pas de tâche en double');
  await api('POST', `/api/leads/${lead.data.id}/contact`, { resultat: 'joint' });
  await api('POST', '/api/relances/run');
  a = (await api('GET', '/api/attention')).data;
  assert.equal(a.leads_nouveaux.length, 0);
  assert.ok(!a.taches.some(t => /Sophie/.test(t.titre)), 'tâche fermée automatiquement');
});

test('soumission envoyée : relances à 2 et 6 jours, fermées quand la soumission est acceptée', async () => {
  const c = await api('POST', '/api/clients', { nom: 'Relance', prenom: 'Marc' });
  const o = await api('POST', '/api/opportunites', { client_id: c.data.id, titre: 'Nano', etape: 'soumission', valeur: 2000 });
  const q = await api('POST', '/api/quotes', { client_id: c.data.id, opportunite_id: o.data.id, montant: 2300, statut: 'envoyee', service: 'Nano' });
  await api('POST', '/api/relances/run');
  assert.ok(!(await api('GET', '/api/taches')).data.some(t => t.quote_id === q.data.id), 'rien le jour même');
  // Simule 7 jours écoulés
  const sqlite3 = require('../server/node_modules/sqlite3');
  await new Promise((res, rej) => { const d = new sqlite3.Database(srv.dbFile, e => e ? rej(e) : d.exec("UPDATE settings SET value=datetime('now','-30 days') WHERE key='relances_depuis'", () => d.run("UPDATE quotes SET created_at=datetime('now','-7 days') WHERE id=?", [q.data.id], err => { d.close(); err ? rej(err) : res(); }))); });
  await api('POST', '/api/relances/run');
  const keys = (await api('GET', '/api/taches')).data.filter(t => t.quote_id === q.data.id);
  assert.equal(keys.length, 2, 'relance 1 (2 j) + relance 2 (6 j)');
  const suivi = (await api('GET', '/api/suivi-soumissions')).data;
  const row = suivi.en_attente.find(x => x.id === q.data.id);
  assert.equal(row.jours, 7); assert.equal(row.relances, 2);
  await api('PUT', `/api/quotes/${q.data.id}`, { statut: 'acceptee' });
  await api('POST', '/api/relances/run');
  assert.equal((await api('GET', '/api/taches')).data.filter(t => t.quote_id === q.data.id && !t.completed).length, 0);
  assert.ok((await api('GET', '/api/suivi-soumissions')).data.taux_conversion > 0);
});

test('soumission perdue : raison enregistrée et comptée', async () => {
  const c = await api('POST', '/api/clients', { nom: 'Perdu', prenom: 'Luc' });
  const q = await api('POST', '/api/quotes', { client_id: c.data.id, montant: 1500, statut: 'envoyee' });
  assert.equal((await api('POST', `/api/quotes/${q.data.id}/perdue`, { raison: 'Trop cher' })).status, 200);
  const s = (await api('GET', '/api/suivi-soumissions')).data;
  assert.ok(s.raisons.some(r => r.raison === 'Trop cher' && r.n === 1));
  assert.ok(s.valeur_perdue >= 1500);
});

test('contrat signé : chantier créé, étapes, photo avant/après, passage à terminé', async () => {
  const c = await api('POST', '/api/clients', { nom: 'Chantier', prenom: 'Anne' });
  const o = await api('POST', '/api/opportunites', { client_id: c.data.id, titre: 'Protection', etape: 'contrat', valeur: 3000 });
  await api('POST', '/api/relances/run');
  const list = (await api('GET', '/api/chantiers')).data;
  const ch = list.find(x => x.opportunite_id === o.data.id);
  assert.ok(ch); assert.equal(ch.statut, 'contrat_signe');
  assert.ok((await api('GET', '/api/taches')).data.some(t => /Planifier les travaux/.test(t.titre)));
  await api('POST', '/api/relances/run');
  assert.equal((await api('GET', '/api/chantiers')).data.filter(x => x.opportunite_id === o.data.id).length, 1, 'un seul chantier par opportunité');
  assert.equal((await api('PUT', `/api/chantiers/${ch.id}`, { statut: 'invalide' })).status, 400);
  await api('PUT', `/api/chantiers/${ch.id}`, { statut: 'planifie', date_debut: '2026-11-02', notes_inspection: 'Toit en bardeau, 2 versants', materiaux: 'Noxnano 20 L' });
  const form = new FormData();
  form.append('type', 'avant'); form.append('legende', 'Façade');
  form.append('file', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'avant.png');
  const up = await fetch(`${srv.base}/api/chantiers/${ch.id}/photos`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
  assert.equal(up.status, 201);
  const bad = new FormData(); bad.append('file', new Blob(['texte'], { type: 'text/plain' }), 'x.txt');
  assert.equal((await fetch(`${srv.base}/api/chantiers/${ch.id}/photos`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: bad })).status, 400);
  const detail = (await api('GET', `/api/chantiers/${ch.id}`)).data;
  assert.equal(detail.photos.length, 1); assert.equal(detail.photos[0].type, 'avant');
  assert.equal((await fetch(`${srv.base}/uploads/${detail.photos[0].chemin}`)).status, 401);
  const img = await fetch(`${srv.base}/api/uploads/${detail.photos[0].chemin}`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(img.status, 200);
  await api('PUT', `/api/chantiers/${ch.id}`, { statut: 'termine' });
  const opps = (await api('GET', '/api/opportunites')).data;
  assert.equal(opps.find(x => x.id === o.data.id).etape, 'complete');
  await api('POST', '/api/relances/run');
  assert.equal((await api('GET', '/api/taches')).data.filter(t => /Planifier les travaux/.test(t.titre) && t.client_id === c.data.id && !t.completed).length, 0);
});

test('rentabilité : coût total, profit brut et marge calculés', async () => {
  const c = await api('POST', '/api/clients', { nom: 'Rentable', prenom: 'Jean' });
  const o = await api('POST', '/api/opportunites', { client_id: c.data.id, titre: 'Nano', etape: 'contrat', valeur: 0 });
  const put = await api('PUT', `/api/rentabilite/${o.data.id}`, { superficie_pi2: 2000, prix_pi2: 1.5, cout_produits: 900, main_oeuvre: 600, deplacement: 100, autres: 50 });
  assert.equal(put.data.revenu, 3000); assert.equal(put.data.cout_total, 1650); assert.equal(put.data.profit_brut, 1350); assert.equal(put.data.marge_pct, 45);
  assert.equal((await api('PUT', `/api/rentabilite/${o.data.id}`, { cout_produits: -5 })).status, 400);
  const all = (await api('GET', '/api/rentabilite')).data;
  assert.equal(all.totaux.nb, 1); assert.equal(all.totaux.marge_pct, 45);
});

test('Meta Ads : leads par campagne reliés aux clients, soumissions et contrats', async () => {
  const { key } = (await api('GET', '/api/integrations/webhook')).data;
  const hook = body => srv.call('POST', '/api/webhooks/leads', { body, headers: { 'x-webhook-key': key } });
  const l = await hook({ id: 'AD1', full_name: 'Client Publicité', phone_number: '4505550100', campaign_name: 'Automne 2026', campaign_id: 'C100' });
  await hook({ id: 'AD2', full_name: 'Autre Personne', phone_number: '4505550200', campaign_name: 'Automne 2026', campaign_id: 'C100' });
  const conv = (await api('POST', `/api/leads/${l.data.id}/convertir`)).data;
  const o = await api('POST', '/api/opportunites', { client_id: conv.client_id, titre: 'Vente', etape: 'contrat', valeur: 3000 });
  await api('POST', '/api/quotes', { client_id: conv.client_id, opportunite_id: o.data.id, montant: 3449, statut: 'acceptee' });
  const d = (await api('GET', '/api/ads/dashboard')).data;
  const camp = d.campagnes.find(x => x.campaign_id === 'C100');
  assert.equal(camp.leads, 2); assert.equal(camp.clients, 1); assert.equal(camp.soumissions, 1); assert.equal(camp.contrats, 1); assert.equal(camp.ca, 3000);
  assert.equal(camp.depense, null, 'pas de coût inventé sans données publicitaires');
  assert.equal(d.donnees_publicitaires, false);
  assert.equal((await api('POST', '/api/ads/sync')).data.ok, false);
});

test('chantiers : ajout manuel, suppression définitive qui ne se recrée pas, « tout effacer » protégé', async () => {
  const c = await api('POST', '/api/clients', { nom: 'Manuel', prenom: 'Chantier' });
  const o = await api('POST', '/api/opportunites', { client_id: c.data.id, titre: 'Projet X', etape: 'contrat', valeur: 2000 });
  assert.equal((await api('POST', '/api/chantiers', { titre: 'Sans client' })).status, 400);
  const made = await api('POST', '/api/chantiers', { client_id: c.data.id, titre: 'Mon chantier', statut: 'planifie', date_debut: '2026-11-05', notes_inspection: 'Toit plat', materiaux: 'Noxnano', opportunite_id: o.data.id });
  assert.equal(made.status, 201);
  const detail = (await api('GET', `/api/chantiers/${made.data.id}`)).data;
  assert.equal(detail.statut, 'planifie'); assert.equal(detail.date_debut, '2026-11-05'); assert.equal(detail.notes_inspection, 'Toit plat');
  assert.equal((await api('POST', '/api/chantiers', { client_id: c.data.id, opportunite_id: o.data.id })).status, 409, 'un seul chantier par projet');
  await api('DELETE', `/api/chantiers/${made.data.id}`);
  await api('POST', '/api/relances/run');
  assert.equal((await api('GET', '/api/chantiers')).data.filter(x => x.opportunite_id === o.data.id).length, 0, 'un chantier supprimé ne revient pas');
  assert.equal((await api('DELETE', '/api/chantiers', {})).status, 400, 'confirmation obligatoire');
  const wiped = await api('DELETE', '/api/chantiers', { confirm: 'EFFACER' });
  assert.equal(wiped.status, 200);
  assert.equal((await api('GET', '/api/chantiers')).data.length, 0);
  await api('POST', '/api/relances/run');
  assert.equal((await api('GET', '/api/chantiers')).data.length, 0, 'rien n’est recréé après « tout effacer »');
  assert.equal((await api('GET', `/api/clients/${c.data.id}`)).status, 200, 'le client est intact');
});
