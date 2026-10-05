// Actual process identity and managed launcher reuse. No signals, chain signing or writes.
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import {ROOT} from '../src/compile.mjs';
import {load,json} from '../src/chain.mjs';
import {readRuntimeIdentity,assertPortFree,stopVerifiedRuntime} from '../src/runtime-identity.mjs';
import {writeDurableJSON} from '../src/durable-json.mjs';
if(process.env.AIM_DEMO_NETWORK!=='base-sepolia'||load('pending.json'))throw new Error('Idle explicit Base required');
const info=load('server-info.json'),before=load('public-receipts.json').length,timings=[];
let runtime;
for(let i=0;i<5;i++){const start=performance.now();runtime=await readRuntimeIdentity({url:info.url,network:'base-sepolia',pid:info.pid,instanceId:info.instanceId});timings.push(Number((performance.now()-start).toFixed(3)));}
assert.equal(runtime.active,null);assert.equal(runtime.queued,0);assert.equal(runtime.pendingTransaction,false);
const launch=spawnSync(process.execPath,[path.join(ROOT,'scripts/start-demo.mjs')],{cwd:ROOT,env:{...process.env,AIM_DEMO_NETWORK:'base-sepolia'},encoding:'utf8',timeout:15000});assert.equal(launch.status,0,launch.stderr);assert.match(launch.stdout,/Demo already running/);
const again=await readRuntimeIdentity({url:info.url,network:'base-sepolia',pid:info.pid,instanceId:info.instanceId});assert.deepEqual(again,runtime);assert.deepEqual(load('server-info.json'),info);
await assert.rejects(assertPortFree(info.url),/no second demo/);
let signals=0;const probes=[];
for(const [name,change]of [['changed-pid',{pid:info.pid+1}],['changed-instance',{instanceId:randomUUID()}]]){await assert.rejects(stopVerifiedRuntime({...info,...change},{network:'base-sepolia',signal:()=>signals++}),/mismatch/);probes.push({name,refusedAgainstActualHttpIdentity:true});}
await assert.rejects(stopVerifiedRuntime(info,{network:'base-sepolia',fetcher:async()=>{throw new Error('Injected observation timeout');},signal:()=>signals++}),/observation timeout/);probes.push({name:'observation-timeout',refused:true,method:'Injected failed observation, no live service change'});assert.equal(signals,0);
assert.equal(load('public-receipts.json').length,before);assert.equal(load('pending.json'),null);
const report={verifiedAt:new Date().toISOString(),passed:true,chainId:84532,testOnly:true,runtime,observedRoundTripsMs:timings,managedStartReusedSamePidAndInstance:true,occupiedPortBlockedNewLaunch:true,probes,signalsSent:0,nativeTransactionsSigned:0,chainWritesCreated:0,receiptCountBefore:before,receiptCountAfter:before,scope:'Five actual loopback runtime-identity requests and a second managed start reuse the live PID/instance. Actual occupied TCP port refuses a new launch; wrong recorded PID/instance refuse against the real HTTP response. Active/queued/pending refusals are exercised by the separate unit fixtures, not by changing live process state. Identity endpoint performs no chain verification; blockchain readiness is checked separately. Round-trip numbers are this observation, not a latency guarantee. No process was stopped or restarted by this verifier.'};
writeDurableJSON(path.join(ROOT,'evidence/RUNTIME_IDENTITY_VERIFICATION.json'),json(report)+'\n');console.log(json(report));
