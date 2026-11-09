import { createSign } from "node:crypto";
import { now, log } from "./db.js";
import { intentScore, relevanceScore } from "./keywords.js";

const b64 = (s) => Buffer.from(s).toString("base64url");
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 864e5));

export const connections = (env = process.env) => ({
  searchConsole: Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON && env.GSC_SITE),
  analytics: Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON && env.GA4_PROPERTY_ID),
  pageSpeed: true,
  pageSpeedKey: Boolean(env.PAGESPEED_API_KEY),
  ai: Boolean(env.ANTHROPIC_API_KEY),
});

export function signJwt(sa, scope, nowSec = Math.floor(Date.now() / 1000)) {
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64(JSON.stringify({ iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: nowSec, exp: nowSec + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${claim}`).sign(sa.private_key, "base64url");
  return `${head}.${claim}.${sig}`;
}

async function token(scope) {
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signJwt(sa, scope) }),
  });
  if (!res.ok) throw new Error(`Authentification Google refusée (${res.status})`);
  return (await res.json()).access_token;
}

async function post(url, tok, body) {
  const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  if (res.status === 429) throw new Error("Limite d'API Google atteinte");
  if (!res.ok) throw new Error(`API Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const save = (db, source, data) => db.prepare("INSERT INTO metrics(ts,source,data) VALUES(?,?,?)").run(now(), source, JSON.stringify(data));

export function latestMetric(db, source) {
  const r = db.prepare("SELECT ts,data FROM metrics WHERE source=? ORDER BY id DESC LIMIT 1").get(source);
  return r ? { ts: r.ts, ...JSON.parse(r.data) } : null;
}

export async function syncSearchConsole(db) {
  const tok = await token("https://www.googleapis.com/auth/webmasters.readonly");
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(process.env.GSC_SITE)}/searchAnalytics/query`;
  // Search Console a environ 3 jours de retard.
  const end = daysAgo(3), start = daysAgo(30), prevEnd = daysAgo(31), prevStart = daysAgo(58);
  const totals = async (s, e) => (await post(url, tok, { startDate: s, endDate: e })).rows?.[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const [current, previous] = await Promise.all([totals(start, end), totals(prevStart, prevEnd)]);
  const detail = await post(url, tok, { startDate: start, endDate: end, dimensions: ["query", "page"], rowLimit: 2000 });
  const stat = db.prepare("INSERT OR REPLACE INTO keyword_stats(keyword,period_end,page,clicks,impressions,ctr,position) VALUES(?,?,?,?,?,?,?)");
  const kw = db.prepare("INSERT OR IGNORE INTO keywords(keyword,grp,source,intent,relevance,created_at) VALUES(?,'Découvert','Search Console',?,?,?)");
  for (const r of detail.rows || []) {
    const [q, page] = r.keys;
    if (relevanceScore(q) >= 2) kw.run(q, intentScore(q), relevanceScore(q), now());
    stat.run(q, end, page, r.clicks, r.impressions, r.ctr, r.position);
  }
  save(db, "gsc", { start, end, current, previous });
  log(db, "info", `Search Console synchronisée : ${detail.rows?.length ?? 0} lignes.`);
}

export async function syncAnalytics(db) {
  const tok = await token("https://www.googleapis.com/auth/analytics.readonly");
  const r = await post(`https://analyticsdata.googleapis.com/v1beta/properties/${process.env.GA4_PROPERTY_ID}:runReport`, tok, {
    dateRanges: [{ startDate: "30daysAgo", endDate: "yesterday" }],
    dimensions: [{ name: "landingPagePlusQueryString" }],
    metrics: [{ name: "sessions" }, { name: "keyEvents" }],
    dimensionFilter: { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Organic Search" } } },
    limit: 200,
  });
  const pages = (r.rows || []).map((x) => ({ page: x.dimensionValues[0].value, sessions: +x.metricValues[0].value, conversions: +x.metricValues[1].value }));
  save(db, "ga4", { sessions: pages.reduce((a, p) => a + p.sessions, 0), conversions: pages.reduce((a, p) => a + p.conversions, 0), pages });
  log(db, "info", `Analytics synchronisé : ${pages.length} pages d'entrée organiques.`);
}

export async function runPageSpeed(db, base) {
  const out = {};
  for (const strategy of ["mobile", "desktop"]) {
    const u = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    u.searchParams.set("url", `${base}/fr`); u.searchParams.set("strategy", strategy); u.searchParams.set("category", "performance");
    if (process.env.PAGESPEED_API_KEY) u.searchParams.set("key", process.env.PAGESPEED_API_KEY);
    const res = await fetch(u, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`PageSpeed ${strategy} : HTTP ${res.status}${res.status === 429 ? " (clé API requise)" : ""}`);
    const j = await res.json(); const a = j.lighthouseResult.audits;
    out[strategy] = { score: Math.round(j.lighthouseResult.categories.performance.score * 100), lcp: a["largest-contentful-paint"].displayValue, cls: a["cumulative-layout-shift"].displayValue, tbt: a["total-blocking-time"].displayValue };
  }
  save(db, "psi", out);
  log(db, "info", `PageSpeed : mobile ${out.mobile.score}/100, ordinateur ${out.desktop.score}/100.`);
}
