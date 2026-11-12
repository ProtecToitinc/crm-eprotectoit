import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, LineChart, ArrowRight } from 'lucide-react';
import { api } from '../api';
import { STAGES, SERVICE_HUE, money } from '../constants';
import { parseDb, dateKey } from '../lib/dates';
import { BarChart, AreaChart, Donut, Funnel, Gauge, DayBars, LegendToggle } from './charts';
import { GrowBar, CountUp } from './motion';

const TABS = [['ventes', 'Ventes'], ['entonnoir', 'Entonnoir'], ['services', 'Services'], ['prospects', 'Prospects']];
const PERIODS = [['semaine', 'Semaine'], ['mois', 'Mois'], ['annee', 'Année']];
const monthName = key => new Date(`${key}-15T12:00:00`).toLocaleDateString('fr-CA', { month: 'short' }).replace('.', '');

// Ajoute les périodes sans vente (à zéro) et des libellés lisibles
export function fillPoints(points, period, today) {
  if (!points?.length) return [];
  const by = new Map(points.map(p => [p.key, p])), out = [];
  const blank = key => ({ key, ventes: 0, vendu: 0, encaisse: 0 });
  if (period === 'semaine') {
    const d = new Date(`${points[0].key}T12:00:00Z`), end = points[points.length - 1].key;
    for (let n = 0; n < 60; n++) {
      const key = d.toISOString().slice(0, 10), day = new Date(`${key}T12:00:00`);
      out.push({ ...(by.get(key) || blank(key)), label: day.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }).replace('.', ''), long: `Semaine du ${day.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })}` });
      if (key >= end) break;
      d.setUTCDate(d.getUTCDate() + 7);
    }
    return out;
  }
  let [y, m] = points[0].key.split('-').map(Number);
  const end = [points[points.length - 1].key, (today || '').slice(0, 7)].sort().pop();
  for (let n = 0; n < 72; n++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ ...(by.get(key) || blank(key)), label: period === 'annee' ? `${monthName(key)} ${String(y).slice(2)}` : monthName(key), long: new Date(`${key}-15T12:00:00`).toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' }) });
    if (key >= end) break;
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

function Ventes() {
  const [period, setPeriod] = useState('mois');
  const [kind, setKind] = useState('barres');
  const [show, setShow] = useState({ vendu: true, encaisse: true });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let on = true; setError('');
    api.performance(period).then(d => on && setData(d)).catch(e => on && setError(e.message));
    return () => { on = false; };
  }, [period]);
  const points = useMemo(() => (data?.periode === period ? fillPoints(data.points, period, data.today) : null), [data, period]);
  const total = data?.summary || {};
  const toggle = k => setShow(s => { const next = { ...s, [k]: !s[k] }; return next.vendu || next.encaisse ? next : s; });
  const Chart = kind === 'courbe' && points?.length > 1 ? AreaChart : BarChart;
  return (
    <div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }} role="group" aria-label="Période">
        {PERIODS.map(([key, label]) => (
          <button key={key} type="button" className="period-tile" aria-pressed={period === key} onClick={() => setPeriod(key)}>
            <span className="eyebrow" style={{ color: 'var(--fg-muted)' }}>{label}</span>
            <span className="numeral" style={{ display: 'block', fontSize: 24, marginTop: 8 }}><CountUp value={money(total[key]?.vendu || 0)} /></span>
            <span style={{ display: 'block', marginTop: 5, fontSize: 11.5, color: 'var(--fg-muted)' }}>{total[key]?.ventes ?? 0} vente{(total[key]?.ventes ?? 0) > 1 ? 's' : ''} · encaissé {money(total[key]?.encaisse || 0)}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, margin: '18px 0 6px' }}>
        <LegendToggle show={show} onToggle={toggle} />
        <div role="group" aria-label="Type de graphique" style={{ display: 'flex', gap: 6 }}>
          {[['barres', 'Barres', BarChart3], ['courbe', 'Courbe', LineChart]].map(([k, label, Icon]) => (
            <button key={k} type="button" className="chip-btn" aria-pressed={kind === k} onClick={() => setKind(k)}><Icon size={14} /> {label}</button>
          ))}
        </div>
      </div>
      {error && <p role="alert" style={{ color: '#c4584f', fontSize: 13 }}>{error}</p>}
      {!points ? <div className="shimmer" style={{ height: 220 }} />
        : !points.length ? <p style={{ padding: '36px 0', color: 'var(--fg-muted)', fontSize: 13, textAlign: 'center' }}>Aucune vente ni facture payée sur cette période.</p>
          : <AnimatePresence mode="wait">
            <motion.div key={period + kind} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <Chart points={points} format={money} show={show} />
            </motion.div>
          </AnimatePresence>}
      <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--fg-faint)' }}>Soumissions acceptées (vendu) et factures payées (encaissé), taxes possiblement incluses — pas le profit net. Passe sur le graphique ou utilise les flèches du clavier.</p>
    </div>
  );
}

function Entonnoir({ stats }) {
  const navigate = useNavigate();
  const stages = useMemo(() => {
    const rows = STAGES.map(st => ({ ...st, here: 0, own: 0, ...(stats.parEtape || []).filter(p => p.etape === st.key).map(p => ({ here: p.count, own: p.valeur }))[0] }));
    return rows.map((r, i) => ({ ...r, count: rows.slice(i).reduce((n, x) => n + x.here, 0), value: rows.slice(i).reduce((n, x) => n + x.own, 0) }));
  }, [stats]);
  if (!stages[0].count) return <p style={{ padding: '36px 0', color: 'var(--fg-muted)', fontSize: 13, textAlign: 'center' }}>Aucun dossier dans le pipeline pour l’instant.</p>;
  return (
    <div className="panel-split">
      <Funnel stages={stages} format={money} onSelect={() => navigate('/pipeline')} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <Gauge value={stats.tauxConversion} label="Conversion sur 90 jours" size={170} />
        <div style={{ display: 'flex', gap: 22, textAlign: 'center' }}>
          <div><div className="numeral" style={{ fontSize: 22 }}><CountUp value={money(stats.valeurPipeline)} /></div><div className="eyebrow" style={{ color: 'var(--fg-muted)', marginTop: 5 }}>Valeur active</div></div>
          <div><div className="numeral" style={{ fontSize: 22 }}><CountUp value={String(stats.totalOpportunites)} /></div><div className="eyebrow" style={{ color: 'var(--fg-muted)', marginTop: 5 }}>Dossiers actifs</div></div>
        </div>
      </div>
    </div>
  );
}

function Services({ stats }) {
  const [hov, setHov] = useState(null);
  const items = useMemo(() => [...(stats.servicesRows || [])].filter(s => s.total > 0).sort((a, b) => b.total - a.total).map(s => ({ name: s.service, value: s.total, hue: SERVICE_HUE[s.service] || '#9aa0a6' })), [stats]);
  const sum = items.reduce((n, i) => n + i.value, 0);
  if (!items.length) return <p style={{ padding: '36px 0', color: 'var(--fg-muted)', fontSize: 13, textAlign: 'center' }}>Aucune donnée de service.</p>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 30 }}>
      <Donut items={items} total={sum} centerLabel="Total des dossiers" format={money} hover={hov} onHover={setHov} />
      <div style={{ flex: '1 1 260px', display: 'grid', gap: 14, minWidth: 0 }} onPointerLeave={() => setHov(null)}>
        {items.map((it, i) => (
          <div key={it.name} onPointerEnter={() => setHov(i)} style={{ opacity: hov == null || hov === i ? 1 : 0.45, transition: 'opacity .18s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, marginBottom: 6 }}>
              <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><span style={{ width: 9, height: 9, borderRadius: 9, background: it.hue, flexShrink: 0 }} />{it.name}</span>
              <span style={{ color: 'var(--fg-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{money(it.value)} · {Math.round((it.value / sum) * 100)} %</span>
            </div>
            <GrowBar pct={(it.value / items[0].value) * 100} color={it.hue} height={7} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Prospects() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { let on = true; api.leads.list().then(l => on && setLeads(l || [])).catch(e => on && setError(e.message)); return () => { on = false; }; }, []);
  const view = useMemo(() => {
    if (!leads) return null;
    const counts = {};
    for (const l of leads) { const d = parseDb(l.recu_at) || new Date(l.recu_at); if (!Number.isNaN(d?.getTime?.())) { const k = dateKey(d); counts[k] = (counts[k] || 0) + 1; } }
    const days = [];
    for (let n = 29; n >= 0; n--) {
      const d = new Date(); d.setDate(d.getDate() - n);
      const k = dateKey(d);
      days.push({ date: k, count: counts[k] || 0, label: d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }).replace('.', ''), long: d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' }) });
    }
    const sources = {};
    for (const l of leads) { const k = (l.campagne || '').trim() || ({ meta: 'Facebook', webhook: 'Formulaire Facebook', manuel: 'Ajout manuel', messenger: 'Messenger' }[l.source] || l.source || 'Autre'); sources[k] = (sources[k] || 0) + 1; }
    const convertis = leads.filter(l => l.statut === 'converti').length;
    return { days, mois: days.reduce((n, d) => n + d.count, 0), sources: Object.entries(sources).sort((a, b) => b[1] - a[1]).slice(0, 4), convertis, taux: leads.length ? Math.round((convertis / leads.length) * 1000) / 10 : 0, nouveaux: leads.filter(l => l.statut === 'nouveau').length };
  }, [leads]);
  if (error) return <p role="alert" style={{ color: '#c4584f', fontSize: 13 }}>{error}</p>;
  if (!view) return <div className="shimmer" style={{ height: 200 }} />;
  if (!leads.length) return <p style={{ padding: '36px 0', color: 'var(--fg-muted)', fontSize: 13, textAlign: 'center' }}>Aucun prospect reçu pour l’instant.</p>;
  return (
    <div className="panel-split" style={{ alignItems: 'start' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <span className="numeral" style={{ fontSize: 30 }}><CountUp value={String(view.mois)} /></span>
          <span style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>prospects reçus en 30 jours · {view.nouveaux} à rappeler</span>
        </div>
        <DayBars days={view.days} />
      </div>
      <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Gauge value={view.taux} label="Prospects convertis" size={120} />
          <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}><strong style={{ color: 'var(--fg)' }}>{view.convertis}</strong> prospect{view.convertis > 1 ? 's' : ''} sur {leads.length} sont devenus clients.</div>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="eyebrow" style={{ color: 'var(--fg-muted)' }}>D’où ils viennent</div>
          {view.sources.map(([name, n]) => (
            <div key={name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5, gap: 8 }}><span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span><span style={{ color: 'var(--fg-muted)' }}>{n}</span></div>
              <GrowBar pct={(n / view.sources[0][1]) * 100} height={6} />
            </div>
          ))}
        </div>
        <button type="button" className="linkbtn" onClick={() => navigate('/opportunites')} style={{ border: 0, background: 'transparent', color: 'var(--accent)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, justifySelf: 'start' }}>Voir les prospects <ArrowRight size={14} /></button>
      </div>
    </div>
  );
}

// Section « Analyse » : onglets numérotés comme sur eprotectoit.com, un graphique interactif par onglet
export default function Analyse({ stats }) {
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('dash_tab') || 'ventes'; } catch { return 'ventes'; } });
  const pick = t => { setTab(t); try { sessionStorage.setItem('dash_tab', t); } catch { /* sans stockage */ } };
  const onKey = e => {
    const i = TABS.findIndex(t => t[0] === tab);
    const next = e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : e.key === 'ArrowLeft' ? TABS[(i + TABS.length - 1) % TABS.length] : null;
    if (next) { pick(next[0]); document.getElementById(`dash-tab-${next[0]}`)?.focus(); }
  };
  return (
    <section className="glass spot" style={{ marginBottom: 20 }} aria-label="Analyse">
      <div style={{ padding: '18px 22px 0' }}>
        <div className="eyebrow">Analyse</div>
        <h2 style={{ margin: '6px 0 12px', fontSize: 21, fontWeight: 600, letterSpacing: '-.02em' }}>Tes chiffres, en un coup d’œil.</h2>
      </div>
      <div className="ntabs" role="tablist" aria-label="Graphiques" onKeyDown={onKey}>
        {TABS.map(([key, label], i) => (
          <button key={key} id={`dash-tab-${key}`} type="button" role="tab" className="ntab" aria-selected={tab === key} aria-controls="dash-panel" tabIndex={tab === key ? 0 : -1} onClick={() => pick(key)}>
            <i>(0{i + 1})</i>{label}
            {tab === key && <motion.span layoutId="ntab-line" className="ntab-line" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
          </button>
        ))}
      </div>
      <div id="dash-panel" role="tabpanel" aria-labelledby={`dash-tab-${tab}`} style={{ padding: 22 }}>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
            {tab === 'ventes' ? <Ventes /> : tab === 'entonnoir' ? <Entonnoir stats={stats} /> : tab === 'services' ? <Services stats={stats} /> : <Prospects />}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
