import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface,keccak256} from 'ethers';
import {BOSON_LOUPE_ABI,readBosonImplementation,assertBosonImplementationSnapshot,bosonImplementationDigest,assertRuntimeBoson} from '../src/boson-implementation.mjs';
import {commitOrder} from '../src/boson.mjs';
const diamond='0x'+'1'.repeat(40),facet='0x'+'2'.repeat(40),other='0x'+'3'.repeat(40),code='0x6001600055',proxy='0x6002600055';
const baseline={chainId:84532,diamond,proxyCodeHash:keccak256(proxy),facets:[{address:facet,codeHash:keccak256(code),selectors:['0xabcdef12','0x12345678']}]};
const iface=new Interface(BOSON_LOUPE_ABI);
function fixture(){
 const block={number:22,hash:'0x'+'a'.repeat(64)},tags=[];
 const provider={send:async method=>{assert.equal(method,'eth_chainId');return '0x14a34';},getBlock:async()=>block,getCode:async(a,tag)=>{tags.push(tag);return a===diamond?proxy:code;},call:async tx=>{tags.push(tx.blockTag);return iface.encodeFunctionResult('facets',[[{facetAddress:facet,functionSelectors:['0x12345678','0xabcdef12']}] ]);}};
 return {provider,tags,block,manifest:{chainId:84532,sourceBoson:diamond,sourceBosonCodeHash:keccak256(proxy)}};
}
test('unchanged proxy cannot hide rerouted selectors, changed facet code, or added/removed methods',()=>{
 const reordered=structuredClone(baseline);reordered.facets[0].selectors.reverse();assert.equal(bosonImplementationDigest(reordered),bosonImplementationDigest(baseline));
 for(const change of [s=>s.facets[0].address=other,s=>s.facets[0].codeHash=keccak256('0x6003'),s=>s.facets[0].selectors.push('0x11111111'),s=>s.facets[0].selectors.pop(),s=>s.facets.push({address:other,codeHash:keccak256(code),selectors:['0x99999999']})]){
  const altered=structuredClone(baseline);change(altered);assert.equal(altered.proxyCodeHash,baseline.proxyCodeHash);assert.throws(()=>assertBosonImplementationSnapshot(altered,baseline),/implementation changed/);
 }
 const duplicate=structuredClone(baseline);duplicate.facets[0].selectors.push(duplicate.facets[0].selectors[0]);assert.throws(()=>assertBosonImplementationSnapshot(duplicate,baseline),/duplicate/);
 assert.throws(()=>assertBosonImplementationSnapshot({...baseline,chainId:8453},baseline),/Invalid pinned/);
});
test('implementation reads bind proxy, every facet and loupe to one canonical block',async()=>{
 const f=fixture(),actual=await readBosonImplementation(f.provider,f.manifest);assertBosonImplementationSnapshot(actual.snapshot,baseline);assert.deepEqual(actual.block,f.block);assert.ok(f.tags.length>=3);assert.ok(f.tags.every(t=>t===22));
});
test('wrong network, missing facet code, changed proxy and reorg are refused',async()=>{
 for(const failure of ['network','missing','proxy','reorg']){
  const f=fixture(),get=f.provider.getCode;
  if(failure==='missing')f.provider.getCode=async(a,t)=>a===facet?'0x':get(a,t);
  if(failure==='proxy')f.manifest.sourceBosonCodeHash=keccak256('0x6009');
  if(failure==='reorg')f.provider.getBlock=async tag=>tag==='latest'?f.block:{...f.block,hash:'0x'+'b'.repeat(64)};
  if(failure==='network')f.provider.send=async()=> '0x2105';
  await assert.rejects(readBosonImplementation(f.provider,f.manifest),/public Base|no code|proxy code changed|no longer canonical/);
 }
});
test('public purchase refuses missing/rejected implementation verifier before offer/allowance/send',async()=>{
 for(const verifier of [undefined,async()=>{throw new Error('Boson implementation changed');}]){
  const ctx={manifest:{chainId:84532},assertProtocol:verifier,provider:{getBlock:async()=>({number:22,hash:'0x'+'a'.repeat(64),timestamp:100})},boson:{getOffer:()=>assert.fail('No offer read allowed')},credit:{allowance:()=>assert.fail('No approval allowed')},transact:()=>assert.fail('No send allowed')};
  await assert.rejects(commitOrder(ctx,{orders:[],offerId:'1'}),/implementation verifier missing|implementation changed/);
 }
 let called=false;await assertRuntimeBoson({manifest:{chainId:84532},assertProtocol:async options=>{assert.equal(options.blockTag,22);called=true;}},{blockTag:22});assert.equal(called,true);
});
