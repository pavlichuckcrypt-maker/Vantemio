import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256} from 'ethers';
import {getSafeSingletonDeployment} from '@safe-global/safe-deployments';
import {artifact} from '../src/compile.mjs';
import {assertSafeAuthority,assertRuntimeSafe,SAFE_MODULE_SENTINEL,SAFE_GUARD_SLOT,SAFE_FALLBACK_SLOT} from '../src/safe-authority.mjs';
import {safeProposal} from '../src/chain.mjs';
import {mintRelease} from '../src/releases.mjs';
const zero='0x'+'0'.repeat(64);
function fixture(){
 const singleton=getSafeSingletonDeployment({version:'1.4.1',network:'84532'}).networkAddresses['84532'],safeAddress='0x'+'1'.repeat(40),owners=Array.from({length:5},(_,i)=>'0x'+String(i+2).repeat(40));
 const proxy=artifact('@safe-global/safe-contracts/build/artifacts/contracts/proxies/SafeProxy.sol/SafeProxy.json').deployedBytecode,implementation=artifact('@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json').deployedBytecode;
 const block={number:22,hash:'0x'+'a'.repeat(64)},tags=[];
 const provider={send:async()=> '0x14a34',getBlock:async()=>block,getCode:async(a,tag)=>{tags.push(tag);return a.toLowerCase()===singleton.toLowerCase()?implementation:proxy;},getStorage:async(a,slot,tag)=>{tags.push(tag);return slot===0?'0x'+singleton.slice(2).toLowerCase().padStart(64,'0'):zero;}};
 const safe={getOwners:async opts=>{tags.push(opts.blockTag);return owners;},getThreshold:async opts=>{tags.push(opts.blockTag);return 3n;},getModulesPaginated:async(start,size,opts)=>{assert.equal(start,SAFE_MODULE_SENTINEL);assert.equal(size,1);tags.push(opts.blockTag);return [[],SAFE_MODULE_SENTINEL];}};
 return {provider,safe,manifest:{chainId:84532,publicTransactions:true,safe:safeAddress,safeSingleton:singleton,safeCodeHash:keccak256(proxy),safeOwners:owners},block,tags};
}
test('Safe authority proves official implementation, five owners, 3/5 and no bypass configuration at one block',async()=>{
 const f=fixture(),snapshot=await assertSafeAuthority(f);assert.equal(snapshot.threshold,3);assert.deepEqual(snapshot.modules,[]);assert.deepEqual(snapshot.block,f.block);assert.ok(f.tags.length>=8);assert.ok(f.tags.every(t=>t===22));
});
test('unchanged proxy/owners cannot hide singleton replacement or modified implementation code',async()=>{
 for(const failure of ['master-copy','implementation','proxy','registry']){
  const f=fixture(),storage=f.provider.getStorage,code=f.provider.getCode;
  if(failure==='master-copy')f.provider.getStorage=async(a,s,t)=>s===0?'0x'+'f'.repeat(64):storage(a,s,t);
  if(failure==='implementation')f.provider.getCode=async(a,t)=>a.toLowerCase()===f.manifest.safeSingleton.toLowerCase()?'0x6000':code(a,t);
  if(failure==='proxy')f.provider.getCode=async(a,t)=>a===f.manifest.safe?'0x6000':code(a,t);
  if(failure==='registry')f.manifest.safeSingleton='0x'+'f'.repeat(40);
  f.safe.getOwners=()=>assert.fail('Do not trust getters after implementation mismatch');
  await assert.rejects(assertSafeAuthority(f),/implementation changed|official registry/);
 }
});
test('module, guard, fallback, signer/threshold changes and reorg close the authority gate',async()=>{
 for(const failure of ['module','broken-sentinel','guard','fallback','owners','threshold','reorg','network']){
  const f=fixture(),storage=f.provider.getStorage;
  if(failure==='module')f.safe.getModulesPaginated=async()=>[['0x'+'f'.repeat(40)],SAFE_MODULE_SENTINEL];
  if(failure==='broken-sentinel')f.safe.getModulesPaginated=async()=>[[],'0x'+'0'.repeat(40)];
  if(['guard','fallback'].includes(failure))f.provider.getStorage=async(a,s,t)=>s===(failure==='guard'?SAFE_GUARD_SLOT:SAFE_FALLBACK_SLOT)?'0x'+'f'.repeat(64):storage(a,s,t);
  if(failure==='owners')f.safe.getOwners=async()=>[...f.manifest.safeOwners.slice(0,4),'0x'+'f'.repeat(40)];
  if(failure==='threshold')f.safe.getThreshold=async()=>1n;
  if(failure==='reorg')f.provider.getBlock=async t=>t==='latest'?f.block:{...f.block,hash:'0x'+'b'.repeat(64)};
  if(failure==='network')f.provider.send=async()=> '0x2105';
  await assert.rejects(assertSafeAuthority(f),/module|guard or fallback|authority changed|no longer canonical|Base Sepolia/);
 }
 await assert.rejects(assertRuntimeSafe({manifest:{chainId:84532}}),/verifier missing/);
});
test('an unexpected Safe module blocks proposal signing and NFT publication before file/domain work',async()=>{
 const f=fixture();f.safe.getModulesPaginated=async()=>[['0x'+'f'.repeat(40)],SAFE_MODULE_SENTINEL];
 f.assertAuthority=()=>assertSafeAuthority(f);f.safe.nonce=()=>assert.fail('No nonce/signature access');
 await assert.rejects(safeProposal(f,'0x'+'2'.repeat(40),'0x'),/Unexpected Safe module/);
 await assert.rejects(mintRelease(f,{}),/Unexpected Safe module/);
});
