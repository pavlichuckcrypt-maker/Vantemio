// Actual imported minter with isolated external/QA dependencies; no real chain.
import test,{mock,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const app='C:/AI/blockchain-demo';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'nft-preview-boundary-'));
const fixtureApp=path.join(root,'blockchain-demo');
const project=path.join(root,'project');
const runtime=path.join(root,'runtime');
const profile=path.join(root,'youtube_release_monitor_agent/channels/vantemio.json');
const CHANNEL='UCRaLhEqioMqmM9rhjWAqThg';
const OTHER='UC'+ 'a'.repeat(22);
const recipient='0x'+'11'.repeat(20);
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const hash=s=>'0x'+sha(s);
const passport={schemaVersion:1,releaseId:'isolated-original-release',recipient,title:'Isolated accepted fixture',videoSha256:sha('fixture bytes'),terms:'isolated terms',accepted:true,editorialVerified:true,demoFixture:true};
let proposals=0,broadcasts=0,saves=[],events=0,authorityChecks=0;
for(const dir of [fixtureApp,project,runtime,path.dirname(profile)])fs.mkdirSync(dir,{recursive:true});
const url=n=>pathToFileURL(path.join(app,'src',n)).href;
mock.module(url('compile.mjs'),{namedExports:{ROOT:fixtureApp,artifact:()=>{throw new Error('unexpected artifact operation')}}});
mock.module(url('chain.mjs'),{namedExports:{RUNTIME:runtime,load:()=>{throw new Error('unexpected accounting read')},hash,save:(...a)=>saves.push(a),safeProposal:async()=>{proposals++;throw new Error('test proposal boundary reached');},executeSafe:async()=>{broadcasts++;throw new Error('unexpected broadcast');},eventArgs:()=>{throw new Error('unexpected receipt')}}});
mock.module(url('station-kernel-bridge.mjs'),{namedExports:{emitReleaseKernelEvent:()=>{events++;},emitTransferKernelEvent:()=>{events++;}}});
mock.module('node:child_process',{namedExports:{spawnSync:()=>({status:0,stdout:JSON.stringify(passport),stderr:''})}});
const source=process.env.NFT_PREVIEW_TEST_SOURCE||path.join(app,'src','releases.mjs');
const release=await import(pathToFileURL(source).href);

function writePolicy(enabled=false,required=true,extra={}){
 fs.writeFileSync(profile,JSON.stringify({channel_id:CHANNEL,enabled,owner_review_gate:{required,tokenizationAuthorized:false,...extra}}));
}
function context(token=0n){return {manifest:{chainId:84532,publicTransactions:true},assertChain:async()=>true,assertAuthority:async()=>{authorityChecks++;},nft:{tokenByRelease:async()=>token}};}
function writeChannel(id=CHANNEL){fs.writeFileSync(path.join(project,'project_manifest.json'),JSON.stringify({channel_id:id,original_request_identity:'isolated-original-request'}));}
function emptyState(){return {releases:[],receipts:[]};}
beforeEach(()=>{
 proposals=0;broadcasts=0;saves=[];events=0;authorityChecks=0;
 for(const name of ['project_manifest.json','receipt.json'])fs.rmSync(path.join(project,name),{force:true});
 fs.rmSync(path.join(runtime,'metadata'),{recursive:true,force:true});
 fs.writeFileSync(path.join(project,'accepted.mp4'),'fixture bytes');
 fs.writeFileSync(path.join(project,'final_acceptance.json'),JSON.stringify({...passport,videoPath:'accepted.mp4'}));
 fs.writeFileSync(path.join(project,'receipt.json'),JSON.stringify({videoPath:'accepted.mp4'}));
 writePolicy();writeChannel();
});
after(()=>fs.rmSync(root,{recursive:true,force:true}));

test('actual minter stops before proposals/signing/broadcast or metadata/state writes',async()=>{
 const state=emptyState();const before=JSON.stringify(state);
 await assert.rejects(release.mintRelease(context(),state,{project}),/Owner preview required/);
 assert.equal(authorityChecks,1);assert.equal(proposals,0);assert.equal(broadcasts,0);assert.deepEqual(saves,[]);assert.equal(events,0);
 assert.equal(JSON.stringify(state),before);assert.equal(fs.existsSync(path.join(runtime,'metadata')),false);
});

test('fixture marker and caller authorization booleans cannot override native hold',async()=>{
 const ctx=context();ctx.ownerApproval=true;ctx.marketRequest={channelId:CHANNEL,owner_review_gate:{required:false,tokenizationAuthorized:true}};
 await assert.rejects(release.mintRelease(ctx,emptyState(),{project}),/Owner preview required/);
 assert.equal(broadcasts,0);
});

test('required review remains binding even with a tokenizationAuthorized boolean',async()=>{
 writePolicy(true,true,{tokenizationAuthorized:true});
 await assert.rejects(release.mintRelease(context(),emptyState(),{project}),/Owner preview required/);
 assert.equal(proposals,0);
});

for(const key of ['channelId','youtube_channel_id'])test('channel alias '+key+' cannot bypass hold',async()=>{
 fs.writeFileSync(path.join(project,'project_manifest.json'),JSON.stringify({[key]:CHANNEL}));
 await assert.rejects(release.mintRelease(context(),emptyState(),{project}),/Owner preview required/);
});

test('missing public channel lineage rejects new issuance',async()=>{
 fs.rmSync(path.join(project,'project_manifest.json'));
 await assert.rejects(release.mintRelease(context(),emptyState(),{project}),/requires original channel lineage/);
 assert.equal(proposals,0);
});

test('conflicting channel aliases reject issuance',async()=>{
 fs.writeFileSync(path.join(project,'receipt.json'),JSON.stringify({videoPath:'accepted.mp4',channelId:OTHER}));
 await assert.rejects(release.mintRelease(context(),emptyState(),{project}),/channel lineage conflict/);
 assert.equal(proposals,0);
});

for(const value of [null,[],{channel_id:'bad-channel'},'malformed'])test('invalid lineage '+JSON.stringify(value)+' fails closed',async()=>{
 fs.writeFileSync(path.join(project,'project_manifest.json'),value==='malformed'?'bad JSON':JSON.stringify(value));
 await assert.rejects(release.mintRelease(context(),emptyState(),{project}),/lineage|channel identity/);
 assert.equal(proposals,0);
});

for(const value of [null,[],{channel_id:OTHER,enabled:true},'malformed'])test('missing/substituted hold '+JSON.stringify(value)+' fails closed',async()=>{
 if(value===null)fs.rmSync(profile);else fs.writeFileSync(profile,value==='malformed'?'bad JSON':JSON.stringify(value));
 await assert.rejects(release.mintRelease(context(),emptyState(),{project}),/preview policy/);
 assert.equal(proposals,0);
});

test('legacy local fixture exception is not a public-chain exception',()=>{
 fs.rmSync(path.join(project,'project_manifest.json'));
 release.assertOwnerPreviewMintAllowed({manifest:{chainId:31337,publicTransactions:false}},project,passport);
 assert.throws(()=>release.assertOwnerPreviewMintAllowed({manifest:{chainId:84532,publicTransactions:false}},project,passport),/requires original channel lineage/);
 assert.throws(()=>release.assertOwnerPreviewMintAllowed({manifest:{chainId:31337,publicTransactions:true}},project,passport),/requires original channel lineage/);
});

test('a different explicit channel is not paused by Vantemio review',()=>{
 writeChannel(OTHER);fs.rmSync(profile);
 release.assertOwnerPreviewMintAllowed(context(),project,passport);
});

test('reconciles existing NFT during hold without another proposal/broadcast',async()=>{
 const meta=release.metadataFor(passport,'video');
 const ctx=context(9n);ctx.nft.passports=async()=>({releaseId:hash(passport.releaseId),videoHash:'0x'+passport.videoSha256,metadataHash:meta.metadataHash,termsHash:meta.termsHash});ctx.nft.ownerOf=async()=>recipient;
 const state=emptyState();const result=await release.mintRelease(ctx,state,{project});
 assert.equal(result.tokenId,'9');assert.equal(result.idempotent,true);assert.equal(result.recovered,true);
 assert.equal(proposals,0);assert.equal(broadcasts,0);assert.equal(state.releases.length,1);
 const again=await release.mintRelease(ctx,state,{project});assert.equal(again.idempotent,true);assert.equal(state.releases.length,1);
});


test('channel substitution between admission and execution is rejected',()=>{
 writeChannel(OTHER);const captured=release.assertOwnerPreviewMintAllowed(context(),project,passport);
 assert.equal(captured,OTHER);writeChannel(CHANNEL);writePolicy(true,false,{tokenizationAuthorized:true});
 assert.throws(()=>release.assertOwnerPreviewMintAllowed(context(),project,passport,captured),/channel changed/);
});

test('re-reads the owner hold before executing the same admitted channel',()=>{
 writePolicy(true,false,{tokenizationAuthorized:true});const captured=release.assertOwnerPreviewMintAllowed(context(),project,passport);
 assert.equal(captured,CHANNEL);writePolicy(false,true);
 assert.throws(()=>release.assertOwnerPreviewMintAllowed(context(),project,passport,captured),/Owner preview required/);
});
