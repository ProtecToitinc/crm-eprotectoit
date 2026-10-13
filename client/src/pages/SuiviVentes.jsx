import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { cardStyle, btnGhost, btnAccent, inputStyle, Field, Modal } from '../components/ui';
import { useLoad, ErrorNote, CallButton, Empty, Loading, Pill, Stat, statGrid, dollars, notifyBadges } from '../components/bits';
import { fmtDay } from '../lib/dates';
import { useUI } from '../context/UIContext';

export default function SuiviVentes() {
  const { showToast } = useUI();
  const { data, error, loading, reload } = useLoad(() => api.suiviSoumissions.get());
  const [lost, setLost] = useState(null);   // { id, reference, raison }
  const [follow, setFollow] = useState(null); // { id, reference, date, note }
  const [err, setErr] = useState('');
  const run = async (fn, ok) => { setErr(''); try { await fn(); if (ok) showToast(ok); await reload(); notifyBadges(); } catch (e) { setErr(e.message); } };

  return (
    <div>
      <ErrorNote>{error || err}</ErrorNote>
      {loading && <Loading />}
      {data && <>
        <div style={statGrid}>
          <Stat label="Soumissions en attente" value={data.nb_en_attente} hue="#6b8cae" />
          <Stat label="Valeur en attente" value={dollars(data.valeur_en_attente)} hue="#c8924a" />
          <Stat label="Taux de conversion" value={`${data.taux_conversion} %`} hint={`${data.nb_acceptees} acceptée(s) · ${dollars(data.valeur_acceptee)}`} hue="#5f9d5f" />
          <Stat label="Ventes perdues" value={data.nb_perdues} hint={dollars(data.valeur_perdue)} hue="#c4584f" />
        </div>

        <h2 style={{ fontSize: 15, fontWeight: 800 }}>Soumissions en attente</h2>
        <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
          {data.en_attente.map(q => (
            <div key={q.id} style={{ ...cardStyle, padding: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <Link to={`/clients/${q.client_id}`} style={{ fontWeight: 800, color: 'inherit', textDecoration: 'none' }}>{q.client}</Link>
                <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 3 }}>
                  {q.reference} · {dollars(q.montant)} · {q.jours == null ? 'date d’envoi inconnue' : `envoyée il y a ${q.jours} jour(s)`}
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 2 }}>
                  {q.relances} relance(s) · prochain suivi : {q.prochain_suivi ? fmtDay(q.prochain_suivi) : 'non planifié'}
                </div>
              </div>
              {q.jours != null && q.jours >= 6 && <Pill hue="#c4584f">À relancer</Pill>}
              <CallButton phone={q.telephone} label="Appeler" style={{ height: 40 }} />
              <button style={btnGhost} onClick={() => setFollow({ id: q.id, reference: q.reference, date: '', note: '' })}>Planifier un suivi</button>
              <button style={btnGhost} onClick={() => run(() => api.quotes.update(q.id, { statut: 'acceptee' }), 'Soumission acceptée')}>Acceptée</button>
              <button style={{ ...btnGhost, color: '#c4584f' }} onClick={() => setLost({ id: q.id, reference: q.reference, raison: '' })}>Perdue</button>
            </div>
          ))}
          {!loading && !data.en_attente.length && <Empty>Aucune soumission en attente.</Empty>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <section style={{ ...cardStyle, padding: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 0 }}>Raisons des ventes perdues</h2>
            {data.raisons.length ? data.raisons.map(r => <div key={r.raison} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}><span>{r.raison}</span><b>{r.n}</b></div>) : <span style={{ color: 'var(--fg-muted)' }}>Aucune vente perdue enregistrée.</span>}
          </section>
          <section style={{ ...cardStyle, padding: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 0 }}>Conversion par mois</h2>
            {data.par_mois.length ? data.par_mois.map(m => (
              <div key={m.mois} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{m.mois}</span><span>{m.acceptees} / {m.envoyees} · <b>{Math.round(m.acceptees / m.envoyees * 100)} %</b></span>
              </div>)) : <span style={{ color: 'var(--fg-muted)' }}>Pas encore de données.</span>}
          </section>
        </div>
      </>}

      {lost && (
        <Modal title={`Soumission ${lost.reference} perdue`} onClose={() => setLost(null)} onSubmit={async e => { e.preventDefault(); await run(() => api.suiviSoumissions.lost(lost.id, lost.raison), 'Raison enregistrée'); setLost(null); }}
          footer={<><button type="button" style={btnGhost} onClick={() => setLost(null)}>Annuler</button><button type="submit" style={btnAccent}>Confirmer</button></>}>
          <Field label="Pourquoi a-t-on perdu cette vente?">
            <input list="raisons" style={inputStyle} value={lost.raison} onChange={e => setLost(l => ({ ...l, raison: e.target.value }))} placeholder="Ex. trop cher" autoFocus />
            <datalist id="raisons">{['Trop cher', 'A choisi un concurrent', 'Pas de réponse', 'Projet reporté', 'Hors secteur', 'Plus intéressé'].map(r => <option key={r} value={r} />)}</datalist>
          </Field>
        </Modal>
      )}
      {follow && (
        <Modal title={`Suivi de ${follow.reference}`} onClose={() => setFollow(null)} onSubmit={async e => { e.preventDefault(); await run(() => api.suiviSoumissions.followUp(follow.id, { prochain_suivi: follow.date, note: follow.note }), 'Suivi programmé'); setFollow(null); }}
          footer={<><button type="button" style={btnGhost} onClick={() => setFollow(null)}>Annuler</button><button type="submit" style={btnAccent}>Enregistrer</button></>}>
          <Field label="Prochain suivi"><input type="date" style={inputStyle} value={follow.date} onChange={e => setFollow(f => ({ ...f, date: e.target.value }))} /></Field>
          <Field label="Note (optionnelle)"><input style={inputStyle} value={follow.note} onChange={e => setFollow(f => ({ ...f, note: e.target.value }))} /></Field>
        </Modal>
      )}
    </div>
  );
}
