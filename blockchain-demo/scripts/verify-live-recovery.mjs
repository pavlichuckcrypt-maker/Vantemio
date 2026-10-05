// Explicit fault-injection test: one valueless Base Sepolia service purchase, then cancel/refund.
// Never rerun a partially started probe: inspect its durable intent instead.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Contract,JsonRpcProvider,FetchRequest,formatEther,parseEther} from 'ethers';
import {ROOT} from '../src/compile.mjs';
import {load,save,json,hash,bosonABI} from '../src/chain.mjs';
import {BASE_RPC,connectBase} from '../src/base-chain.mjs';
import {commitOrder} from '../src/boson.mjs';
import {runIdempotent} from '../src/idempotency.mjs';
import {validateMarketAction} from '../src/market-schema.mjs';
import {writeDurableJSON} from '../src/durable-json.mjs';
import {verifyPurchaseReceipt} from '../src/purchase-recovery.mjs';
import {BASE_CHECK_RPC} from '../src/base-chain.mjs';

if(process.env.AIM_DEMO_NETWORK!=='base-sepolia')throw new Error('Explicit Base Sepolia profile required');
const probeFile='live-recovery-probe.json',origin='http://127.0.0.1:18339';
if(process.argv.includes('--crash-child')){
  const probe=load(probeFile),manifest=load('manifest.json');
  if(probe?.status!=='prepared'||manifest?.chainId!==84532||!manifest.nft||!manifest.credit||!manifest.safe||load('pending.json'))throw new Error('Probe is not fresh or contracts are not registered');
  const input=validateMarketAction(probe.input),market=load('marketplace.json'),state=load('state.json');
  const listing=market.listings.find(l=>l.id===input.listingId&&l.kind==='service'&&l.offerId==='134'&&l.price==='11');
  if(input.action!=='buy'||!listing||market.requests[input.idempotencyKey])throw new Error('Probe does not target the registered 11 DEMO test service');
  save(probeFile,{...probe,status:'started'});
  const {loadWallets}=await import('../src/vault.mjs');const {wallets}=await loadWallets();
  const ctx=await connectBase(wallets),send=ctx.transact;
  if(await ctx.provider.getBalance(wallets.buyer.address)<parseEther('0.00005'))await send('fund-demo-buyer',async()=>({to:wallets.buyer.address,value:parseEther('0.00008')}),{gasFunding:true});
  ctx.marketRequest={key:input.idempotencyKey,digest:hash(JSON.stringify(input)),action:'buy'};
  ctx.transact=async(label,populate,options)=>{
    const receipt=await send(label,populate,options);
    if(label==='boson-commit'){
      save(probeFile,{...probe,status:'crash-triggered',confirmedCommit:receipt.hash});
      console.log('Canonical commit archived. Exiting before commitOrder can save its domain order.');
      process.exit(91);
    }
    return receipt;
  };
  await runIdempotent(market.requests,input,()=>commitOrder(ctx,state,listing),()=>save('marketplace.json',market));
  throw new Error('Fault-injection point was not reached');
}

async function readState(){for(let attempt=0;;attempt++){try{const response=await fetch(origin+'/api/state',{headers:{Connection:'close'},signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error('Demo state unavailable');return await response.json();}catch(error){if(attempt>=2||!['EPIPE','ECONNRESET','UND_ERR_SOCKET'].includes(error.cause?.code)&&error.name!=='TimeoutError')throw error;}}}
async function post(state,input){const response=await fetch(origin+'/api/market/action',{method:'POST',headers:{Origin:origin,Connection:'close','Content-Type':'application/json','X-Demo-CSRF':state.csrf},body:JSON.stringify(input),signal:AbortSignal.timeout(150000)});const data=await response.json();if(!response.ok)throw new Error(data.error);return data.result;}
function launcher(script){const result=spawnSync(process.execPath,[path.join(ROOT,'scripts',script)],{cwd:ROOT,env:process.env,stdio:'inherit',timeout:180000});if(result.status!==0)throw new Error('Demo launcher failed: '+script);}
const before=await readState();
if(before.manifest.chainId!==84532||!before.chainView?.verified||before.active||before.pendingTransaction)throw new Error('Defer fault injection: demo busy/pending/unverified');
if(process.argv.includes('--finish-probe')){
  const probe=load(probeFile),market=load('marketplace.json'),state=load('state.json');
  if(probe?.status!=='crash-triggered')throw new Error('No confirmed crashed probe to finish; no new purchase will be made');
  const input=validateMarketAction(probe.input),entry=market.requests[input.idempotencyKey];
  const record=load('confirmed-intents.json',[]).find(r=>r.tx===probe.confirmedCommit&&r.operation?.key===input.idempotencyKey);
  if(!record||entry?.status!=='confirmed'||!entry.recovered)throw new Error('Probe lacks a recovered confirmed request');
  const providers=[BASE_RPC,BASE_CHECK_RPC].map(url=>{const f=new FetchRequest(url);f.timeout=20000;return new JsonRpcProvider(f,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});});
  try{
    const ctx={manifest:before.manifest,wallets:Object.fromEntries(before.wallets.map(w=>[w.role,{address:w.address}])),boson:new Contract(before.manifest.sourceBoson,bosonABI(),providers[0])};
    const verified=await verifyPurchaseReceipt(ctx,state,market,record,providers),order=before.orders.find(o=>o.exchangeId===verified.exchangeId);
    if(!order?.recovered||order.exchangeId!==entry.result.exchangeId||!['COMMITTED','CANCELLED'].includes(order.state))throw new Error('Recovered probe order differs from its public receipt');
    const credits=providers.map(p=>new Contract(before.manifest.credit,['function balanceOf(address) view returns(uint256)'],p)),buyer=ctx.wallets.buyer.address;
    const oldBalances=await Promise.all(credits.map(c=>c.balanceOf(buyer,{blockTag:record.block-1})));
    if(oldBalances[0]!==oldBalances[1])throw new Error('RPCs disagree on the buyer credit before the probe');
    const count=before.receipts.length,replay=await post(before,input);
    if(!replay.idempotent||replay.exchangeId!==order.exchangeId||(await readState()).receipts.length!==count)throw new Error('Recovered replay changed public receipts');
    probe.finishKeys=probe.finishKeys||{cancel:randomUUID(),refund:randomUUID()};save(probeFile,probe);
    console.log('Finishing recovered order #'+order.exchangeId+' without a new purchase.');
    if(order.state==='COMMITTED')await post(before,{action:'cancel',exchangeId:order.exchangeId,idempotencyKey:probe.finishKeys.cancel});
    const cancelled=await readState();if(!cancelled.orders.find(o=>o.exchangeId===order.exchangeId)?.refundWithdrawn)await post(cancelled,{action:'refund',exchangeId:order.exchangeId,idempotencyKey:probe.finishKeys.refund});
    const final=await readState(),closed=final.orders.find(o=>o.exchangeId===order.exchangeId),balanceAfter=await credits[0].balanceOf(buyer);
    if(closed.state!=='CANCELLED'||!closed.refundWithdrawn||balanceAfter!==oldBalances[0]||final.pendingTransaction)throw new Error('Recovered probe did not close with an exact DEMO refund');
    const report={checkedAt:new Date().toISOString(),chainId:84532,passed:true,actualCrashExitCode:91,faultPoint:'Canonical commit archived and pending hash cleared; domain order not yet saved',publicExchangeRecovered:order.exchangeId,
      commitTransaction:record.tx,runtimeStartupRecovery:true,providersRequired:2,replayCreatedTransactions:0,finalOrderState:closed.state,refundWithdrawn:true,
      buyerCreditBefore:formatEther(oldBalances[0]),buyerCreditAfter:formatEther(balanceAfter),creditBeforeSource:'Identical historical balance on both RPCs at the block before commitment',
      receiptCountBefore:probe.receiptCountBefore,receiptCountAfter:final.receipts.length,newReceipts:final.receipts.slice(probe.receiptCountBefore),
      verifierResumedAfter:'Stale localhost connection after restart; no purchase or transaction was resubmitted',
      testScope:'Real protected testnet purchase and deliberate child exit, actual runtime startup recovery, same-key replay, cancellation and exact refund. Parent verifier resumed after a read-only connection failure.'};
    writeDurableJSON(path.join(ROOT,'evidence/LIVE_PURCHASE_RECOVERY_VERIFICATION.json'),json(report)+'\n');save(probeFile,{...probe,status:'completed',exchangeId:order.exchangeId,completedAt:report.checkedAt});console.log(json(report));
  }finally{providers.forEach(p=>p.destroy());}
  process.exit(0);
}
const previous=load(probeFile);if(previous&&previous.status!=='completed')throw new Error('A previous probe requires inspection; no second purchase will be sent');
const listing=before.marketplace.listings.find(l=>l.offerId==='134'&&l.kind==='service'&&l.price==='11'&&l.available);
if(!listing)throw new Error('The registered service offer is unavailable');
const request=new FetchRequest(BASE_RPC);request.timeout=15000;const provider=new JsonRpcProvider(request,84532,{staticNetwork:true,batchMaxCount:1});
const buyer=before.wallets.find(w=>w.role==='buyer').address,credit=new Contract(before.manifest.credit,['function balanceOf(address) view returns(uint256)'],provider);
const balanceBefore=await credit.balanceOf(buyer),input={action:'buy',listingId:listing.id,idempotencyKey:randomUUID()};
let stopped=false;
try{
  save(probeFile,{status:'prepared',input,preparedAt:new Date().toISOString(),receiptCountBefore:before.receipts.length,buyerCreditBefore:balanceBefore.toString()});
  console.log('Stopping idle demo for the controlled crash test.');launcher('stop-demo.mjs');stopped=true;
  const child=spawnSync(process.execPath,[path.join(ROOT,'scripts/verify-live-recovery.mjs'),'--crash-child'],{cwd:ROOT,env:process.env,stdio:'inherit',timeout:240000});
  if(child.status!==91||load(probeFile)?.status!=='crash-triggered')throw new Error('Crash test did not reach its confirmed fault point; inspect the probe and pending journal');
  if(load('state.json').orders.length!==before.orders.length||load('marketplace.json').requests[input.idempotencyKey]?.status!=='pending'||load('pending.json'))throw new Error('Fault was not between confirmed intent and domain order persistence');
  console.log('Starting demo; two-RPC reconciliation must recover the order.');launcher('start-demo.mjs');stopped=false;
  const restored=await readState(),entry=load('marketplace.json').requests[input.idempotencyKey],order=restored.orders.find(o=>o.exchangeId===entry.result?.exchangeId);
  if(entry.status!=='confirmed'||!entry.recovered||!order?.recovered||order.state!=='COMMITTED'||restored.pendingTransaction||restored.orders.length!==before.orders.length+1)throw new Error('Runtime startup did not recover the confirmed purchase');
  const count=restored.receipts.length,replay=await post(restored,input);
  if(!replay.idempotent||replay.exchangeId!==order.exchangeId||(await readState()).receipts.length!==count)throw new Error('Recovered purchase replay was not idempotent');
  console.log('Recovered order #'+order.exchangeId+'. Cancelling and refunding its 11 DEMO.');
  await post(restored,{action:'cancel',exchangeId:order.exchangeId,idempotencyKey:randomUUID()});
  await post(restored,{action:'refund',exchangeId:order.exchangeId,idempotencyKey:randomUUID()});
  const final=await readState(),closed=final.orders.find(o=>o.exchangeId===order.exchangeId),balanceAfter=await credit.balanceOf(buyer);
  if(closed.state!=='CANCELLED'||!closed.refundWithdrawn||balanceAfter!==balanceBefore||final.pendingTransaction)throw new Error('Fault probe did not close with an exact DEMO refund');
  const report={checkedAt:new Date().toISOString(),chainId:84532,passed:true,actualCrashExitCode:91,faultPoint:'Canonical commit archived and pending hash cleared; domain order not yet saved',
    publicExchangeRecovered:order.exchangeId,commitTransaction:load(probeFile).confirmedCommit,runtimeStartupRecovery:true,providersRequired:2,replayCreatedTransactions:0,
    finalOrderState:closed.state,refundWithdrawn:true,buyerCreditBefore:formatEther(balanceBefore),buyerCreditAfter:formatEther(balanceAfter),
    receiptCountBefore:before.receipts.length,receiptCountAfter:final.receipts.length,newReceipts:final.receipts.slice(before.receipts.length),
    testScope:'One real valueless Base Sepolia service purchase via protected code, deliberate child-process exit, actual demo restart, read-only startup recovery, same-key replay, cancellation and exact refund. Existing investor workflow and assets preserved.'};
  writeDurableJSON(path.join(ROOT,'evidence/LIVE_PURCHASE_RECOVERY_VERIFICATION.json'),json(report)+'\n');
  save(probeFile,{...load(probeFile),status:'completed',exchangeId:order.exchangeId,completedAt:report.checkedAt});console.log(json(report));
}finally{if(stopped)launcher('start-demo.mjs');provider.destroy();}
