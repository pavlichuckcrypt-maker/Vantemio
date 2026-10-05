// Real Base receipts, isolated local crash fixture, no wallet loading or chain writes.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Contract,JsonRpcProvider,FetchRequest} from 'ethers';
import {ROOT} from '../src/compile.mjs';
import {RUNTIME,load,json,hash,bosonABI} from '../src/chain.mjs';
import {BASE_RPC,BASE_CHECK_RPC} from '../src/base-chain.mjs';
import {reconcilePurchases} from '../src/purchase-recovery.mjs';
import {runIdempotent} from '../src/idempotency.mjs';
import {writeDurableJSON} from '../src/durable-json.mjs';
if(process.env.AIM_DEMO_NETWORK!=='base-sepolia')throw new Error('Explicit Base Sepolia profile required');
async function readLive(){
  for(let attempt=0;;attempt++){
    try{const response=await fetch('http://127.0.0.1:18339/api/evidence',{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Demo state HTTP '+response.status);return await response.json();}
    catch(error){if(attempt>=2||!['ECONNRESET','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT'].includes(error.cause?.code)&&error.name!=='TimeoutError')throw error;}
  }
}
const live=await readLive();
if(live.active||live.pendingTransaction||!live.chainView?.verified)throw new Error('Defer recovery check while demo is busy/pending/unverified');
const state=structuredClone(load('state.json')),market=structuredClone(load('marketplace.json'));
const selected=state.orders.find(order=>order.exchangeId==='253');if(!selected)throw new Error('Recorded completed order is missing');
let input;
for(const [key,record]of Object.entries(market.requests)){
  if(record.status!=='confirmed'||record.result?.exchangeId!==selected.exchangeId)continue;
  const candidate={action:'buy',listingId:selected.listingId,idempotencyKey:key};
  if(hash(JSON.stringify(candidate))===record.digest){input=candidate;break;}
}
if(!input)throw new Error('Recorded purchase request is unavailable');
const receipt=load('public-receipts.json').find(r=>r.tx===selected.txs.find(t=>t.action==='commit').tx);
if(!receipt)throw new Error('Recorded commit receipt is unavailable');
const digest=hash(JSON.stringify(input)),record={...receipt,operation:{key:input.idempotencyKey,digest,action:'buy'}};
// This intent linkage is a fixture for a pre-upgrade transaction. New sends archive it before broadcast.
state.orders=state.orders.filter(order=>order.exchangeId!==selected.exchangeId);
market.requests[input.idempotencyKey]={digest,input,status:'pending',at:new Date().toISOString()};
const directory=path.join(RUNTIME,'recovery-verification-'+randomUUID());fs.mkdirSync(directory,{mode:0o700});
const stateFile=path.join(directory,'state.json'),marketFile=path.join(directory,'marketplace.json');
const persistState=()=>writeDurableJSON(stateFile,json(state)),persistMarket=()=>writeDurableJSON(marketFile,json(market));persistState();persistMarket();
const providers=[BASE_RPC,BASE_CHECK_RPC].map(url=>{const request=new FetchRequest(url);request.timeout=15000;return new JsonRpcProvider(request,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});});
const ctx={manifest:live.manifest,wallets:Object.fromEntries(live.wallets.map(w=>[w.role,{address:w.address}])),provider:providers[0],
  boson:new Contract(live.manifest.sourceBoson,bosonABI(),providers[0])};
try{
  const result=await reconcilePurchases(ctx,state,market,[record],{providers,persistState,persistMarket});
  if(result.length!==1||result[0].exchangeId!=='253'||result[0].state!=='COMPLETED'||state.orders.length!==live.orders.length)throw new Error('Public order reconstruction failed');
  const restarted=JSON.parse(fs.readFileSync(marketFile,'utf8'));
  const retry=await runIdempotent(restarted.requests,input,()=>{throw new Error('Duplicate purchase attempted');},()=>{});
  if(!retry.idempotent||retry.exchangeId!=='253')throw new Error('Recovered intent did not survive a local state reload');
  if((await reconcilePurchases(ctx,state,market,[record],{providers,persistState,persistMarket})).length!==0)throw new Error('Recovery produced duplicate local orders');
  const after=await readLive();
  if(after.receipts.length!==live.receipts.length||after.orders.length!==live.orders.length||after.pendingTransaction)throw new Error('Live demo was changed during isolated recovery check');
  const report={checkedAt:new Date().toISOString(),chainId:84532,passed:true,publicExchangeRecovered:'253',state:'COMPLETED',
    commitTransaction:receipt.tx,providersVerified:2,chainWritesCreated:0,liveDemoModified:false,
    receiptCountBefore:live.receipts.length,receiptCountAfter:after.receipts.length,
    testScope:'Real public Boson receipt and contract reads; missing order and pending request injected into isolated local files. Historical request-to-receipt linkage is a fixture; no live crash or new transaction was induced.',
    checks:['canonical success and at least three confirmations on both RPCs','exact buyer/target/chain/value/calldata and official BuyerCommitted event','pinned Boson/DEMO code and exact registered offer terms','identical buyer/exchange/offer state at a shared canonical block','missing order reconstructed without a signer','saved intent returns the same order after local state reload','repeat reconstruction does not duplicate the local order']};
  writeDurableJSON(path.join(ROOT,'evidence/PURCHASE_RECOVERY_VERIFICATION.json'),json(report)+'\n');console.log(json(report));
}finally{providers.forEach(p=>p.destroy());}
