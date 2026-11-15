"""Simple unit tests using Python's built-in unittest framework."""

import unittest

import numpy as np

from neuron import simulate_lif


class TestLIF(unittest.TestCase):
    def test_no_current_no_spikes(self):
        result = simulate_lif(current_na=0.0)
        self.assertEqual(len(result.spike_times_ms), 0)
        self.assertTrue(np.allclose(result.voltage_mv, -65.0))

    def test_positive_current_generates_spikes(self):
        result = simulate_lif(current_na=2.5)
        self.assertGreater(len(result.spike_times_ms), 0)
        self.assertTrue(np.all(np.isfinite(result.voltage_mv)))

    def test_increasing_current_increases_spikes(self):
        low = simulate_lif(current_na=1.0)
        high = simulate_lif(current_na=4.0)
        self.assertGreater(len(high.spike_times_ms), len(low.spike_times_ms))

    def test_refractory_period(self):
        result = simulate_lif(current_na=5.0, refractory_ms=3.0)
        if len(result.spike_times_ms) >= 2:
            self.assertTrue(np.all(np.diff(result.spike_times_ms) > 3.0))

    def test_invalid_parameters(self):
        with self.assertRaises(ValueError):
            simulate_lif(tau_ms=0)


if __name__ == "__main__":
    unittest.main()
