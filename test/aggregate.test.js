// node test/aggregate.test.js
const assert = require('assert');
const { aggregate } = require('../web/aggregate.js');

const run = (id, date, km, min) => ({ id, type: 'running', date, distanceM: km === null ? null : km * 1000, durationS: min === null ? null : min * 60 });

// Cas nominal
let r = aggregate([run('1', '2026-01-10', 10, 50), run('2', '2026-03-02', 5, 30), run('3', '2026-02-01', 21.1, 110)]);
assert.strictEqual(r.count, 3);
assert.ok(Math.abs(r.totalDistanceM - 36100) < 1e-6);
assert.strictEqual(r.totalDurationS, (50 + 30 + 110) * 60);
assert.strictEqual(r.withDistance, 3);
assert.strictEqual(r.longest.id, '3');
assert.strictEqual(r.firstDate, '2026-01-10');
assert.strictEqual(r.lastDate, '2026-03-02');
assert.ok(Math.abs(r.avgDistanceM - 36100 / 3) < 1e-6);
// allure pondérée = durée totale / distance totale
assert.ok(Math.abs(r.paceDurationS / (r.paceDistanceM / 1000) - (190 * 60) / 36.1) < 1e-9);

// Distance ou durée manquante : non comptée, mais l'activité reste dans le compte
r = aggregate([run('1', '2026-01-10', 10, 50), run('2', '2026-01-11', null, 40), run('3', '2026-01-12', 6, null)]);
assert.strictEqual(r.count, 3);
assert.strictEqual(r.withDistance, 2);
assert.strictEqual(r.withDuration, 2);
assert.strictEqual(r.totalDistanceM, 16000);
assert.strictEqual(r.totalDurationS, 90 * 60);
assert.strictEqual(r.paceDistanceM, 10000, 'allure basée sur les activités complètes seulement');
assert.strictEqual(r.paceDurationS, 50 * 60);

// Dénivelé : somme sur les activités qui en ont, les autres sont signalées par withElevation
r = aggregate([
  Object.assign(run('1', '2026-01-10', 10, 50), { elevGainM: 120 }),
  Object.assign(run('2', '2026-01-11', 5, 30), { elevGainM: 0 }),
  Object.assign(run('3', '2026-01-12', 6, 35), { elevGainM: null })
]);
assert.strictEqual(r.withElevation, 2);
assert.strictEqual(r.totalElevationGainM, 120);
assert.strictEqual(r.avgElevationGainM, 60);
r = aggregate([run('1', '2026-01-10', 10, 50)]);
assert.strictEqual(r.withElevation, 0);
assert.strictEqual(r.avgElevationGainM, null);

// Aucune distance
r = aggregate([run('1', '2026-01-10', null, 50)]);
assert.strictEqual(r.avgDistanceM, null);
assert.strictEqual(r.longest, null);

// Types mixtes refusés, liste vide
assert.strictEqual(aggregate([run('1', '2026-01-10', 10, 50), { id: '9', type: 'cycling', date: '2026-01-11', distanceM: 1, durationS: 1 }]).error, 'mixed');
assert.strictEqual(aggregate([]).error, 'empty');

console.log('OK : tests de l\'addition passent.');
