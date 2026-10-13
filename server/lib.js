'use strict';
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
module.exports={localParts,clean,norm,digitsOf,phoneKey,emailKey,nameTokens,addHistory,nextReference,getSetting,setSetting,getJsonSetting,setJsonSetting};