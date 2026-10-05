import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import {Contract,JsonRpcProvider,FetchRequest,keccak256,parseUnits} from 'ethers';
import {ROOT,compile,artifact} from '../src/compile.mjs';
import {load,bosonABI,json,hash} from '../src/chain.mjs';
import {BASE_RPC,BASE_CHECK_RPC,assertBase} from '../src/base-chain.mjs';
import {DEMO_HOME} from '../src/vault.mjs';
import {verifyAudit} from '../src/security.mjs';
import {assertBosonImplementation} from '../src/boson-implementation.mjs';
import {assertSafeAuthority} from '../src/safe-authority.mjs';

const origin='http://127.0.0.1:18339',tests=[];
const state=await(await fetch(origin+'/api/state')).json(),market=load('marketplace.json');
const m=state.manifest;
assert.equal(m.chainId,84532);assert.equal(state.active,null);assert.equal(state.pendingTransaction,false);
const providers=[BASE_RPC,BASE_CHECK_RPC].map(url=>{const f=new FetchRequest(url);f.timeout=20000;return new JsonRpcProvider(f,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});});
const p=providers[0],nft=new Contract(m.nft,compile().StudioRelease.abi,p);
const safe=new Contract(m.safe,artifact('@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json').abi,p);
const boson=new Contract(m.sourceBoson,bosonABI(),p);
async function check(name,fn){for(let attempt=0;;attempt++){try{await fn();break;}catch(e){if(attempt>=2||!['TIMEOUT','NETWORK_ERROR'].includes(e.code))throw e;console.log('Read-only network retry:',name);}}tests.push({name,passed:true});console.log('PASS',name);}
const headers={'Content-Type':'application/json',Origin:origin,'X-Demo-CSRF':state.csrf};
async function post(input){const r=await fetch(origin+'/api/market/action',{method:'POST',headers,body:JSON.stringify(input)});return {status:r.status,data:await r.json()};}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
try{
await check('Base and all pinned contracts are verified on two independent RPCs',async()=>{
 for(const provider of providers){await assertBase(provider);for(const [address,fingerprint]of [[m.nft,m.nftCodeHash],[m.credit,m.creditCodeHash],[m.sourceBoson,m.sourceBosonCodeHash],[m.safe,m.safeCodeHash]])assert.equal(keccak256(await provider.getCode(address)),fingerprint);}
 const blockTag=Math.min(...await Promise.all(providers.map(p=>p.getBlockNumber())))-2;
 const implementations=await Promise.all(providers.map(p=>assertBosonImplementation(p,m,{blockTag})));
 assert.equal(implementations[0].digest,m.sourceBosonImplementationDigest);assert.equal(implementations[0].digest,implementations[1].digest);assert.equal(implementations[0].block.hash,implementations[1].block.hash);
 const authorities=await Promise.all(providers.map(provider=>assertSafeAuthority({provider,manifest:m,safe:new Contract(m.safe,artifact('@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json').abi,provider)},{blockTag})));
 assert.equal(authorities[0].block.hash,authorities[1].block.hash);assert.equal(authorities[0].singletonCodeHash,authorities[1].singletonCodeHash);
 assert.equal(('0x'+(await p.getStorage(m.safe,0)).slice(-40)).toLowerCase(),m.safeSingleton.toLowerCase());
 assert.equal((await nft.owner()).toLowerCase(),m.safe.toLowerCase());assert.equal(Number(await safe.getThreshold()),3);
 assert.deepEqual((await safe.getOwners()).map(a=>a.toLowerCase()).sort(),m.safeOwners.map(a=>a.toLowerCase()).sort());
});
await check('all issued NFT passports match current public ownership and pinned bytes',async()=>{
 for(const r of state.releases){const passport=await nft.passports(r.tokenId),metadata=Buffer.from((await nft.tokenURI(r.tokenId)).split(',')[1],'base64');
  assert.equal((await nft.ownerOf(r.tokenId)).toLowerCase(),r.owner.toLowerCase());assert.equal(passport.videoHash,'0x'+r.videoSha256);assert.equal(passport.metadataHash,r.metadataHash);assert.equal('0x'+sha(metadata),r.metadataHash);assert.equal(passport.termsHash,r.termsHash);}
 assert.equal(await nft.nextTokenId(),BigInt(state.releases.length+1));assert.equal(state.checks.length,15);assert.ok(state.checks.every(c=>c.passed));
});
await check('studio assets and public marketplace recover exactly after process restart',async()=>{
 assert.equal(market.assets.length,state.marketplace.assets.length);assert.equal(market.listings.length,state.marketplace.listings.length);
 for(const a of market.assets){assert.equal(sha(fs.readFileSync(a.file)),a.sha256);assert.equal(state.marketplace.assets.find(x=>x.id===a.id).certificate.tokenId,a.certificate.tokenId);}
 for(const l of market.listings){const o=await boson.getOffer(l.offerId);assert.equal(o.exists,true);assert.equal(o.offer.price,parseUnits(l.price,18));assert.equal(o.offer.metadataHash,l.metadataHash);assert.equal(o.offer.exchangeToken.toLowerCase(),m.credit.toLowerCase());}
 for(const o of state.orders){const x=await boson.getExchange(o.exchangeId);assert.equal(x.exists,true);assert.equal(x.exchange.offerId.toString(),o.offerId);assert.equal(x.exchange.buyerId.toString(),o.buyerId);}
 const recorded=state.orders.find(o=>o.exchangeId==='253');assert.equal(Number((await boson.getExchange('253')).exchange.state),4);assert.equal(recorded.deliveredSha256,market.assets.find(a=>a.id===recorded.assetId).sha256);
});
await check('recorded studio after-render callback remains idempotent for the new asset',async()=>{
 const a=market.assets.find(a=>a.certificate.tokenId==='4'),before=await nft.nextTokenId();
 const result=spawnSync('python3',[path.join(ROOT,'../tools/blockchain_publish.py'),'--project',a.project],{encoding:'utf8',timeout:60000});
 assert.equal(result.status,0,result.stdout);const out=JSON.parse(result.stdout);assert.equal(out.idempotent,true);assert.equal(out.tokenId,'4');assert.equal(out.chainId,84532);assert.equal(await nft.nextTokenId(),before);
});
await check('durable idempotency survives restart and the operation queue is bounded',async()=>{
 const a=market.assets.find(a=>a.certificate.tokenId==='4');
 const [key]=Object.entries(market.requests).find(([,v])=>v.status==='confirmed'&&v.result?.id===a.id);
 const input={action:'render',kind:a.kind,title:a.title,idempotencyKey:key};assert.equal(hash(JSON.stringify(input)),market.requests[key].digest);
 const before=load('public-receipts.json').length;
 const results=await Promise.all(Array.from({length:12},()=>post(input)));
 assert.ok(results.some(r=>r.status===400&&r.data.error.includes('queue is full')));
 for(const r of results.filter(r=>r.status===200)){assert.equal(r.data.result.idempotent,true);assert.equal(r.data.result.id,a.id);}
 assert.equal(load('public-receipts.json').length,before);assert.equal(load('marketplace.json').assets.length,market.assets.length);
});
await check('modified paid content is refused and restoration preserves the published fingerprint',async()=>{
 const o=state.orders.find(o=>o.exchangeId==='253'),a=market.assets.find(a=>a.id===o.assetId),original=fs.readFileSync(a.file);
 try{const altered=Buffer.from(original);altered[altered.length-1]^=1;fs.writeFileSync(a.file,altered);
  const r=await post({action:'delivery',exchangeId:o.exchangeId,idempotencyKey:crypto.randomUUID()});assert.equal(r.status,400);assert.equal(r.data.error,'Verified file hash mismatch');
 }finally{fs.writeFileSync(a.file,original);}
 assert.equal(sha(fs.readFileSync(a.file)),a.sha256);
});
await check('delivery rechecks live quorum configuration and serves exact bytes after restart',async()=>{
 const r=await post({action:'delivery',exchangeId:'253',idempotencyKey:crypto.randomUUID()});assert.equal(r.status,200);
 const response=await fetch(origin+'/api/market/delivery',{headers:{'X-Demo-CSRF':state.csrf,'X-Delivery-Token':r.data.result.token}});
 assert.equal(response.status,200);assert.equal(sha(Buffer.from(await response.arrayBuffer())),r.data.result.sha256);
 const replay=await fetch(origin+'/api/market/delivery',{headers:{'X-Demo-CSRF':state.csrf,'X-Delivery-Token':r.data.result.token}});assert.equal(replay.status,400);
});
await check('delivery capability secrets and local paths never enter public evidence',async()=>{
 const result=await(await fetch(origin+'/api/evidence')).text();assert.ok(!/privateKey|mnemonic|"csrf"|"token"|"file"|"project"|studio-api-token|keystore/.test(result));assert.equal(verifyAudit(),true);
 assert.equal((await fetch(origin+'/api/market/master/'+market.assets[0].id)).status,403);
 assert.equal((await fetch(origin+'/api/market/preview/..%2F..%2Fvault.json')).status,400);
 const badHost=await new Promise((resolve,reject)=>{const req=http.get(origin+'/api/state',{headers:{Host:'foreign.invalid'}},res=>{res.resume();res.once('end',()=>resolve(res.statusCode));});req.once('error',reject);});assert.equal(badHost,403);
});
await check('every receipt including the recorded workflow is canonical on both RPCs',async()=>{
 for(const r of load('public-receipts.json')){const [a,b]=await Promise.all(providers.map(p=>p.getTransactionReceipt(r.tx)));assert.equal(a.status,1);assert.equal(a.blockHash,b.blockHash);assert.equal(a.blockHash,r.blockHash);assert.ok((await p.getBlockNumber())-a.blockNumber>=2);}
});
const publicEvidence=await(await fetch(origin+'/api/evidence')).json();
const result={schemaVersion:1,verifiedAt:new Date().toISOString(),chainId:84532,testsPassed:tests.length,tests,
 recordedWorkflow:{nftTokenId:'4',bosonOfferId:'136',bosonExchangeId:'253',completed:true},
 chainReceiptCount:load('public-receipts.json').length,evidence:publicEvidence,
 custody:'Same-Mac test custody; NFT authority is Safe 3/5; Boson writes use software quorum before EOA signing'};
for(const f of [path.join(ROOT,'evidence/DEMO_READY_VERIFICATION.json'),path.join(DEMO_HOME,'DEMO_READY_VERIFICATION.json')])fs.writeFileSync(f,json(result)+'\n',{mode:0o600});
console.log('Demo readiness verified:',tests.length,'scenarios');
}finally{providers.forEach(p=>p.destroy());}
