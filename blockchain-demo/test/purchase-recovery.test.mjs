import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface,keccak256,parseEther} from 'ethers';
import {bosonABI,hash} from '../src/chain.mjs';
import {verifyPurchaseReceipt,reconcilePurchases} from '../src/purchase-recovery.mjs';
import {runIdempotent} from '../src/idempotency.mjs';
import {marketOfferMetadata} from '../src/offer-metadata.mjs';

function fixture(){
  const bosonAddress='0x'+'1'.repeat(40),buyerAddress='0x'+'2'.repeat(40),credit='0x'+'3'.repeat(40);
  const iface=new Interface(bosonABI()),txHash='0x'+'4'.repeat(64),blockHash='0x'+'5'.repeat(64),code='0x1234';
  const committed=iface.encodeEventLog(iface.getEvent('BuyerCommitted'),[3n,4n,2n,[2n,3n,4n,0n,0,bosonAddress],[100n,1000n,0n,false],buyerAddress]);
  const receipt={hash:txHash,blockNumber:77,blockHash,status:1,logs:[{...committed,address:bosonAddress}]};
  const tx={hash:txHash,chainId:84532n,from:buyerAddress,to:bosonAddress,value:0n,data:iface.encodeFunctionData('commitToOffer',[buyerAddress,3n])};
  const input={action:'buy',listingId:'sample-listing',idempotencyKey:'confirmed-recovery-key-1234'},digest=hash(JSON.stringify(input));
  const record={tx:txHash,chainId:84532,label:'boson-commit',role:'buyer',status:1,block:77,blockHash,operation:{key:input.idempotencyKey,digest,action:'buy'}};
  const listing={id:'sample-listing',offerId:'3',price:'25',title:'Demo file',description:'Test video access',terms:'Demo license',kind:'video',assetId:'demo-asset',assetSha256:'1'.repeat(64),certificate:null};
  const metadata=marketOfferMetadata(listing);listing.metadataHash=metadata.metadataHash;
  const state={sellerId:'7',orders:[]},market={listings:[listing],requests:{[input.idempotencyKey]:{input,digest,status:'pending'}}};
  const providers=[0,1].map(()=>({send:async()=> '0x14a34',getTransactionReceipt:async()=>structuredClone(receipt),getTransaction:async()=>structuredClone(tx),getBlockNumber:async()=>80,getBlock:async n=>({number:n,hash:n===77?blockHash:'snapshot',timestamp:100}),getCode:async()=>code}));
  const contract=()=>({getExchange:async()=>({exists:true,exchange:{id:2n,offerId:3n,buyerId:4n,state:0,finalizedDate:0n},voucher:{redeemedDate:0n}}),getBuyer:async()=>({exists:true,buyer:{wallet:buyerAddress}}),getOffer:async()=>({exists:true,offer:{sellerId:7n,exchangeToken:credit,price:parseEther('25'),metadataHash:metadata.metadataHash,metadataUri:metadata.metadataUri}})});
  const views=providers.map(contract),ctx={manifest:{chainId:84532,publicTransactions:true,sourceBoson:bosonAddress,sourceBosonCodeHash:keccak256(code),credit,creditCodeHash:keccak256(code)},wallets:{buyer:{address:buyerAddress}},boson:{target:bosonAddress,interface:iface,connect:p=>views[providers.indexOf(p)]},transact:()=>assert.fail('recovery must never send')};
  return {ctx,state,market,record,providers,views,input,receipt,tx};
}
test('a crash after a confirmed commit reconstructs the missing order and retry result without sends',async()=>{
  const f=fixture();let stateSaves=0,marketSaves=0;
  const options={providers:f.providers,persistState:()=>stateSaves++,persistMarket:()=>marketSaves++};
  const orders=await reconcilePurchases(f.ctx,f.state,f.market,[f.record],options);
  assert.equal(orders.length,1);assert.equal(f.state.orders[0].exchangeId,'2');assert.equal(f.state.orders[0].recovered,true);
  assert.equal(f.market.requests[f.input.idempotencyKey].status,'confirmed');assert.equal(stateSaves,1);assert.equal(marketSaves,1);
  const retry=await runIdempotent(f.market.requests,f.input,()=>assert.fail('duplicate purchase'),()=>{});
  assert.equal(retry.exchangeId,'2');assert.equal(retry.idempotent,true);
  assert.equal((await reconcilePurchases(f.ctx,f.state,f.market,[f.record],options)).length,0);
});
test('recovery refuses a wrong actor, target, value, chain, event source and calldata',async()=>{
  for(const change of [{from:'0x'+'9'.repeat(40)},{to:'0x'+'9'.repeat(40)},{value:1n},{chainId:8453n},{data:'0xdeadbeef'},'event']){
    const f=fixture();if(change==='event')f.receipt.logs[0].address='0x'+'9'.repeat(40);else Object.assign(f.tx,change);
    await assert.rejects(verifyPurchaseReceipt(f.ctx,f.state,f.market,f.record,f.providers));assert.equal(f.state.orders.length,0);
  }
});
test('recovery refuses pending, reverted, noncanonical and divergent RPC receipts',async()=>{
  for(const failure of ['missing','revert','canonical','young','disagree','code']){
    const f=fixture();
    if(failure==='missing')f.providers[1].getTransactionReceipt=async()=>null;
    if(failure==='revert')f.receipt.status=0;
    if(failure==='canonical')f.providers[1].getBlock=async()=>({hash:'changed'});
    if(failure==='young')f.providers[1].getBlockNumber=async()=>78;
    if(failure==='disagree')f.providers[1].getTransactionReceipt=async()=>({...f.receipt,blockHash:'changed'});
    if(failure==='code')f.providers[1].getCode=async()=> '0x';
    await assert.rejects(verifyPurchaseReceipt(f.ctx,f.state,f.market,f.record,f.providers));
  }
});
test('recovery requires current buyer/offer bindings, identical RPC states and exact request digest',async()=>{
  for(const failure of ['buyer','price','state','request']){
    const f=fixture();
    if(failure==='buyer')f.views[1].getBuyer=async()=>({exists:true,buyer:{wallet:'0x'+'9'.repeat(40)}});
    if(failure==='price'){const get=f.views[1].getOffer;f.views[1].getOffer=async()=>{const result=await get();result.offer.price=parseEther('26');return result;};}
    if(failure==='state'){const get=f.views[1].getExchange;f.views[1].getExchange=async()=>{const result=await get();result.exchange.state=4;return result;};}
    if(failure==='request')f.market.requests[f.input.idempotencyKey].input.listingId='other-listing';
    await assert.rejects(reconcilePurchases(f.ctx,f.state,f.market,[f.record],{providers:f.providers,persistState:()=>assert.fail('unverified state persisted'),persistMarket:()=>assert.fail('unverified request persisted')}));
    assert.equal(f.state.orders.length,0);assert.equal(f.market.requests[f.input.idempotencyKey].status,'pending');
  }
});
test('recovery refuses substituted local content/conditions even when the archived metadata hash was kept',async()=>{
  for(const field of ['title','terms','kind','assetSha256','certificate']){
    const f=fixture();f.market.listings[0][field]=field==='certificate'?{tokenId:'999'}:'changed';
    await assert.rejects(reconcilePurchases(f.ctx,f.state,f.market,[f.record],{providers:f.providers,persistState:()=>assert.fail('unverified order saved'),persistMarket:()=>assert.fail('unverified request saved')}),/content or conditions changed/);
    assert.equal(f.state.orders.length,0);assert.equal(f.market.requests[f.input.idempotencyKey].status,'pending');
  }
});
