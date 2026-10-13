// Recherche tolérante côté navigateur (même logique que le serveur) :
// sans accents ni casse, tous les mots doivent être trouvés ; un numéro est cherché dans le téléphone.

export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const digits = s => String(s ?? '').replace(/\D/g, '');

export function matchClient(c, q) {
  const raw = String(q || '').trim().split(/\s+/).filter(Boolean);
  if (!raw.length) return true;
  const hay = norm([c.prenom, c.nom, c.email, c.adresse, c.ville, c.code_postal, c.notes].join(' '));
  const phone = digits(c.telephone);
  return raw.every(w => hay.includes(norm(w)) ||
    (/^[\d\s().+-]+$/.test(w) && digits(w).length >= 3 && phone.includes(digits(w))));
}

export const looksLikePhone = q => /^[\d\s().+-]{4,}$/.test(String(q || '').trim()) && digits(q).length >= 4;

export const fullName = c => `${c?.prenom || ''} ${c?.nom || ''}`.trim();

export function telHref(phone) {
  const d = digits(phone);
  return d ? `tel:${String(phone).trim().startsWith('+') ? '+' : ''}${d}` : null;
}
