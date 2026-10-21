'use strict';
// Utilitaires de test : serveur CRM isolé (base SQLite temporaire, tâches de fond désactivées, mot de passe de test).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TEST_PASSWORD = 'mot-de-passe-de-test-123';
let counter = 0;

function freePort() {
  return new Promise((resolve, reject) => { const s = require('node:net').createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); });
}

async function startServer(extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-test-'));
  const port = await freePort();
  const env = { ...process.env, PORT: String(port), DB_PATH: path.join(dir, 'crm.db'), DISABLE_JOBS: '1', CRM_PASSWORD: TEST_PASSWORD, ...extraEnv };
  delete env.GOOGLE_CLIENT_ID; delete env.GOOGLE_CLIENT_SECRET;
  const child = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '../server'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  // Jusqu'à ~60 s : sur certains postes Windows, le premier démarrage dépasse 15 s (antivirus sur la base temporaire).
  for (let i = 0; i < 400; i++) {
    if (child.exitCode !== null) throw new Error('Serveur arrêté au démarrage :\n' + log);
    try { const r = await fetch(base + '/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); if (r.ok) break; } catch { /* pas prêt */ }
    await new Promise(r => setTimeout(r, 150));
  }
  const call = async (method, url, { body, token, ip = '10.1.1.1', headers = {} } = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let data = null; try { data = await res.json(); } catch { /* corps vide */ }
    return { status: res.status, data, headers: res.headers };
  };
  const login = async (ip = '10.1.1.1', user = 'Mathys Caron') => (await call('POST', '/api/auth/login', { body: { password: TEST_PASSWORD, user }, ip })).data.token;
  return { base, dir, call, login, log: () => log, dbFile: path.join(dir, 'crm.db'), stop: () => new Promise(r => { child.once('exit', r); child.kill(); setTimeout(r, 3000); }) };
}
module.exports = { startServer, TEST_PASSWORD };
