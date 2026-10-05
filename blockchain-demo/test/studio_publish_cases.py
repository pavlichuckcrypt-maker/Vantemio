import io
import json
import hashlib
from types import SimpleNamespace
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock
import studio_adapter_cases as fixtures
import blockchain_publish as publisher

class PublisherTests(unittest.TestCase):
    setUp = fixtures.StudioAdapterTests.setUp
    write_receipt = fixtures.StudioAdapterTests.write_receipt

    def configure(self):
        self.receipt_path=self.root/'final_acceptance.json';self.write_receipt()
        self.config={'enabled':True,'chainId':84532,'recipient':self.receipt['recipient'],'receipt':'final_acceptance.json'}
        self.config_path=self.root/'blockchain-demo.json';self.config_path.write_text(json.dumps(self.config))
        self.module=self.root/'module';(self.module/'runtime-base').mkdir(parents=True)
        (self.module/'runtime-base/studio-api-token').write_text('unit-test-token-only')

    def record(self):
        metadata={'name':self.receipt['title'],'description':'AIMmontag demo certificate of an accepted video version.',
                  'properties':{'release_id':self.receipt['releaseId'],'video_sha256':self.receipt['videoSha256'],
                                'terms_sha256':hashlib.sha256(self.receipt['terms'].encode()).hexdigest(),
                                'content_kind':'video','test_only':True,'rights':'No copyright or commercial rights transfer'}}
        return {'chainId':84532,'tokenId':'1','idempotent':True,'status':'confirmed',
                'releaseId':self.receipt['releaseId'],'owner':self.receipt['recipient'],
                'videoSha256':self.receipt['videoSha256'],'metadataHash':'0x'+hashlib.sha256(json.dumps(metadata,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),
                'termsHash':'0x'+hashlib.sha256(self.receipt['terms'].encode()).hexdigest()}

    def reply(self, response):
        return patch.object(publisher.urllib.request,'build_opener',return_value=SimpleNamespace(
            open=Mock(return_value=io.BytesIO(json.dumps(response).encode()))))

    def test_disabled_project_never_contacts_chain(self):
        with patch.object(publisher.urllib.request,'build_opener') as request:
            self.assertEqual(publisher.after_render(str(self.root))['status'],'disabled');request.assert_not_called()

    def test_mainnet_config_is_rejected(self):
        self.configure();self.config['chainId']=56;self.config_path.write_text(json.dumps(self.config))
        with patch.object(publisher.urllib.request,'build_opener') as request:
            self.assertEqual(publisher.after_render(str(self.root))['status'],'pending');request.assert_not_called()

    def test_render_is_not_final_acceptance(self):
        self.configure();self.receipt['accepted']=False;self.write_receipt()
        with patch.object(publisher.urllib.request,'build_opener') as request:
            self.assertEqual(publisher.after_render(str(self.root))['status'],'pending');request.assert_not_called()

    def test_recipient_change_is_rejected(self):
        self.configure();self.config['recipient']='0x'+'2'*40;self.config_path.write_text(json.dumps(self.config))
        with patch.object(publisher.urllib.request,'build_opener') as request:
            self.assertEqual(publisher.after_render(str(self.root))['status'],'pending');request.assert_not_called()

    def test_changed_file_is_rejected_before_submission(self):
        self.configure();self.video.write_bytes(b'new render')
        with patch.object(publisher.urllib.request,'build_opener') as request:
            self.assertEqual(publisher.after_render(str(self.root))['status'],'pending');request.assert_not_called()

    def test_unknown_config_fields_are_rejected(self):
        self.configure();self.config['skipChecks']=True;self.config_path.write_text(json.dumps(self.config))
        with patch.object(publisher.urllib.request,'build_opener') as request:
            self.assertEqual(publisher.after_render(str(self.root))['status'],'pending');request.assert_not_called()

    def test_accepted_file_uses_authenticated_loopback_hook(self):
        self.configure();response={'ok':True,'result':self.record()}
        with patch.object(publisher,'MODULE',self.module), self.reply(response) as build:
            result=publisher.after_render(str(self.root));self.assertEqual(result['status'],'confirmed')
            send=build.return_value.open;req=send.call_args.args[0];self.assertEqual(req.full_url,'http://127.0.0.1:18339/api/studio-release')
            self.assertEqual(req.get_header('X-studio-token'),'unit-test-token-only')
            self.assertEqual(set(json.loads(req.data)),{'project','acceptanceReceiptSha256'})
            self.assertTrue((self.root/'blockchain-publication.json').exists())

    def test_foreign_chain_response_cannot_be_promoted(self):
        self.configure();response={'ok':True,'result':{'chainId':31337,'tokenId':'1'}}
        with patch.object(publisher,'MODULE',self.module), self.reply(response):
            self.assertEqual(publisher.after_render(str(self.root))['status'],'pending')
            self.assertFalse((self.root/'blockchain-publication.json').exists())

    def test_unavailable_service_stays_pending(self):
        self.configure()
        with patch.object(publisher,'MODULE',self.module), patch.object(publisher.urllib.request,'build_opener',side_effect=OSError('offline')):
            self.assertEqual(publisher.after_render(str(self.root))['status'],'pending')
            self.assertFalse((self.root/'blockchain-publication.json').exists())

    def test_malformed_config_types_stay_pending_without_contact(self):
        self.configure()
        for value in [None, True, [], {'recipient':True}, {**self.config,'recipient':False},
                      {**self.config,'receipt':[]}, {**self.config,'chainId':84532.0}]:
            with self.subTest(value=value):
                self.config_path.write_text(json.dumps(value))
                with patch.object(publisher.urllib.request,'build_opener') as send:
                    self.assertEqual(publisher.after_render(str(self.root))['status'],'pending');send.assert_not_called()

    def test_malformed_or_incomplete_success_stays_pending(self):
        self.configure()
        for value in [None, [], True, {'ok':True,'result':None}, {'ok':True,'result':[]},
                      {'ok':True,'result':{'chainId':84532,'tokenId':'1'}}]:
            with self.subTest(value=value), patch.object(publisher,'MODULE',self.module), self.reply(value):
                self.assertEqual(publisher.after_render(str(self.root))['status'],'pending')
                self.assertFalse((self.root/'blockchain-publication.json').exists())

    def test_foreign_version_owner_terms_and_private_fields_are_refused(self):
        self.configure()
        for field,value in [('releaseId','foreign'),('videoSha256','0'*64),('owner','0x'+'2'*40),
                            ('termsHash','0x'+'b'*64),('metadataHash','0x'+'a'*64),('tokenId','0'),('chainId',84532.0),
                            ('tx','invalid'),('privateKey','fixture must not persist')]:
            with self.subTest(field=field):
                record=self.record();record[field]=value
                with patch.object(publisher,'MODULE',self.module), self.reply({'ok':True,'result':record}):
                    self.assertEqual(publisher.after_render(str(self.root))['status'],'pending')
                    self.assertFalse((self.root/'blockchain-publication.json').exists())

    def test_response_limit_refuses_oversized_body(self):
        self.configure();opener=SimpleNamespace(open=Mock(return_value=io.BytesIO(b' '*65537)))
        with patch.object(publisher,'MODULE',self.module), patch.object(publisher.urllib.request,'build_opener',return_value=opener):
            self.assertEqual(publisher.after_render(str(self.root))['reason'],'publication_response_too_large')
            self.assertFalse((self.root/'blockchain-publication.json').exists())

    def test_original_video_metadata_schema_and_unicode_title_are_supported(self):
        self.configure();self.receipt['title']='Принятое видео — demo';self.write_receipt()
        metadata={'name':self.receipt['title'],'description':'AIMmontag demo certificate of an accepted video version.',
                  'properties':{'release_id':self.receipt['releaseId'],'video_sha256':self.receipt['videoSha256'],
                                'terms_sha256':hashlib.sha256(self.receipt['terms'].encode()).hexdigest(),
                                'test_only':True,'rights':'No copyright or commercial rights transfer'}}
        for digest in [self.record()['metadataHash'],'0x'+hashlib.sha256(json.dumps(metadata,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()]:
            record=self.record();record['metadataHash']=digest
            with patch.object(publisher,'MODULE',self.module),self.reply({'ok':True,'result':record}):
                self.assertEqual(publisher.after_render(str(self.root))['status'],'confirmed')

    def test_loopback_token_cannot_follow_redirects_or_environment_proxy(self):
        self.configure()
        with patch.object(publisher,'MODULE',self.module), self.reply({'ok':True,'result':self.record()}) as build:
            self.assertEqual(publisher.after_render(str(self.root))['status'],'confirmed')
            handlers=build.call_args.args
            self.assertEqual(handlers[0].proxies,{})
            self.assertIsInstance(handlers[1],publisher._NoRedirect)
            request=publisher.urllib.request.Request('http://127.0.0.1:18339/api/studio-release',data=b'{}',headers={'X-Studio-Token':'unit-test-token-only'})
            with self.assertRaisesRegex(publisher.urllib.error.URLError,'studio_redirect_refused'):
                handlers[1].redirect_request(request,None,302,'redirect',{},'https://example.invalid/')

    def test_file_change_during_confirmation_stays_pending(self):
        self.configure();response={'ok':True,'result':self.record()}
        def changed(*args,**kwargs):
            self.video.write_bytes(b'a different finished render')
            return io.BytesIO(json.dumps(response).encode())
        with patch.object(publisher,'MODULE',self.module), patch.object(publisher.urllib.request,'build_opener',return_value=SimpleNamespace(open=Mock(side_effect=changed))):
            self.assertEqual(publisher.after_render(str(self.root))['status'],'pending')
            self.assertFalse((self.root/'blockchain-publication.json').exists())

    def test_receipt_write_failure_keeps_previous_proof_and_cleans_temporary_data(self):
        self.configure();target=self.root/'blockchain-publication.json';target.write_text('previous proof')
        with patch.object(publisher,'MODULE',self.module), self.reply({'ok':True,'result':self.record()}), patch.object(publisher.os,'fsync',side_effect=OSError('disk unavailable')):
            self.assertEqual(publisher.after_render(str(self.root))['status'],'pending')
        self.assertEqual(target.read_text(),'previous proof')
        self.assertEqual(list(self.root.glob('.blockchain-publication-*')),[])

if __name__=='__main__':unittest.main()
