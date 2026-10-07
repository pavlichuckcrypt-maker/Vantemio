"""Pure authored-plan handoff; no admission, inference or production writes."""
import copy
import hashlib
import json
import math
from decimal import Decimal


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
        separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def plan_worker_fields(plan):
    author = plan.get('source_author', {})
    route = plan.get('sound_route', {})
    if (plan.get('schema') != 'aim.film.sound_plan/v1'
            or plan.get('release_allowed') is not False
            or author.get('sound_matrix') is not True
            or route.get('model', {}).get('engine') != 'local:audioldm_48k'
            or route.get('role') not in ('isolated_sfx', 'texture')
            or route.get('generation_authorized') is not False
            or route.get('release_allowed') is not False
            or route.get('speech_review_required') is not False):
        raise ValueError('audioldm_authored_matrix_plan_required')
    need = author['need']
    identity = need['identity']
    hashes = plan['input_hashes']
    repair = plan['source_repair']
    need_hash = digest(need)
    if (hashes.get('sound_route') != digest(route)
            or route.get('route_id') != digest({k:v for k,v in route.items() if k != 'route_id'})
            or hashes.get('source_need') != need_hash
            or route.get('source_need_sha256') != need_hash
            or repair.get('source_need_sha256') != need_hash
            or hashes.get('source_proposal') != route.get('source_proposal_sha256')
            or hashes.get('assembly') != identity.get('input_plan_sha256')
            or hashes.get('prepared') != identity.get('prepared_sha256')
            or need.get('task_id') != digest(identity)
            or route.get('film_id') != plan.get('film_id')
            or identity.get('film_id') != plan.get('film_id')
            or route.get('scene_id') != identity.get('scene_id')
            or route.get('source_scope_id') != need.get('source_scope_id')):
        raise ValueError('audioldm_authored_identity_changed')
    window = identity['action_window']
    start, end = window['start_sample'], window['end_sample']
    if (type(start) is not int or type(end) is not int
            or start < 0 or end <= start or start % 2000 or end % 2000
            or route.get('action_window') != window
            or repair.get('scene_id') != identity['scene_id']
            or type(repair.get('start_sample')) is not int
            or type(repair.get('end_sample')) is not int
            or repair['start_sample'] != start or repair['end_sample'] != end
            or route.get('master_sample_rate') != 48000 or route.get('timeline_fps') != 24):
        raise ValueError('audioldm_authored_action_binding_changed')
    cues = plan.get('cues', [])
    if len(cues) != 1:
        raise ValueError('audioldm_authored_single_cue_required')
    cue = cues[0]
    seconds = cue.get('seconds')
    if type(seconds) not in (int, float) or not Decimal(str(seconds)).is_finite():
        raise ValueError('audioldm_authored_duration_invalid')
    samples = Decimal(str(seconds)) * 48000
    if (samples != samples.to_integral_value() or not end-start <= samples <= 480000
            or Decimal(str(seconds)) != Decimal(str(need['author_form']['seconds']))):
        raise ValueError('audioldm_authored_duration_invalid')
    acquisition = need.get('source_acquisition')
    if plan.get('source_acquisition') != acquisition:
        raise ValueError('audioldm_authored_acquisition_changed')
    if acquisition is not None and (acquisition.get('native_binding_frames') != (end-start)//2000
            or acquisition.get('source_frames') * 2000 != samples
            or acquisition.get('retime_allowed') is not False):
        raise ValueError('audioldm_authored_acquisition_changed')
    seed = cue.get('seed')
    if (cue.get('track') != 'foley' or type(seed) is not int or not 0 <= seed < 2**63
            or seed != int(need['source_scope_id'][:15], 16)
            or any(not isinstance(cue.get(k), str) or not cue[k].strip()
                   for k in ('prompt', 'negative'))):
        raise ValueError('audioldm_authored_cue_invalid')
    duration = Decimal(str(seconds))
    duration = int(duration) if duration == duration.to_integral_value() else float(duration)
    return {'prompt':cue['prompt'], 'seed':seed, 'duration_s':duration,
        'authored_constraints':{'negative':cue['negative'],
            'model_negative_conditioning_supported':False},
        'scene_sound_binding':{'film_id':plan['film_id'], 'scene_id':identity['scene_id'],
            'source_need_sha256':need_hash, 'route_sha256':digest(route),
            'placement_start_sample':start, 'output_samples':end-start,
            'generated_samples_required':int(samples), 'source_in_sample':0,
            'retime_allowed':False, 'source_acquisition':copy.deepcopy(acquisition)}}


def crop_event_pcm(pcm, binding):
    """Extract PCM24 mono without resampling, stretching or padding."""
    start = binding.get('source_in_sample')
    count = binding.get('output_samples')
    required = binding.get('generated_samples_required')
    placement = binding.get('placement_start_sample')
    if (type(pcm) is not bytes or len(pcm) % 3
            or any(type(v) is not int for v in (start, count, required, placement))
            or start < 0 or count <= 0 or required <= 0 or placement < 0
            or any(v % 2000 for v in (start, count, placement))
            or start + count > required or len(pcm) != required * 3
            or binding.get('retime_allowed') is not False):
        raise ValueError('audioldm_event_pcm_binding_invalid')
    output = pcm[start*3:(start+count)*3]
    # Measure the exported integer PCM, rather than the longer acquisition
    # or floating-point model signal. The mixer receives only this window.
    peak = 0
    squares = 0
    for offset in range(0, len(output), 3):
        value = int.from_bytes(output[offset:offset+3], 'little', signed=True)
        peak = max(peak, abs(value))
        squares += value * value
    return output, {'schema':'aim.audio.audioldm_event_crop/v1',
        'input_pcm_sha256':hashlib.sha256(pcm).hexdigest(),
        'output_pcm_sha256':hashlib.sha256(output).hexdigest(),
        'input_samples':required, 'output_samples':count,
        'source_in_sample':start, 'placement_start_sample':placement,
        'sample_rate':48000, 'channels':1, 'sample_width':3,
        'binding_sha256':digest(binding), 'retime_applied':False,
        'output_measurement':{'scope':'exported_pcm24_mono_window',
            'samples':count, 'peak_pcm24':peak, 'sum_squared_pcm24':squares,
            'peak':peak / 8388608, 'rms':math.sqrt(squares / count) / 8388608,
            'quality_approved':False}}
