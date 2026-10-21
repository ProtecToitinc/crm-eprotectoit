'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startServer } = require('./helpers');
const { scripted, validSignature, parseAI, isFormMessage, parseForm, STOP_RE } = require('../server/messenger');

const FORM = 'Hello! I filled out your form and would like to know more about your business. Quel est l’état actuel de votre toiture ?: Perte de granules / bardeaux qui commencent à relever Dans combien de temps aimeriez-vous faire les travaux ?: Je veux seulement obtenir de l’information pour l’instant Full name: Gaston Morin Quel âge a votre toiture ?: 10 à 15 ans Phone number: (514) 250-4276 Email: gasmo2012@example.com';

test('messenger : seul le message du questionnaire déclenche l’agent, et ses réponses sont lues', () => {
  assert.equal(isFormMessage(FORM), true);
  assert.equal(isFormMessage('Bonjour, êtes-vous ouverts samedi?'), false);
  assert.equal(isFormMessage('Nom complet: Julie Roy Téléphone: 450 555-1234'), true);
  const f = parseForm(FORM);
  assert.equal(f.prenom, 'Gaston');
  assert.equal(f.nom, 'Morin');
  assert.equal(f.email, 'gasmo2012@example.com');
  assert.match(f.telephone, /514\) 250-4276/);
});

test('messenger : script de secours (prénom, adresse, moment, superviseur)', () => {
  let conv = { prenom: 'Julie', adresse: '', heure: '', nb_echanges: 0, attendu: '' };
  let out = scripted(conv, 'Bonjour, je veux une soumission');
  assert.match(out.reponse, /Bonjour Julie/);
  assert.equal(out.attendu, 'adresse');
  conv = { ...conv, nb_echanges: 1, attendu: 'adresse' };
  out = scripted(conv, '12 rue des Érables, Laval');
  assert.equal(out.adresse, '12 rue des Érables, Laval');
  assert.equal(out.attendu, 'heure');
  conv = { ...conv, adresse: out.adresse, attendu: 'heure', nb_echanges: 2 };
  out = scripted(conv, 'en soirée après 18 h');
  assert.equal(out.termine, true);
  out = scripted({ ...conv, nb_echanges: 2 }, 'Combien ça coûte?');
  assert.equal(out.escalade, true);
  assert.match(out.reponse, /superviseur/);
  assert.ok(STOP_RE.test('STOP') && !STOP_RE.test('stop de niaiser, je veux un prix'));
  assert.equal(parseAI('voici {"reponse":"Bonjour","escalade":true}').escalade, true);
  assert.equal(parseAI('pas de json'), null);
});

test('messenger : webhook signé seulement, conversation et lead créés', async () => {
  const secret = 'secret-app-test';
  const srv = await startServer({ META_APP_SECRET: secret, ANTHROPIC_API_KEY: '' });
  try {
    const token = await srv.login();
    const cfg = (await srv.call('GET', '/api/messenger', { token })).data;
    assert.equal(cfg.actif, false);
    assert.equal(cfg.secret_app, true);

    // Vérification Meta : bon jeton -> challenge, mauvais -> 403
    const ok = await fetch(`${srv.base}/api/webhooks/messenger?hub.mode=subscribe&hub.verify_token=${cfg.verify_token}&hub.challenge=42`);
    assert.equal(await ok.text(), '42');
    assert.equal((await fetch(`${srv.base}/api/webhooks/messenger?hub.mode=subscribe&hub.verify_token=faux&hub.challenge=42`)).status, 403);

    const msg = (psid, mid, t) => JSON.stringify({ object: 'page', entry: [{ messaging: [{ sender: { id: psid }, recipient: { id: 'page' }, timestamp: 1, message: { mid, text: t } }] }] });
    const payload = msg('psid-1', 'm-1', FORM);
    const sign = body => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    assert.ok(validSignature(Buffer.from(payload), sign(payload), secret));
    const send = (body, sig) => fetch(`${srv.base}/api/webhooks/messenger`, { method: 'POST', headers: { 'content-type': 'application/json', ...(sig ? { 'x-hub-signature-256': sig } : {}) }, body });
    const post = (sig) => send(payload, sig);
    const other = msg('psid-2', 'm-2', 'Bonjour, êtes-vous ouverts samedi?');

    assert.equal((await post()).status, 403, 'sans signature');
    assert.equal((await post('sha256=' + '0'.repeat(64))).status, 403, 'fausse signature');

    // Désactivé : accepté mais ignoré
    assert.equal((await post(sign(payload))).status, 200);
    await new Promise(r => setTimeout(r, 300));
    assert.equal((await srv.call('GET', '/api/messenger', { token })).data.conversations.length, 0);

    await srv.call('POST', '/api/messenger', { token, body: { actif: true } });
    assert.equal((await send(other, sign(other))).status, 200); // message ordinaire : ignoré par l'agent
    assert.equal((await post(sign(payload))).status, 200);
    await post(sign(payload)); // doublon Meta : ignoré
    await new Promise(r => setTimeout(r, 4500)); // pas de jeton de page : 2 essais d'envoi puis abandon
    const after = (await srv.call('GET', '/api/messenger', { token })).data;
    assert.equal(after.conversations.length, 1, 'seul le questionnaire ouvre une conversation');
    const conv = after.conversations[0];
    assert.ok(conv.lead_id, 'un lead est créé pour la conversation');
    assert.equal(conv.prenom, 'Gaston');
    const lead = (await srv.call('GET', '/api/leads', { token })).data.find(l => l.id === conv.lead_id);
    assert.equal(lead.email, 'gasmo2012@example.com');
    const msgs = (await srv.call('GET', `/api/messenger/conversations/${conv.id}/messages`, { token })).data;
    assert.equal(msgs.filter(m => m.sens === 'in').length, 1, 'le doublon n’est pas enregistré deux fois');

    const apercu = (await srv.call('POST', '/api/messenger/apercu', { token, body: { prenom: 'Julie' } })).data;
    assert.match(apercu.reponse, /Julie/);
    assert.equal((await srv.call('POST', `/api/messenger/conversations/${conv.id}/etat`, { token, body: { etat: 'nimporte' } })).status, 400);
  } finally { await srv.stop(); }
});
