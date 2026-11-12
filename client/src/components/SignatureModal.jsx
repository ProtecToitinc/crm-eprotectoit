import React, { useState } from 'react';
import { Copy, Mail, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import { useUI } from '../context/UIContext';
import { money } from '../constants';
import { Modal, btnGhost, btnAccent, inputStyle } from './ui';
import { useLoad, ErrorNote, Loading } from './bits';
import { fmtDbDateTime } from '../lib/dates';

// Signature en ligne d'une soumission : créer le lien, le copier ou l'envoyer, voir la preuve une fois signé
export default function SignatureModal({ quote, onClose }) {
  const { showToast } = useUI();
  const { data: sig, loading, reload } = useLoad(() => api.quotes.signature(quote.id), [quote.id]);
  const [link, setLink] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const make = async envoyer => {
    if (envoyer && !window.confirm('Envoyer le lien de signature par courriel au client?')) return;
    setBusy(true); setErr('');
    try {
      const r = await api.quotes.lienSignature(quote.id, envoyer);
      setLink(r); if (r.erreur) setErr(r.erreur); if (r.envoye) showToast(`Lien envoyé à ${r.courriel}`);
      reload();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link.url); showToast('Lien copié'); } catch { setErr('Copie impossible : sélectionne le lien à la main.'); } };
  return (
    <Modal title={`Signature en ligne — ${quote.reference}`} onClose={onClose} width={560} footer={<button type="button" style={btnGhost} onClick={onClose}>Fermer</button>}>
      <ErrorNote>{err}</ErrorNote>
      {loading && <Loading />}
      {sig?.signed_at ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#5f9d5f', fontWeight: 800, marginBottom: 10 }}><CheckCircle2 size={18} /> Signée par {sig.signer_name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginBottom: 10 }}>Le {fmtDbDateTime(sig.signed_at)} · adresse IP {sig.ip || 'inconnue'} · montant {money(quote.montant)}</div>
          <img src={sig.signature_png} alt={`Signature de ${sig.signer_name}`} style={{ width: '100%', maxHeight: 180, objectFit: 'contain', background: '#fff', borderRadius: 10, border: '1px solid var(--border)' }} />
        </div>
      ) : !loading && (
        <div>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            Le client ouvre un lien privé sur son téléphone, lit le résumé ({money(quote.montant)}), écrit son nom et signe au doigt. La soumission passe à « Acceptée » et tu reçois un courriel. Le lien est valable 30 jours.
          </p>
          {link?.url ? (
            <>
              <input readOnly aria-label="Lien de signature" value={link.url} onFocus={e => e.target.select()} style={{ ...inputStyle, marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={btnAccent} onClick={copy}><Copy size={15} /> Copier le lien</button>
                {!link.envoye && <button type="button" style={btnGhost} disabled={busy} onClick={() => make(true)}><Mail size={15} /> Envoyer par courriel</button>}
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--fg-faint)' }}>Garde ce lien privé : toute personne qui l’a peut signer. Créer un nouveau lien annule l’ancien.</p>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={btnAccent} disabled={busy} onClick={() => make(false)}>Créer le lien de signature</button>
              <button type="button" style={btnGhost} disabled={busy} onClick={() => make(true)}><Mail size={15} /> Créer et envoyer par courriel</button>
            </div>
          )}
          {sig && !link && <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--fg-faint)' }}>Un lien a déjà été créé le {fmtDbDateTime(sig.created_at)}{sig.expire ? ' (expiré)' : ''}. Pour des raisons de sécurité, il ne peut pas être réaffiché : crées-en un nouveau.</p>}
        </div>
      )}
    </Modal>
  );
}
