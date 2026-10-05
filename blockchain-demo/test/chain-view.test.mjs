import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEther} from 'ethers';
import {createChainView} from '../src/chain-view.mjs';
import {marketOfferMetadata} from '../src/offer-metadata.mjs';
function fixture(){
  const credit='0x'+'1'.repeat(40),owner='0x'+'2'.repeat(40),newOwner='0x'+'3'.repeat(40);
  const listing={offerId:'3',price:'25',kind:'service',title:'Test service',description:'Test only',terms:'No real work',assetId:null,assetSha256:null,certificate:null};
  const metadata=marketOfferMetadata(listing);listing.metadataHash=metadata.metadataHash;
  const source={releases:[{tokenId:'1',owner}],orders:[{exchangeId:'2',offerId:'3',buyerId:'4',state:'COMMITTED',txs:[]}],marketplace:{assets:[{certificate:{tokenId:'1',owner}}],listings:[listing]}};
  const calls=[];let time=100000,status=0,currentOwner=owner,quantity=5n,fail=false,paused=false,balance=parseEther('100');
  const ctx={sellerId:'7',manifest:{credit,sourceBoson:'0x'+'4'.repeat(40),publicTransactions:true},wallets:{operator:{address:owner},buyer:{address:newOwner}},assertChain:async()=>{},
    provider:{getBlock:async()=>({number:42,hash:'canonical',timestamp:100}),getBalance:async(_address,blockTag)=>{calls.push({blockTag});return 123n;}},
    credit:{balanceOf:async(_address,options)=>{calls.push(options);return balance;}},
    nft:{paused:async options=>{calls.push(options);return paused;},ownerOf:async(_id,options)=>{calls.push(options);if(fail)throw new Error('RPC unavailable');return currentOwner;}},
    boson:{getExchange:async(_id,options)=>{calls.push(options);return {exists:true,exchange:{offerId:3n,buyerId:4n,state:status},voucher:{redeemedDate:0n}};},
      getAllAvailableFunds:async(_id,options)=>{calls.push(options);return [{tokenAddress:credit,availableAmount:parseEther('7')}];},
      getOffer:async(_id,options)=>{calls.push(options);return {exists:true,offer:{sellerId:7n,exchangeToken:credit,price:parseEther('25'),metadataHash:metadata.metadataHash,metadataUri:metadata.metadataUri,voided:false,quantityAvailable:quantity,priceType:0n,creator:0n,buyerId:0n},offerDates:{validFrom:1n,validUntil:200n}};}}};
  return {source,ctx,calls,newOwner,view:createChainView({now:()=>time}),change:()=>{time+=16000;status=4;currentOwner=newOwner;quantity=0n;paused=true;balance=parseEther('89');},fail:()=>{time+=16000;fail=true;}};
}
test('chain projection updates external NFT transfers and Boson states without rewriting receipts',async()=>{
  const f=fixture(),before=JSON.stringify(f.source);const first=await f.view(f.ctx,f.source);
  assert.equal(first.chainView.verified,true);assert.equal(first.marketplace.listings[0].available,true);
  assert(f.calls.every(options=>options.blockTag===42));
  f.change();const second=await f.view(f.ctx,f.source);
  assert.equal(second.releases[0].owner,f.newOwner);assert.equal(second.releases[0].mintOwner,f.source.releases[0].owner);
  assert.equal(second.marketplace.assets[0].certificate.owner,f.newOwner);
  assert.equal(second.orders[0].state,'COMPLETED');assert.equal(second.marketplace.listings[0].available,false);
  assert.equal(second.marketplace.listings[0].quantityAvailable,'0');assert.equal(JSON.stringify(f.source),before);
});
test('failed refresh marks chain data unverified even after a successful cached view',async()=>{
  const f=fixture();await f.view(f.ctx,f.source);f.fail();
  const state=await f.view(f.ctx,f.source);assert.equal(state.chainView.verified,false);assert.match(state.chainView.error,/RPC/);
  assert.equal(f.source.orders[0].state,'COMMITTED');
});
test('a cached view is isolated from callers and local changes invalidate it',async()=>{
  const f=fixture(),first=await f.view(f.ctx,f.source);const count=f.calls.length;
  first.releases[0].owner='tampered';const second=await f.view(f.ctx,f.source);
  assert.notEqual(second.releases[0].owner,'tampered');assert.equal(f.calls.length,count);
  f.source.orders[0].deliveredSha256='actual-file-hash';await f.view(f.ctx,f.source);assert(f.calls.length>count);
});
test('changed offer terms or a reorg cannot be displayed as verified',async()=>{
  for(const failure of ['price','reorg']){
    const f=fixture();
    if(failure==='price'){const get=f.ctx.boson.getOffer;f.ctx.boson.getOffer=async(...args)=>{const result=await get(...args);result.offer.price=parseEther('26');return result;};}
    else{let reads=0;f.ctx.provider.getBlock=async()=>({number:42,hash:++reads===1?'first':'changed',timestamp:100});}
    const view=await f.view(f.ctx,f.source);assert.equal(view.chainView.verified,false);
  }
});
test('balances, pause, NFT ownership and orders share one block and one polling cache',async()=>{
  const f=fixture(),first=await f.view(f.ctx,f.source),count=f.calls.length;
  assert.equal(first.funding.balance,'123');assert.equal(first.commerce.buyerBalance,'100.0');assert.equal(first.paused,false);
  assert.equal(first.commerce.sellerAvailable,'7.0');assert.equal(first.commerce.buyerRefundAvailable,'7.0');
  assert(f.calls.every(options=>options.blockTag===42));
  const second=await f.view(f.ctx,f.source);assert.equal(f.calls.length,count);assert.deepEqual(second,first);
  f.change();const refreshed=await f.view(f.ctx,f.source);
  assert.equal(refreshed.paused,true);assert.equal(refreshed.commerce.buyerBalance,'89.0');assert.equal(refreshed.orders[0].state,'COMPLETED');
});
test('simultaneous state readers share work, but a newly confirmed receipt invalidates even unchanged domain data',async()=>{
  const f=fixture();const snapshots=await Promise.all(Array.from({length:5},()=>f.view(f.ctx,f.source,{revision:'72:last'})));
  const count=f.calls.length;
  assert(count>0);assert(snapshots.every(s=>s.chainView.verified));assert(snapshots.every(s=>JSON.stringify(s)===JSON.stringify(snapshots[0])));
  await f.view(f.ctx,f.source,{revision:'72:last'});assert.equal(f.calls.length,count);
  await f.view(f.ctx,f.source,{revision:'73:pause'});assert.equal(f.calls.length,count*2);
});
test('a failed balance or pause read disables the complete view without serving previous balances',async()=>{
  for(const method of ['balance','pause']){
    const f=fixture();await f.view(f.ctx,f.source);f.change();
    const unavailable=async()=>{throw new Error('RPC unavailable');};
    if(method==='balance')f.ctx.credit.balanceOf=unavailable;else f.ctx.nft.paused=unavailable;
    const result=await f.view(f.ctx,f.source);
    assert.equal(result.chainView.verified,false);assert.equal(result.commerce.available,false);assert.equal(result.funding,null);assert.equal(result.paused,true);
  }
});
test('a saved listing cannot change displayed conditions while keeping the original pinned hash',async()=>{
  for(const field of ['title','description','terms','kind','assetSha256','certificate']){
    const f=fixture();await f.view(f.ctx,f.source);
    f.source.marketplace.listings[0][field]=field==='certificate'?{tokenId:'999'}:'substituted conditions';
    const result=await f.view(f.ctx,f.source);
    assert.equal(result.chainView.verified,false);assert.equal(result.paused,true);
    assert.match(result.chainView.error,/content or conditions changed/);
  }
});
