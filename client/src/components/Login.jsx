import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, MotionConfig, animate, useMotionValue, useReducedMotion } from 'framer-motion';
import { ArrowRight, KeyRound, Loader2, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { api } from '../api';

const USERS = ['Mathys Caron', 'Ramy Farah'];
const EASE = [0.22, 1, 0.36, 1];
const MIN_VERIFY_MS = 1500; // la vérification (tuiles qui tournent) dure au moins ce temps
const SUCCESS_MS = 1500;    // temps d'affichage de « Accès confirmé » avant d'entrer
const EXIT_MS = 520;        // fondu vers le CRM
const sleep = ms => new Promise(r => setTimeout(r, ms));
const enter = (delay, y = 14) => ({
  initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay, ease: EASE }
});

// Polygone aux coins arrondis (rayon propre à chaque coin) -> chemin SVG
function roundedPath(pts, radii) {
  const n = pts.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[(i - 1 + n) % n], [x, y] = pts[i], [nx, ny] = pts[(i + 1) % n];
    const r = radii[i];
    const l1 = Math.hypot(px - x, py - y), l2 = Math.hypot(nx - x, ny - y);
    const ax = x + (px - x) * r / l1, ay = y + (py - y) * r / l1;
    const bx = x + (nx - x) * r / l2, by = y + (ny - y) * r / l2;
    d += `${i ? 'L' : 'M'}${ax.toFixed(1)} ${ay.toFixed(1)}Q${x} ${y} ${bx.toFixed(1)} ${by.toFixed(1)}`;
  }
  return d + 'Z';
}

export default function Login({ onLogin }) {
  return (
    <MotionConfig reducedMotion="user">
      <LoginScreen onLogin={onLogin} />
    </MotionConfig>
  );
}

function LoginScreen({ onLogin }) {
  const reduce = useReducedMotion();
  const [user, setUser] = useState(() => { try { return localStorage.getItem('crm_user') || ''; } catch { return ''; } });
  const [password, setPassword] = useState('');
  const [error, setError] = useState(() => { try { const n = sessionStorage.getItem('crm_login_note') || ''; sessionStorage.removeItem('crm_login_note'); return n; } catch { return ''; } });
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | verifying | success | error | exit
  const [welcome, setWelcome] = useState('');
  const [size, setSize] = useState(null);
  const cardRef = useRef(null);
  const pwRef = useRef(null);
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // La forme de la carte (coins coupés) suit sa taille réelle
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return undefined;
    const measure = () => setSize(s => (s && s.w === el.offsetWidth && s.h === el.offsetHeight ? s : { w: el.offsetWidth, h: el.offsetHeight }));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Après un refus : retour au mot de passe, prêt à corriger
  useEffect(() => {
    if (phase === 'idle' && error && pwRef.current) { pwRef.current.focus(); pwRef.current.select(); }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = phase !== 'idle';
  const ok = phase === 'success' || phase === 'exit';

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    if (!user) { setError('Choisis ton nom.'); return; }
    if (!password) { setError('Entre ton mot de passe.'); pwRef.current?.focus(); return; }
    setError('');
    setPhase('verifying');
    const started = Date.now();
    let res;
    try { res = await api.login(password, user); } catch (err) { res = { ok: false, message: err?.message }; }
    await sleep(Math.max(0, (reduce ? 0 : MIN_VERIFY_MS) - (Date.now() - started)));
    if (!alive.current) return;
    if (res?.ok) {
      const name = res.user || user;
      localStorage.setItem('crm_token', res.token);
      localStorage.setItem('crm_user', name);
      try { if (res.derniere?.at) sessionStorage.setItem('crm_last_login', JSON.stringify({ at: res.derniere.at, meme: res.derniere.meme_appareil, echecs: res.echecs || 0 })); } catch { /* sans stockage */ }
      setWelcome(name.split(' ')[0]);
      setPhase('success');
      await sleep(reduce ? 500 : SUCCESS_MS);
      if (!alive.current) return;
      setPhase('exit');
      await sleep(reduce ? 120 : EXIT_MS);
      if (alive.current) onLogin(name);
    } else {
      setError(res?.message || 'Mot de passe incorrect');
      setPhase('error');
      await sleep(reduce ? 0 : 750);
      if (alive.current) setPhase('idle');
    }
  }

  const subtitle = ok ? `Bienvenue ${welcome}! Ton espace est prêt.`
    : phase === 'verifying' ? 'Vérification de ton accès…'
    : phase === 'error' ? 'Accès refusé'
    : 'Choisis ton nom et entre ton mot de passe';

  // Carte en verre aux coins coupés + éclats décoratifs (comme la vidéo)
  const C = 52, R = 22, O = 9, S = 58;
  const w = size?.w || 0, h = size?.h || 0;
  const cardPath = size ? roundedPath([[C, 0], [w, 0], [w, h - C], [w - C, h], [0, h], [0, C]], [7, R, 7, 7, R, 7]) : null;
  const shardTL = size ? roundedPath([[-O, -O], [S - O, -O], [-O, S - O]], [7, 5, 5]) : null;
  const shardBR = size ? roundedPath([[w + O, h + O], [w + O - S, h + O], [w + O, h + O - S]], [7, 5, 5]) : null;

  return (
    <div className="login-screen">
      <LoginBackdrop />

      <div className="login-center">
        <motion.img src="/logo-white.png" alt="PROTECTOIT" className="login-logo"
          initial={{ opacity: 0, y: -14 }} animate={{ opacity: phase === 'exit' ? 0 : 1, y: 0 }}
          transition={{ duration: 0.7, delay: phase === 'exit' ? 0 : 0.15, ease: EASE }} />

        <motion.div className="login-card-wrap"
          initial={{ y: 34, scale: 0.95 }}
          animate={{ y: phase === 'exit' ? -10 : 0, scale: phase === 'exit' ? 1.03 : 1, x: phase === 'error' ? [0, -12, 11, -8, 6, -3, 0] : 0 }}
          transition={{ default: { duration: 0.9, delay: phase === 'idle' ? 0.2 : 0, ease: EASE }, x: { duration: 0.5, ease: 'easeInOut' } }}>
          <div className="login-card-shadow" />

          <motion.div ref={cardRef} className="login-card"
            style={{ clipPath: cardPath ? `path('${cardPath}')` : undefined, borderRadius: cardPath ? 0 : R }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.25 }}>
            <motion.div className="login-tint login-tint-ok" initial={false} animate={{ opacity: ok ? 1 : 0 }} transition={{ duration: 0.6 }} />
            <motion.div className="login-tint login-tint-err" initial={false} animate={{ opacity: phase === 'error' ? 1 : 0 }} transition={{ duration: 0.25 }} />

            <form className="login-body" onSubmit={handleSubmit} noValidate>
              <motion.div className={`login-badge${ok ? ' is-ok' : ''}`}
                initial={{ opacity: 0, scale: 0.5, rotate: -25 }} animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.55 }}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={ok ? 'ok' : 'key'} style={{ display: 'flex' }}
                    initial={{ opacity: 0, scale: 0.4, rotate: -90 }} animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.4, rotate: 90 }} transition={{ duration: 0.28 }}>
                    {ok ? <ShieldCheck size={21} /> : <KeyRound size={21} />}
                  </motion.span>
                </AnimatePresence>
              </motion.div>

              <motion.div {...enter(0.7)}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.h1 key={ok ? 'ok' : 'idle'} className="login-title"
                    initial={{ opacity: 0, y: 8, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }} transition={{ duration: 0.32 }}>
                    {ok ? <>Accès <span className="login-hl-ok">confirmé</span></> : <>Accès <span className="login-hl">CRM</span></>}
                  </motion.h1>
                </AnimatePresence>
                <div aria-live="polite">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.p key={subtitle} className="login-sub"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                      {subtitle}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </motion.div>

              <div className="login-zone">
                <motion.fieldset className="login-fields" disabled={busy} aria-hidden={busy || undefined}
                  initial={false}
                  animate={{ opacity: busy ? 0 : 1, scale: busy ? 0.96 : 1, filter: busy ? 'blur(6px)' : 'blur(0px)' }}
                  transition={{ duration: 0.35 }}>
                  <motion.div {...enter(0.85)}>
                    <span className="login-label" id="login-who">Qui es-tu?</span>
                    <div className="login-users" role="group" aria-labelledby="login-who">
                      {USERS.map(u => (
                        <button type="button" key={u} className={`login-user${user === u ? ' is-on' : ''}`} aria-pressed={user === u}
                          onClick={() => { setUser(u); setError(''); pwRef.current?.focus(); }}>
                          {u}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                  <motion.div {...enter(0.95)}>
                    <label className="login-label" htmlFor="login-pw">Mot de passe</label>
                    <div style={{ position: 'relative' }}>
                      <input id="login-pw" ref={pwRef} className="login-input" type={showPw ? 'text' : 'password'} name="password" style={{ paddingRight: 46 }}
                        value={password} onChange={e => setPassword(e.target.value)} onKeyUp={e => setCaps(!!e.getModifierState?.('CapsLock'))} onBlur={() => setCaps(false)}
                        autoComplete="current-password" placeholder="••••••••••" autoFocus={!!user} aria-describedby="login-caps" />
                      <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={showPw}
                        style={{ position: 'absolute', right: 6, top: 6, width: 34, height: 34, display: 'grid', placeItems: 'center', border: 0, borderRadius: 8, background: 'transparent', color: '#a39d93', cursor: 'pointer' }}>{showPw ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                    </div>
                    <div id="login-caps" role="status" style={{ minHeight: 16, marginTop: 5, fontSize: 11.5, fontWeight: 700, color: '#f0c06e' }}>{caps ? 'Verrouillage des majuscules activé' : ''}</div>
                  </motion.div>
                </motion.fieldset>

                <AnimatePresence>
                  {busy && (
                    <motion.div key="orbit" className="login-stage" aria-hidden="true"
                      exit={{ opacity: 0, transition: { duration: 0.2 } }}>
                      <CodeOrbit phase={phase} reduce={reduce} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <motion.div className="login-note" {...enter(1.05)}>
                <AnimatePresence mode="wait" initial={false}>
                  {error ? (
                    <motion.p key={`err-${error}`} role="alert" className="login-error"
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                      {error}
                    </motion.p>
                  ) : (
                    <motion.p key="note" className="login-muted"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                      Accès réservé à l'équipe <span className="login-hl">PROTECTOIT</span>
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>

              <motion.button type="submit" className={`login-btn${ok ? ' is-ok' : ''}`} disabled={busy} aria-busy={phase === 'verifying'}
                {...enter(1.12)} whileTap={busy ? undefined : { scale: 0.97 }}>
                <span className="login-btn-ok" aria-hidden="true" />
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={ok ? 'ok' : busy ? (phase === 'error' ? 'no' : 'wait') : 'go'} className="login-btn-label"
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                    {ok ? <><ShieldCheck size={17} /> Accès sécurisé</>
                      : phase === 'error' ? <>Accès refusé</>
                      : busy ? <><Loader2 size={17} className="animate-spin" /> Vérification…</>
                      : <>Se connecter <ArrowRight size={17} /></>}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </form>
          </motion.div>

          {size && (
            <svg className="login-frame" width={w} height={h} aria-hidden="true">
              <defs>
                <linearGradient id="loginEdge" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#fff" stopOpacity=".45" />
                  <stop offset=".35" stopColor="#fff" stopOpacity=".1" />
                  <stop offset=".7" stopColor="#fff" stopOpacity=".07" />
                  <stop offset="1" stopColor="#f2c470" stopOpacity=".5" />
                </linearGradient>
                <linearGradient id="loginShard" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#fff" stopOpacity=".16" />
                  <stop offset="1" stopColor="#fff" stopOpacity=".03" />
                </linearGradient>
              </defs>
              <motion.path d={cardPath} fill="none" stroke="url(#loginEdge)" strokeWidth="1.2"
                initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.4, delay: 0.35, ease: 'easeInOut' }} />
              <motion.path d={cardPath} fill="none" stroke="#34d399" strokeWidth="1.4" className="login-frame-ok"
                initial={false} animate={{ opacity: ok ? 0.8 : 0 }} transition={{ duration: 0.6 }} />
              <motion.g initial={{ opacity: 0, x: -18, y: -18 }} animate={{ opacity: 1, x: 0, y: 0 }} transition={{ duration: 0.8, delay: 0.75, ease: EASE }}>
                <path d={shardTL} fill="url(#loginShard)" stroke="rgba(255,255,255,.3)" strokeWidth="1" />
              </motion.g>
              <motion.g initial={{ opacity: 0, x: 18, y: 18 }} animate={{ opacity: 1, x: 0, y: 0 }} transition={{ duration: 0.8, delay: 0.85, ease: EASE }}>
                <path d={shardBR} fill="url(#loginShard)" stroke="rgba(255,255,255,.3)" strokeWidth="1" />
              </motion.g>
            </svg>
          )}
        </motion.div>
      </div>

      <motion.div className="login-fade" initial={{ opacity: 0 }} animate={{ opacity: phase === 'exit' ? 1 : 0 }}
        transition={{ duration: EXIT_MS / 1000, ease: 'easeIn' }} />
    </div>
  );
}

// ---- Vérification : 4 tuiles qui forment un losange et tournent, puis fusionnent en coche verte ----
const ROW_GAP = 58;  // écart des tuiles en rangée (là où était le mot de passe)
const ROW_Y = 54;    // hauteur du champ mot de passe par rapport au centre
const RADIUS = 50;   // rayon du losange
const DIAMOND = [[0, -RADIUS], [RADIUS, 0], [0, RADIUS], [-RADIUS, 0]];
const SPARKS = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2 + 0.2);

function CodeOrbit({ phase, reduce }) {
  const rot = useMotionValue(0);
  const spinning = phase === 'verifying';
  const ok = phase === 'success' || phase === 'exit';
  const failed = phase === 'error';

  useEffect(() => {
    if (reduce) return undefined;
    let c;
    if (spinning) c = animate(rot, [0, 360], { duration: 1.5, ease: 'linear', repeat: Infinity, delay: 0.8 });
    else if (ok) c = animate(rot, Math.ceil(rot.get() / 90) * 90 + 90, { type: 'spring', stiffness: 60, damping: 13 });
    else if (failed) c = animate(rot, Math.round(rot.get() / 90) * 90, { type: 'spring', stiffness: 200, damping: 20 });
    return () => c?.stop();
  }, [spinning, ok, failed, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="orbit">
      <motion.div className="orbit-spin" style={{ rotate: rot }}>
        {DIAMOND.map(([dx, dy], i) => {
          const rx = (i - 1.5) * ROW_GAP;
          let target, transition;
          if (ok) {
            target = { x: 0, y: 0, scale: 0.85, opacity: [1, 1, 0] };
            transition = { duration: 0.5, ease: EASE, opacity: { duration: 0.5, times: [0, 0.75, 1] } };
          } else if (failed) {
            target = { x: dx * 1.25, y: dy * 1.25, scale: 0.8, opacity: 0 };
            transition = { duration: 0.4, delay: 0.3, ease: 'easeIn' };
          } else {
            target = { x: [rx, rx, dx], y: [ROW_Y, ROW_Y, dy], opacity: [0, 1, 1], scale: [0.6, 1, 1] };
            transition = { duration: 1.0, delay: i * 0.06, times: [0, 0.35, 1], ease: EASE };
          }
          return (
            <motion.div key={i} className={`orbit-tile${failed ? ' is-err' : ''}`}
              initial={{ x: rx, y: ROW_Y, opacity: 0, scale: 0.6 }} animate={target} transition={transition} />
          );
        })}
      </motion.div>

      {ok && (
        <div className="orbit-seal-wrap">
          <motion.div className="orbit-ring" initial={{ opacity: 0, scale: 0.45 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.45, 1, 1, 1.08] }}
            transition={{ duration: 1.4, delay: 0.3, times: [0, 0.3, 0.75, 1], ease: 'easeOut' }}>
            <svg className="orbit-dots" viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="40" fill="none" stroke="#6ee7b7" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="0.1 12.47" opacity=".7" />
            </svg>
          </motion.div>
          <motion.div className="orbit-pulse" initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: [0, 0.6, 0], scale: [1, 1, 1.9] }} transition={{ duration: 1, delay: 0.55, times: [0, 0.05, 1] }} />
          {SPARKS.map((a, i) => (
            <motion.span key={i} className="orbit-spark" initial={{ opacity: 0, x: 0, y: 0, scale: 1 }}
              animate={{ opacity: [0, 1, 0], x: Math.cos(a) * 82, y: Math.sin(a) * 82, scale: 0.4 }}
              transition={{ duration: 0.85, delay: 0.55, ease: 'easeOut' }} />
          ))}
          <motion.div className="orbit-seal" initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: [0.6, 1.14, 1] }} transition={{ duration: 0.55, delay: 0.35, ease: EASE }}>
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <motion.path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.65, ease: 'easeOut' }} />
            </svg>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// ---- Fond : soie noire et rubans dorés qui ondulent doucement ----
const G1 = 'M-200 150 C 250 40, 520 430, 900 380 S 1450 150, 1800 320';
const G2 = 'M-200 760 C 250 600, 600 900, 1000 760 S 1500 520, 1800 640';
const G3 = 'M300 -60 C 650 120, 1000 20, 1250 180 S 1600 330, 1800 250';
const G4 = 'M-150 560 C 150 470, 360 650, 640 600 S 1000 480, 1250 560 S 1600 660, 1850 600';
const D1 = 'M-100 440 C 300 260, 650 620, 1050 460 S 1550 280, 1750 390';
const D2 = 'M-100 920 C 350 760, 700 1040, 1100 880 S 1500 760, 1750 840';
const D3 = 'M150 -40 C 500 140, 900 -20, 1300 140 S 1700 80, 1800 40';

function LoginBackdrop() {
  return (
    <motion.div className="login-silk" aria-hidden="true"
      initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.6, ease: EASE }}>
      <svg className="login-silk-layer login-silk-dark" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="silkDark" x1="0" y1="0" x2="1600" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#2a2a30" stopOpacity="0" />
            <stop offset=".25" stopColor="#26262b" />
            <stop offset=".5" stopColor="#45454d" />
            <stop offset=".75" stopColor="#222226" />
            <stop offset="1" stopColor="#2a2a30" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="silkSheen" x1="0" y1="0" x2="1600" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#9a9aa6" stopOpacity="0" />
            <stop offset=".5" stopColor="#9a9aa6" />
            <stop offset="1" stopColor="#9a9aa6" stopOpacity="0" />
          </linearGradient>
          <filter id="silkBlurL" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="28" /></filter>
          <filter id="silkBlurS" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="2" /></filter>
        </defs>
        <g filter="url(#silkBlurL)" fill="none" strokeLinecap="round">
          <path d={D1} stroke="url(#silkDark)" strokeWidth="200" />
          <path d={D2} stroke="url(#silkDark)" strokeWidth="240" opacity=".8" />
          <path d={D3} stroke="url(#silkDark)" strokeWidth="150" opacity=".7" />
        </g>
        <g filter="url(#silkBlurS)" fill="none" strokeLinecap="round" stroke="url(#silkSheen)" strokeWidth="2" opacity=".4">
          <path d={D1} transform="translate(0 -92)" />
          <path d={D2} transform="translate(0 -110)" />
        </g>
      </svg>

      <svg className="login-silk-layer login-silk-gold" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="silkGold" x1="0" y1="0" x2="1600" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7a4519" stopOpacity="0" />
            <stop offset=".12" stopColor="#a8682c" />
            <stop offset=".3" stopColor="#f6cd7c" />
            <stop offset=".5" stopColor="#c8843f" />
            <stop offset=".7" stopColor="#f2c06a" />
            <stop offset=".88" stopColor="#8a5020" />
            <stop offset="1" stopColor="#6e3d16" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="silkCopper" x1="0" y1="0" x2="1600" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#5a3214" stopOpacity="0" />
            <stop offset=".2" stopColor="#b8733a" />
            <stop offset=".45" stopColor="#6e3f18" />
            <stop offset=".75" stopColor="#d58e48" />
            <stop offset="1" stopColor="#4a2a10" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="silkEdge" x1="0" y1="0" x2="1600" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffe2a8" stopOpacity="0" />
            <stop offset=".25" stopColor="#ffe9bd" />
            <stop offset=".5" stopColor="#ffe2a8" stopOpacity=".5" />
            <stop offset=".75" stopColor="#ffe9bd" />
            <stop offset="1" stopColor="#ffe2a8" stopOpacity="0" />
          </linearGradient>
          <filter id="silkBlurM" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="10" /></filter>
          <filter id="silkBlurXL" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="30" /></filter>
          <filter id="silkBlurT" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="4" /></filter>
          <filter id="silkGlow" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="1.1" /></filter>
        </defs>
        <g fill="none" strokeLinecap="round">
          <path d={G2} stroke="url(#silkCopper)" strokeWidth="150" filter="url(#silkBlurXL)" opacity=".75" />
          <path d={G1} stroke="url(#silkCopper)" strokeWidth="150" filter="url(#silkBlurXL)" opacity=".55" />
          <path d={G1} stroke="url(#silkGold)" strokeWidth="58" filter="url(#silkBlurM)" />
          <path d={G2} stroke="url(#silkGold)" strokeWidth="40" filter="url(#silkBlurM)" opacity=".75" />
          <path d={G4} stroke="url(#silkGold)" strokeWidth="18" filter="url(#silkBlurT)" opacity=".7" />
          <path d={G3} stroke="url(#silkGold)" strokeWidth="22" filter="url(#silkBlurT)" opacity=".6" />
          <g filter="url(#silkGlow)" stroke="url(#silkEdge)">
            <path d={G1} transform="translate(0 -24)" strokeWidth="2.6" />
            <path d={G1} transform="translate(0 26)" strokeWidth="1.4" opacity=".55" />
            <path d={G2} transform="translate(0 -22)" strokeWidth="2.2" opacity=".75" />
            <path d={G4} transform="translate(0 -8)" strokeWidth="1.4" opacity=".6" />
          </g>
        </g>
      </svg>

      <svg className="login-silk-layer login-silk-streak" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <g fill="none" stroke="#fff4da" strokeLinecap="round" strokeDasharray="200 2400">
          <path d={G1} transform="translate(0 -24)" strokeWidth="2.6" />
          <path d={G2} transform="translate(0 -22)" strokeWidth="2.2" opacity=".7" />
        </g>
      </svg>

      <div className="login-vignette" />
    </motion.div>
  );
}
