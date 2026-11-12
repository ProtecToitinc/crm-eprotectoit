import { fmtDay } from './dates';

export const quoteLink = q => `/clients/${q.client_id}?soumission=${q.id}#soumission-${q.id}`;

export function followLabel(q, today) {
  if (q.suivi_ferme) return 'Suivi clôturé';
  if (!q.echeance_suivi) return 'Suivi non planifié';
  if (q.echeance_suivi === today) return 'À relancer aujourd’hui';
  if (q.echeance_suivi < today) {
    const days = Math.round((Date.parse(today) - Date.parse(q.echeance_suivi)) / 86400000);
    return `${days} jour${days === 1 ? '' : 's'} de retard · ${fmtDay(q.echeance_suivi)}`;
  }
  return `Prochain suivi le ${fmtDay(q.echeance_suivi)}`;
}
