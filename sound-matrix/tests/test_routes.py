import copy
import unittest

from vantemio_sound_matrix.author import compile_routed_source_proposal, digest
from vantemio_sound_matrix.routes import plan_route, routing_author_contract, compile_routed_author_answer, routed_author_contract


class Routes(unittest.TestCase):
    def test_generated_effect_routes_do_not_require_speech_diagnostics(self):
        for role in ('synchronized_motion', 'isolated_sfx', 'texture'):
            need, author, routing = self.fixture()
            routing['role'] = role
            route = compile_routed_source_proposal(need, author, routing)['route_proposal']
            self.assertFalse(route['speech_review_required'])
            self.assertEqual(route['diagnostic_tasks'], ['sound_events', 'sound_event_timing'])
            self.assertNotIn('audio_specialist_speech_and_sound_events', route['required_checks'])
            self.assertIn('action_sync_and_depth', route['required_checks'])
        need, author, routing = self.fixture()
        routing.update(role='existing_good_sfx', existing_source={
            'source_sha256': 'b' * 64, 'review_sha256': 'c' * 64, 'source_in_s': 0})
        route = compile_routed_source_proposal(need, author, routing)['route_proposal']
        self.assertIn('audio_specialist_speech_and_sound_events', route['required_checks'])

    def test_single_local_decision_compiles_acoustics_and_route(self):
        need, author, routing = self.fixture()
        result = compile_routed_author_answer(need, {'author': author, 'routing': routing})
        self.assertEqual(result['route_proposal']['model']['engine'], 'local:mmaudio')
        contract = routed_author_contract(need)
        self.assertEqual(contract['schema']['required'], ['author', 'routing'])
        self.assertFalse(contract['schema']['additionalProperties'])

    def test_unresolved_combined_answer_cannot_smuggle_a_route(self):
        need, author, routing = self.fixture()
        author.update(decision='needs_context', prompt=None, negative=None)
        with self.assertRaisesRegex(ValueError, 'unresolved_has_routing'):
            compile_routed_author_answer(need, {'author': author, 'routing': routing})
        result = compile_routed_author_answer(need, {'author': author, 'routing': None})
        self.assertEqual(result['status'], 'needs_context')

    def fixture(self, seconds=2):
        event = {'action': 'handling fabric', 'confidence': 'high'}
        window = {'start_sample': 48000, 'end_sample': 48000 + seconds * 48000,
                  'source_sha256': 'a' * 64}
        identity = {'film_id': 'fixture', 'scene_id': 'scene-1', 'event': event,
                    'uncertainties': [], 'action_window': window,
                    'candidate_evidence': [{'measurement': {'source_sha256': 'b' * 64},
                        'audio_reviews': [{'audit_sha256': 'c' * 64, 'window': {
                            'source_sha256': 'b' * 64, 'start_s': 0,
                            'samples': seconds * 48000, 'sample_rate': 48000}}]}]}
        need = {'schema': 'aim.scene_sound.source_need/v1', 'identity': identity,
            'task_id': digest(identity), 'observed_event': event, 'uncertainties': [],
            'source_scope_id': digest({k: identity[k] for k in
                ('film_id', 'scene_id', 'action_window', 'event')}),
            'existing_director_binding': {'parent_job_id': 'd' * 64},
            'author_form': {'seconds': seconds}, 'generation_authorized': False}
        answer = {'decision': 'request_source', 'prompt': 'Soft close fabric handling and rustling.',
            'negative': 'Speech, narration, music, impacts.', 'reason': 'Visible handling supports a soft rustling texture.'}
        decision = {'role': 'synchronized_motion', 'depth': 'foreground',
            'reason': 'The sound must follow visible fabric movement.', 'existing_source': None}
        return need, answer, decision

    def test_existing_author_caller_preserves_scope_and_never_admits_generation(self):
        need, answer, decision = self.fixture()
        before = copy.deepcopy(need)
        result = compile_routed_source_proposal(need, answer, decision)
        route = result['route_proposal']
        self.assertEqual(route['model']['engine'], 'local:mmaudio')
        self.assertEqual(route['video_condition']['source_sha256'], 'a' * 64)
        self.assertEqual(route['action_window'], need['identity']['action_window'])
        self.assertEqual(need, before)
        self.assertFalse(route['generation_authorized'])
        self.assertFalse(route['release_allowed'])
        self.assertFalse(route['model']['commercial_qualified'])
        self.assertEqual(result, compile_routed_source_proposal(need, answer, decision))

    def test_each_semantic_role_selects_its_model_without_prompt_heuristics(self):
        for role, engine in [('isolated_sfx', 'local:audioldm_48k'),
                ('texture', 'local:audioldm_48k'), ('atmosphere', 'local:stable-audio-open-1.0')]:
            need, answer, decision = self.fixture(); decision['role'] = role
            result = compile_routed_source_proposal(need, answer, decision)
            self.assertEqual(result['route_proposal']['model']['engine'], engine)

    def test_foley_need_cannot_be_replaced_with_score(self):
        need, answer, decision = self.fixture(); decision['role'] = 'music'
        with self.assertRaisesRegex(ValueError, 'music_requires_existing_music_plan'):
            compile_routed_source_proposal(need, answer, decision)

    def test_route_change_does_not_create_new_attempt_budget(self):
        need, answer, decision = self.fixture()
        first = compile_routed_source_proposal(need, answer, decision)['route_proposal']
        decision['role'] = 'texture'
        second = compile_routed_source_proposal(need, answer, decision)['route_proposal']
        self.assertEqual(first['source_scope_id'], second['source_scope_id'])
        self.assertEqual(first['attempt_budget'], second['attempt_budget'])

    def test_reuse_requires_exact_reviewed_source_interval(self):
        need, answer, decision = self.fixture()
        decision.update(role='existing_good_sfx', existing_source={
            'source_sha256': 'b' * 64, 'review_sha256': 'c' * 64, 'source_in_s': 0})
        result = compile_routed_source_proposal(need, answer, decision)
        self.assertEqual(result['route_proposal']['model']['engine'], 'local:sfx-library')
        decision['existing_source']['source_in_s'] = 0.1
        with self.assertRaisesRegex(ValueError, 'unreviewed'):
            compile_routed_source_proposal(need, answer, decision)

    def test_stale_scene_hash_and_model_invented_timing_rejected(self):
        need, answer, decision = self.fixture()
        proposal = compile_routed_source_proposal(need, answer, decision)['source_proposal']
        need['identity']['scene_id'] = 'different'
        with self.assertRaisesRegex(ValueError, 'provenance'):
            plan_route(need, proposal, decision)
        need, answer, decision = self.fixture(); decision['start_s'] = 0
        with self.assertRaisesRegex(ValueError, 'closed_author'):
            compile_routed_source_proposal(need, answer, decision)

    def test_long_atmosphere_not_silently_clamped_or_looped(self):
        need, answer, decision = self.fixture(seconds=60); decision['role'] = 'atmosphere'
        result = compile_routed_source_proposal(need, answer, decision)['route_proposal']
        self.assertEqual(result['status'], 'needs_authored_segment_boundaries')
        self.assertEqual(result['action_window']['end_sample'], 61 * 48000)

    def test_insufficient_context_does_not_plan_or_generate(self):
        need, answer, decision = self.fixture()
        answer.update(decision='needs_context', prompt=None, negative=None)
        result = compile_routed_source_proposal(need, answer, decision)
        self.assertEqual(result['status'], 'needs_context')
        self.assertNotIn('route_proposal', result)
        self.assertIn('You do not hear audio', routing_author_contract(need)['prompt'])

    def test_audioldm_long_texture_needs_authored_segments(self):
        need, answer, decision = self.fixture(seconds=12)
        for role in ('texture', 'isolated_sfx'):
            decision['role'] = role
            route = compile_routed_source_proposal(need, answer, decision)['route_proposal']
            self.assertEqual(route['status'], 'needs_authored_segment_boundaries')
            self.assertEqual(route['action_window'], need['identity']['action_window'])
            self.assertFalse(route['retime_allowed'])
