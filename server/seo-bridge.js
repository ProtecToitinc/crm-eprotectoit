'use strict';
// Relie le module SEO (ESM, dossier seo/) au serveur CRM. Il est chargé à part : s'il ne peut pas
// démarrer (version de Node trop ancienne, par exemple), seul /api/seo répond une erreur.
const path = require('path');

let loading = null;
function service() {
  if (!loading) {
    loading = import('./seo/service.js').then(m => m.init({
      dbDir: path.dirname(process.env.DB_PATH || path.join(__dirname, 'crm.db')),
      startJobs: process.env.DISABLE_JOBS !== '1'
    })).catch(e => {
      loading = null;
      console.error('[seo] module indisponible :', e.message);
      throw Object.assign(new Error('Module SEO indisponible sur ce serveur.'), { status: 503 });
    });
  }
  return loading;
}

function register(app, { auth }) {
  const route = (method, url, fn) => app[method](url, auth, async (req, res) => {
    const seo = await service();
    res.json(await fn(seo, req));
  });
  const id = req => {
    const n = Number(req.params.id);
    if (!Number.isInteger(n) || n < 1) throw Object.assign(new Error('Identifiant invalide.'), { status: 400 });
    return n;
  };
  route('get', '/api/seo/summary', s => s.summary());
  route('get', '/api/seo/overview', s => s.overview());
  route('get', '/api/seo/issues', s => s.issues());
  route('get', '/api/seo/keywords', s => s.keywords());
  route('get', '/api/seo/suggestions', s => s.suggestions());
  route('get', '/api/seo/approved', s => s.approved());
  route('get', '/api/seo/articles', s => s.articles());
  route('get', '/api/seo/activity', s => s.activity());
  route('post', '/api/seo/run', (s, req) => s.run(req.body?.type, req.session.user));
  route('post', '/api/seo/mode', (s, req) => s.setMode(req.body?.mode, req.session.user));
  route('post', '/api/seo/suggestions/approve-safe', (s, req) => s.approveSafe(req.session.user));
  route('post', '/api/seo/suggestions/:id/:action', (s, req) => s.decide(id(req), req.params.action, req.session.user));
  route('post', '/api/seo/articles', (s, req) => s.createArticle(req.body?.topic));
  route('put', '/api/seo/articles/:id', (s, req) => s.updateArticle(id(req), req.body || {}, req.session.user));
  // Démarre la planification sans attendre une première visite de la page.
  if (process.env.DISABLE_JOBS !== '1') service().catch(() => {});
}

module.exports = { register };
