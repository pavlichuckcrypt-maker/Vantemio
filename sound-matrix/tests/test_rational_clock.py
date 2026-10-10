import copy
import unittest

from vantemio_sound_matrix.author import source_acquisition_clock
from vantemio_sound_matrix.clock import frame_sample, sample_frame


class RationalSourceTiming(unittest.TestCase):
    def test_provider_minimum_does_not_extend_the_visible_action(self):
        window = {'start_sample': 0, 'end_sample': 8008,
                  'timeline_fps': '30000/1001'}
        original = copy.deepcopy(window)
        acquisition = source_acquisition_clock(window)
        self.assertEqual(window, original)
        self.assertEqual(acquisition['native_binding_frames'], 5)
        self.assertEqual(acquisition['source_frames'], 30)
        self.assertEqual(acquisition['source_seconds'], 1.001)
        self.assertTrue(acquisition['trim_required'])
        self.assertFalse(acquisition['retime_allowed'])
        self.assertTrue(acquisition['temporal_source_review_required'])

    def test_non_integral_sample_boundary_is_rejected(self):
        with self.assertRaises(ValueError):
            frame_sample(1, '30000/1001')
        with self.assertRaises(ValueError):
            sample_frame(8009, '30000/1001')

    def test_decimal_rate_does_not_silently_become_ntsc(self):
        with self.assertRaises(ValueError):
            source_acquisition_clock({'start_sample': 0, 'end_sample': 8008,
                                      'timeline_fps': 29.97})

    def test_integer_rate_keeps_existing_source_contract(self):
        result = source_acquisition_clock({'start_sample': 0,
                                           'end_sample': 2000})
        self.assertEqual(result['native_binding_frames'], 1)
        self.assertEqual(result['source_frames'], 24)
        self.assertNotIn('timeline_fps', result)


if __name__ == '__main__':
    unittest.main()
