// One real, resumable withdrawal of existing TEST seller proceeds through the HTTP gateway.
import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Contract,FetchRequest,JsonRpcProvider,formatEther} from 'ethers';
import {ROOT} from '../src/compile.mjs';
import {load,save,json,bosonABI} from '../src/chain.mjs';
import {BASE_RPC,BASE_CHECK_RPC,assertBase} from '../src/base-chain.mjs';
import {writeDurableJSON} from '../src/durable-json.mjs';
const origin='http://127.0.0.1:18339',probeName='live-commerce-broadcast-probe.json';
if(process.env.AIM_DEMO_NETWORK!=='base-sepolia')throw new Error('Explicit Base profile required');
async function state(){const r=await fetch(origin+'/api/state',{signal:AbortSignal.timeout(30000),headers:{Connection:'close'}});assert.equal(r.status,200);const s=await r.json();assert.equal(s.manifest.chainId,84532);assert.equal(s.chainView?.verified,true);assert.equal(s.active,null);assert.equal(s.pendingTransaction,false);return s;}
const providers=[BASE_RPC,BASE_CHECK_RPC].map(url=>{const f=new FetchRequest(url);f.timeout=20000;return new JsonRpcProvider(f,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});});
try{
 let s=await state();for(const p of providers)await assertBase(p);
 const seller=s.wallets.find(w=>w.role==='seller').address,buyer=s.wallets.find(w=>w.role==='buyer').address;
 const credits=providers.map(p=>new Contract(s.manifest.credit,['function balanceOf(address) view returns(uint256)'],p));
 const bosons=providers.map(p=>new Contract(s.manifest.sourceBoson,bosonABI(),p));
 let probe=load(probeName);
 if(!probe){
  const block=await providers[0].getBlock('latest');assert.equal((await providers[1].getBlock(block.number)).hash,block.hash);
  const available=await Promise.all(bosons.map(b=>b.getAllAvailableFunds(s.commerce.sellerId,{blockTag:block.number})));
  const amounts=available.map(rows=>rows.find(r=>r.tokenAddress.toLowerCase()===s.manifest.credit.toLowerCase())?.availableAmount??0n);
  assert.equal(amounts[0],amounts[1]);assert.ok(amounts[0]>0n,'Existing TEST seller proceeds required');
  const sellerBalances=await Promise.all(credits.map(c=>c.balanceOf(seller,{blockTag:block.number}))),buyerBalances=await Promise.all(credits.map(c=>c.balanceOf(buyer,{blockTag:block.number})));
  assert.equal(sellerBalances[0],sellerBalances[1]);assert.equal(buyerBalances[0],buyerBalances[1]);
  probe={status:'prepared',preparedAt:new Date().toISOString(),seller,buyer,sellerId:s.commerce.sellerId,
   amount:amounts[0].toString(),sellerBalanceBefore:sellerBalances[0].toString(),buyerBalanceBefore:buyerBalances[0].toString(),receiptCountBefore:s.receipts.length,
   input:{action:'withdrawSeller',idempotencyKey:randomUUID()},beforeBlock:{number:block.number,hash:block.hash}};save(probeName,probe);
 }
 assert.equal(probe.seller,seller);assert.equal(probe.buyer,buyer);
 if(!probe.tx){
  // A lost reply is resumed with this persisted key only; never create another action/key.
  probe.status='started';save(probeName,probe);
  const r=await fetch(origin+'/api/market/action',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Demo-CSRF':s.csrf,Connection:'close'},body:JSON.stringify(probe.input),signal:AbortSignal.timeout(180000)});
  const result=await r.json();if(!r.ok)throw new Error(result.error);assert.equal(result.result.amount,formatEther(BigInt(probe.amount)));assert.ok(result.result.tx);
  probe.tx=result.result.tx;probe.status='confirmed-response';save(probeName,probe);s=await state();
 }
 const count=s.receipts.length,r=await fetch(origin+'/api/market/action',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Demo-CSRF':s.csrf,Connection:'close'},body:JSON.stringify(probe.input),signal:AbortSignal.timeout(30000)}),again=await r.json();
 assert.equal(r.status,200);assert.equal(again.result.idempotent,true);assert.equal(again.result.tx,probe.tx);s=await state();assert.equal(s.receipts.length,count);
 const block=await providers[0].getBlock('latest');assert.equal((await providers[1].getBlock(block.number)).hash,block.hash);
 for(let i=0;i<providers.length;i++){
  const receipt=await providers[i].getTransactionReceipt(probe.tx);assert.equal(receipt?.status,1);assert.equal((await providers[i].getBlock(receipt.blockNumber)).hash,receipt.blockHash);assert.ok(await receipt.confirmations()>=3);
  const tx=await providers[i].getTransaction(probe.tx),decoded=bosons[i].interface.parseTransaction({data:tx.data});
  assert.equal(tx.from.toLowerCase(),seller.toLowerCase());assert.equal(tx.to.toLowerCase(),s.manifest.sourceBoson.toLowerCase());assert.equal(tx.chainId,84532n);assert.equal(tx.value,0n);assert.equal(decoded.name,'withdrawFunds');
  assert.equal(decoded.args[0].toString(),probe.sellerId);assert.equal(decoded.args[1][0].toLowerCase(),s.manifest.credit.toLowerCase());assert.equal(decoded.args[2][0],BigInt(probe.amount));
  assert.equal(await credits[i].balanceOf(seller,{blockTag:block.number}),BigInt(probe.sellerBalanceBefore)+BigInt(probe.amount));
  assert.equal(await credits[i].balanceOf(buyer,{blockTag:block.number}),BigInt(probe.buyerBalanceBefore));
  const available=await bosons[i].getAllAvailableFunds(probe.sellerId,{blockTag:block.number});assert.equal(available.find(row=>row.tokenAddress.toLowerCase()===s.manifest.credit.toLowerCase())?.availableAmount??0n,0n);
 }
 const report={verifiedAt:new Date().toISOString(),passed:true,chainId:84532,testOnly:true,providersVerified:2,policy:'demo-commerce-v3',
  transaction:probe.tx,explorer:'https://sepolia.basescan.org/tx/'+probe.tx,amount:formatEther(BigInt(probe.amount)),currency:'DEMO',
  sellerCreditBefore:formatEther(BigInt(probe.sellerBalanceBefore)),sellerCreditAfter:formatEther(BigInt(probe.sellerBalanceBefore)+BigInt(probe.amount)),buyerCreditUnchanged:true,
  sellerAvailableAfter:'0',replayCreatedTransactions:0,receiptCountBefore:probe.receiptCountBefore,receiptCountAfter:s.receipts.length,
  newReceipts:s.receipts.slice(probe.receiptCountBefore),confirmedBlock:{number:block.number,hash:block.hash},
  scope:'One real HTTP withdrawal of existing TEST proceeds, after runtime reload with v3 typed implementation binding and the final journal guard. Same-key replay adds no transaction. Exact public calldata, canonical successful receipt, three confirmations, credit balances and zero remaining seller funds checked on two RPCs. No new content, NFT, offer, purchase or real-money transfer.'};
 writeDurableJSON(path.join(ROOT,'evidence/LIVE_COMMERCE_BROADCAST_VERIFICATION.json'),json(report)+'\n');save(probeName,{...probe,status:'completed',completedAt:report.verifiedAt});console.log(json(report));
}catch(e){console.error('LIVE_BROADCAST_VERIFY_FAILED:',e.shortMessage||e.message,'Inspect the saved private probe/intent; never create another withdrawal key.');process.exitCode=1;}
finally{providers.forEach(p=>p.destroy());}
