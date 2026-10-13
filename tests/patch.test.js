'use strict';
// node --test tests/patch.test.js ; no external packages required.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
function load(file,mocks) {
  const full=path.resolve(__dirname,'../server',file);
  const m=new Module(full,module);m.filename=full;m.paths=Module._nodeModulePaths(path.dirname(full));
  m.require=id=>Object.prototype.hasOwnProperty.call(mocks,id)?mocks[id]:require(id);
  m._compile(fs.readFileSync(full,'utf8'),full);return m.exports;
}
function key(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
const settings=new Map([['notify_emails','info@example.test'],['leads_webhook_key','testsecret']]);
const lib={norm:key,phoneKey:v=>String(v||'').replace(/\D/g,'').slice(-10),emailKey:v=>key(v),clean:v=>String(v||'').trim(),getSetting:async k=>settings.get(k),setSetting:async(k,v)=>settings.set(k,v),nextReference:async()=> 'SOU-2026-9999'};
class FakeWorkbook {
  constructor(){this.cells={};this.xlsx={load:async data=>{this.cells=JSON.parse(Buffer.from(data).toString());}};}
  getWorksheet(name){if(name!=='Soumission')return null;const cells=this.cells;return {rowCount:75,columnCount:10,getCell(k,r){let pos=typeof k==='number'?`${String.fromCharCode(64+r)}${k}`:k;return {value:cells[pos]??null,isMerged:false};}};}
}
const drive=load('drive.js',{'exceljs':{Workbook:FakeWorkbook},'./database':{},'./google':{},'./lib':lib});
test('montants FR, erreurs Excel ignorées',()=>{
  assert.equal(drive.money('1 234,56 $'),1234.56);
  assert.equal(drive.money('#VALUE!'),null);
  assert.equal(drive.money({error:'#VALUE!'}),null);
});
test('rapprochement par lien Drive puis par téléphone, sans confondre deux clients',()=>{
  const clients=[{id:1,prenom:'Pierre',nom:'Tremblay',telephone:'514-333-1234'},{id:2,prenom:'Paul',nom:'Tremblay',telephone:'514-999-0000'}];
  const existing={clients,opps:[],quotes:[],items:[{drive_id:'abc',client_id:1}]};
  assert.equal(drive.match(existing,{id:'abc'}, {id:'f1',name:'Pierre Tremblay'},null).id,1);
  assert.equal(drive.match({...existing,items:[]},{id:'xyz'},{name:'Autre nom'}, {prenom:'X',nom:'Y',telephone:'5143331234'}).id,1);
  assert.equal(drive.match({...existing,items:[],clients:[...clients,{id:3,prenom:'Michel',nom:'B',telephone:'5143331234'}]}, {id:'xyz'}, {name:'Autre'}, {prenom:'X',nom:'Y',telephone:'5143331234'}).review,true);
});
test('prénom seul ne crée pas de doublon',()=>{
  const e={clients:[{id:1,prenom:'Jad',nom:'L'}],opps:[],quotes:[],items:[]};
  assert.equal(drive.match(e,{id:'x'},{name:'Jad'}, {prenom:'Jad'}).review,true);
});
test('lecture Excel : coordonnées, services, formule en erreur et signature',async()=>{
  const fields={J2:47,E6:'Guay',H6:'Stéphan',E8:'55 des Pins',H8:'Laval',E10:'H7X 1A1',H10:'4505551212',H12:'stephan@example.test',B24:'Protection Noxnano',C24:'X',H24:'Produit NoxNano 2920 pieds carré',G67:{formula:'SUM()',result:{error:'#VALUE!'}},G73:{formula:'A1',result:{error:'#VALUE!'}},J75:{formula:'A2',result:{error:'#VALUE!'}},A57:'Protection',G57:1000,C69:'Entrepreneur',C71:'Client',D69:'2026-10-01',E71:'2026-10-02'};
  const r=await drive.parseContract(Buffer.from(JSON.stringify(fields)));
  assert.equal(r.prenom,'Stéphan');assert.equal(r.nom,'Guay');assert.equal(r.service,'Protection Noxnano');
  assert.equal(r.pi2,2920);assert.equal(r.signe,true);assert.equal(r.travaux,1000);assert.equal(r.total,1149.75);
});
const allLeads=[];let nextId=1;const sent=[];
const db={
  all:async sql=>sql.includes('FROM clients')?[]:[],
  get:async(sql,args)=>sql.includes('FROM leads')?allLeads.find(l=> sql.includes('source=?')?l.source===args[0] && l.external_id===args[1]:l.id===args[0]):null,
  run:async(sql,args)=>{
    if(sql.startsWith('INSERT INTO leads')) {
      const columns=sql.match(/\(([^)]+)\)/)[1].split(',');
      const l=Object.fromEntries(columns.map((k,i)=>[k,args[i]]));l.id=nextId++;l.notifie=args.at(-1);l.vu=args.at(-3);l.notif_tentatives=0;allLeads.push(l);return {lastID:l.id};
    }
    if(sql.includes('UPDATE leads SET notifie=1')){const l=allLeads.find(x=>x.id===args[0]);l.notifie=1;}
    return {changes:1};
  }
};
const leads=load('leads.js',{'./database':db,'./google':{sendMail:async p=>sent.push(p)},'./lib':lib});
test('normalisation Facebook form et questions personnalisées',()=>{
  const l=leads.normalize({id:'123',field_data:[{name:'full_name',values:['Marie Dubois']},{name:'phone_number',values:['514 444 6666']},{name:'age_toiture',values:['15 ans']}],campaign_name:'Automne 2026'},'meta');
  assert.equal(l.prenom,'Marie');assert.equal(l.nom,'Dubois');assert.match(l.message,/age_toiture : 15 ans/);assert.equal(l.campagne,'Automne 2026');
});
test('nouveau lead inséré une fois et notification envoyée une fois',async()=>{
  const input={id:'meta-1',full_name:'Marie Dubois',phone_number:'5144446666',city:'Laval'};
  const first=await leads.ingestLead(input,{source:'meta'});
  assert.equal(first.duplicate,false);
  const second=await leads.ingestLead(input,{source:'meta'});
  assert.equal(second.duplicate,true);
  assert.equal(allLeads.length,1);assert.equal(sent.length,1);assert.equal(allLeads[0].notifie,1);
});