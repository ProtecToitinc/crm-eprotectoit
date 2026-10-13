import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Phone, StickyNote, User } from 'lucide-react';
import { api } from '../api';
import { useUI } from '../context/UIContext';
import { useMedia } from '../lib/useMedia';
import { looksLikePhone, fullName } from '../lib/search';
import { fmtDay } from '../lib/dates';
import { STAGE_MAP, soft } from '../constants';
import { Avatar } from './ui';

const DIRECTION_LABEL = { entrant: 'Appel reçu', sortant: 'Appel fait', manque: 'Appel manqué' };

function Section({ title, children }) {
  return (
    <div>
      <div style={{ padding: '10px 14px 4px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', color: 'var(--fg-faint)', textTransform: 'uppercase' }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ active, onClick, onMouseEnter, children }) {
  return (
    <div
      role="option"
      aria-selected={active}
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '8px 14px', cursor: 'pointer',
        background: active ? 'var(--surface-2)' : 'transparent'
      }}
    >{children}</div>
  );
}

const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

export default function GlobalSearch() {
  const navigate = useNavigate();
  const { openDeal, openCallModal } = useUI();
  const isMobile = useMedia('(max-width: 639px)');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);          // liste de résultats ouverte
  const [mobileBar, setMobileBar] = useState(false); // barre plein écran (mobile)
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const seq = useRef(0);

  const query = q.trim();

  // Recherche différée ; une réponse plus ancienne n'écrase jamais une plus récente
  useEffect(() => {
    if (!query) { setData(null); setLoading(false); setError(''); return undefined; }
    setLoading(true);
    const id = ++seq.current;
    const t = setTimeout(() => {
      api.search(query)
        .then(r => { if (id === seq.current) { setData(r); setError(''); setLoading(false); } })
        .catch(e => { if (id === seq.current) { setError(e.message || 'Erreur de recherche'); setLoading(false); } });
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  // Éléments sélectionnables au clavier, dans l'ordre d'affichage
  const items = useMemo(() => {
    if (!data) return [];
    const list = [];
    data.clients.forEach(c => list.push({ kind: 'client', c }));
    data.notes.forEach(n => list.push({ kind: 'note', n }));
    data.appels.forEach(a => list.push({ kind: 'appel', a }));
    if (data.totalClients > data.clients.length) list.push({ kind: 'all' });
    return list;
  }, [data]);

  useEffect(() => { setCursor(0); }, [data]);

  const close = () => { setOpen(false); setMobileBar(false); };
  const reset = () => { setQ(''); setData(null); close(); inputRef.current?.blur(); };

  const choose = item => {
    if (!item) return;
    if (item.kind === 'client') openDeal(item.c.id);
    else if (item.kind === 'note') navigate(item.n.client_id ? `/clients/${item.n.client_id}?tab=notes` : '/notes');
    else if (item.kind === 'appel') navigate(`/clients/${item.a.client_id}?tab=appels`);
    else if (item.kind === 'all') navigate(`/clients?q=${encodeURIComponent(query)}`);
    reset();
  };

  const logCall = () => {
    const prefill = looksLikePhone(query)
      ? { telephone: query }
      : { prenom: query.split(/\s+/)[0] || '', nom: query.split(/\s+/).slice(1).join(' ') };
    openCallModal(null, null, prefill);
    reset();
  };

  const onKeyDown = e => {
    if (e.key === 'Escape') { e.preventDefault(); if (query && open) { setOpen(false); } else { reset(); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setCursor(c => (items.length ? (c + 1) % items.length : 0)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => (items.length ? (c - 1 + items.length) % items.length : 0)); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (items[cursor]) choose(items[cursor]); }
  };

  // Raccourcis : Ctrl/Cmd+K ou « / » pour aller dans la recherche
  useEffect(() => {
    const onKey = e => {
      const tag = (e.target?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        if (isMobile) setMobileBar(true);
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile]);

  // Clic en dehors → on referme
  useEffect(() => {
    if (!open) return undefined;
    const onDown = e => { if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); if (!query) setMobileBar(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown); };
  }, [open, query]);

  useEffect(() => { if (mobileBar) setTimeout(() => inputRef.current?.focus(), 30); }, [mobileBar]);

  const dropdownStyle = isMobile
    ? { position: 'fixed', top: 62, left: 8, right: 8, maxHeight: 'calc(100vh - 80px)' }
    : { position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 'min(520px, 90vw)', maxHeight: 'min(70vh, 560px)' };

  const hasResults = data && (data.clients.length || data.notes.length || data.appels.length);

  const dropdown = open && (
    <div role="listbox" className="popin" style={{
      ...dropdownStyle, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,.28)', zIndex: 70, paddingBottom: 6
    }}>
      {!query && (
        <div style={{ padding: '18px 16px', fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
          Tapez un nom, un numéro de téléphone, une ville ou un mot d’une note.
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--fg-faint)' }}>Raccourci : <b>Ctrl + K</b> ou <b>/</b></div>
        </div>
      )}
      {query && error && <div style={{ padding: '16px', fontSize: 13, color: '#c4584f' }}>{error}</div>}
      {query && !error && loading && !data && <div style={{ padding: '16px', fontSize: 13, color: 'var(--fg-muted)' }}>Recherche…</div>}
      {query && !error && data && !hasResults && (
        <div style={{ padding: '18px 16px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>Aucun résultat pour « {query} »</div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '4px 0 12px' }}>Ce client n’est peut-être pas encore dans le CRM.</div>
          <button type="button" className="btn-accent" onMouseDown={e => e.preventDefault()} onClick={logCall} style={{
            height: 38, padding: '0 14px', border: 'none', borderRadius: 9, background: 'var(--accent)', color: 'var(--accent-fg)',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8
          }}><Phone size={15} />Enregistrer un appel</button>
        </div>
      )}

      {query && !error && data && hasResults && (() => {
        let idx = -1;
        return (
          <>
            {data.clients.length > 0 && (
              <Section title="Clients">
                {data.clients.map(c => {
                  idx += 1; const i = idx;
                  const stage = STAGE_MAP[c.derniere_etape];
                  return (
                    <Row key={`c${c.id}`} active={cursor === i} onMouseEnter={() => setCursor(i)} onClick={() => choose({ kind: 'client', c })}>
                      <Avatar client={c} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, ...ellipsis }}>{fullName(c) || '—'}</div>
                        <div style={{ fontSize: 12, color: 'var(--fg-muted)', ...ellipsis }}>{[c.ville, c.telephone].filter(Boolean).join(' · ') || 'Aucune coordonnée'}</div>
                      </div>
                      {c.nb_appels > 0 && (
                        <span title={`${c.nb_appels} appel(s)`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--fg-muted)' }}>
                          <Phone size={12} />{c.nb_appels}
                        </span>
                      )}
                      {stage && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: soft(stage.hue), color: stage.hue, whiteSpace: 'nowrap' }}>{stage.short}</span>}
                    </Row>
                  );
                })}
              </Section>
            )}

            {data.notes.length > 0 && (
              <Section title="Notes">
                {data.notes.map(n => {
                  idx += 1; const i = idx;
                  return (
                    <Row key={`n${n.id}`} active={cursor === i} onMouseEnter={() => setCursor(i)} onClick={() => choose({ kind: 'note', n })}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: soft('#c8924a'), color: '#c8924a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><StickyNote size={15} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, ...ellipsis }}>{n.titre || n.contenu}</div>
                        <div style={{ fontSize: 12, color: 'var(--fg-muted)', ...ellipsis }}>
                          {n.client_id ? `${fullName(n)}` : 'Note générale'}{n.titre ? ` · ${n.contenu}` : ''}
                        </div>
                      </div>
                    </Row>
                  );
                })}
              </Section>
            )}

            {data.appels.length > 0 && (
              <Section title="Appels">
                {data.appels.map(a => {
                  idx += 1; const i = idx;
                  return (
                    <Row key={`a${a.id}`} active={cursor === i} onMouseEnter={() => setCursor(i)} onClick={() => choose({ kind: 'appel', a })}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: soft('#5f9d5f'), color: '#5f9d5f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Phone size={15} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, ...ellipsis }}>{fullName(a)} · {DIRECTION_LABEL[a.direction] || 'Appel'}</div>
                        <div style={{ fontSize: 12, color: 'var(--fg-muted)', ...ellipsis }}>{fmtDay(a.date_appel)}{a.sujet ? ` · ${a.sujet}` : ''}</div>
                      </div>
                    </Row>
                  );
                })}
              </Section>
            )}

            {data.totalClients > data.clients.length && (() => {
              idx += 1; const i = idx;
              return (
                <Row active={cursor === i} onMouseEnter={() => setCursor(i)} onClick={() => choose({ kind: 'all' })}>
                  <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}><User size={16} /></div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Voir les {data.totalClients} clients trouvés</div>
                </Row>
              );
            })()}
          </>
        );
      })()}
    </div>
  );

  const field = (
    <div style={{ position: 'relative', width: '100%' }}>
      <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)', pointerEvents: 'none' }} />
      <input
        ref={inputRef}
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Rechercher un client, un numéro, une note…"
        aria-label="Rechercher"
        autoComplete="off"
        style={{
          width: '100%', height: 40, padding: '0 36px 0 36px', border: '1px solid var(--border)',
          borderRadius: 10, background: 'var(--surface-2)', color: 'var(--fg)', fontFamily: 'inherit', fontSize: 13.5
        }}
      />
      {(q || isMobile) && (
        <button
          type="button"
          aria-label="Effacer"
          onMouseDown={e => e.preventDefault()}
          onClick={() => { if (q) { setQ(''); inputRef.current?.focus(); } else { reset(); } }}
          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, border: 'none', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7 }}
        ><X size={15} /></button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div ref={boxRef}>
        <button type="button" className="iconbtn" aria-label="Rechercher" onClick={() => { setMobileBar(true); setOpen(true); }} style={{
          width: 40, height: 40, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)',
          color: 'var(--fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}><Search size={17} /></button>
        {mobileBar && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, height: 66, zIndex: 65, background: 'var(--surface)',
            borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 10px'
          }}>{field}</div>
        )}
        {mobileBar && dropdown}
      </div>
    );
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', flex: '0 1 340px', minWidth: 150 }}>
      {field}
      {dropdown}
    </div>
  );
}
