import React, { useState } from 'react';
import { DatabaseBackup, Download, RotateCcw, Undo2, LogOut } from 'lucide-react';
import { api } from '../api';
import { cardStyle, btnGhost, btnAccent, btnDanger } from '../components/ui';
import { useLoad, ErrorNote, Loading, Pill } from '../components/bits';
import { parseDb } from '../lib/dates';
import { useUI } from '../context/UIContext';

const when = s => { const d = parseDb(s) || new Date(s); return isNaN(d) ? '—' : d.toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }); };
const KIND = { auto: 'Automatique', manuel: 'Manuelle', 'avant-restauration': 'Avant restauration' };
const Section = ({ title, children }) => <section style={{ ...cardStyle, padding: 18, marginBottom: 18 }}><h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800 }}>{title}</h2>{children}</section>;

export default function Parametres() {
  const { showToast } = useUI();
  const backups = useLoad(() => api.backups.list());
  const audit = useLoad(() => api.audit.list({ limit: 80 }));
  const sessions = useLoad(() => api.sessions());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (fn, ok) => { setBusy(true); setErr(''); try { const r = await fn(); if (ok) showToast(ok); return r; } catch (e) { setErr(e.message); } finally { setBusy(false); } };

  const download = async name => {
    const res = await fetch(`/api/backups/${name}/download`, { headers: { Authorization: `Bearer ${localStorage.getItem('crm_token')}` } });
    if (!res.ok) { setErr('Téléchargement impossible'); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = url; a.download = `crm-eprotectoit-${name}.db`; a.click(); URL.revokeObjectURL(url);
  };
  const restore = async b => {
    if (!window.confirm(`Restaurer la sauvegarde du ${when(b.at)} ?\n\nL’état actuel sera d’abord sauvegardé automatiquement (« avant restauration »). Les données saisies depuis cette sauvegarde seront remplacées.`)) return;
    const r = await run(() => api.backups.restore(b.name), 'Sauvegarde restaurée');
    if (r) { backups.reload(); audit.reload(); }
  };

  return (
    <div style={{ maxWidth: 980 }}>
      <ErrorNote>{err || backups.error}</ErrorNote>

      <Section title="Sauvegardes">
        <p style={{ margin: '0 0 12px', color: 'var(--fg-muted)', fontSize: 13 }}>{backups.data?.policy}</p>
        {backups.data?.lastError && <ErrorNote>Dernière erreur : {backups.data.lastError}</ErrorNote>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          <button style={btnAccent} disabled={busy} onClick={async () => { await run(() => api.backups.create(), 'Sauvegarde créée'); backups.reload(); }}><DatabaseBackup size={16} /> Sauvegarder maintenant</button>
          <span style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>Dernière réussie : {backups.data?.lastOk ? when(backups.data.lastOk) : 'aucune'}</span>
        </div>
        {backups.loading && <Loading />}
        <div style={{ display: 'grid', gap: 8 }}>
          {backups.data?.backups.map(b => (
            <div key={b.name} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ flex: '1 1 240px' }}>
                <strong>{when(b.at)}</strong> <Pill hue={b.kind === 'auto' ? '#6b8cae' : '#c8924a'}>{KIND[b.kind] || b.kind}</Pill>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{b.counts ? `${b.counts.clients} clients · ${b.counts.opportunites} opportunités · ${b.counts.quotes} soumissions · ` : ''}{b.uploads ?? 0} document(s) · {b.size ? `${Math.round(b.size / 1024)} Ko` : ''}</div>
              </div>
              <button style={btnGhost} onClick={() => download(b.name)}><Download size={15} /> Télécharger</button>
              <button style={btnGhost} disabled={busy} onClick={() => restore(b)}><RotateCcw size={15} /> Restaurer</button>
              {b.kind === 'manuel' && <button style={btnDanger} onClick={async () => { if (window.confirm('Supprimer cette sauvegarde?')) { await run(() => api.backups.remove(b.name)); backups.reload(); } }}>Supprimer</button>}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--fg-faint)', marginBottom: 0 }}>Les sauvegardes sont sur le même volume que la base. Télécharge-en une de temps en temps pour en garder une copie ailleurs.</p>
      </Section>

      <Section title="Connexions ouvertes">
        {sessions.data?.map(s => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13, flexWrap: 'wrap' }}>
            <span><b>{s.user || '—'}</b> {s.current && <Pill hue="#5f9d5f">cet appareil</Pill>} <span style={{ color: 'var(--fg-faint)' }}>{s.ip}</span></span>
            <span style={{ color: 'var(--fg-muted)' }}>actif {when(s.last_seen)}</span>
          </div>
        ))}
        <div style={{ marginTop: 12 }}><button style={btnGhost} disabled={busy} onClick={async () => { await run(() => api.revokeOtherSessions(), 'Autres appareils déconnectés'); sessions.reload(); }}><LogOut size={15} /> Déconnecter les autres appareils</button></div>
      </Section>

      <Section title="Historique des modifications">
        <div style={{ display: 'grid', gap: 6 }}>
          {audit.data?.map(a => (
            <div key={a.id} style={{ fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span><b>{a.actor}</b> · {a.action}{a.entity ? ` · ${a.entity}${a.entity_id ? ` #${a.entity_id}` : ''}` : ''}</span>
                <span style={{ color: 'var(--fg-faint)' }}>{when(a.at)}</span>
              </div>
              {a.details && <div style={{ color: 'var(--fg-muted)' }}>{a.details}</div>}
              {a.changed?.length > 0 && <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{a.changed.slice(0, 5).map(c => `${c.champ} : ${JSON.stringify(c.avant) ?? '∅'} → ${JSON.stringify(c.apres) ?? '∅'}`).join(' · ')}</div>}
              {a.restorable && <button style={{ ...btnGhost, height: 32, marginTop: 6 }} onClick={async () => { if (window.confirm('Restaurer cet élément supprimé (avec ses opportunités, soumissions, notes…) ?')) { await run(() => api.audit.restore(a.id), 'Élément restauré'); audit.reload(); } }}><Undo2 size={14} /> Restaurer</button>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
