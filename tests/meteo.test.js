'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');
let srv, token;
before(async () => {
  const dates = Array.from({ length: 8 }, (_, i) => new Date(Date.now() + (i + 1) * 86400000).toISOString().slice(0, 10));
  srv = await startServer({ METEO_FAKE: JSON.stringify({
    geo: { results: [{ latitude: 46.8, longitude: -71.2, name: 'Québec', admin1: 'Québec' }] },
    forecast: { current: { temperature_2m: 15, precipitation: 0, weather_code: 1, wind_speed_10m: 12 },
      daily: { time: dates, weather_code: Array(8).fill(1), temperature_2m_max: Array(8).fill(19),
        temperature_2m_min: Array(8).fill(9), precipitation_sum: Array(8).fill(0),
        precipitation_probability_max: Array(8).fill(10), wind_speed_10m_max: Array(8).fill(12),
        snowfall_sum: Array(8).fill(0) } }
  }) });
  token = await srv.login();
});
after(async () => { await srv.stop(); });
test('météo : prévisions disponibles avec autorisation', async () => {
  const x = await srv.call('GET', '/api/meteo', { token });
  assert.equal(x.status, 200);
  assert.equal(x.data.jours.length, 8);
  assert.equal((await srv.call('GET', '/api/meteo')).status, 401);
});
test('l’inventaire et les chantiers restent utilisables', async () => {
  const c = await srv.call('POST', '/api/clients', { token, body: { nom: 'Tremblay', prenom: 'Julie' } });
  assert.equal(c.status, 200);
  const ch = await srv.call('POST', '/api/chantiers', { token, body: { client_id: c.data.id, titre: 'Toiture' } });
  assert.equal(ch.status, 201);
});
