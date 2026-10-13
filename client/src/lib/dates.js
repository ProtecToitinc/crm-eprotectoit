// Dates du CRM.
// - Les champs « YYYY-MM-DD » (date_debut, due_date, date_appel…) sont des jours de calendrier :
//   `new Date('2026-06-02')` les lit en UTC et affiche la veille au Québec → on les lit en local.
// - created_at / updated_at (SQLite) sont en UTC « YYYY-MM-DD HH:MM:SS » (pas parsable par Safari tel quel).

const pad = n => String(n).padStart(2, '0');

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayKey = () => dateKey(new Date());

export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

export function addDays(key, n) {
  const d = parseDay(key) || new Date();
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function nowTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDb(s) {
  if (!s) return null;
  const str = String(s);
  const d = /[zZ]|[+-]\d{2}:?\d{2}$/.test(str) ? new Date(str) : new Date(str.replace(' ', 'T') + 'Z');
  return isNaN(d) ? null : d;
}

export function fmtDay(s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = parseDay(s);
  return d ? d.toLocaleDateString('fr-CA', opts) : '—';
}

export function fmtDbDay(s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = parseDb(s);
  return d ? d.toLocaleDateString('fr-CA', opts) : '—';
}

export function fmtDbDateTime(s) {
  const d = parseDb(s);
  return d
    ? d.toLocaleString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
}

// Écart en jours entre un jour « YYYY-MM-DD » et aujourd'hui (négatif = passé)
export function daysFromToday(key) {
  const d = parseDay(key);
  if (!d) return null;
  return Math.round((d - parseDay(todayKey())) / 86400000);
}

export function relativeDay(key) {
  const diff = daysFromToday(key);
  if (diff === null) return '';
  if (diff === 0) return 'Aujourd’hui';
  if (diff === 1) return 'Demain';
  if (diff === -1) return 'Hier';
  if (diff > 1) return `Dans ${diff} jours`;
  return `Il y a ${-diff} jours`;
}

export function timeAgo(dbStr) {
  const d = parseDb(dbStr);
  if (!d) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'À l’instant';
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hier';
  return `Il y a ${days} jours`;
}
