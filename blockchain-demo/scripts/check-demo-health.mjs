// Non-disruptive read-only checks for the user-authorized eight-hour demo window.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Contract,JsonRpcProvider,FetchRequest,keccak256} from 'ethers';
import {ROOT,compile,artifact} from '../src/compile.mjs';
import {load,json,bosonABI} from '../src/chain.mjs';
import {BASE_RPC,BASE_CHECK_RPC,assertBase} from '../src/base-chain.mjs';
import {verifyAudit} from '../src/security.mjs';
import {DEMO_HOME} from '../src/vault.mjs';
import {assertBosonImplementation} from '../src/boson-implementation.mjs';
import {assertSafeAuthority} from '../src/safe-authority.mjs';
import {readRuntimeIdentity} from '../src/runtime-identity.mjs';
if(process.env.AIM_DEMO_NETWORK!=='base-sepolia')throw new Error('Explicit Base Sepolia profile required');
const providers=[BASE_RPC,BASE_CHECK_RPC].map(url=>{const f=new FetchRequest(url);f.timeout=15000;return new JsonRpcProvider(f,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});});
const checks=[];
async function check(name,fn){await fn();checks.push({name,passed:true});}
let result;
try{
 const identity=await readRuntimeIdentity({url:'http://127.0.0.1:18339',network:'base-sepolia'});
 if(identity.active||identity.queued>0)result={status:'busy',reason:'User/demo operation active or queued; chain checks deferred'};
 else{
 const response=await fetch('http://127.0.0.1:18339/api/evidence',{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Local demo state is unavailable');
 const state=await response.json(),m=state.manifest;
 if(state.active||state.queued>0)result={status:'busy',reason:'User/demo operation active or queued; no invasive checks performed'};
 else{
 await check('Base profile, live projection, pending protection and audit integrity',async()=>{if(m.chainId!==84532||!m.publicTransactions||state.pendingTransaction||!state.chainView?.verified||!verifyAudit())throw new Error('Chain/projection/pending/audit guard requires attention');});
 await check('two RPC chains and pinned contract code',async()=>{for(const p of providers){await assertBase(p);for(const [address,expected]of [[m.safe,m.safeCodeHash],[m.nft,m.nftCodeHash],[m.credit,m.creditCodeHash],[m.sourceBoson,m.sourceBosonCodeHash]])if(keccak256(await p.getCode(address))!==expected)throw new Error('Pinned contract code changed');}});
 await check('Boson facet routes and implementation code on two RPCs',async()=>{const blockTag=Math.min(...await Promise.all(providers.map(p=>p.getBlockNumber())))-2;const results=await Promise.all(providers.map(p=>assertBosonImplementation(p,m,{blockTag})));if(results[0].digest!==results[1].digest||results[0].digest!==m.sourceBosonImplementationDigest||results[0].block.hash!==results[1].block.hash)throw new Error('Boson implementation differs on the RPCs');});
 await check('Safe implementation, owner quorum and no bypass modules/guard/fallback',async()=>{const blockTag=Math.min(...await Promise.all(providers.map(p=>p.getBlockNumber())))-2;const results=await Promise.all(providers.map(provider=>assertSafeAuthority({provider,manifest:m,safe:new Contract(m.safe,artifact('@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json').abi,provider)},{blockTag})));if(results[0].block.hash!==results[1].block.hash)throw new Error('Safe authority differs on the RPCs');});
 const p=providers[0],nft=new Contract(m.nft,compile().StudioRelease.abi,p),boson=new Contract(m.sourceBoson,bosonABI(),p);
 await check('current NFT ownership and accepted asset fingerprints',async()=>{for(const r of state.releases){if((await nft.ownerOf(r.tokenId)).toLowerCase()!==r.owner.toLowerCase())throw new Error('NFT ownership changed: '+r.tokenId);}
  for(const a of load('marketplace.json').assets)if(crypto.createHash('sha256').update(fs.readFileSync(a.file)).digest('hex')!==a.sha256)throw new Error('Accepted asset bytes changed: '+a.id);});
 await check('Boson order bindings remain on the public chain',async()=>{for(const order of state.orders){const x=await boson.getExchange(order.exchangeId);if(!x.exists||x.exchange.offerId.toString()!==order.offerId||x.exchange.buyerId.toString()!==order.buyerId)throw new Error('Order binding changed: '+order.exchangeId);}});
 await check('latest public receipt is canonical on both RPCs',async()=>{const last=load('public-receipts.json').at(-1);const receipts=await Promise.all(providers.map(p=>p.getTransactionReceipt(last.tx)));if(receipts.some(r=>!r||r.status!==1||r.blockHash!==last.blockHash))throw new Error('Latest receipt no longer canonical');});
 result={status:'healthy',chainId:84532,checks,receipts:state.receipts.length,nfts:state.releases.length,orders:state.orders.length};
 }
 }
}catch(error){result={status:'attention',checks,error:error.shortMessage||error.message};process.exitCode=1;}
finally{providers.forEach(p=>p.destroy());}
result.checkedAt=new Date().toISOString();
const file=path.join(ROOT,'evidence/DEMO_HEALTH_WINDOW.json'),history=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
history.push(result);const text=json(history.slice(-30))+'\n';
fs.writeFileSync(file,text,{mode:0o600});fs.writeFileSync(path.join(DEMO_HOME,'DEMO_HEALTH_WINDOW.json'),text,{mode:0o600});
console.log(json(result));
