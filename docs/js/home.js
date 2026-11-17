// Fig. 1 on the home page: a live leaky integrate-and-fire trace, drawn like a notebook figure.
import * as L from './lif.js';

const canvas = document.getElementById('figCanvas');
const slider = document.getElementById('figCurrent');
const out = document.getElementById('figCurrentOut');
const rateEl = document.getElementById('figRate');
const DURATION = 200;
const m = L.DEFAULT_MEMBRANE;

function draw() {
  const current = Number(slider.value);
  out.textContent = `${current.toFixed(2)} nA`;
  const run = L.simulate({ current, durationMs: DURATION });
  const longRun = L.simulate({ current, durationMs: 1000 });
  const stats = L.spikeStats(longRun.spikes, 1000);
  rateEl.textContent = `rate ${(stats.isiRateHz ?? 0).toFixed(0)} Hz`;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const top = -30, bottom = -74; // spikes are drawn as strokes up to the top of the figure
  const x = (t) => 4 + (t / DURATION) * (w - 8);
  const y = (v) => 6 + ((top - v) / (top - bottom)) * (h - 12);

  // threshold, in red pen
  ctx.strokeStyle = '#b8392b'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(0, y(m.thresholdMv)); ctx.lineTo(w, y(m.thresholdMv)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#b8392b'; ctx.font = '500 19px Caveat, cursive'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText('threshold θ = −50 mV', w - 6, y(m.thresholdMv) - 3);

  // membrane potential in ink, spikes as tall strokes
  ctx.strokeStyle = '#1e2a44'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x(0), y(run.V[0]));
  let k = 0;
  for (let i = 1; i < run.t.length; i++) {
    while (k < run.spikes.length && run.spikes[k] <= run.t[i]) {
      const s = run.spikes[k++];
      ctx.lineTo(x(s), y(m.thresholdMv));
      ctx.lineTo(x(s), y(top + 2));
      ctx.lineTo(x(s), y(m.resetMv));
    }
    ctx.lineTo(x(run.t[i]), y(run.V[i]));
  }
  ctx.stroke();
}

slider.addEventListener('input', draw);
new ResizeObserver(draw).observe(canvas);
draw();
