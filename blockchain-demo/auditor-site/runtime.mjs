import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {ensureUserDatabase} from './database-runtime.mjs';
import {setTimeout as delay} from 'node:timers/promises';
import {assertPortFree} from '../src/runtime-identity.mjs';
import {writeDurableJSON} from '../src/durable-json.mjs';

export function siteOrigin(port=18340) {
  if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('Invalid site port');
  return `http://127.0.0.1:${port}`;
}
export function validateSiteIdentity(value,{pid,instanceId}={}) {
  const keys=['schemaVersion','service','mode','chainId','scope','pid','instanceId'];
  if(!value||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))||
    value.schemaVersion!==1||value.service!=='vidra-ai-auditor'||value.mode!=='local-testnet'||
    value.chainId!==84532||value.scope!=='process-identity-only'||
    !Number.isSafeInteger(value.pid)||value.pid<1||
    typeof value.instanceId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.instanceId)||
    pid!==undefined&&value.pid!==pid||instanceId!==undefined&&value.instanceId!==instanceId)
    throw new Error('Auditor site runtime identity mismatch');
  return {...value};
}
export function createSiteIdentity() {
  return validateSiteIdentity({schemaVersion:1,service:'vidra-ai-auditor',mode:'local-testnet',
    chainId:84532,scope:'process-identity-only',pid:process.pid,instanceId:crypto.randomUUID()});
}
function privateDirectory(directory) {
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  if(fs.lstatSync(directory).isSymbolicLink()||!fs.statSync(directory).isDirectory())
    throw new Error('Auditor runtime directory must be a real directory');
}
export function writeSiteInfo(moduleRoot,port,identity) {
  const directory=path.join(moduleRoot,'runtime-site');privateDirectory(directory);
  const info={url:siteOrigin(port),identity:validateSiteIdentity(identity)};
  writeDurableJSON(path.join(directory,`auditor-${port}.json`),JSON.stringify(info)+'\n');
}
export async function readSiteIdentity({moduleRoot,port=18340,fetcher=fetch,pid,timeout=3000}) {
  const url=siteOrigin(port),file=path.join(moduleRoot,'runtime-site',`auditor-${port}.json`);
  if(fs.lstatSync(file).isSymbolicLink())throw new Error('Invalid auditor runtime record');
  const info=JSON.parse(fs.readFileSync(file,'utf8'));
  if(Object.keys(info).length!==2||info.url!==url)throw new Error('Auditor runtime origin mismatch');
  const expected=validateSiteIdentity(info.identity,{pid});
  const response=await fetcher(url+'/api/runtime',{redirect:'error',signal:AbortSignal.timeout(timeout)});
  if(!response.ok)throw new Error('Auditor runtime unavailable');
  return validateSiteIdentity(await response.json(),expected);
}
export async function startAuditorSite({moduleRoot,port=18340,mediaHome,timeout=45000}={}) {
  await ensureUserDatabase(moduleRoot);
  const url=siteOrigin(port),directory=path.join(moduleRoot,'runtime-site');
  async function existing(pid) {try{return await readSiteIdentity({moduleRoot,port,pid});}catch{return null;}}
  const prior=await existing();if(prior)return {url,reused:true,identity:prior};
  // An unreadable/unknown listener is never adopted or killed.
  await assertPortFree(url);privateDirectory(directory);
  const lock=path.join(directory,`auditor-${port}-launcher.lock`);
  try{fs.mkdirSync(lock,{mode:0o700});}catch{throw new Error('Another auditor launcher is running; inspect its lock before retrying');}
  try{
    const raced=await existing();if(raced)return {url,reused:true,identity:raced};
    await assertPortFree(url);
    const log=fs.openSync(path.join(directory,`auditor-${port}.log`),'a',0o600);
    let child;
    try{child=spawn(process.execPath,[path.join(moduleRoot,'auditor-site/server.mjs')],{
      cwd:moduleRoot,detached:true,stdio:['ignore',log,log],
      env:{...process.env,VIDRA_SITE_PORT:String(port),...(mediaHome?{VIDRA_MEDIA_HOME:mediaHome}:{})}});
    }finally{fs.closeSync(log);}
    let failed=false;child.once('error',()=>{failed=true;});child.unref();
    for(const deadline=Date.now()+timeout;Date.now()<deadline;){
      const ready=await existing(child.pid);if(ready)return {url,reused:false,identity:ready};
      if(failed||child.exitCode!==null)break;await delay(250);
    }
    throw new Error('Auditor startup not confirmed; inspect its log. No restart or signal was sent');
  }finally{fs.rmdirSync(lock);}
}
