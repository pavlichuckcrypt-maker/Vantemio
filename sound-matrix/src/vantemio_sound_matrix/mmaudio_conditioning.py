"""Exact native24 picture window for the existing MMAudio executor.

No queue, model admission or inference lives here. The caller retains its
original attempt identity. Internal model sampling never changes the picture.
"""
import hashlib
import copy
import json
from fractions import Fraction
from pathlib import Path


def plan_worker_fields(plan):
    """Serialize an existing authored matrix plan; this grants no admission."""
    def digest(value):
        return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,
            separators=(',',':')).encode()).hexdigest()
    route=plan.get('sound_route',{})
    binding=plan.get('video_condition_binding',{})
    hashes=plan.get('input_hashes',{})
    if (plan.get('schema')!='aim.film.sound_plan/v1'
            or plan.get('release_allowed') is not False
            or plan.get('source_author',{}).get('sound_matrix') is not True
            or route.get('model',{}).get('engine')!='local:mmaudio'
            or route.get('role')!='synchronized_motion'
            or route.get('generation_authorized') is not False
            or route.get('release_allowed') is not False
            or route.get('film_id')!=plan.get('film_id')):
        raise ValueError('mmaudio_authored_matrix_plan_required')
    if (hashes.get('sound_route')!=digest(route)
            or hashes.get('video_condition_binding')!=digest(binding)
            or route.get('route_id')!=digest({k:v for k,v in route.items() if k!='route_id'})):
        raise ValueError('mmaudio_authored_matrix_hash_changed')
    _,context=context_binding(binding)
    repair=plan['source_repair'];window=route['action_window']
    if (any(type(window.get(k)) is not int for k in ('start_sample','end_sample'))
            or any(type(repair.get(k)) is not int for k in ('start_sample','end_sample'))
            or window['start_sample']<0 or window['end_sample']<=window['start_sample']
            or repair['scene_id']!=route['scene_id']
            or repair['start_sample']!=window['start_sample']
            or repair['end_sample']!=window['end_sample']
            or binding.get('placement_start_sample')!=window['start_sample']
            or type(binding.get('placement_start_sample')) is not int
            or binding['source_start_frame']*2000!=window['start_sample']
            or binding['output_samples']!=window['end_sample']-window['start_sample']
            or binding['source']['sha256']!=window['source_sha256']
            or binding.get('route_sha256')!=hashes['sound_route']
            or binding.get('source_need_sha256')!=route.get('source_need_sha256')
            or binding.get('generation_authorized') is not False
            or binding.get('release_allowed') is not False):
        raise ValueError('mmaudio_authored_action_binding_changed')
    cues=plan.get('cues')
    if not isinstance(cues,list) or len(cues)!=1:
        raise ValueError('mmaudio_single_authored_cue_required')
    cue=cues[0]
    if (cue.get('track')!='foley' or type(cue.get('seed')) is not int
            or not 0<=cue['seed']<2**63
            or any(not isinstance(cue.get(k),str) or not cue[k].strip() for k in ('prompt','negative'))):
        raise ValueError('mmaudio_authored_cue_required')
    return {'video':{'path':binding['source']['output'],
            'sha256':binding['source']['sha256']},
        'video_condition_binding':copy.deepcopy(binding),
        'duration_s':context['duration_frames']//24,
        'prompt':cue['prompt'],'negative_prompt':cue['negative'],'seed':cue['seed']}


def sha(path):
    value=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda:stream.read(8*1024*1024),b''):
            value.update(block)
    return value.hexdigest()


def decode_window(binding):
    """Decode only the half-open frame interval; reject changed/irregular video."""
    if (binding.get('schema')!='aim.scene_sound.motion_video_binding/v1'
            or binding.get('fps')!=24 or binding.get('sample_rate')!=48000
            or binding.get('retime_allowed') is not False):
        raise ValueError('mmaudio_native_window_contract_required')
    start=binding['source_start_frame']; count=binding['duration_frames']
    if (type(start) is not int or type(count) is not int or start<0 or count<=0
            or binding['output_samples']!=count*2000
            or type(binding['output_samples']) is not int):
        raise ValueError('mmaudio_native_window_clock_invalid')
    source=binding['source']; path=Path(source['output'])
    if sha(path)!=source['sha256']:
        raise ValueError('mmaudio_conditioning_picture_changed')
    import av
    frames=[]
    with av.open(str(path)) as container:
        stream=container.streams.video[0]
        if stream.guessed_rate!=Fraction(24,1):
            raise ValueError('mmaudio_conditioning_native24_required')
        stream.thread_count=2
        for index,frame in enumerate(container.decode(stream)):
            if index>=start+count:break
            if frame.pts is None or frame.pts*frame.time_base!=Fraction(index,24):
                raise ValueError('mmaudio_conditioning_irregular_picture_clock')
            if index>=start:
                frames.append(frame.to_ndarray(format='rgb24'))
    if len(frames)!=count:
        raise ValueError('mmaudio_conditioning_short_picture')
    if sha(path)!=source['sha256']:
        raise ValueError('mmaudio_conditioning_picture_changed')
    return frames, {'source':dict(source),'source_start_frame':start,
        'duration_frames':count,'fps':24,'native_frame_sha256':[
            hashlib.sha256(f.tobytes()).hexdigest() for f in frames],
        'retimed':False,'model_inference_called':False}


def context_binding(binding):
    """Validate the planner proposal before decoding any expanded context."""
    if (binding.get('schema')!='aim.scene_sound.motion_video_binding/v1'
            or type(binding.get('fps')) is not int or binding['fps']!=24
            or type(binding.get('sample_rate')) is not int
            or binding['sample_rate']!=48000
            or binding.get('retime_allowed') is not False):
        raise ValueError('mmaudio_native_window_contract_required')
    from .routes import motion_model_context
    context=binding['model_context_proposal']
    integers=('source_start_frame','duration_frames','generated_samples',
        'crop_start_sample','crop_samples','scene_start_frame','scene_duration_frames')
    if (not isinstance(context,dict)
            or any(type(context.get(k)) is not int for k in integers)
            or context.get('retime_allowed') is not False
            or context.get('padding_allowed') is not False
            or type(binding.get('output_samples')) is not int):
        raise ValueError('mmaudio_model_context_changed')
    expected=motion_model_context(binding['source_start_frame'],
        binding['duration_frames'],context['scene_start_frame'],
        context['scene_duration_frames'])
    if context!=expected or binding['output_samples']!=expected['crop_samples']:
        raise ValueError('mmaudio_model_context_changed')
    expanded=dict(binding,source_start_frame=context['source_start_frame'],
        duration_frames=context['duration_frames'],
        output_samples=context['generated_samples'])
    return expanded,dict(context)


def crop_context_pcm(pcm, binding, *, sample_rate, channels, sample_width):
    """Crop complete interleaved PCM without resampling, padding or retiming."""
    _,context=context_binding(binding)
    if (type(sample_rate) is not int or sample_rate!=48000
            or type(channels) is not int or channels not in (1,2)
            or type(sample_width) is not int or sample_width not in (2,3,4)
            or not isinstance(pcm,bytes)):
        raise ValueError('mmaudio_context_pcm_format_invalid')
    stride=channels*sample_width
    if len(pcm)!=context['generated_samples']*stride:
        raise ValueError('mmaudio_context_pcm_length_invalid')
    left=context['crop_start_sample']*stride
    cropped=pcm[left:left+context['crop_samples']*stride]
    return cropped,dict(context,output_samples=context['crop_samples'],
        event_source_start_frame=binding['source_start_frame'],
        event_duration_frames=binding['duration_frames'],sample_rate=sample_rate,
        channels=channels,sample_width=sample_width,
        pcm_sha256=hashlib.sha256(cropped).hexdigest(),retimed=False)


def load_video(binding, provider, *, use_model_context=False):
    """Use the pinned provider's transforms with exact, scene-relative samples."""
    if type(use_model_context) is not bool:
        raise ValueError('mmaudio_model_context_mode_invalid')
    original=binding
    if use_model_context:
        binding,context=context_binding(binding)
    frames,receipt=decode_window(binding)
    if use_model_context:
        receipt.update(event_source_start_frame=original['source_start_frame'],
            event_duration_frames=original['duration_frames'],
            model_context=context,exact_output_crop_required=True)
    import numpy as np
    torch=provider.torch; v2=provider.v2
    count=len(frames); duration=count/24
    chunks=[]; indices=[]
    for rate in (provider._CLIP_FPS,provider._SYNC_FPS):
        # Hold the frame visible at the model's timestamp, always inside the
        # approved window. Never import the next scene's boundary frame.
        length=Fraction(count,24)*Fraction(rate)
        if length.denominator!=1:
            raise ValueError('mmaudio_model_window_requires_authored_boundaries')
        chosen=[int(Fraction(i*24,1)/Fraction(rate)) for i in range(int(length))]
        chunks.append(torch.from_numpy(np.stack([frames[i] for i in chosen])).permute(0,3,1,2))
        indices.append(chosen)
    clip=v2.Compose([v2.Resize((provider._CLIP_SIZE,provider._CLIP_SIZE),
        interpolation=v2.InterpolationMode.BICUBIC),v2.ToImage(),
        v2.ToDtype(torch.float32,scale=True)])(chunks[0])
    sync=v2.Compose([v2.Resize(provider._SYNC_SIZE,interpolation=v2.InterpolationMode.BICUBIC),
        v2.CenterCrop(provider._SYNC_SIZE),v2.ToImage(),v2.ToDtype(torch.float32,scale=True),
        v2.Normalize(mean=[0.5,0.5,0.5],std=[0.5,0.5,0.5])])(chunks[1])
    receipt.update(model_sampling='visible_native_frame_at_relative_timestamp',
        clip_frame_indices=indices[0],sync_frame_indices=indices[1])
    return provider.VideoInfo(duration_sec=duration,fps=Fraction(24,1),
        clip_frames=clip,sync_frames=sync,all_frames=None),receipt
