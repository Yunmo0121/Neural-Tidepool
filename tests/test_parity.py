"""Checks that the browser engine (docs/js/lif.js) and neuron.py agree.

Every waveform is simulated with both integration methods, two time steps and
two refractory periods. Skipped automatically when Node.js is not installed.
"""

import json
import shutil
import subprocess
import unittest
from pathlib import Path

import numpy as np

from neuron import simulate_lif

ROOT = Path(__file__).resolve().parent.parent


@unittest.skipUnless(shutil.which("node"), "Node.js is not installed")
class TestPythonJavaScriptParity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        output = subprocess.run(
            ["node", str(ROOT / "tests" / "js" / "dump_traces.js")],
            check=True, capture_output=True, text=True,
        ).stdout
        cls.cases = json.loads(output)

    def test_every_case_matches(self):
        self.assertEqual(len(self.cases), 48)
        for case in self.cases:
            label = f"{case['type']}, {case['method']}, dt={case['dtMs']}, t_ref={case['refractoryMs']}"
            with self.subTest(case=label):
                result = simulate_lif(
                    current_na=np.array(case["current"]), duration_ms=300,
                    dt_ms=case["dtMs"], method=case["method"], refractory_ms=case["refractoryMs"],
                )
                np.testing.assert_allclose(result.voltage_mv, case["voltage"], atol=1e-9)
                np.testing.assert_allclose(result.spike_times_ms, case["spikes"], atol=1e-9)


if __name__ == "__main__":
    unittest.main()
