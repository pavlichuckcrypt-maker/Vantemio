// Actual two-RPC code/route reads; negative probes mutate observed snapshots in memory only.
import assert from 'node:assert/strict';
import path from 'node:path';
import {FetchRequest,JsonRpcProvider,keccak256} from 'ethers';
import {ROOT} from '../src/compile.mjs';
import {load,json} from '../src/chain.mjs';
import {BASE_RPC,BASE_CHECK_RPC} from '../src/base-chain.mjs';
import {assertBosonImplementation,assertBosonImplementationSnapshot,loadBosonImplementationPin} from '../src/boson-implementation.mjs';
import {commitOrder} from '../src/boson.mjs';
import {writeDurableJSON} from '../src/durable-json.mjs';
if(process.env.AIM_DEMO_NETWORK!=='base-sepolia')throw new Error('Explicit Base profile required');
const manifest=load('manifest.json'),state=load('state.json'),market=load('marketplace.json'),before=load('public-receipts.json').length;
if(manifest?.chainId!==84532||!manifest.publicTransactions||load('pending.json'))throw new Error('Idle public Base required');
const providers=[BASE_RPC,BASE_CHECK_RPC].map(url=>{const f=new FetchRequest(url);f.timeout=20000;return new JsonRpcProvider(f,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});});
try{
  const blockTag=Math.min(...await Promise.all(providers.map(p=>p.getBlockNumber())))-2;
  const results=await Promise.all(providers.map(p=>assertBosonImplementation(p,manifest,{blockTag})));
  assert.equal(results[0].block.hash,results[1].block.hash);assert.equal(results[0].digest,results[1].digest);
  const pin=loadBosonImplementationPin(),listing=market.listings.find(l=>l.offerId==='133');assert.ok(listing);
  const failures=[
    ['facet-code',s=>s.facets[0].codeHash=keccak256('0x600900')],
    ['facet-route',s=>s.facets[0].address='0x'+'f'.repeat(40)],
    ['added-selector',s=>s.facets[0].selectors.push('0xffffffff')],
    ['removed-selector',s=>s.facets[0].selectors.pop()],
    ['duplicate-selector',s=>s.facets[0].selectors.push(s.facets[0].selectors[0])],
    ['missing-facets',s=>s.facets=[]]
  ];
  const probes=[];
  for(const [name,alter]of failures){
    const changed=structuredClone(results[0].snapshot);alter(changed);assert.equal(changed.proxyCodeHash,pin.snapshot.proxyCodeHash);
    const ctx={manifest,provider:providers[0],assertProtocol:async()=>assertBosonImplementationSnapshot(changed,pin.snapshot),
      boson:{getOffer:()=>assert.fail('Changed implementation must not read an offer')},credit:{allowance:()=>assert.fail('Must not approve')},transact:()=>assert.fail('Must not send')};
    await assert.rejects(commitOrder(ctx,state,listing),/implementation changed|duplicate|Invalid pinned/);
    probes.push({name,unchangedProxy:true,refusedBeforeOfferAllowanceAndSend:true,method:'Actual observed implementation snapshot changed only in memory; shared runtime verifier'});
  }
  await assert.rejects(commitOrder({manifest,provider:providers[0]},state,listing),/implementation verifier missing/);
  probes.push({name:'missing-runtime-verifier',refusedBeforeOfferAllowanceAndSend:true});
  await assert.rejects(assertBosonImplementation(providers[0],{...manifest,sourceBosonImplementationDigest:'0x'+'0'.repeat(64)}),/baseline changed/);
  probes.push({name:'changed-local-baseline',refusedBeforeProtocolRead:true});
  if(load('public-receipts.json').length!==before||load('pending.json'))throw new Error('Writes overlapped implementation verification');
  const report={verifiedAt:new Date().toISOString(),passed:true,chainId:84532,testOnly:true,providersVerified:2,
    block:results[0].block,implementationDigest:pin.digest,proxyCodeHash:pin.snapshot.proxyCodeHash,
    facets:pin.snapshot.facets,facetCount:pin.snapshot.facets.length,selectorCount:pin.snapshot.facets.reduce((n,f)=>n+f.selectors.length,0),
    probes,chainWritesCreated:0,receiptCountBefore:before,receiptCountAfter:load('public-receipts.json').length,
    checks:['Full selector-to-facet table and every facet runtime-code hash match the explicit baseline','All reads use one canonical block on two RPCs','Runtime startup, live view, pre-payment, approval, delivery, recovery and pre-broadcast paths require the pin','Runtime never automatically accepts a changed baseline or upgrade'],
    limits:'Observed official testnet implementation pinned with two-RPC agreement; not an independent Solidity source audit. Negative probes change in-memory reads, not live contracts. Protocol storage/configuration and voucher implementation upgrades are outside this snapshot. Verification before broadcast cannot guarantee that governance will not upgrade between broadcast and mining.'};
  writeDurableJSON(path.join(ROOT,'evidence/BOSON_IMPLEMENTATION_VERIFICATION.json'),json(report)+'\n');console.log(json({...report,facets:undefined}));
}finally{providers.forEach(p=>p.destroy());}
