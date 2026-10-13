import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../api';
import { cardStyle, btnGhost, inputStyle } from '../components/ui';
import { useLoad, ErrorNote, Empty, Loading, Stat, statGrid, dollars, dollars2 } from '../components/bits';
import { useUI } from '../context/UIContext';

const th = { textAlign: 'right', padding: '9px 10px', fontSize: 11.5, color: 'var(--fg-muted)', fontWeight: 800, whiteSpace: 'nowrap' };
const td = { textAlign: 'right', padding: '10px', borderTop: '1px solid var(--border)', whiteSpace: 'nowrap' };

export default function Publicites() {
  const { showToast } = useUI();
  const [range, setRange] = useState({ from: '', to: '' });
  const { data, error, loading, reload } = useLoad(() => api.ads.dashboard(range), [range.from, range.to]);
  const [syncing, setSyncing] = useState(false);
  const sync = async () => {
    setSyncing(true);
    try { const r = await api.ads.sync(); showToast(r.ok ? `${r.rows} ligne(s) de dépenses importées` : r.message); await reload(); }
    finally { setSyncing(false); }
  };
  const t = data?.totaux;
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <label style={{ fontSize: 12.5 }}>Du <input type="date" style={{ ...inputStyle, width: 'auto', height: 38 }} value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} /></label>
        <label style={{ fontSize: 12.5 }}>au <input type="date" style={{ ...inputStyle, width: 'auto', height: 38 }} value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} /></label>
        <button style={btnGhost} onClick={sync} disabled={syncing}><RefreshCw size={15} /> Importer les dépenses Meta</button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {data && !data.donnees_publicitaires && (
        <div style={{ ...cardStyle, padding: 14, marginBottom: 16, color: 'var(--fg-muted)' }}>
          Les coûts ne sont pas encore disponibles : ajoute l’ID du compte publicitaire (et l’accès « ads_read ») dans Intégrations. En attendant, les leads, soumissions, contrats et revenus par campagne sont déjà calculés.
          {data.derniere_erreur && <div style={{ color: '#c4584f', marginTop: 6 }}>{data.derniere_erreur}</div>}
        </div>
      )}
      {loading && <Loading />}
      {t && <>
        <div style={statGrid}>
          <Stat label="Leads reçus" value={t.leads} />
          <Stat label="Clients obtenus" value={t.clients} />
          <Stat label="Soumissions envoyées" value={t.soumissions} />
          <Stat label="Contrats signés" value={t.contrats} hue="#5f9d5f" />
          <Stat label="Chiffre d’affaires" value={dollars(t.ca)} hue="#5f9d5f" />
          <Stat label="Dépenses pub" value={dollars(t.depense)} />
          <Stat label="Coût par lead" value={dollars2(t.cout_par_lead)} />
          <Stat label="Coût d’acquisition client" value={dollars2(t.cout_acquisition)} />
          <Stat label="Rendement publicitaire" value={t.rendement == null ? '—' : `${t.rendement} $ par 1 $`} hue="#c17a3f" />
        </div>
        <div style={{ ...cardStyle, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900, fontSize: 13 }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}>Campagne</th><th style={th}>Leads</th><th style={th}>Clients</th><th style={th}>Soumissions</th><th style={th}>Contrats</th><th style={th}>CA</th><th style={th}>Dépense</th><th style={th}>Coût/lead</th><th style={th}>Coût/client</th><th style={th}>Rendement</th><th style={th}>Lead→contrat</th></tr></thead>
            <tbody>
              {data.campagnes.map(c => (
                <tr key={c.campaign_id || c.campagne}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{c.campagne}</td>
                  <td style={td}>{c.leads}</td><td style={td}>{c.clients}</td><td style={td}>{c.soumissions}</td><td style={td}>{c.contrats}</td>
                  <td style={td}>{dollars(c.ca)}</td><td style={td}>{dollars(c.depense)}</td><td style={td}>{dollars2(c.cout_par_lead)}</td>
                  <td style={td}>{dollars2(c.cout_acquisition)}</td><td style={td}>{c.rendement == null ? '—' : `${c.rendement}×`}</td><td style={td}>{c.taux_contrat} %</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.campagnes.length && <Empty>Aucun lead publicitaire pour cette période.</Empty>}
        </div>
        <p style={{ fontSize: 12, color: 'var(--fg-faint)' }}>Chaque client est rattaché à la campagne de son premier lead. Le chiffre d’affaires = valeur avant taxes des projets au stade contrat signé ou complété.{data.derniere_synchro ? ` Dernière importation des dépenses : ${new Date(data.derniere_synchro).toLocaleString('fr-CA')}.` : ''}</p>
      </>}
    </div>
  );
}
