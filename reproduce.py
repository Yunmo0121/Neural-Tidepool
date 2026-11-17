"""Re-run a Neural Tidepool experiment file with the Python reference engine.

Usage:
    python reproduce.py experiment.json
    python reproduce.py experiment.json --csv trace.csv

The script rebuilds the stimulus from the file, simulates it with neuron.py
(an independent implementation of the same algorithm as the browser lab), and
compares the spike times with the ones recorded in the file.
"""

import argparse
import json
import sys

import numpy as np

from neuron import ENGINE_VERSION, simulate_lif
from stimulus import make_stimulus, time_axis

FORMAT = "neural-tidepool-experiment"
SCHEMA_VERSION = 1
TOLERANCE_MS = 1e-9


def run_experiment(experiment):
    """Validate an experiment record and return (time, current, SimulationResult)."""
    if experiment.get("format") != FORMAT:
        raise ValueError("This is not a Neural Tidepool experiment file.")
    if experiment.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"Unsupported schema version {experiment.get('schemaVersion')}.")
    setup = experiment["setup"]
    m = setup["membrane"]
    t = time_axis(setup["durationMs"], m["dtMs"])
    current = make_stimulus(setup["waveform"], setup["stimulus"], t)
    result = simulate_lif(
        current_na=current,
        duration_ms=setup["durationMs"],
        tau_ms=m["tauMs"],
        threshold_mv=m["thresholdMv"],
        dt_ms=m["dtMs"],
        resting_mv=m["restingMv"],
        reset_mv=m["resetMv"],
        resistance_mohm=m["resistanceMohm"],
        refractory_ms=m["refractoryMs"],
        method=m["method"],
    )
    return t, current, result


def compare(experiment, result):
    recorded = np.asarray(experiment.get("results", {}).get("spikeTimesMs", []), dtype=float)
    computed = result.spike_times_ms
    same_count = len(recorded) == len(computed)
    max_diff = float(np.max(np.abs(recorded - computed))) if same_count and len(computed) else 0.0
    return {
        "reproduced": same_count and max_diff <= TOLERANCE_MS,
        "recorded_count": len(recorded),
        "count": len(computed),
        "max_diff_ms": max_diff if same_count else None,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("experiment", help="experiment file (.json) saved from the lab")
    parser.add_argument("--csv", help="also write the trace to this CSV file")
    args = parser.parse_args(argv)

    with open(args.experiment, encoding="utf-8") as f:
        experiment = json.load(f)
    t, current, result = run_experiment(experiment)
    report = compare(experiment, result)

    setup = experiment["setup"]
    print(f"Experiment:     {experiment.get('label') or args.experiment}")
    print(f"Recorded with:  engine {experiment.get('engineVersion')}, re-run with engine {ENGINE_VERSION}")
    print(f"Setup:          {setup['waveform']}, {setup['durationMs']} ms, "
          f"dt {setup['membrane']['dtMs']} ms, {setup['membrane']['method']} integrator")
    print(f"Spikes:         recorded {report['recorded_count']}, reproduced {report['count']}")
    if report["max_diff_ms"] is not None:
        print(f"Max difference: {report['max_diff_ms']:.3e} ms")
    if report["reproduced"]:
        print("Result:         REPRODUCED")
    elif experiment.get("engineVersion") != ENGINE_VERSION:
        print("Result:         DIFFERENT (the file was recorded with another engine version)")
    else:
        print("Result:         NOT REPRODUCED")

    if args.csv:
        with open(args.csv, "w", encoding="utf-8") as f:
            f.write(f"# Reproduced with Neural Tidepool engine {ENGINE_VERSION} (Python)\n")
            f.write(f"# experiment: {json.dumps(experiment)}\n")
            f.write("time_ms,current_na,voltage_mv\n")
            for row in zip(t, current, result.voltage_mv):
                f.write(f"{row[0]},{row[1]},{row[2]}\n")
        print(f"Trace written:  {args.csv}")
    return 0 if report["reproduced"] else 1


if __name__ == "__main__":
    sys.exit(main())
