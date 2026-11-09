'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer } = require('./helpers');

test('module SEO dans le CRM', async t => {
  const s = await startServer();
  t.after(() => s.stop());
  const token = await s.login();

  await t.test('toutes les routes exigent une connexion', async () => {
    for (const url of ['overview', 'issues', 'keywords', 'suggestions', 'approved', 'articles', 'activity']) {
      assert.equal((await s.call('GET', `/api/seo/${url}`)).status, 401, url);
    }
    assert.equal((await s.call('POST', '/api/seo/run', { body: { type: 'audit' } })).status, 401);
  });

  await t.test('sans connecteur, aucune donnée inventée', async () => {
    const { status, data } = await s.call('GET', '/api/seo/overview', { token });
    assert.equal(status, 200);
    assert.equal(data.run, null); assert.equal(data.gsc, null); assert.equal(data.ga4, null); assert.equal(data.psi, null);
    assert.equal(data.mode, 'recommendation');
    const kw = (await s.call('GET', '/api/seo/keywords', { token })).data;
    assert.ok(kw.length > 15);
    assert.ok(kw.every(k => k.clicks === null && k.position === null));
  });

  await t.test('résumé simple sans audit', async () => {
    const { status, data } = await s.call('GET', '/api/seo/summary', { token });
    assert.equal(status, 200); assert.equal(data.grade, null); assert.equal(data.traffic, null);
    assert.ok(data.setup.every(x => x.ok === false));
    assert.equal((await s.call('GET', '/api/seo/summary')).status, 401);
  });

  await t.test('garde-fous', async () => {
    assert.equal((await s.call('POST', '/api/seo/mode', { token, body: { mode: 'auto' } })).status, 409);
    assert.equal((await s.call('POST', '/api/seo/run', { token, body: { type: 'rm' } })).status, 400);
    assert.equal((await s.call('POST', '/api/seo/run', { token, body: { type: 'suggest' } })).status, 409);
    assert.deepEqual((await s.call('POST', '/api/seo/suggestions/approve-safe', { token })).data, { approved: 0 });
    assert.equal((await s.call('POST', '/api/seo/suggestions/abc/approve', { token })).status, 400);
    assert.equal((await s.call('POST', '/api/seo/suggestions/999/approve', { token })).status, 404);
    assert.equal((await s.call('POST', '/api/seo/mode', { token, body: { mode: 'recommendation' } })).status, 200);
  });

  await t.test('données SEO dans un fichier à part, CRM intact', async () => {
    assert.ok(fs.existsSync(path.join(s.dir, 'seo.db')));
    assert.equal((await s.call('GET', '/api/health', { token })).status, 200);
  });
});
