import fs from 'node:fs';
import path from 'node:path';
import {Contract,keccak256,toUtf8Bytes} from 'ethers';
import {ROOT} from './compile.mjs';

export const BOSON_LOUPE_ABI=['function facets() view returns(tuple(address facetAddress,bytes4[] functionSelectors)[])'];
const address=/^0x[0-9a-f]{40}$/,hash=/^0x[0-9a-f]{64}$/,selector=/^0x[0-9a-f]{8}$/;
export function normalizeBosonImplementation(snapshot){
  if(snapshot?.chainId!==84532||!address.test(snapshot.diamond)||!hash.test(snapshot.proxyCodeHash)||!Array.isArray(snapshot.facets)||!snapshot.facets.length||snapshot.facets.length>64)throw new Error('Invalid pinned Boson implementation');
  const addresses=new Set(),selectors=new Set();
  const facets=snapshot.facets.map(f=>{
    if(!address.test(f.address)||f.address==='0x'+'0'.repeat(40)||addresses.has(f.address)||!hash.test(f.codeHash)||!Array.isArray(f.selectors)||!f.selectors.length||f.selectors.length>1024)throw new Error('Invalid pinned Boson facet');
    addresses.add(f.address);
    for(const s of f.selectors){if(!selector.test(s)||selectors.has(s))throw new Error('Invalid or duplicate Boson selector');selectors.add(s);}
    return {address:f.address,codeHash:f.codeHash,selectors:[...f.selectors].sort()};
  }).sort((a,b)=>a.address.localeCompare(b.address));
  if(selectors.size>2048)throw new Error('Boson selector limit exceeded');
  return {chainId:84532,diamond:snapshot.diamond,proxyCodeHash:snapshot.proxyCodeHash,facets};
}
export function bosonImplementationDigest(snapshot){return keccak256(toUtf8Bytes(JSON.stringify(normalizeBosonImplementation(snapshot))));}
export function assertBosonImplementationSnapshot(actual,expected){
  const a=normalizeBosonImplementation(actual),e=normalizeBosonImplementation(expected);
  if(bosonImplementationDigest(a)!==bosonImplementationDigest(e))throw new Error('Boson implementation changed; facet routes/code must be reviewed, never automatically repinned');
  return a;
}
export async function readBosonImplementation(provider,manifest,{blockTag}={}){
  if(manifest?.chainId!==84532||!manifest.sourceBoson||!manifest.sourceBosonCodeHash)throw new Error('Pinned public Base Boson manifest required');
  if(Number(await provider.send('eth_chainId',[]))!==84532)throw new Error('Boson implementation requires public Base Sepolia');
  const block=await provider.getBlock(blockTag??'latest');if(!block?.hash||!Number.isSafeInteger(block.number))throw new Error('Missing Boson implementation block');
  const diamond=manifest.sourceBoson.toLowerCase(),proxy=await provider.getCode(diamond,block.number);
  if(proxy==='0x'||keccak256(proxy)!==manifest.sourceBosonCodeHash)throw new Error('Boson proxy code changed');
  const records=await new Contract(diamond,BOSON_LOUPE_ABI,provider).facets({blockTag:block.number});
  if(!records.length||records.length>64)throw new Error('Invalid Boson loupe response');
  const facets=await Promise.all(records.map(async f=>{
    const target=f.facetAddress.toLowerCase(),code=await provider.getCode(target,block.number);
    if(code==='0x')throw new Error('Boson facet has no code');
    return {address:target,codeHash:keccak256(code),selectors:Array.from(f.functionSelectors,s=>s.toLowerCase())};
  }));
  const snapshot=normalizeBosonImplementation({chainId:84532,diamond,proxyCodeHash:keccak256(proxy),facets});
  if((await provider.getBlock(block.number))?.hash!==block.hash)throw new Error('Boson implementation block is no longer canonical');
  return {snapshot,block:{number:block.number,hash:block.hash},digest:bosonImplementationDigest(snapshot)};
}
export function loadBosonImplementationPin(){
  const record=JSON.parse(fs.readFileSync(path.join(ROOT,'boson-implementation.json'),'utf8'));
  const snapshot=normalizeBosonImplementation(record.snapshot);
  if(record.digest!==bosonImplementationDigest(snapshot))throw new Error('Pinned Boson implementation digest mismatch');
  return {snapshot,digest:record.digest};
}
export async function assertBosonImplementation(provider,manifest,options={}){
  const expected=loadBosonImplementationPin();
  if(manifest.sourceBosonImplementationDigest&&manifest.sourceBosonImplementationDigest!==expected.digest)throw new Error('Boson implementation baseline changed in local configuration');
  if(expected.snapshot.diamond!==manifest.sourceBoson?.toLowerCase()||expected.snapshot.proxyCodeHash!==manifest.sourceBosonCodeHash)throw new Error('Boson implementation pin belongs to another deployment');
  const actual=await readBosonImplementation(provider,manifest,options);
  assertBosonImplementationSnapshot(actual.snapshot,expected.snapshot);
  return actual;
}
export async function assertRuntimeBoson(ctx,options={}){
  if(ctx.manifest?.chainId!==84532)return; // Existing local fixtures are not public-network authority.
  if(typeof ctx.assertProtocol!=='function')throw new Error('Public Boson implementation verifier missing');
  return ctx.assertProtocol(options);
}
