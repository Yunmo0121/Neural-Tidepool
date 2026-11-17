// Writes one experiment file per waveform (both integrators) as a JSON array,
// for tests/test_reproduce.py to re-run with the Python engine.
import * as L from '../../docs/js/lif.js';
import * as X from '../../docs/js/experiment.js';

const files = [];
for (const method of Object.keys(L.METHODS)) {
  for (const waveform of Object.keys(L.WAVEFORMS)) {
    const setup = { waveform, stimulus: waveform === 'noisy' ? { seed: 42, mean: 1.4, sigma: 0.8 } : {}, membrane: { method, dtMs: 0.05 }, durationMs: 400 };
    const { setup: full, run, stats } = X.runSetup(setup);
    files.push(X.toExperimentFile(full, run, stats, { label: `${waveform} (${method})`, createdAt: '2026-01-01T00:00:00.000Z' }));
  }
}
process.stdout.write(JSON.stringify(files));
