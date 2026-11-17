// Guided experiments. Each protocol sets up the bench, lists steps,
// asks for a prediction first, and explains the result afterwards.
// Reading links point to the free online textbook Neuronal Dynamics
// (Gerstner, Kistler, Naud & Paninski, Cambridge University Press, 2014).

export const PROTOCOLS = [
  {
    id: 'rheobase',
    reading: [{ label: '§1.3.3 The threshold for spike firing', url: 'https://neuronaldynamics.epfl.ch/online/Ch1.S3.html#SS3' }],
    title: 'Find the rheobase',
    question: 'What is the weakest current that makes the neuron fire?',
    goal: 'Real neurons ignore weak inputs. Find the exact current where this one switches from silent to firing.',
    setup: { waveform: 'constant', stim: { amplitude: 1.0 }, durationMs: 500 },
    analysis: 'fi',
    steps: [
      'Start at 1.0 nA. The voltage rises and then levels off below threshold.',
      'Raise the amplitude 0.1 nA at a time until the first spike appears.',
      'Record the last silent run and the first firing run in your notebook.',
      'Move the spike threshold to −55 mV and find the new rheobase.',
    ],
    prediction: 'My guess for the rheobase (in nA), and why:',
    explain: `
      <p>With a constant current the voltage relaxes towards a steady value
      <span class="math">V<sub>∞</sub> = V<sub>rest</sub> + RI</span>.
      The neuron only fires if that steady value is above threshold, so the cut-off is</p>
      <span class="eq">I<sub>rh</sub> = (θ − V<sub>rest</sub>) / R = 15 mV / 10 MΩ = 1.5 nA</span>
      <p>At −55 mV the gap shrinks to 10 mV and the rheobase drops to 1.0 nA. The rheobase readout
      under the scope always shows this formula for your current settings.</p>`,
  },
  {
    id: 'fi',
    reading: [{ label: '§1.3 Integrate-and-fire models', url: 'https://neuronaldynamics.epfl.ch/online/Ch1.S3.html' }],
    title: 'Measure the f–I curve',
    question: 'How does firing rate grow with current?',
    goal: 'The f–I curve is the neuron’s input–output function. Measure it and compare it with the exact formula.',
    setup: { waveform: 'constant', stim: { amplitude: 2.5 }, durationMs: 500 },
    analysis: 'fi',
    steps: [
      'Look at the Analysis panel: dots are simulated rates, the line is the formula.',
      'Sweep the amplitude from 1 to 8 nA and watch your orange marker travel along the curve.',
      'Change the membrane time constant τ. Which part of the curve moves most?',
    ],
    prediction: 'Will doubling the current double the firing rate? My guess:',
    explain: `
      <p>Between spikes the voltage climbs exponentially from reset to threshold. Solving for that time and adding the refractory period gives the period of firing:</p>
      <span class="eq">f = 1 / ( t<sub>ref</sub> + τ ln[(RI + V<sub>rest</sub> − V<sub>reset</sub>) / (RI + V<sub>rest</sub> − θ)] )</span>
      <p>Doubling the current does not double the rate. Just above the rheobase the logarithm blows up, so the rate rises steeply from zero; for strong currents the curve bends over. Larger τ means a slower membrane and a lower curve.</p>
      <p>Near the rheobase the period becomes very long, so a short recording may hold fewer than two spikes and no rate can be measured. This is a limit of finite recordings, in the lab as in real experiments.</p>`,
  },
  {
    id: 'refractory',
    reading: [{ label: '§1.3 Integrate-and-fire models', url: 'https://neuronaldynamics.epfl.ch/online/Ch1.S3.html' }, { label: '§1.4 Limitations of the LIF model', url: 'https://neuronaldynamics.epfl.ch/online/Ch1.S4.html' }],
    title: 'The speed limit',
    question: 'Can a neuron fire as fast as you like?',
    goal: 'After every spike the cell is briefly unresponsive. See how that refractory period caps the firing rate.',
    setup: { waveform: 'constant', stim: { amplitude: 8 }, durationMs: 200, membrane: { refractoryMs: 3 } },
    analysis: 'fi',
    steps: [
      'Push the amplitude to 20 nA and note the rate.',
      'Set the refractory period to 10 ms and repeat.',
      'Set it to 0 ms. Is there still a limit?',
    ],
    prediction: 'The highest rate I expect with a 3 ms refractory period:',
    explain: `
      <p>In the f–I formula the logarithm shrinks towards zero as <span class="math">I</span> grows, so the period approaches <span class="math">t<sub>ref</sub></span> and the rate can never exceed</p>
      <span class="eq">f<sub>max</sub> = 1 / t<sub>ref</sub></span>
      <p>That is about 333 Hz for 3 ms and 100 Hz for 10 ms. With no refractory period there is no ceiling at all: the period shrinks towards zero as the current grows, which no real neuron can do. That is why the refractory period belongs in the model.</p>`,
  },
  {
    id: 'summation',
    reading: [{ label: '§1.2.1 Postsynaptic potentials', url: 'https://neuronaldynamics.epfl.ch/online/Ch1.S2.html#SS1' }, { label: '§1.3.2 Pulse input', url: 'https://neuronaldynamics.epfl.ch/online/Ch1.S3.html#SS2' }],
    title: 'Temporal summation',
    question: 'Can two weak inputs add up to a spike?',
    goal: 'Each pulse on its own is too weak. Find how close together two pulses must arrive to trigger a spike.',
    setup: { waveform: 'twoPulses', stim: { amplitude: 5, start: 40, width: 5, gap: 10 }, durationMs: 200 },
    analysis: null,
    steps: [
      'With a 10 ms gap the second pulse lands on the tail of the first and the cell fires.',
      'Record the run, then widen the gap a few milliseconds at a time.',
      'Find the largest gap that still produces a spike and record it.',
    ],
    prediction: 'The largest gap that still works, in ms:',
    explain: `
      <p>One 5 ms pulse of 5 nA lifts the voltage by about
      <span class="math">RI(1 − e<sup>−w/τ</sup>) ≈ 11 mV</span>, short of the 15 mV needed.
      What is left of the first bump decays as <span class="math">e<sup>−gap/τ</sup></span>, so the two add up to</p>
      <span class="eq">11 mV × (1 + e<sup>−gap/τ</sup>)</span>
      <p>This crosses 15 mV when the gap is under roughly 21 ms. The membrane time constant is the neuron’s memory: inputs closer together than about τ are added, inputs further apart are forgotten.</p>`,
  },
  {
    id: 'noise',
    reading: [{ label: '§7.3 Interval distribution and coefficient of variation', url: 'https://neuronaldynamics.epfl.ch/online/Ch7.S3.html' }, { label: '§8.1 Noise input', url: 'https://neuronaldynamics.epfl.ch/online/Ch8.S1.html' }],
    title: 'Firing from noise',
    question: 'Can a neuron fire when its average input is too weak?',
    goal: 'Real inputs are noisy. Keep the average current below the rheobase and add fluctuations.',
    setup: { waveform: 'noisy', stim: { mean: 1.3, sigma: 0, seed: 7 }, durationMs: 1000 },
    analysis: null,
    steps: [
      'With no noise the mean of 1.3 nA is below the rheobase of 1.5 nA, so nothing happens.',
      'Raise the noise size to 0.3, 0.6 and 1.0 nA, recording each run.',
      'Change the seed and compare. Watch the CV readout: 0 is clockwork, 1 is as random as a coin toss.',
    ],
    prediction: 'With a mean below the rheobase, I expect noise to:',
    explain: `
      <p>The mean drive alone leaves the voltage below threshold, but random excursions occasionally push it over. This is <em>fluctuation-driven</em> firing.</p>
      <p>Because the crossings are random, the spike train becomes irregular and its coefficient of variation of inter-spike intervals,
      <span class="math">CV = σ<sub>ISI</sub> / μ<sub>ISI</sub></span>, rises towards 1. Neurons in the cortex fire with a CV close to 1, which is one reason scientists think they work in this noise-driven regime.</p>`,
  },
  {
    id: 'dt',
    title: 'How small should dt be?',
    question: 'How accurate is the computer’s answer?',
    goal: 'The simulation steps forward in small jumps of dt. Measure how the error depends on the step size.',
    setup: { waveform: 'constant', stim: { amplitude: 2.5 }, durationMs: 200, membrane: { dtMs: 0.1, method: 'exact' } },
    analysis: 'dt',
    steps: [
      'The Analysis panel measures the first-spike time error of both integrators for seven values of dt.',
      'Read the slope of the forward Euler line on the log–log plot.',
      'Under Advanced parameters, switch the integrator to forward Euler, set dt to 1 ms and compare the scope trace and readouts with the exact integrator.',
    ],
    prediction: 'If I make dt ten times smaller, the error will be:',
    explain: `
      <p>Forward Euler replaces the curve by a straight step:
      <span class="math">V<sub>n+1</sub> = V<sub>n</sub> + (dt/τ)(V<sub>rest</sub> − V<sub>n</sub> + RI)</span>.
      Each step makes an error of order <span class="math">dt²</span>, and there are <span class="math">1/dt</span> steps, so the total error is of order <span class="math">dt</span>.</p>
      <p>On a log–log plot that shows up as a slope close to 1: ten times smaller dt, about ten times smaller error.</p>
      <p>The LIF equation is linear, so between spikes it can be solved exactly:
      <span class="math">V(t + Δt) = V<sub>∞</sub> + (V(t) − V<sub>∞</sub>) e<sup>−Δt/τ</sup></span>.
      The exact integrator uses this, together with the exact threshold-crossing time, so for an input that is constant within each step its only error is floating-point rounding, around 10<sup>−13</sup> ms. Choosing the right method can matter more than choosing a small step.</p>`,
  },
];
