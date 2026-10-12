const STAGES = [
  { key: 'lead', label: 'Nouveau lead', short: 'Nouveau', hue: '#9aa0a6' },
  { key: 'soumission', label: 'Soumission envoyée', short: 'Soumission', hue: '#c8924a' },
  { key: 'rdv', label: 'Rendez-vous', short: 'RDV', hue: '#6b8cae' },
  { key: 'contrat', label: 'Contrat signé', short: 'Contrat', hue: '#b27a3e' },
  { key: 'complete', label: 'Projet complété', short: 'Complété', hue: '#5f9d5f' }
];

const SERVICES = {
  'Nano Protection': '#6b8cae',
  'Protection Élastomère': '#c17a3f',
  'Nettoyage de Toiture': '#5f9d5f',
  'Nettoyage de Gouttière': '#a86b8c'
};

const QUOTE_STATUSES = {
  brouillon: { label: 'Brouillon', hue: '#9aa0a6' },
  envoyee: { label: 'Envoyée', hue: '#6b8cae' },
  acceptee: { label: 'Acceptée', hue: '#5f9d5f' },
  refusee: { label: 'Refusée', hue: '#c4584f' }
};

const INVOICE_STATUSES = {
  payee: { label: 'Payée', hue: '#5f9d5f' },
  en_attente: { label: 'En attente', hue: '#c8924a' },
  en_retard: { label: 'En retard', hue: '#c4584f' }
};

const EVENT_TYPES = {
  inspection: { label: 'Inspection', hue: '#6b8cae' },
  rdv: { label: 'RDV', hue: '#c17a3f' },
  projet: { label: 'Projet', hue: '#5f9d5f' },
  relance: { label: 'Relance', hue: '#9aa0a6' }
};

module.exports = { STAGES, SERVICES, QUOTE_STATUSES, INVOICE_STATUSES, EVENT_TYPES };
