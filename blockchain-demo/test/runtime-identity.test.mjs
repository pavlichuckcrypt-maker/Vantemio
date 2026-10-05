import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {runtimeIdentity,validateRuntimeIdentity,readRuntimeIdentity,assertPortFree,stopVerifiedRuntime,demoOrigin} from '../src/runtime-identity.mjs';
const network='base-sepolia';
const fixture=()=>runtimeIdentity({network,manifest:{chainId:84532,privateKey:'must-not-escape'},pid:8123,instanceId:randomUUID(),active:null,queued:0,pendingTransaction:false});
test('runtime HTTP identity is independent of chain reads and excludes keys/CSRF',async()=>{
 const identity=fixture(),server=http.createServer((req,res)=>{assert.equal(req.url,'/api/runtime');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(identity));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const url='http://127.0.0.1:'+server.address().port;assert.deepEqual(await readRuntimeIdentity({url,network,pid:identity.pid,instanceId:identity.instanceId}),identity);assert.equal(Object.hasOwn(identity,'privateKey'),false);assert.equal(Object.hasOwn(identity,'csrf'),false);assert.equal(identity.scope,'Process identity only; blockchain verification uses /api/evidence');}finally{await new Promise(r=>server.close(r));}
});
test('changed process, instance, profile, chain and unexpected fields cannot authorize shutdown',async()=>{
 const i=fixture(),info={mode:network,pid:i.pid,instanceId:i.instanceId,url:demoOrigin(network)};
 for(const change of [{pid:i.pid+1},{instanceId:randomUUID()},{mode:'bsc-testnet'},{chainId:8453},{publicTransactions:false},{csrf:'never-export'}, {queued:-1},{queued:7},{pendingTransaction:'false'},{instanceId:'_'.repeat(36)}]){let signals=0;await assert.rejects(stopVerifiedRuntime(info,{network,fetcher:async()=>({ok:true,json:async()=>({...i,...change})}),signal:()=>signals++}),/mismatch/);assert.equal(signals,0);}
 assert.throws(()=>validateRuntimeIdentity(i,{network:'mainnet'}),/Unknown/);
});
test('active or queued operations and unresolved transactions prevent a signal; only verified idle instance can stop',async()=>{
 const i=fixture(),info={mode:network,pid:i.pid,instanceId:i.instanceId,url:demoOrigin(network)};let signals=0;
 for(const change of [{active:'mint'},{queued:1},{pendingTransaction:true}]){await assert.rejects(stopVerifiedRuntime(info,{network,fetcher:async()=>({ok:true,json:async()=>({...i,...change})}),signal:()=>signals++}),/shutdown refused/);assert.equal(signals,0);}
 await stopVerifiedRuntime(info,{network,fetcher:async()=>({ok:true,json:async()=>i}),signal:pid=>{assert.equal(pid,i.pid);signals++;}});assert.equal(signals,1);
});
test('a live TCP listener or failed HTTP observation cannot authorize another launch or shutdown',async()=>{
 const server=net.createServer(socket=>socket.end());await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 try{await assert.rejects(assertPortFree(url),/no second demo/);}finally{await new Promise(r=>server.close(r));}
 await assertPortFree(url);
 const i=fixture(),info={mode:network,pid:i.pid,instanceId:i.instanceId,url:demoOrigin(network)};let signals=0;
 await assert.rejects(stopVerifiedRuntime(info,{network,fetcher:async()=>{throw new Error('observation timeout');},signal:()=>signals++}),/observation timeout/);assert.equal(signals,0);
 await assert.rejects(readRuntimeIdentity({url:'https://example.com',network}),/loopback/);assert.equal(demoOrigin(network), 'http://127.0.0.1:18339');
});
test('runtime observation never follows an HTTP redirect to another service',async()=>{
 const identity=fixture();let targetHits=0;const target=http.createServer((req,res)=>{targetHits++;res.end(JSON.stringify(identity));});await new Promise(r=>target.listen(0,'127.0.0.1',r));
 const redirect=http.createServer((req,res)=>{res.writeHead(302,{Location:'http://127.0.0.1:'+target.address().port+'/api/runtime'});res.end();});await new Promise(r=>redirect.listen(0,'127.0.0.1',r));
 try{await assert.rejects(readRuntimeIdentity({url:'http://127.0.0.1:'+redirect.address().port,network}));assert.equal(targetHits,0);}finally{await new Promise(r=>redirect.close(r));await new Promise(r=>target.close(r));}
});
