'use strict';
// CRM eProtectoIT — leads Meta, webhook et notifications. Node >=18.
const crypto = require('crypto');
const db = require('./database');
const google = require('./google');
const { clean, phoneKey, emailKey, getSetting, setSetting } = require('./lib');
const CRM_URL = process.env.CRM_PUBLIC_URL || 'https://crm-eprotectoit-production.up.railway.app';
const GRAPH_VERSION = /^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION || '') ? process.env.META_GRAPH_VERSION : 'v23.0';
const statuses = new Set(['nouveau', 'contacte', 'qualifie', 'perdu', 'converti']);
const key = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const text = v => Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v).trim());
const short = (v, max=2000) => text(v).slice(0,max);
const esc = s => text(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const setting = async (name, fallback='') => (await getSetting(name)) || fallback;
const set = async (name, value) => setSetting(name, String(value ?? ''));
const errMsg = error => short(error?.message || error, 300).replace(/access_token=[^&\s]+/gi,'access_token=[masqué]');
const fullName = lead => [lead.prenom, lead.nom].filter(Boolean).join(' ') || '(sans nom)';
const hash = data => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');

async function matchingClient(lead) {
  const phone = phoneKey(lead.telephone), email = emailKey(lead.email);
  if (!phone && !email) return null;
  const candidates = await db.all('SELECT id, telephone, email FROM clients');
  const match = candidates.filter(c => (phone && phoneKey(c.telephone) === phone) || (email && emailKey(c.email) === email));
  return match.length === 1 ? match[0].id : null;
}
function normalize(body, source='webhook') {
  const input = (body && typeof body === 'object') ? body : {};
  const fields = {};
  for (const f of input.field_data || []) fields[key(f.name)] = text(f.values || f.value);
  for (const [k,v] of Object.entries(input)) if (k !== 'field_data') fields[key(k)] = v;
  const get = (...aliases) => {
    for (const a of aliases) if (fields[key(a)] != null && text(fields[key(a)]).trim()) return text(fields[key(a)]).trim();
    return '';
  };
  const full = get('full_name','name','nom_complet','nom complet');
  let prenom = get('first_name','prenom','prénom');
  let nom = get('last_name','nom_de_famille','lastname','nom');
  if (full && !prenom && !nom) { const words = full.trim().split(/\s+/); prenom = words.shift() || ''; nom = words.join(' '); }
  const used = new Set(['full_name','name','nom_complet','nom complet','first_name','prenom','prénom','last_name','nom_de_famille','lastname','nom','email','courriel','email_address','phone_number','phone','telephone','téléphone','mobile','city','ville','street_address','address','adresse','zip_code','postal_code','code_postal','message','campaign_name','campagne','adset_name','ensemble','ad_name','annonce','form_id','formulaire','platform','plateforme','id','lead_id','external_id','created_time','field_data','source','is_organic','ad_id']);
  const extras = Object.entries(fields).filter(([k,v])=> !used.has(k) && v != null && text(v)).map(([k,v]) => `${k} : ${text(v)}`);
  const obj = {
    source, external_id: short(get('id','lead_id','external_id'),180),
    prenom: short(prenom,180), nom: short(nom,180),
    email: short(get('email','courriel','email_address'),320),
    telephone: short(get('phone_number','telephone','téléphone','phone','mobile'),80),
    adresse: short(get('street_address','adresse','address'),300),
    ville: short(get('city','ville'),150), code_postal: short(get('zip_code','postal_code','code_postal'),30),
    message: short([get('message'), ...extras].filter(Boolean).join('\n'),5000),
    campagne: short(get('campaign_name','campagne'),300),
    ensemble: short(get('adset_name','ensemble'),300),
    annonce: short(get('ad_name','annonce'),300),
    formulaire: short(get('form_id','formulaire'),180),
    plateforme: short(get('platform','plateforme'),100),
    donnees: JSON.stringify(input).slice(0,25000),
    recu_at: get('created_time') || new Date().toISOString()
  };
  if (!obj.external_id) obj.external_id = hash({source,full,prenom,nom,email:obj.email,telephone:obj.telephone,donnees:obj.donnees});
  return obj;
}
async function notifyLead(id) {
  const l = await db.get('SELECT * FROM leads WHERE id=?',[id]);
  if (!l || l.notifie !== 0) return {skipped:true};
  const recipients = (await setting('notify_emails','info@eprotectoit.com')).split(/[;,\s]+/).filter(x=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  if (!recipients.length) {
    await db.run('UPDATE leads SET notif_erreur=? WHERE id=?',['Aucun destinataire valide',id]);
    return {ok:false};
  }
  const subject = `Nouveau lead ${l.source==='meta'?'Meta':''} : ${fullName(l)} — ${l.ville || 'Ville inconnue'}`.replace(/\s+:/,':');
  const rows = [['Nom',fullName(l)],['Téléphone',l.telephone],['Courriel',l.email],['Adresse',[l.adresse,l.ville,l.code_postal].filter(Boolean).join(', ')],['Campagne',l.campagne],['Annonce',l.annonce],['Réponses',l.message]];
  const plain = rows.map(([k,v])=>`${k}: ${v || '—'}`).join('\n') + `\n\nCRM : ${CRM_URL}/opportunites`;
  const html = `<h2>Nouveau lead Meta</h2><table>${rows.map(([k,v])=>`<tr><th style="text-align:left;padding:6px">${esc(k)}</th><td style="padding:6px;white-space:pre-wrap">${esc(v || '—')}</td></tr>`).join('')}</table><p><a href="${esc(CRM_URL)}/opportunites">Voir dans le CRM</a></p>`;
  try {
    for (const to of recipients) await google.sendMail({to,subject,text:plain,html});
    await db.run('UPDATE leads SET notifie=1,notif_erreur=NULL,updated_at=datetime(\'now\') WHERE id=?',[id]);
    return {ok:true};
  } catch (error) {
    await db.run('UPDATE leads SET notif_tentatives=notif_tentatives+1,notif_erreur=?,updated_at=datetime(\'now\') WHERE id=?',[errMsg(error),id]);
    return {ok:false, message:'Envoi impossible; nouvelle tentative prévue'};
  }
}
async function ingestLead(input,{silent=false,source='webhook'}={}) {
  const l = input && input.source && input.donnees !== undefined ? input : normalize(input,source);
  const existing = await db.get('SELECT id FROM leads WHERE source=? AND external_id=?',[l.source,l.external_id]);
  if (existing) return {id:existing.id,duplicate:true};
  const clientId = await matchingClient(l);
  const fields = ['source','external_id','prenom','nom','email','telephone','adresse','ville','code_postal','message','campagne','ensemble','annonce','formulaire','plateforme','donnees','recu_at'];
  const vals = fields.map(f=> l[f] ?? null);
  try {
    const r = await db.run(`INSERT INTO leads (${fields.join(',')},statut,vu,client_id,notifie) VALUES (${fields.map(()=>'?').join(',')},'nouveau',?,?,?)`,[...vals,silent?1:0,clientId,silent?2:0]);
    if (!silent) await notifyLead(r.lastID);
    return {id:r.lastID,duplicate:false,client_id:clientId};
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      const r = await db.get('SELECT id FROM leads WHERE source=? AND external_id=?',[l.source,l.external_id]);
      if (r) return {id:r.id,duplicate:true};
    }
    throw e;
  }
}
const truth = (a,b) => {
  if (!a || !b) return false;
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length===y.length && crypto.timingSafeEqual(x,y);
};
async function webhookSecret() {
  let s=await getSetting('leads_webhook_key');
  if (!s) {s=crypto.randomBytes(32).toString('hex');await set('leads_webhook_key',s);}
  return s;
}
let polling = false;
async function graphGet(endpoint,token, params={}) {
  const u=new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${endpoint.replace(/^\//,'')}`);
  for (const [k,v] of Object.entries(params)) u.searchParams.set(k,String(v));
  // Token in a header, never in app logs or database error messages.
  const response=await fetch(u,{headers:{Authorization:`Bearer ${token}`}});
  const data=await response.json().catch(()=>({}));
  if (!response.ok || data.error) {
    const e=new Error(data.error?.code===190 ? 'Jeton Meta expiré : reconnecter Meta' : 'Meta API indisponible ou accès Leads refusé');
    e.code=data.error?.code; throw e;
  }
  return data;
}
async function graphPages(endpoint,token,params) {
  let cursor=null; const all=[];
  for (let i=0;i<30;i++) {
    const d=await graphGet(endpoint,token,{...params,...(cursor?{after:cursor}:{})});
    all.push(...(d.data||[]));
    cursor=d.paging?.cursors?.after;
    if (!cursor || !d.paging?.next) break;
  }
  return all;
}
async function pollMeta({historique=false}={}) {
  if (polling) return {ok:false,message:'Interrogation déjà en cours'};
  polling=true;
  try {
    const pageId=await setting('meta_page_id'), token=await setting('meta_page_token');
    if (!pageId || !token) return {ok:false,message:'Meta non connecté'};
    if (!/^\d+$/.test(pageId)) return {ok:false,message:'ID de Page invalide'};
    const forms=await graphPages(`${pageId}/leadgen_forms`,token,{fields:'id,name',limit:100});
    const lastOK=Date.parse(await setting('meta_last_ok'));
    // Resume after outages: the 10-minute overlap protects against late arrivals.
    const since=historique?0:Math.floor(((Number.isFinite(lastOK)?lastOK:Date.now())-10*60*1000)/1000);
    let imported=0, duplicates=0;
    for (const f of forms) {
      const leads=await graphPages(`${f.id}/leads`,token,{fields:'id,created_time,field_data,ad_id,ad_name,adset_name,campaign_name,form_id,platform,is_organic',limit:100});
      for (const lead of leads) {
        if (!historique && lead.created_time && Date.parse(lead.created_time)/1000<since) continue;
        const r=await ingestLead(normalize({...lead,form_id:lead.form_id||f.id},'meta'),{silent:historique});
        r.duplicate?duplicates++:imported++;
      }
    }
    await set('meta_last_ok',new Date().toISOString());
    await set('meta_last_error','');
    return {ok:true,forms:forms.length,imported,duplicates};
  } catch(error) {
    await set('meta_last_error',errMsg(error));
    return {ok:false,message:errMsg(error)};
  } finally {polling=false;}
}
async function retryNotifications() {
  const rows=await db.all('SELECT id FROM leads WHERE notifie=0 AND notif_tentatives<10 AND datetime(created_at)>datetime(\'now\',\'-14 days\') ORDER BY id LIMIT 20');
  for (const row of rows) await notifyLead(row.id);
}
async function convertLead(id) {
  const l=await db.get('SELECT * FROM leads WHERE id=?',[id]);
  if (!l) return null;
  if (l.statut==='converti' && l.client_id) return {client_id:l.client_id,already:true};
  let clientId=l.client_id;
  if (!clientId) {
    clientId=await matchingClient(l);
    if (!clientId) {
      const r=await db.run('INSERT INTO clients (prenom,nom,email,telephone,adresse,ville,code_postal,notes) VALUES (?,?,?,?,?,?,?,?)',
        [l.prenom||'',l.nom||'',l.email,l.telephone,l.adresse,l.ville,l.code_postal,`Lead Meta : ${l.campagne||'Formulaire'}`]);
      clientId=r.lastID;
    }
  }
  // Idempotent even if previous conversion was interrupted.
  const note=`Lead CRM #${l.id}`;
  let opp=await db.get('SELECT id FROM opportunites WHERE client_id=? AND notes LIKE ?',[clientId,`%${note}%`]);
  if (!opp) opp=await db.run('INSERT INTO opportunites (client_id,titre,etape,service,notes) VALUES (?,?,?,?,?)',
    [clientId,`Lead Meta - ${fullName(l)}`,'lead','Protection Toiture',`${note}\n${l.message||''}`]);
  await db.run('UPDATE leads SET client_id=?,statut=?,vu=1,updated_at=datetime(\'now\') WHERE id=?',[clientId,'converti',l.id]);
  await db.run('INSERT INTO historique (client_id,type,description) VALUES (?,?,?)',[clientId,'lead','Lead Meta converti en client']);
  return {client_id:clientId,opportunite_id:opp.id || opp.lastID};
}
function register(app,{auth}) {
  // Public webhook. Requires a secret, not CRM auth.
  app.post('/api/webhooks/leads',async(req,res)=>{
    const sent=req.headers['x-webhook-key'] || req.query.key;
    if (!truth(sent,await webhookSecret())) return res.status(403).json({message:'Accès refusé'});
    if (!req.body || typeof req.body!=='object' || Array.isArray(req.body)) return res.status(400).json({message:'JSON invalide'});
    const r=await ingestLead(req.body,{source:'webhook'});
    res.status(r.duplicate?200:201).json(r);
  });
  app.get('/api/leads',auth,async(req,res)=>{
    const params=[],conds=[];
    if (req.query.statut && statuses.has(req.query.statut)) {conds.push('statut=?');params.push(req.query.statut);}
    if (req.query.q) {conds.push('(prenom LIKE ? OR nom LIKE ? OR email LIKE ? OR telephone LIKE ? OR ville LIKE ?)');params.push(...Array(5).fill(`%${short(req.query.q,80)}%`));}
    res.json(await db.all(`SELECT * FROM leads ${conds.length?'WHERE '+conds.join(' AND '):''} ORDER BY datetime(recu_at) DESC,id DESC LIMIT 1000`,params));
  });
  app.get('/api/leads/count',auth,async(req,res)=>res.json(await db.get('SELECT COUNT(*) AS count FROM leads WHERE vu=0')));
  app.post('/api/leads',auth,async(req,res)=>res.status(201).json(await ingestLead(req.body,{source:'manuel',silent:true})));
  app.put('/api/leads/:id',auth,async(req,res)=>{
    const allowed=['statut','vu','prenom','nom','email','telephone','ville','adresse','code_postal','message'];
    const changes=Object.entries(req.body||{}).filter(([k])=>allowed.includes(k));
    if (changes.find(([k,v])=>k==='statut'&&!statuses.has(v))) return res.status(400).json({message:'Statut invalide'});
    if (!changes.length) return res.json({ok:true});
    const q=changes.map(([k])=>`${k}=?`).join(',');
    const r=await db.run(`UPDATE leads SET ${q},updated_at=datetime('now') WHERE id=?`,[...changes.map(([k,v])=>k==='vu'?(v?1:0):short(v,5000)),req.params.id]);
    res.status(r.changes?200:404).json({ok:!!r.changes});
  });
  app.post('/api/leads/:id/convertir',auth,async(req,res)=>{
    const r=await convertLead(req.params.id);
    res.status(r?200:404).json(r||{message:'Lead introuvable'});
  });
  app.delete('/api/leads/:id',auth,async(req,res)=>{
    await db.run('DELETE FROM leads WHERE id=?',[req.params.id]); res.json({ok:true});
  });
  app.post('/api/leads/mark-seen',auth,async(req,res)=>{
    await db.run('UPDATE leads SET vu=1 WHERE vu=0');res.json({ok:true});
  });
  app.post('/api/leads/import-historique',auth,async(req,res)=>res.json(await pollMeta({historique:true})));
  app.post('/api/meta/poll',auth,async(req,res)=>res.json(await pollMeta()));
  app.get('/api/integrations',auth,async(req,res)=>{
    const token=await setting('meta_page_token');
    res.json({meta:{pageId:await setting('meta_page_id'),hasToken:!!token,lastOk:await setting('meta_last_ok'),lastError:await setting('meta_last_error')},notifications:{emails:await setting('notify_emails','info@eprotectoit.com')},webhook:{configured:!!(await getSetting('leads_webhook_key'))},drive:{rootId:await setting('drive_root_id','1Xg_dEIz77yVxZQ20hfHXN4rd_uE7vLfN'),leadsId:await setting('drive_leads_id','1eFQSjqzmzTseq31FJpp_D72mB2CUDr9S')}});
  });
  app.put('/api/integrations',auth,async(req,res)=>{
    const b=req.body||{};
    if ('metaPageId' in b) {
      if (b.metaPageId && !/^\d+$/.test(String(b.metaPageId))) return res.status(400).json({message:'ID de Page invalide'});
      await set('meta_page_id',b.metaPageId);
    }
    if ('metaPageToken' in b && b.metaPageToken) await set('meta_page_token',short(b.metaPageToken,4000));
    if ('notifyEmails' in b) await set('notify_emails',short(b.notifyEmails,1000));
    if ('driveRootId' in b) await set('drive_root_id',short(b.driveRootId,200));
    if ('driveLeadsId' in b) await set('drive_leads_id',short(b.driveLeadsId,200));
    res.json({ok:true});
  });
  app.post('/api/integrations/webhook/renew',auth,async(req,res)=>{
    const newKey=crypto.randomBytes(32).toString('hex');
    await set('leads_webhook_key',newKey);
    res.json({key:newKey,url:`${CRM_URL}/api/webhooks/leads?key=${newKey}`});
  });
  app.get('/api/integrations/webhook',auth,async(req,res)=>{
    const s=await webhookSecret();res.json({key:s,url:`${CRM_URL}/api/webhooks/leads?key=${s}`});
  });
  app.post('/api/integrations/test-email',auth,async(req,res)=>{
    const to=short(req.body?.to || await setting('notify_emails','info@eprotectoit.com'),320);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({message:'Une adresse valide est requise'});
    await google.sendMail({to,subject:'Test notification CRM ProtecToit',text:'Les notifications du CRM fonctionnent.'});res.json({ok:true});
  });
  app.post('/api/meta/disconnect',auth,async(req,res)=>{
    await set('meta_page_token','');await set('meta_page_id','');res.json({ok:true});
  });
}
module.exports={register,normalize,ingestLead,notifyLead,pollMeta,retryNotifications,convertLead};