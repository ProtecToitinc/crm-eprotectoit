const BASE = '/api';

function getToken() {
  return localStorage.getItem('crm_token') || '';
}

async function req(method, path, body, isFormData = false) {
  const headers = { Authorization: `Bearer ${getToken()}` };
  if (!isFormData) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined
  });
  if (res.status === 401) {
    localStorage.removeItem('crm_token');
    window.location.href = '/';
    return;
  }
  return res.json();
}

export const api = {
  login: (password) => req('POST', '/auth/login', { password }),
  verify: (token) => req('POST', '/auth/verify', { token }),

  meta: () => req('GET', '/meta'),
  geocode: () => req('POST', '/geocode'),
  stats: () => req('GET', '/stats'),

  clients: {
    list: (q) => req('GET', `/clients${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    get: (id) => req('GET', `/clients/${id}`),
    create: (data) => req('POST', '/clients', data),
    update: (id, data) => req('PUT', `/clients/${id}`, data),
    delete: (id) => req('DELETE', `/clients/${id}`)
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
    list: (debut, fin) => req('GET', `/evenements${debut ? `?debut=${debut}&fin=${fin}` : ''}`),
    create: (data) => req('POST', '/evenements', data),
    update: (id, data) => req('PUT', `/evenements/${id}`, data),
    delete: (id) => req('DELETE', `/evenements/${id}`)
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
