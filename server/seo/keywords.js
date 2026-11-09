import { now } from "./db.js";

// Liste de départ fournie par ProtecToit. Aucun volume ni classement n'est inventé :
// ces données restent vides tant que Search Console n'en fournit pas.
const SEED = {
  "Nano-protection": ["protection toiture bardeaux", "traitement nano toiture", "nano protection toiture québec", "prolonger durée de vie toiture", "traitement hydrofuge toiture", "protéger toiture bardeaux d'asphalte", "combien coûte une nano protection toiture"],
  "Toitures plates": ["revêtement silicone toiture plate", "protection toiture plate", "étanchéité toiture plate", "revêtement toiture commerciale", "réparation et protection toiture plate"],
  Entretien: ["nettoyage toiture laval", "nettoyage toiture montréal", "nettoyage gouttières laval", "démoussage toiture", "entretien toiture bardeaux"],
  Local: ["protection toiture laval", "entretien toiture rive-nord", "nettoyage toiture mirabel", "protection toiture montréal"],
};

const CITY = /laval|montr[ée]al|rive-nord|mirabel|terrebonne|blainville|boisbriand|saint-eustache|laurentides|qu[ée]bec/i;
const BUY = /prix|co[uû]t|combien|soumission|entrepreneur|nettoyage|traitement|protection|d[ée]moussage|rev[êe]tement/i;

export const intentScore = (k) => 1 + (BUY.test(k) ? 2 : 0) + (CITY.test(k) ? 2 : 0);
export function relevanceScore(k) {
  if (/silicone/i.test(k)) return 2; // offre à confirmer
  return /toit|goutti|bardeau|d[ée]moussage/i.test(k) ? 5 : 1;
}

/** Priorité de 0 à 100. La partie Search Console ne compte que si les données existent. */
export function keywordPriority({ intent, relevance, impressions = null, position = null }) {
  let s = intent * 8 + relevance * 8;
  if (impressions != null) {
    if (position >= 4 && position <= 20) s += 12;
    s += Math.min(8, Math.log10(impressions + 1) * 3);
  }
  return Math.min(100, Math.round(s));
}

export function seedKeywords(db) {
  const ins = db.prepare("INSERT OR IGNORE INTO keywords(keyword,grp,source,intent,relevance,created_at) VALUES(?,?,'liste de départ',?,?,?)");
  for (const [grp, list] of Object.entries(SEED)) for (const k of list) ins.run(k, grp, intentScore(k), relevanceScore(k), now());
}

export function listKeywords(db) {
  const latest = db.prepare("SELECT MAX(period_end) p FROM keyword_stats").get().p;
  const prev = latest ? db.prepare("SELECT MAX(period_end) p FROM keyword_stats WHERE period_end<?").get(latest).p : null;
  const agg = (period) => {
    const map = new Map();
    if (!period) return map;
    const rows = db.prepare("SELECT keyword, SUM(clicks) clicks, SUM(impressions) impressions, SUM(position*impressions)/MAX(SUM(impressions),1) position FROM keyword_stats WHERE period_end=? GROUP BY keyword").all(period);
    rows.forEach((r) => map.set(r.keyword, r));
    return map;
  };
  const cur = agg(latest), old = agg(prev);
  return db.prepare("SELECT * FROM keywords").all().map((k) => {
    const c = cur.get(k.keyword), o = old.get(k.keyword);
    return {
      keyword: k.keyword, group: k.grp, source: k.source, intent: k.intent, relevance: k.relevance,
      clicks: c?.clicks ?? null, impressions: c?.impressions ?? null, position: c ? Number(c.position.toFixed(1)) : null,
      positionChange: c && o ? Number((o.position - c.position).toFixed(1)) : null,
      priority: keywordPriority({ intent: k.intent, relevance: k.relevance, impressions: c?.impressions ?? null, position: c?.position ?? null }),
    };
  }).sort((a, b) => b.priority - a.priority);
}
