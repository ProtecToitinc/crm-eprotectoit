const { google } = require('googleapis');
const db = require('./database');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google/callback';
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const CRM_CALENDAR_NAME = 'CRM ProtecToit';

function configured() {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

function oauthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

async function getStoredTokens() {
  const row = await db.get('SELECT value FROM settings WHERE key = ?', ['google_tokens']);
  return row ? JSON.parse(row.value) : null;
}

async function saveTokens(tokens) {
  await db.run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    ['google_tokens', JSON.stringify(tokens)]);
}

async function getAuthedClient() {
  if (!configured()) return null;
  const tokens = await getStoredTokens();
  if (!tokens) return null;
  const client = oauthClient();
  client.setCredentials(tokens);
  client.on('tokens', async (newTokens) => {
    await saveTokens({ ...tokens, ...newTokens });
  });
  return client;
}

function getAuthUrl() {
  if (!configured()) throw new Error('Google Calendar non configuré (variables GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET manquantes)');
  const client = oauthClient();
  return client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
}

async function handleCallback(code) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  await saveTokens(tokens);
}

async function disconnect() {
  await db.run('DELETE FROM settings WHERE key = ?', ['google_tokens']);
  await db.run('DELETE FROM settings WHERE key = ?', ['google_calendar_id']);
  await db.run('UPDATE evenements SET google_event_id = NULL');
}

async function status() {
  const tokens = await getStoredTokens();
  const calendarId = tokens ? await getActiveCalendarId() : null;
  return { configured: configured(), connected: !!tokens, calendarSelected: !!calendarId };
}

function calendarApi(client) {
  return google.calendar({ version: 'v3', auth: client });
}

async function getActiveCalendarId() {
  const row = await db.get('SELECT value FROM settings WHERE key = ?', ['google_calendar_id']);
  return row ? row.value : null;
}

async function setCalendarId(calendarId) {
  await db.run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    ['google_calendar_id', calendarId]);
}

// Liste les calendriers Google de l'utilisateur pour qu'il choisisse lequel utiliser
// (au lieu d'imposer l'agenda principal, qui contiendrait des événements personnels).
async function listCalendars() {
  const client = await getAuthedClient();
  if (!client) return [];
  const cal = calendarApi(client);
  const { data } = await cal.calendarList.list({ minAccessRole: 'writer' });
  const activeId = await getActiveCalendarId();
  return (data.items || []).map(c => ({
    id: c.id, name: c.summary, primary: !!c.primary, selected: c.id === activeId
  }));
}

async function createDedicatedCalendar() {
  const client = await getAuthedClient();
  if (!client) throw new Error('Google Calendar non connecté');
  const cal = calendarApi(client);
  const created = await cal.calendars.insert({ requestBody: { summary: CRM_CALENDAR_NAME, timeZone: 'America/Toronto' } });
  await setCalendarId(created.data.id);
  return created.data.id;
}

function eventTitle(ev) {
  const who = ev.nom ? `${ev.prenom || ''} ${ev.nom}`.trim() : '';
  return who ? `${ev.titre} — ${who}` : ev.titre;
}

function toGoogleEvent(ev) {
  const date = ev.date_debut;
  const time = ev.heure || '09:00';
  const start = `${date}T${time}:00`;
  const startDate = new Date(start);
  const end = new Date(startDate.getTime() + 60 * 60 * 1000);
  return {
    summary: eventTitle(ev),
    description: ev.ville ? `Secteur : ${ev.ville}` : undefined,
    start: { dateTime: startDate.toISOString() },
    end: { dateTime: end.toISOString() }
  };
}

async function syncEventOut(ev) {
  const client = await getAuthedClient();
  const calendarId = await getActiveCalendarId();
  if (!client || !calendarId) return;
  const cal = calendarApi(client);
  const body = toGoogleEvent(ev);
  if (ev.google_event_id) {
    await cal.events.update({ calendarId, eventId: ev.google_event_id, requestBody: body });
  } else {
    const { data } = await cal.events.insert({ calendarId, requestBody: body });
    await db.run('UPDATE evenements SET google_event_id=? WHERE id=?', [data.id, ev.id]);
  }
}

async function deleteEventOut(ev) {
  const client = await getAuthedClient();
  const calendarId = await getActiveCalendarId();
  if (!client || !calendarId || !ev.google_event_id) return;
  const cal = calendarApi(client);
  await cal.events.delete({ calendarId, eventId: ev.google_event_id }).catch(() => {});
}

async function syncAll() {
  const client = await getAuthedClient();
  if (!client) return { ok: false, message: 'Google Calendar non connecté' };
  const calendarId = await getActiveCalendarId();
  if (!calendarId) return { ok: false, message: 'Choisissez un calendrier Google avant de synchroniser' };
  const cal = calendarApi(client);

  // Ne pousser que les événements jamais encore envoyés à Google (évite de tout renvoyer à chaque sync)
  const aEnvoyer = await db.all('SELECT * FROM evenements WHERE google_event_id IS NULL');
  for (const ev of aEnvoyer) {
    await syncEventOut(ev).catch(() => {});
  }

  const timeMin = new Date();
  timeMin.setMonth(timeMin.getMonth() - 1);
  const { data } = await cal.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    maxResults: 250,
    singleEvents: true,
    orderBy: 'startTime'
  });

  let imported = 0;
  for (const gEvent of data.items || []) {
    if (!gEvent.start?.dateTime) continue;
    const existing = await db.get('SELECT id FROM evenements WHERE google_event_id = ?', [gEvent.id]);
    if (existing) continue;
    const dt = new Date(gEvent.start.dateTime);
    const date_debut = dt.toISOString().slice(0, 10);
    const heure = dt.toISOString().slice(11, 16);
    await db.run(
      'INSERT INTO evenements (titre,type,date_debut,heure,google_event_id) VALUES (?,?,?,?,?)',
      [gEvent.summary || 'Événement Google', 'rdv', date_debut, heure, gEvent.id]
    );
    imported++;
  }

  return { ok: true, imported };
}

module.exports = {
  configured, getAuthUrl, handleCallback, disconnect, status, syncEventOut, deleteEventOut, syncAll,
  listCalendars, setCalendarId, getActiveCalendarId, createDedicatedCalendar
};
