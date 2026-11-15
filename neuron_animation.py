"""A lightweight, event-driven neuron animation for NeuroVerse Ocean Lab.

The visual flash times come from the LIF model's recorded spike events.
Axon light travel is illustrative, not a biophysical conduction model.
"""

import json
import math
from collections.abc import Iterable


def make_neuron_animation(
    spike_times_ms: Iterable[float], duration_ms: float, playback_speed: float = 1.0
) -> str:
    """Return trusted, self-contained HTML with a glowing SVG neuron.

    The input is numerical simulation output only, never untrusted HTML.
    """
    duration = float(duration_ms)
    speed = float(playback_speed)
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("Duration must be positive and finite")
    if not math.isfinite(speed) or speed <= 0:
        raise ValueError("Playback speed must be positive and finite")
    spikes = [float(s) for s in spike_times_ms]
    if not all(math.isfinite(s) and 0 <= s <= duration for s in spikes):
        raise ValueError("Spikes must lie within the simulated time window")

    # Embedding only validated numbers prevents arbitrary HTML/JS injection.
    spikes_json = json.dumps(spikes)
    duration_json = json.dumps(duration)
    speed_json = json.dumps(speed)
    return f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * {{box-sizing:border-box}}
  html,body {{margin:0;padding:0;background:transparent;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#21445a}}
  .stage {{border:1px solid #d8eaf1;border-radius:20px;overflow:hidden;background:linear-gradient(130deg,#fafdff 3%,#f0f9fc 43%,#eaf7fc 100%);box-shadow:0 8px 24px rgba(36,104,133,.06)}}
  .header {{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:18px 22px 0}}
  .eyebrow {{font-size:11px;letter-spacing:2px;font-weight:800;color:#5b93aa}}
  .heading {{font-size:19px;letter-spacing:-.4px;font-weight:750;color:#155573;margin:5px 0 0}}
  .chip {{border:1px solid #c9e6f0;border-radius:99px;padding:8px 12px;font-size:11px;font-weight:750;background:#fff;color:#167399;white-space:nowrap}}
  .chip span {{display:inline-block;border-radius:50%;height:7px;width:7px;background:#46b4ce;margin-right:7px;box-shadow:0 0 8px #50c4da}}
  svg {{width:100%;height:auto;display:block;max-height:274px}}
  .nbranch {{fill:none;stroke:#8dbbcc;stroke-width:3.3;stroke-linecap:round;stroke-linejoin:round;opacity:.9}}
  .fine {{stroke-width:2.3;opacity:.65}}
  .nerve {{fill:none;stroke:#439cba;stroke-width:7;stroke-linecap:round}}
  .myelin {{fill:none;stroke:#b8e4ee;stroke-width:8;stroke-linecap:round;opacity:.83}}
  .core {{fill:url(#somaFill);stroke:#2995b6;stroke-width:2.2;filter:drop-shadow(0 2px 8px rgba(72,161,197,.27))}}
  .spark {{fill:#4cbde3;opacity:.5}}
  .footer {{display:flex;align-items:center;gap:10px;justify-content:space-between;flex-wrap:wrap;padding:0 20px 17px}}
  .status {{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:700;color:#317d99}}
  .status-dot {{width:8px;height:8px;border-radius:50%;background:#55bacb;box-shadow:0 0 8px #56c3d0}}
  .track {{flex:1;min-width:90px;height:6px;background:#d5e9f0;border-radius:10px;overflow:hidden}}
  .fill {{height:100%;width:0%;background:linear-gradient(90deg,#6bc7d7,#2687aa);border-radius:10px}}
  .time {{font-size:12px;min-width:65px;text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:#2e7393}}
  .actions {{display:flex;gap:6px}}
  button {{font:inherit;cursor:pointer;color:#176987;background:white;border:1px solid #cbe4ed;border-radius:10px;font-size:11px;font-weight:700;padding:8px 12px;transition:background .12s}}
  button:hover {{background:#e4f4f9}}
  button:focus-visible {{outline:2px solid #147fa1;outline-offset:2px}}
  .footnote {{padding:0 20px 14px;color:#7594a3;font-size:10px}}
  @media(max-width:520px) {{.header{{padding:15px 14px 0}} .footer{{padding:0 14px 13px}} .footnote{{padding:0 14px 12px}}.eyebrow{{font-size:9px}}.heading{{font-size:16px}}button{{padding:7px}}}}
</style></head>
<body><div class="stage">
  <div class="header"><div><div class="eyebrow">🫧 OCEAN LAB · LIVE VISUALIZATION</div><div class="heading">✨ Watch your neuron light up</div></div>
  <div class="chip"><span></span> <b>{len(spikes)}</b> recorded spike(s)</div></div>
  <svg viewBox="0 0 940 298" role="img" aria-label="Stylized neuron. Its soma flashes and blue pulses move along an axon when the model records a spike.">
    <defs>
      <linearGradient id="somaFill" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#e1f9fc"/><stop offset=".58" stop-color="#91d8e7"/><stop offset="1" stop-color="#56a9ca"/></linearGradient>
      <radialGradient id="halo"><stop stop-color="#59c9ec" stop-opacity=".7"/><stop offset=".6" stop-color="#69d2ee" stop-opacity=".22"/><stop offset="1" stop-color="#69d2ee" stop-opacity="0"/></radialGradient>
      <radialGradient id="signal"><stop stop-color="#fff" stop-opacity=".95"/><stop offset=".18" stop-color="#d9fbff" stop-opacity=".92"/><stop offset=".55" stop-color="#43c8f4" stop-opacity=".6"/><stop offset="1" stop-color="#43c8f4" stop-opacity="0"/></radialGradient>
      <filter id="softGlow" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="8"/></filter>
    </defs>
    <!-- Tiny floating bubbles are ambient decoration, not spikes -->
    <g opacity=".33" fill="#99dbe8"><circle cx="126" cy="65" r="5"/><circle cx="750" cy="55" r="4"/><circle cx="810" cy="222" r="7"/><circle cx="586" cy="264" r="4"/><circle cx="425" cy="48" r="3"/><circle cx="93" cy="224" r="3"/></g>
    <!-- Dendritic tree -->
    <g class="nbranch">
      <path d="M271 170 Q230 155 206 134 T149 120 Q121 123 96 99"/>
      <path d="M207 134 Q177 91 162 70 T131 37" class="fine"/>
      <path d="M160 70 Q128 69 106 50" class="fine"/>
      <path d="M206 134 Q177 149 154 176 T115 188" class="fine"/>
      <path d="M265 185 Q225 201 206 223 T160 250 Q143 268 110 267"/>
      <path d="M206 223 Q178 221 158 207 T120 210" class="fine"/>
      <path d="M243 157 Q225 117 234 91 T221 47"/>
      <path d="M234 91 Q254 71 255 39" class="fine"/>
      <path d="M266 203 Q250 235 260 250 T258 276" class="fine"/>
    </g>
    <!-- Axon and terminal branches -->
    <path id="axonPath" class="nerve" d="M313 180 C382 151 436 196 502 178 S638 167 710 181 S771 177 805 160" />
    <path class="nbranch" d="M805 160 Q840 137 862 117 T902 108"/>
    <path class="nbranch fine" d="M842 136 Q875 150 908 142"/>
    <path class="nbranch" d="M805 160 Q839 181 869 196 T902 216"/>
    <path class="nbranch fine" d="M867 195 Q880 221 878 248"/>
    <path class="myelin" d="M395 168 l-5 6 M477 180 l-5 5 M564 169 l-5 6 M661 174 l-5 6 M745 183 l-5 5" />
    <!-- Glowing cell body -->
    <circle id="aura" cx="283" cy="180" r="78" fill="url(#halo)" opacity=".17"/>
    <circle id="flash" cx="283" cy="180" r="55" fill="#36baf0" opacity="0" filter="url(#softGlow)"/>
    <circle class="core" cx="283" cy="180" r="35"/>
    <circle cx="278" cy="173" r="15" fill="#dff8fc" opacity=".85"/>
    <circle id="nucleus" cx="278" cy="173" r="9" fill="#64c0d7" opacity=".85"/>
    <circle cx="272" cy="166" r="4" fill="white" opacity=".7" />
    <g id="pulses"></g>
    <!-- Labels -->
    <g font-size="13" fill="#51889e" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-weight="650">
      <text x="238" y="269">SOMA</text><text x="578" y="236">AXON</text><text x="67" y="290">DENDRITES</text>
    </g>
  </svg>
  <div class="footer">
    <div class="status"><span class="status-dot" id="statusDot"></span><span id="status">Integrating</span></div>
    <div class="track" aria-label="Simulation timeline"><div class="fill" id="progress"></div></div>
    <div class="time" id="clock">0 ms</div>
    <div class="actions"><button id="pause" type="button" aria-label="Pause animation">Ⅱ Pause</button><button id="replay" type="button" aria-label="Replay animation">↺ Replay</button></div>
  </div>
  <div class="footnote">🧪 Glow timing comes from simulated spikes; moving axon pulses are illustrative, not measured conduction speeds.</div>
</div>
<script>
(() => {{
  'use strict';
  const spikes = {spikes_json};
  const duration = {duration_json};
  const speed = {speed_json};
  const loopMs = Math.max(5000, Math.min(18000, duration * 40)) / speed;
  const path = document.getElementById('axonPath');
  const pathLength = path.getTotalLength();
  const container = document.getElementById('pulses');
  const NS = 'http://www.w3.org/2000/svg';
  const pulses = spikes.map(() => {{
    const group = document.createElementNS(NS, 'g');
    const halo = document.createElementNS(NS, 'circle');
    halo.setAttribute('r','21'); halo.setAttribute('fill','url(#signal)');
    const center = document.createElementNS(NS, 'circle');
    center.setAttribute('r','5'); center.setAttribute('fill','#b4f5ff');
    center.setAttribute('stroke','#fff'); center.setAttribute('stroke-width','1.5');
    group.append(halo, center); group.style.opacity='0'; container.appendChild(group);
    return group;
  }});
  const aura = document.getElementById('aura');
  const flash = document.getElementById('flash');
  const nucleus = document.getElementById('nucleus');
  const status = document.getElementById('status');
  const statusDot = document.getElementById('statusDot');
  const progress = document.getElementById('progress');
  const clock = document.getElementById('clock');
  const pauseButton = document.getElementById('pause');
  const replayButton = document.getElementById('replay');
  let elapsed = 0, lastStamp = null;
  let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const travelWindow = Math.min(35, Math.max(8, duration * 0.095));
  const glowWindow = Math.min(28, Math.max(7, duration * 0.075));

  function paint(timeMs) {{
    let brightness = 0;
    spikes.forEach((spike, index) => {{
      // Wrap so a late pulse can finish smoothly at the start of the next loop.
      const delta = (timeMs - spike + duration) % duration;
      brightness = Math.max(brightness, delta < glowWindow ? Math.pow(1-delta/glowWindow,2) : 0);
      const pulse = pulses[index];
      if (delta < travelWindow) {{
        const distance = Math.min(1, delta / travelWindow);
        const pt = path.getPointAtLength(pathLength * distance);
        pulse.setAttribute('transform', `translate(${{pt.x}} ${{pt.y}})`);
        pulse.style.opacity = String(Math.sin(Math.PI*distance)*.96);
      }} else pulse.style.opacity = '0';
    }});
    aura.setAttribute('opacity',String(.16+brightness*.78));
    flash.setAttribute('opacity',String(brightness*.7));
    nucleus.setAttribute('fill', brightness > .15 ? '#eafdff' : '#64c0d7');
    const firing = brightness > .18;
    status.textContent = spikes.length === 0 ? 'Quiet neuron · no spikes' : firing ? '⚡ Firing!' : 'Integrating';
    statusDot.style.background = firing ? '#f18b6d' : '#55bacb';
    statusDot.style.boxShadow = firing ? '0 0 12px #f18b6d' : '0 0 8px #56c3d0';
    progress.style.width = `${{(timeMs / duration) * 100}}%`;
    clock.textContent = `${{Math.floor(timeMs)}} ms`;
  }}

  function frame(timestamp) {{
    if (lastStamp !== null && playing) elapsed += Math.min(timestamp-lastStamp, 100);
    lastStamp = timestamp;
    paint((elapsed % loopMs) / loopMs * duration);
    window.requestAnimationFrame(frame);
  }}
  pauseButton.addEventListener('click', () => {{
    playing = !playing;
    pauseButton.textContent = playing ? 'Ⅱ Pause' : '▶ Play';
    pauseButton.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation');
  }});
  replayButton.addEventListener('click', () => {{
    elapsed = 0;
    playing = true;
    pauseButton.textContent = 'Ⅱ Pause';
    pauseButton.setAttribute('aria-label','Pause animation');
    paint(0);
  }});
  paint(0);
  window.requestAnimationFrame(frame);
}})();
</script></body></html>'''
