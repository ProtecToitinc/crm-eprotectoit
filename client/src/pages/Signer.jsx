import React, { useEffect, useRef, useState } from 'react';

const cash = n => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(Number(n) || 0);
const call = async (token, body) => {
  const r = await fetch(`/api/signature/${encodeURIComponent(token)}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'Une erreur est survenue.');
  return d;
};
const page = { minHeight: '100dvh', background: '#121212', color: '#e9e6e0', fontFamily: "'Manrope', system-ui, sans-serif", padding: '28px 16px 48px' };
const card = { maxWidth: 560, margin: '0 auto', background: '#1c1c1c', border: '1px solid #2e2e2e', borderRadius: 14, padding: 22 };
const gold = '#c8a96e';

// Page publique : le client lit sa soumission et la signe au doigt (aucun compte requis)
export default function Signer({ token }) {
  const [q, setQ] = useState(null);
  const [err, setErr] = useState('');
  const [nom, setNom] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const canvas = useRef(null), last = useRef(null);
  useEffect(() => { call(token).then(setQ).catch(e => setErr(e.message)); }, [token]);

  // Le cadre de signature : fond blanc, trait noir, net sur les écrans haute densité
  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight;
    c.width = w * ratio; c.height = h * ratio;
    const ctx = c.getContext('2d'); ctx.scale(ratio, ratio);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
  }, [q]);
  const pos = e => { const r = canvas.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = e => { e.preventDefault(); canvas.current.setPointerCapture?.(e.pointerId); last.current = pos(e); };
  const move = e => {
    if (!last.current) return;
    const ctx = canvas.current.getContext('2d'), p = pos(e);
    ctx.beginPath(); ctx.moveTo(...last.current); ctx.lineTo(...p); ctx.stroke();
    last.current = p; setDrawn(true);
  };
  const up = () => { last.current = null; };
  const clear = () => { const c = canvas.current, ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.clientWidth, c.clientHeight); setDrawn(false); };

  const submit = async e => {
    e.preventDefault(); setErr('');
    if (nom.trim().length < 3) { setErr('Écrivez votre nom complet.'); return; }
    if (!ok) { setErr('Cochez la case pour accepter la soumission.'); return; }
    if (!drawn) { setErr('Signez dans le cadre blanc avant d’envoyer.'); return; }
    setBusy(true);
    try { await call(token, { nom: nom.trim(), accepte: true, signature: canvas.current.toDataURL('image/png') }); setQ({ ...q, signe: true, signe_par: nom.trim(), signe_le: new Date().toISOString() }); }
    catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  return (
    <main style={page}>
      <div style={{ maxWidth: 560, margin: '0 auto 18px', textAlign: 'center' }}>
        <img src="/logo-white.png" alt="ProtecToit" style={{ width: 170, height: 'auto' }} />
      </div>
      <div style={card}>
        {!q && !err && <p role="status" style={{ margin: 0, color: '#9b958c' }}>Chargement…</p>}
        {!q && err && <p role="alert" style={{ margin: 0, fontWeight: 700 }}>{err}</p>}
        {q && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: gold }}>Soumission {q.reference}</div>
            <h1 style={{ margin: '8px 0 4px', fontSize: 26, fontWeight: 600, letterSpacing: '-.02em' }}>{q.signe ? 'Merci, c’est signé.' : `Bonjour ${q.client.split(' ')[0]},`}</h1>
            <p style={{ margin: '0 0 16px', color: '#b8b2a8', fontSize: 14.5, lineHeight: 1.5 }}>
              {q.signe ? `Signée par ${q.signe_par}. ProtecToit vous contactera pour planifier les travaux.` : 'Voici le résumé de votre soumission. Pour l’accepter, signez au bas de la page.'}
            </p>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', fontSize: 14, padding: '14px 0', borderTop: '1px solid #2e2e2e', borderBottom: '1px solid #2e2e2e' }}>
              {q.service && <><dt style={{ color: '#9b958c' }}>Service</dt><dd style={{ margin: 0, fontWeight: 700 }}>{q.service}</dd></>}
              {q.adresse && <><dt style={{ color: '#9b958c' }}>Adresse</dt><dd style={{ margin: 0 }}>{q.adresse}</dd></>}
              <dt style={{ color: '#9b958c' }}>Montant</dt><dd style={{ margin: 0, fontSize: 22, fontWeight: 600, color: gold }}>{cash(q.montant)}</dd>
              {q.notes && <><dt style={{ color: '#9b958c' }}>Détails</dt><dd style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#cfcac1' }}>{q.notes}</dd></>}
            </dl>
            {!q.signe && (
              <form onSubmit={submit} style={{ marginTop: 18 }}>
                <label htmlFor="sig-nom" style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Votre nom complet</label>
                <input id="sig-nom" value={nom} onChange={e => setNom(e.target.value)} autoComplete="name" style={{ width: '100%', height: 48, padding: '0 14px', borderRadius: 8, border: '1px solid #3a3a3a', background: '#121212', color: '#fff', font: 'inherit', fontSize: 16 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 6px' }}>
                  <span id="sig-label" style={{ fontSize: 13, fontWeight: 700 }}>Votre signature (au doigt ou à la souris)</span>
                  <button type="button" onClick={clear} style={{ border: 0, background: 'transparent', color: gold, font: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 6 }}>Effacer</button>
                </div>
                <canvas ref={canvas} role="img" aria-labelledby="sig-label" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                  style={{ display: 'block', width: '100%', height: 180, borderRadius: 8, background: '#fff', touchAction: 'none', cursor: 'crosshair' }} />
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '16px 0', fontSize: 14, lineHeight: 1.45 }}>
                  <input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} style={{ width: 22, height: 22, flexShrink: 0, accentColor: gold }} />
                  <span>J’accepte la soumission {q.reference} de {q.entreprise} au montant de {cash(q.montant)} et je confirme que ma signature électronique a la même valeur que ma signature manuscrite.</span>
                </label>
                {err && <p role="alert" style={{ margin: '0 0 12px', color: '#f0806e', fontWeight: 700, fontSize: 14 }}>{err}</p>}
                <button type="submit" disabled={busy} style={{ width: '100%', height: 52, border: 0, borderRadius: 4, background: gold, color: '#15120b', font: 'inherit', fontSize: 13, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Envoi…' : 'Signer et accepter'}</button>
                <p style={{ margin: '12px 0 0', fontSize: 12, color: '#8f8a82', lineHeight: 1.5 }}>Votre nom, votre signature, la date et l’adresse de votre appareil sont conservés par ProtecToit comme preuve de votre acceptation.</p>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
