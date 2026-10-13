'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const TZ = 'America/Toronto';
function localParts(date=new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date).map(x=>[x.type,x.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}
const clean = v => v == null ? '' : String(v).trim();
const norm = s => clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const digitsOf = s => clean(s).replace(/\D/g,'');
const phoneKey = s => {const n=digitsOf(s);return n.length>=10?n.slice(-10):'';};
const emailKey = s => norm(s);
const nameTokens = s => norm(s).split(/[^a-z0-9]+/).filter(Boolean).sort();
const addHistory = (client_id,type,description) => db.run('INSERT INTO historique (client_id,type,description) VALUES (?,?,?)',[client_id,type,description]);
async function nextReference(prefix,table) {
  if (!['quotes','invoices'].includes(table)) throw new Error('Table non autorisée');
  if (!['SOU','FAC'].includes(prefix)) throw new Error('Préfixe non autorisé');
  const year=localParts().date.slice(0,4);
  const p=`${prefix}-${year}-`;
  const row=await db.get(`SELECT MAX(CAST(SUBSTR(reference, ?) AS INTEGER)) AS m FROM ${table} WHERE reference LIKE ?`,[p.length+1,`${p}%`]);
  return p+String((row?.m||0)+1).padStart(4,'0');
}
async function getSetting(key) {
  const r=await db.get('SELECT value FROM settings WHERE key=?',[key]);
  return r?.value ?? null;
}
async function setSetting(key,value) {
  await db.run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,String(value??'')]);
}
async function getJsonSetting(key,fallback=null) {
  const raw=await getSetting(key);
  if(raw==null) return fallback;
  try{return JSON.parse(raw);}catch{return fallback;}
}
const setJsonSetting=(key,value)=>setSetting(key,JSON.stringify(value));

// ---- Secrets chiffrés au repos (AES-256-GCM) : jetons Google/Meta et clé de webhook ----
const SECRET_SETTINGS=['google_tokens','meta_page_token','leads_webhook_key'];
let _secretKey=null;
function secretKey() {
  if(_secretKey) return _secretKey;
  if(process.env.SECRETS_KEY) return (_secretKey=crypto.createHash('sha256').update(process.env.SECRETS_KEY).digest());
  const file=path.join(path.dirname(db.dbPath),'.crm-secret');
  try { const k=Buffer.from(fs.readFileSync(file,'utf8').trim(),'hex'); if(k.length!==32) throw new Error('clé invalide'); _secretKey=k; }
  catch { _secretKey=crypto.randomBytes(32); fs.writeFileSync(file,_secretKey.toString('hex'),{mode:0o600}); }
  return _secretKey;
}
function encrypt(plain) {
  const iv=crypto.randomBytes(12), c=crypto.createCipheriv('aes-256-gcm',secretKey(),iv);
  const data=Buffer.concat([c.update(String(plain),'utf8'),c.final()]);
  return 'enc:v1:'+Buffer.concat([iv,c.getAuthTag(),data]).toString('base64');
}
function decrypt(value) {
  if(typeof value!=='string' || !value.startsWith('enc:v1:')) return value;
  try {
    const raw=Buffer.from(value.slice(7),'base64');
    const d=crypto.createDecipheriv('aes-256-gcm',secretKey(),raw.subarray(0,12));
    d.setAuthTag(raw.subarray(12,28));
    return Buffer.concat([d.update(raw.subarray(28)),d.final()]).toString('utf8');
  } catch { console.error('[secrets] déchiffrement impossible (clé changée?) : reconnecter le service concerné'); return null; }
}
async function getSecret(key) { const raw=await getSetting(key); return raw ? decrypt(raw) : raw; }
async function setSecret(key,value) { await setSetting(key, value ? encrypt(value) : ''); }
/** Chiffre les valeurs encore en clair (migration au démarrage). */
async function migrateSecrets() {
  for(const key of SECRET_SETTINGS) { const raw=await getSetting(key); if(raw && !raw.startsWith('enc:v1:')) await setSecret(key,raw); }
}
const redactUrl = url => String(url||'').replace(/([?&](?:key|token|access_token|code|state)=)[^&\s]+/gi,'$1[masqué]');
module.exports={getSecret,setSecret,migrateSecrets,encrypt,decrypt,redactUrl,localParts,clean,norm,digitsOf,phoneKey,emailKey,nameTokens,addHistory,nextReference,getSetting,setSetting,getJsonSetting,setJsonSetting};