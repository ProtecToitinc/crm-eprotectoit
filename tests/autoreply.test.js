'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

test('réponse automatique : désactivée par défaut, file d’attente, désabonnement', async () => {
  const srv = await startServer();
  try {
    const token = await srv.login();
    const { key } = (await srv.call('GET', '/api/integrations/webhook', { token })).data;
    const post = (id, extra) => srv.call('POST', '/api/webhooks/leads', { body: { id, full_name: 'Marie Dubois', email: `${id}@example.test`, ...extra }, headers: { 'x-webhook-key': key } });
    await post('r1');
    let leads = (await srv.call('GET', '/api/leads', { token })).data;
    assert.ok(!leads[0].reponse_statut, 'rien n’est envoyé tant que la fonction est désactivée');

    assert.equal((await srv.call('POST', '/api/reponse-auto', { token, body: { actif: true } })).data.actif, true);
    const apercu = (await srv.call('POST', '/api/reponse-auto/apercu', { token, body: { prenom: 'Marie' } })).data;
    assert.match(apercu.body, /Marie/);

    await post('r2');
    await new Promise(r => setTimeout(r, 500));
    leads = (await srv.call('GET', '/api/leads', { token })).data;
    const l = leads.find(x => x.external_id === 'r2');
    assert.equal(l.reponse_statut, 'en_attente', 'Google non connecté : l’envoi échoue et reste en file pour reprise');
    assert.ok(l.reponse_erreur);

    // désabonnement : lien signé requis
    assert.equal((await srv.call('GET', `/api/desabonnement?l=${l.id}&t=${'0'.repeat(32)}`)).status, 400);
  } finally { await srv.stop(); }
});
