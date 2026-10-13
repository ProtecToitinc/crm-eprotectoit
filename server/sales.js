'use strict';
/**
 * Ventes : relances automatiques, « À traiter maintenant », suivi des soumissions,
 * chantiers (avec photos), rentabilité par projet et tableau de bord Meta Ads.
 */
const fs = require('fs');
const path = require('path');
const db = require('./database');
const { localParts, getSetting, setSetting, getSecret, addHistory } = require('./lib');

const CHANTIER_STATUTS = ['contrat_signe', 'planifie', 'en_cours', 'termine', 'paye'];
const PHOTO_TYPES = ['avant', 'apres', 'inspection', 'autre'];
const DAY = 86400000;
const num = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const r2 = n => Math.round(n * 100) / 100;
const sqlTime = ms => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
const parseSql = s => Date.parse(String(s || '').replace(' ', 'T') + (String(s || '').includes('Z') ? '' : 'Z'));
const imported = q => /import[ée]\s*drive/i.test(q.notes || '');
const nom = c => [c.prenom, c.nom].filter(Boolean).join(' ') || 'Client';

// ---------- relances automatiques ----------
async function upsertTask({ key, titre, description, due_date, due_time, client_id, lead_id, quote_id, opportunite_id, type, priorite = 'normale' }) {
  const exists = await db.get('SELECT id FROM taches WHERE source_key=?', [key]);
  if (exists) return false;
  await db.run('INSERT INTO taches (client_id,opportunite_id,titre,description,due_date,due_time,priorite,type,source_key,lead_id,quote_id,auto) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)',
    [client_id || null, opportunite_id || null, titre, description || null, due_date, due_time || null, priorite, type, key, lead_id || null, quote_id || null]);
  return true;
}
const closeTasks = (where, params) => db.run(`UPDATE taches SET completed=1 WHERE completed=0 AND auto=1 AND ${where}`, params);

async function runRelances() {
  const today = localParts().date, now = Date.now();
  let since = await getSetting('relances_depuis');
  if (!since) { since = sqlTime(now); await setSetting('relances_depuis', since); } // seules les soumissions créées après l'activation génèrent des relances
  let created = 0;

  // 1) Nouveaux leads à rappeler rapidement
  for (const l of await db.all("SELECT * FROM leads WHERE statut='nouveau' AND notifie<>2")) {
    if (await upsertTask({ key: `lead-nouveau:${l.id}`, titre: `Rappeler ${nom(l)} — nouveau lead`, description: [l.telephone, l.campagne].filter(Boolean).join(' · '), due_date: today, client_id: l.client_id, lead_id: l.id, type: 'lead_nouveau', priorite: 'haute' })) created++;
  }
  // 2) Rappels programmés (client injoignable, « à rappeler »)
  for (const l of await db.all("SELECT * FROM leads WHERE statut='a_rappeler' AND rappel_at IS NOT NULL")) {
    const when = parseSql(l.rappel_at);
    if (!Number.isFinite(when)) continue; // Une date invalide ne doit pas interrompre toutes les relances.
    const parts = localParts(new Date(when));
    if (await upsertTask({ key: `lead-rappel:${l.id}:${l.rappel_at}`, titre: `Rappeler ${nom(l)} (tentative ${(l.tentatives || 0) + 1})`, description: l.telephone, due_date: parts.date, due_time: parts.time, client_id: l.client_id, lead_id: l.id, type: 'lead_rappel', priorite: 'haute' })) created++;
  }
  // 3) Client intéressé -> tâche pour avancer
  for (const l of await db.all("SELECT * FROM leads WHERE statut IN ('qualifie','negociation')")) {
    const what = l.statut === 'qualifie' ? 'Planifier l’inspection / envoyer la soumission' : 'Relancer la négociation';
    if (await upsertTask({ key: `lead-interesse:${l.id}:${l.statut}`, titre: `${what} — ${nom(l)}`, due_date: localParts(new Date(now + DAY)).date, client_id: l.client_id, lead_id: l.id, type: 'lead_interesse' })) created++;
  }
  // 4) Soumissions envoyées sans réponse : 2 jours, 6 jours, 14 jours
  const quotes = await db.all(`SELECT q.*, c.prenom, c.nom, o.etape FROM quotes q JOIN clients c ON c.id=q.client_id LEFT JOIN opportunites o ON o.id=q.opportunite_id
    WHERE q.statut='envoyee' AND datetime(q.created_at) >= datetime(?) AND (o.etape IS NULL OR o.etape='soumission')`, [since]);
  for (const q of quotes) {
    const sent = parseSql(q.date_envoi ? q.date_envoi + ' 12:00:00' : q.created_at), age = (now - sent) / DAY;
    for (const [n, days, label] of [[1, 2, 'Relancer'], [2, 6, 'Deuxième relance de'], [3, 14, 'Dernière relance de']]) {
      if (age >= days && await upsertTask({ key: `quote-r${n}:${q.id}`, titre: `${label} la soumission ${q.reference} — ${nom(q)}`, description: `Envoyée il y a ${Math.floor(age)} jours · ${q.montant || 0} $`, due_date: today, client_id: q.client_id, quote_id: q.id, opportunite_id: q.opportunite_id, type: 'soumission_relance', priorite: n === 1 ? 'normale' : 'haute' })) created++;
    }
  }
  // 5) Contrat signé -> chantier à planifier
  for (const o of await db.all(`SELECT o.*, c.prenom, c.nom FROM opportunites o JOIN clients c ON c.id=o.client_id WHERE o.etape='contrat'`)) {
    let ch = await db.get('SELECT id FROM chantiers WHERE opportunite_id=?', [o.id]);
    if (!ch) {
      const quote = await db.get("SELECT id FROM quotes WHERE opportunite_id=? ORDER BY id DESC LIMIT 1", [o.id]);
      const r = await db.run('INSERT INTO chantiers (client_id,opportunite_id,quote_id,titre,statut) VALUES (?,?,?,?,?)', [o.client_id, o.id, quote?.id || null, o.titre, 'contrat_signe']);
      ch = { id: r.lastID }; created++;
      await addHistory(o.client_id, 'chantier', 'Contrat signé : chantier créé, travaux à planifier');
    }
    if (await upsertTask({ key: `chantier-planifier:${o.id}`, titre: `Planifier les travaux — ${nom(o)}`, client_id: o.client_id, opportunite_id: o.id, due_date: localParts(new Date(now + 2 * DAY)).date, type: 'chantier', priorite: 'haute' })) created++;
  }
  // 6) Fermer les tâches automatiques devenues inutiles
  await closeTasks("type='lead_nouveau' AND lead_id IN (SELECT id FROM leads WHERE statut<>'nouveau')", []);
  await closeTasks("type='lead_rappel' AND lead_id IN (SELECT id FROM leads WHERE statut<>'a_rappeler')", []);
  await closeTasks("type='lead_interesse' AND lead_id IN (SELECT id FROM leads WHERE statut NOT IN ('qualifie','negociation'))", []);
  await closeTasks("type='soumission_relance' AND quote_id IN (SELECT id FROM quotes WHERE statut<>'envoyee')", []);
  await closeTasks("type='chantier' AND opportunite_id IN (SELECT opportunite_id FROM chantiers WHERE statut<>'contrat_signe')", []);
  await closeTasks("type='chantier' AND opportunite_id IN (SELECT id FROM opportunites WHERE etape<>'contrat')", []);
  return { created };
}

// ---------- À traiter maintenant ----------
async function attention() {
  const today = localParts().date;
  const [leadsNouveaux, rappelsLeads, tachesRetard, appels, factures, chantiers, quotes] = await Promise.all([
    db.all("SELECT id,prenom,nom,telephone,ville,campagne,recu_at,en_charge FROM leads WHERE statut='nouveau' ORDER BY datetime(recu_at) DESC LIMIT 50"),
    db.all("SELECT id,prenom,nom,telephone,rappel_at,tentatives,en_charge FROM leads WHERE statut='a_rappeler' AND (rappel_at IS NULL OR datetime(rappel_at)<=datetime('now')) ORDER BY rappel_at LIMIT 50"),
    db.all("SELECT t.id,t.titre,t.due_date,t.priorite,t.client_id,c.prenom,c.nom FROM taches t LEFT JOIN clients c ON c.id=t.client_id WHERE t.completed=0 AND t.due_date IS NOT NULL AND t.due_date<=? ORDER BY t.due_date LIMIT 100", [today]),
    db.all("SELECT a.id,a.client_id,a.rappel_date,a.sujet,c.prenom,c.nom,c.telephone FROM appels a JOIN clients c ON c.id=a.client_id WHERE a.a_rappeler=1 AND a.rappel_fait=0 AND (a.rappel_date IS NULL OR a.rappel_date<=?) ORDER BY a.rappel_date LIMIT 50", [today]),
    db.all("SELECT i.id,i.reference,i.montant,i.date_echeance,i.client_id,c.prenom,c.nom FROM invoices i JOIN clients c ON c.id=i.client_id WHERE i.statut='en_retard' OR (i.statut='en_attente' AND i.date_echeance IS NOT NULL AND i.date_echeance<?) ORDER BY i.date_echeance LIMIT 50", [today]),
    db.all("SELECT ch.id,ch.titre,ch.client_id,c.prenom,c.nom FROM chantiers ch JOIN clients c ON c.id=ch.client_id WHERE ch.statut='contrat_signe' ORDER BY ch.id DESC LIMIT 50"),
    db.all(`SELECT q.id,q.reference,q.montant,q.client_id,q.created_at,q.date_envoi,q.prochain_suivi,q.notes,c.prenom,c.nom FROM quotes q JOIN clients c ON c.id=q.client_id LEFT JOIN opportunites o ON o.id=q.opportunite_id
      WHERE q.statut='envoyee' AND (o.etape IS NULL OR o.etape='soumission') AND ((q.prochain_suivi IS NOT NULL AND q.prochain_suivi<=?) OR (q.prochain_suivi IS NULL AND datetime(q.created_at)<=datetime('now','-2 days') AND COALESCE(q.notes,'') NOT LIKE '%mport%Drive%')) ORDER BY q.created_at LIMIT 50`, [today])
  ]);
  const groups = {
    leads_nouveaux: leadsNouveaux, leads_a_rappeler: rappelsLeads, taches: tachesRetard, appels_a_rappeler: appels,
    soumissions_a_relancer: quotes, factures_en_retard: factures, chantiers_a_planifier: chantiers
  };
  return { total: Object.values(groups).reduce((n, g) => n + g.length, 0), ...groups };
}

// ---------- suivi des soumissions ----------
async function suiviSoumissions() {
  const rows = await db.all(`SELECT q.*, c.prenom, c.nom, c.telephone, o.etape, o.titre AS opp_titre FROM quotes q JOIN clients c ON c.id=q.client_id LEFT JOIN opportunites o ON o.id=q.opportunite_id ORDER BY q.created_at DESC`);
  const now = Date.now();
  const relances = Object.fromEntries((await db.all("SELECT quote_id, COUNT(*) n FROM taches WHERE quote_id IS NOT NULL AND type='soumission_relance' GROUP BY quote_id")).map(r => [r.quote_id, r.n]));
  const enAttente = rows.filter(q => ['envoyee', 'brouillon'].includes(q.statut) && (!q.etape || q.etape === 'soumission')).map(q => {
    const known = !imported(q);
    const sent = q.date_envoi ? Date.parse(q.date_envoi) : parseSql(q.created_at);
    return { id: q.id, reference: q.reference, client_id: q.client_id, client: nom(q), telephone: q.telephone, montant: q.montant || 0, statut: q.statut, date_envoi: q.date_envoi || (known ? String(q.created_at).slice(0, 10) : null), jours: known || q.date_envoi ? Math.floor((now - sent) / DAY) : null, prochain_suivi: q.prochain_suivi, relances: relances[q.id] || 0, importee: !known };
  });
  const perdues = rows.filter(q => q.statut === 'refusee');
  const raisons = {};
  for (const q of perdues) { const k = (q.raison_perte || 'Non précisée').trim() || 'Non précisée'; raisons[k] = (raisons[k] || 0) + 1; }
  const gagnees = rows.filter(q => q.statut === 'acceptee'), envoyees = rows.filter(q => ['envoyee', 'acceptee', 'refusee'].includes(q.statut));
  const mois = {};
  for (const q of envoyees) { const m = String(q.created_at).slice(0, 7); (mois[m] = mois[m] || { mois: m, envoyees: 0, acceptees: 0 }); mois[m].envoyees++; if (q.statut === 'acceptee') mois[m].acceptees++; }
  return {
    en_attente: enAttente, nb_en_attente: enAttente.length, valeur_en_attente: r2(enAttente.reduce((s, q) => s + q.montant, 0)),
    raisons: Object.entries(raisons).map(([raison, n]) => ({ raison, n })).sort((a, b) => b.n - a.n),
    nb_perdues: perdues.length, valeur_perdue: r2(perdues.reduce((s, q) => s + (q.montant || 0), 0)),
    nb_acceptees: gagnees.length, valeur_acceptee: r2(gagnees.reduce((s, q) => s + (q.montant || 0), 0)),
    taux_conversion: envoyees.length ? r2(gagnees.length / envoyees.length * 100) : 0,
    par_mois: Object.values(mois).sort((a, b) => a.mois.localeCompare(b.mois)).slice(-12)
  };
}

// ---------- rentabilité ----------
function computeRentabilite(r, opp) {
  const superficie = num(r.superficie_pi2), prix = num(r.prix_pi2);
  const revenu = num(r.revenu) ?? (superficie != null && prix != null ? r2(superficie * prix) : null) ?? num(opp?.valeur) ?? 0;
  const cout = r2(['cout_produits', 'main_oeuvre', 'deplacement', 'autres'].reduce((s, k) => s + (num(r[k]) || 0), 0));
  const profit = r2(revenu - cout);
  return { revenu, cout_total: cout, profit_brut: profit, marge_pct: revenu > 0 ? r2(profit / revenu * 100) : null };
}

// ---------- publicités Meta ----------
const GRAPH = /^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION || '') ? process.env.META_GRAPH_VERSION : 'v23.0';
async function syncAdSpend() {
  const account = (await getSetting('meta_ad_account_id') || '').replace(/^act_/, '');
  const token = (await getSecret('meta_ads_token')) || (await getSecret('meta_page_token'));
  if (!account || !token) return { ok: false, message: 'Compte publicitaire Meta non configuré' };
  try {
    const until = localParts().date, since = localParts(new Date(Date.now() - 90 * DAY)).date;
    let url = new URL(`https://graph.facebook.com/${GRAPH}/act_${account}/insights`);
    url.search = new URLSearchParams({ level: 'campaign', time_increment: '1', fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions', time_range: JSON.stringify({ since, until }), limit: '500' }).toString();
    let rows = 0;
    for (let page = 0; page < 40 && url; page++) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error?.code === 190 ? 'Jeton Meta expiré : reconnecter Meta' : `Meta a refusé l’accès aux données publicitaires : ${String(data.error?.message || res.status).slice(0, 160)}`);
      for (const d of data.data || []) {
        const leads = (d.actions || []).filter(a => /^(lead|onsite_conversion\.lead_grouped)$/.test(a.action_type)).reduce((m, a) => Math.max(m, Number(a.value) || 0), 0);
        await db.run(`INSERT INTO ad_spend (date,campaign_id,campaign_name,spend,impressions,clicks,leads,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'))
          ON CONFLICT(date,campaign_id) DO UPDATE SET campaign_name=excluded.campaign_name,spend=excluded.spend,impressions=excluded.impressions,clicks=excluded.clicks,leads=excluded.leads,updated_at=datetime('now')`,
          [d.date_start, d.campaign_id, d.campaign_name, Number(d.spend) || 0, Number(d.impressions) || 0, Number(d.clicks) || 0, leads]);
        rows++;
      }
      url = data.paging?.next ? new URL(data.paging.next) : null;
    }
    await setSetting('ads_last_ok', new Date().toISOString()); await setSetting('ads_last_error', '');
    return { ok: true, rows };
  } catch (e) { await setSetting('ads_last_error', String(e.message).slice(0, 300)); return { ok: false, message: String(e.message).slice(0, 300) }; }
}
/** Chaque client est rattaché à la campagne de son PREMIER lead : les ventes sont reliées aux publicités, pas seulement aux formulaires. */
async function adsDashboard(from, to) {
  const f = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : '2000-01-01', t = /^\d{4}-\d{2}-\d{2}$/.test(to || '') ? to : '2999-12-31';
  const leads = await db.all("SELECT * FROM leads WHERE source IN ('meta','webhook') AND date(recu_at)>=? AND date(recu_at)<=? ORDER BY datetime(recu_at)", [f, t]);
  const spend = await db.all('SELECT campaign_id, campaign_name, SUM(spend) spend, SUM(impressions) impressions, SUM(clicks) clicks FROM ad_spend WHERE date>=? AND date<=? GROUP BY campaign_id', [f, t]);
  const quotes = await db.all("SELECT client_id,statut,montant FROM quotes WHERE client_id IS NOT NULL");
  const opps = await db.all("SELECT client_id,etape,valeur FROM opportunites");
  const firstLeadOfClient = new Map();
  for (const l of await db.all("SELECT * FROM leads WHERE client_id IS NOT NULL ORDER BY datetime(recu_at)")) if (!firstLeadOfClient.has(l.client_id)) firstLeadOfClient.set(l.client_id, l);
  const keyOf = l => l.campaign_id || `nom:${l.campagne || 'Sans campagne'}`;
  const camp = new Map();
  const get = (k, name) => { if (!camp.has(k)) camp.set(k, { campaign_id: k.startsWith('nom:') ? null : k, campagne: name || 'Sans campagne', leads: 0, clients: 0, soumissions: 0, contrats: 0, ca: 0, depense: null, impressions: null, clics: null }); return camp.get(k); };
  for (const l of leads) { const c = get(keyOf(l), l.campagne); c.leads++; }
  for (const [clientId, l] of firstLeadOfClient) {
    if (!(String(l.recu_at).slice(0, 10) >= f && String(l.recu_at).slice(0, 10) <= t)) continue;
    const c = get(keyOf(l), l.campagne); c.clients++;
    c.soumissions += quotes.filter(q => q.client_id === clientId && ['envoyee', 'acceptee', 'refusee'].includes(q.statut)).length;
    const won = opps.filter(o => o.client_id === clientId && ['contrat', 'complete'].includes(o.etape));
    if (won.length) { c.contrats += won.length; c.ca += won.reduce((s, o) => s + (o.valeur || 0), 0); }
  }
  for (const s of spend) {
    const k = camp.has(s.campaign_id) ? s.campaign_id : [...camp.entries()].find(([kk, v]) => !v.campaign_id && v.campagne === s.campaign_name)?.[0] || s.campaign_id;
    const c = get(k, s.campaign_name); c.campaign_id = s.campaign_id; c.depense = (c.depense || 0) + s.spend; c.impressions = s.impressions; c.clics = s.clicks;
  }
  const rows = [...camp.values()].map(c => ({
    ...c, ca: r2(c.ca), depense: c.depense == null ? null : r2(c.depense),
    cout_par_lead: c.depense != null && c.leads ? r2(c.depense / c.leads) : null,
    cout_acquisition: c.depense != null && c.contrats ? r2(c.depense / c.contrats) : null,
    rendement: c.depense ? r2(c.ca / c.depense) : null,
    taux_contrat: c.leads ? r2(c.contrats / c.leads * 100) : 0
  })).sort((a, b) => b.leads - a.leads);
  const sum = k => rows.reduce((s, r) => s + (r[k] || 0), 0), dep = rows.some(r => r.depense != null) ? sum('depense') : null;
  return {
    campagnes: rows,
    totaux: { leads: sum('leads'), clients: sum('clients'), soumissions: sum('soumissions'), contrats: sum('contrats'), ca: r2(sum('ca')), depense: dep == null ? null : r2(dep), cout_par_lead: dep != null && sum('leads') ? r2(dep / sum('leads')) : null, cout_acquisition: dep != null && sum('contrats') ? r2(dep / sum('contrats')) : null, rendement: dep ? r2(sum('ca') / dep) : null },
    donnees_publicitaires: rows.some(r => r.depense != null), derniere_synchro: await getSetting('ads_last_ok'), derniere_erreur: await getSetting('ads_last_error')
  };
}

function register(app, { auth, upload, uploadsDir }) {
  app.get('/api/attention', auth, async (req, res) => res.json(await attention()));
  app.post('/api/relances/run', auth, async (req, res) => res.json(await runRelances()));
  app.get('/api/suivi-soumissions', auth, async (req, res) => res.json(await suiviSoumissions()));
  app.post('/api/quotes/:id/envoyee', auth, async (req, res) => {
    const r = await db.run("UPDATE quotes SET statut='envoyee', date_envoi=COALESCE(?,date(?)), updated_at=datetime('now') WHERE id=?", [req.body?.date_envoi || null, 'now', req.params.id]);
    res.status(r.changes ? 200 : 404).json({ ok: !!r.changes });
  });
  app.post('/api/quotes/:id/suivi', auth, async (req, res) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.prochain_suivi || '') ? req.body.prochain_suivi : null;
    const q = await db.get('SELECT * FROM quotes WHERE id=?', [req.params.id]);
    if (!q) return res.status(404).json({ message: 'Soumission introuvable' });
    await db.run('UPDATE quotes SET prochain_suivi=? WHERE id=?', [date, q.id]);
    if (req.body?.note) await db.run('INSERT INTO notes (client_id,titre,contenu) VALUES (?,?,?)', [q.client_id, `Suivi ${q.reference}`, String(req.body.note).slice(0, 4000)]);
    await addHistory(q.client_id, 'soumission', `Suivi de ${q.reference}${date ? ` programmé le ${date}` : ''}`);
    res.json({ ok: true });
  });
  app.post('/api/quotes/:id/perdue', auth, async (req, res) => {
    const q = await db.get('SELECT * FROM quotes WHERE id=?', [req.params.id]);
    if (!q) return res.status(404).json({ message: 'Soumission introuvable' });
    const raison = String(req.body?.raison || '').trim().slice(0, 200) || null;
    await db.run("UPDATE quotes SET statut='refusee', raison_perte=?, prochain_suivi=NULL, updated_at=datetime('now') WHERE id=?", [raison, q.id]);
    await addHistory(q.client_id, 'soumission', `Soumission ${q.reference} perdue${raison ? ` : ${raison}` : ''}`);
    res.json({ ok: true });
  });

  // Chantiers
  const chantierSql = `SELECT ch.*, c.prenom, c.nom, c.telephone, c.adresse, c.ville, o.valeur, (SELECT COUNT(*) FROM chantier_photos p WHERE p.chantier_id=ch.id) AS nb_photos
    FROM chantiers ch JOIN clients c ON c.id=ch.client_id LEFT JOIN opportunites o ON o.id=ch.opportunite_id`;
  app.get('/api/chantiers', auth, async (req, res) => res.json(await db.all(`${chantierSql} ORDER BY CASE ch.statut WHEN 'en_cours' THEN 0 WHEN 'planifie' THEN 1 WHEN 'contrat_signe' THEN 2 WHEN 'termine' THEN 3 ELSE 4 END, ch.date_debut, ch.id DESC`)));
  app.get('/api/chantiers/:id', auth, async (req, res) => {
    const ch = await db.get(`${chantierSql} WHERE ch.id=?`, [req.params.id]);
    if (!ch) return res.status(404).json({ message: 'Chantier introuvable' });
    res.json({ ...ch, photos: await db.all('SELECT * FROM chantier_photos WHERE chantier_id=? ORDER BY id DESC', [ch.id]) });
  });
  app.post('/api/chantiers', auth, async (req, res) => {
    const { client_id, opportunite_id, titre } = req.body || {};
    if (!client_id || !(await db.get('SELECT id FROM clients WHERE id=?', [client_id]))) return res.status(400).json({ message: 'Client requis' });
    const r = await db.run('INSERT INTO chantiers (client_id,opportunite_id,titre,statut) VALUES (?,?,?,?)', [client_id, opportunite_id || null, String(titre || 'Chantier').slice(0, 200), 'contrat_signe']);
    res.status(201).json({ id: r.lastID });
  });
  app.put('/api/chantiers/:id', auth, async (req, res) => {
    const cur = await db.get('SELECT * FROM chantiers WHERE id=?', [req.params.id]);
    if (!cur) return res.status(404).json({ message: 'Chantier introuvable' });
    const b = req.body || {};
    if ('statut' in b && !CHANTIER_STATUTS.includes(b.statut)) return res.status(400).json({ message: 'Statut invalide' });
    const pick = k => (k in b ? (b[k] === '' ? null : b[k]) : cur[k]);
    await db.run("UPDATE chantiers SET titre=?,statut=?,date_debut=?,date_fin=?,notes_inspection=?,materiaux=?,updated_at=datetime('now') WHERE id=?",
      [pick('titre') || cur.titre, pick('statut'), pick('date_debut'), pick('date_fin'), pick('notes_inspection'), pick('materiaux'), cur.id]);
    if (b.statut && b.statut !== cur.statut) {
      await addHistory(cur.client_id, 'chantier', `Chantier : ${cur.statut} → ${b.statut}`);
      if (cur.opportunite_id) {
        if (['termine', 'paye'].includes(b.statut)) await db.run("UPDATE opportunites SET etape='complete', updated_at=datetime('now') WHERE id=? AND etape<>'complete'", [cur.opportunite_id]);
        else if (['planifie', 'en_cours'].includes(b.statut)) await db.run("UPDATE opportunites SET etape='contrat', updated_at=datetime('now') WHERE id=? AND etape IN ('lead','soumission','rdv')", [cur.opportunite_id]);
      }
    }
    res.json({ ok: true });
  });
  app.delete('/api/chantiers/:id', auth, async (req, res) => { await db.run('DELETE FROM chantiers WHERE id=?', [req.params.id]); res.json({ ok: true }); });
  app.post('/api/chantiers/:id/photos', auth, upload.single('file'), async (req, res) => {
    const ch = await db.get('SELECT id,client_id FROM chantiers WHERE id=?', [req.params.id]);
    if (!ch) { if (req.file) fs.rmSync(req.file.path, { force: true }); return res.status(404).json({ message: 'Chantier introuvable' }); }
    if (!req.file) return res.status(400).json({ message: 'Photo manquante' });
    if (!/^image\//.test(req.file.mimetype)) { fs.rmSync(req.file.path, { force: true }); return res.status(400).json({ message: 'Seules les images sont acceptées' }); }
    const type = PHOTO_TYPES.includes(req.body?.type) ? req.body.type : 'autre';
    const r = await db.run('INSERT INTO chantier_photos (chantier_id,type,chemin,legende) VALUES (?,?,?,?)', [ch.id, type, path.basename(req.file.filename), String(req.body?.legende || '').slice(0, 300) || null]);
    res.status(201).json({ id: r.lastID, chemin: path.basename(req.file.filename) });
  });
  app.delete('/api/chantiers/:id/photos/:photoId', auth, async (req, res) => {
    const p = await db.get('SELECT * FROM chantier_photos WHERE id=? AND chantier_id=?', [req.params.photoId, req.params.id]);
    if (p) { fs.rmSync(path.join(uploadsDir, path.basename(p.chemin)), { force: true }); await db.run('DELETE FROM chantier_photos WHERE id=?', [p.id]); }
    res.json({ ok: true });
  });

  // Rentabilité
  app.get('/api/rentabilite', auth, async (req, res) => {
    const rows = await db.all(`SELECT r.*, o.titre, o.valeur, o.etape, o.client_id, c.prenom, c.nom FROM rentabilite r JOIN opportunites o ON o.id=r.opportunite_id JOIN clients c ON c.id=o.client_id ORDER BY r.updated_at DESC`);
    const list = rows.map(r => ({ ...r, ...computeRentabilite(r, r) }));
    const rev = list.reduce((s, r) => s + r.revenu, 0), profit = list.reduce((s, r) => s + r.profit_brut, 0);
    res.json({ projets: list, totaux: { revenu: r2(rev), profit_brut: r2(profit), marge_pct: rev > 0 ? r2(profit / rev * 100) : null, nb: list.length } });
  });
  app.get('/api/rentabilite/:oppId', auth, async (req, res) => {
    const opp = await db.get('SELECT * FROM opportunites WHERE id=?', [req.params.oppId]);
    if (!opp) return res.status(404).json({ message: 'Projet introuvable' });
    const r = (await db.get('SELECT * FROM rentabilite WHERE opportunite_id=?', [opp.id])) || { opportunite_id: opp.id };
    const sup = (await db.get('SELECT superficie_m2 FROM toitures WHERE client_id=?', [opp.client_id]))?.superficie_m2;
    res.json({ ...r, superficie_suggeree_pi2: sup ? r2(sup / 0.09290304) : null, ...computeRentabilite(r, opp) });
  });
  app.put('/api/rentabilite/:oppId', auth, async (req, res) => {
    const opp = await db.get('SELECT * FROM opportunites WHERE id=?', [req.params.oppId]);
    if (!opp) return res.status(404).json({ message: 'Projet introuvable' });
    const b = req.body || {}, v = {};
    for (const k of ['superficie_pi2', 'prix_pi2', 'revenu', 'cout_produits', 'main_oeuvre', 'deplacement', 'autres']) {
      v[k] = num(b[k]);
      if (v[k] != null && v[k] < 0) return res.status(400).json({ message: `${k} ne peut pas être négatif` });
    }
    await db.run(`INSERT INTO rentabilite (opportunite_id,superficie_pi2,prix_pi2,revenu,cout_produits,main_oeuvre,deplacement,autres,notes,updated_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(opportunite_id) DO UPDATE SET superficie_pi2=excluded.superficie_pi2,prix_pi2=excluded.prix_pi2,revenu=excluded.revenu,cout_produits=excluded.cout_produits,main_oeuvre=excluded.main_oeuvre,deplacement=excluded.deplacement,autres=excluded.autres,notes=excluded.notes,updated_at=datetime('now')`,
      [opp.id, v.superficie_pi2, v.prix_pi2, v.revenu, v.cout_produits ?? 0, v.main_oeuvre ?? 0, v.deplacement ?? 0, v.autres ?? 0, String(b.notes || '').slice(0, 2000) || null]);
    res.json({ ok: true, ...computeRentabilite({ ...v }, opp) });
  });

  // Meta Ads
  app.get('/api/ads/dashboard', auth, async (req, res) => res.json(await adsDashboard(req.query.from, req.query.to)));
  app.post('/api/ads/sync', auth, async (req, res) => res.json(await syncAdSpend()));
}

function startJobs() {
  const safe = fn => async () => { try { await fn(); } catch (e) { console.error('[ventes] tâche en erreur :', e.message); } };
  const every = (fn, ms, first) => { setInterval(safe(fn), ms).unref?.(); if (first) setTimeout(safe(fn), first).unref?.(); };
  every(runRelances, 10 * 60 * 1000, 45 * 1000);
  every(syncAdSpend, 6 * 3600 * 1000, 2 * 60 * 1000);
}
module.exports = { register, startJobs, runRelances, attention, suiviSoumissions, computeRentabilite, adsDashboard, syncAdSpend };
