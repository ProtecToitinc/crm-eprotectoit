'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

let srv, token;
before(async () => { srv = await startServer(); token = await srv.login(); });
after(async () => { await srv.stop(); });
test('les fonctionnalités météo et rappels météo sont retirées', async () => {
  const call = (method, path) => srv.call(method, path, { token });
  for (const path of ['/api/meteo', '/api/meteo/chantiers', '/api/rappels/veille/config']) {
    assert.equal((await call('GET', path)).status, 404, path);
  }
});
test('les chantiers continuent sans dépendre du service météo', async () => {
  const c = await srv.call('POST', '/api/clients', { token, body: { nom: 'Tremblay', prenom: 'Julie' } });
  assert.equal(c.status, 200);
  const ch = await srv.call('POST', '/api/chantiers', { token, body: { client_id: c.data.id, titre: 'Toiture' } });
  assert.equal(ch.status, 201);
  assert.equal((await srv.call('POST', '/api/relances/run', { token })).status, 200);
});
