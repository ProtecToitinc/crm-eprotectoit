export const STAGES = [
  { key: 'lead', label: 'Nouveau lead', short: 'Nouveau', hue: '#9aa0a6' },
  { key: 'soumission', label: 'Soumission envoyée', short: 'Soumission', hue: '#c8924a' },
  { key: 'rdv', label: 'Rendez-vous', short: 'RDV', hue: '#6b8cae' },
  { key: 'contrat', label: 'Contrat signé', short: 'Contrat', hue: '#b27a3e' },
  { key: 'complete', label: 'Projet complété', short: 'Complété', hue: '#5f9d5f' }
];

export const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));

export const SERVICES = [
  { name: 'Nano Protection', hue: '#6b8cae' },
  { name: 'Protection Élastomère', hue: '#c17a3f' },
  { name: 'Nettoyage de Toiture', hue: '#5f9d5f' },
  { name: 'Nettoyage de Gouttière', hue: '#a86b8c' }
];

export const SERVICE_HUE = Object.fromEntries(SERVICES.map(s => [s.name, s.hue]));

export const QUOTE_STATUSES = {
  brouillon: { label: 'Brouillon', hue: '#9aa0a6' },
  envoyee: { label: 'Envoyée', hue: '#6b8cae' },
  acceptee: { label: 'Acceptée', hue: '#5f9d5f' },
  refusee: { label: 'Refusée', hue: '#c4584f' }
};

export const INVOICE_STATUSES = {
  payee: { label: 'Payée', hue: '#5f9d5f' },
  en_attente: { label: 'En attente', hue: '#c8924a' },
  en_retard: { label: 'En retard', hue: '#c4584f' }
};

export const EVENT_TYPES = {
  inspection: { label: 'Inspection', hue: '#6b8cae' },
  rdv: { label: 'RDV', hue: '#c17a3f' },
  projet: { label: 'Projet', hue: '#5f9d5f' },
  relance: { label: 'Relance', hue: '#9aa0a6' }
};

export const CALL_DIRECTIONS = {
  entrant: { label: 'Appel reçu', pick: 'Le client a appelé', hue: '#5f9d5f' },
  sortant: { label: 'Appel fait', pick: 'J’ai appelé', hue: '#6b8cae' },
  manque: { label: 'Appel manqué', pick: 'Appel manqué', hue: '#c4584f' }
};

export const AVATAR_PALETTE =['#c17a3f', '#6b8cae', '#5f9d5f', '#a86b8c', '#8a8580', '#b27a3e'];

export function money(n) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 0 }).format(v) + ' $';
}

export function soft(hex) {
  return `color-mix(in srgb, ${hex} 16%, transparent)`;
}

export function initials(prenom, nom) {
  return ((prenom?.[0] || '') + (nom?.[0] || '')).toUpperCase();
}

export function avatarColor(seed) {
  const str = String(seed || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export function titleFor(screen) {
  const titles = {
    dashboard: ['Tableau de bord', 'Vue d’ensemble de votre activité'],
    pipeline: ['Pipeline des ventes', 'Lead → Soumission → RDV → Contrat → Projet complété'],
    clients: ['Clients', 'Votre carnet de clients et prospects'],
    calendar: ['Calendrier', 'Rendez-vous, inspections et chantiers'],
    quotes: ['Soumissions', 'Devis et estimations en cours'],
    map: ['Carte des projets', 'Répartition géographique de vos chantiers'],
    billing: ['Facturation', 'Factures, paiements et encaissements'],
    notes: ['Notes', 'Notes générales et notes par client'],
    calls: ['Appels', 'Journal des appels et rappels'],
    leads: ['Opportunités', 'Leads et demandes Meta Ads'],
    integrations: ['Intégrations', 'Google Drive, Meta Ads et courriels'],
    attention: ['À traiter', 'Ce qui demande ton attention maintenant'],
    salesfollow: ['Suivi des ventes', 'Soumissions en attente, relances et conversion'],
    jobs: ['Chantiers', 'De la signature à la facture payée'],
    ads: ['Publicités Meta', 'Leads, coûts et ventes par campagne'],
    settings: ['Sécurité et sauvegardes', 'Sauvegardes, historique des modifications et connexions']
  };
  return titles[screen] || ['', ''];
}
