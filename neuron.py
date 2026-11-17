"""Neural Tidepool reference engine: an event-driven leaky integrate-and-fire neuron.

This is the Python reference implementation. The browser lab (docs/js/lif.js)
follows exactly the same algorithm, and tests/test_parity.py checks that the two
engines agree to within 1e-9 mV.
"""

import math
from dataclasses import dataclass
from typing import Union

import numpy as np

ENGINE_VERSION = "0.3.1"
METHODS = ("exact", "euler")
CurrentInput = Union[float, np.ndarray]
_EPS = 1e-12


@dataclass(frozen=True)
class SimulationResult:
    time_ms: np.ndarray
    voltage_mv: np.ndarray
    spike_times_ms: np.ndarray


def simulate_lif(
    current_na: CurrentInput = 2.5,
    duration_ms: float = 200.0,
    tau_ms: float = 20.0,
    threshold_mv: float = -50.0,
    dt_ms: float = 0.1,
    resting_mv: float = -65.0,
    reset_mv: float = -70.0,
    resistance_mohm: float = 10.0,
    refractory_ms: float = 3.0,
    method: str = "exact",
) -> SimulationResult:
    """Simulate one LIF neuron, tau_m dV/dt = V_rest - V + R I.

    Units: time = ms, voltage = mV, resistance = MΩ, current = nA.
    R (MΩ) × I (nA) gives a voltage in mV.

    ``current_na`` is a constant current or an array with one value per sample.
    The current is held constant over each step (zero-order hold): the step
    from sample i - 1 to sample i uses ``current[i - 1]``.

    ``method="exact"`` uses the closed-form solution of the linear ODE within a
    step and the exact threshold-crossing time. ``method="euler"`` uses forward
    Euler with the crossing time found by linear interpolation.

    A spike at time t* resets V to ``reset_mv`` and clamps it until
    t* + ``refractory_ms``; integration then resumes from that exact moment, so
    spike times and refractory periods are not rounded to the time grid.

    ``voltage_mv`` is the true membrane state at each sample time. The spike
    itself is an event, reported in ``spike_times_ms``.
    """
    if duration_ms <= 0 or dt_ms <= 0 or tau_ms <= 0:
        raise ValueError("Duration, time step, and membrane time constant must be positive.")
    if refractory_ms < 0 or resistance_mohm <= 0:
        raise ValueError("Refractory period must be non-negative and resistance positive.")
    if threshold_mv <= max(resting_mv, reset_mv):
        raise ValueError("Threshold must exceed resting and reset voltages.")
    if dt_ms >= tau_ms:
        raise ValueError("Time step must be smaller than membrane time constant.")
    if method not in METHODS:
        raise ValueError(f"Unknown integration method: {method}")

    # Same samples as the JavaScript engine: 0, dt, 2 dt, ... up to the duration.
    n = math.ceil((duration_ms + dt_ms * 0.5) / dt_ms)
    time_ms = np.arange(n, dtype=float) * dt_ms

    if np.ndim(current_na) == 0:
        current = np.full(n, float(current_na))
    else:
        current = np.asarray(current_na, dtype=float)
        if current.shape != time_ms.shape:
            raise ValueError(f"Current trace needs {n} samples, got {current.size}.")

    voltage_mv = np.empty(n, dtype=float)
    voltage_mv[0] = resting_mv
    spike_times = []
    v = resting_mv
    ref_left = 0.0

    for i in range(1, n):
        v_inf = resting_mv + resistance_mohm * float(current[i - 1])
        t_start = float(time_ms[i - 1])
        left = float(time_ms[i] - time_ms[i - 1])
        while left > _EPS:
            if ref_left > 0:
                if ref_left >= left - _EPS:
                    ref_left = max(0.0, ref_left - left)
                    v = reset_mv
                    left = 0.0
                    break
                t_start += ref_left
                left -= ref_left
                ref_left = 0.0
                v = reset_mv

            crossing = None
            if method == "exact":
                v_new = v_inf + (v - v_inf) * math.exp(-left / tau_ms)
                if v_new >= threshold_mv and v_inf > threshold_mv:
                    crossing = t_start + tau_ms * math.log((v - v_inf) / (threshold_mv - v_inf))
            else:
                v_new = v + (left / tau_ms) * (v_inf - v)
                if v_new >= threshold_mv:
                    crossing = t_start + left * (threshold_mv - v) / (v_new - v)

            if crossing is None:
                v = v_new
                break
            crossing = min(max(crossing, t_start), t_start + left)
            spike_times.append(crossing)
            v = reset_mv
            ref_left = refractory_ms
            left -= crossing - t_start
            t_start = crossing
        voltage_mv[i] = v

    return SimulationResult(
        time_ms=time_ms,
        voltage_mv=voltage_mv,
        spike_times_ms=np.asarray(spike_times, dtype=float),
    )
