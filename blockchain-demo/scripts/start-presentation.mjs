import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {startAuditorSite} from '../auditor-site/runtime.mjs';
const moduleRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if(process.env.AIM_DEMO_NETWORK&&process.env.AIM_DEMO_NETWORK!=='base-sepolia')throw new Error('Presentation requires Base Sepolia');
if(process.env.AIM_DEMO_PORT&&process.env.AIM_DEMO_PORT!=='18339')throw new Error('Presentation studio requires port 18339');
const studio=spawnSync(process.execPath,[path.join(moduleRoot,'scripts/start-demo.mjs')],{
  cwd:moduleRoot,stdio:'inherit',env:{...process.env,AIM_DEMO_NETWORK:'base-sepolia'}});
if(studio.error||studio.status!==0)throw new Error('Studio startup not confirmed; auditor launch withheld');
const result=await startAuditorSite({moduleRoot,port:Number(process.env.VIDRA_SITE_PORT||18340),mediaHome:process.env.VIDRA_MEDIA_HOME});
console.log(`Presentation ready locally: ${result.url} | studio http://127.0.0.1:18339/`);
console.log('This confirms process identity, not chain readiness. Run npm run verify:ready before the presentation.');
