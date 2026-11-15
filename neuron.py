"""A small, educational leaky integrate-and-fire (LIF) neuron simulator."""

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class SimulationResult:
    time_ms: np.ndarray
    voltage_mv: np.ndarray
    spike_times_ms: np.ndarray


def simulate_lif(
    current_na: float = 2.5,
    duration_ms: float = 200.0,
    tau_ms: float = 20.0,
    threshold_mv: float = -50.0,
    dt_ms: float = 0.1,
    resting_mv: float = -65.0,
    reset_mv: float = -70.0,
    resistance_mohm: float = 10.0,
    refractory_ms: float = 3.0,
) -> SimulationResult:
    """Simulate one LIF neuron with constant injected current using Euler steps.

    Units: time = ms, voltage = mV, resistance = MΩ, current = nA.
    R(MΩ) * I(nA) gives a voltage in mV.

    This model registers a spike at threshold, then resets the membrane voltage.
    It intentionally does not simulate the biological action-potential waveform.
    """
    if duration_ms <= 0 or dt_ms <= 0 or tau_ms <= 0:
        raise ValueError("Duration, time step, and membrane time constant must be positive.")
    if refractory_ms < 0 or resistance_mohm <= 0:
        raise ValueError("Refractory period must be non-negative and resistance positive.")
    if threshold_mv <= max(resting_mv, reset_mv):
        raise ValueError("Threshold must exceed resting and reset voltages.")
    if dt_ms >= tau_ms:
        raise ValueError("Time step must be smaller than membrane time constant.")

    # End time is included when duration is a multiple of dt.
    time_ms = np.arange(0.0, duration_ms + dt_ms * 0.5, dt_ms)
    voltage_mv = np.empty(len(time_ms), dtype=float)
    voltage_mv[0] = resting_mv
    spike_times = []

    reset_steps = max(1, int(np.ceil(refractory_ms / dt_ms)))
    last_spike_step = None

    for i in range(1, len(time_ms)):
        if last_spike_step is not None and i - last_spike_step <= reset_steps:
            voltage_mv[i] = reset_mv
            continue

        previous = voltage_mv[i - 1]
        dv = (dt_ms / tau_ms) * (
            resting_mv - previous + resistance_mohm * current_na
        )
        candidate = previous + dv

        if candidate >= threshold_mv:
            # Record the spike event at its threshold; next sample resets.
            voltage_mv[i] = threshold_mv
            spike_times.append(time_ms[i])
            last_spike_step = i
        else:
            voltage_mv[i] = candidate

    return SimulationResult(
        time_ms=time_ms,
        voltage_mv=voltage_mv,
        spike_times_ms=np.asarray(spike_times, dtype=float),
    )
