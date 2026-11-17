/**
 * Neural Tidepool LIF engine (JavaScript edition).
 *
 * This mirrors neuron.py step for step, so the browser lab and the Python
 * reference engine produce the same voltage traces. tests/test_parity.py
 * checks that they agree.
 *
 * Units: time = ms, voltage = mV, resistance = MΩ, current = nA.
 * R (MΩ) × I (nA) gives a voltage in mV.
 */

export const DEFAULT_MEMBRANE = Object.freeze({
  tauMs: 20,
  thresholdMv: -50,
  restingMv: -65,
  resetMv: -70,
  resistanceMohm: 10,
  refractoryMs: 3,
  dtMs: 0.1,
  method: 'exact',
});

/** Time samples 0, dt, 2dt, ... up to duration (same as np.arange in neuron.py). */
export function timeAxis(durationMs, dtMs) {
  const n = Math.ceil((durationMs + dtMs * 0.5) / dtMs);
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = i * dtMs;
  return t;
}

/* ------------------------------------------------------------------ */
/* Stimulus waveforms                                                  */
/* ------------------------------------------------------------------ */

/** Small seeded random generator so a noisy experiment can be repeated exactly. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  let u = 0;
  while (u === 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const WAVEFORMS = {
  constant: {
    label: 'Constant',
    defaults: { amplitude: 2.5 },
  },
  step: {
    label: 'Step',
    defaults: { amplitude: 2.5, start: 50 },
  },
  pulse: {
    label: 'Pulse',
    defaults: { amplitude: 3, start: 40, width: 60 },
  },
  twoPulses: {
    label: 'Two pulses',
    defaults: { amplitude: 5, start: 40, width: 5, gap: 10 },
  },
  sine: {
    label: 'Sine',
    defaults: { offset: 1.5, amplitude: 1.0, frequency: 10 },
  },
  noisy: {
    label: 'Noisy',
    defaults: { mean: 1.3, sigma: 0.6, seed: 7 },
  },
};

/**
 * Build the injected current I(t) for every time sample.
 * Noise is an Ornstein–Uhlenbeck process (correlation time 5 ms) sampled exactly,
 * so its statistics do not depend on the simulation time step.
 */
export function makeStimulus(type, params, t) {
  const p = { ...WAVEFORMS[type].defaults, ...params };
  const n = t.length;
  const I = new Float64Array(n);
  switch (type) {
    case 'constant':
      I.fill(p.amplitude);
      break;
    case 'step':
      for (let i = 0; i < n; i++) I[i] = t[i] >= p.start ? p.amplitude : 0;
      break;
    case 'pulse':
      for (let i = 0; i < n; i++) I[i] = t[i] >= p.start && t[i] < p.start + p.width ? p.amplitude : 0;
      break;
    case 'twoPulses': {
      const s2 = p.start + p.gap;
      for (let i = 0; i < n; i++) {
        const on1 = t[i] >= p.start && t[i] < p.start + p.width;
        const on2 = t[i] >= s2 && t[i] < s2 + p.width;
        I[i] = on1 || on2 ? p.amplitude : 0;
      }
      break;
    }
    case 'sine':
      for (let i = 0; i < n; i++) I[i] = p.offset + p.amplitude * Math.sin((2 * Math.PI * p.frequency * t[i]) / 1000);
      break;
    case 'noisy': {
      // Exact discretisation of an Ornstein–Uhlenbeck process (unit variance,
      // 5 ms correlation time), started from its stationary distribution.
      const rand = mulberry32(p.seed);
      const tauNoise = 5;
      let eta = gaussian(rand);
      I[0] = p.mean + p.sigma * eta;
      for (let i = 1; i < n; i++) {
        const a = Math.exp(-(t[i] - t[i - 1]) / tauNoise);
        eta = a * eta + Math.sqrt(1 - a * a) * gaussian(rand);
        I[i] = p.mean + p.sigma * eta;
      }
      break;
    }
    default:
      throw new Error(`Unknown waveform: ${type}`);
  }
  return I;
}

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */

export const ENGINE_VERSION = '0.3.1';
export const METHODS = { exact: 'Exact (exponential)', euler: 'Forward Euler' };
const EPS = 1e-12;

function validate(m, durationMs) {
  if (!(durationMs > 0) || !(m.dtMs > 0) || !(m.tauMs > 0)) {
    throw new Error('Duration, time step, and membrane time constant must be positive.');
  }
  if (m.refractoryMs < 0 || !(m.resistanceMohm > 0)) {
    throw new Error('Refractory period must be non-negative and resistance positive.');
  }
  if (m.thresholdMv <= Math.max(m.restingMv, m.resetMv)) {
    throw new Error('Threshold must exceed resting and reset voltages.');
  }
  if (m.dtMs >= m.tauMs) throw new Error('Time step must be smaller than membrane time constant.');
  if (!METHODS[m.method]) throw new Error(`Unknown integration method: ${m.method}`);
}

/**
 * Event-driven LIF simulation on a fixed output grid.
 *
 * The input current is held constant over each step (zero-order hold): step i
 * uses current[i - 1]. Within a step the membrane follows
 *   τ dV/dt = V_rest − V + R I.
 *
 * method "exact": the closed-form solution V∞ + (V − V∞) e^{−Δt/τ}, with V∞ = V_rest + R I,
 *   and the exact threshold-crossing time τ ln[(V − V∞) / (θ − V∞)].
 * method "euler": forward Euler, with the crossing time found by linear interpolation.
 *
 * A spike at time t* resets V to V_reset and clamps it there until t* + t_ref.
 * Integration then resumes from that exact moment, even in the middle of a step,
 * so spike times and the refractory period are not rounded to the grid.
 *
 * V holds the true membrane state at each sample time. Spikes are events in `spikes`.
 * neuron.py implements the same algorithm; tests/test_parity.py checks they agree.
 */
export function simulate({ current, durationMs, membrane = {} }) {
  const m = { ...DEFAULT_MEMBRANE, ...membrane };
  validate(m, durationMs);
  const t = timeAxis(durationMs, m.dtMs);
  const n = t.length;
  let I;
  if (typeof current === 'number') {
    I = new Float64Array(n).fill(current);
  } else {
    if (current.length !== n) throw new Error(`Current trace needs ${n} samples, got ${current.length}.`);
    I = current;
  }

  const V = new Float64Array(n);
  V[0] = m.restingMv;
  const spikes = [];
  let v = m.restingMv;
  let refLeft = 0;

  for (let i = 1; i < n; i++) {
    const vInf = m.restingMv + m.resistanceMohm * I[i - 1];
    let tStart = t[i - 1];
    let left = t[i] - t[i - 1];
    while (left > EPS) {
      if (refLeft > 0) {
        if (refLeft >= left - EPS) {
          refLeft = Math.max(0, refLeft - left);
          v = m.resetMv;
          left = 0;
          break;
        }
        tStart += refLeft;
        left -= refLeft;
        refLeft = 0;
        v = m.resetMv;
      }
      let vNew;
      let crossing = null;
      if (m.method === 'exact') {
        vNew = vInf + (v - vInf) * Math.exp(-left / m.tauMs);
        if (vNew >= m.thresholdMv && vInf > m.thresholdMv) {
          crossing = tStart + m.tauMs * Math.log((v - vInf) / (m.thresholdMv - vInf));
        }
      } else {
        vNew = v + (left / m.tauMs) * (vInf - v);
        if (vNew >= m.thresholdMv) {
          crossing = tStart + (left * (m.thresholdMv - v)) / (vNew - v);
        }
      }
      if (crossing === null) {
        v = vNew;
        break;
      }
      crossing = Math.min(Math.max(crossing, tStart), tStart + left);
      spikes.push(crossing);
      v = m.resetMv;
      refLeft = m.refractoryMs;
      left -= crossing - tStart;
      tStart = crossing;
    }
    V[i] = v;
  }
  return { t, V, I, spikes, membrane: m, durationMs };
}

/* ------------------------------------------------------------------ */
/* Measurements and theory                                             */
/* ------------------------------------------------------------------ */

export function spikeStats(spikes, durationMs) {
  const count = spikes.length;
  const isis = [];
  for (let i = 1; i < count; i++) isis.push(spikes[i] - spikes[i - 1]);
  const meanIsi = isis.length ? isis.reduce((a, b) => a + b, 0) / isis.length : null;
  let cv = null;
  if (isis.length > 1) {
    const varIsi = isis.reduce((a, b) => a + (b - meanIsi) ** 2, 0) / (isis.length - 1);
    cv = Math.sqrt(varIsi) / meanIsi;
  }
  return {
    count,
    intervals: isis.length,
    rateHz: count / (durationMs / 1000),          // mean rate: spike count / recording time
    isiRateHz: meanIsi ? 1000 / meanIsi : null,  // 1 / mean ISI, needs at least 2 spikes
    meanIsi,
    cv,                                           // needs at least 2 intervals (3 spikes)
    latency: count ? spikes[0] : null,
  };
}

/** Smallest constant current that ever reaches threshold: (θ − V_rest) / R. */
export function rheobase(membrane = {}) {
  const m = { ...DEFAULT_MEMBRANE, ...membrane };
  return (m.thresholdMv - m.restingMv) / m.resistanceMohm;
}

/**
 * Steady-state firing rate for constant input, from the exact solution
 *   T = t_ref + τ ln[(RI + V_rest − V_reset) / (RI + V_rest − θ)].
 */
export function analyticRate(currentNa, membrane = {}) {
  const m = { ...DEFAULT_MEMBRANE, ...membrane };
  const drive = m.resistanceMohm * currentNa + m.restingMv;
  if (drive <= m.thresholdMv) return 0;
  const period = m.refractoryMs + m.tauMs * Math.log((drive - m.resetMv) / (drive - m.thresholdMv));
  return 1000 / period;
}

/** Exact time of the first spike, starting from rest with constant input. */
export function analyticFirstSpike(currentNa, membrane = {}) {
  const m = { ...DEFAULT_MEMBRANE, ...membrane };
  const ri = m.resistanceMohm * currentNa;
  const gap = m.thresholdMv - m.restingMv;
  if (ri <= gap) return null;
  return m.tauMs * Math.log(ri / (ri - gap));
}

/**
 * f–I curve: steady-state rate (1 / mean ISI) next to the analytic rate.
 * No spikes means a measured rate of 0. A single spike gives no interval, so the
 * rate cannot be measured: `simulated` is null there (this happens just above the
 * rheobase, where the period can be longer than the recording).
 */
export function fiCurve(membrane = {}, { maxCurrent = 5, points = 51, durationMs = 2000 } = {}) {
  const rows = [];
  for (let k = 0; k < points; k++) {
    const current = (maxCurrent * k) / (points - 1);
    const run = simulate({ current, durationMs, membrane });
    const s = spikeStats(run.spikes, durationMs);
    rows.push({ current, simulated: s.count === 0 ? 0 : s.isiRateHz, spikes: s.count, analytic: analyticRate(current, membrane) });
  }
  return rows;
}

/**
 * How the first-spike time error depends on dt, for both integration methods.
 * Forward Euler is first order (error ∝ dt); the exact method is limited only by rounding.
 */
export function dtConvergence(currentNa, membrane = {}, dts = [1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01]) {
  const exact = analyticFirstSpike(currentNa, membrane);
  if (exact === null) return { exact: null, rows: [], slope: null };
  const tau = membrane.tauMs ?? DEFAULT_MEMBRANE.tauMs;
  const rows = [];
  for (const dtMs of dts) {
    if (dtMs >= tau) continue;
    const row = { dt: dtMs };
    for (const method of ['euler', 'exact']) {
      const run = simulate({ current: currentNa, durationMs: exact * 2 + 10, membrane: { ...membrane, dtMs, method } });
      row[method] = run.spikes.length ? Math.abs(run.spikes[0] - exact) : null;
    }
    rows.push(row);
  }
  // Least-squares slope of log(error) against log(dt) for Euler.
  const pts = rows.filter((r) => r.euler > 0).map((r) => [Math.log10(r.dt), Math.log10(r.euler)]);
  let slope = null;
  if (pts.length > 1) {
    const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const num = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
    const den = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
    slope = num / den;
  }
  return { exact, rows, slope };
}
