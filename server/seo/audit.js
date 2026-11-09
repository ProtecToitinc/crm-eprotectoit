import { createHash } from "node:crypto";
import { now, log } from "./db.js";

// title, explanation, fix, severity, then 1-5 scores for SEO impact, commercial impact, ease of fixing.
export const RULES = {
  sitemap_missing: ["Sitemap introuvable", "Google n'a pas de liste officielle de tes pages.", "Publier /sitemap.xml.", "critical", 5, 3, 4],
  sitemap_wrong_host: ["Le sitemap annonce une autre adresse", "Google reçoit des URLs qui ne sont pas sur ton domaine.", "Corriger NEXT_PUBLIC_SITE_URL sur Kachow avec https://eprotectoit.com, puis redéployer.", "critical", 5, 5, 5],
  robots_wrong_host: ["robots.txt pointe vers une autre adresse", "Google y trouve un sitemap hors de ton domaine.", "Même correctif que le sitemap.", "critical", 4, 3, 5],
  host_broken: ["Variante du domaine en erreur", "Un visiteur ou un lien vers cette adresse tombe sur une erreur.", "Ajouter ce domaine et rediriger (301) vers https://eprotectoit.com.", "high", 4, 4, 4],
  page_error: ["Page en erreur", "Cette page ne s'affiche pas pour Google ni pour les clients.", "Rétablir la page ou rediriger vers la bonne.", "critical", 5, 5, 3],
  redirect_chain: ["Chaîne de redirections", "Les redirections multiples ralentissent et diluent les signaux.", "Rediriger directement vers l'adresse finale.", "low", 2, 1, 3],
  noindex: ["Page exclue de Google", "La balise noindex empêche l'apparition dans Google.", "Retirer noindex si la page doit être trouvée.", "critical", 5, 4, 5],
  title_missing: ["Titre SEO manquant", "Le titre est le texte principal affiché dans Google.", "Ajouter un titre avec service, ville et marque.", "critical", 5, 4, 5],
  title_short: ["Titre SEO trop court", "Il décrit mal la page.", "Viser 30 à 65 caractères avec service et ville.", "medium", 3, 3, 5],
  title_long: ["Titre SEO trop long", "Google risque de le couper.", "Réduire à 65 caractères environ.", "low", 2, 2, 5],
  title_duplicate: ["Titre SEO en double", "Plusieurs pages se font concurrence.", "Écrire un titre unique par page.", "high", 3, 3, 4],
  desc_missing: ["Méta-description manquante", "Google choisira seul le texte sous ton lien.", "Écrire environ 150 caractères avec un appel à l'action.", "medium", 3, 4, 5],
  desc_long: ["Méta-description trop longue", "Elle sera coupée dans Google.", "Réduire à 155 caractères environ.", "low", 2, 3, 5],
  desc_short: ["Méta-description trop courte", "Elle donne peu de raisons de cliquer.", "Viser 120 à 155 caractères.", "low", 2, 3, 5],
  desc_duplicate: ["Méta-description en double", "Les pages se ressemblent dans Google.", "Écrire une description unique par page.", "medium", 2, 3, 4],
  h1_missing: ["H1 manquant", "La page n'a pas de titre principal clair.", "Ajouter un seul H1 descriptif.", "high", 4, 3, 4],
  h1_multiple: ["Plusieurs H1", "Le sujet principal est moins clair.", "Garder un seul H1.", "medium", 2, 1, 4],
  h1_no_location: ["H1 de service sans ville", "Le titre principal ne relie pas le service à ton secteur.", "Ex. : « Nettoyage de toiture à Laval et sur la Rive-Nord ».", "medium", 3, 4, 4],
  thin_content: ["Contenu trop mince", "La page répond peu aux questions des clients et a du mal à se classer.", "Ajouter méthode, étapes, photos réelles, secteurs desservis et FAQ.", "high", 4, 5, 2],
  no_section_headings: ["Aucun sous-titre H2", "La page est difficile à parcourir pour Google et les clients.", "Structurer avec des H2 qui répondent à des questions.", "medium", 2, 2, 3],
  canonical_missing: ["Balise canonical manquante", "Google ne sait pas quelle adresse est officielle.", "Ajouter une canonical absolue sur eprotectoit.com.", "high", 4, 2, 4],
  canonical_wrong: ["Canonical vers une autre page", "Google peut ignorer cette page.", "Faire pointer la canonical vers l'URL de la page sur eprotectoit.com.", "critical", 5, 4, 4],
  hreflang_missing: ["Hreflang manquant", "Google peut confondre les versions FR et EN.", "Ajouter les liens fr-CA, en-CA et x-default.", "medium", 3, 2, 4],
  hreflang_wrong_host: ["Hreflang vers une autre adresse", "Les balises de langue pointent hors de ton domaine.", "Corriger NEXT_PUBLIC_SITE_URL.", "critical", 4, 3, 5],
  hreflang_not_self: ["Hreflang identique à l'accueil", "Chaque page doit annoncer sa propre version FR/EN.", "Générer les hreflang à partir du chemin de la page.", "high", 4, 2, 4],
  lang_mismatch: ["Langue de page incohérente", "La balise lang ne correspond pas au chemin /fr ou /en.", "Fixer <html lang> selon la locale.", "medium", 3, 2, 4],
  og_wrong_host: ["Image de partage hors domaine", "Les aperçus Facebook peuvent casser.", "Corriger NEXT_PUBLIC_SITE_URL.", "medium", 2, 3, 5],
  og_is_favicon: ["Image de partage = favicon", "Le partage du site donne un aperçu médiocre.", "Utiliser une vraie photo de chantier 1200x630.", "low", 1, 3, 4],
  schema_invalid: ["Données structurées invalides", "Google ignore le JSON-LD erroné.", "Corriger le JSON-LD.", "high", 3, 2, 4],
  schema_localbusiness: ["LocalBusiness manquant ou incomplet", "Ce signal local aide Google à relier site, adresse et secteur.", "Ajouter LocalBusiness avec url, téléphone, adresse et horaires réels.", "medium", 3, 4, 4],
  schema_service: ["Données Service manquantes", "Google comprend moins bien l'offre de la page.", "Ajouter un JSON-LD Service relié à LocalBusiness.", "medium", 3, 3, 4],
  alt_missing: ["Images sans attribut alt", "Google et les lecteurs d'écran ne savent pas ce que montre l'image.", "Décrire l'image ; alt vide seulement si décorative.", "low", 2, 1, 4],
  image_heavy: ["Image lourde", "Elle ralentit la page sur cellulaire.", "Compresser ou servir en WebP/AVIF.", "medium", 3, 3, 3],
  broken_link: ["Lien interne brisé", "Il mène à une page en erreur.", "Corriger la cible.", "high", 4, 4, 5],
  orphan_page: ["Page orpheline", "Aucun lien interne n'y mène, donc elle est peu trouvée.", "Ajouter des liens depuis les pages pertinentes.", "high", 4, 4, 5],
  low_internal_links: ["Peu de liens internes vers cette page", "Une page qui vend devrait être reliée depuis les autres.", "La lier depuis l'accueil et les services.", "medium", 3, 3, 5],
  duplicate_content: ["Contenu identique sur plusieurs URLs", "Google choisira une seule version.", "Fusionner ou différencier.", "high", 4, 3, 3],
  unverified_claim: ["Affirmation à prouver", "Une promesse non documentée nuit à la crédibilité.", "Fournir la preuve ou retirer la phrase. L'agent ne la corrige jamais seul.", "medium", 1, 4, 5],
};
const WEIGHT = { critical: 14, high: 7, medium: 3, low: 1 };

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
const strip = (s) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i")); return m ? decode(m[1] ?? m[2]) : null; };

export function parsePage(html, pageUrl) {
  const tags = (re) => html.match(re) || [];
  const metas = tags(/<meta\b[^>]*>/gi);
  const meta = (k, v) => { const t = metas.find((x) => (attr(x, k) || "").toLowerCase() === v); return t ? attr(t, "content") : null; };
  const links = tags(/<link\b[^>]*>/gi);
  const heads = (n) => [...html.matchAll(new RegExp(`<h${n}\\b[^>]*>([\\s\\S]*?)</h${n}>`, "gi"))].map((m) => strip(m[1]));
  const canonicalTag = links.find((l) => (attr(l, "rel") || "").toLowerCase() === "canonical");
  const hreflang = links.filter((l) => attr(l, "hreflang")).map((l) => ({ lang: attr(l, "hreflang"), href: attr(l, "href") }));
  const jsonld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const schemaTypes = []; let schemaInvalid = false, schemaHasUrl = false;
  const walk = (o) => { if (Array.isArray(o)) return o.forEach(walk); if (o && typeof o === "object") { if (o["@type"]) { schemaTypes.push(...[].concat(o["@type"])); if (o["@type"] === "LocalBusiness" && o.url) schemaHasUrl = true; } Object.values(o).forEach(walk); } };
  for (const j of jsonld) { try { walk(JSON.parse(j)); } catch { schemaInvalid = true; } }
  const body = (html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i) || [0, html])[1]
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(header|footer|nav)\b[\s\S]*?<\/\1>/gi, " ");
  const text = strip(body);
  const images = tags(/<img\b[^>]*>/gi).map((t) => ({ src: attr(t, "src"), alt: attr(t, "alt"), hasAlt: /\balt\s*=/i.test(t) }));
  const anchors = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]+)"/gi)].map((m) => decode(m[1]));
  const internal = new Set();
  const host = new URL(pageUrl).host;
  for (const a of anchors) {
    if (/^(mailto|tel|javascript):|^#/i.test(a)) continue;
    try {
      const u = new URL(a, pageUrl);
      // /cdn-cgi/ est réécrit par Cloudflare dans le navigateur : ce n'est pas une page du site.
      if (u.host === host && !u.pathname.startsWith("/cdn-cgi/")) internal.add(u.origin + u.pathname.replace(/\/$/, ""));
    } catch { /* lien mal formé */ }
  }
  return {
    title: strip((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [0, ""])[1]),
    description: meta("name", "description") || "", robots: meta("name", "robots") || "",
    ogImage: meta("property", "og:image"), lang: attr((html.match(/<html\b[^>]*>/i) || [""])[0], "lang"),
    h1: heads(1), h2: heads(2), canonical: canonicalTag ? attr(canonicalTag, "href") : null,
    hreflang, schemaTypes, schemaInvalid, schemaHasUrl, text, words: text ? text.split(" ").length : 0, images, links: [...internal],
  };
}

const CITY = /laval|montr[ée]al|rive[- ](nord|sud)|north shore|south shore|qu[ée]bec|mirabel|terrebonne|blainville|boisbriand|saint-eustache|laurentides/i;
const CLAIMS = [/num[ée]ro 1|number 1|n[°o] ?1\b/i, /100\s*%\s*(de )?satisf/i, /de 5 à 15 ans|5 to 15 years/i];
const isService = (u) => /\/services\/[^/]+$/.test(new URL(u).pathname);
const isHome = (u) => /^\/(fr|en)?$/.test(new URL(u).pathname.replace(/\/$/, ""));
const isLegal = (u) => /privacy|contact|carriere|career/.test(new URL(u).pathname);

export function checkPage(p, ctx) {
  const out = []; const add = (rule, evidence = "") => out.push({ rule, url: p.url, evidence: String(evidence).slice(0, 300) });
  const { host } = new URL(ctx.base);
  if (p.status >= 400 || !p.status) { add("page_error", `HTTP ${p.status}`); return out; }
  if (p.redirects > 1) add("redirect_chain", `${p.redirects} redirections`);
  if (/noindex/i.test(p.robots)) add("noindex", p.robots);
  if (!p.title) add("title_missing"); else if (p.title.length < 25) add("title_short", p.title); else if (p.title.length > 70) add("title_long", `${p.title.length} car.`);
  if (!p.description) add("desc_missing"); else if (p.description.length > 165) add("desc_long", `${p.description.length} car.`); else if (p.description.length < 70) add("desc_short", `${p.description.length} car.`);
  if (!p.h1.length) add("h1_missing"); else if (p.h1.length > 1) add("h1_multiple", p.h1.join(" | "));
  if (isService(p.url) && p.h1.length && !CITY.test(p.h1[0])) add("h1_no_location", p.h1[0]);
  const legal = isLegal(p.url);
  if (!legal && p.words < 300) add("thin_content", `${p.words} mots`);
  if (!legal && !p.h2.length) add("no_section_headings");
  if (!p.canonical) add("canonical_missing");
  else { try { const c = new URL(p.canonical, p.url); if (c.origin + c.pathname.replace(/\/$/, "") !== p.url) add("canonical_wrong", p.canonical); } catch { add("canonical_wrong", p.canonical); } }
  if (!p.hreflang.length) add("hreflang_missing");
  else {
    const foreign = p.hreflang.filter((h) => { try { return new URL(h.href, p.url).host !== host; } catch { return true; } });
    if (foreign.length) add("hreflang_wrong_host", foreign[0].href);
    const path = new URL(p.url).pathname.replace(/^\/(fr|en)/, "");
    if (path && path !== "/" && !p.hreflang.some((h) => { try { return new URL(h.href, p.url).pathname.replace(/^\/(fr|en)/, "").replace(/\/$/, "") === path; } catch { return false; } })) add("hreflang_not_self", p.hreflang[0].href);
  }
  const loc = new URL(p.url).pathname.match(/^\/(fr|en)\b/);
  if (loc && p.lang && !p.lang.toLowerCase().startsWith(loc[1])) add("lang_mismatch", `lang=${p.lang} sur /${loc[1]}`);
  if (p.ogImage) { try { if (new URL(p.ogImage, p.url).host !== host) add("og_wrong_host", p.ogImage); } catch { /* ignoré */ } if (/favicon/i.test(p.ogImage)) add("og_is_favicon", p.ogImage); }
  if (p.schemaInvalid) add("schema_invalid");
  if (isHome(p.url) && (!p.schemaTypes.includes("LocalBusiness") || !p.schemaHasUrl)) add("schema_localbusiness", p.schemaTypes.join(",") || "aucun");
  if (isService(p.url) && !p.schemaTypes.includes("Service")) add("schema_service");
  const noAlt = p.images.filter((i) => !i.hasAlt).length;
  if (noAlt) add("alt_missing", `${noAlt} image(s)`);
  const claim = CLAIMS.map((c) => (p.text + " " + p.description).match(c)).filter(Boolean);
  if (claim.length) add("unverified_claim", claim.map((c) => c[0]).join(" ; "));
  return out;
}

export function checkSite(pages, ctx) {
  const out = []; const ok = pages.filter((p) => p.status === 200);
  const dup = (field, rule) => {
    const by = new Map();
    for (const p of ok) { const v = field(p); if (v) by.set(v, [...(by.get(v) || []), p.url]); }
    for (const [, urls] of by) if (urls.length > 1) urls.forEach((url) => out.push({ rule, url, evidence: `${urls.length} pages` }));
  };
  dup((p) => p.title, "title_duplicate"); dup((p) => p.description, "desc_duplicate");
  dup((p) => (p.words > 40 ? createHash("sha1").update(p.text).digest("hex") : ""), "duplicate_content");
  const inbound = new Map(); for (const p of ok) for (const l of p.links) if (l !== p.url) inbound.set(l, (inbound.get(l) || 0) + 1);
  for (const p of pages) p.inlinks = inbound.get(p.url) || 0;
  for (const p of ok) {
    if (isHome(p.url)) continue;
    if (p.inlinks === 0) out.push({ rule: "orphan_page", url: p.url, evidence: "aucun lien interne détecté" });
    else if (isService(p.url) && p.inlinks < 2) out.push({ rule: "low_internal_links", url: p.url, evidence: `${p.inlinks} lien(s)` });
  }
  const status = new Map(pages.map((p) => [p.url, p.status]));
  for (const p of ok) for (const l of p.links) if (status.get(l) >= 400) out.push({ rule: "broken_link", url: p.url, evidence: l });
  return out.concat(ctx.siteIssues || []);
}

export function prioritize(rule) {
  const [, , , severity, seo, commercial, ease] = RULES[rule];
  return { severity, seo, commercial, ease, priority: seo * 4 + commercial * 4 + ease * 2 };
}

export function healthScore(issues, pageCount) {
  const by = new Map(); for (const i of issues) by.set(i.rule, (by.get(i.rule) || 0) + 1);
  let loss = 0;
  for (const [rule, n] of by) { const w = WEIGHT[RULES[rule][3]]; loss += w * (0.6 + 0.4 * Math.min(1, n / Math.max(1, pageCount))); }
  // Décroissance progressive : un site très imparfait garde un score comparable d'un audit à l'autre.
  return Math.round(100 * Math.exp(-loss / 120));
}

const UA = "ProtecToitSEOAgent/1.0 (audit interne)";
export async function fetchPage(url, method = "GET") {
  const start = Date.now(); let current = url, redirects = 0;
  for (; redirects < 6; redirects++) {
    const res = await fetch(current, { method, redirect: "manual", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) { await res.body?.cancel(); current = new URL(loc, current).href; continue; }
    const body = method === "GET" ? await res.text() : "";
    return { status: res.status, body, finalUrl: current, redirects, ms: Date.now() - start, length: Number(res.headers.get("content-length")) || 0 };
  }
  return { status: 0, body: "", finalUrl: current, redirects, ms: Date.now() - start, length: 0 };
}

async function pool(items, n, fn) { const q = [...items]; await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()); })); }

export async function crawl(base, { fetcher = fetchPage, maxPages = 150, delayMs = 150 } = {}) {
  const b = new URL(base); const siteIssues = []; const add = (rule, url, evidence = "") => siteIssues.push({ rule, url, evidence });
  const seeds = new Set([`${b.origin}/fr`, `${b.origin}/en`]);
  const sm = await fetcher(`${b.origin}/sitemap.xml`).catch(() => ({ status: 0, body: "" }));
  if (sm.status !== 200) add("sitemap_missing", `${b.origin}/sitemap.xml`, `HTTP ${sm.status}`);
  else {
    const locs = [...sm.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
    const foreign = locs.filter((l) => new URL(l).host !== b.host);
    if (foreign.length) add("sitemap_wrong_host", `${b.origin}/sitemap.xml`, `${foreign.length}/${locs.length} URLs, ex. ${foreign[0]}`);
    // On audite le chemin annoncé sur le vrai domaine.
    for (const l of locs) { const p = new URL(l).pathname.replace(/\/$/, ""); seeds.add(`${b.origin}${/^\/(fr|en)(\/|$)/.test(p) ? p : "/fr" + p}`.replace(/\/$/, "")); }
  }
  const rb = await fetcher(`${b.origin}/robots.txt`).catch(() => ({ status: 0, body: "" }));
  const disallowAdmin = (u) => /\/admin(\/|$)/.test(new URL(u).pathname);
  const sitemapLine = rb.body?.match(/^sitemap:\s*(\S+)/im);
  if (sitemapLine && new URL(sitemapLine[1]).host !== b.host) add("robots_wrong_host", `${b.origin}/robots.txt`, sitemapLine[1]);
  const variantHost = b.host.startsWith("www.") ? b.host.slice(4) : `www.${b.host}`;
  const variant = await fetcher(`https://${variantHost}`).catch((e) => ({ status: 0, error: e.message }));
  if (variant.status !== 200) add("host_broken", `https://${variantHost}`, `HTTP ${variant.status || variant.error}`);

  const seen = new Set(), pages = []; let frontier = [...seeds];
  while (frontier.length && pages.length < maxPages) {
    const batch = [...new Set(frontier)].filter((u) => !seen.has(u) && !disallowAdmin(u)).slice(0, maxPages - pages.length);
    batch.forEach((u) => seen.add(u)); const next = [];
    await pool(batch, 3, async (url) => {
      await new Promise((r) => setTimeout(r, delayMs));
      let res; try { res = await fetcher(url); } catch (e) { res = { status: 0, body: "", ms: 0, redirects: 0, error: e.message }; }
      const parsed = parsePage(res.body || "", url);
      pages.push({ url, status: res.status, ms: res.ms, redirects: res.redirects, ...parsed });
      parsed.links.forEach((l) => next.push(l));
    });
    frontier = next;
  }
  const images = new Map();
  for (const p of pages) for (const i of p.images) if (i.src && !i.src.startsWith("data:")) { try { const u = new URL(i.src, p.url).href; if (!images.has(u)) images.set(u, p.url); } catch { /* ignoré */ } }
  await pool([...images.keys()].slice(0, 60), 3, async (src) => {
    try { const r = await fetcher(src, "HEAD"); if (r.length > 400 * 1024) siteIssues.push({ rule: "image_heavy", url: images.get(src), evidence: `${Math.round(r.length / 1024)} Ko : ${src}` }); } catch { /* image non mesurée */ }
  });
  return { pages, siteIssues };
}

export async function runAudit(db, base, opts) {
  const started = now();
  const runId = Number(db.prepare("INSERT INTO runs(started_at,status) VALUES(?,'running')").run(started).lastInsertRowid);
  try {
    const { pages, siteIssues } = await crawl(base, opts);
    const ctx = { base, siteIssues };
    const site = checkSite(pages, ctx);
    const raw = [...pages.flatMap((p) => checkPage(p, ctx)), ...site];
    const uniq = new Map(); for (const i of raw) { const fp = `${i.rule}|${i.url}${i.rule === "broken_link" || i.rule === "image_heavy" ? "|" + i.evidence : ""}`; if (!uniq.has(fp)) uniq.set(fp, { ...i, fingerprint: fp }); }
    const issues = [...uniq.values()];
    const prev = db.prepare("SELECT id FROM runs WHERE status='ok' AND id<? ORDER BY id DESC LIMIT 1").get(runId);
    const prevFp = new Set(prev ? db.prepare("SELECT fingerprint FROM issues WHERE run_id=?").all(prev.id).map((r) => r.fingerprint) : []);
    const ins = db.prepare("INSERT INTO issues(run_id,fingerprint,rule,severity,url,title,explanation,fix,evidence,seo,commercial,ease,priority,is_new) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    let fresh = 0;
    db.exec("BEGIN");
    for (const i of issues) {
      const [t, e, f] = RULES[i.rule]; const pr = prioritize(i.rule); const isNew = prev && !prevFp.has(i.fingerprint) ? 1 : 0; fresh += isNew;
      ins.run(runId, i.fingerprint, i.rule, pr.severity, i.url, t, e, f, i.evidence, pr.seo, pr.commercial, pr.ease, pr.priority, isNew);
    }
    const insP = db.prepare("INSERT INTO pages(run_id,url,status,title,description,h1,words,inlinks,ms) VALUES(?,?,?,?,?,?,?,?,?)");
    for (const p of pages) insP.run(runId, p.url, p.status, p.title, p.description, p.h1.join(" | "), p.words, p.inlinks ?? 0, p.ms ?? 0);
    db.exec("COMMIT");
    const cur = new Set(issues.map((i) => i.fingerprint)); const resolved = [...prevFp].filter((f) => !cur.has(f)).length;
    const health = healthScore(issues, pages.length), critical = issues.filter((i) => RULES[i.rule][3] === "critical").length;
    db.prepare("UPDATE runs SET finished_at=?,status='ok',health=?,pages=?,critical=?,total=?,new_issues=?,resolved=? WHERE id=?").run(now(), health, pages.length, critical, issues.length, fresh, resolved, runId);
    log(db, "info", `Audit #${runId} : ${pages.length} pages, ${issues.length} problèmes (${critical} critiques), ${fresh} nouveaux, ${resolved} résolus. Santé ${health}/100.`);
    return { runId, health, pages: pages.length, issues: issues.length, critical };
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch { /* pas de transaction active */ }
    db.prepare("UPDATE runs SET finished_at=?,status='error',error=? WHERE id=?").run(now(), e.message, runId);
    log(db, "error", `Audit #${runId} échoué : ${e.message}`);
    throw e;
  }
}
