"""Offline adapters. No provider calls, Station queue access or deployment."""
import argparse,json,wave
from pathlib import Path
from .routes import compile_routed_author_answer, routed_author_contract
from .audioldm_contract import crop_event_pcm

def main():
    p=argparse.ArgumentParser()
    sub=p.add_subparsers(dest='command',required=True)
    for command in ('contract','plan'):
        c=sub.add_parser(command);c.add_argument('input');c.add_argument('output')
    c=sub.add_parser('crop');c.add_argument('wav');c.add_argument('binding');c.add_argument('output')
    args=p.parse_args()
    target=Path(args.output)
    if target.exists(): raise FileExistsError('Refusing to overwrite output: '+str(target))
    if args.command=='crop':
        binding=json.loads(Path(args.binding).read_text())
        with wave.open(args.wav,'rb') as w:
            if (w.getframerate(),w.getnchannels(),w.getsampwidth())!=(48000,1,3):
                raise ValueError('Expected uncompressed 48 kHz mono PCM24 WAV')
            pcm=w.readframes(w.getnframes())
        output,receipt=crop_event_pcm(pcm,binding)
        with wave.open(str(target),'wb') as w:
            w.setparams((1,3,48000,0,'NONE','not compressed'));w.writeframes(output)
        print(json.dumps(receipt,sort_keys=True));return
    data=json.loads(Path(args.input).read_text())
    result=(routed_author_contract(data['need']) if args.command=='contract'
            else compile_routed_author_answer(data['need'],data['answer']))
    target.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__': main()
