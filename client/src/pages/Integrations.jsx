import React, { useEffect, useState } from 'react';
import { Copy, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import { cardStyle, btnGhost, btnAccent, inputStyle, Field } from '../components/ui';
import { useLoad, ErrorNote, Pill, Loading, dollars2, notifyBadges } from '../components/bits';
import { useUI } from '../context/UIContext';

const Section = ({ title, children }) => <section style={{ ...cardStyle, padding: 18, marginBottom: 18 }}><h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800 }}>{title}</h2>{children}</section>;
const row = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };
const when = s => (s ? new Date(s).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }) : 'jamais');

export default function Integrations() {
  const { showToast } = useUI();
  const cfg = useLoad(() => api.integrations.get());
  const drive = useLoad(() => api.drive.status());
  const health = useLoad(() => api.health());
  const google = useLoad(() => api.google.status());
  const [form, setForm] = useState({});
  const [preview, setPreview] = useState(null);
  const [secret, setSecret] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState({}); // drive_id -> client_id choisi

  useEffect(() => {
    const d = cfg.data;
    if (d) setForm(f => ({ metaPageId: d.meta.pageId || '', metaPageToken: '', metaAdAccountId: d.ads?.accountId || '', metaAdsToken: '', notifyEmails: d.notifications.emails || '', driveRootId: d.drive.rootId || '', driveLeadsId: d.drive.leadsId || '', ...f, ...{ metaPageId: d.meta.pageId || '', notifyEmails: d.notifications.emails || '' } }));
  }, [cfg.data]);
  const refreshAll = () => { cfg.reload(); drive.reload(); health.reload(); google.reload(); notifyBadges(); };
  const run = async (fn, ok) => {
    setBusy(true); setErr('');
    try { const r = await fn(); if (r?.ok === false) throw new Error(r.message || 'Opération refusée'); if (ok) showToast(ok); refreshAll(); return r; }
    catch (e) { setErr(e.message || 'Erreur'); return null; } finally { setBusy(false); }
  };
  const save = () => run(() => api.integrations.save(form).then(() => setForm(f => ({ ...f, metaPageToken: '', metaAdsToken: '' }))), 'Configuration enregistrée');
  const connectGoogle = async () => {
    const { url } = await api.google.authUrl();
    const popup = window.open(url, 'google-auth', 'width=520,height=700');
    const t = setInterval(() => { if (!popup || popup.closed) { clearInterval(t); refreshAll(); } }, 800);
  };
  const [progress, setProgress] = useState(null);
  // La synchronisation tourne en arrière-plan sur le serveur : on interroge son avancement.
  const follow = async () => {
    for (let i = 0; i < 600; i++) {
      const r = await api.drive.run();
      setProgress(r.running ? r.progress || { done: 0, total: 0 } : null);
      if (!r.running) { setPreview(r.result ? { ...r.result, dry: r.dry } : null); return r; }
      await new Promise(res => setTimeout(res, 2000));
    }
    return null;
  };
  useEffect(() => { api.drive.run().then(r => { if (r.running) { setBusy(true); follow().finally(() => { setBusy(false); refreshAll(); }); } else if (r.result) setPreview({ ...r.result, dry: r.dry }); }).catch(() => {}); }, []); // eslint-disable-line
  const sync = dry => run(async () => {
    const started = await api.drive.sync({ dry, full: dry });
    if (!started.ok) return started;
    const r = await follow();
    if (r?.result && r.result.ok === false) return { ok: false, message: r.result.message };
    return { ok: true };
  }, dry ? 'Aperçu prêt — rien n’a été modifié' : 'Synchronisation terminée');
  const resolve = (id, action, client_id) => run(() => api.drive.resolve(id, { action, client_id }), 'Choix appliqué');
  const copy = async v => { await navigator.clipboard.writeText(v); showToast('Copié'); };

  const g = google.data, st = drive.data, h = health.data;
  const clientName = c => [c.prenom, c.nom].filter(Boolean).join(' ') + (c.ville ? ` (${c.ville})` : '');

  return (
    <div style={{ maxWidth: 980 }}>
      <ErrorNote>{err || cfg.error || drive.error}</ErrorNote>

      {h && (
        <Section title="État des connexions">
          {h.problems.length === 0
            ? <div style={{ ...row, color: '#5f9d5f', fontWeight: 700 }}><CheckCircle2 size={18} /> Tout fonctionne : Google, Meta, courriels et sauvegardes.</div>
            : h.problems.map(p => (
              <div key={p.id} style={{ ...row, color: p.level === 'erreur' ? '#c4584f' : '#c8924a', padding: '4px 0', fontWeight: 600 }}><AlertTriangle size={16} /> {p.message}</div>))}
        </Section>
      )}

      <Section title="Google — Agenda, Drive et Gmail">
        {!g?.configured && <p style={{ color: '#c4584f' }}>Google n’est pas configuré sur le serveur (variables GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).</p>}
        <div style={{ ...row, marginBottom: 10 }}>
          <Pill hue={g?.connected ? '#5f9d5f' : '#c4584f'}>{g?.connected ? 'Connecté' : 'Non connecté'}</Pill>
          <Pill hue={g?.calendar ? '#5f9d5f' : '#8a8580'}>Agenda {g?.calendar ? 'OK' : '—'}</Pill>
          <Pill hue={g?.drive ? '#5f9d5f' : '#c8924a'}>Drive {g?.drive ? 'OK' : 'à autoriser'}</Pill>
          <Pill hue={g?.gmail ? '#5f9d5f' : '#c8924a'}>Gmail {g?.gmail ? 'OK' : 'à autoriser'}</Pill>
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Drive et Gmail doivent aussi être activés dans Google Cloud (API Google Drive et API Gmail). Clique sur le bouton, puis accepte les trois autorisations.</p>
        <button style={btnAccent} onClick={connectGoogle} disabled={!g?.configured}>{g?.connected ? 'Réautoriser Google (ajouter Drive et Gmail)' : 'Connecter Google'}</button>
      </Section>

      <Section title="Google Drive — consultation seulement">
        <p style={{ fontSize: 13, color: 'var(--fg-muted)' }}>L'importation automatique des soumissions est désactivée pour éviter les doublons. Tu peux ajouter un PDF, un fichier Excel ou un autre document depuis la fiche de chaque client, dans « Soumissions du client ». Les anciens liens Drive restent disponibles.</p>
      </Section>

      <Section title="Meta Ads — leads">
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 0 }}>Les jetons sont chiffrés et ne sont jamais réaffichés. Sans jeton, tu peux brancher Make ou Zapier avec le webhook plus bas.</p>
        <Field label="ID de la Page Facebook"><input style={inputStyle} value={form.metaPageId || ''} onChange={e => setForm(f => ({ ...f, metaPageId: e.target.value }))} inputMode="numeric" /></Field>
        <Field label={`Jeton d’accès de la Page ${cfg.data?.meta.hasToken ? '(déjà enregistré)' : ''}`} style={{ marginTop: 10 }}><input type="password" name="meta-page-token" autoComplete="new-password" style={inputStyle} placeholder="Laisser vide pour conserver" value={form.metaPageToken || ''} onChange={e => setForm(f => ({ ...f, metaPageToken: e.target.value }))} /></Field>
        <Field label="ID du compte publicitaire (pour les coûts)" style={{ marginTop: 10 }}><input style={inputStyle} value={form.metaAdAccountId || ''} onChange={e => setForm(f => ({ ...f, metaAdAccountId: e.target.value }))} placeholder="Ex. 1234567890" /></Field>
        <Field label={`Jeton publicitaire (ads_read, optionnel) ${cfg.data?.ads?.hasToken ? '(déjà enregistré)' : ''}`} style={{ marginTop: 10 }}><input type="password" name="meta-ads-token" autoComplete="new-password" style={inputStyle} value={form.metaAdsToken || ''} onChange={e => setForm(f => ({ ...f, metaAdsToken: e.target.value }))} /></Field>
        <p style={{ fontSize: 13 }}>Dernière vérification réussie : <b>{when(cfg.data?.meta.lastOk)}</b>. {cfg.data?.meta.lastError && <span style={{ color: '#c4584f' }}>{cfg.data.meta.lastError}</span>}</p>
        <div style={row}>
          <button style={btnAccent} onClick={save} disabled={busy}>Enregistrer</button>
          <button style={btnGhost} onClick={() => run(() => api.metaAds.poll(), 'Meta vérifié')} disabled={busy}>Vérifier maintenant</button>
          <button style={btnGhost} onClick={() => window.confirm('Importer les anciens leads sans envoyer de courriels?') && run(() => api.metaAds.importHistory(), 'Historique importé sans notification')} disabled={busy}>Importer l’historique</button>
          <button style={btnGhost} onClick={() => window.confirm('Déconnecter Meta?') && run(() => api.metaAds.disconnect(), 'Meta déconnecté')} disabled={busy}>Déconnecter</button>
        </div>
      </Section>

      <Section title="Courriels de notification">
        <Field label="Destinataires (séparés par des virgules)"><input style={inputStyle} value={form.notifyEmails || ''} onChange={e => setForm(f => ({ ...f, notifyEmails: e.target.value }))} /></Field>
        <p style={{ fontSize: 13 }}>Dernier envoi réussi : <b>{when(h?.notifications.lastOk)}</b>. {h?.notifications.waiting > 0 && <span style={{ color: '#c8924a' }}>{h.notifications.waiting} lead(s) en attente d’envoi.</span>}</p>
        <div style={row}>
          <button style={btnAccent} onClick={save} disabled={busy}>Enregistrer</button>
          <button style={btnGhost} onClick={() => window.confirm('Envoyer un courriel de test maintenant?') && run(() => api.integrations.testEmail({ to: (form.notifyEmails || '').split(/[;,\s]+/)[0] }), 'Courriel de test envoyé')} disabled={busy}>Envoyer un courriel test</button>
        </div>
      </Section>

      <Section title="Webhook (Make / Zapier)">
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 0 }}>URL privée pour ajouter des leads. Ne la partage pas : elle contient la clé secrète.</p>
        <div style={row}>
          <button style={btnGhost} onClick={async () => setSecret(await api.integrations.webhook())}>Afficher l’URL privée</button>
          <button style={btnGhost} onClick={() => window.confirm('Régénérer la clé coupe les anciennes connexions Make/Zapier. Continuer?') && run(async () => { setSecret(await api.integrations.renewWebhook()); return {}; }, 'Nouvelle clé générée')}>Régénérer la clé</button>
        </div>
        {secret?.url && <div style={{ ...row, marginTop: 10 }}><input readOnly type="password" style={{ ...inputStyle, flex: '1 1 300px', width: 'auto' }} value={secret.url} /><button style={btnGhost} onClick={() => copy(secret.url)}><Copy size={15} /> Copier</button></div>}
      </Section>

      <Section title="Dossiers Drive">
        <Field label="ID du dossier Soumissions"><input style={inputStyle} value={form.driveRootId || ''} onChange={e => setForm(f => ({ ...f, driveRootId: e.target.value }))} /></Field>
        <Field label="ID du dossier Leads" style={{ marginTop: 10 }}><input style={inputStyle} value={form.driveLeadsId || ''} onChange={e => setForm(f => ({ ...f, driveLeadsId: e.target.value }))} /></Field>
        <button style={{ ...btnAccent, marginTop: 12 }} onClick={save} disabled={busy}>Enregistrer</button>
      </Section>
      {(cfg.loading || drive.loading) && <Loading />}
    </div>
  );
}
