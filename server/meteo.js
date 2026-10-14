'use strict';
/**
 * Météo (Open-Meteo, sans clé) et rappel de la veille des travaux.
 * - prévisions 8 jours pour une ville (cache 30 min), verdict « bon / moyen / mauvais » pour travailler sur un toit
 * - rappel au client la veille : message prêt (consigne « dégager l'entrée devant la maison »), envoi courriel sur clic
 *   ou automatique si l'interrupteur « rappel_veille_auto » est activé (désactivé par défaut)
 */
const db = require('./database');
const google = require('./google');
const { localParts, getSetting, setSetting, addHistory } = require('./lib');

const TZ = 'America/Toronto';
const TTL = 30 * 60 * 1000;
const DEFAULT_VILLE = 'Québec';
const cache = new Map();
const nom = c => [c.prenom, c.nom].filter(Boolean).join(' ') || 'Client';

async function getJson(url) {
  if (process.env.METEO_FAKE) return JSON.parse(process.env.METEO_FAKE)[url.includes('geocoding') ? 'geo' : 'forecast'];
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Service météo indisponible (${res.status})`);
  const data = await res.json();
  cache.set(url, { at: Date.now(), data });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return data;
}

// Codes météo WMO -> libellé et catégorie
function codeInfo(code) {
  const c = Number(code);
  if (c === 0) return ['Ciel dégagé', 'ok'];
  if (c === 1 || c === 2) return ['Partiellement nuageux', 'ok'];
  if (c === 3) return ['Couvert', 'ok'];
  if (c === 45 || c === 48) return ['Brouillard', 'ok'];
  if (c >= 51 && c <= 57) return ['Bruine', 'pluie'];
  if (c >= 61 && c <= 67) return [c >= 66 ? 'Pluie verglaçante' : 'Pluie', 'pluie'];
  if (c >= 71 && c <= 77) return ['Neige', 'neige'];
  if (c >= 80 && c <= 82) return ['Averses', 'pluie'];
  if (c === 85 || c === 86) return ['Averses de neige', 'neige'];
  if (c >= 95) return ['Orage', 'orage'];
  return ['Variable', 'ok'];
}

// Peut-on travailler sur un toit ce jour-là ?
function assess(j) {
  const raisons = [];
  const [, cat] = codeInfo(j.code);
  const wet = cat === 'pluie' || cat === 'neige' || cat === 'orage' || j.precip_mm >= 2 || j.prob >= 60;
  if (cat === 'orage') raisons.push('Orage prévu');
  else if (wet) raisons.push(`${cat === 'neige' ? 'Neige' : 'Précipitations'} prévues (${j.precip_mm ?? 0} mm, ${j.prob ?? 0} %)`);
  if (j.vent >= 40) raisons.push(`Vent fort (${Math.round(j.vent)} km/h)`);
  if (j.tmax != null && j.tmax < 5) raisons.push(`Froid (max ${Math.round(j.tmax)} °C)`);
  const mauvais = cat === 'orage' || (j.precip_mm || 0) >= 5 || (j.prob || 0) >= 70 || (j.vent || 0) >= 50 || cat === 'neige';
  return { verdict: mauvais ? 'mauvais' : raisons.length ? 'moyen' : 'bon', raisons };
}

async function geocode(ville) {
  const name = String(ville || '').trim() || DEFAULT_VILLE;
  const d = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=fr&countryCode=CA`);
  const r = d?.results?.[0];
  if (!r) return null;
  return { lat: r.latitude, lon: r.longitude, lieu: [r.name, r.admin1].filter(Boolean).join(', ') };
}

async function forecast(ville) {
  const geo = await geocode(ville);
  if (!geo) throw new Error(`Ville introuvable : ${ville}`);
  const d = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,precipitation,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,snowfall_sum&timezone=${encodeURIComponent(TZ)}&forecast_days=8&wind_speed_unit=kmh`);
  const cur = d.current || {};
  const jours = (d.daily?.time || []).map((date, i) => {
    const j = { date, code: d.daily.weather_code[i], tmax: d.daily.temperature_2m_max[i], tmin: d.daily.temperature_2m_min[i], precip_mm: d.daily.precipitation_sum[i], prob: d.daily.precipitation_probability_max?.[i], vent: d.daily.wind_speed_10m_max[i], neige_cm: d.daily.snowfall_sum?.[i] };
    return { ...j, label: codeInfo(j.code)[0], ...assess(j) };
  });
  return { lieu: geo.lieu, maintenant: { temp: cur.temperature_2m, precip_mm: cur.precipitation, vent: cur.wind_speed_10m, code: cur.weather_code, label: codeInfo(cur.weather_code)[0] }, jours };
}

const defaultVille = async () => (await getSetting('meteo_ville')) || DEFAULT_VILLE;
const longDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });

/** Message du rappel de la veille. `jour` = prévision du jour des travaux (facultatif). */
function buildReminder(ch, jour) {
  const prenom = ch.prenom || 'Bonjour';
  const lignes = [
    `Bonjour${ch.prenom ? ' ' + prenom : ''},`, '',
    `Petit rappel : nos équipes seront chez vous demain, ${longDate(ch.date_debut)}, pour vos travaux${ch.titre ? ` (${ch.titre})` : ''}.`, '',
    'Pour que tout se déroule bien :',
    '• Veuillez dégager l’entrée devant la maison (déplacer les voitures) afin que nos véhicules et notre matériel puissent s’approcher.'
  ];
  if (jour) {
    lignes.push('', `Météo prévue : ${jour.label.toLowerCase()}, ${Math.round(jour.tmax)} °C${jour.prob != null ? `, risque de précipitations ${jour.prob} %` : ''}.`);
    if (jour.verdict !== 'bon') lignes.push('Si la météo nous oblige à reporter, nous vous appellerons rapidement pour convenir d’une nouvelle date.');
  }
  lignes.push('', 'Merci de votre collaboration!', 'L’équipe ProtecToit');
  const text = lignes.join('\n');
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${esc(text).replace(/\n/g, '<br>')}</div>`;
  return { subject: 'Rappel : vos travaux de toiture demain — ProtecToit', text, html };
}

async function jourPour(ch) {
  try {
    const f = await forecast(ch.ville || (await defaultVille()));
    return f.jours.find(j => j.date === ch.date_debut) || null;
  } catch { return null; }
}

const chantierRow = id => db.get('SELECT ch.*, c.prenom, c.nom, c.email, c.telephone, c.ville FROM chantiers ch JOIN clients c ON c.id=ch.client_id WHERE ch.id=?', [id]);

/** Envoie le rappel par courriel (une seule fois par chantier) et ferme la tâche liée. */
async function sendReminder(ch, par) {
  if (!ch.email) throw Object.assign(new Error('Ce client n’a pas de courriel : appelle-le ou copie le message.'), { status: 400 });
  if (!ch.date_debut) throw Object.assign(new Error('Ce chantier n’a pas de date de début.'), { status: 400 });
  const m = buildReminder(ch, await jourPour(ch));
  await google.sendMail({ to: ch.email, subject: m.subject, text: m.text, html: m.html });
  await db.run("UPDATE chantiers SET rappel_envoye_at=datetime('now'), updated_at=datetime('now') WHERE id=?", [ch.id]);
  await db.run("UPDATE taches SET completed=1 WHERE completed=0 AND source_key LIKE ?", [`chantier-veille:${ch.id}:%`]);
  await addHistory(ch.client_id, 'chantier', `Rappel de la veille envoyé par courriel${par ? ` (${par})` : ''}`);
}

function register(app, { auth }) {
  app.get('/api/meteo', auth, async (req, res) => {
    try { res.json(await forecast(String(req.query.ville || '').trim() || (await defaultVille()))); }
    catch (e) { res.status(502).json({ message: e.message || 'Météo indisponible' }); }
  });
  app.get('/api/meteo/ville', auth, async (req, res) => res.json({ ville: await defaultVille() }));
  app.put('/api/meteo/ville', auth, async (req, res) => {
    const ville = String(req.body?.ville || '').trim().slice(0, 80);
    if (!ville) return res.status(400).json({ message: 'Entre une ville' });
    try { if (!(await geocode(ville))) return res.status(400).json({ message: `Ville introuvable : ${ville}` }); }
    catch (e) { return res.status(502).json({ message: e.message }); }
    await setSetting('meteo_ville', ville);
    res.json({ ville });
  });
  // Prévision pour chaque chantier à venir (8 jours)
  app.get('/api/meteo/chantiers', auth, async (req, res) => {
    const today = localParts().date, end = localParts(new Date(Date.now() + 8 * 86400000)).date;
    const rows = await db.all(`SELECT ch.id, ch.date_debut, ch.statut, ch.titre, c.prenom, c.nom, c.ville FROM chantiers ch JOIN clients c ON c.id=ch.client_id
      WHERE ch.date_debut >= ? AND ch.date_debut <= ? AND ch.statut IN ('contrat_signe','planifie','en_cours') ORDER BY ch.date_debut`, [today, end]);
    const out = [];
    for (const r of rows) out.push({ ...r, jour: await jourPour(r) });
    res.json(out);
  });
  app.get('/api/chantiers/:id/rappel', auth, async (req, res) => {
    const ch = await chantierRow(req.params.id);
    if (!ch) return res.status(404).json({ message: 'Chantier introuvable' });
    if (!ch.date_debut) return res.json({ pret: false, message: 'Ajoute une date de début pour préparer le rappel.' });
    const jour = await jourPour(ch);
    res.json({ pret: true, to: ch.email || null, envoye_at: ch.rappel_envoye_at || null, meteo: jour, ...buildReminder(ch, jour) });
  });
  app.post('/api/chantiers/:id/rappel/envoyer', auth, async (req, res) => {
    const ch = await chantierRow(req.params.id);
    if (!ch) return res.status(404).json({ message: 'Chantier introuvable' });
    try { await sendReminder(ch, req.session?.user); res.json({ ok: true }); }
    catch (e) { res.status(e.status || 502).json({ message: e.message || 'Envoi impossible' }); }
  });
  app.get('/api/rappels/veille/config', auth, async (req, res) => res.json({ auto: (await getSetting('rappel_veille_auto')) === '1' }));
  app.put('/api/rappels/veille/config', auth, async (req, res) => { await setSetting('rappel_veille_auto', req.body?.auto ? '1' : '0'); res.json({ auto: !!req.body?.auto }); });
}

module.exports = { register, forecast, assess, buildReminder, jourPour, sendReminder, codeInfo, nom };
