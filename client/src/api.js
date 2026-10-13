const BASE = '/api';

function getToken() {
  return localStorage.getItem('crm_token') || '';
}

// Une réponse en erreur lève une exception (message du serveur) au lieu d'être prise pour des données.
async function req(method, path, body, isFormData = false) {
  const headers = { Authorization: `Bearer ${getToken()}` };
  if (!isFormData) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined
    });
  } catch {
    throw new Error('Connexion au serveur impossible');
  }
  const isAuthCall = path.startsWith('/auth/');
  if (res.status === 401 && !isAuthCall) {
    localStorage.removeItem('crm_token');
    window.location.href = '/';
    return new Promise(() => {}); // la page se recharge
  }
  let data = null;
  try { data = await res.json(); } catch { /* corps vide */ }
  if (!res.ok && !isAuthCall) throw new Error(data?.message || `Erreur ${res.status}`);
  return data;
}

// Authenticated binary fetch for private documents and photos.
async function getPrivateFile(name) {
  const res = await fetch('/api/uploads/' + encodeURIComponent(name), {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'Session expirée' : 'Fichier inaccessible');
  return res.blob();
}
async function downloadPrivateFile(name, displayName) {
  const blob = await getPrivateFile(name);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = displayName || name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function qs(params = {}) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '' || v === false) return;
    p.set(k, v === true ? '1' : v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const api = {
  privateFiles: { get: getPrivateFile, download: downloadPrivateFile },
  login: (password, user) => req('POST', '/auth/login', { password, user }),
  verify: (token) => req('POST', '/auth/verify', { token }),
  logout: () => req('POST', '/auth/logout', {}),
  sessions: () => req('GET', '/auth/sessions'),
  revokeOtherSessions: () => req('POST', '/auth/sessions/revoke-others', {}),

  meta: () => req('GET', '/meta'),
  geocode: () => req('POST', '/geocode'),
  stats: () => req('GET', '/stats'),
  performance: (periode = 'mois') => req('GET', `/performance?periode=${encodeURIComponent(periode)}`),
  search: (q) => req('GET', `/search${qs({ q })}`),

  clients: {
    list: (q) => req('GET', `/clients${qs({ q })}`),
    get: (id) => req('GET', `/clients/${id}`),
    create: (data) => req('POST', '/clients', data),
    update: (id, data) => req('PUT', `/clients/${id}`, data),
    delete: (id) => req('DELETE', `/clients/${id}`),
    setResponsable: (id, responsable) => req('PUT', `/clients/${id}/responsable`, { responsable })
  },

  opportunites: {
    list: () => req('GET', '/opportunites'),
    create: (data) => req('POST', '/opportunites', data),
    update: (id, data) => req('PUT', `/opportunites/${id}`, data),
    delete: (id) => req('DELETE', `/opportunites/${id}`)
  },

  taches: {
    list: () => req('GET', '/taches'),
    create: (data) => req('POST', '/taches', data),
    update: (id, data) => req('PUT', `/taches/${id}`, data),
    delete: (id) => req('DELETE', `/taches/${id}`)
  },

  documents: {
    upload: (formData) => req('POST', '/documents', formData, true),
    delete: (id) => req('DELETE', `/documents/${id}`)
  },

  quotes: {
    list: () => req('GET', '/quotes'),
    create: (data) => req('POST', '/quotes', data),
    update: (id, data) => req('PUT', `/quotes/${id}`, data),
    delete: (id) => req('DELETE', `/quotes/${id}`)
  },

  invoices: {
    list: () => req('GET', '/invoices'),
    create: (data) => req('POST', '/invoices', data),
    update: (id, data) => req('PUT', `/invoices/${id}`, data),
    delete: (id) => req('DELETE', `/invoices/${id}`)
  },

  evenements: {
    list: (debut, fin) => req('GET', `/evenements${qs({ debut, fin })}`),
    create: (data) => req('POST', '/evenements', data),
    update: (id, data) => req('PUT', `/evenements/${id}`, data),
    delete: (id) => req('DELETE', `/evenements/${id}`)
  },

  // client_id = null → note générale ; list({ general: true }) = notes générales seulement
  notes: {
    list: (params) => req('GET', `/notes${qs(params)}`),
    create: (data) => req('POST', '/notes', data),
    update: (id, data) => req('PUT', `/notes/${id}`, data),
    delete: (id) => req('DELETE', `/notes/${id}`)
  },

  // direction : entrant (le client a appelé) | sortant (on l'a appelé) | manque
  appels: {
    list: (params) => req('GET', `/appels${qs(params)}`),
    create: (data) => req('POST', '/appels', data),
    update: (id, data) => req('PUT', `/appels/${id}`, data),
    delete: (id) => req('DELETE', `/appels/${id}`)
  },

  leads: {
    list: (params) => req('GET', `/leads${qs(params)}`),
    get: id => req('GET', `/leads/${id}`),
    count: () => req('GET', '/leads/count'),
    create: data => req('POST', '/leads', data),
    update: (id, data) => req('PUT', `/leads/${id}`, data),
    remove: id => req('DELETE', `/leads/${id}`),
    convert: id => req('POST', `/leads/${id}/convertir`, {}),
    markSeen: () => req('POST', '/leads/mark-seen', {}),
    contact: (id, data) => req('POST', `/leads/${id}/contact`, data),
    addNote: (id, contenu) => req('POST', `/leads/${id}/notes`, { contenu }),
    deleteNote: (id, noteId) => req('DELETE', `/leads/${id}/notes/${noteId}`),
    take: id => req('POST', `/leads/${id}/prendre`, {}),
    release: id => req('POST', `/leads/${id}/liberer`, {})
  },
  integrations: {
    get: () => req('GET','/integrations'),
    save: data => req('PUT','/integrations',data),
    webhook: () => req('GET','/integrations/webhook'),
    renewWebhook: () => req('POST','/integrations/webhook/renew',{}),
    testEmail: data => req('POST','/integrations/test-email',data)
  },
  drive: {
    status: () => req('GET','/drive/status'),
    items: () => req('GET','/drive/items'),
    sync: data => req('POST','/drive/sync',data),
    run: () => req('GET','/drive/run'),
    resolve: (id, data) => req('POST', `/drive/items/${encodeURIComponent(id)}/resolve`, data),
    setAuto: enabled => req('POST', '/drive/auto', { enabled })
  },
  health: () => req('GET', '/health'),
  attention: () => req('GET', '/attention'),
  relances: { run: () => req('POST', '/relances/run', {}) },
  suiviSoumissions: {
    get: () => req('GET', '/suivi-soumissions'),
    sent: (id, date_envoi) => req('POST', `/quotes/${id}/envoyee`, { date_envoi }),
    followUp: (id, data) => req('POST', `/quotes/${id}/suivi`, data),
    lost: (id, raison) => req('POST', `/quotes/${id}/perdue`, { raison })
  },
  chantiers: {
    list: () => req('GET', '/chantiers'),
    get: id => req('GET', `/chantiers/${id}`),
    create: data => req('POST', '/chantiers', data),
    update: (id, data) => req('PUT', `/chantiers/${id}`, data),
    delete: id => req('DELETE', `/chantiers/${id}`),
    addPhoto: (id, formData) => req('POST', `/chantiers/${id}/photos`, formData, true),
    deletePhoto: (id, photoId) => req('DELETE', `/chantiers/${id}/photos/${photoId}`)
  },
  rentabilite: {
    list: () => req('GET', '/rentabilite'),
    get: oppId => req('GET', `/rentabilite/${oppId}`),
    save: (oppId, data) => req('PUT', `/rentabilite/${oppId}`, data)
  },
  ads: {
    dashboard: params => req('GET', `/ads/dashboard${qs(params)}`),
    sync: () => req('POST', '/ads/sync', {})
  },
  backups: {
    list: () => req('GET', '/backups'),
    create: () => req('POST', '/backups', {}),
    restore: (name) => req('POST', `/backups/${name}/restore`, { confirm: name }),
    remove: name => req('DELETE', `/backups/${name}`)
  },
  audit: {
    list: params => req('GET', `/audit${qs(params)}`),
    restore: id => req('POST', `/audit/${id}/restore`, {})
  },
  metaAds: {
    poll: () => req('POST','/meta/poll',{}),
    importHistory: () => req('POST','/leads/import-historique',{}),
    disconnect: () => req('POST','/meta/disconnect',{})
  },
  google: {
    status: () => req('GET', '/google/status'),
    authUrl: () => req('GET', '/google/auth-url'),
    disconnect: () => req('POST', '/google/disconnect'),
    sync: () => req('POST', '/google/sync'),
    calendars: () => req('GET', '/google/calendars'),
    setCalendar: (calendarId) => req('POST', '/google/calendar', { calendarId }),
    createCalendar: () => req('POST', '/google/calendar/create')
  }
};
