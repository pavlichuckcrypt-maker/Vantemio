import copy
import hashlib
import json
import math
import re
from decimal import Decimal
from .routes import digest

def source_acquisition_frames(native_binding_frames):
    if type(native_binding_frames) is not int or native_binding_frames < 1 or native_binding_frames > 1128:
        raise ValueError
    return 24 if native_binding_frames <= 23 else native_binding_frames

def source_acquisition_clock(window):
    """Source-only minimum; never widen the immutable native action interval."""
    start,end=window['start_sample'],window['end_sample']
    if (type(start)is not int or type(end)is not int or start<0 or end<=start
            or start%2000 or end%2000):
        raise ValueError('source acquisition native24 action clock required')
    frames=(end-start)//2000;source_frames=source_acquisition_frames(frames)
    return {'schema':'aim.scene_sound.source_acquisition/v1',
        'native_binding_frames':frames,'source_frames':source_frames,
        'source_seconds':source_frames/24,'trim_required':source_frames!=frames,
        'retime_allowed':False,'temporal_source_review_required':True}

def source_author_contract(need):
    """Closed text-author form; timing and filenames stay code-owned."""
    if (need['task_id'] != digest(need['identity']) or not need.get('existing_director_binding')
            or need.get('generation_authorized') is not False):
        raise ValueError('source_author_bound_need_required')
    identity=need['identity']
    seconds=(identity['action_window']['end_sample']-identity['action_window']['start_sample'])/48000
    acquisition=need.get('source_acquisition')
    if acquisition is not None:
        if acquisition!=source_acquisition_clock(identity['action_window']):
            raise ValueError('source_author_acquisition_clock_changed')
        seconds=acquisition['source_seconds']
    elif seconds<1:
        raise ValueError('source_author_subsecond_acquisition_required')
    if (need['observed_event']!=identity['event'] or need['uncertainties']!=identity['uncertainties']
            or need['source_scope_id']!=digest({'film_id':identity['film_id'],
                'scene_id':identity['scene_id'],'action_window':identity['action_window'],'event':identity['event']})
            or need['author_form']['seconds']!=seconds):
        raise ValueError('source_author_evidence_or_clock_changed')
    def branch(decision):
        properties={'decision':{'enum':[decision]},
            'prompt':{'type':'string'} if decision=='request_source' else {'enum':[None]},
            'negative':{'type':'string'} if decision=='request_source' else {'enum':[None]},
            'reason':{'type':'string'}}
        return {'type':'object','properties':properties,'required':list(properties),'additionalProperties':False}
    # Native llama grammar rejected nullable string bounds. Keep branches in
    # the proven grammar subset; enforce lengths and combinations below.
    schema={'anyOf':[branch('request_source'),branch('needs_context')]}
    context={'need':need,'scope':'acoustic_source_design_from_independent_evidence_not_listening'}
    acquisition_instruction=(' The source acquisition is longer than the visible action. Design one brief gesture; '
        'extra source handles never authorize extra actions, placement extension or retiming. '
        'Native temporal source review and trimming are still required. ' if acquisition else '')
    prompt=('Fill the exact JSON form for one missing foley source. You do not hear audio. '
        'Use the actual observed movement, uncertainties, independently measured audio and '
        'relative audio-model comparisons. Do not infer material or sound from asset names. '
        'Design only the supported broad movement texture; do not invent punctures, impacts, '
        'knot completion, fire or speech. No music or narration. Code owns duration, seed, '
        'filename and placement: do not put generation settings into the acoustic prompt. '
        'Write the acoustic prompt and explicit exclusions in English. If evidence is insufficient, '
        'choose needs_context and set prompt and negative to null. No quality approval. '
        +acquisition_instruction+'Return only '+json.dumps(schema)+'\nCONTEXT:\n'+json.dumps(context,ensure_ascii=False))
    return {'schema':schema,'prompt':prompt,'context':context}
def compile_source_proposal(need, answer):
    source_author_contract(need)
    if (not isinstance(answer,dict) or set(answer)!={'decision','prompt','negative','reason'}
            or not isinstance(answer['reason'],str) or not 10<=len(answer['reason'].strip())<=2000):
        raise ValueError('source_author_closed_form_required')
    if answer['decision']=='needs_context':
        if answer['prompt'] is not None or answer['negative'] is not None:
            raise ValueError('source_author_unresolved_has_prompt')
        return {'status':'needs_context','task_id':need['task_id'],'reason':answer['reason'],
                'generation_authorized':False,'release_allowed':False}
    if (answer['decision']!='request_source'
            or not isinstance(answer['prompt'],str) or not 20<=len(answer['prompt'].strip())<=2000
            or not isinstance(answer['negative'],str) or not 10<=len(answer['negative'].strip())<=2000):
        raise ValueError('source_author_acoustic_fields_required')
    scope=need['source_scope_id']
    # Deliberately not aim.film.sound_plan/v1: the generation adapter must not
    # dispatch a proposal before native attempt admission and author provenance.
    proposal={'schema':'aim.scene_sound.source_proposal/v1','film_id':need['identity']['film_id'],
        'scene_id':need['identity']['scene_id'],'source_scope_id':scope,
        'source_need_sha256':digest(need),'author_answer_sha256':digest(answer),
        'cue':{'name':'scene_foley_'+scope[:16]+'.wav','track':'foley',
            'seconds':need['author_form']['seconds'],'seed':int(scope[:15],16),
            'prompt':answer['prompt'],'negative':answer['negative']},
        'reason':answer['reason'],'status':'needs_native_attempt_admission',
        'generation_authorized':False,'release_allowed':False}
    if need.get('source_acquisition') is not None:
        proposal['source_acquisition']=copy.deepcopy(need['source_acquisition'])
    return proposal

def compile_routed_source_proposal(need, answer, routing_decision):
    """Existing local author plus scene-bound multi-engine planning; no launch."""
    from .routes import plan_route
    proposal = compile_source_proposal(need, answer)
    if proposal['status'] != 'needs_native_attempt_admission':
        return proposal
    return {'source_proposal': proposal,
            'route_proposal': plan_route(need, proposal, routing_decision),
            'generation_authorized': False, 'release_allowed': False}
