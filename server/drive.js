'use strict';
/** Drive -> CRM eProtectoIT. Safeguards: dry-run, conservative matching, per-file transactions. */
const ExcelJS = require('exceljs');
const db = require('./database');
const google = require('./google');
const { norm, phoneKey, emailKey, nextReference, getSetting, setSetting } = require('./lib');

const ROOT = '1Xg_dEIz77yVxZQ20hfHXN4rd_uE7vLfN';
const LEADS = '1eFQSjqzmzTseq31FJpp_D72mB2CUDr9S';
const TEMPLATE = '1iixhLjIV2lTiCxc3DxIbtX-P76FebUk9';
const clean = v => String(v ?? '').trim();
const normalized = v => typeof norm === 'function' ? norm(clean(v)) : clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const normName = value => normalized(value).replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const safeError = e => clean(e?.message || e).replace(/(access_token|refresh_token|client_secret)=[^&\s]+/gi,'$1=[masqué]').slice(0,300);
const money = v => { 
  if (v == null || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = clean(v); if (!s || /#(?:VALUE|REF|DIV\/0|N\/A|NUM|NAME|NULL)!?/i.test(s)) return null;
  s = s.replace(/[^\d,.-]/g,'');
  if (!s || s==='-') return null;
  if (s.includes(',') && s.includes('.')) s=s.lastIndexOf(',')>s.lastIndexOf('.') ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,'');
  else if (s.includes(',')) s=s.replace(',','.');
  const n=Number(s); return Number.isFinite(n)?n:null;
};
function cellValue(c) {
  if (!c) return '';
  const v=c.value;
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('result' in v) return v.result?.error ? '' : cellValue({value:v.result});
    if ('text' in v) return v.text;
    if (Array.isArray(v.richText)) return v.richText.map(x=>x.text).join('');
    if ('error' in v) return '';
    return '';
  }
  return v;
}
function lookup(sheet, label, fallback) {
  const target=normalized(label);
  for (let row=1;row<=Math.min(sheet.rowCount,90);row++) {
    for (let col=1;col<=Math.min(sheet.columnCount,15);col++) {
      const c=sheet.getCell(row,col);
      if (c.isMerged && c.master.address!==c.address) continue;
      if (normalized(cellValue(c))===target && row>1) {
        const v=cellValue(sheet.getCell(row-1,col));
        if (clean(v)) return v;
      }
    }
  }
  return cellValue(sheet.getCell(fallback));
}
function signature(sheet, row) {
  // A signature counts only if the signed-date cell contains a plausible date.
  for (const col of ['D','E']) {
    const value=sheet.getCell(`${col}${row}`).value;
    if (value instanceof Date && !isNaN(value.valueOf())) return true;
    const s=clean(cellValue(sheet.getCell(`${col}${row}`)));
    if (/\b(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/](?:20)?\d{2}\b/.test(s)) return true;
  }
  return false;
}
async function parseContract(buffer) {
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const s=workbook.getWorksheet('Soumission');
  if (!s) throw new Error('Feuille Soumission absente');
  const read=(label,address)=>clean(lookup(s,label,address));
  const services=[];
  for(let row=24;row<=31;row++) {
    if (/^x$/i.test(clean(cellValue(s.getCell(`C${row}`))))) services.push(clean(cellValue(s.getCell(`B${row}`))));
  }
  const ranked=['Protection Noxnano','Protection Noxseal','Nettoyage de toiture','Nettoyage de gouttières','Réparations mineures de la toiture'];
  const service=ranked.find(x=>services.some(y=>normalized(y).includes(normalized(x)))) || services.find(x=> !/rabais|subvention/i.test(x)) || 'Protection Toiture';
  const surfaceLine=clean(cellValue(s.getCell('H24')));
  const surfaceMatch=surfaceLine.match(/([\d\s,.]+)\s*(?:pi(?:eds?)?\s*(?:carr[eé]s?|\^?2)|pieds?\s+carr[eé]s?)/i);
  const pi2=surfaceMatch ? money(surfaceMatch[1]) : null;
  const items=[];
  for(let row=57;row<=Math.min(s.rowCount,82);row++) {
    const label=clean(cellValue(s.getCell(`A${row}`)));
    const price=money(cellValue(s.getCell(`G${row}`)));
    if(label && price!==null) items.push({label,price});
  }
  const amount=money(cellValue(s.getCell('G67')));
  const additions=money(cellValue(s.getCell('I67'))) || 0;
  const grand=money(cellValue(s.getCell('J75'))) ?? money(cellValue(s.getCell('G73')));
  const works=amount===null ? (items.length ? items.reduce((a,x)=>a+x.price,0) : null) : amount;
  const total=grand===null && works!==null ? Math.round((works+additions)*1.14975*100)/100 : grand;
  const raw={J2:cellValue(s.getCell('J2')),E6:cellValue(s.getCell('E6')),H6:cellValue(s.getCell('H6')),E8:cellValue(s.getCell('E8')),H8:cellValue(s.getCell('H8')),H10:cellValue(s.getCell('H10')),H12:cellValue(s.getCell('H12')),G67:cellValue(s.getCell('G67')),I67:cellValue(s.getCell('I67')),G73:cellValue(s.getCell('G73')),J75:cellValue(s.getCell('J75'))};
  return {numero:read('Numéro de soumission','J2'),nom:read('Nom client','E6'),prenom:read('Prénom client','H6'),adresse:read('Adresse','E8'),ville:read('Ville','H8'),code_postal:read('Code postal','E10'),telephone:read('Téléphone 1','H10'),telephone2:read('Téléphone 2','E12'),email:read('Courriel','H12'),service,services,pi2,superficie_m2:pi2===null?null:Math.round(pi2*0.09290304*100)/100,travaux:works===null?null:Math.round((works+additions)*100)/100,total,signe:signature(s,69)&&signature(s,71),raw};
}
async function cols(table) {
  if (!['clients','opportunites','quotes','toitures','documents','drive_items'].includes(table)) throw new Error('Table interdite');
  const rows=await db.all(`PRAGMA table_info(${table})`);
  return new Set(rows.map(x=>x.name));
}
async function insert(table, values) {
  const columns=await cols(table);
  const pairs=Object.entries(values).filter(([k,v])=>columns.has(k) && v!==undefined);
  if(!pairs.length) throw new Error(`Aucune colonne valide pour ${table}`);
  const r=await db.run(`INSERT INTO ${table} (${pairs.map(([k])=>`"${k}"`).join(',')}) VALUES (${pairs.map(()=>'?').join(',')})`,pairs.map(([,v])=>v));
  return r.lastID;
}
async function patch(table, id, values) {
  const columns=await cols(table);
  const pairs=Object.entries(values).filter(([k,v])=>columns.has(k) && v!==undefined);
  if(!pairs.length) return;
  await db.run(`UPDATE ${table} SET ${pairs.map(([k])=>`"${k}"=?`).join(',')} WHERE id=?`,[...pairs.map(([,v])=>v),id]);
}
async function listAll(drive,q,fields='nextPageToken,files(id,name,parents,modifiedTime,mimeType,size,webViewLink)') {
  let pageToken,all=[];
  do {
    const response=await drive.files.list({q,pageSize:1000,fields, ...(pageToken?{pageToken}:{})});
    all.push(...response.data.files||[]); pageToken=response.data.nextPageToken;
  } while(pageToken);
  return all;
}
async function fetchExcel(drive,file) {
  let r;
  if(file.mimeType==='application/vnd.google-apps.spreadsheet') r=await drive.files.export({fileId:file.id,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},{responseType:'arraybuffer'});
  else r=await drive.files.get({fileId:file.id,alt:'media'},{responseType:'arraybuffer'});
  return Buffer.isBuffer(r.data)?r.data:Buffer.from(r.data);
}
const docLink = file => file.webViewLink || (file.mimeType==='application/vnd.google-apps.spreadsheet' ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(file.id)}/edit`:`https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`);
const matchesName=(client,first,last) => normName([client.prenom,client.nom].join(' '))===normName([first,last].join(' '));
async function getExisting() {
  const [clients,opps,quotes,items] = await Promise.all([
    db.all('SELECT * FROM clients'),db.all('SELECT * FROM opportunites'),db.all('SELECT * FROM quotes'),db.all('SELECT * FROM drive_items')]);
  return {clients,opps,quotes,items};
}
function match(existing, file, folder, contract) {
  const links=existing.items.filter(x=>x.client_id && [file?.id,folder?.id].includes(x.drive_id));
  const linkIds=[...new Set(links.map(x=>x.client_id))];
  if(linkIds.length===1) return {id:linkIds[0],reason:'drive_id'};
  if(linkIds.length>1) return {review:true,reason:'Liens Drive contradictoires',candidates:linkIds};
  const first=contract?.prenom || (folder?.name||'').split(' ')[0] || '';
  const last=contract?.nom || (folder?.name||'').split(' ').slice(1).join(' ');
  const compat=c=>!!normName([first,last].join(' ')) && matchesName(c,first,last);
  if(contract?.numero){
    const candidates=existing.opps.filter(o=>normalized(o.notes).includes(normalized(`Soumission #${contract.numero}`)))
      .map(o=>existing.clients.find(c=>c.id===o.client_id)).filter(c=>c && (compat(c)||(!contract.nom && normName(c.prenom)===normName(first))));
    const ids=[...new Set(candidates.map(c=>c.id))];
    if(ids.length===1) return {id:ids[0],reason:'numero soumission'};
    if(ids.length>1) return {review:true,reason:'Plusieurs clients avec la même soumission',candidates:ids};
  }
  const phone=contract?.telephone ? phoneKey(contract.telephone) : '',mail=contract?.email ? emailKey(contract.email) : '';
  if(phone||mail){
    const candidates=existing.clients.filter(c=>(phone && phoneKey(c.telephone)===phone)||(mail && emailKey(c.email)===mail));
    const ids=[...new Set(candidates.map(c=>c.id))];
    if(ids.length===1) return {id:ids[0],reason:'coordonnées'};
    if(ids.length>1) return {review:true,reason:'Coordonnées partagées par plusieurs clients',candidates:ids};
  }
  const nameCandidates=existing.clients.filter(compat);
  if(nameCandidates.length===1) return {id:nameCandidates[0].id,reason:'nom exact'};
  if(nameCandidates.length>1) return {review:true,reason:'Nom présent plusieurs fois',candidates:nameCandidates.map(c=>c.id)};
  // First name alone (Jad) is never considered a safe automatic match.
  if(!last && existing.clients.some(c=>normName(c.prenom)===normName(first))) return {review:true,reason:'Prénom seul : rapprochement manuel requis'};
  if(!first || (!last && !contract?.telephone && !contract?.email)) return {review:true,reason:'Identité insuffisante pour créer un client'};
  return {id:null,reason:'nouveau client'};
}
function mergeSnapshot(existing,current,prior,next) {
  const changes={};
  for(const [field,value] of Object.entries(next)) {
    if(value==null || value==='') continue;
    if(current[field]==null || current[field]==='') changes[field]=value;
    else if(prior && Object.prototype.hasOwnProperty.call(prior,field) && clean(current[field])===clean(prior[field]) && clean(value)!==clean(prior[field])) changes[field]=value;
  }
  return changes;
}
function stageRank(x) {return ['lead','soumission','rdv','contrat','complete'].indexOf(x);}
async function upsertItem(item,kind,clientId,status,message,snapshot={}) {
  const previous=await db.get('SELECT * FROM drive_items WHERE drive_id=?',[item.id]);
  const data={drive_id:item.id,kind,name:item.name,parent_id:item.parents?.[0]||null,client_id:clientId||previous?.client_id||null,modified_time:item.modifiedTime||null,web_link:item.webViewLink||null,snapshot:status==='erreur' && previous?.snapshot ? previous.snapshot : JSON.stringify(snapshot),status,message,synced_at:new Date().toISOString()};
  if(previous){
    const pairs=Object.entries(data).filter(([k])=>k!=='drive_id');
    await db.run(`UPDATE drive_items SET ${pairs.map(([k])=>`${k}=?`).join(',')} WHERE drive_id=?`,[...pairs.map(([,v])=>v),item.id]);
  }else{
    const fields=Object.keys(data);
    await db.run(`INSERT INTO drive_items (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`,Object.values(data));
  }
}
async function storeContract(file,folder,parsed,decision) {
  await db.run('BEGIN IMMEDIATE');
  try {
    let clientId=decision.id, oppId=null, quoteId=null;
    const prev=await db.get('SELECT * FROM drive_items WHERE drive_id=?',[file.id]);
    let previous={}; try {previous=JSON.parse(prev?.snapshot||'{}');} catch {}
    const values={prenom:parsed.prenom,nom:parsed.nom||'',adresse:parsed.adresse,ville:parsed.ville,code_postal:parsed.code_postal,telephone:parsed.telephone,email:parsed.email};
    if(!clientId) clientId=await insert('clients',{...values,notes:`Importé Drive: ${file.name}`});
    else {
      const current=await db.get('SELECT * FROM clients WHERE id=?',[clientId]);
      if(!current) throw new Error('Client lié introuvable');
      await patch('clients',clientId,mergeSnapshot({},current,previous?.client,values));
    }
    let opp=(await db.all('SELECT * FROM opportunites WHERE client_id=?',[clientId])).find(o =>
      (parsed.numero && normalized(o.notes).includes(normalized(`Soumission #${parsed.numero}`))) ||
      (prev?.opportunite_id && o.id===prev.opportunite_id));
    const notes=`Soumission #${parsed.numero||'?'} - Importé Drive`;
    if (!opp) {
      // Reuse a single lead opportunity for the same Drive folder instead of duplicating.
      const folderLink=folder && await db.get('SELECT * FROM drive_items WHERE drive_id=?',[folder.id]);
      if(folderLink?.opportunite_id) opp=await db.get('SELECT * FROM opportunites WHERE id=?',[folderLink.opportunite_id]);
    }
    if(!opp){
      oppId=await insert('opportunites',{client_id:clientId,titre:`Protection Toiture - ${parsed.service}`,service:parsed.service,notes,etape:parsed.signe?'contrat':'soumission',valeur:parsed.travaux});
    } else {
      oppId=opp.id;
      const update={};
      if (parsed.signe && stageRank(opp.etape)>=0 && stageRank(opp.etape)<stageRank('contrat')) update.etape='contrat';
      if ((opp.valeur==null || prev?.snapshot && previous?.travaux != null && Number(opp.valeur)===Number(previous.travaux)) && parsed.travaux!=null) update.valeur=parsed.travaux;
      if (!opp.service) update.service=parsed.service;
      await patch('opportunites',oppId,update);
    }
    let quote=prev?.quote_id?await db.get('SELECT * FROM quotes WHERE id=?',[prev.quote_id]):null;
    if(!quote && parsed.numero){
      const existingOppIds=(await db.all('SELECT id FROM opportunites WHERE client_id=?',[clientId])).map(o=>o.id);
      const byRef=existingOppIds.length ? await db.all(`SELECT * FROM quotes WHERE opportunite_id IN (${existingOppIds.map(()=>'?').join(',')})`,existingOppIds):[];
      quote=byRef.find(q=>normalized(q.notes).includes(normalized(`Soumission #${parsed.numero}`))) || (byRef.length===1?byRef[0]:null);
    }
    if(!quote){
      quoteId=await insert('quotes',{client_id:clientId,opportunite_id:oppId,reference:await nextReference('SOU','quotes'),montant:parsed.total,statut:parsed.signe?'acceptee':'envoyee',notes});
    }else{
      quoteId=quote.id;
      const updated={};
      if(parsed.signe && ['brouillon','envoyee'].includes(quote.statut)) updated.statut='acceptee';
      if ((quote.montant==null || previous?.total != null && Number(quote.montant)===Number(previous.total)) && parsed.total!=null) updated.montant=parsed.total;
      await patch('quotes',quoteId,updated);
    }
    if(parsed.pi2!=null) {
      const roofs=await db.all('SELECT * FROM toitures WHERE client_id=?',[clientId]);
      if(!roofs.length) await insert('toitures',{client_id:clientId,materiau:parsed.service.includes('Noxnano')?'Noxnano':null,superficie:parsed.superficie_m2,superficie_m2:parsed.superficie_m2});
    }
    const url=docLink(file);
    const docs=await db.all('SELECT * FROM documents WHERE client_id=?',[clientId]);
    if(!docs.some(d=>d.chemin===url)) await insert('documents',{client_id:clientId,nom:file.name,chemin:url,type_doc:'soumission'});
    const snap={client:values,travaux:parsed.travaux,total:parsed.total,numero:parsed.numero,signe:parsed.signe};
    await upsertItem(file,'file',clientId,'ok',decision.reason,snap);
    await db.run('UPDATE drive_items SET opportunite_id=?,quote_id=?,document_id=COALESCE(document_id,(SELECT id FROM documents WHERE chemin=? AND client_id=? LIMIT 1)) WHERE drive_id=?',[oppId,quoteId,url,clientId,file.id]);
    if(folder) {
      await upsertItem(folder,'folder',clientId,'ok','Dossier client synchronisé');
      await db.run('UPDATE drive_items SET opportunite_id=? WHERE drive_id=? AND opportunite_id IS NULL',[oppId,folder.id]);
    }
    await db.run('COMMIT');
    return {client_id:clientId,opportunite_id:oppId,quote_id:quoteId};
  } catch(error) { await db.run('ROLLBACK');throw error; }
}
async function storeFolder(folder,decision) {
  await db.run('BEGIN IMMEDIATE');
  try {
    let clientId=decision.id,opportunityId=null;
    if(!clientId) {
      const parts=clean(folder.name).split(/\s+/);
      clientId=await insert('clients',{prenom:parts.shift()||'',nom:parts.join(' '),notes:'Lead importé du dossier Drive Leads (aucun fichier)'});
      opportunityId=await insert('opportunites',{client_id:clientId,titre:`Lead - ${folder.name}`,etape:'lead',service:'Protection Toiture'});
    }
    await upsertItem(folder,'folder',clientId,'ok','Dossier sans contrat');
    if(opportunityId) await db.run('UPDATE drive_items SET opportunite_id=? WHERE drive_id=?',[opportunityId,folder.id]);
    await db.run('COMMIT');
    return {client_id:clientId};
  }catch(e){await db.run('ROLLBACK');throw e;}
}
let active=false;
async function sync({dry=true,full=false,limit=0}={}) {
  if(active) return {ok:false,message:'Synchronisation déjà en cours'};
  active=true; const started=new Date().toISOString();
  const result={ok:true,dry,started,created:0,matched:0,unchanged:0,review:0,errors:0,details:[]};
  try {
    const gs=await google.status();
    if(!gs?.connected || !gs?.drive) return {ok:false,dry,message:'Google Drive doit être autorisé',details:[]};
    const oauth=await google.getAuthedClient(),drive=google.driveApi(oauth);
    const rootId=(await getSetting('drive_root_id'))||ROOT;
    const leadsId=(await getSetting('drive_leads_id'))||LEADS;
    const folders=await listAll(drive,`'${leadsId.replace(/'/g,'\\\'')}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const sources=[{id:leadsId,name:'Leads'},...folders,{id:rootId,name:'Soumissions'}];
    const existing=await getExisting();
    const last=await getSetting('drive_last_sync');
    const cutoff=!full&&last?Date.parse(last)-10*60*1000:0;
    let encountered=0;
    for(const folder of sources) {
      const files=await listAll(drive,`'${folder.id.replace(/'/g,'\\\'')}' in parents and trashed=false`);
      const sheets=files.filter(f=>f.id!==TEMPLATE && (/\.xlsx$/i.test(f.name)||f.mimeType==='application/vnd.google-apps.spreadsheet'));
      if(!sheets.length && folders.some(f=>f.id===folder.id)) {
        const previous=existing.items.find(x=>x.drive_id===folder.id && x.status==='ok');
        if(previous){result.unchanged++;continue;}
        let decision=match(existing,null,folder,null);
        if(existing.items.find(x=>x.drive_id===folder.id)?.message==='Création forcée autorisée par utilisateur') decision={id:null,reason:'création manuelle'};
        if(decision.review) {
          result.review++;result.details.push({kind:'folder',name:folder.name,id:folder.id,action:'à valider',reason:decision.reason,candidates:decision.candidates||[]});
          if(!dry) await upsertItem(folder,'folder',null,'erreur',`À valider : ${decision.reason}`);
          continue;
        }
        result.details.push({kind:'folder',name:folder.name,id:folder.id,action:decision.id?'rapproché':'créé',client_id:decision.id||null});
        if(!dry){const stored=await storeFolder(folder,decision);existing.items.push({drive_id:folder.id,client_id:stored.client_id,status:'ok'}); if(!decision.id) existing.clients.push({id:stored.client_id,prenom:folder.name.split(' ')[0],nom:folder.name.split(' ').slice(1).join(' ')});}
        decision.id?result.matched++:result.created++;
      }
      for (const file of sheets) {
        if(limit>0 && encountered>=limit) break; encountered++;
        const seen=existing.items.find(x=>x.drive_id===file.id);
        if(!full && seen?.status==='ok' && seen.modified_time===file.modifiedTime) {result.unchanged++;continue;}
        if(cutoff && Date.parse(file.modifiedTime)<cutoff && seen?.status==='ok') {result.unchanged++;continue;}
        try {
          const parsed=await parseContract(await fetchExcel(drive,file));
          let decision=match(existing,file,folder,parsed);
          if(seen?.message==='Création forcée autorisée par utilisateur') decision={id:null,reason:'création manuelle'};
          const detail={kind:'file',id:file.id,name:file.name,folder:folder.name,action:decision.review?'à valider':decision.id?'rapproché':'créé',client_id:decision.id||null,reason:decision.reason,preview:{...parsed,raw:dry?parsed.raw:undefined}};
          if(decision.review){result.review++;detail.candidates=decision.candidates||[]; if(!dry) await upsertItem(file,'file',null,'erreur',`À valider : ${decision.reason}`,{preview:parsed});}
          else {
            if(!dry) {
              const stored=await storeContract(file,folders.find(f=>f.id===folder.id)||null,parsed,decision);
              detail.client_id=stored.client_id;
              existing.items.push({drive_id:file.id,client_id:stored.client_id,status:'ok',modified_time:file.modifiedTime});
              if(!decision.id)existing.clients.push({id:stored.client_id,prenom:parsed.prenom,nom:parsed.nom,email:parsed.email,telephone:parsed.telephone});
            }
            decision.id?result.matched++:result.created++;
          }
          result.details.push(detail);
        }catch(error){
          result.errors++;
          result.details.push({kind:'file',id:file.id,name:file.name,action:'erreur',reason:safeError(error)});
          if(!dry) await upsertItem(file,'file',null,'erreur',safeError(error)).catch(()=>{});
        }
      }
      if(limit>0 && encountered>=limit) break;
    }
    if(!dry) {
      if(result.errors===0) await setSetting('drive_sync_enabled','1');
      await setSetting('drive_last_sync',new Date().toISOString());
      await setSetting('drive_last_result',JSON.stringify({...result,details:undefined}));
    }
  }catch(error){
    result.ok=false;result.message=safeError(error);
    if(/invalid_grant/i.test(String(error?.message))) google.noteAuthError(error);
  }finally{active=false;}
  return result;
}
async function status() {
  const rows=await db.all(`SELECT drive_id,name,kind,message,client_id,status,synced_at FROM drive_items WHERE status!='ok' ORDER BY synced_at DESC LIMIT 100`);
  let summary={};try{summary=JSON.parse(await getSetting('drive_last_result')||'{}');}catch{}
  return {lastSync:await getSetting('drive_last_sync'),summary,review:rows,busy:active};
}
function register(app,{auth}) {
  app.get('/api/drive/status',auth,async(req,res)=>res.json(await status()));
  app.post('/api/drive/sync',auth,async(req,res)=>res.json(await sync({dry:req.body?.dry!==false,full:!!req.body?.full,limit:Math.max(0,Math.min(1000,Number(req.body?.limit)||0))})));
  app.get('/api/drive/items',auth,async(req,res)=>res.json(await db.all('SELECT * FROM drive_items ORDER BY synced_at DESC LIMIT 1000')));
  app.post('/api/drive/items/:id/link',auth,async(req,res)=>{
    const {client_id}=req.body||{};
    if(!Number.isInteger(Number(client_id)) || !(await db.get('SELECT id FROM clients WHERE id=?',[client_id]))) return res.status(400).json({message:'Client introuvable'});
    const item=await db.get('SELECT * FROM drive_items WHERE drive_id=?',[req.params.id]);
    if(!item) return res.status(404).json({message:'Élément Drive inconnu'});
    await db.run('UPDATE drive_items SET client_id=?,status=?,message=? WHERE drive_id=?',[client_id,'erreur','Liaison manuelle : relancer la synchronisation',req.params.id]);
    res.json({ok:true,client_id});
  });
  app.post('/api/drive/items/:id/create',auth,async(req,res)=>{
    const item=await db.get('SELECT * FROM drive_items WHERE drive_id=?',[req.params.id]);
    if(!item) return res.status(404).json({message:'Élément Drive inconnu'});
    await db.run('UPDATE drive_items SET client_id=NULL,status=?,message=? WHERE drive_id=?',['erreur','Création forcée autorisée par utilisateur',req.params.id]);
    res.json({ok:true,pending:true});
  });
}
module.exports={register,sync,status,parseContract,match,money};