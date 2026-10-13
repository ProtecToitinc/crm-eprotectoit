import React, {useEffect,useState} from 'react';
import {Copy,RefreshCw,ExternalLink} from 'lucide-react';
/** Intégration : <Integrations api={api}/> avec api.integrations, api.drive, api.meta. */
const style={box:{padding:18,background:'var(--surface,white)',border:'1px solid var(--border,#ddd)',borderRadius:14,marginBottom:18},button:{padding:'10px 12px',borderRadius:9,border:'1px solid var(--border,#ddd)',cursor:'pointer',background:'var(--surface,white)',color:'inherit'},input:{padding:10,border:'1px solid var(--border,#ddd)',borderRadius:9,background:'var(--surface,white)',color:'inherit',width:'100%',boxSizing:'border-box'}};
export default function Integrations({api}) {
  const [data,setData]=useState(null),[status,setStatus]=useState(null),[preview,setPreview]=useState(null),[secret,setSecret]=useState(null),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [form,setForm]=useState({metaPageId:'',metaPageToken:'',notifyEmails:'',driveRootId:'',driveLeadsId:''});
  const load=async()=>{
    try {
      const [d,s]=await Promise.all([api.integrations.get(),api.drive.status()]);
      setData(d);setStatus(s);
      setForm(v=>({...v,metaPageId:d.meta?.pageId||'',notifyEmails:d.notifications?.emails||'',driveRootId:d.drive?.rootId||'',driveLeadsId:d.drive?.leadsId||'',metaPageToken:''}));
      setError('');
    }catch(e){setError(e.message||'Impossible de charger les intégrations');}
  };
  useEffect(()=>{if(api?.integrations&&api?.drive)load();else setError('Brancher api.integrations et api.drive dans App.jsx');},[api]);
  const run=async(fn,success)=>{setBusy(true);setError('');setMessage('');try{const r=await fn();if(r?.ok===false)throw new Error(r.message||'Opération refusée');if(success)setMessage(success);await load();return r;}catch(e){setError(e.message||'Erreur');return null;}finally{setBusy(false);}};
  const save=()=>run(()=>api.integrations.save(form),'Configuration enregistrée');
  const sync=dry=>run(async()=>{const r=await api.drive.sync({dry,full:dry});setPreview(r);return r;},dry?'Aperçu prêt — aucune donnée CRM modifiée':'Synchronisation terminée');
  const copy=async value=>{await navigator.clipboard.writeText(value);setMessage('Copié dans le presse-papiers');};
  return <main style={{padding:24,color:'var(--fg,#ddd)'}}>
    <h1 style={{fontSize:28,marginTop:0}}>Intégrations</h1><p>Drive, formulaires Meta Ads et notifications de nouveaux leads.</p>
    {error&&<p role="alert" style={{color:'#c2410c'}}>{error}</p>}{message&&<p role="status" style={{color:'var(--accent,#2563eb)'}}>{message}</p>}
    <section style={style.box}><h2>Google — Agenda, Drive et Gmail</h2>
      <p>Autorise les 3 services dans la connexion Google de ton CRM. Drive et Gmail nécessitent leurs API activées dans Google Cloud.</p>
      <p>Depuis la page <a href="/calendrier">Calendrier</a>, rouvre l'autorisation Google en incluant Drive et Gmail.</p>
      <p>Dernier passage Drive : <strong>{status?.lastSync ? new Date(status.lastSync).toLocaleString('fr-CA') : 'Jamais'}</strong>.</p>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={style.button} disabled={busy} onClick={()=>sync(true)}>Aperçu sans modification</button><button style={style.button} disabled={busy||!preview?.ok||preview?.dry!==true} onClick={()=>{if(window.confirm('Appliquer la synchronisation Drive? Vérifie les rapprochements avant de continuer.'))sync(false);}}>Synchroniser maintenant</button><button style={style.button} onClick={load}><RefreshCw size={16}/> Actualiser</button></div>
      {preview&&<div style={{marginTop:14}}><strong>{preview.created||0} à créer · {preview.matched||0} rapprochés · {preview.review||0} à valider · {preview.errors||0} erreurs</strong><details><summary>Afficher les éléments analysés ({preview.details?.length||0})</summary><div style={{maxHeight:340,overflow:'auto'}}>{preview.details?.map((x,i)=><p key={i} style={{borderBottom:'1px solid var(--border,#ddd)',paddingBottom:8}}><strong>{x.action} : {x.name}</strong><span> {x.reason||''}</span>{x.preview&&<small style={{display:'block'}}>Client : {[x.preview.prenom,x.preview.nom].join(' ')} — Total : {x.preview.total||'–'} $ — Signature : {x.preview.signe?'Oui':'Non'}</small>}</p>)}</div></details></div>}
      {!!status?.review?.length&&<details style={{marginTop:14}}><summary>Éléments à valider ({status.review.length})</summary>{status.review.map(x=><p key={x.drive_id}>{x.name} — {x.message} {x.client_id&&`(client #${x.client_id})`}</p>)}</details>}
    </section>
    <section style={style.box}><h2>Meta Ads — leads</h2><p>Renseigne l'ID de Page et son jeton Meta dans ce formulaire. Le jeton ne sera plus affiché après enregistrement.</p>
      <label>ID de Page<input style={style.input} value={form.metaPageId} onChange={e=>setForm(v=>({...v,metaPageId:e.target.value}))}/></label>
      <label>Jeton de Page {data?.meta?.hasToken?'(déjà enregistré)':''}<input type="password" autoComplete="off" placeholder="Laisser vide pour conserver le jeton existant" style={style.input} value={form.metaPageToken} onChange={e=>setForm(v=>({...v,metaPageToken:e.target.value}))}/></label>
      <p>Dernière vérification réussie : {data?.meta?.lastOk||'Aucune'}. {data?.meta?.lastError&&<span style={{color:'#c2410c'}}>Erreur : {data.meta.lastError}</span>}</p>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={style.button} onClick={save} disabled={busy}>Enregistrer</button><button style={style.button} onClick={()=>run(()=>api.meta.poll(),'Leads Meta vérifiés')} disabled={busy}>Vérifier Meta</button><button style={style.button} onClick={()=>{if(window.confirm('Importer les leads passés sans envoyer de courriels?'))run(()=>api.meta.importHistory(),'Historique importé silencieusement');}} disabled={busy}>Importer l'historique</button><button style={style.button} onClick={()=>run(()=>api.meta.disconnect(),'Meta déconnecté')} disabled={busy}>Déconnecter</button></div>
    </section>
    <section style={style.box}><h2>Courriels de notification</h2>
      <label>Destinataires (séparés par des virgules)<input style={style.input} value={form.notifyEmails} onChange={e=>setForm(v=>({...v,notifyEmails:e.target.value}))}/></label>
      <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}><button style={style.button} onClick={save} disabled={busy}>Enregistrer</button><button style={style.button} onClick={()=>{if(window.confirm('Envoyer un courriel de test maintenant?'))run(()=>api.integrations.testEmail({to:form.notifyEmails.split(/[;,\s]+/)[0]}),'Courriel de test envoyé');}} disabled={busy}>Envoyer un courriel test</button></div>
    </section>
    <section style={style.box}><h2>Webhook (Make / Zapier)</h2><p>Utilise une URL privée pour ajouter des leads à partir de Facebook Lead Ads. Ne partage pas la clé publiquement.</p>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={style.button} onClick={async()=>{const r=await api.integrations.webhook();setSecret(r);}}>Afficher l'URL privée</button><button style={style.button} onClick={()=>{if(window.confirm('Régénérer la clé invalidera les anciennes connexions Make/Zapier. Continuer?'))run(async()=>{const r=await api.integrations.renewWebhook();setSecret(r);return r;},'Nouvelle clé générée');}}>Régénérer</button></div>
      {secret?.url&&<div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}><input readOnly style={{...style.input,flex:'1 1 300px'}} type="password" value={secret.url}/><button style={style.button} onClick={()=>copy(secret.url)}><Copy size={15}/> Copier</button></div>}
    </section>
    <section style={style.box}><h2>Dossiers Drive</h2>
      <label>ID du dossier Soumissions<input style={style.input} value={form.driveRootId} onChange={e=>setForm(v=>({...v,driveRootId:e.target.value}))}/></label>
      <label>ID du dossier Leads<input style={style.input} value={form.driveLeadsId} onChange={e=>setForm(v=>({...v,driveLeadsId:e.target.value}))}/></label>
      <button style={{...style.button,marginTop:12}} onClick={save} disabled={busy}>Enregistrer</button>
    </section>
    <p style={{color:'var(--fg-muted,#64748b)',fontSize:13}}>La connexion à Meta nécessite les permissions Facebook Lead Ads et l'accès aux prospects sur la Page.</p>
  </main>;
}