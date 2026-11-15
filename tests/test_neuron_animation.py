
"""Unit tests for the NeuroVerse neuron animation."""

import unittest

from neuron_animation import make_neuron_animation


class TestNeuronAnimation(unittest.TestCase):

    def test_no_spikes_renders_empty_event_list(self):
        html = make_neuron_animation([], duration_ms=200)

        self.assertIn("const spikes = [];", html)
        self.assertIn("0</b> recorded spike(s)", html)

    def test_simulated_spikes_and_speed_reach_animation(self):
        html = make_neuron_animation(
            [25, 75],
            duration_ms=100,
            playback_speed=1.5,
        )

        self.assertIn("const spikes = [25.0, 75.0];", html)
        self.assertIn("const duration = 100.0;", html)
        self.assertIn("const speed = 1.5;", html)
        self.assertIn("2</b> recorded spike(s)", html)

    def test_invalid_animation_inputs_are_rejected(self):
        invalid_cases = [
            {"spike_times_ms": [-1], "duration_ms": 200},
            {"spike_times_ms": [201], "duration_ms": 200},
            {"spike_times_ms": [float("nan")], "duration_ms": 200},
            {"spike_times_ms": [], "duration_ms": 0},
            {"spike_times_ms": [], "duration_ms": 200, "playback_speed": 0},
            {
                "spike_times_ms": [],
                "duration_ms": 200,
                "playback_speed": float("inf"),
            },
        ]

        for case in invalid_cases:
            with self.subTest(case=case):
                with self.assertRaises(ValueError):
                    make_neuron_animation(**case)


if __name__ == "__main__":
    unittest.main()
