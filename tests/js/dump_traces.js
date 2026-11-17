// Prints JS-engine traces as JSON so tests/test_parity.py can compare them with neuron.py.
import * as L from '../../docs/js/lif.js';

const durationMs = 300;
const out = [];
for (const dtMs of [0.1, 0.25]) {
  const t = L.timeAxis(durationMs, dtMs);
  for (const method of Object.keys(L.METHODS)) {
    for (const refractoryMs of [0, 2.3]) {
      for (const type of Object.keys(L.WAVEFORMS)) {
        const I = L.makeStimulus(type, {}, t);
        const r = L.simulate({ current: I, durationMs, membrane: { dtMs, method, refractoryMs } });
        out.push({ type, method, dtMs, refractoryMs, current: Array.from(I), voltage: Array.from(r.V), spikes: r.spikes });
      }
    }
  }
}
process.stdout.write(JSON.stringify(out));
