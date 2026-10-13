'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('private upload API rejects anonymous requests, accepts authorized stored document', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-uploads-test-'));
  const port = 35000 + Math.floor(Math.random() * 10000);
  const password = 'ci-test-strong-password';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '../server'),
    env: { ...process.env, PORT: String(port), CRM_PASSWORD: password, DB_PATH: path.join(dir, 'crm.db'), DISABLE_JOBS: '1' },
    stdio: 'ignore'
  });
  const root = 'http://127.0.0.1:' + port;
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (child.exitCode != null) throw new Error('Server exited unexpectedly');
      try { const res = await fetch(root + '/'); if (res.ok) { ready = true; break; } } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(ready, 'server started');
    const login = await fetch(root + '/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: 'Mathys Caron', password })
    });
    assert.equal(login.status, 200);
    const token = (await login.json()).token;
    const headers = { authorization: 'Bearer ' + token };
    const created = await fetch(root + '/api/clients', {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ prenom: 'Test', nom: 'Fichier' })
    });
    assert.equal(created.status, 201);
    const client = await created.json();
    const form = new FormData();
    form.append('client_id', String(client.id));
    form.append('file', new Blob(['private test content'], { type: 'text/plain' }), 'private.txt');
    const upload = await fetch(root + '/api/documents', { method: 'POST', headers, body: form });
    assert.equal(upload.status, 200);
    const data = await upload.json();
    const name = data.chemin;
    assert.match(name, /^[^/]+$/);
    assert.equal((await fetch(root + '/uploads/' + name)).status, 401);
    assert.equal((await fetch(root + '/api/uploads/' + name)).status, 401);
    const authorized = await fetch(root + '/api/uploads/' + encodeURIComponent(name), { headers });
    assert.equal(authorized.status, 200);
    assert.equal(await authorized.text(), 'private test content');
    assert.equal((await fetch(root + '/api/uploads/missing.txt', { headers })).status, 404);
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(dir, { force: true, recursive: true });
  }
});
