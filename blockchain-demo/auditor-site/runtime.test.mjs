import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createSiteIdentity,validateSiteIdentity,siteOrigin,writeSiteInfo,readSiteIdentity,startAuditorSite} from './runtime.mjs';

const moduleRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),'vidra-auditor-'));
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));
test('process identity rejects mainnet, foreign service, stale PID/UUID and extra sensitive fields',()=>{
  const good=createSiteIdentity();assert.deepEqual(validateSiteIdentity(good,good),good);
  for(const mutation of [{chainId:8453},{service:'other'},{mode:'production'},{pid:0},{instanceId:'bad'},
    {scope:'ready'},{schemaVersion:2},{csrf:'never-public'}])assert.throws(()=>validateSiteIdentity({...good,...mutation}));
  assert.throws(()=>validateSiteIdentity(good,{pid:good.pid+1}));
  assert.throws(()=>validateSiteIdentity(good,{instanceId:'00000000-0000-4000-8000-000000000000'}));
  for(const port of [0,80,65536,18340.5,NaN,'18340'])assert.throws(()=>siteOrigin(port));
});
test('readiness requires the same private record and refuses redirects, foreign PID and symlink records',async()=>{
  const root=temporary(),port=18449,good=createSiteIdentity();writeSiteInfo(root,port,good);
  const fetcher=async(url,options)=>{
    assert.equal(url,siteOrigin(port)+'/api/runtime');assert.equal(options.redirect,'error');
    return {ok:true,json:async()=>good};
  };
  assert.deepEqual(await readSiteIdentity({moduleRoot:root,port,fetcher}),good);
  await assert.rejects(readSiteIdentity({moduleRoot:root,port,fetcher:async()=>({ok:false})}));
  await assert.rejects(readSiteIdentity({moduleRoot:root,port,fetcher:async()=>({ok:true,json:async()=>({...good,pid:good.pid+1})})}));
  const record=path.join(root,'runtime-site',`auditor-${port}.json`),backup=record+'.copy';
  fs.renameSync(record,backup);fs.symlinkSync(backup,record);
  await assert.rejects(readSiteIdentity({moduleRoot:root,port,fetcher}),/record/);
  fs.rmSync(root,{recursive:true});
});
test('unknown occupied listener remains running and is neither adopted nor replaced',async()=>{
  const root=temporary(),opaque=http.createServer((req,res)=>res.end('not a VidRa server'));
  const port=await listen(opaque);
  try{
    await assert.rejects(startAuditorSite({moduleRoot:root,port,timeout:1000}),/listener/);
    assert.equal(await (await fetch(siteOrigin(port))).text(),'not a VidRa server');
    assert.equal(fs.existsSync(path.join(root,'runtime-site',`auditor-${port}.json`)),false);
  }finally{await close(opaque);fs.rmSync(root,{recursive:true});}
});
test('real isolated auditor startup and repeat launch reuse the exact process without chain writes',async()=>{
  const probe=http.createServer(),port=await listen(probe);await close(probe);
  const emptyMedia=temporary();let started;
  try{
    started=await startAuditorSite({moduleRoot,port,mediaHome:emptyMedia,timeout:90000});
    assert.equal(started.reused,false);
    const second=await startAuditorSite({moduleRoot,port,mediaHome:emptyMedia});
    assert.equal(second.reused,true);assert.deepEqual(second.identity,started.identity);
    const runtime=await readSiteIdentity({moduleRoot,port,pid:started.identity.pid});
    assert.deepEqual(runtime,started.identity);
    const publicInfo=await (await fetch(siteOrigin(port)+'/api/site')).json();
    assert.equal(publicInfo.chainId,84532);assert.deepEqual(publicInfo.media,[]);
    assert.ok(publicInfo.evidence.includes('VIDRA_METAMASK_FLOW_VERIFICATION.json'));
  }finally{
    if(started){const current=await readSiteIdentity({moduleRoot,port,pid:started.identity.pid});
      assert.equal(current.instanceId,started.identity.instanceId);process.kill(current.pid,'SIGTERM');}
    fs.rmSync(emptyMedia,{recursive:true});
  }
});
