// Explicit first enrollment only. Existing pins are never overwritten or adopted by runtime.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {FetchRequest,JsonRpcProvider} from 'ethers';
import {ROOT} from '../src/compile.mjs';
import {load} from '../src/chain.mjs';
import {BASE_RPC,BASE_CHECK_RPC,assertBase} from '../src/base-chain.mjs';
import {readBosonImplementation} from '../src/boson-implementation.mjs';
if(process.env.AIM_DEMO_NETWORK!=='base-sepolia'||!process.argv.includes('--enroll'))throw new Error('Explicit Base enrollment required');
const destination=path.join(ROOT,'boson-implementation.json');
if(fs.existsSync(destination))throw new Error('Pin already exists; refusing to overwrite or silently accept an upgrade');
const manifest=load('manifest.json');if(!manifest?.publicTransactions||load('pending.json'))throw new Error('Idle existing public manifest required');
const providers=[BASE_RPC,BASE_CHECK_RPC].map(url=>{const f=new FetchRequest(url);f.timeout=20000;return new JsonRpcProvider(f,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});});
try{
  for(const p of providers)await assertBase(p);
  const block=await providers[0].getBlock('latest');assert.equal((await providers[1].getBlock(block.number)).hash,block.hash);
  const [a,b]=await Promise.all(providers.map(p=>readBosonImplementation(p,manifest,{blockTag:block.number})));
  assert.equal(a.digest,b.digest);assert.equal(a.block.hash,b.block.hash);
  const record={schemaVersion:1,pinnedAt:new Date().toISOString(),testOnly:true,providersVerified:2,
    block:a.block,digest:a.digest,snapshot:a.snapshot,
    limits:'First enrollment of the official SDK-addressed Base Sepolia deployment, with two-RPC agreement and previously pinned proxy code. This is a baseline of observed public code, not an independent source audit. Runtime refuses future facet route or bytecode changes; protocol storage/configuration and voucher implementations are outside this snapshot.'};
  fs.writeFileSync(destination,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o644});
  console.log(JSON.stringify({pinnedAt:record.pinnedAt,block:a.block,digest:a.digest,facets:a.snapshot.facets.length,selectors:a.snapshot.facets.reduce((n,f)=>n+f.selectors.length,0),chainWrites:0},null,2));
}finally{providers.forEach(p=>p.destroy());}
