"""Experiment files saved by the browser lab are reproduced by the Python engine."""

import json
import shutil
import subprocess
import unittest
from pathlib import Path

import numpy as np

from reproduce import compare, run_experiment
from stimulus import WAVEFORMS, make_stimulus, mulberry32, time_axis

ROOT = Path(__file__).resolve().parent.parent


@unittest.skipUnless(shutil.which("node"), "Node.js is not installed")
class TestReproduceBrowserExperiments(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        out = subprocess.run(["node", str(ROOT / "tests" / "js" / "make_experiments.js")],
                             check=True, capture_output=True, text=True).stdout
        cls.files = json.loads(out)

    def test_every_experiment_is_reproduced(self):
        self.assertEqual(len(self.files), 12)
        for experiment in self.files:
            with self.subTest(experiment=experiment["label"]):
                _, _, result = run_experiment(experiment)
                report = compare(experiment, result)
                self.assertTrue(report["reproduced"], report)

    def test_python_stimulus_matches_browser_stimulus(self):
        script = (
            "import * as L from './docs/js/lif.js';"
            "const t = L.timeAxis(250, 0.1); const out = {};"
            "for (const w of Object.keys(L.WAVEFORMS)) out[w] = Array.from(L.makeStimulus(w, w === 'noisy' ? {seed: 123} : {}, t));"
            "out.defaults = Object.fromEntries(Object.entries(L.WAVEFORMS).map(([k, v]) => [k, v.defaults]));"
            "process.stdout.write(JSON.stringify(out));"
        )
        js = json.loads(subprocess.run(["node", "--input-type=module", "-e", script], cwd=ROOT,
                                       check=True, capture_output=True, text=True).stdout)
        self.assertEqual(js.pop("defaults"), WAVEFORMS)
        t = time_axis(250, 0.1)
        for waveform, values in js.items():
            with self.subTest(waveform=waveform):
                params = {"seed": 123} if waveform == "noisy" else {}
                np.testing.assert_allclose(make_stimulus(waveform, params, t), values, atol=1e-12)


class TestRandomGenerator(unittest.TestCase):
    def test_known_values(self):
        # First outputs of mulberry32(7), as produced by the JavaScript implementation.
        rand = mulberry32(7)
        self.assertEqual([rand() for _ in range(3)], [0.011704753153026104, 0.06195825757458806, 0.97690763277933])


class TestRejectsBadFiles(unittest.TestCase):
    def test_wrong_format(self):
        with self.assertRaises(ValueError):
            run_experiment({"format": "something-else", "schemaVersion": 1})


if __name__ == "__main__":
    unittest.main()
