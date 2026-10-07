import json, subprocess, sys, tempfile, unittest, wave
from pathlib import Path

class OfflineCLI(unittest.TestCase):
    def test_installed_adapter_crops_real_pcm_and_refuses_replay_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/'source.wav';target=root/'effect.wav';binding=root/'binding.json'
            pcm=(123456).to_bytes(3,'little',signed=True)*48000
            with wave.open(str(source),'wb') as w:
                w.setparams((1,3,48000,0,'NONE','not compressed'));w.writeframes(pcm)
            binding.write_text(json.dumps({'source_in_sample':0,'output_samples':24000,
                'generated_samples_required':48000,'placement_start_sample':48000,'retime_allowed':False}))
            cmd=[sys.executable,'-m','vantemio_sound_matrix.cli','crop',str(source),str(binding),str(target)]
            result=subprocess.run(cmd,capture_output=True,text=True,check=True)
            receipt=json.loads(result.stdout)
            with wave.open(str(target),'rb') as w:
                self.assertEqual(w.getnframes(),24000)
                self.assertEqual(w.readframes(24000),pcm[:72000])
            self.assertFalse(receipt['retime_applied'])
            before=target.read_bytes()
            self.assertNotEqual(subprocess.run(cmd,capture_output=True).returncode,0)
            self.assertEqual(target.read_bytes(),before)
