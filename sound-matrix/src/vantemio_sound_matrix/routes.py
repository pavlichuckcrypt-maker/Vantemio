from fractions import Fraction
import copy
import hashlib
import json
import math
import re
from decimal import Decimal
MODELS = {'synchronized_motion': {'engine': 'local:mmaudio', 'native_rates': [16000, 44100], 'conditioning': 'video_and_text', 'license': 'CC-BY-NC-4.0', 'commercial_qualified': False, 'source': 'https://github.com/hkchengrex/MMAudio'}, 'isolated_sfx': {'engine': 'local:audioldm_48k', 'native_rates': [48000], 'conditioning': 'text', 'max_seconds': 10, 'license': 'code CC-BY-NC-SA-4.0; weights CC-BY-NC-4.0', 'commercial_qualified': False, 'source': 'https://github.com/haoheliu/AudioLDM2'}, 'texture': {'engine': 'local:audioldm_48k', 'native_rates': [48000], 'conditioning': 'text', 'max_seconds': 10, 'license': 'code CC-BY-NC-SA-4.0; weights CC-BY-NC-4.0', 'commercial_qualified': False, 'source': 'https://github.com/haoheliu/AudioLDM2'}, 'atmosphere': {'engine': 'local:stable-audio-open-1.0', 'native_rates': [44100], 'conditioning': 'text', 'max_seconds': 47, 'license': 'Stability model license; qualify selected weights', 'commercial_qualified': False, 'source': 'https://huggingface.co/stabilityai/stable-audio-open-1.0'}, 'music': {'engine': 'local:ace-step-1.5-turbo', 'native_rates': [48000], 'conditioning': 'music_plan', 'license': 'MIT; qualify dependencies', 'commercial_qualified': False, 'source': 'https://github.com/ace-step/ACE-Step-1.5'}}

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()).hexdigest()

def _sha(value):
    if not isinstance(value, str) or not re.fullmatch('[0-9a-f]{64}', value):
        raise ValueError('sound_route_hash_required')
    return value

def generated_effect_diagnostic_tasks(engine):
    """Fixed PCM checks for the two generated-effect providers.

    Readiness and generation admission remain separate. A filename, prompt or
    caller-supplied speech flag must not select the diagnostic policy.
    """
    if engine not in ('local:mmaudio', 'local:audioldm_48k'):
        raise ValueError('generated_effect_engine_required')
    return ('sound_events', 'sound_event_timing')

def motion_model_context(start, count, scene_start, scene_count, fps=24, *, preferred_seconds=None):
    """Propose whole-second model input; retain the original action crop.

    CLIP 8 Hz and sync 25 Hz share a whole-second model clock.
    Expanding context does not authorize stretching video or placing its
    entire generated audio on the timeline. The adapter must crop exactly.
    """
    if any((type(v) is not int for v in (start, count, scene_start, scene_count))) or scene_start < 0 or count <= 0 or (scene_count <= 0) or (not scene_start <= start < start + count <= scene_start + scene_count):
        raise ValueError('motion_video_model_context_clock_invalid')
    from .clock import project_rate, frame_sample
    rate = project_rate(fps)
    block = rate.numerator
    length = (count + block - 1) // block * block
    if length > scene_count:
        raise ValueError('motion_video_model_context_unavailable_inside_scene')
    if preferred_seconds is not None:
        if type(preferred_seconds) is not int or preferred_seconds < 1:
            raise ValueError('motion_video_preferred_context_invalid')
        available = scene_count // block * block
        preferred = int(rate * preferred_seconds) // block * block
        if preferred < length:
            raise ValueError('motion_video_preferred_context_cannot_cover_event')
        length = max(length, min(preferred, available))
    left = max(scene_start, min(start - (length - count) // 2, scene_start + scene_count - length))
    result = {'source_start_frame': left, 'duration_frames': length, 'generated_samples': frame_sample(length, fps), 'crop_start_sample': frame_sample(start - left, fps), 'crop_samples': frame_sample(count, fps), 'scene_start_frame': scene_start, 'scene_duration_frames': scene_count, 'retime_allowed': False, 'padding_allowed': False, 'status': 'proposal_requires_qualified_adapter_and_exact_audio_crop'}
    if preferred_seconds is not None:
        result['preferred_context_seconds'] = preferred_seconds
    return result

def plan_route(need, proposal, decision):
    """Compile a non-executable route from an existing source need/proposal.

No prompt matching or filename heuristics classify sound. The semantic author
explicitly selects a role, depth and reason against the scene evidence. A route
change cannot reset the original scene's one-initial/one-correction budget.
"""
    if need.get('schema') != 'aim.scene_sound.source_need/v1' or proposal.get('schema') != 'aim.scene_sound.source_proposal/v1' or need.get('generation_authorized') is not False or (proposal.get('generation_authorized') is not False):
        raise ValueError('sound_route_existing_source_contract_required')
    identity = need['identity']
    from .author import digest as source_digest, sample
    if need['task_id'] != source_digest(identity) or proposal['source_need_sha256'] != source_digest(need) or proposal['film_id'] != identity['film_id'] or (proposal['scene_id'] != identity['scene_id']) or (proposal['source_scope_id'] != need['source_scope_id']):
        raise ValueError('sound_route_scene_provenance_changed')
    if not isinstance(decision, dict) or set(decision) != {'role', 'depth', 'reason', 'existing_source'} or decision['depth'] not in ('foreground', 'midground', 'background') or (not isinstance(decision['reason'], str)) or (not 10 <= len(decision['reason'].strip()) <= 2000):
        raise ValueError('sound_route_closed_author_form_required')
    role = decision['role']
    if role not in {*MODELS, 'existing_good_sfx'}:
        raise ValueError('sound_route_unsupported_role')
    if role == 'music':
        raise ValueError('sound_route_music_requires_existing_music_plan_not_foley_need')
    window = identity['action_window']
    from .clock import project_rate, sample_frame
    fps = window.get('timeline_fps', 24)
    start, end = (window['start_sample'], window['end_sample'])
    if type(start) is not int or type(end) is not int or start < 0 or (end <= start):
        raise ValueError('sound_route_native24_clock_required')
    sample_frame(start, fps)
    sample_frame(end, fps)
    existing = decision['existing_source']
    if role == 'existing_good_sfx':
        if not isinstance(existing, dict) or set(existing) != {'source_sha256', 'source_in_s', 'review_sha256'} or type(existing['source_in_s']) not in (int, float) or (not math.isfinite(existing['source_in_s'])) or (existing['source_in_s'] < 0):
            raise ValueError('sound_route_existing_source_required')
        _sha(existing['source_sha256'])
        _sha(existing['review_sha256'])
        offset = sample(existing['source_in_s'])
        match = False
        for candidate in identity['candidate_evidence']:
            measured = candidate['measurement']
            if measured['source_sha256'] != existing['source_sha256']:
                continue
            for review in candidate['audio_reviews']:
                row = review['window']
                if type(row['samples']) is not int or row['samples'] <= 0 or type(row['sample_rate']) is not int or (row['sample_rate'] <= 0):
                    raise ValueError('sound_route_review_pcm_clock_invalid')
                left = sample(row['start_s'])
                right = left + Fraction(row['samples'] * 48000, row['sample_rate'])
                if review['audit_sha256'] == existing['review_sha256'] and row['source_sha256'] == existing['source_sha256'] and (left <= offset < offset + end - start <= right):
                    match = True
        if not match:
            raise ValueError('sound_route_existing_source_unreviewed')
        model = {'engine': 'local:sfx-library', 'conditioning': 'reviewed_audio', 'commercial_qualified': False, 'license': 'per-asset provenance required'}
    else:
        if existing is not None:
            raise ValueError('sound_route_generation_has_existing_source')
        model = copy.deepcopy(MODELS[role])
    route = {'schema': 'aim.scene_sound.route_proposal/v1', 'film_id': identity['film_id'], 'scene_id': identity['scene_id'], 'source_scope_id': need['source_scope_id'], 'source_need_sha256': source_digest(need), 'source_proposal_sha256': source_digest(proposal), 'role': role, 'depth': decision['depth'], 'reason': decision['reason'], 'model': model, 'existing_source': copy.deepcopy(existing), 'action_window': copy.deepcopy(window), 'master_sample_rate': 48000, 'timeline_fps': fps, 'installed_readiness': 'unverified', 'listening_approved': False, 'resample_is_quality_gain': False, 'retime_allowed': False, 'attempt_budget': {'initial': 1, 'targeted_correction': 1, 'authority': 'existing_Station_source_scope'}, 'generation_authorized': False, 'release_allowed': False, 'required_checks': (['Station_existing_asset_resolution_and_placement_admission', 'reviewed_asset_bytes_and_exact_source_interval'] if role == 'existing_good_sfx' else ['Station_model_and_resource_admission', 'pinned_weights_code_and_dependencies']) + ['asset_license_qualification', 'audio_specialist_sound_events' if role in ('synchronized_motion', 'isolated_sfx', 'texture') else 'audio_specialist_speech_and_sound_events', 'action_sync_and_depth', 'voice_ducking_and_complete_scene_mix', 'native_MLT_consumer_readback']}
    if role in ('synchronized_motion', 'isolated_sfx', 'texture'):
        route['speech_review_required'] = False
        route['diagnostic_tasks'] = list(generated_effect_diagnostic_tasks(model['engine']))
    if role == 'synchronized_motion':
        route['video_condition'] = {'source_sha256': _sha(window['source_sha256']), 'action_window': copy.deepcopy(window)}
    if model.get('max_seconds') and end - start > model['max_seconds'] * 48000:
        route['status'] = 'needs_authored_segment_boundaries'
    else:
        route['status'] = 'needs_Station_capability_admission'
    return dict(route, route_id=digest(route))

def routing_author_contract(need):
    """Closed Qwen form; does not ask a text model to listen or set timing."""
    schema = {'type': 'object', 'additionalProperties': False, 'properties': {'role': {'enum': [r for r in MODELS if r != 'music'] + ['existing_good_sfx']}, 'depth': {'enum': ['foreground', 'midground', 'background']}, 'reason': {'type': 'string'}, 'existing_source': {'anyOf': [{'type': 'null'}, {'type': 'object', 'additionalProperties': False, 'properties': {'source_sha256': {'type': 'string'}, 'source_in_s': {'type': 'number'}, 'review_sha256': {'type': 'string'}}, 'required': ['source_sha256', 'source_in_s', 'review_sha256']}]}}, 'required': ['role', 'depth', 'reason', 'existing_source']}
    return {'schema': schema, 'prompt': 'Select the sound role for this exact scene action from independent evidence. You do not hear audio. Prefer a matching reviewed existing source, including good original cloud footage audio. Select synchronized_motion for sound whose timing follows visible motion; isolated_sfx for a discrete effect; texture for a separate continuous texture; atmosphere for the environment. Camera movement alone is not a physical sound event. A static statue, museum cast, photograph or diagram does not perform the action it depicts. Do not invent engines, footsteps, impacts or historical action around stationary objects. For an infographic, synchronized effects require its authored graphic event and timing evidence; decorative sound is not evidence of a physical event. If the available observations do not support a specific acoustic source, use author.needs_context in the combined form rather than a generic prompt asking for sounds of visible movements. Score belongs to the separate existing music-plan/ACE-Step branch, never this foley obligation. Depth describes the source position in the scene, not a fixed gain. Do not approve sound quality, invent material, alter action timing, request speech or reset generation attempts. Return only the exact JSON form.\n' + json.dumps({'schema': schema, 'source_need': need}, ensure_ascii=False)}

def routed_author_contract(need):
    """One existing local-editor decision supplies both acoustic text and route."""
    from .author import source_author_contract
    acoustic = source_author_contract(need)
    routing = routing_author_contract(need)
    schema = {'type': 'object', 'additionalProperties': False, 'properties': {'author': acoustic['schema'], 'routing': {'anyOf': [{'type': 'null'}, routing['schema']]}}, 'required': ['author', 'routing']}
    acoustic_rules = acoustic['prompt'].split('Return only ', 1)[0]
    routing_rules = routing['prompt'].split('Return only ', 1)[0]
    return {'schema': schema, 'prompt': acoustic_rules + '\n' + routing_rules + '\nReturn a single object with author and routing. When author.decision is needs_context, routing must be null. Otherwise fill both forms. This is a proposal, never generation permission.\n' + json.dumps({'output_schema': schema}, ensure_ascii=False) + '\nCONTEXT:\n' + json.dumps(acoustic['context'], ensure_ascii=False)}

def compile_routed_author_answer(need, answer):
    from .author import compile_source_proposal, compile_routed_source_proposal
    if not isinstance(answer, dict) or set(answer) != {'author', 'routing'}:
        raise ValueError('sound_route_combined_closed_form_required')
    proposal = compile_source_proposal(need, answer['author'])
    if proposal['status'] == 'needs_context':
        if answer['routing'] is not None:
            raise ValueError('sound_route_unresolved_has_routing')
        return proposal
    return compile_routed_source_proposal(need, answer['author'], answer['routing'])
