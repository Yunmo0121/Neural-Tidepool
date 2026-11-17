// Run with: node --test tests/js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../../docs/js/lif.js';

test('no current, no spikes, voltage stays at rest', () => {
  const r = L.simulate({ current: 0, durationMs: 200 });
  assert.equal(r.spikes.length, 0);
  assert.ok(r.V.every((v) => Math.abs(v + 65) < 1e-12));
});

test('2.5 nA fires 8 times in 200 ms, first spike at the exact time', () => {
  const r = L.simulate({ current: 2.5, durationMs: 200 });
  assert.equal(r.spikes.length, 8);
  assert.ok(Math.abs(r.spikes[0] - L.analyticFirstSpike(2.5)) < 1e-9);
});

test('exact method: ISIs equal the analytic period, with and without refractoriness', () => {
  for (const refractoryMs of [0, 3, 3.4]) {
    const r = L.simulate({ current: 8, durationMs: 100, membrane: { refractoryMs, dtMs: 0.01 } });
    const period = 1000 / L.analyticRate(8, { refractoryMs });
    for (let k = 1; k < r.spikes.length; k++) assert.ok(Math.abs(r.spikes[k] - r.spikes[k - 1] - period) < 1e-9);
  }
});

test('voltage samples never exceed threshold', () => {
  const r = L.simulate({ current: 20, durationMs: 200 });
  assert.ok(Math.max(...r.V) < -50);
});

test('rheobase is (θ − V_rest) / R', () => {
  assert.equal(L.rheobase(), 1.5);
  assert.equal(L.simulate({ current: 1.45, durationMs: 1000 }).spikes.length, 0);
  assert.ok(L.simulate({ current: 1.6, durationMs: 1000 }).spikes.length > 0);
});

test('simulated f–I curve equals the analytic formula wherever it is defined', () => {
  for (const row of L.fiCurve({}, { points: 11 })) {
    if (row.simulated === null) assert.equal(row.spikes, 1);
    else assert.ok(Math.abs(row.simulated - row.analytic) < 1e-6, JSON.stringify(row));
  }
});

test('forward Euler converges at first order; the exact method is at rounding level', () => {
  const { slope, rows } = L.dtConvergence(2.5);
  assert.ok(Math.abs(slope - 1) < 0.05, `slope ${slope}`);
  for (const r of rows) assert.ok(r.exact < 1e-9);
});

test('every waveform yields one finite sample per time step', () => {
  const t = L.timeAxis(300, 0.1);
  for (const type of Object.keys(L.WAVEFORMS)) {
    const I = L.makeStimulus(type, {}, t);
    assert.equal(I.length, t.length);
    assert.ok(I.every(Number.isFinite), type);
  }
});

test('noise is reproducible with the same seed and different with another', () => {
  const t = L.timeAxis(100, 0.1);
  const a = L.makeStimulus('noisy', { seed: 3 }, t);
  const b = L.makeStimulus('noisy', { seed: 3 }, t);
  const c = L.makeStimulus('noisy', { seed: 4 }, t);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('spike statistics', () => {
  const s = L.spikeStats([10, 30, 50], 100);
  assert.equal(s.count, 3);
  assert.equal(s.rateHz, 30);
  assert.equal(s.meanIsi, 20);
  assert.equal(s.cv, 0);
  assert.equal(s.isiRateHz, 50);
  assert.equal(s.latency, 10);
  const two = L.spikeStats([10, 30], 100);
  assert.equal(two.cv, null); // one interval: CV undefined
  assert.equal(L.spikeStats([10], 100).isiRateHz, null);
});

test('invalid parameters are rejected', () => {
  assert.throws(() => L.simulate({ current: 1, durationMs: 100, membrane: { tauMs: 0 } }));
  assert.throws(() => L.simulate({ current: 1, durationMs: 100, membrane: { thresholdMv: -80 } }));
});
