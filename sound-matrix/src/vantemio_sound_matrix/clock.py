from fractions import Fraction

def project_rate(value):
    """Keep exact admitted rates distinct; never infer NTSC from a decimal."""
    if type(value) is not int and (not (isinstance(value, str) and value.strip() == value)):
        raise ValueError('sound_project_exact_frame_rate_required')
    try:
        rate = Fraction(value)
    except (ValueError, ZeroDivisionError):
        raise ValueError('sound_project_exact_frame_rate_required') from None
    if rate <= 0:
        raise ValueError('sound_project_exact_frame_rate_required')
    return rate

def frame_sample(frame, fps):
    if type(frame) is not int or frame < 0:
        raise ValueError('sound_frame_boundary_invalid')
    value = Fraction(frame * 48000, 1) / project_rate(fps)
    if value.denominator != 1:
        raise ValueError('sound_frame_boundary_between_pcm_samples')
    return int(value)

def sample_frame(sample, fps):
    if type(sample) is not int or sample < 0:
        raise ValueError('sound_sample_boundary_invalid')
    value = Fraction(sample, 48000) * project_rate(fps)
    if value.denominator != 1:
        raise ValueError('sound_sample_boundary_between_picture_frames')
    return int(value)
