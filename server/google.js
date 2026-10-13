const { google } = require('googleapis');
const db = require('./database');
const { getSecret, setSecret } = require('./lib');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google/callback';
const SCOPE_CALENDAR = 'https://www.googleapis.com/auth/calendar';
const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.readonly';
const SCOPE_GMAIL = 'https://www.googleapis.com/auth/gmail.send';
const SCOPES = [SCOPE_CALENDAR, SCOPE_DRIVE, SCOPE_GMAIL];
let lastAuthError = null;
const CRM_CALENDAR_NAME = 'CRM ProtecToit';

function configured() {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

function oauthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

async function getStoredTokens() {
  const raw = await getSecret('google_tokens'); // chiffré au repos
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function saveTokens(tokens) {
  await setSecret('google_tokens', JSON.stringify(tokens));
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

function getAuthUrl(state) {
  if (!configured()) throw new Error('Google Calendar non configuré (variables GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET manquantes)');
  const client = oauthClient();
  return client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES, include_granted_scopes: true, ...(state ? { state } : {}) });
}

async function handleCallback(code) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  const previous = await getStoredTokens();
  await saveTokens({ ...previous, ...tokens, refresh_token: tokens.refresh_token || previous?.refresh_token });
  lastAuthError = null;
}

async function disconnect() {
  await db.run('DELETE FROM settings WHERE key = ?', ['google_tokens']);
  await db.run('DELETE FROM settings WHERE key = ?', ['google_calendar_id']);
  await db.run('UPDATE evenements SET google_event_id = NULL');
}

async function status() {
  const tokens = await getStoredTokens();
  const calendarId = tokens ? await getActiveCalendarId() : null;
  const granted = (tokens?.scope || '').split(/\s+/);
  const has = scope => granted.includes(scope);
  return { configured: configured(), connected: !!tokens, calendarSelected: !!calendarId, calendar: has(SCOPE_CALENDAR), drive: has(SCOPE_DRIVE), gmail: has(SCOPE_GMAIL), authError: lastAuthError };
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

function driveApi(client) { return google.drive({ version: 'v3', auth: client }); }
function hasScope(tokens, scope) { return String(tokens?.scope || '').split(/\s+/).includes(scope); }
function noteAuthError(error) { lastAuthError = String(error?.message || error).replace(/(access_token|refresh_token|client_secret)=[^&\s]+/gi,'$1=[masqué]').slice(0,180); }
function clearAuthError() { lastAuthError = null; }
async function sendMail({to,subject,text,html}) {
  const client = await getAuthedClient();
  if (!client) throw new Error('Google non connecté');
  const fromTokens = await getStoredTokens();
  if (!hasScope(fromTokens,SCOPE_GMAIL)) throw new Error('Autorisation Gmail à accorder');
  const safe = value => String(value || '').replace(/[\r\n]+/g,' ');
  const boundary = 'crm-protectoit-'+require('crypto').randomBytes(12).toString('hex');
  const payload = ['To: '+safe(to),'Subject: =?UTF-8?B?'+Buffer.from(safe(subject),'utf8').toString('base64')+'?=','MIME-Version: 1.0','Content-Type: multipart/alternative; boundary="'+boundary+'"','','--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(String(text || ''),'utf8').toString('base64'),'--'+boundary,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(String(html || '<pre>'+String(text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</pre>'),'utf8').toString('base64'),'--'+boundary+'--'].join('\r\n');
  const raw=Buffer.from(payload).toString('base64url');
  return google.gmail({version:'v1',auth:client}).users.messages.send({userId:'me',requestBody:{raw}});
}
module.exports = {
  configured, getAuthUrl, handleCallback, disconnect, status, syncEventOut, deleteEventOut, syncAll, getAuthedClient, driveApi, hasScope, noteAuthError, clearAuthError, sendMail, SCOPE_CALENDAR, SCOPE_DRIVE, SCOPE_GMAIL,
  listCalendars, setCalendarId, getActiveCalendarId, createDedicatedCalendar
};
