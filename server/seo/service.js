// Agent SEO : logique du module. Il lit eprotectoit.com de l'extérieur et ne modifie jamais le site.
import path from "node:path";
import { openDb, now, log, getSetting, setSetting } from "./db.js";
import { seedKeywords, listKeywords } from "./keywords.js";
import { connections, latestMetric } from "./google.js";
import { enqueue, startWorker } from "./jobs.js";
import { generateArticle } from "./ai.js";
import { buildSummary } from "./summary.js";

const fail = (status, message) => Object.assign(new Error(message), { status });
const TRANSITIONS = { approve: ["pending", "approved"], reject: ["pending", "rejected"], undo: [null, "pending"] };

export function init({ dbDir, startJobs }) {
  const site = (process.env.SEO_SITE_URL || "https://eprotectoit.com").replace(/\/$/, "");
  const db = openDb(path.join(dbDir, "seo.db"));
  seedKeywords(db);
  if (startJobs) startWorker(db, site);
  const lastRun = () => db.prepare("SELECT * FROM runs WHERE status='ok' ORDER BY id DESC LIMIT 1").get() ?? null;

  return {
    overview() {
      const run = lastRun();
      const optimized = run ? db.prepare("SELECT COUNT(*) n FROM pages p WHERE p.run_id=? AND p.status=200 AND NOT EXISTS(SELECT 1 FROM issues i WHERE i.run_id=p.run_id AND i.url=p.url AND i.severity IN ('critical','high'))").get(run.id).n : null;
      return {
        site, mode: getSetting(db, "mode", "recommendation"), run, optimized,
        history: db.prepare("SELECT started_at,health,total,critical FROM runs WHERE status='ok' ORDER BY id DESC LIMIT 8").all(),
        connections: connections(), gsc: latestMetric(db, "gsc"), ga4: latestMetric(db, "ga4"), psi: latestMetric(db, "psi"),
        running: db.prepare("SELECT COUNT(*) n FROM jobs WHERE status IN ('queued','running') AND run_after<=?").get(now()).n,
      };
    },
    summary() {
      const run = lastRun(), count = (q) => db.prepare(q).get().n;
      return buildSummary({
        run, issues: run ? db.prepare("SELECT rule,priority FROM issues WHERE run_id=?").all(run.id) : [],
        connections: connections(), gsc: latestMetric(db, "gsc"), mode: getSetting(db, "mode", "recommendation"),
        pendingTotal: count("SELECT COUNT(*) n FROM suggestions WHERE status='pending'"),
        pendingSafe: count("SELECT COUNT(*) n FROM suggestions WHERE status='pending' AND COALESCE(needs_review,'')=''"),
        draftArticles: count("SELECT COUNT(*) n FROM articles WHERE status='draft'"),
      });
    },
    /** Approuve seulement les propositions sans prix, garantie, chiffre ni information à confirmer. */
    approveSafe(user) {
      const list = db.prepare("SELECT id FROM suggestions WHERE status='pending' AND COALESCE(needs_review,'')=''").all();
      for (const s of list) this.decide(s.id, "approve", user);
      return { approved: list.length };
    },
    issues() { const r = lastRun(); return r ? db.prepare("SELECT * FROM issues WHERE run_id=? ORDER BY priority DESC, rule, url").all(r.id) : []; },
    keywords: () => listKeywords(db),
    suggestions: () => db.prepare("SELECT * FROM suggestions ORDER BY id DESC").all(),
    approved: () => db.prepare("SELECT url,field,before_text,after_text,decided_at FROM suggestions WHERE status='approved'").all(),
    articles: () => db.prepare("SELECT * FROM articles ORDER BY id DESC").all(),
    activity: () => ({
      log: db.prepare("SELECT * FROM activity ORDER BY id DESC LIMIT 100").all(),
      jobs: db.prepare("SELECT id,type,status,attempts,run_after,created_at,finished_at,error FROM jobs ORDER BY id DESC LIMIT 20").all(),
      reports: db.prepare("SELECT * FROM reports ORDER BY id DESC LIMIT 12").all(),
    }),
    run(type, user) {
      if (!["audit", "sync", "suggest"].includes(type)) throw fail(400, "Tâche inconnue.");
      if (type === "suggest") {
        if (!connections().ai) throw fail(409, "Clé ANTHROPIC_API_KEY absente.");
        if (getSetting(db, "mode", "recommendation") === "observation") throw fail(409, "Passe en mode Recommandations pour générer des propositions.");
      }
      enqueue(db, type);
      log(db, "info", `Tâche ${type} demandée par ${user}.`);
      return { ok: true };
    },
    setMode(mode, user) {
      if (mode === "auto") throw fail(409, "Auto-optimisation verrouillée : aucun accès sécurisé au code du site n'est connecté.");
      if (!["observation", "recommendation"].includes(mode)) throw fail(400, "Mode inconnu.");
      setSetting(db, "mode", mode);
      log(db, "info", `Mode changé à ${mode} par ${user}.`);
      return { ok: true };
    },
    decide(id, action, user) {
      const t = TRANSITIONS[action];
      if (!t) throw fail(400, "Action inconnue.");
      const s = db.prepare("SELECT * FROM suggestions WHERE id=?").get(id);
      if (!s) throw fail(404, "Proposition introuvable.");
      if (t[0] ? s.status !== t[0] : s.status === "pending") throw fail(409, "Action impossible dans cet état.");
      db.prepare("UPDATE suggestions SET status=?,decided_at=? WHERE id=?").run(t[1], now(), id);
      db.prepare("INSERT INTO suggestion_history(suggestion_id,ts,from_status,to_status) VALUES(?,?,?,?)").run(id, now(), s.status, t[1]);
      log(db, "info", `Proposition #${id} (${s.field}) : ${s.status} → ${t[1]}, par ${user}.`);
      return { ok: true };
    },
    async createArticle(topic) {
      if (!connections().ai) throw fail(409, "Clé ANTHROPIC_API_KEY absente.");
      const clean = String(topic || "").trim();
      if (clean.length < 8) throw fail(400, "Sujet trop court.");
      return { id: await generateArticle(db, clean.slice(0, 300)) };
    },
    updateArticle(id, a, user) {
      const cur = db.prepare("SELECT * FROM articles WHERE id=?").get(id);
      if (!cur) throw fail(404, "Article introuvable.");
      const status = ["draft", "approved", "rejected"].includes(a.status) ? a.status : cur.status;
      db.prepare("UPDATE articles SET title=?,meta=?,body=?,status=?,updated_at=? WHERE id=?").run(String(a.title ?? cur.title), String(a.meta ?? cur.meta), String(a.body ?? cur.body), status, now(), id);
      if (status !== cur.status) log(db, "info", `Article #${id} : ${cur.status} → ${status}, par ${user}.`);
      return { ok: true };
    },
  };
}
