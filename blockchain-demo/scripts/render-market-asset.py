"""Bounded demo exports; never approves a production project or changes its media."""
import hashlib,json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'tools'))
import editorial_gate

def run(args,timeout=120):
    return subprocess.run(args,check=True,capture_output=True,text=True,timeout=timeout).stdout

def main():
    project=Path(sys.argv[1]).resolve();kind=sys.argv[2];title=sys.argv[3];recipient=sys.argv[4];offset=int(sys.argv[5])
    allowed=(ROOT/'runtime-base'/'market-assets').resolve()
    if project.parent!=allowed or kind not in {'video','digital'} or not 20<=offset<=180:raise ValueError('invalid_demo_render_parameters')
    (project/'exports').mkdir(parents=True,exist_ok=False)
    (project/'plan').mkdir()
    ffmpeg=str(Path.home()/'.local/bin/ffmpeg');ffprobe=str(Path.home()/'.local/bin/ffprobe')
    if kind=='video':
        source=ROOT.parent.parent/'part1_FINAL_ffmpeg.mp4'
        if not source.is_file():raise ValueError('real_studio_source_unavailable')
        master=project/'exports/master.mp4';preview=project/'exports/preview.mp4'
        source_info=json.loads(run([ffprobe,'-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',str(source)]))['streams'][0]
        run([ffmpeg,'-hide_banner','-loglevel','error','-nostdin','-ss',str(offset),'-i',str(source),'-t','8',
             '-vf','scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
             '-an','-c:v','libx264','-preset','veryfast','-crf','20','-movflags','+faststart',str(master)])
        run([ffmpeg,'-hide_banner','-loglevel','error','-nostdin','-i',str(master),'-t','3','-vf','scale=960:540',
             '-an','-c:v','libx264','-preset','veryfast','-crf','26','-movflags','+faststart',str(preview)])
        probe=json.loads(run([ffprobe,'-v','error','-show_entries','stream=codec_name,width,height,r_frame_rate:format=duration,size','-of','json',str(master)]))
        v=next(s for s in probe['streams'] if 'width' in s)
        quality={'width':v['width'],'height':v['height'],'codec':v['codec_name'],'frameRate':v['r_frame_rate'],
                 'duration':float(probe['format']['duration']),'bytes':master.stat().st_size,'sourceWidth':source_info['width'],'sourceHeight':source_info['height']}
        if quality['duration']<7.8 or quality['width']!=1920 or quality['height']!=1080 or quality['codec']!='h264':raise ValueError('export_quality_check_failed')
    else:
        master=project/'exports/studio-neutral.cube';preview=None
        lines=['TITLE "AIMmontag Demo Neutral LUT"','# DEMO_ASSET_ID '+project.name,'LUT_3D_SIZE 17','DOMAIN_MIN 0.0 0.0 0.0','DOMAIN_MAX 1.0 1.0 1.0']
        for b in range(17):
            for g in range(17):
                for r in range(17):lines.append(f'{r/16:.6f} {g/16:.6f} {b/16:.6f}')
        master.write_text('\n'.join(lines)+'\n')
        quality={'format':'CUBE','gridSize':17,'samples':17**3,'bytes':master.stat().st_size,'description':'Generated neutral identity LUT; demonstration resource'}
    digest=hashlib.sha256(master.read_bytes()).hexdigest()
    guion=f'## 01 — Demo asset {project.name}\n\nIsolated demo export; not production editorial acceptance.\n'
    (project/'plan/GUION_ES.md').write_text(guion)
    chapter_hash=editorial_gate.chapter_block_sha(guion,1)
    (project/'plan/EDITORIAL_STATUS.json').write_text(json.dumps({'chapters':{'1':{'editorial_status':'accepted','audited_chapter_sha256':chapter_hash}}}))
    receipt={'schemaVersion':1,'releaseId':'market-'+project.name,'accepted':True,'reviewer':'isolated-demo-export-check (not production editorial approval)',
             'videoPath':str(master.relative_to(project)),'videoSha256':digest,'recipient':recipient,'title':title,
             'terms':'Base Sepolia demo certificate. No copyright transfer; demo license and assets have no monetary value.','demoFixture':True}
    (project/'final_acceptance.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
    (project/'blockchain-demo.json').write_text(json.dumps({'enabled':True,'chainId':84532,'recipient':recipient,'receipt':'final_acceptance.json'}))
    print(json.dumps({'sha256':digest,'file':str(master),'preview':str(preview) if preview else None,'quality':quality,'releaseId':receipt['releaseId']}))

if __name__=='__main__':main()
