"""Time-varying input, and agreement with exact results for the LIF neuron."""

import math
import unittest

import numpy as np

from neuron import simulate_lif

TAU, THETA, REST, RESET, R = 20.0, -50.0, -65.0, -70.0, 10.0


def analytic_rate(current_na, t_ref=3.0):
    drive = R * current_na + REST
    if drive <= THETA:
        return 0.0
    return 1000.0 / (t_ref + TAU * math.log((drive - RESET) / (drive - THETA)))


def analytic_first_spike(current_na):
    ri = R * current_na
    return TAU * math.log(ri / (ri - (THETA - REST)))


class TestTimeVaryingInput(unittest.TestCase):
    def test_constant_array_matches_constant_number(self):
        number = simulate_lif(current_na=2.5)
        trace = simulate_lif(current_na=np.full(len(number.time_ms), 2.5))
        np.testing.assert_array_equal(number.voltage_mv, trace.voltage_mv)
        np.testing.assert_array_equal(number.spike_times_ms, trace.spike_times_ms)

    def test_wrong_length_trace_is_rejected(self):
        with self.assertRaises(ValueError):
            simulate_lif(current_na=np.zeros(10))

    def test_no_spikes_before_a_step_starts(self):
        t = np.arange(2001) * 0.1
        result = simulate_lif(current_na=np.where(t >= 100.0, 3.0, 0.0))
        self.assertGreater(len(result.spike_times_ms), 0)
        self.assertTrue(np.all(result.spike_times_ms > 100.0))

    def test_two_close_pulses_sum_but_far_pulses_do_not(self):
        t = np.arange(2001) * 0.1

        def two_pulses(gap):
            on = lambda s: (t >= s) & (t < s + 5.0)
            return np.where(on(40.0) | on(40.0 + gap), 5.0, 0.0)

        self.assertEqual(len(simulate_lif(current_na=two_pulses(10.0)).spike_times_ms), 1)
        self.assertEqual(len(simulate_lif(current_na=two_pulses(30.0)).spike_times_ms), 0)


class TestExactMethod(unittest.TestCase):
    def test_rheobase(self):
        # (θ − V_rest) / R = 15 mV / 10 MΩ = 1.5 nA
        self.assertEqual(len(simulate_lif(current_na=1.49, duration_ms=2000).spike_times_ms), 0)
        self.assertGreater(len(simulate_lif(current_na=1.51, duration_ms=2000).spike_times_ms), 0)

    def test_first_spike_time_is_exact(self):
        for current in (1.8, 2.5, 5.0):
            for dt in (1.0, 0.1):
                spike = simulate_lif(current_na=current, dt_ms=dt, duration_ms=100).spike_times_ms[0]
                self.assertAlmostEqual(spike, analytic_first_spike(current), places=9)

    def test_firing_rate_matches_formula(self):
        for current in (1.6, 2.0, 2.5, 5.0, 15.0):
            for t_ref in (0.0, 3.0):
                spikes = simulate_lif(current_na=current, refractory_ms=t_ref, duration_ms=2000).spike_times_ms
                rate = 1000.0 / np.mean(np.diff(spikes))
                self.assertAlmostEqual(rate, analytic_rate(current, t_ref), places=6)

    def test_refractory_period_is_not_rounded_to_the_grid(self):
        # Regression: ceil(3.4 / 0.01) used to give 341 steps instead of 340.
        for t_ref in (0.3, 1.2, 3.4):
            spikes = simulate_lif(current_na=8.0, refractory_ms=t_ref, dt_ms=0.01, duration_ms=100).spike_times_ms
            expected = 1000.0 / analytic_rate(8.0, t_ref)
            np.testing.assert_allclose(np.diff(spikes), expected, atol=1e-9)

    def test_zero_refractory_period_is_really_zero(self):
        spikes = simulate_lif(current_na=5.0, refractory_ms=0.0, duration_ms=200).spike_times_ms
        self.assertAlmostEqual(np.diff(spikes)[0], 1000.0 / analytic_rate(5.0, 0.0), places=9)

    def test_voltage_never_exceeds_threshold(self):
        result = simulate_lif(current_na=20.0, duration_ms=200)
        self.assertLess(result.voltage_mv.max(), THETA)


class TestEuler(unittest.TestCase):
    def test_error_is_first_order(self):
        exact = analytic_first_spike(2.5)
        errors = [
            abs(simulate_lif(current_na=2.5, dt_ms=dt, duration_ms=60, method="euler").spike_times_ms[0] - exact)
            for dt in (1.0, 0.1, 0.01)
        ]
        # Ten times smaller dt, about ten times smaller error.
        self.assertAlmostEqual(errors[0] / errors[1], 10.0, delta=0.5)
        self.assertAlmostEqual(errors[1] / errors[2], 10.0, delta=0.5)

    def test_unknown_method_is_rejected(self):
        with self.assertRaises(ValueError):
            simulate_lif(method="rk4")


if __name__ == "__main__":
    unittest.main()
