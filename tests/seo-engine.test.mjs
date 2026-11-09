import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { openDb } from "../server/seo/db.js";
import { parsePage, checkPage, checkSite, crawl, runAudit, healthScore, prioritize } from "../server/seo/audit.js";
import { keywordPriority, relevanceScore, seedKeywords, listKeywords } from "../server/seo/keywords.js";
import { signJwt } from "../server/seo/google.js";
import { enqueue, scheduleDue, workOnce } from "../server/seo/jobs.js";
import { reviewFlags } from "../server/seo/ai.js";

const base = "https://exemple.test";
const words = (n) => Array(n).fill("toiture").join(" ");
const page = ({ title = "Nettoyage de toiture à Laval et Rive-Nord", desc = "d".repeat(130), h1 = "<h1>Nettoyage de toiture à Laval</h1>", extra = "", body = words(400), lang = "fr" } = {}) =>
  `<html lang="${lang}"><head><title>${title}</title><meta name="description" content="${desc}">${extra}</head><body><main>${h1}<h2>Section</h2><p>${body}</p></main></body></html>`;
const rules = (p, b = base) => checkPage(p, { base: b }).map((x) => x.rule);
const mk = (html, url = `${base}/fr/services/x`, status = 200) => ({ url, status, redirects: 0, ...parsePage(html, url) });

test("détecte l'absence de canonical et les H1 multiples", () => {
  const r = rules(mk(page({ h1: "<h1>Un à Laval</h1><h1>Deux</h1>" })));
  assert.ok(r.includes("canonical_missing")); assert.ok(r.includes("h1_multiple"));
});
test("accepte une canonical correcte", () => {
  const url = `${base}/fr/services/x`;
  assert.ok(!rules(mk(page({ extra: `<link rel="canonical" href="${url}">` }), url)).includes("canonical_missing"));
  assert.ok(!rules(mk(page({ extra: `<link rel="canonical" href="${url}">` }), url)).includes("canonical_wrong"));
});
test("signale canonical vers une autre page", () => {
  assert.ok(rules(mk(page({ extra: `<link rel="canonical" href="${base}/fr">` }))).includes("canonical_wrong"));
});
test("signale hreflang hors domaine et non propre à la page", () => {
  const r = rules(mk(page({ extra: `<link rel="alternate" hrefLang="fr" href="https://autre.up.railway.app">` })));
  assert.ok(r.includes("hreflang_wrong_host")); assert.ok(r.includes("hreflang_not_self"));
});
test("contenu mince et H1 de service sans ville", () => {
  const r = rules(mk(page({ body: words(50), h1: "<h1>Nano Protection</h1>" })));
  assert.ok(r.includes("thin_content")); assert.ok(r.includes("h1_no_location"));
});
test("alt vide accepté, attribut absent signalé", () => {
  assert.ok(!rules(mk(page({ body: words(400) + '<img src="/a.jpg" alt="">' }))).includes("alt_missing"));
  assert.ok(rules(mk(page({ body: words(400) + '<img src="/a.jpg">' }))).includes("alt_missing"));
});
test("JSON-LD invalide et affirmation à prouver", () => {
  const r = rules(mk(page({ extra: '<script type="application/ld+json">{oups</script>', body: words(400) + " Numéro 1 au Québec" })));
  assert.ok(r.includes("schema_invalid")); assert.ok(r.includes("unverified_claim"));
});
test("page 404 : une seule erreur", () => assert.deepEqual(rules(mk("", `${base}/fr/x`, 404)), ["page_error"]));
test("doublons, orphelines et liens brisés", () => {
  const a = mk(page({ body: words(400) + `<a href="/fr/casse">x</a>` }), `${base}/fr/a`), b = mk(page(), `${base}/fr/b`), c = mk("", `${base}/fr/casse`, 404);
  const r = checkSite([a, b, c], { base });
  for (const k of ["title_duplicate", "orphan_page", "broken_link"]) assert.ok(r.some((x) => x.rule === k), k);
});
test("liens Cloudflare ignorés", () => {
  const p = parsePage('<a href="/cdn-cgi/l/email-protection#x">m</a><a href="/fr/a">a</a>', `${base}/fr`);
  assert.deepEqual(p.links, [`${base}/fr/a`]);
});
test("priorité et santé", () => {
  assert.ok(prioritize("sitemap_wrong_host").priority > prioritize("title_long").priority);
  assert.equal(healthScore([], 5), 100);
  assert.ok(healthScore([{ rule: "sitemap_wrong_host" }], 5) < 100);
});

function fakeSite() {
  const routes = {
    "/sitemap.xml": `<urlset><url><loc>https://bad.up.railway.app/services</loc></url></urlset>`,
    "/robots.txt": `User-agent: *\nDisallow: /admin/\nSitemap: https://bad.up.railway.app/sitemap.xml`,
    "/fr": page({ body: words(400) + '<a href="/fr/services">s</a><a href="/fr/autre">x</a><a href="/admin/secret">a</a>' }),
    "/en": page({ lang: "en", title: "English title about roofs in Laval", body: words(400) + '<a href="/fr/autre">a</a>' }),
    "/fr/autre": page({ title: "Autre page de toiture à Laval" }),
    "/fr/services": page({ title: "Services de toiture à Laval et Montréal" }),
  };
  const hits = [];
  const fetcher = async (u, m = "GET") => { const p = new URL(u); hits.push(p.pathname); const known = routes[p.pathname]; return { status: p.host.startsWith("www.") ? 404 : known ? 200 : 404, body: known || "", ms: 1, redirects: 0, length: 0, m }; };
  return { fetcher, hits };
}
test("exploration : mauvais hôte détecté, /admin jamais visité", async () => {
  const { fetcher, hits } = fakeSite();
  const { siteIssues, pages } = await crawl(base, { fetcher, delayMs: 0 });
  const r = siteIssues.map((x) => x.rule);
  for (const k of ["sitemap_wrong_host", "robots_wrong_host", "host_broken"]) assert.ok(r.includes(k), k);
  assert.ok(!hits.some((h) => h.includes("admin")));
  assert.ok(pages.some((p) => p.url === `${base}/fr/services`));
});
test("audit complet en base, comparaison entre deux passages", async () => {
  const db = openDb(":memory:"); const { fetcher } = fakeSite();
  await runAudit(db, base, { fetcher, delayMs: 0 });
  await runAudit(db, base, { fetcher, delayMs: 0 });
  const runs = db.prepare("SELECT * FROM runs ORDER BY id").all();
  assert.equal(runs.length, 2); assert.equal(runs[1].new_issues, 0); assert.equal(runs[1].resolved, 0); assert.ok(runs[1].total > 0);
});
test("mots-clés : aucune donnée inventée sans Search Console", () => {
  const db = openDb(":memory:"); seedKeywords(db);
  for (const k of listKeywords(db)) { assert.equal(k.clicks, null); assert.equal(k.impressions, null); assert.equal(k.position, null); }
  assert.ok(relevanceScore("revêtement silicone toiture plate") < relevanceScore("nettoyage toiture laval"));
  assert.ok(keywordPriority({ intent: 5, relevance: 5, impressions: 100, position: 8 }) > keywordPriority({ intent: 5, relevance: 5 }));
});
test("JWT Google signé correctement", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const [h, c, s] = signJwt({ client_email: "a@b", private_key: privateKey }, "scope").split(".");
  assert.ok(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, s, "base64url"));
  assert.equal(JSON.parse(Buffer.from(c, "base64url")).iss, "a@b");
});
test("file : pas de doublon planifié, reprise après échec", async () => {
  const db = openDb(":memory:"); const d = new Date("2026-11-09T18:00:00Z");
  scheduleDue(db, d); scheduleDue(db, d);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM jobs WHERE type='daily'").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM jobs WHERE type='weekly'").get().n, 1);
  db.exec("DELETE FROM jobs"); enqueue(db, "audit");
  await workOnce(db, base, async () => { throw new Error("panne"); });
  const j = db.prepare("SELECT * FROM jobs").get();
  assert.equal(j.status, "queued"); assert.equal(j.attempts, 1); assert.ok(new Date(j.run_after) > new Date());
});
test("textes IA risqués marqués pour vérification", () => {
  assert.ok(reviewFlags("Garantie de 10 ans pour 500 $").includes("garantie"));
  assert.deepEqual(reviewFlags("Nettoyage de toiture à Laval"), []);
});

test("résumé en langage simple", async () => {
  const { buildSummary } = await import("../server/seo/summary.js");
  const base = { connections: { searchConsole: false, analytics: false, ai: false }, gsc: null, pendingSafe: 0, pendingTotal: 0, draftArticles: 0, mode: "recommendation" };
  const s = buildSummary({ ...base, run: { health: 48, critical: 2, pages: 21, finished_at: "x" }, issues: [{ rule: "title_long", priority: 30 }, { rule: "sitemap_wrong_host", priority: 50 }, { rule: "unverified_claim", priority: 30 }] });
  assert.equal(s.grade, "urgent");
  assert.equal(s.families[0].key, "adresse");
  assert.ok(s.families.some((x) => x.who === "toi"));
  assert.equal(buildSummary({ ...base, run: { health: 90, critical: 0, pages: 5 }, issues: [] }).grade, "bon");
});
