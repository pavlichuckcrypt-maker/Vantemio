import json
import sys
import tempfile
import unittest
from pathlib import Path

for _p in [Path(__file__).resolve().parents[2] / 'tools', Path('C:/AI/tools'), Path('/Users/vixstels/AIMmontag-dev-Station-20260928/work/station/tools')]:
    if _p.exists():
        sys.path.insert(0, str(_p))
        break
import editorial_gate
from blockchain_release import prepare_release, file_sha256

class StudioAdapterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root/'plan').mkdir()
        self.video = self.root/'video.mp4'
        self.video.write_bytes(b'accepted demo file')
        self.script = '## 01 \u2014 Demo\n\nVerified demo script.\n'
        (self.root/'plan/GUION_ES.md').write_text(self.script, encoding='utf-8')
        self.ledger = {'chapters': {'1': {'editorial_status': 'accepted',
                       'audited_chapter_sha256': editorial_gate.chapter_block_sha(self.script, 1)}}}
        self.ledger_path = self.root/'plan/EDITORIAL_STATUS.json'
        self.ledger_path.write_text(json.dumps(self.ledger))
        self.receipt = {'schemaVersion': 1, 'releaseId': 'demo-v1', 'accepted': True,
                        'reviewer': 'demo test', 'videoPath': 'video.mp4', 'videoSha256': file_sha256(self.video),
                        'recipient': '0x'+'1'*40, 'title': 'Demo', 'terms': 'Test only', 'demoFixture': True}
        self.receipt_path = self.root/'acceptance.json'
        self.write_receipt()

    def write_receipt(self):
        self.receipt_path.write_text(json.dumps(self.receipt))

    def prepare(self):
        return prepare_release(str(self.root), str(self.receipt_path))

    def test_accepted(self):
        self.assertTrue(self.prepare()['editorialVerified'])

    def test_video_changed(self):
        self.video.write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'video_changed'): self.prepare()

    def test_missing_ledger(self):
        self.ledger_path.unlink()
        with self.assertRaisesRegex(ValueError, 'editorial_acceptance'): self.prepare()

    def test_stale_script(self):
        (self.root/'plan/GUION_ES.md').write_text(self.script+'Changed script', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'editorial_acceptance'): self.prepare()

    def test_unaudited_chapter(self):
        (self.root/'plan/GUION_ES.md').write_text(self.script+'\n## 02 \u2014 Unreviewed\nMore content', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'editorial_acceptance'): self.prepare()

    def test_unknown_fields(self):
        self.receipt['skipChecks'] = True; self.write_receipt()
        with self.assertRaisesRegex(ValueError, 'invalid_or_missing'): self.prepare()

    def test_unaccepted(self):
        self.receipt['accepted'] = False; self.write_receipt()
        with self.assertRaisesRegex(ValueError, 'invalid_or_missing'): self.prepare()

    def test_escaping_video_path(self):
        outside = self.root.parent / (self.root.name + '-escape.mp4')
        outside.write_bytes(self.video.read_bytes())
        self.addCleanup(outside.unlink, missing_ok=True)
        self.receipt['videoPath'] = '../' + outside.name; self.write_receipt()
        with self.assertRaisesRegex(Exception, 'invalid_video_path|acceptance_receipt_outside_project|The system cannot find'): self.prepare()

    def test_zero_recipient(self):
        self.receipt['recipient'] = '0x'+'0'*40; self.write_receipt()
        with self.assertRaisesRegex(ValueError, 'invalid_recipient'): self.prepare()

if __name__ == '__main__': unittest.main()
