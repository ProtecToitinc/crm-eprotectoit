import React, { useEffect, useState } from 'react';
import { RefreshCw, Play, Check, X, Undo2, Download, ArrowLeft } from 'lucide-react';
import { api } from '../api';
import { cardStyle, btnGhost, btnAccent, inputStyle, textareaStyle, Field } from '../components/ui';
import { useLoad, ErrorNote, Empty, Loading, Stat, statGrid, Pill } from '../components/bits';
import { useUI } from '../context/UIContext';

const TABS = [['resume', 'Résumé'], ['optim', 'À approuver'], ['contenu', 'Articles'], ['details', 'Détails techniques']];
const SEV = { critical: ['Critique', '#c4584f'], high: ['Élevé', '#c17a3f'], medium: ['Moyen', '#8a8f98'], low: ['Faible', '#8a8f98'] };
const STATUS = { pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté', draft: 'Brouillon', queued: 'En file', running: 'En cours', done: 'Terminé', failed: 'Échoué' };
const FIELD = { title: 'Titre affiché dans Google', description: 'Description affichée dans Google', h1: 'Grand titre de la page' };
const GRADE = { urgent: ['À corriger', '#c4584f'], moyen: ['À améliorer', '#c17a3f'], bon: ['Bonne santé', '#5f9d5f'] };
const WHO_HUE = { agent: '#5f9d5f', claude: '#5b8fb9', toi: '#c17a3f' };
const th = { textAlign: 'left', padding: '9px 12px', fontSize: 11.5, color: 'var(--fg-muted)', fontWeight: 800, whiteSpace: 'nowrap' };
const td = { padding: '10px 12px', borderTop: '1px solid var(--border)', verticalAlign: 'top' };
const right = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const notice = { ...cardStyle, padding: 14, marginBottom: 16, color: 'var(--fg-muted)', fontSize: 13.5 };
const h2 = { fontSize: 14, fontWeight: 800, margin: '22px 0 10px' };
const muted = { color: 'var(--fg-muted)', fontSize: 12.5 };
const rowWrap = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' };

const date = s => (s ? new Date(s).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const num = n => (n == null ? '—' : Number(n).toLocaleString('fr-CA'));
const path = u => { try { return new URL(u).pathname || '/'; } catch { return u; } };

function useAct(reload) {
  const { showToast } = useUI();
  const [busy, setBusy] = useState(false);
  const act = async (fn, ok) => {
    setBusy(true);
    try { await fn(); if (ok) showToast(ok); await reload(); }
    catch (e) { showToast(e.message); }
    finally { setBusy(false); }
  };
  return [act, busy];
}

function Resume({ go }) {
  const { data: s, error, loading } = useLoad(() => api.seo.summary(), []);
  if (loading && !s) return <Loading />;
  if (!s) return <ErrorNote>{error}</ErrorNote>;
  const [label, hue] = GRADE[s.grade] || ['En attente', '#8a8f98'];
  const waiting = s.ready.suggestions + s.ready.articles;
  const missing = s.setup.filter(x => !x.ok);
  const fam = f => (
    <div key={f.key} style={{ ...cardStyle, padding: 16, marginBottom: 10 }}>
      <div style={{ ...rowWrap, justifyContent: 'space-between' }}><strong style={{ fontSize: 15 }}>{f.title}</strong><Pill hue={WHO_HUE[f.who]}>{f.whoLabel}</Pill></div>
      <p style={{ fontSize: 13.5, margin: '8px 0 6px' }}>{f.why}</p>
      <p style={{ fontSize: 13.5, margin: 0, fontWeight: 700 }}>{f.next}</p>
    </div>
  );
  return (
    <div>
      <div style={{ ...cardStyle, padding: 20, marginBottom: 14 }}>
        <Pill hue={hue}>{label}</Pill>
        <div style={{ fontSize: 20, fontWeight: 800, margin: '10px 0 6px', lineHeight: 1.25 }}>{s.headline}</div>
        <div style={muted}>{s.lastCheck ? `L’agent a vérifié ${s.pages} pages le ${date(s.lastCheck)}. Il revérifie tout seul chaque matin.` : 'La première vérification se lancera toute seule une fois le CRM en ligne.'}</div>
      </div>

      {waiting > 0 && (
        <button onClick={() => go(s.ready.suggestions ? 'optim' : 'contenu')} style={{ ...btnAccent, width: '100%', height: 'auto', padding: 14, marginBottom: 14, justifyContent: 'center' }}>
          L’agent a préparé {waiting} chose{waiting > 1 ? 's' : ''} pour toi : voir et répondre
        </button>
      )}

      <div style={statGrid}>
        <Stat label="Personnes venues de Google (28 jours)" value={s.traffic ? num(s.traffic.clicks) : 'Bientôt'} hint={s.traffic ? `Avant : ${num(s.traffic.previousClicks)}` : undefined} />
        <Stat label="Fois où Google t’a montré" value={s.traffic ? num(s.traffic.impressions) : 'Bientôt'} />
      </div>

      {s.families.length > 0 && <><div style={h2}>Ce qui bloque, du plus important au moins important</div>{s.families.map(fam)}</>}

      <div style={h2}>Ce que l’agent fait tout seul</div>
      <div style={{ ...cardStyle, padding: 16, fontSize: 13.5 }}>
        <div>Chaque matin : il vérifie tout ton site et prépare des améliorations de textes.</div>
        <div>Chaque lundi : il regarde tes résultats Google et écrit un nouvel article.</div>
        <div>Le 1er du mois : il fait un rapport complet.</div>
        <div style={{ ...muted, marginTop: 8 }}>Rien n’est publié sans ton oui.</div>
      </div>

      {missing.length > 0 && <>
        <div style={h2}>Pour que l’agent travaille à 100 %</div>
        {missing.map(x => <div key={x.label} style={{ ...cardStyle, padding: 12, marginBottom: 8, fontSize: 13.5 }}><strong>{x.label}</strong> : à connecter. <span style={{ color: 'var(--fg-muted)' }}>{x.why}</span></div>)}
      </>}
    </div>
  );
}

function Details() {
  const [sub, setSub] = useState('audit');
  const SUB = { audit: ['Problèmes détectés', Audit], mots: ['Mots-clés', MotsCles], activite: ['Journal de l’agent', Activite], avance: ['Réglages', Tableau] };
  const View = SUB[sub][1];
  return (
    <div>
      <div style={{ ...rowWrap, marginBottom: 14 }}>{Object.entries(SUB).map(([k, [l]]) => <button key={k} style={sub === k ? btnAccent : btnGhost} onClick={() => setSub(k)}>{l}</button>)}</div>
      <View />
    </div>
  );
}

function Tableau() {
  const { data: o, error, loading, reload } = useLoad(() => api.seo.overview(), []);
  const [act, busy] = useAct(reload);
  useEffect(() => { if (!o?.running) return undefined; const t = setTimeout(reload, 4000); return () => clearTimeout(t); }, [o]);
  if (loading && !o) return <Loading />;
  if (!o) return <ErrorNote>{error}</ErrorNote>;
  const r = o.run, g = o.gsc?.current, c = o.connections;
  const gscEmpty = c.searchConsole ? 'Synchro à venir' : 'Non connecté';
  const missing = [!c.searchConsole && 'Search Console', !c.analytics && 'Google Analytics 4', !c.ai && 'clé IA Anthropic', !c.pageSpeedKey && 'clé PageSpeed'].filter(Boolean);
  const stat = (label, value, empty = 'Non disponible', hue) => <Stat label={label} value={value ?? empty} hue={hue} />;
  const modeBtn = (id, label) => <button style={o.mode === id ? btnAccent : btnGhost} disabled={busy} onClick={() => act(() => api.seo.mode(id), 'Mode changé')}>{label}</button>;
  return (
    <div>
      <div style={{ ...rowWrap, marginBottom: 16 }}>
        <button style={btnAccent} disabled={busy} onClick={() => act(() => api.seo.run('audit'), 'Audit lancé')}><Play size={15} /> Lancer un audit</button>
        <button style={btnGhost} disabled={busy} onClick={() => act(() => api.seo.run('sync'), 'Synchronisation lancée')}><RefreshCw size={15} /> Synchroniser Google</button>
        <span style={muted}>{o.site}{r ? ` · dernier audit ${date(r.finished_at)}` : ''}</span>
      </div>
      {o.running > 0 && <div style={notice}>Une tâche est en cours. Cette page se met à jour toute seule.</div>}
      {missing.length > 0 && <div style={notice}>À connecter : {missing.join(', ')}. Les cases vides restent vides : aucune donnée n’est simulée.</div>}
      <div style={statGrid}>
        {stat('Santé technique', r ? `${r.health}/100` : null, 'Aucun audit')}
        {stat('Problèmes critiques', r?.critical, 'Aucun audit', '#c4584f')}
        {stat('Pages sans problème majeur', r ? `${o.optimized}/${r.pages}` : null, 'Aucun audit')}
        {stat('Clics Google (28 j)', g ? num(g.clicks) : null, gscEmpty)}
        {stat('Impressions', g ? num(g.impressions) : null, gscEmpty)}
        {stat('CTR moyen', g ? `${(g.ctr * 100).toFixed(1)} %` : null, gscEmpty)}
        {stat('Position moyenne', g ? Number(g.position).toFixed(1) : null, gscEmpty)}
        {stat('Soumissions organiques (30 j)', o.ga4 ? num(o.ga4.conversions) : null, c.analytics ? 'Synchro à venir' : 'Non connecté')}
        {stat('PageSpeed mobile', o.psi ? `${o.psi.mobile.score}/100` : null, 'Pas mesuré')}
        {stat('PageSpeed ordinateur', o.psi ? `${o.psi.desktop.score}/100` : null, 'Pas mesuré')}
      </div>
      <div style={h2}>Mode de l’agent</div>
      <div style={rowWrap}>
        {modeBtn('observation', '1. Observation')}
        {modeBtn('recommendation', '2. Recommandations')}
        <button style={btnGhost} disabled title="Exige un accès sécurisé au code du site">3. Auto-optimisation (verrouillé)</button>
      </div>
      <p style={muted}>Le mode 3 reste verrouillé tant que le code du site n’est pas relié à l’agent.</p>
      {o.history.length > 0 && <>
        <div style={h2}>Derniers audits</div>
        <div style={{ ...cardStyle, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr><th style={th}>Date</th><th style={{ ...th, ...right }}>Santé</th><th style={{ ...th, ...right }}>Problèmes</th><th style={{ ...th, ...right }}>Critiques</th></tr></thead>
            <tbody>{o.history.map(h => <tr key={h.started_at}><td style={td}>{date(h.started_at)}</td><td style={{ ...td, ...right }}>{h.health}</td><td style={{ ...td, ...right }}>{h.total}</td><td style={{ ...td, ...right }}>{h.critical}</td></tr>)}</tbody>
          </table>
        </div>
      </>}
    </div>
  );
}

function Audit() {
  const { data, error, loading } = useLoad(() => api.seo.issues(), []);
  const [filter, setFilter] = useState('all');
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote>{error}</ErrorNote>;
  if (!data.length) return <Empty>Aucun résultat. Lance un audit depuis le tableau de bord.</Empty>;
  const groups = new Map();
  data.filter(i => filter === 'all' || i.severity === filter).forEach(i => groups.set(i.rule, [...(groups.get(i.rule) || []), i]));
  const count = s => data.filter(i => i.severity === s).length;
  const chip = (k, l) => <button key={k} style={filter === k ? btnAccent : btnGhost} onClick={() => setFilter(k)}>{l}</button>;
  return (
    <div>
      <div style={{ ...rowWrap, marginBottom: 14 }}>
        {chip('all', `Tous (${data.length})`)}
        {Object.entries(SEV).map(([k, [l]]) => chip(k, `${l} (${count(k)})`))}
      </div>
      {[...groups.values()].map(g => {
        const i = g[0], [label, hue] = SEV[i.severity];
        return (
          <details key={i.rule} style={{ ...cardStyle, padding: 14, marginBottom: 8 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}><Pill hue={hue}>{label}</Pill> {i.title} <span style={muted}>· {g.length}</span></summary>
            <p style={{ fontSize: 13.5 }}>{i.explanation}</p>
            <p style={{ fontSize: 13.5 }}><strong>Correction :</strong> {i.fix}</p>
            <p style={muted}>SEO {i.seo}/5 · Commercial {i.commercial}/5 · Facilité {i.ease}/5</p>
            {g.map(x => <div key={x.id} style={{ ...muted, overflowWrap: 'anywhere' }}>{path(x.url)}{x.evidence ? ` — ${x.evidence}` : ''}</div>)}
          </details>
        );
      })}
    </div>
  );
}

function MotsCles() {
  const { data, error, loading } = useLoad(() => api.seo.keywords(), []);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote>{error}</ErrorNote>;
  const hasData = data.some(k => k.impressions != null);
  return (
    <div>
      {!hasData && <div style={notice}>Search Console n’a pas encore fourni de données. Clics, impressions et positions restent vides. Le volume de recherche n’est jamais estimé.</div>}
      <div style={{ ...cardStyle, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640, fontSize: 13 }}>
          <thead><tr><th style={th}>Mot-clé</th><th style={th}>Groupe</th><th style={{ ...th, ...right }}>Priorité</th><th style={{ ...th, ...right }}>Clics</th><th style={{ ...th, ...right }}>Impr.</th><th style={{ ...th, ...right }}>Position</th><th style={{ ...th, ...right }}>Évolution</th></tr></thead>
          <tbody>{data.map(k => (
            <tr key={k.keyword}>
              <td style={td}>{k.keyword} {k.relevance <= 2 && <Pill hue="#c17a3f">offre à confirmer</Pill>}</td>
              <td style={{ ...td, color: 'var(--fg-muted)' }}>{k.group}</td>
              <td style={{ ...td, ...right }}>{k.priority}</td><td style={{ ...td, ...right }}>{num(k.clicks)}</td><td style={{ ...td, ...right }}>{num(k.impressions)}</td>
              <td style={{ ...td, ...right }}>{k.position ?? '—'}</td>
              <td style={{ ...td, ...right }}>{k.positionChange == null ? '—' : `${k.positionChange > 0 ? '+' : ''}${k.positionChange}`}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function Optimisations() {
  const { data, error, loading, reload } = useLoad(() => Promise.all([api.seo.suggestions(), api.seo.overview()]), []);
  const [act, busy] = useAct(reload);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote>{error}</ErrorNote>;
  const [list, o] = data;
  const can = o.connections.ai && o.mode === 'recommendation';
  const pending = list.filter(s => s.status === 'pending'), done = list.filter(s => s.status !== 'pending');
  const box = { background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, overflowWrap: 'anywhere', fontSize: 13.5 };
  const exportApproved = () => act(async () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(await api.seo.approved(), null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'seo-approuve.json' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  const item = s => (
    <div key={s.id} style={{ ...cardStyle, padding: 14, marginBottom: 8 }}>
      <div style={{ ...rowWrap, justifyContent: 'space-between' }}><div><strong>{FIELD[s.field] || s.field}</strong> <span style={muted}>{path(s.url)}</span></div><Pill>{STATUS[s.status]}</Pill></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, margin: '10px 0' }}>
        <div style={box}><div style={muted}>Avant</div>{s.before_text || <em>vide</em>}</div>
        <div style={box}><div style={muted}>Après</div>{s.after_text}</div>
      </div>
      <p style={{ fontSize: 13.5 }}>{s.reason}</p>
      <p style={muted}>Impact estimé : {s.impact} · Confiance : {s.confidence}{s.needs_review ? ` · À vérifier : ${s.needs_review}` : ''}</p>
      <div style={rowWrap}>
        {s.status === 'pending'
          ? <><button style={btnAccent} disabled={busy} onClick={() => act(() => api.seo.decide(s.id, 'approve'))}><Check size={15} /> Approuver</button><button style={btnGhost} disabled={busy} onClick={() => act(() => api.seo.decide(s.id, 'reject'))}><X size={15} /> Rejeter</button></>
          : <button style={btnGhost} disabled={busy} onClick={() => act(() => api.seo.decide(s.id, 'undo'))}><Undo2 size={15} /> Retour arrière</button>}
      </div>
    </div>
  );
  return (
    <div>
      <div style={{ ...rowWrap, marginBottom: 14 }}>
        {pending.some(s => !s.needs_review) && <button style={btnAccent} disabled={busy} onClick={() => act(() => api.seo.approveSafe(), 'Propositions sûres approuvées')}><Check size={15} /> Tout approuver (sauf ce qui demande vérification)</button>}
        <button style={btnGhost} disabled={!can || busy} onClick={() => act(() => api.seo.run('suggest'), 'Génération lancée')}>Préparer maintenant</button>
      </div>
      <p style={muted}>L’agent prépare ces textes tout seul. « Approuver » veut dire : d’accord pour mettre ce texte sur le site. Le site ne change pas encore automatiquement.</p>
      {!can && <div style={notice}>{o.connections.ai ? 'Passe en mode Recommandations pour générer des propositions.' : 'Ajoute ANTHROPIC_API_KEY dans Railway pour activer les propositions.'}</div>}
      {pending.length ? pending.map(item) : <Empty>Aucune proposition en attente.</Empty>}
      {done.length > 0 && <><div style={h2}>Historique</div>{done.map(item)}<button style={btnGhost} onClick={exportApproved}><Download size={15} /> Exporter les changements approuvés</button></>}
    </div>
  );
}

function Contenu() {
  const { showToast } = useUI();
  const { data, error, loading, reload } = useLoad(() => Promise.all([api.seo.articles(), api.seo.overview()]), []);
  const [editing, setEditing] = useState(null);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote>{error}</ErrorNote>;
  const [list, o] = data;
  const generate = async e => {
    e.preventDefault();
    setBusy(true);
    try { await api.seo.createArticle(topic); setTopic(''); showToast('Brouillon créé'); await reload(); }
    catch (x) { showToast(x.message); }
    finally { setBusy(false); }
  };
  const save = async status => {
    try { await api.seo.updateArticle(editing.id, { ...editing, status }); showToast('Article enregistré'); setEditing(null); await reload(); }
    catch (x) { showToast(x.message); }
  };
  if (editing) return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <button style={{ ...btnGhost, marginBottom: 12 }} onClick={() => setEditing(null)}><ArrowLeft size={15} /> Retour</button>
      <p style={muted}>Mot-clé : {editing.keyword} · Intention : {editing.intent} · URL : /{editing.slug}</p>
      <Field label="Titre"><input style={inputStyle} value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} /></Field>
      <Field label="Méta-description"><input style={inputStyle} value={editing.meta} onChange={e => setEditing({ ...editing, meta: e.target.value })} /></Field>
      <Field label="Texte"><textarea style={{ ...textareaStyle, minHeight: 320 }} value={editing.body} onChange={e => setEditing({ ...editing, body: e.target.value })} /></Field>
      <p style={muted}>Appel à l’action : {editing.cta}</p>
      <div style={rowWrap}><button style={btnGhost} onClick={() => save('draft')}>Enregistrer le brouillon</button><button style={btnAccent} onClick={() => save('approved')}>Approuver</button><button style={btnGhost} onClick={() => save('rejected')}>Rejeter</button></div>
    </div>
  );
  return (
    <div>
      <form onSubmit={generate} style={{ ...rowWrap, marginBottom: 14 }}>
        <input aria-label="Sujet de l’article" style={{ ...inputStyle, flex: 1, minWidth: 220 }} placeholder="Ex. : Pourquoi nettoyer ses gouttières avant l’hiver?" value={topic} onChange={e => setTopic(e.target.value)} disabled={!o.connections.ai || busy} />
        <button style={btnAccent} disabled={!o.connections.ai || busy}>{busy ? 'Rédaction…' : 'Générer le brouillon'}</button>
      </form>
      {!o.connections.ai && <div style={notice}>Ajoute ANTHROPIC_API_KEY dans Railway pour rédiger des articles.</div>}
      {list.length ? list.map(a => (
        <div key={a.id} style={{ ...cardStyle, padding: 14, marginBottom: 8, ...rowWrap, justifyContent: 'space-between' }}>
          <div><strong>{a.title}</strong> <Pill>{STATUS[a.status]}</Pill></div><button style={btnGhost} onClick={() => setEditing(a)}>Ouvrir</button>
        </div>
      )) : <Empty>Aucun brouillon.</Empty>}
    </div>
  );
}

function Activite() {
  const { data, error, loading } = useLoad(() => api.seo.activity(), []);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNote>{error}</ErrorNote>;
  return (
    <div>
      <p style={muted}>Audit chaque jour dès 6 h, analyse le lundi, rapport le 1er du mois (heure de Montréal).</p>
      <div style={h2}>Tâches</div>
      {data.jobs.length ? <div style={{ ...cardStyle, overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520, fontSize: 13 }}>
        <thead><tr><th style={th}>Tâche</th><th style={th}>Statut</th><th style={th}>Essais</th><th style={th}>Créée</th><th style={th}>Erreur</th></tr></thead>
        <tbody>{data.jobs.map(j => <tr key={j.id}><td style={td}>{j.type}</td><td style={td}>{STATUS[j.status] || j.status}</td><td style={td}>{j.attempts}</td><td style={td}>{date(j.created_at)}</td><td style={td}>{j.error}</td></tr>)}</tbody>
      </table></div> : <Empty>Aucune tâche.</Empty>}
      {data.reports.length > 0 && <><div style={h2}>Rapports</div>{data.reports.map(r => <details key={r.id} style={{ ...cardStyle, padding: 14, marginBottom: 8 }}><summary style={{ cursor: 'pointer' }}>{r.period}</summary><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{r.body}</pre></details>)}</>}
      <div style={h2}>Journal</div>
      {data.log.length ? <div style={{ ...cardStyle, padding: 6 }}>{data.log.map(l => <div key={l.id} style={{ padding: '7px 8px', fontSize: 13, color: l.level === 'error' ? '#c4584f' : undefined }}><span style={muted}>{date(l.ts)}</span> · {l.message}</div>)}</div> : <Empty>Journal vide.</Empty>}
    </div>
  );
}

const VIEWS = { resume: Resume, optim: Optimisations, contenu: Contenu, details: Details };

export default function Seo() {
  const [tab, setTab] = useState('resume');
  const View = VIEWS[tab];
  return (
    <div>
      <div role="tablist" style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 18, paddingBottom: 2 }}>
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} style={{ ...(tab === k ? btnAccent : btnGhost), whiteSpace: 'nowrap', flex: 'none' }} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <View go={setTab} />
    </div>
  );
}
