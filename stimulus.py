"""Stimulus waveforms, matching docs/js/lif.js exactly.

The noisy waveform uses the same seeded random number generator (mulberry32)
and the same Box–Muller transform as the browser, so a seed gives the same
current in Python and in the lab. tests/test_parity.py checks this.
"""

import math

import numpy as np

WAVEFORMS = {
    "constant": {"amplitude": 2.5},
    "step": {"amplitude": 2.5, "start": 50},
    "pulse": {"amplitude": 3, "start": 40, "width": 60},
    "twoPulses": {"amplitude": 5, "start": 40, "width": 5, "gap": 10},
    "sine": {"offset": 1.5, "amplitude": 1.0, "frequency": 10},
    "noisy": {"mean": 1.3, "sigma": 0.6, "seed": 7},
}

_M32 = 0xFFFFFFFF


def mulberry32(seed):
    """32-bit seeded generator, bit-for-bit the same as the JavaScript version."""
    a = int(seed) & _M32

    def rand():
        nonlocal a
        a = (a + 0x6D2B79F5) & _M32
        t = a
        t = ((t ^ (t >> 15)) * (t | 1)) & _M32
        t = t ^ ((t + (((t ^ (t >> 7)) * (t | 61)) & _M32)) & _M32)
        return ((t ^ (t >> 14)) & _M32) / 4294967296

    return rand


def _gaussian(rand):
    u = 0.0
    while u == 0.0:
        u = rand()
    v = rand()
    return math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * v)


def time_axis(duration_ms, dt_ms):
    n = math.ceil((duration_ms + dt_ms * 0.5) / dt_ms)
    return np.arange(n, dtype=float) * dt_ms


def make_stimulus(waveform, params, t):
    """Injected current I(t) in nA for every sample time in ``t`` (ms)."""
    if waveform not in WAVEFORMS:
        raise ValueError(f"Unknown waveform: {waveform}")
    p = {**WAVEFORMS[waveform], **params}
    n = len(t)
    current = np.zeros(n)
    if waveform == "constant":
        current[:] = p["amplitude"]
    elif waveform == "step":
        for i in range(n):
            current[i] = p["amplitude"] if t[i] >= p["start"] else 0.0
    elif waveform == "pulse":
        for i in range(n):
            current[i] = p["amplitude"] if p["start"] <= t[i] < p["start"] + p["width"] else 0.0
    elif waveform == "twoPulses":
        s2 = p["start"] + p["gap"]
        for i in range(n):
            on1 = p["start"] <= t[i] < p["start"] + p["width"]
            on2 = s2 <= t[i] < s2 + p["width"]
            current[i] = p["amplitude"] if on1 or on2 else 0.0
    elif waveform == "sine":
        for i in range(n):
            current[i] = p["offset"] + p["amplitude"] * math.sin((2 * math.pi * p["frequency"] * t[i]) / 1000)
    elif waveform == "noisy":
        # Exact discretisation of an Ornstein–Uhlenbeck process (unit variance,
        # 5 ms correlation time), started from its stationary distribution.
        rand = mulberry32(p["seed"])
        tau_noise = 5.0
        eta = _gaussian(rand)
        current[0] = p["mean"] + p["sigma"] * eta
        for i in range(1, n):
            a = math.exp(-(t[i] - t[i - 1]) / tau_noise)
            eta = a * eta + math.sqrt(1 - a * a) * _gaussian(rand)
            current[i] = p["mean"] + p["sigma"] * eta
    return current
