// Traduit les résultats techniques en français simple, pour une personne qui ne connaît pas le SEO.
const FAMILIES = [
  { key: "adresse", rules: ["sitemap_wrong_host", "robots_wrong_host", "hreflang_wrong_host", "og_wrong_host"], title: "Ton site donne une mauvaise adresse à Google",
    why: "Google reçoit l'ancienne adresse technique au lieu de eprotectoit.com. Il comprend donc mal quelles pages montrer.", who: "claude", next: "Une seule correction, déjà identifiée. Dis à Claude « vas-y » pour la faire." },
  { key: "acces", rules: ["page_error", "broken_link", "host_broken", "noindex", "redirect_chain"], title: "Certaines adresses mènent à une erreur",
    why: "Un client ou Google qui arrive là voit une page d'erreur et repart.", who: "claude", next: "Demande à Claude de les corriger." },
  { key: "texte", rules: ["thin_content", "no_section_headings"], title: "Tes pages n'expliquent pas assez tes services",
    why: "Google met en avant les pages qui répondent vraiment aux questions des gens. Les tiennes sont très courtes.", who: "agent", next: "L'agent prépare des articles. Tu les lis et tu dis oui ou non." },
  { key: "local", rules: ["h1_no_location", "schema_localbusiness", "schema_service"], title: "Google ne relie pas assez tes services à tes villes",
    why: "Quelqu'un qui cherche « nettoyage toiture Laval » doit voir clairement que tu travailles à Laval.", who: "agent", next: "L'agent propose de meilleurs titres avec tes villes." },
  { key: "titres", rules: ["title_missing", "title_short", "title_long", "title_duplicate", "desc_missing", "desc_long", "desc_short", "desc_duplicate", "h1_missing", "h1_multiple"], title: "Le texte affiché dans Google peut donner plus envie de cliquer",
    why: "C'est la première chose que les gens lisent avant de choisir une entreprise.", who: "agent", next: "L'agent réécrit ces textes. Tu approuves." },
  { key: "confiance", rules: ["unverified_claim"], title: "Des promesses sur ton site n'ont pas de preuve",
    why: "« Numéro 1 » ou « 5 à 15 ans » sans preuve peuvent faire perdre la confiance des clients.", who: "toi", next: "Toi seul peux dire si c'est prouvable. Garde la phrase avec une preuve, ou enlève-la." },
  { key: "technique", rules: ["canonical_missing", "canonical_wrong", "hreflang_missing", "hreflang_not_self", "lang_mismatch", "schema_invalid", "duplicate_content", "orphan_page", "low_internal_links", "alt_missing", "image_heavy", "og_is_favicon"], title: "Des réglages techniques sont à compléter",
    why: "Ça ne se voit pas, mais ça aide Google à bien lire ton site.", who: "claude", next: "Claude peut les faire quand il aura accès au code du site." },
];
const WHO = { agent: "L'agent s'en occupe", claude: "À corriger par Claude", toi: "Ta décision" };

export function buildSummary({ run, issues, connections, gsc, pendingSafe, pendingTotal, draftArticles, mode }) {
  const setup = [
    { label: "Statistiques Google", ok: connections.searchConsole, why: "Pour savoir combien de gens te trouvent sur Google." },
    { label: "Soumissions venant de Google", ok: connections.analytics, why: "Pour compter les clients que Google t'amène." },
    { label: "Intelligence artificielle", ok: connections.ai, why: "Pour que l'agent écrive les textes et les articles." },
  ];
  const ready = { suggestions: pendingTotal, safe: pendingSafe, articles: draftArticles };
  const traffic = gsc ? { clicks: gsc.current.clicks, impressions: gsc.current.impressions, previousClicks: gsc.previous.clicks } : null;
  if (!run) return { grade: null, headline: "L'agent n'a pas encore fait sa première vérification.", families: [], setup, ready, traffic, mode, lastCheck: null, pages: 0 };

  const families = FAMILIES.map((f) => {
    const found = issues.filter((i) => f.rules.includes(i.rule));
    return { key: f.key, title: f.title, why: f.why, next: f.next, who: f.who, whoLabel: WHO[f.who], count: found.length, weight: Math.max(0, ...found.map((i) => i.priority)) };
  }).filter((f) => f.count > 0).sort((a, b) => b.weight - a.weight);

  const grade = run.critical > 0 || run.health < 50 ? "urgent" : run.health < 80 ? "moyen" : "bon";
  const headline = { urgent: "Ton site a des problèmes qui nuisent à ta visibilité sur Google.", moyen: "Ton site va correctement, mais il peut attirer plus de clients.", bon: "Ton site est en bonne santé pour Google." }[grade];
  return { grade, headline, families, setup, ready, traffic, mode, lastCheck: run.finished_at, pages: run.pages };
}
