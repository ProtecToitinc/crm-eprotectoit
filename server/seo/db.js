import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDb(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY, started_at TEXT, finished_at TEXT, status TEXT,
      health INTEGER, pages INTEGER, critical INTEGER, total INTEGER, new_issues INTEGER, resolved INTEGER, error TEXT);
    CREATE TABLE IF NOT EXISTS pages(run_id INTEGER, url TEXT, status INTEGER, title TEXT, description TEXT,
      h1 TEXT, words INTEGER, inlinks INTEGER, ms INTEGER, PRIMARY KEY(run_id,url));
    CREATE TABLE IF NOT EXISTS issues(id INTEGER PRIMARY KEY, run_id INTEGER, fingerprint TEXT, rule TEXT, severity TEXT,
      url TEXT, title TEXT, explanation TEXT, fix TEXT, evidence TEXT, seo INTEGER, commercial INTEGER, ease INTEGER,
      priority INTEGER, is_new INTEGER);
    CREATE INDEX IF NOT EXISTS issues_run ON issues(run_id);
    CREATE TABLE IF NOT EXISTS keywords(keyword TEXT PRIMARY KEY, grp TEXT, source TEXT, intent INTEGER, relevance INTEGER, created_at TEXT);
    CREATE TABLE IF NOT EXISTS keyword_stats(keyword TEXT, period_end TEXT, page TEXT, clicks INTEGER, impressions INTEGER,
      ctr REAL, position REAL, PRIMARY KEY(keyword,period_end,page));
    CREATE TABLE IF NOT EXISTS metrics(id INTEGER PRIMARY KEY, ts TEXT, source TEXT, data TEXT);
    CREATE TABLE IF NOT EXISTS suggestions(id INTEGER PRIMARY KEY, created_at TEXT, url TEXT, field TEXT, before_text TEXT,
      after_text TEXT, reason TEXT, impact TEXT, confidence TEXT, needs_review TEXT, source TEXT, status TEXT, decided_at TEXT);
    CREATE TABLE IF NOT EXISTS suggestion_history(id INTEGER PRIMARY KEY, suggestion_id INTEGER, ts TEXT, from_status TEXT, to_status TEXT);
    CREATE TABLE IF NOT EXISTS articles(id INTEGER PRIMARY KEY, created_at TEXT, updated_at TEXT, keyword TEXT, intent TEXT,
      slug TEXT, title TEXT, meta TEXT, outline TEXT, body TEXT, cta TEXT, internal_links TEXT, status TEXT);
    CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY, ts TEXT, level TEXT, message TEXT);
    CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY, type TEXT, schedule_key TEXT UNIQUE, status TEXT, attempts INTEGER DEFAULT 0,
      run_after TEXT, created_at TEXT, finished_at TEXT, error TEXT);
    CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY, ts TEXT, period TEXT, body TEXT);
  `);
  return db;
}

export const now = () => new Date().toISOString();

export function log(db, level, message) {
  db.prepare("INSERT INTO activity(ts,level,message) VALUES(?,?,?)").run(now(), level, String(message).slice(0, 1000));
}

export function getSetting(db, key, fallback = null) {
  const r = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
  return r ? r.value : fallback;
}

export function setSetting(db, key, value) {
  db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}
