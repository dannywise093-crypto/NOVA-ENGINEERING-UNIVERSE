import math
import unittest

from server import simulate_beam


BASE = {
    "lengthM": 1.0,
    "forceN": 100.0,
    "elasticModulusPa": 200_000_000_000.0,
    "secondMomentOfAreaM4": 1e-6,
    "sectionModulusM3": 1e-5,
    "allowableStressPa": 150_000_000.0,
}


class BeamSimulationTests(unittest.TestCase):
    def test_known_case_matches_hand_calculation(self):
        result = simulate_beam(BASE)
        self.assertEqual(result["status"], "completed")
        values = result["resultsSI"]
        self.assertTrue(math.isclose(values["tipDeflectionM"], 1 / 6000, rel_tol=1e-12))
        self.assertTrue(math.isclose(values["rootBendingMomentNm"], 100.0, rel_tol=1e-12))
        self.assertTrue(math.isclose(values["rootBendingStressPa"], 10_000_000.0, rel_tol=1e-12))
        self.assertTrue(math.isclose(values["factorOfSafetyAgainstSuppliedAllowable"], 15.0, rel_tol=1e-12))
        self.assertIn("not finite-element analysis", " ".join(result["limitations"]).lower())

    def test_zero_load_has_zero_response_and_no_division_by_zero(self):
        result = simulate_beam({**BASE, "forceN": 0.0})
        values = result["resultsSI"]
        self.assertEqual(values["tipDeflectionM"], 0.0)
        self.assertEqual(values["rootBendingMomentNm"], 0.0)
        self.assertEqual(values["rootBendingStressPa"], 0.0)
        self.assertIsNone(values["factorOfSafetyAgainstSuppliedAllowable"])

    def test_rejects_missing_values(self):
        with self.assertRaisesRegex(ValueError, "forceN"):
            simulate_beam({k: v for k, v in BASE.items() if k != "forceN"})

    def test_rejects_boolean_as_number(self):
        with self.assertRaisesRegex(ValueError, "lengthM"):
            simulate_beam({**BASE, "lengthM": True})

    def test_rejects_nan_and_out_of_range_inputs(self):
        for value in (float("nan"), float("inf"), -1.0, 11.0):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    simulate_beam({**BASE, "lengthM": value})

    def test_rejects_non_object_params(self):
        with self.assertRaisesRegex(ValueError, "params must be an object"):
            simulate_beam([])


if __name__ == "__main__":
    unittest.main()
