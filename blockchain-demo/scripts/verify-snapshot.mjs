// Read-only verification of the actual running UI snapshot and its polling latency.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Contract,FetchRequest,JsonRpcProvider,formatEther,parseEther} from 'ethers';
import {ROOT} from '../src/compile.mjs';
import {load,bosonABI,json} from '../src/chain.mjs';
import {BASE_RPC,BASE_CHECK_RPC,assertBase} from '../src/base-chain.mjs';
import {DEMO_HOME} from '../src/vault.mjs';

assert.equal(process.env.AIM_DEMO_NETWORK,'base-sepolia','Explicit Base Sepolia required');
const origin=load('server-info.json').url;
assert.equal(origin,'http://127.0.0.1:18339');
const providers=[BASE_RPC,BASE_CHECK_RPC].map(url=>{
  const request=new FetchRequest(url);request.timeout=15000;
  return new JsonRpcProvider(request,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});
});
async function readSnapshot(){
  const start=performance.now();
  const response=await fetch(origin+'/api/evidence',{headers:{Connection:'close'},signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200);const state=await response.json();
  assert.equal(state.manifest.chainId,84532);assert.equal(state.chainView?.verified,true);
  assert.equal(state.active,null);assert.equal(state.pendingTransaction,false);
  return {state,ms:Math.round(performance.now()-start)};
}
try{
  const first=await readSnapshot(),state=first.state,m=state.manifest;
  const pinned=JSON.parse(fs.readFileSync(path.join(ROOT,'evidence/BASE_DEPLOYMENT_MANIFEST.json')));
  for(const field of ['safe','nft','credit','sourceBoson'])assert.equal(m[field],pinned[field]);
  const frames=await Promise.all(Array.from({length:5},readSnapshot));
  const sameFrame=frames.filter(frame=>frame.state.chainView.checkedAt===state.chainView.checkedAt);
  for(const {state:next} of sameFrame){
    assert.deepEqual(next.commerce,state.commerce);assert.deepEqual(next.funding,state.funding);
    assert.equal(next.paused,state.paused);assert.deepEqual(next.orders,state.orders);
  }
  const buyer=state.wallets.find(w=>w.role==='buyer').address;
  const operator=state.wallets.find(w=>w.role==='operator').address;
  const block=state.chainView.block,options={blockTag:block};
  const independent=[];
  for(const provider of providers){
    await assertBase(provider);
    const credit=new Contract(m.credit,['function balanceOf(address) view returns (uint256)'],provider);
    const nft=new Contract(m.nft,['function paused() view returns (bool)'],provider);
    const boson=new Contract(m.sourceBoson,bosonABI(),provider);
    const [canonical,balance,buyerBalance,protocolBalance,sellerFunds,buyerFunds,paused]=await Promise.all([
      provider.getBlock(block),provider.getBalance(operator,block),credit.balanceOf(buyer,options),
      credit.balanceOf(m.sourceBoson,options),boson.getAllAvailableFunds(state.commerce.sellerId,options),
      state.orders.length?boson.getAllAvailableFunds(state.orders[0].buyerId,options):[],nft.paused(options)
    ]);
    assert.equal(canonical.hash,state.chainView.blockHash);
    const amount=funds=>formatEther(funds.find(f=>f.tokenAddress.toLowerCase()===m.credit.toLowerCase())?.availableAmount||0n);
    const verified={blockHash:canonical.hash,operatorBalance:balance.toString(),buyerBalance:formatEther(buyerBalance),
      protocolBalance:formatEther(protocolBalance),sellerAvailable:amount(sellerFunds),buyerRefundAvailable:amount(buyerFunds),paused};
    assert.equal(state.funding.balance,verified.operatorBalance);
    for(const field of ['buyerBalance','protocolBalance','sellerAvailable','buyerRefundAvailable'])assert.equal(parseEther(state.commerce[field]),parseEther(verified[field]));
    assert.equal(state.paused,paused);independent.push(verified);
  }
  assert.deepEqual(independent[0],independent[1]);
  const final=await readSnapshot();assert.equal(final.state.receipts.length,state.receipts.length);
  const report={verifiedAt:new Date().toISOString(),chainId:84532,passed:true,readOnly:true,
    receiptCountBefore:state.receipts.length,receiptCountAfter:final.state.receipts.length,newTransactions:0,
    singleBlockBalancesAndPauseVerified:true,block,blockHash:state.chainView.blockHash,providersRequired:2,
    cacheSeconds:state.chainView.refreshSeconds,simultaneousReaders:frames.length,
    sameCachedFrameReaders:sameFrame.length,firstResponseMs:first.ms,responseTimesMs:frames.map(f=>f.ms),
    verificationScope:'Actual server balances, funds and pause checked at its stated block on two RPCs. Concurrent polling measured without chain writes; latency is machine/network specific.'};
  const text=json(report)+'\n';fs.writeFileSync(path.join(ROOT,'evidence/SNAPSHOT_VERIFICATION.json'),text,{mode:0o600});
  fs.writeFileSync(path.join(DEMO_HOME,'SNAPSHOT_VERIFICATION.json'),text,{mode:0o600});console.log(text);
}finally{providers.forEach(provider=>provider.destroy());}
