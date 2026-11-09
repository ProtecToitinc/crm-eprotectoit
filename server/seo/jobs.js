import { now, log, getSetting } from "./db.js";
import { runAudit } from "./audit.js";
import { connections, syncSearchConsole, syncAnalytics, runPageSpeed, latestMetric } from "./google.js";
import { generateSuggestions, autoDraftArticle } from "./ai.js";

const BACKOFF_MIN = [5, 30, 120];
const MAX_ATTEMPTS = 3;

export function enqueue(db, type, key = null) {
  return db.prepare("INSERT OR IGNORE INTO jobs(type,schedule_key,status,run_after,created_at) VALUES(?,?,'queued',?,?)").run(type, key, now(), now()).changes > 0;
}

function montrealParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montreal", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, month: `${p.year}-${p.month}`, day: +p.day, hour: +p.hour, weekday: p.weekday };
}

/** Ajoute à la file les tâches dues ; la clé unique empêche les doublons. */
export function scheduleDue(db, d = new Date()) {
  const m = montrealParts(d);
  if (m.hour < 6) return;
  enqueue(db, "daily", `daily:${m.date}`);
  if (m.weekday === "Mon") enqueue(db, "weekly", `weekly:${m.date}`);
  if (m.day === 1) enqueue(db, "monthly", `monthly:${m.month}`);
}

export function buildMonthlyReport(db, period) {
  const runs = db.prepare("SELECT * FROM runs WHERE status='ok' ORDER BY id DESC").all();
  const cur = runs[0];
  const old = runs.find((r) => r.started_at.slice(0, 7) < period) ?? null;
  const gsc = latestMetric(db, "gsc"), ga = latestMetric(db, "ga4"), psi = latestMetric(db, "psi");
  const L = [`# Rapport SEO ${period}`, "", "## Santé technique"];
  L.push(cur ? `Score ${cur.health}/100, ${cur.total} problèmes dont ${cur.critical} critiques.` : "Aucun audit réussi.");
  L.push(cur && old ? `Comparaison avec ${old.started_at.slice(0, 10)} : score ${old.health} → ${cur.health}, problèmes ${old.total} → ${cur.total}.` : "Pas encore de mois précédent à comparer.");
  L.push("", "## Search Console");
  L.push(gsc ? `Du ${gsc.start} au ${gsc.end} : ${gsc.current.clicks} clics (avant : ${gsc.previous.clicks}), ${gsc.current.impressions} impressions (avant : ${gsc.previous.impressions}), position moyenne ${Number(gsc.current.position).toFixed(1)}.` : "Non connecté : aucune donnée.");
  L.push("", "## Conversions organiques");
  L.push(ga ? `${ga.sessions} sessions organiques, ${ga.conversions} événements clés sur 30 jours.` : "Non connecté : aucune donnée.");
  L.push("", "## Vitesse");
  L.push(psi ? `Mobile ${psi.mobile.score}/100, ordinateur ${psi.desktop.score}/100.` : "Aucune mesure PageSpeed.");
  L.push("", "## Plan d'action");
  if (cur) db.prepare("SELECT title, COUNT(*) n, MAX(fix) fix FROM issues WHERE run_id=? GROUP BY rule ORDER BY MAX(priority) DESC LIMIT 8").all(cur.id).forEach((i, n) => L.push(`${n + 1}. ${i.title} (${i.n}) : ${i.fix}`));
  db.prepare("INSERT INTO reports(ts,period,body) VALUES(?,?,?)").run(now(), period, L.join("\n"));
  log(db, "info", `Rapport mensuel ${period} créé.`);
}

async function syncGoogle(db, base) {
  const c = connections();
  const tasks = [];
  if (c.pageSpeedKey) tasks.push(["PageSpeed", () => runPageSpeed(db, base)]); // sans clé, Google répond 429
  if (c.searchConsole) tasks.push(["Search Console", () => syncSearchConsole(db)]);
  if (c.analytics) tasks.push(["Analytics", () => syncAnalytics(db)]);
  const failures = [];
  for (const [name, fn] of tasks) { try { await fn(); } catch (e) { failures.push(`${name} : ${e.message}`); log(db, "warn", `${name} : ${e.message}`); } }
  if (tasks.length && failures.length === tasks.length) throw new Error(failures.join(" | "));
}

/** Prépare seul ce qui demande de l'IA. Une panne ici n'annule jamais l'audit. */
async function autoPrepare(db, { article = false } = {}) {
  if (getSetting(db, "mode", "recommendation") === "observation" || !connections().ai) return;
  try {
    await generateSuggestions(db);
    if (article) await autoDraftArticle(db);
  } catch (e) { log(db, "warn", `Préparation automatique : ${e.message}`); }
}

export async function execute(db, type, base) {
  if (type === "audit") return runAudit(db, base);
  if (type === "daily") {
    const r = await runAudit(db, base);
    await syncGoogle(db, base).catch(() => {});
    await autoPrepare(db);
    return r;
  }
  if (type === "sync" ) return syncGoogle(db, base);
  if (type === "suggest") return generateSuggestions(db);
  if (type === "weekly") {
    await syncGoogle(db, base);
    await autoPrepare(db, { article: true });
    return;
  }
  if (type === "monthly") { await syncGoogle(db, base).catch(() => {}); return buildMonthlyReport(db, now().slice(0, 7)); }
  throw new Error(`Tâche inconnue : ${type}`);
}

let busy = false;
export async function workOnce(db, base, run = execute) {
  if (busy) return false;
  const job = db.prepare("SELECT * FROM jobs WHERE status='queued' AND run_after<=? ORDER BY id LIMIT 1").get(now());
  if (!job) return false;
  busy = true;
  const attempts = job.attempts + 1;
  db.prepare("UPDATE jobs SET status='running',attempts=? WHERE id=?").run(attempts, job.id);
  try {
    await run(db, job.type, base);
    db.prepare("UPDATE jobs SET status='done',finished_at=?,error=NULL WHERE id=?").run(now(), job.id);
  } catch (e) {
    if (attempts < MAX_ATTEMPTS) {
      const after = new Date(Date.now() + BACKOFF_MIN[attempts - 1] * 6e4).toISOString();
      db.prepare("UPDATE jobs SET status='queued',run_after=?,error=? WHERE id=?").run(after, e.message, job.id);
      log(db, "warn", `Tâche ${job.type}, essai ${attempts} échoué : ${e.message}. Nouvel essai à ${after}.`);
    } else {
      db.prepare("UPDATE jobs SET status='failed',finished_at=?,error=? WHERE id=?").run(now(), e.message, job.id);
      log(db, "error", `Tâche ${job.type} abandonnée après ${attempts} essais : ${e.message}`);
    }
  } finally { busy = false; }
  return true;
}

export function startWorker(db, base) {
  db.prepare("UPDATE jobs SET status='queued' WHERE status='running'").run();
  const tick = () => { try { scheduleDue(db); } catch (e) { log(db, "error", e.message); } workOnce(db, base); };
  const timer = setInterval(tick, 30000);
  timer.unref();
  setTimeout(tick, 1000).unref();
}
