'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

const day = n => new Date(Date.now() + n * 86400000 - 5 * 3600000).toISOString().slice(0, 10); // ~ heure de Toronto
let srv, token;
const api = (m, u, body) => srv.call(m, u, { token, body });

before(async () => {
  const times = [0, 1, 2, 3, 4, 5, 6, 7].map(day);
  const fake = {
    geo: { results: [{ latitude: 46.8, longitude: -71.2, name: 'Québec', admin1: 'Québec' }] },
    forecast: {
      current: { temperature_2m: 14, precipitation: 0, weather_code: 2, wind_speed_10m: 12 },
      daily: {
        time: times, weather_code: [2, 63, 0, 0, 0, 0, 0, 0], temperature_2m_max: [18, 12, 20, 20, 20, 20, 20, 20], temperature_2m_min: [8, 6, 9, 9, 9, 9, 9, 9],
        precipitation_sum: [0, 9, 0, 0, 0, 0, 0, 0], precipitation_probability_max: [10, 90, 5, 5, 5, 5, 5, 5], wind_speed_10m_max: [15, 30, 10, 10, 10, 10, 10, 10], snowfall_sum: [0, 0, 0, 0, 0, 0, 0, 0]
      }
    }
  };
  srv = await startServer({ METEO_FAKE: JSON.stringify(fake) });
  token = await srv.login();
});
after(async () => { await srv.stop(); });

test('météo : prévision, verdict par jour, ville par défaut modifiable', async () => {
  const m = await api('GET', '/api/meteo');
  assert.equal(m.status, 200);
  assert.equal(m.data.jours.length, 8);
  assert.equal(m.data.jours[0].verdict, 'bon');
  assert.equal(m.data.jours[1].verdict, 'mauvais');
  assert.match(m.data.jours[1].raisons.join(' '), /Précipitations/);
  assert.equal((await api('GET', '/api/meteo/ville')).data.ville, 'Québec');
  assert.equal((await api('PUT', '/api/meteo/ville', { ville: 'Lévis' })).data.ville, 'Lévis');
  assert.equal((await api('PUT', '/api/meteo/ville', { ville: '' })).status, 400);
  assert.equal((await srv.call('GET', '/api/meteo')).status, 401);
});

test('rappel de la veille : tâche créée, message avec la consigne de l’entrée, envoi refusé sans courriel', async () => {
  const c = await api('POST', '/api/clients', { nom: 'Tremblay', prenom: 'Julie', ville: 'Québec' });
  const ch = await api('POST', '/api/chantiers', { client_id: c.data.id, titre: 'Toiture', statut: 'planifie', date_debut: day(1) });
  assert.equal(ch.status, 201);
  const r = await api('GET', `/api/chantiers/${ch.data.id}/rappel`);
  assert.equal(r.data.pret, true);
  assert.match(r.data.text, /dégager l’entrée devant la maison/);
  assert.match(r.data.text, /Julie/);
  assert.match(r.data.text, /Si la météo nous oblige à reporter/, 'pluie prévue demain');
  await api('POST', '/api/relances/run');
  await api('POST', '/api/relances/run'); // idempotent
  const tasks = (await api('GET', '/api/taches')).data;
  assert.equal(tasks.filter(t => /Rappel client avant les travaux/.test(t.titre) && /Tremblay/.test(t.titre)).length, 1);
  assert.equal(tasks.filter(t => /Météo défavorable/.test(t.titre)).length, 1, 'météo mauvaise demain : proposition de report');
  assert.equal((await api('POST', `/api/chantiers/${ch.data.id}/rappel/envoyer`)).status, 400, 'pas de courriel client');
  const list = (await api('GET', '/api/meteo/chantiers')).data;
  assert.equal(list.length, 1);
  assert.equal(list[0].jour.verdict, 'mauvais');
});

test('envoi automatique : désactivé par défaut', async () => {
  assert.equal((await api('GET', '/api/rappels/veille/config')).data.auto, false);
  assert.equal((await api('PUT', '/api/rappels/veille/config', { auto: true })).data.auto, true);
  assert.equal((await api('PUT', '/api/rappels/veille/config', { auto: false })).data.auto, false);
});
