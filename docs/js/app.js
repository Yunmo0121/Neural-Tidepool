// Neural Tidepool: wires the LIF engine to the bench instruments.
import * as L from './lif.js';
import { PROTOCOLS } from './protocols.js';
import * as X from './experiment.js';

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

const STIM_SPECS = {
  amplitude: { label: 'Amplitude', min: 0, max: 10, step: 0.1, unit: 'nA', digits: 1, help: 'Strength of the injected current. Above the rheobase the neuron fires repeatedly.' },
  start: { label: 'Starts at', min: 0, max: 400, step: 5, unit: 'ms', digits: 0, help: 'When the current switches on.' },
  width: { label: 'Pulse width', min: 1, max: 200, step: 1, unit: 'ms', digits: 0, help: 'How long each pulse lasts.' },
  gap: { label: 'Gap between pulses', min: 5, max: 100, step: 1, unit: 'ms', digits: 0, help: 'Time from the start of the first pulse to the start of the second.' },
  offset: { label: 'Offset', min: 0, max: 4, step: 0.1, unit: 'nA', digits: 1, help: 'Average level of the oscillating current.' },
  frequency: { label: 'Frequency', min: 1, max: 40, step: 1, unit: 'Hz', digits: 0, help: 'Number of oscillations per second.' },
  mean: { label: 'Mean current', min: 0, max: 4, step: 0.05, unit: 'nA', digits: 2, help: 'Average current. Below the rheobase only the fluctuations can trigger spikes.' },
  sigma: { label: 'Noise size', min: 0, max: 2, step: 0.05, unit: 'nA', digits: 2, help: 'Standard deviation of the fluctuating current, which changes on a 5 ms timescale.' },
  seed: { label: 'Random seed', min: 1, max: 99, step: 1, unit: '', digits: 0, help: 'Fixes the random sequence, so a noisy run can be repeated exactly.' },
};
// Per-waveform tweaks to the shared specs.
const STIM_OVERRIDES = {
  constant: { amplitude: { max: 20 } },
  step: { amplitude: { max: 20 } },
  sine: { amplitude: { label: 'Swing (±)', max: 4, help: 'How far the current swings above and below the offset.' } },
};
const WAVE_KEYS = {
  constant: ['amplitude'],
  step: ['amplitude', 'start'],
  pulse: ['amplitude', 'start', 'width'],
  twoPulses: ['amplitude', 'start', 'width', 'gap'],
  sine: ['offset', 'amplitude', 'frequency'],
  noisy: ['mean', 'sigma', 'seed'],
};
const MEM_SPECS = {
  tauMs: { label: 'Time constant τ', min: 5, max: 50, step: 1, unit: 'ms', digits: 0, help: 'How quickly the voltage follows the input (τ = RC). Larger τ means slower, smoother integration.' },
  thresholdMv: { label: 'Spike threshold θ', min: -60, max: -40, step: 1, unit: 'mV', digits: 0, help: 'Voltage at which a spike is registered and the voltage is reset.' },
  refractoryMs: { label: 'Refractory period', min: 0, max: 10, step: 0.5, unit: 'ms', digits: 1, help: 'After a spike the voltage is held at reset for this long. It caps the firing rate at 1 / t_ref.' },
};
const ADV_SPECS = {
  restingMv: { label: 'Resting voltage', min: -75, max: -55, step: 1, unit: 'mV', digits: 0, help: 'Voltage the membrane settles to with no input.' },
  resetMv: { label: 'Reset voltage', min: -80, max: -60, step: 1, unit: 'mV', digits: 0, help: 'Voltage right after a spike.' },
  resistanceMohm: { label: 'Membrane resistance R', min: 5, max: 20, step: 0.5, unit: 'MΩ', digits: 1, help: 'Converts current into voltage: a current I shifts the steady voltage by R × I.' },
};
const DURATION_SPEC = { label: 'Recording length', min: 100, max: 1000, step: 50, unit: 'ms', digits: 0, help: 'Length of the simulated recording.' };

const fmt = (x, digits = 1) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(digits);

function defaultState() {
  const stim = {};
  for (const [k, w] of Object.entries(L.WAVEFORMS)) stim[k] = { ...w.defaults };
  return { waveform: 'constant', stim, membrane: { ...L.DEFAULT_MEMBRANE }, durationMs: 200 };
}

let state = loadStateFromHash() ?? defaultState();

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: keep in memory */ }
  },
};

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(10, rect.width), h = Math.max(10, rect.height);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

/** Adds a min/max-per-pixel polyline to the current path, so thin spikes survive downsampling. */
function tracePath(ctx, t, y, i0, i1, xOf, yOf) {
  if (i1 <= i0) return;
  const span = xOf(t[i1 - 1]) - xOf(t[i0]);
  const perPixel = Math.max(1, Math.floor((i1 - i0) / Math.max(1, span * 1.5)));
  ctx.moveTo(xOf(t[i0]), yOf(y[i0]));
  if (perPixel === 1) {
    for (let i = i0 + 1; i < i1; i++) ctx.lineTo(xOf(t[i]), yOf(y[i]));
    return;
  }
  for (let i = i0; i < i1; i += perPixel) {
    let lo = Infinity, hi = -Infinity, loI = i, hiI = i;
    const end = Math.min(i1, i + perPixel);
    for (let j = i; j < end; j++) {
      if (y[j] < lo) { lo = y[j]; loI = j; }
      if (y[j] > hi) { hi = y[j]; hiI = j; }
    }
    const [a, b] = loI < hiI ? [loI, hiI] : [hiI, loI];
    ctx.lineTo(xOf(t[a]), yOf(y[a]));
    ctx.lineTo(xOf(t[b]), yOf(y[b]));
  }
}

function makeSlider(container, key, spec, value, onInput) {
  const row = document.createElement('div');
  row.className = 'ctrl';
  const id = `ctrl-${container.id}-${key}`;
  row.innerHTML = `<label for="${id}">${spec.label}</label><output for="${id}"></output>
    <input id="${id}" type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}"${spec.help ? ` aria-describedby="${id}-help"` : ''}>${spec.help ? `<p class="ctrl-help" id="${id}-help">${spec.help}</p>` : ''}`;
  const input = row.querySelector('input');
  const out = row.querySelector('output');
  const paint = () => {
    const v = Number(input.value);
    out.textContent = `${fmt(v, spec.digits)}${spec.unit ? ' ' + spec.unit : ''}`;
    input.style.setProperty('--fill', `${((v - spec.min) / (spec.max - spec.min)) * 100}%`);
  };
  input.value = value;
  paint();
  input.addEventListener('input', () => { paint(); onInput(Number(input.value)); });
  container.appendChild(row);
  return row;
}

/* ------------------------------------------------------------------ */
/* Building the panels                                                 */
/* ------------------------------------------------------------------ */

function buildWaveforms() {
  const box = $('waveforms');
  box.innerHTML = '';
  for (const [key, w] of Object.entries(L.WAVEFORMS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.textContent = w.label;
    b.setAttribute('aria-checked', String(key === state.waveform));
    b.addEventListener('click', () => {
      state.waveform = key;
      buildWaveforms();
      buildStimParams();
      update();
    });
    box.appendChild(b);
  }
}

function buildStimParams() {
  const box = $('stimParams');
  box.innerHTML = '';
  const params = state.stim[state.waveform];
  for (const key of WAVE_KEYS[state.waveform]) {
    const spec = { ...STIM_SPECS[key], ...(STIM_OVERRIDES[state.waveform]?.[key] ?? {}) };
    makeSlider(box, key, spec, params[key], (v) => { params[key] = v; update(); });
  }
  makeSlider(box, 'duration', DURATION_SPEC, state.durationMs, (v) => {
    state.durationMs = v;
    update({ keepTime: true });
  });
}

function buildMembrane() {
  const mem = $('memParams'), adv = $('advParams');
  mem.innerHTML = '';
  adv.innerHTML = '';
  for (const [key, spec] of Object.entries(MEM_SPECS)) {
    makeSlider(mem, key, spec, state.membrane[key], (v) => { state.membrane[key] = v; update(); });
  }
  for (const [key, spec] of Object.entries(ADV_SPECS)) {
    makeSlider(adv, key, spec, state.membrane[key], (v) => { state.membrane[key] = v; update(); });
  }
  $('dtSelect').value = String(state.membrane.dtMs);
  $('methodSelect').value = state.membrane.method;
}

function buildAll() {
  buildWaveforms();
  buildStimParams();
  buildMembrane();
}

$('dtSelect').addEventListener('change', (e) => { state.membrane.dtMs = Number(e.target.value); update(); });
$('methodSelect').addEventListener('change', (e) => { state.membrane.method = e.target.value; update(); });
function currentSetup() {
  return { waveform: state.waveform, stimulus: { ...state.stim[state.waveform] }, membrane: { ...state.membrane }, durationMs: state.durationMs };
}

/** Puts the bench into exactly the state described by a (normalised) setup. */
function setBench(setup) {
  const s = X.normaliseSetup(setup);
  state = defaultState();
  state.waveform = s.waveform;
  Object.assign(state.stim[s.waveform], s.stimulus);
  Object.assign(state.membrane, s.membrane);
  state.durationMs = s.durationMs;
  cursors = [];
  renderCursorReadout();
  buildAll();
  update();
  restartClock();
}

$('resetBench').addEventListener('click', () => {
  state = defaultState();
  buildAll();
  update();
  restartClock();
});

/* ------------------------------------------------------------------ */
/* Simulation state                                                    */
/* ------------------------------------------------------------------ */

let run = null;      // latest simulation
let stats = null;
let error = null;

function simulateNow() {
  try {
    const t = L.timeAxis(state.durationMs, state.membrane.dtMs);
    const I = L.makeStimulus(state.waveform, state.stim[state.waveform], t);
    run = L.simulate({ current: I, durationMs: state.durationMs, membrane: state.membrane });
    stats = L.spikeStats(run.spikes, state.durationMs);
    error = null;
  } catch (e) {
    error = e.message;
  }
}

let analysisDirty = true;
function update({ keepTime = false } = {}) {
  simulateNow();
  analysisDirty = true;
  $('scrub').max = String(state.durationMs);
  if (!keepTime) { /* keep the clock running: changing a knob mid-sweep feels like a real rig */ }
  renderReadouts();
  scheduleAnalysis();
  saveStateToHash();
}

/* ------------------------------------------------------------------ */
/* Shareable setup in the URL                                          */
/* ------------------------------------------------------------------ */

function saveStateToHash() {
  const compact = { w: state.waveform, s: state.stim[state.waveform], m: state.membrane, d: state.durationMs };
  try { history.replaceState(null, '', '#' + encodeURIComponent(JSON.stringify(compact))); } catch { /* ignore */ }
}
function loadStateFromHash() {
  if (!location.hash || location.hash.length < 3) return null;
  try {
    const c = JSON.parse(decodeURIComponent(location.hash.slice(1)));
    if (!L.WAVEFORMS[c.w]) return null;
    const s = defaultState();
    s.waveform = c.w;
    Object.assign(s.stim[c.w], c.s);
    Object.assign(s.membrane, c.m);
    s.durationMs = Number(c.d) || s.durationMs;
    return s;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Readouts                                                            */
/* ------------------------------------------------------------------ */

function renderReadouts() {
  const rh = L.rheobase(state.membrane);
  const na = 'n/a';
  const cells = error
    ? ['Spikes', 'Mean rate', 'ISI rate', 'CV of ISI', 'First spike', 'Rheobase'].map((k) => [k, '–', ''])
    : [
        ['Spikes', String(stats.count), `in ${state.durationMs} ms`],
        ['Mean rate', `${stats.rateHz.toFixed(1)}<small>Hz</small>`, 'count / duration'],
        ['ISI rate', stats.isiRateHz !== null ? `${stats.isiRateHz.toFixed(1)}<small>Hz</small>` : na,
          stats.meanIsi ? `1 / mean ISI (${stats.meanIsi.toFixed(2)} ms)` : 'needs at least 2 spikes'],
        ['CV of ISI', stats.cv !== null ? stats.cv.toFixed(2) : na,
          stats.cv !== null ? `from ${stats.intervals} intervals` : 'needs at least 2 intervals'],
        ['First spike', stats.latency !== null ? `${stats.latency.toFixed(2)}<small>ms</small>` : na, 'latency'],
        ['Rheobase', `${rh.toFixed(2)}<small>nA</small>`, '(θ − V<sub>rest</sub>) / R'],
      ];
  $('readouts').innerHTML = cells.map(([k, v, sub]) => `<div><dt>${k}</dt><dd>${v}</dd><span class="sub">${sub}</span></div>`).join('');
}

function sampleRange(arr) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < arr.length; i++) { if (arr[i] < lo) lo = arr[i]; if (arr[i] > hi) hi = arr[i]; }
  return [lo, hi];
}

/* ------------------------------------------------------------------ */
/* Oscilloscope                                                        */
/* ------------------------------------------------------------------ */

const scopeCanvas = $('scope');
let cursors = [];
const SCOPE_PAD = { l: 48, r: 14, t: 14, b: 26 };

function scopeGeometry(w, h) {
  const plotW = w - SCOPE_PAD.l - SCOPE_PAD.r;
  const plotH = h - SCOPE_PAD.t - SCOPE_PAD.b;
  const vH = plotH * 0.7, gap = plotH * 0.06, iH = plotH - vH - gap;
  const m = state.membrane;
  const vLo = Math.min(-75, m.resetMv - 5), vHi = Math.max(-35, m.thresholdMv + 10);
  let [iLo, iHi] = run ? sampleRange(run.I) : [0, 1];
  for (const r of runs) if (!r.hidden) { const [a, b] = sampleRange(r.I); iLo = Math.min(iLo, a); iHi = Math.max(iHi, b); }
  iLo = Math.min(0, iLo); iHi = Math.max(1, iHi);
  const ip = (iHi - iLo) * 0.12; iLo -= ip; iHi += ip;
  return {
    plotW, vTop: SCOPE_PAD.t, vH, iTop: SCOPE_PAD.t + vH + gap, iH,
    xOf: (x) => SCOPE_PAD.l + (x / state.durationMs) * plotW,
    tOf: (px) => ((px - SCOPE_PAD.l) / plotW) * state.durationMs,
    vOf: (v) => SCOPE_PAD.t + (1 - (v - vLo) / (vHi - vLo)) * vH,
    iOf: (v) => SCOPE_PAD.t + vH + gap + (1 - (v - iLo) / (iHi - iLo)) * iH,
    vLo, vHi, iLo, iHi,
  };
}

function drawScope(simTime) {
  const { ctx, w, h } = setupCanvas(scopeCanvas);
  const g = scopeGeometry(w, h);
  const ocean = '#176f93', amber = '#d39a2b', coral = '#f18b6d';

  // graticule: 10 time divisions, voltage every 5 mV
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(23, 111, 147, 0.07)';
  ctx.beginPath();
  for (let k = 0; k <= 10; k++) {
    const x = Math.round(SCOPE_PAD.l + (k / 10) * g.plotW) + 0.5;
    ctx.moveTo(x, g.vTop); ctx.lineTo(x, g.vTop + g.vH);
    ctx.moveTo(x, g.iTop); ctx.lineTo(x, g.iTop + g.iH);
  }
  for (let v = Math.ceil(g.vLo / 5) * 5; v <= g.vHi; v += 5) {
    const y = Math.round(g.vOf(v)) + 0.5;
    ctx.moveTo(SCOPE_PAD.l, y); ctx.lineTo(SCOPE_PAD.l + g.plotW, y);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(23, 111, 147, 0.16)';
  ctx.strokeRect(SCOPE_PAD.l + 0.5, g.vTop + 0.5, g.plotW, g.vH);
  ctx.strokeRect(SCOPE_PAD.l + 0.5, g.iTop + 0.5, g.plotW, g.iH);

  // axis labels
  ctx.fillStyle = '#4b6b7c';
  ctx.font = '500 11px Instrument Sans, sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = Math.ceil(g.vLo / 10) * 10; v <= g.vHi; v += 10) ctx.fillText(`${fmt(v, 0)}`, SCOPE_PAD.l - 8, g.vOf(v));
  ctx.fillText('mV', SCOPE_PAD.l - 8, g.vTop + 6);
  ctx.fillText(`${fmt(0, 0)}`, SCOPE_PAD.l - 8, g.iOf(0));
  ctx.fillText('nA', SCOPE_PAD.l - 8, g.iTop + 6);
  const iTick = niceTick(g.iHi * 0.85);
  if (iTick > 0 && g.iOf(iTick) > g.iTop + 16) ctx.fillText(fmt(iTick, iTick < 1 ? 1 : 0), SCOPE_PAD.l - 8, g.iOf(iTick));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const tickEvery = g.plotW < 420 ? 5 : 2;
  for (let k = 0; k <= 10; k += tickEvery) {
    const tt = (k / 10) * state.durationMs;
    ctx.textAlign = k === 10 ? 'right' : 'center';
    ctx.fillText(k === 10 ? `${tt.toFixed(0)} ms` : tt.toFixed(0), SCOPE_PAD.l + (k / 10) * g.plotW, g.iTop + g.iH + 7);
  }

  if (error) {
    ctx.fillStyle = '#c55f43'; ctx.font = '600 14px Instrument Sans, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(error, SCOPE_PAD.l + g.plotW / 2, g.vTop + g.vH / 2);
    ctx.font = '500 12.5px Instrument Sans, sans-serif';
    ctx.fillText('Adjust the membrane settings to continue.', SCOPE_PAD.l + g.plotW / 2, g.vTop + g.vH / 2 + 22);
    return;
  }

  // threshold
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = '#c9963c';
  ctx.beginPath(); ctx.moveTo(SCOPE_PAD.l, g.vOf(state.membrane.thresholdMv)); ctx.lineTo(SCOPE_PAD.l + g.plotW, g.vOf(state.membrane.thresholdMv)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#8a6a2a'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText('θ', SCOPE_PAD.l + 6, g.vOf(state.membrane.thresholdMv) - 2);

  ctx.save();
  ctx.beginPath(); ctx.rect(SCOPE_PAD.l, 0, g.plotW, h); ctx.clip();

  // notebook overlays
  for (const r of runs) {
    if (r.hidden) continue;
    ctx.strokeStyle = r.color; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.4;
    ctx.beginPath(); tracePath(ctx, r.t, r.V, 0, r.t.length, g.xOf, g.vOf); ctx.stroke();
    ctx.beginPath();
    for (const sp of r.spikes ?? []) { ctx.moveTo(g.xOf(sp), g.vOf(state.membrane.thresholdMv)); ctx.lineTo(g.xOf(sp), g.vOf(state.membrane.resetMv)); }
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.beginPath(); tracePath(ctx, r.t, r.I, 0, r.t.length, g.xOf, g.iOf); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const { t, V, I } = run;
  const n = t.length;
  const head = Math.min(n, Math.max(1, Math.floor(simTime / state.membrane.dtMs) + 1));

  // persistence: the whole sweep, dim
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(23, 111, 147, 0.17)';
  ctx.beginPath(); tracePath(ctx, t, V, 0, n, g.xOf, g.vOf); ctx.stroke();
  ctx.strokeStyle = 'rgba(211, 154, 43, 0.25)';
  ctx.beginPath(); tracePath(ctx, t, I, 0, n, g.xOf, g.iOf); ctx.stroke();

  // live sweep up to the playhead, glowing
  ctx.shadowColor = 'rgba(118, 188, 204, 0.55)'; ctx.shadowBlur = 6;
  ctx.strokeStyle = ocean; ctx.lineWidth = 2;
  ctx.beginPath(); tracePath(ctx, t, V, 0, head, g.xOf, g.vOf); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = amber; ctx.lineWidth = 1.6;
  ctx.beginPath(); tracePath(ctx, t, I, 0, head, g.xOf, g.iOf); ctx.stroke();
  ctx.shadowBlur = 0;

  // spikes are events: draw each as a vertical stroke from threshold to reset
  ctx.lineWidth = 2;
  for (const sp of run.spikes) {
    const x = g.xOf(sp);
    ctx.strokeStyle = sp <= simTime ? ocean : 'rgba(23, 111, 147, 0.17)';
    ctx.beginPath(); ctx.moveTo(x, g.vOf(state.membrane.thresholdMv)); ctx.lineTo(x, g.vOf(state.membrane.resetMv)); ctx.stroke();
  }

  // spike marks
  ctx.fillStyle = coral;
  for (const s of run.spikes) {
    const passed = s <= simTime;
    ctx.globalAlpha = passed ? 1 : 0.35;
    const x = g.xOf(s), y = g.vOf(state.membrane.thresholdMv);
    ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x - 4, y - 19); ctx.lineTo(x + 4, y - 19); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // playhead
  const px = g.xOf(simTime);
  ctx.strokeStyle = 'rgba(18, 56, 76, 0.28)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(px, g.vTop); ctx.lineTo(px, g.iTop + g.iH); ctx.stroke();
  const vNow = V[head - 1];
  ctx.fillStyle = '#fff'; ctx.strokeStyle = ocean; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(px, g.vOf(vNow), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // measurement cursors
  cursors.forEach((c, k) => {
    const x = g.xOf(c);
    ctx.strokeStyle = k === 0 ? '#12384c' : '#c55f43'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(x, g.vTop); ctx.lineTo(x, g.iTop + g.iH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = k === 0 ? '#12384c' : '#c55f43'; ctx.font = '700 11px Instrument Sans, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(k === 0 ? 'A' : 'B', x + 4, g.vTop + 4);
  });
  ctx.restore();
}

function niceTick(x) {
  if (x <= 0) return 0;
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}

function voltageAt(time) {
  const i = Math.min(run.t.length - 1, Math.max(0, Math.round(time / state.membrane.dtMs)));
  return run.V[i];
}

scopeCanvas.addEventListener('click', (e) => {
  if (!run || error) return;
  const rect = scopeCanvas.getBoundingClientRect();
  const g = scopeGeometry(rect.width, rect.height);
  const time = g.tOf(e.clientX - rect.left);
  if (time < 0 || time > state.durationMs) return;
  cursors = cursors.length >= 2 ? [time] : [...cursors, time];
  renderCursorReadout();
});
$('clearCursors').addEventListener('click', () => { cursors = []; renderCursorReadout(); });

function renderCursorReadout() {
  const out = $('cursorReadout');
  $('clearCursors').hidden = cursors.length === 0;
  if (!cursors.length) {
    out.textContent = 'Click the trace to place measurement cursors A and B.';
    return;
  }
  const parts = cursors.map((c, k) => `${k ? 'B' : 'A'} <b>${c.toFixed(1)} ms, ${fmt(voltageAt(c), 1)} mV</b>`);
  if (cursors.length === 2) {
    const dt = Math.abs(cursors[1] - cursors[0]);
    const dv = voltageAt(cursors[1]) - voltageAt(cursors[0]);
    parts.push(`Δt <b>${dt.toFixed(1)} ms</b>${dt > 0 ? ` (${(1000 / dt).toFixed(1)} Hz)` : ''}`, `ΔV <b>${fmt(dv, 1)} mV</b>`);
  }
  out.innerHTML = parts.join('&nbsp;&nbsp; ');
}

/* ------------------------------------------------------------------ */
/* Specimen animation                                                  */
/* ------------------------------------------------------------------ */

const NS = 'http://www.w3.org/2000/svg';
const axon = $('axonPath');
const axonLength = axon.getTotalLength();
const pulsePool = Array.from({ length: 16 }, () => {
  const group = document.createElementNS(NS, 'g');
  const halo = document.createElementNS(NS, 'circle');
  halo.setAttribute('r', '21'); halo.setAttribute('fill', 'url(#signal)');
  const center = document.createElementNS(NS, 'circle');
  center.setAttribute('r', '5'); center.setAttribute('fill', '#b4f5ff');
  center.setAttribute('stroke', '#fff'); center.setAttribute('stroke-width', '1.5');
  group.append(halo, center);
  group.style.opacity = '0';
  $('pulses').appendChild(group);
  return group;
});

function paintSpecimen(simTime) {
  const spikes = run && !error ? run.spikes : [];
  const d = state.durationMs;
  const glow = Math.min(28, Math.max(7, d * 0.075));
  const travel = Math.min(35, Math.max(8, d * 0.095));
  let brightness = 0, used = 0;
  for (const s of spikes) {
    const delta = simTime - s;
    if (delta < 0) break;
    if (delta < glow) brightness = Math.max(brightness, (1 - delta / glow) ** 2);
    if (delta < travel && used < pulsePool.length) {
      const frac = delta / travel;
      const pt = axon.getPointAtLength(axonLength * frac);
      const p = pulsePool[used++];
      p.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
      p.style.opacity = String(Math.sin(Math.PI * frac) * 0.96);
    }
  }
  for (let k = used; k < pulsePool.length; k++) pulsePool[k].style.opacity = '0';
  $('aura').setAttribute('opacity', String(0.16 + brightness * 0.78));
  $('flash').setAttribute('opacity', String(brightness * 0.7));
  $('nucleus').setAttribute('fill', brightness > 0.15 ? '#eafdff' : '#64c0d7');
  const lamp = $('firingLamp');
  const firing = brightness > 0.18;
  lamp.classList.toggle('is-firing', firing);
  lamp.textContent = error ? 'Invalid parameters' : spikes.length === 0 ? 'Subthreshold' : firing ? 'Spike' : 'Integrating';
}

/* ------------------------------------------------------------------ */
/* Clock: one simulated time drives the specimen, scope and scrubber    */
/* ------------------------------------------------------------------ */

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let playing = !reducedMotion;
let simTime = reducedMotion ? state.durationMs : 0;
let lastStamp = null;

function loopMs() {
  return Math.max(4000, Math.min(18000, state.durationMs * 40)) / Number($('speed').value);
}
function setPlaying(p) {
  playing = p;
  $('playBtn').textContent = p ? '❚❚' : '▶';
  $('playBtn').setAttribute('aria-label', p ? 'Pause' : 'Play');
}
function restartClock() { simTime = 0; setPlaying(true); }

$('playBtn').addEventListener('click', () => setPlaying(!playing));
$('replayBtn').addEventListener('click', restartClock);
$('scrub').addEventListener('input', (e) => { simTime = Number(e.target.value); setPlaying(false); });

function frame(stamp) {
  if (lastStamp !== null && playing) {
    simTime += (Math.min(stamp - lastStamp, 100) / loopMs()) * state.durationMs;
    if (simTime > state.durationMs) simTime = 0;
  }
  lastStamp = stamp;
  simTime = Math.min(simTime, state.durationMs);
  if (run) {
    drawScope(simTime);
    paintSpecimen(simTime);
  }
  $('scrub').value = String(simTime);
  $('scrub').style.setProperty('--fill', `${(simTime / state.durationMs) * 100}%`);
  $('clock').textContent = `${simTime.toFixed(1)} ms`;
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* Analysis panel                                                      */
/* ------------------------------------------------------------------ */

let analysisTab = 'fi';
let fiCache = { key: '', rows: [] };
let analysisTimer = null;

for (const [id, tab] of [['tab-fi', 'fi'], ['tab-dt', 'dt']]) {
  $(id).addEventListener('click', () => selectAnalysis(tab));
}
function selectAnalysis(tab) {
  analysisTab = tab;
  $('tab-fi').setAttribute('aria-selected', String(tab === 'fi'));
  $('tab-dt').setAttribute('aria-selected', String(tab === 'dt'));
  analysisDirty = true;
  drawAnalysis();
}
function scheduleAnalysis() {
  clearTimeout(analysisTimer);
  analysisTimer = setTimeout(drawAnalysis, 60);
}

function axes(ctx, w, h, pad, xTicks, yTicks, xOf, yOf, xLabel, yLabel, xFmt = String, yFmt = String) {
  ctx.strokeStyle = '#e3edf1'; ctx.lineWidth = 1; ctx.beginPath();
  for (const x of xTicks) { ctx.moveTo(xOf(x), pad.t); ctx.lineTo(xOf(x), h - pad.b); }
  for (const y of yTicks) { ctx.moveTo(pad.l, yOf(y)); ctx.lineTo(w - pad.r, yOf(y)); }
  ctx.stroke();
  ctx.fillStyle = '#4b6b7c'; ctx.font = '500 11.5px Instrument Sans, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const x of xTicks) ctx.fillText(xFmt(x), xOf(x), h - pad.b + 6);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const y of yTicks) ctx.fillText(yFmt(y), pad.l - 7, yOf(y));
  ctx.fillStyle = '#3e6577'; ctx.font = '600 12px Instrument Sans, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(xLabel, pad.l + (w - pad.l - pad.r) / 2, h - 2);
  ctx.save(); ctx.translate(13, pad.t + (h - pad.t - pad.b) / 2); ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = 'middle'; ctx.fillText(yLabel, 0, 0); ctx.restore();
}

function drawAnalysis() {
  if (!analysisDirty) return;
  analysisDirty = false;
  const canvas = $('anaCanvas');
  const { ctx, w, h } = setupCanvas(canvas);
  const pad = { l: 54, r: 16, t: 12, b: 40 };
  const cap = $('anaCaption');
  const m = state.membrane;
  if (error) { cap.textContent = 'Fix the membrane settings to see the analysis.'; return; }

  if (analysisTab === 'fi') {
    const isConst = state.waveform === 'constant';
    const amp = state.stim.constant.amplitude;
    const maxI = isConst && amp > 10 ? 20 : 10;
    const key = JSON.stringify([m, maxI]);
    if (fiCache.key !== key) fiCache = { key, rows: L.fiCurve(m, { maxCurrent: maxI, points: 41, durationMs: 1000 }) };
    const rows = fiCache.rows;
    const fine = Array.from({ length: 400 }, (_, k) => { const c = (maxI * k) / 399; return [c, L.analyticRate(c, m)]; });
    const yMax = Math.max(50, ...fine.map((r) => r[1])) * 1.08;
    const xOf = (x) => pad.l + (x / maxI) * (w - pad.l - pad.r);
    const yOf = (y) => h - pad.b - (y / yMax) * (h - pad.t - pad.b);
    const yStep = yMax > 300 ? 100 : yMax > 120 ? 50 : 20;
    axes(ctx, w, h, pad, Array.from({ length: 6 }, (_, k) => (k * maxI) / 5), Array.from({ length: Math.floor(yMax / yStep) + 1 }, (_, k) => k * yStep), xOf, yOf, 'Input current (nA)', 'Firing rate (Hz)', (x) => x.toFixed(0), (y) => y.toFixed(0));
    // rheobase
    const rh = L.rheobase(m);
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#c9963c';
    ctx.beginPath(); ctx.moveTo(xOf(rh), pad.t); ctx.lineTo(xOf(rh), h - pad.b); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#8a6a2a'; ctx.font = '500 11px Instrument Sans, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('rheobase', xOf(rh) + 4, pad.t + 2);
    // formula line
    ctx.strokeStyle = '#176f93'; ctx.lineWidth = 2;
    ctx.beginPath(); fine.forEach(([x, y], k) => (k ? ctx.lineTo(xOf(x), yOf(y)) : ctx.moveTo(xOf(x), yOf(y)))); ctx.stroke();
    // simulated dots
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#176f93'; ctx.lineWidth = 1.5;
    for (const r of rows) {
      if (r.simulated === null) continue; // a single spike: no interval, rate not measurable
      ctx.beginPath(); ctx.arc(xOf(r.current), yOf(r.simulated), 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    $('anaLegend').innerHTML = '<span class="lg-item"><span class="lg lg-line"></span>exact formula</span><span class="lg-item"><span class="lg lg-dot"></span>simulation</span><span class="lg-item"><span class="lg lg-you"></span>your run</span><span class="lg-item"><span class="lg lg-dash"></span>rheobase</span>';
    const methodNote = m.method === 'euler'
      ? ' Forward Euler bends the dots away from the line; switch to the exact integrator to remove that error.'
      : ' With the exact integrator the dots sit on the line to within rounding error.';
    if (isConst && stats.isiRateHz !== null) {
      ctx.fillStyle = '#f18b6d'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(xOf(Math.min(amp, maxI)), yOf(stats.isiRateHz), 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      cap.innerHTML = `Your run at <b>${amp.toFixed(2)} nA</b>: ISI rate <b>${stats.isiRateHz.toFixed(3)} Hz</b>, formula <b>${L.analyticRate(amp, m).toFixed(3)} Hz</b>.` + methodNote;
    } else if (isConst) {
      const f = L.analyticRate(amp, m);
      cap.innerHTML = f > 0
        ? `Your run at <b>${amp.toFixed(2)} nA</b> has fewer than two spikes, so its rate cannot be measured. The formula predicts <b>${f.toFixed(2)} Hz</b>, a period of <b>${(1000 / f).toFixed(0)} ms</b>: make the recording longer than that.`
        : `Your run at <b>${amp.toFixed(2)} nA</b> is below the rheobase of <b>${rh.toFixed(2)} nA</b>, so the neuron never fires.`;
    } else {
      cap.innerHTML = 'This curve is for constant current. Switch the stimulus to <b>Constant</b> to place your run on it.';
    }
    cap.innerHTML += ` Dots come from 2 s recordings; a current that gives exactly one spike in that time has no measurable rate and is left out.`;
    canvas.setAttribute('aria-label', 'f–I curve: firing rate against input current, simulated points over the exact formula.');
  } else {
    const amp = state.stim.constant.amplitude;
    const current = state.waveform === 'constant' && amp > L.rheobase(m) + 0.05 ? amp : Math.max(2.5, L.rheobase(m) + 1);
    const res = L.dtConvergence(current, m);
    if (!res.rows.length) { cap.textContent = 'No spike at this current, so there is no spike time to measure.'; return; }
    const floor = 1e-15;
    const xs = res.rows.map((r) => Math.log10(r.dt));
    const ye = res.rows.map((r) => Math.log10(Math.max(r.euler ?? floor, floor)));
    const yx = res.rows.map((r) => Math.log10(Math.max(r.exact ?? floor, floor)));
    const xLo = -2.2, xHi = 0.2;
    const yLo = Math.floor(Math.min(...ye, ...yx)) - 0.3, yHi = Math.ceil(Math.max(...ye)) + 0.3;
    const xOf = (x) => pad.l + ((x - xLo) / (xHi - xLo)) * (w - pad.l - pad.r);
    const yOf = (y) => h - pad.b - ((y - yLo) / (yHi - yLo)) * (h - pad.t - pad.b);
    const yTicks = []; const every = yHi - yLo > 8 ? 3 : 1;
    for (let y = Math.ceil(yLo); y <= yHi; y++) if (y % every === 0) yTicks.push(y);
    axes(ctx, w, h, pad, [-2, -1, 0], yTicks, xOf, yOf, 'Time step dt (ms, log scale)', 'Spike time error (ms)', (x) => String(10 ** x), (y) => (y >= 0 ? String(10 ** y) : `1e${y}`));
    // reference slope 1 through the middle Euler point
    const mid = Math.floor(xs.length / 2);
    ctx.setLineDash([5, 5]); ctx.strokeStyle = '#c9963c'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(xOf(xLo), yOf(ye[mid] + (xLo - xs[mid]))); ctx.lineTo(xOf(xHi), yOf(ye[mid] + (xHi - xs[mid]))); ctx.stroke(); ctx.setLineDash([]);
    // Euler
    ctx.strokeStyle = '#176f93'; ctx.lineWidth = 1.6;
    ctx.beginPath(); xs.forEach((x, k) => (k ? ctx.lineTo(xOf(x), yOf(ye[k])) : ctx.moveTo(xOf(x), yOf(ye[k])))); ctx.stroke();
    // exact
    ctx.strokeStyle = '#4b6b7c'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 3]);
    ctx.beginPath(); xs.forEach((x, k) => (k ? ctx.lineTo(xOf(x), yOf(yx[k])) : ctx.moveTo(xOf(x), yOf(yx[k])))); ctx.stroke(); ctx.setLineDash([]);
    res.rows.forEach((r, k) => {
      const mine = Math.abs(r.dt - m.dtMs) < 1e-9;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#4b6b7c'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(xOf(xs[k]) - 3.5, yOf(yx[k]) - 3.5, 7, 7); ctx.fill(); ctx.stroke();
      const hl = mine && m.method === 'euler';
      ctx.fillStyle = hl ? '#f18b6d' : '#fff'; ctx.strokeStyle = hl ? '#fff' : '#176f93'; ctx.lineWidth = hl ? 2 : 1.5;
      ctx.beginPath(); ctx.arc(xOf(xs[k]), yOf(ye[k]), hl ? 6.5 : 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (mine && m.method === 'exact') {
        ctx.fillStyle = '#f18b6d'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.rect(xOf(xs[k]) - 6, yOf(yx[k]) - 6, 12, 12); ctx.fill(); ctx.stroke();
      }
    });
    $('anaLegend').innerHTML = '<span class="lg-item"><span class="lg lg-line"></span>forward Euler</span><span class="lg-item"><span class="lg lg-sq"></span>exact integrator</span><span class="lg-item"><span class="lg lg-you"></span>your settings</span><span class="lg-item"><span class="lg lg-dash"></span>slope 1 (first order)</span>';
    const mine = res.rows.find((r) => Math.abs(r.dt - m.dtMs) < 1e-9);
    const maxExact = Math.max(...res.rows.map((r) => r.exact ?? 0));
    cap.innerHTML = `First spike at <b>${current.toFixed(2)} nA</b>, exact time <b>${res.exact.toFixed(6)} ms</b>. Forward Euler: fitted slope <b>${res.slope.toFixed(3)}</b>, so the error is proportional to dt. Exact integrator: largest error <b>${maxExact.toExponential(1)} ms</b>, which is floating-point rounding.` +
      (mine ? ` At your dt of ${m.dtMs} ms, Euler is off by <b>${mine.euler.toFixed(4)} ms</b>.` : '');
    canvas.setAttribute('aria-label', 'Log–log plot of first-spike time error against time step.');
  }
}

/* ------------------------------------------------------------------ */
/* Lab notebook: a workspace of recorded, restorable runs              */
/* ------------------------------------------------------------------ */

const RUN_COLORS = ['#e07a5f', '#8a63d2', '#3f9e5a', '#c9971b', '#2f80ed', '#d6457f', '#16a3a3', '#6b7a86'];
const MAX_RUNS = 8;
const STORE_STEP_MS = 0.2;
const NOTEBOOK_KEY = 'neural-tidepool.notebook.v2';

function inflateRun(r) {
  return { ...r, t: Float64Array.from(r.t), V: Float64Array.from(r.V), I: Float64Array.from(r.I), spikes: r.spikes ?? r.experiment?.results?.spikeTimesMs ?? [] };
}
function serialiseRun(r) {
  return { ...r, t: Array.from(r.t), V: Array.from(r.V), I: Array.from(r.I) };
}
let runs = (store.get(NOTEBOOK_KEY, []) || []).map(inflateRun);

function describeSetup() {
  const p = state.stim[state.waveform];
  const w = L.WAVEFORMS[state.waveform].label;
  const describe = {
    constant: () => `${w} ${p.amplitude.toFixed(2)} nA`,
    step: () => `${w} to ${p.amplitude.toFixed(2)} nA at ${p.start} ms`,
    pulse: () => `${w} ${p.amplitude.toFixed(2)} nA for ${p.width} ms`,
    twoPulses: () => `${w} ${p.amplitude.toFixed(2)} nA, gap ${p.gap} ms`,
    sine: () => `${w} ${p.offset.toFixed(1)} ± ${p.amplitude.toFixed(1)} nA at ${p.frequency} Hz`,
    noisy: () => `${w} ${p.mean.toFixed(2)} nA, noise ${p.sigma.toFixed(2)}, seed ${p.seed}`,
  };
  const s = describe[state.waveform]();
  const m = state.membrane;
  const numerics = m.method === 'euler' || m.dtMs !== 0.1 ? `; ${m.method === 'euler' ? 'Euler' : 'exact'}, dt ${m.dtMs} ms` : '';
  return `${s}; τ ${m.tauMs} ms, θ ${fmt(m.thresholdMv, 0)} mV${numerics}`;
}

/** Keeps every k-th sample (exact values) so stored runs stay small. */
function subsample(r) {
  const k = Math.max(1, Math.round(STORE_STEP_MS / r.membrane.dtMs));
  const t = [], V = [], I = [];
  for (let i = 0; i < r.t.length; i += k) { t.push(r.t[i]); V.push(r.V[i]); I.push(r.I[i]); }
  return { t: Float64Array.from(t), V: Float64Array.from(V), I: Float64Array.from(I) };
}

function persistRuns() {
  store.set(NOTEBOOK_KEY, runs.map(serialiseRun));
}

function setStatus(text, kind = '') {
  const el = $('nbStatus');
  el.textContent = text;
  el.className = 'nb-status' + (kind ? ` is-${kind}` : '');
}

function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function nextRunNumber() {
  const number = (store.get('neural-tidepool.runCounter', 0) || 0) + 1;
  store.set('neural-tidepool.runCounter', number);
  return Math.max(number, ...runs.map((r) => r.number + 1));
}

function addRun(fields) {
  const used = new Set(runs.map((r) => r.color));
  const color = RUN_COLORS.find((c) => !used.has(c)) ?? RUN_COLORS[0];
  runs.push({ id: Date.now() + Math.random(), color, hidden: false, note: '', ...fields });
}

$('recordBtn').addEventListener('click', () => {
  if (!run || error || runs.length >= MAX_RUNS) return;
  const number = nextRunNumber();
  const experiment = X.toExperimentFile(currentSetup(), run, stats, { label: `Run ${number}` });
  addRun({
    number,
    summary: describeSetup(),
    result: `${stats.count} spike${stats.count === 1 ? '' : 's'}, ${stats.rateHz.toFixed(1)} Hz${stats.cv !== null ? `, CV ${stats.cv.toFixed(2)}` : ''}`,
    durationMs: state.durationMs,
    spikes: run.spikes.slice(),
    experiment,
    ...subsample(run),
  });
  persistRuns();
  renderRuns();
  setStatus(`Run ${number} recorded.`);
});

function restoreRun(r) {
  setBench(r.experiment.setup);
  const check = X.verifyExperiment(r.experiment);
  if (check.reproduced) {
    const diff = check.maxDiff === 0 ? 'identical to the last digit' : `largest difference ${check.maxDiff.toExponential(1)} ms`;
    setStatus(`Run ${r.number} restored. The re-run reproduces all ${check.count} spike times (${diff}).`, 'ok');
  } else if (!check.sameEngine) {
    setStatus(`Run ${r.number} restored. It was recorded with engine ${r.experiment.engineVersion}; this lab runs ${L.ENGINE_VERSION}, so results can differ (${check.recordedCount} recorded spikes, ${check.count} now).`, 'warn');
  } else {
    setStatus(`Run ${r.number} restored, but the re-run differs from the record (${check.recordedCount} recorded spikes, ${check.count} now).`, 'warn');
  }
}

function renderRuns() {
  const list = $('runs');
  list.innerHTML = '';
  for (const r of runs) {
    const li = document.createElement('li');
    li.className = 'run' + (r.hidden ? ' is-hidden' : '');
    li.innerHTML = `
      <button class="swatch" type="button" style="background:${r.color}" aria-pressed="${!r.hidden}" title="${r.hidden ? 'Show' : 'Hide'} on oscilloscope" aria-label="${r.hidden ? 'Show' : 'Hide'} run ${r.number} on the oscilloscope"></button>
      <div><div class="run-title">Run ${r.number}: ${r.result}</div><div class="run-meta">${r.summary}</div></div>
      <button class="run-del" type="button" aria-label="Delete run ${r.number}">×</button>
      <input class="run-note" type="text" placeholder="Note" aria-label="Note for run ${r.number}">
      <div class="run-actions">
        <button type="button" class="text-btn act-restore"${r.experiment ? '' : ' disabled title="Recorded by an older version without a full setup"'}>Restore</button>
        <button type="button" class="text-btn act-save"${r.experiment ? '' : ' disabled'}>Save experiment file</button>
      </div>`;
    li.querySelector('.run-note').value = r.note;
    li.querySelector('.swatch').addEventListener('click', () => { r.hidden = !r.hidden; persistRuns(); renderRuns(); });
    li.querySelector('.run-del').addEventListener('click', () => { runs = runs.filter((x) => x !== r); persistRuns(); renderRuns(); setStatus(`Run ${r.number} deleted.`); });
    li.querySelector('.run-note').addEventListener('input', (e) => { r.note = e.target.value; persistRuns(); });
    li.querySelector('.act-restore').addEventListener('click', () => restoreRun(r));
    li.querySelector('.act-save').addEventListener('click', () => {
      const file = { ...r.experiment, notes: r.note };
      download(`neural-tidepool-run-${r.number}.json`, JSON.stringify(file, null, 2));
      setStatus(`Saved run ${r.number} as an experiment file. Re-run it with: python reproduce.py neural-tidepool-run-${r.number}.json`);
    });
    list.appendChild(li);
  }
  $('runsEmpty').hidden = runs.length > 0;
  $('exportCsv').disabled = runs.length === 0;
  $('saveNotebook').disabled = runs.length === 0;
  const full = runs.length >= MAX_RUNS;
  $('recordBtn').disabled = full;
  $('recordBtn').lastChild.textContent = full ? `Notebook full (${MAX_RUNS} runs). Delete a run to record more` : 'Record run';
}

$('exportCsv').addEventListener('click', () => {
  download('neural-tidepool-notebook.csv', X.notebookCsv(runs), 'text/csv');
  setStatus('Exported all runs as CSV. The header holds a complete experiment record for every run.');
});

$('saveNotebook').addEventListener('click', () => {
  const file = {
    format: X.NOTEBOOK_FORMAT,
    schemaVersion: X.SCHEMA_VERSION,
    engineVersion: L.ENGINE_VERSION,
    createdAt: new Date().toISOString(),
    runs: runs.map(serialiseRun),
  };
  download('neural-tidepool-notebook.json', JSON.stringify(file));
  setStatus(`Saved the notebook with ${runs.length} run${runs.length === 1 ? '' : 's'}. Open it here later to continue.`);
});

$('openFileBtn').addEventListener('click', () => $('openFile').click());
$('openFile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  let obj;
  try {
    obj = JSON.parse(await file.text());
  } catch {
    setStatus(`${file.name} is not valid JSON.`, 'warn');
    return;
  }
  try {
    if (obj?.format === X.NOTEBOOK_FORMAT) {
      const incoming = (obj.runs ?? []).filter((r) => r && r.t && r.V && r.I);
      const room = MAX_RUNS - runs.length;
      for (const r of incoming.slice(0, room)) {
        const { color, id, number, ...rest } = inflateRun(r);
        const fresh = nextRunNumber();
        addRun({ ...rest, number: fresh, summary: `${rest.summary} (run ${number} in ${file.name})` });
      }
      persistRuns();
      renderRuns();
      const skipped = incoming.length - Math.min(room, incoming.length);
      setStatus(`Opened ${file.name}: added ${Math.min(room, incoming.length)} run(s)` + (skipped ? `; ${skipped} skipped because the notebook holds ${MAX_RUNS}.` : '.'), skipped ? 'warn' : 'ok');
    } else {
      X.parseExperimentFile(obj);
      restoreRun({ number: obj.label || file.name, experiment: obj });
      $('nbStatus').textContent = $('nbStatus').textContent.replace(/^Run (.*?) restored/, `Loaded ${file.name}`);
    }
  } catch (err) {
    setStatus(`Could not open ${file.name}: ${err.message}`, 'warn');
  }
});

/* ------------------------------------------------------------------ */
/* Protocols                                                           */
/* ------------------------------------------------------------------ */

let openProtocol = null;
const predictions = store.get('neuroverse.predictions.v1', {}) || {};
const completed = new Set(store.get('neuroverse.completed.v1', []) || []);

function renderProtocolList() {
  const list = $('protocolList');
  list.innerHTML = '';
  PROTOCOLS.forEach((p, k) => {
    const li = document.createElement('li');
    if (completed.has(p.id)) li.className = 'done';
    li.innerHTML = `<button type="button" aria-expanded="${openProtocol === p.id}" aria-controls="protocolCard">
      <span class="p-no">${completed.has(p.id) ? '✓' : k + 1}</span><span class="p-title">${p.title}</span><span class="p-q">${p.question}</span></button>`;
    li.querySelector('button').addEventListener('click', () => openProtocolCard(openProtocol === p.id ? null : p.id));
    list.appendChild(li);
  });
}

function applySetup(p) {
  setBench({ waveform: p.setup.waveform, stimulus: p.setup.stim, membrane: p.setup.membrane ?? {}, durationMs: p.setup.durationMs });
  if (p.analysis) selectAnalysis(p.analysis);
}

function openProtocolCard(id) {
  openProtocol = id;
  renderProtocolList();
  const card = $('protocolCard');
  if (!id) { card.hidden = true; return; }
  const p = PROTOCOLS.find((x) => x.id === id);
  applySetup(p);
  card.hidden = false;
  card.innerHTML = `
    <h3>${p.title}</h3>
    <p class="goal">${p.goal}</p>
    <h4>Predict first</h4>
    <label for="prediction" class="sr-only">${p.prediction}</label>
    <textarea id="prediction" placeholder="${p.prediction}"></textarea>
    <h4>Procedure</h4>
    <ol>${p.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
    <div class="card-actions">
      <button type="button" class="btn" id="showExplain" aria-expanded="false">Show explanation</button>
      <button type="button" class="btn ghost" id="resetSetup">Reset this setup</button>
    </div>
    <div class="explain" id="explain" hidden>${p.explain}${p.reading ? `
      <p class="reading">Further reading in <i>Neuronal Dynamics</i>: ${p.reading.map((r) => `<a href="${r.url}" target="_blank" rel="noopener">${r.label}</a>`).join(', ')}</p>` : ''}</div>`;
  const ta = card.querySelector('#prediction');
  ta.value = predictions[id] ?? '';
  ta.addEventListener('input', () => { predictions[id] = ta.value; store.set('neuroverse.predictions.v1', predictions); });
  card.querySelector('#resetSetup').addEventListener('click', () => applySetup(p));
  card.querySelector('#showExplain').addEventListener('click', (e) => {
    const ex = card.querySelector('#explain');
    ex.hidden = !ex.hidden;
    e.target.textContent = ex.hidden ? 'Show explanation' : 'Hide explanation';
    e.target.setAttribute('aria-expanded', String(!ex.hidden));
    if (!ex.hidden && !completed.has(id)) {
      completed.add(id);
      store.set('neuroverse.completed.v1', [...completed]);
      renderProtocolList();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

function setGuided(on) {
  document.body.classList.toggle('guided', on);
  $('guidedBtn').setAttribute('aria-pressed', String(on));
  store.set('neural-tidepool.guided', on);
}
$('guidedBtn').addEventListener('click', () => {
  const on = !document.body.classList.contains('guided');
  setGuided(on);
  if (on) setIntroOpen(true);
});
setGuided(Boolean(store.get('neural-tidepool.guided', false)));

function setIntroOpen(open) {
  $('introChain').hidden = !open;
  $('introToggle').setAttribute('aria-expanded', String(open));
  $('introToggle').textContent = open ? 'Hide details' : 'How this lab works';
  store.set('neural-tidepool.introOpen', open);
}
$('introToggle').addEventListener('click', () => setIntroOpen($('introChain').hidden));
setIntroOpen(Boolean(store.get('neural-tidepool.introOpen', false)));

buildAll();
renderProtocolList();
renderRuns();
setPlaying(playing);
update();
drawAnalysis();
new ResizeObserver(() => { analysisDirty = true; drawAnalysis(); }).observe(document.body);
requestAnimationFrame(frame);
