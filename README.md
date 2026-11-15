# 🌊 NeuroVerse

### An Interactive Mini Lab for Computational Neuroscience

**NeuroVerse** is a small, interactive neuroscience playground built with Python, NumPy, Plotly, and Streamlit.

It started with a simple question:

_How can we use mathematics and programming to understand the way neurons respond to electrical signals?_

This project explores that question through a simplified **Leaky Integrate-and-Fire (LIF)** neuron model, combining numerical simulation, interactive visualisation, and a little creativity.

Welcome to my tiny neuroscience laboratory! 🧠

---

## ✨ Overview

NeuroVerse allows users to explore how a neuron's membrane potential changes in response to electrical stimulation.

By adjusting model parameters, users can observe neuronal firing patterns, explore spike generation, and develop an intuitive understanding of basic computational neuroscience concepts.

The project is designed to be both an educational tool and a personal exploration of scientific computing.

### Key Features

- **Interactive Neuron Simulation** — Simulate a single neuron using the LIF model.
- **Adjustable Parameters** — Experiment with input current, membrane time constant, firing threshold, and simulation duration.
- **Membrane Potential Visualisation** — Explore voltage changes and spike events through interactive Plotly graphs.
- **Spike Analysis** — Track spike counts and average firing rates.
- **Glowing Neuron Animation** — Watch a neuron light up in response to simulated spike events.
- **Playback Controls** — Pause, replay, and adjust animation speed.
- **Ocean Lab Interface** — A clean, ocean-inspired scientific dashboard.

---

## 🌊 Ocean Lab Edition

NeuroVerse features a minimal, ocean-inspired interface, designed to make scientific exploration visually engaging without sacrificing clarity.

The colour palette includes:

| Colour     | Hex       | Purpose                    |
| ---------- | --------- | -------------------------- |
| Ice Blue   | `#F6FAFC` | Main background            |
| Ocean Blue | `#176F93` | Primary interface elements |
| Aqua       | `#76BCCC` | Visual accents             |
| Coral      | `#F18B6D` | Spike markers              |

The goal is simple: **make computational neuroscience approachable, interactive, and visually enjoyable.**

---

## 🛠️ Tech Stack

| Technology              | Purpose                                   |
| ----------------------- | ----------------------------------------- |
| Python                  | Core simulation logic                     |
| NumPy                   | Numerical computation                     |
| Plotly                  | Interactive scientific visualisation      |
| Streamlit               | Web-based user interface                  |
| HTML / CSS / JavaScript | Animated neuron visualisation             |
| unittest                | Automated testing                         |
| Git & GitHub            | Version control and project documentation |

---

## Getting Started

### 1. Clone the repository

Once the project is published on GitHub:

```bash
git clone https://github.com/Yunmo0121/NeuroVerse.git
cd NeuroVerse
```

Alternatively, download the project files and open the folder in VS Code.

### 2. Set up a virtual environment

Python 3.11 or later is recommended.

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies

```bash
python -m pip install -r requirements.txt
```

### 4. Launch NeuroVerse

```bash
python -m streamlit run app.py
```

Open the local URL displayed in the terminal, typically:

`http://localhost:8501`

Your neuron laboratory is ready to explore!

### 5. Run automated tests

```bash
python -m unittest discover -s tests -v
```

---

## 🔬 Understanding the LIF Model

NeuroVerse uses the **Leaky Integrate-and-Fire (LIF)** model, a simplified mathematical representation of neuronal behaviour.

The model describes how membrane potential evolves as a neuron receives electrical input.

### Governing Equation

$$
\tau_m \frac{dV}{dt} = V_{\mathrm{rest}} - V + RI
$$

Where:

| Symbol                 | Description                |
| ---------------------- | -------------------------- |
| \(V\)                  | Membrane potential         |
| \(\tau_m\)             | Membrane time constant     |
| \(V\_{\mathrm{rest}}\) | Resting membrane potential |
| \(R\)                  | Membrane resistance        |
| \(I\)                  | Input current              |

### How It Works

1. **Input:** The neuron receives an electrical current.
2. **Integration:** Its membrane potential evolves in response to the input.
3. **Threshold:** A spike event is recorded when the voltage reaches the firing threshold.
4. **Reset:** The membrane potential returns to a reset value.
5. **Refractory Period:** The neuron temporarily remains at the reset potential before resuming integration.

The differential equation is approximated numerically using the **Forward Euler method**.

The current simulation uses a fixed time step of `0.1 ms`, with default resting and reset potentials of `-65 mV` and `-70 mV`, respectively.

---

## ⚡ Glowing Neuron Animation

Introduced in **v0.2**, the glowing neuron animation provides a visual representation of neuronal firing activity.

The neuron illuminates when a spike is detected by the LIF simulation, followed by an animated signal travelling along an illustrated axon.

Users can:

- Observe the relationship between electrical stimulation and spike activity.
- Adjust input parameters and explore changes in firing behaviour.
- Pause and replay the animation.
- Change playback speed.

**Scientific note:** The animation is synchronised with simulated spike times, but the travelling light is a conceptual visual effect. It does not simulate biological conduction velocity or the detailed shape of an action potential.

---

## Experiments to Try

### Experiment 01 — Resting Neuron

Set the input current to `0 nA`.

Observe the membrane potential and check whether any spike events occur.

**Question:** Why does the neuron remain at its resting potential?

### Experiment 02 — Electrical Stimulation

Increase the input current to `2.5 nA`.

Observe how the membrane potential approaches the firing threshold and resets after each spike.

**Question:** How does increasing the input current affect the firing rate?

### Experiment 03 — Threshold Sensitivity

Keep the input current constant and change the spike threshold.

**Question:** How does the threshold influence neuronal excitability?

These experiments provide a starting point for understanding how model parameters influence neuronal behaviour.

---

## Project Structure

```text
NeuroVerse/
│
├── app.py                    # Streamlit application
├── neuron.py                 # LIF simulation engine
├── neuron_animation.py       # Animated neuron visualisation
│
├── tests/
│   └── test_neuron.py        # Unit tests
│
├── .streamlit/
│   └── config.toml           # Ocean Lab theme
│
├── requirements.txt          # Project dependencies
├── README.md                 # Documentation
└── .gitignore
```

The simulation logic is separated from the interface and animation code to improve readability, testing, and future development.

---

## 🚀 Development Roadmap

### v0.1 — Mini Neuron Lab

- [x] Implement a single LIF neuron model
- [x] Simulate membrane potential over time
- [x] Detect spike events
- [x] Add interactive parameter controls
- [x] Visualise results using Plotly
- [x] Add initial automated tests
- [x] Design the Ocean Lab interface

### v0.2 — Glowing Neuron

- [x] Implement an animated neuron visualisation
- [x] Synchronise animation with simulated spikes
- [x] Add pause, replay, and playback speed controls
- [x] Improve graph layout and visual presentation

### v0.3 — Experimental Playground

- [ ] Introduce pulse-based and time-varying input currents
- [ ] Compare membrane potential under different conditions
- [ ] Add experiment comparison charts
- [ ] Expand automated tests

### Future Development

- [ ] Simulate small networks of connected neurons
- [ ] Explore simple synaptic interactions
- [ ] Add reproducible experiment examples
- [ ] Publish an online interactive demo
- [ ] Add demo screenshots and scientific references

---

## Limitations

NeuroVerse is an **educational simulation**, rather than a biologically detailed representation of neuronal activity.

The current model assumes:

- A single simplified neuron
- Constant external input current
- Fixed model parameters during each simulation
- No synaptic connections or biological noise
- No detailed action potential waveform

The neuron animation is intended to illustrate spike events, not to reproduce the exact electrical behaviour of biological neurons.

The project is not intended for medical or clinical applications.

---

## What I'm Learning

NeuroVerse is part of my personal exploration of the intersection between **Computer Science, Mathematics, and Neuroscience**.

Through this project, I'm developing practical experience in:

- Mathematical modelling and differential equations
- Numerical simulation with Python
- Scientific data visualisation
- Interactive application development
- Software testing and modular design
- Communicating scientific ideas through software

One of my favourite parts of programming is discovering how abstract mathematical ideas can become something interactive and visual.

---

## A Note From the Developer

NeuroVerse began as a small personal project driven by curiosity about computational neuroscience.

As I continue learning computer science, I'm particularly interested in exploring how programming and mathematics can help us investigate complex biological systems.

This project is still evolving, and I hope to gradually expand it into a more comprehensive environment for experimenting with simple neural models.

Thanks for visiting NeuroVerse!

_Built with Python, curiosity, and a little ocean inspiration._ 🌊

**NeuroVerse | Ocean Lab Edition | v0.2**
