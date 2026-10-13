import React, { useEffect, useMemo, useState } from 'react';
import { Phone, Mail, UserPlus, Trash2, RefreshCw, Plus } from 'lucide-react';

/**
 * Intégration : <Opportunites api={api} />.
 * api.leads doit fournir list(), count(), create(body), update(id,body), remove(id), convert(id), markSeen().
 */
const styles = {
  page:{padding:'24px',color:'var(--fg, #ddd)'},
  card:{background:'var(--surface, white)',border:'1px solid var(--border, #dfe4ed)',borderRadius:14,padding:18},
  btn:{cursor:'pointer',borderRadius:9,border:'1px solid var(--border, #dfe4ed)',padding:'9px 12px',background:'var(--surface, white)',color:'inherit'},
  input:{boxSizing:'border-box',padding:'10px 12px',borderRadius:9,border:'1px solid var(--border, #dfe4ed)',background:'var(--surface, white)',color:'inherit',width:'100%'},
  muted:{color:'var(--fg-muted, #64748b)',fontSize:13},
};
const states=[['tous','Tous'],['nouveau','Nouveaux'],['contacte','Contactés'],['qualifie','Qualifiés'],['converti','Convertis'],['perdu','Perdus']];
const empty={prenom:'',nom:'',telephone:'',email:'',ville:'',message:''};
const fullName=l=>[l.prenom,l.nom].filter(Boolean).join(' ')||'Sans nom';
export default function Opportunites({api}) {
  const [leads,setLeads]=useState([]);
  const [filter,setFilter]=useState('tous');
  const [q,setQ]=useState('');
  const [sort,setSort]=useState('recents');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [draft,setDraft]=useState(null);
  const [message,setMessage]=useState('');
  const reload=async()=>{
    if(!api?.leads) {setError('Connecter le module API leads dans App.jsx.');return;}
    setBusy(true);
    try {const items=await api.leads.list();setLeads(Array.isArray(items)?items:items?.leads||[]);setError('');}
    catch(e){setError(e.message||'Impossible de charger les leads');}
    finally{setBusy(false);}
  };
  useEffect(()=>{reload();},[api]);
  useEffect(()=>{if(api?.leads?.markSeen) api.leads.markSeen().catch(()=>{});},[api]);
  const counts=useMemo(()=>Object.fromEntries(states.map(([key])=>[key,key==='tous'?leads.length:leads.filter(l=>l.statut===key).length])),[leads]);
  const shown=useMemo(()=>leads.filter(l=>filter==='tous'||l.statut===filter).filter(l=>[l.prenom,l.nom,l.telephone,l.email,l.ville,l.campagne,l.annonce,l.message].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()))).sort((a,b)=>{
    if(sort==='nom')return fullName(a).localeCompare(fullName(b),'fr');
    const delta=Date.parse(b.recu_at||b.created_at||0)-Date.parse(a.recu_at||a.created_at||0);
    return sort==='anciens'?-delta:delta;
  }),[leads,filter,q,sort]);
  const action=async(fn,success)=>{setError('');setMessage('');try {await fn();setMessage(success);await reload();}catch(e){setError(e.message||'Erreur');}};
  const edit=(id,body)=>action(()=>api.leads.update(id,body),'Lead mis à jour');
  return <section style={styles.page}>
    <header style={{display:'flex',gap:12,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',marginBottom:18}}>
      <div><h1 style={{fontSize:28,margin:0}}>Opportunités</h1><p style={styles.muted}>Prospects provenant de Meta Ads et des formulaires connectés</p></div>
      <div style={{display:'flex',gap:8}}><button style={styles.btn} onClick={reload} disabled={busy}><RefreshCw size={16}/> Actualiser</button><button style={{...styles.btn,background:'var(--accent, #2563eb)',color:'white'}} onClick={()=>setDraft({...empty})}><Plus size={16}/> Ajouter</button></div>
    </header>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(135px, 1fr))',gap:10,marginBottom:18}}>
      {states.slice(1,5).map(([k,label])=><div key={k} style={styles.card}><div style={styles.muted}>{label}</div><strong style={{fontSize:26}}>{counts[k]}</strong></div>)}
    </div>
    <div style={{...styles.card,marginBottom:12,display:'flex',flexWrap:'wrap',gap:9}}>
      {states.map(([k,label])=><button key={k} onClick={()=>setFilter(k)} style={{...styles.btn,background:filter===k?'var(--accent, #2563eb)':undefined,color:filter===k?'white':undefined}}>{label} ({counts[k]})</button>)}
    </div>
    <div style={{display:'grid',gridTemplateColumns:'minmax(180px,1fr) 175px',gap:10,marginBottom:14}}>
      <input aria-label="Rechercher un prospect" placeholder="Rechercher un nom, ville, campagne..." value={q} onChange={e=>setQ(e.target.value)} style={styles.input}/>
      <select aria-label="Trier" style={styles.input} value={sort} onChange={e=>setSort(e.target.value)}><option value="recents">Plus récents</option><option value="anciens">Plus anciens</option><option value="nom">Nom A-Z</option></select>
    </div>
    {error&&<p role="alert" style={{color:'#c2410c'}}>{error}</p>}{message&&<p role="status">{message}</p>}
    <div style={{display:'grid',gap:12}}>
      {shown.map(l=><article key={l.id} style={styles.card}>
        <div style={{display:'flex',alignItems:'start',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
          <div><strong style={{fontSize:18}}>{fullName(l)}</strong> {l.vu===0&&<span style={{color:'var(--accent, #2563eb)',fontWeight:700}}> ● Nouveau</span>}<p style={{...styles.muted,margin:'7px 0 0'}}>{[l.ville,l.campagne,l.annonce].filter(Boolean).join(' · ')||'Saisie manuelle'}</p></div>
          <select aria-label={`Statut de ${fullName(l)}`} style={{...styles.input,width:160}} value={l.statut||'nouveau'} onChange={e=>edit(l.id,{statut:e.target.value})}>{states.slice(1).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select>
        </div>
        <p style={{display:'flex',gap:18,flexWrap:'wrap'}}>{l.telephone&&<a href={`tel:${l.telephone}`}><Phone size={15}/> {l.telephone}</a>}{l.email&&<a href={`mailto:${l.email}`}><Mail size={15}/> {l.email}</a>}</p>
        {l.message&&<p style={{whiteSpace:'pre-wrap',fontSize:14,background:'var(--surface-2, transparent)',padding:10,borderRadius:8}}>{l.message}</p>}
        <div style={{...styles.muted,marginBottom:12}}>{l.recu_at ? new Date(l.recu_at).toLocaleString('fr-CA') : ''} {l.plateforme&&`· ${l.plateforme}`}</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {l.statut!=='converti'&&<button style={styles.btn} onClick={()=>action(()=>api.leads.convert(l.id),'Prospect converti en client')}><UserPlus size={15}/> Convertir en client</button>}
          {l.telephone&&<a style={styles.btn} href={`tel:${l.telephone}`}>Appeler</a>}
          <button style={{...styles.btn,marginLeft:'auto'}} onClick={()=>{if(window.confirm('Supprimer ce prospect du CRM?'))action(()=>api.leads.remove(l.id),'Lead supprimé');}} title="Supprimer"><Trash2 size={16}/></button>
        </div>
      </article>)}
      {!busy&&!shown.length&&<div style={{...styles.card,textAlign:'center',...styles.muted}}>Aucune opportunité pour ce filtre.</div>}
    </div>
    {draft&&<div role="dialog" aria-modal="true" aria-label="Ajouter une opportunité" style={{position:'fixed',inset:0,background:'#0009',display:'grid',placeItems:'center',zIndex:100,padding:16}}>
      <form style={{...styles.card,width:'min(460px,100%)',maxHeight:'85vh',overflowY:'auto'}} onSubmit={e=>{e.preventDefault();action(()=>api.leads.create(draft),'Prospect ajouté');setDraft(null);}}>
        <h2>Ajouter un prospect</h2>
        {Object.keys(empty).map(k=><label key={k} style={{display:'block',marginBottom:10,textTransform:'capitalize'}}>{k}<input style={styles.input} value={draft[k]} onChange={e=>setDraft(d=>({...d,[k]:e.target.value}))}/></label>)}
        <div style={{display:'flex',gap:8,justifyContent:'end'}}><button type="button" style={styles.btn} onClick={()=>setDraft(null)}>Annuler</button><button type="submit" style={{...styles.btn,background:'var(--accent,#2563eb)',color:'white'}}>Ajouter</button></div>
      </form>
    </div>}
  </section>;
}