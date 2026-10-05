// One resumable real testnet purchase after a payment-path change, followed by cancellation/refund.
// A saved completed probe never creates a second purchase. No faucet or new offer/NFT is used.
import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Contract,JsonRpcProvider,FetchRequest,formatEther,keccak256,parseEther} from 'ethers';
import {ROOT} from '../src/compile.mjs';
import {load,save,json,bosonABI} from '../src/chain.mjs';
import {BASE_RPC,BASE_CHECK_RPC,assertBase} from '../src/base-chain.mjs';
import {writeDurableJSON} from '../src/durable-json.mjs';

if(process.env.AIM_DEMO_NETWORK!=='base-sepolia')throw new Error('Explicit Base Sepolia profile required');
const probeName='live-purchase-preflight-probe.json',origin='http://127.0.0.1:18339';
const providers=[BASE_RPC,BASE_CHECK_RPC].map(url=>{const f=new FetchRequest(url);f.timeout=20000;return new JsonRpcProvider(f,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});});
async function state(){const r=await fetch(origin+'/api/state',{headers:{Connection:'close'},signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);const s=await r.json();assert.equal(s.manifest.chainId,84532);assert.equal(s.chainView?.verified,true);assert.equal(s.pendingTransaction,false);assert.equal(s.active,null);return s;}
async function action(s,input){const r=await fetch(origin+'/api/market/action',{method:'POST',headers:{Origin:origin,Connection:'close','Content-Type':'application/json','X-Demo-CSRF':s.csrf},body:JSON.stringify(input),signal:AbortSignal.timeout(180000)});const body=await r.json();if(!r.ok)throw new Error(body.error||'Test action failed');return body.result;}
try{
  let s=await state();
  for(const p of providers){await assertBase(p);assert.equal(keccak256(await p.getCode(s.manifest.sourceBoson)),s.manifest.sourceBosonCodeHash);assert.equal(keccak256(await p.getCode(s.manifest.credit)),s.manifest.creditCodeHash);}
  const buyer=s.wallets.find(w=>w.role==='buyer').address,credits=providers.map(p=>new Contract(s.manifest.credit,['function balanceOf(address) view returns(uint256)'],p));
  const nfts=providers.map(p=>new Contract(s.manifest.nft,['function ownerOf(uint256) view returns(address)'],p));
  let probe=load(probeName);
  if(!probe){
    const listing=s.marketplace.listings.find(l=>l.offerId==='133'&&l.kind==='digital'&&l.price==='7.5'&&l.available);
    assert.ok(listing,'Existing 7.5 DEMO digital offer required');
    const asset=s.marketplace.assets.find(a=>a.id===listing.assetId);assert.equal(asset?.certificate?.tokenId,'3');
    const block=await providers[0].getBlock('latest');assert.equal((await providers[1].getBlock(block.number)).hash,block.hash);
    const balances=await Promise.all(credits.map(c=>c.balanceOf(buyer,{blockTag:block.number})));assert.equal(balances[0],balances[1]);
    const owners=await Promise.all(nfts.map(n=>n.ownerOf('3',{blockTag:block.number})));assert.equal(owners[0],owners[1]);
    for(const p of providers)assert.ok(await p.getBalance(buyer)>=parseEther('0.00003'),'Insufficient demo buyer gas; no automatic refill');
    probe={status:'prepared',preparedAt:new Date().toISOString(),listingId:listing.id,offerId:'133',tokenId:'3',buyer,
      balanceBefore:balances[0].toString(),ownerBefore:owners[0],beforeBlock:{number:block.number,hash:block.hash},receiptCountBefore:s.receipts.length,
      keys:{buy:randomUUID(),cancel:randomUUID(),refund:randomUUID()}};
    save(probeName,probe);
  }
  assert.equal(probe.buyer,buyer);assert.equal(probe.offerId,'133');assert.equal(probe.tokenId,'3');
  if(probe.status!=='completed'){
    // Resume only the same persisted purchase input. Backend reconciles a confirmed lost response.
    if(!probe.exchangeId){
      probe.status='buy-started';save(probeName,probe);
      const result=await action(s,{action:'buy',listingId:probe.listingId,idempotencyKey:probe.keys.buy});
      probe.exchangeId=result.exchangeId;probe.status='committed';save(probeName,probe);s=await state();
    }
    const count=s.receipts.length,replay=await action(s,{action:'buy',listingId:probe.listingId,idempotencyKey:probe.keys.buy});
    assert.equal(replay.exchangeId,probe.exchangeId);assert.equal(replay.idempotent,true);s=await state();assert.equal(s.receipts.length,count);
    probe.replayCreatedTransactions=0;save(probeName,probe);
    let order=s.orders.find(o=>o.exchangeId===probe.exchangeId);assert.ok(order);assert.equal(order.offerId,probe.offerId);
    if(order.state==='COMMITTED'){await action(s,{action:'cancel',exchangeId:probe.exchangeId,idempotencyKey:probe.keys.cancel});s=await state();}
    order=s.orders.find(o=>o.exchangeId===probe.exchangeId);assert.equal(order.state,'CANCELLED');
    if(!order.refundWithdrawn){await action(s,{action:'refund',exchangeId:probe.exchangeId,idempotencyKey:probe.keys.refund});s=await state();}
    probe.status='closed';save(probeName,probe);
  }
  const order=s.orders.find(o=>o.exchangeId===probe.exchangeId);assert.equal(order?.state,'CANCELLED');assert.equal(order.refundWithdrawn,true);
  const block=await providers[0].getBlock('latest');assert.equal((await providers[1].getBlock(block.number)).hash,block.hash);
  for(let i=0;i<providers.length;i++){
    assert.equal(await credits[i].balanceOf(buyer,{blockTag:block.number}),BigInt(probe.balanceBefore));
    assert.equal(await nfts[i].ownerOf(probe.tokenId,{blockTag:block.number}),probe.ownerBefore);
    const exchange=await new Contract(s.manifest.sourceBoson,bosonABI(),providers[i]).getExchange(probe.exchangeId,{blockTag:block.number});
    assert.equal(exchange.exists,true);assert.equal(exchange.exchange.state,2n);assert.equal(exchange.exchange.offerId.toString(),probe.offerId);
    for(const record of s.receipts.slice(probe.receiptCountBefore)){
      const receipt=await providers[i].getTransactionReceipt(record.tx);assert.equal(receipt?.status,1);assert.equal(receipt.blockHash,record.blockHash);
      assert.equal((await providers[i].getBlock(receipt.blockNumber)).hash,receipt.blockHash);assert.ok(await receipt.confirmations()>=3);
    }
  }
  const report={verifiedAt:new Date().toISOString(),passed:true,chainId:84532,testOnly:true,providersVerified:2,
    exchangeId:probe.exchangeId,offerId:probe.offerId,price:'7.5',finalOrderState:'CANCELLED',refundWithdrawn:true,
    buyerCreditBefore:formatEther(BigInt(probe.balanceBefore)),buyerCreditAfter:formatEther(BigInt(probe.balanceBefore)),
    nftPassportOwnerUnchanged:true,replayCreatedTransactions:probe.replayCreatedTransactions,
    receiptCountBefore:probe.receiptCountBefore,receiptCountAfter:s.receipts.length,newReceipts:s.receipts.slice(probe.receiptCountBefore),
    confirmedBlock:{number:block.number,hash:block.hash},
    scope:'One real HTTP purchase through the changed canonical offer-availability guard, same-key replay, cancellation and exact test-token refund. Public receipts, exchange state, buyer balance and unchanged NFT ownership verified on two RPCs. Persistent private probe keys allow only this purchase to resume; a completed run sends nothing. Stock is consumed by a Boson commitment even when cancelled. No real-money sale or transfer of copyright/NFT is demonstrated.'};
  writeDurableJSON(path.join(ROOT,'evidence/LIVE_PURCHASE_PREFLIGHT_VERIFICATION.json'),json(report)+'\n');
  save(probeName,{...probe,status:'completed',completedAt:report.verifiedAt});console.log(json(report));
}catch(e){console.error('LIVE_PREFLIGHT_FAILED:',e.shortMessage||e.message,'Inspect the private saved probe and pending journal; never start another purchase key.');process.exitCode=1;}
finally{providers.forEach(p=>p.destroy());}
