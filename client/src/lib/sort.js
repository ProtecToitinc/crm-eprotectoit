import { useCallback, useState } from 'react';

// Tri alphabétique français (sans tenir compte des accents ni de la casse, « 2 » avant « 10 »)
const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

// Texte : A→Z, valeurs vides toujours à la fin
export function cmpText(a, b) {
  const x = String(a ?? '').trim();
  const y = String(b ?? '').trim();
  if (!x && !y) return 0;
  if (!x) return 1;
  if (!y) return -1;
  return collator.compare(x, y);
}

// Nombre / date comparable (chaîne ISO) : valeurs vides toujours à la fin, sens = 1 (croissant) ou -1 (décroissant)
export function cmpValue(a, b, dir = 1) {
  const empty = v => v === null || v === undefined || v === '';
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1;
  if (empty(b)) return -1;
  if (a < b) return -dir;
  if (a > b) return dir;
  return 0;
}

// Choix de tri mémorisé dans le navigateur (si le stockage est bloqué, il reste valable pour la session)
export function useStoredChoice(key, initial, allowed) {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      if (v && (!allowed || allowed.includes(v))) return v;
    } catch { /* stockage indisponible */ }
    return initial;
  });
  const set = useCallback(v => {
    setValue(v);
    try { localStorage.setItem(key, v); } catch { /* stockage indisponible */ }
  }, [key]);
  return [value, set];
}
