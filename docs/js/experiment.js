/**
 * Experiment files: a complete, versioned record of one run.
 *
 * An experiment file holds every input needed to regenerate a run (waveform,
 * all stimulus parameters including the random seed, membrane parameters,
 * time step, integrator, duration) plus the results it produced. Loading it in
 * the lab, or running `python reproduce.py file.json`, recomputes the run and
 * checks the spike times against the recorded ones.
 *
 * This module has no DOM code, so Node.js tests can use it directly.
 */
import * as L from './lif.js';

export const EXPERIMENT_FORMAT = 'neural-tidepool-experiment';
export const NOTEBOOK_FORMAT = 'neural-tidepool-notebook';
export const SCHEMA_VERSION = 1;
export const LAB = 'single-neuron';

/** A setup is { waveform, stimulus, membrane, durationMs }, fully specified. */
export function normaliseSetup({ waveform, stimulus = {}, membrane = {}, durationMs }) {
  if (!L.WAVEFORMS[waveform]) throw new Error(`Unknown waveform "${waveform}".`);
  const full = {
    waveform,
    stimulus: { ...L.WAVEFORMS[waveform].defaults, ...stimulus },
    membrane: { ...L.DEFAULT_MEMBRANE, ...membrane },
    durationMs: Number(durationMs),
  };
  for (const [group, values] of [['stimulus', full.stimulus], ['membrane', full.membrane]]) {
    for (const [k, v] of Object.entries(values)) {
      if (k === 'method') continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${group}.${k} must be a finite number.`);
    }
  }
  if (!Number.isFinite(full.durationMs) || full.durationMs <= 0) throw new Error('durationMs must be a positive number.');
  return full;
}

export function runSetup(setup) {
  const s = normaliseSetup(setup);
  const t = L.timeAxis(s.durationMs, s.membrane.dtMs);
  const I = L.makeStimulus(s.waveform, s.stimulus, t);
  const run = L.simulate({ current: I, durationMs: s.durationMs, membrane: s.membrane });
  return { setup: s, run, stats: L.spikeStats(run.spikes, s.durationMs) };
}

export function summarise(run, stats) {
  return {
    spikeTimesMs: run.spikes.slice(),
    spikeCount: stats.count,
    meanRateHz: stats.rateHz,
    isiRateHz: stats.isiRateHz,
    cvIsi: stats.cv,
    firstSpikeMs: stats.latency,
  };
}

export function toExperimentFile(setup, run, stats, { label = '', notes = '', createdAt = new Date().toISOString() } = {}) {
  return {
    format: EXPERIMENT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    engineVersion: L.ENGINE_VERSION,
    lab: LAB,
    createdAt,
    label,
    notes,
    setup: normaliseSetup(setup),
    results: summarise(run, stats),
  };
}

/** Validates an experiment file and returns its setup. Throws with a readable message. */
export function parseExperimentFile(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('This file is not valid JSON.');
  if (obj.format !== EXPERIMENT_FORMAT) throw new Error('This is not a Neural Tidepool experiment file.');
  if (obj.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported schema version ${obj.schemaVersion}; this lab reads version ${SCHEMA_VERSION}.`);
  if (obj.lab !== LAB) throw new Error(`This experiment belongs to the "${obj.lab}" lab.`);
  return normaliseSetup(obj.setup ?? {});
}

/**
 * Re-runs an experiment file and compares spike times with the recorded ones.
 * Same engine version: spike times must agree to 1e-9 ms.
 */
export function verifyExperiment(obj, tolerance = 1e-9) {
  const setup = parseExperimentFile(obj);
  const { run } = runSetup(setup);
  const recorded = obj.results?.spikeTimesMs ?? [];
  const sameCount = recorded.length === run.spikes.length;
  let maxDiff = 0;
  if (sameCount) for (let k = 0; k < recorded.length; k++) maxDiff = Math.max(maxDiff, Math.abs(recorded[k] - run.spikes[k]));
  return {
    reproduced: sameCount && maxDiff <= tolerance,
    sameEngine: obj.engineVersion === L.ENGINE_VERSION,
    recordedCount: recorded.length,
    count: run.spikes.length,
    maxDiff: sameCount ? maxDiff : null,
  };
}

/** CSV with a commented metadata header: one full experiment record per run. */
export function notebookCsv(runs, exportedAt = new Date().toISOString()) {
  const lines = [
    '# Neural Tidepool notebook export',
    `# engine_version: ${L.ENGINE_VERSION}`,
    `# exported_at: ${exportedAt}`,
    '# units: time_ms (ms), current_na (nA), voltage_mv (mV)',
    '# voltage_mv is the true membrane state at each sample; spikes are events listed in each run record.',
    '# Each "# run N:" line is a complete experiment file (JSON) that regenerates that run.',
  ];
  for (const r of runs) {
    if (r.experiment) lines.push(`# run ${r.number}: ${JSON.stringify({ ...r.experiment, notes: r.note ?? r.experiment.notes })}`);
    else lines.push(`# run ${r.number}: recorded before experiment files existed; setup: ${r.summary ?? ''}`);
  }
  lines.push('run,time_ms,current_na,voltage_mv');
  for (const r of runs) {
    for (let i = 0; i < r.t.length; i++) lines.push(`${r.number},${r.t[i]},${r.I[i]},${r.V[i]}`);
  }
  return lines.join('\n') + '\n';
}
