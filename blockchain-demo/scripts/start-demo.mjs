import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { ROOT } from '../src/compile.mjs';
import { NETWORK, RUNTIME } from '../src/chain.mjs';
import {demoOrigin,readRuntimeIdentity,assertPortFree} from '../src/runtime-identity.mjs';

const url=demoOrigin(NETWORK,process.env.AIM_DEMO_PORT);
async function ready(){try{await readRuntimeIdentity({url,network:NETWORK});return true;}catch{return false;}}
if(await ready()){console.log('Demo already running: '+url);process.exit(0);}
await assertPortFree(url);
const runtime=RUNTIME;fs.mkdirSync(runtime,{recursive:true,mode:0o700});
const lock=path.join(runtime,'launcher.lock');
try{fs.mkdirSync(lock);}catch{console.error('Another launcher is starting. Inspect runtime/launcher.lock if a prior launch was interrupted.');process.exit(1);}
try{
  if(await ready()){console.log('Demo already running: '+url);process.exitCode=0;}else{
    await assertPortFree(url);
    const log=fs.openSync(path.join(runtime,'server.log'),'a',0o600);
    const child=spawn(process.execPath,[path.join(ROOT,'src/server.mjs')],{cwd:ROOT,detached:true,stdio:['ignore',log,log],env:process.env});
    child.unref();fs.closeSync(log);
    for(let deadline=Date.now()+120000;Date.now()<deadline;){if(await ready()){console.log('Demo ready: '+url);process.exitCode=0;break;}await delay(800);}
    if(process.exitCode!==0){console.error('Startup did not finish. Inspect runtime/server.log; no new launch was attempted.');process.exitCode=1;}
  }
}finally{fs.rmdirSync(lock);}
