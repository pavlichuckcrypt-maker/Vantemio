import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEther} from 'ethers';
import {commitOrder,readOfferForCommit} from '../src/boson.mjs';
import {verifyDelivery} from '../src/delivery.mjs';
import {marketOfferMetadata,assertOfferMetadata,assertListingAsset} from '../src/offer-metadata.mjs';

function fixture(){
  const buyer='0x'+'1'.repeat(40),credit='0x'+'2'.repeat(40);
  const listing={id:'test-listing',offerId:'3',price:'25',kind:'video',title:'Accepted export',description:'Test access',terms:'Test license',assetId:'test-asset',assetSha256:'1'.repeat(64),certificate:null};
  const metadata=marketOfferMetadata(listing);listing.metadataHash=metadata.metadataHash;
  const offer={sellerId:7n,exchangeToken:credit,price:parseEther('25'),metadataHash:metadata.metadataHash,metadataUri:metadata.metadataUri,voided:false,quantityAvailable:5n,priceType:0n,creator:0n,buyerId:0n,sellerDeposit:0n,buyerCancelPenalty:0n};
  const offerDates={validFrom:1n,validUntil:200n};
  const order={exchangeId:'4',buyerId:'5',offerId:'3',listingId:listing.id};
  const state={sellerId:'7',orders:[order]},asset={id:listing.assetId,kind:'video',sha256:listing.assetSha256,file:'never-read-in-refusal-test'};
  const ctx={manifest:{credit},wallets:{buyer:{address:buyer}},assertChain:async()=>{},
    provider:{getBlock:async()=>({number:42,hash:'canonical',timestamp:100})},
    boson:{getOffer:async()=>({exists:true,offer,offerDates}),getExchange:async()=>({exists:true,exchange:{offerId:3n,buyerId:5n,state:3}}),getBuyer:async()=>({exists:true,buyer:{wallet:buyer}})},
    credit:{allowance:()=>assert.fail('approval must not be reached')},transact:()=>assert.fail('invalid content cannot send')};
  return {listing,offer,offerDates,order,state,asset,ctx,market:{listings:[listing],assets:[asset]}};
}
test('changed displayed sale conditions are rejected before token approval or commitment',async()=>{
  for(const field of ['title','description','terms','kind','assetSha256','certificate']){
    const f=fixture();f.listing[field]=field==='certificate'?{tokenId:'999'}:'changed';
    await assert.rejects(commitOrder(f.ctx,f.state,f.listing),/content or conditions changed/);
    assert.equal(f.state.orders.length,1);
  }
});
test('delivery rechecks Boson metadata and refuses a jointly substituted listing and file fingerprint',async()=>{
  for(const failure of ['hash','uri','price','currency','seller','order','fingerprint']){
    const f=fixture();
    if(failure==='hash')f.offer.metadataHash='0x'+'3'.repeat(64);
    if(failure==='uri')f.offer.metadataUri='data:application/json;base64,e30=';
    if(failure==='price')f.offer.price=parseEther('26');
    if(failure==='currency')f.offer.exchangeToken='0x'+'3'.repeat(40);
    if(failure==='seller')f.offer.sellerId=8n;
    if(failure==='order')f.order.offerId='9';
    if(failure==='fingerprint')f.asset.sha256=f.listing.assetSha256='2'.repeat(64);
    await assert.rejects(verifyDelivery(f.ctx,f.state,f.market,'4'),/changed/);
  }
});
test('the original service remains a pinned migration, not a bypass for an unbound digital listing',()=>{
  const listing={id:'legacy-service',offerId:'131',kind:'service',price:'25',title:'Монтаж видео · исходное демо',description:'Готовое тестовое предложение монтажной студии.',terms:'Testnet demonstration service only.',assetId:null,assetSha256:null,certificate:null,metadataHash:''};
  const offer={metadataHash:'',metadataUri:'data:application/json;base64,'+Buffer.from(JSON.stringify({name:'Video editing / accepted final cut',description:'Testnet demo service; no monetary value',testOnly:true})).toString('base64')};
  assert.doesNotThrow(()=>assertOfferMetadata(listing,offer,{legacyOfferId:'131'}));
  for(const change of [{kind:'video'},{assetId:'injected'},{title:'different'},{offerId:'999'},{metadataHash:'injected'}])
    assert.throws(()=>assertOfferMetadata({...listing,...change},offer,{legacyOfferId:'131'}));
  assert.throws(()=>assertOfferMetadata(listing,{...offer,metadataUri:'https://unbound.invalid/'},{legacyOfferId:'131'}));
});
test('the delivered asset category and NFT contract/token must match the published certificate',()=>{
  const f=fixture(),certificate={tokenId:'4',contract:'0x'+'4'.repeat(40),chainId:84532,owner:'original'};
  f.listing.certificate=certificate;f.asset.certificate={...certificate,owner:'current owner'};
  assert.doesNotThrow(()=>assertListingAsset(f.listing,f.asset));
  for(const change of [{kind:'digital'},{id:'foreign'},{sha256:'2'.repeat(64)},{certificate:null},{certificate:{...certificate,tokenId:'5'}},{certificate:{...certificate,chainId:8453}}])
    assert.throws(()=>assertListingAsset(f.listing,{...f.asset,...change}));
});
test('unavailable or unverified offers cannot reach token approval or commitment',async()=>{
  for(const failure of ['expired','future','empty','voided','dates','quantity','missing','type','creator','penalty','deposit']){
    const f=fixture();
    if(failure==='expired')f.offerDates.validUntil=99n;
    if(failure==='future')f.offerDates.validFrom=101n;
    if(failure==='empty')f.offer.quantityAvailable=0n;
    if(failure==='voided')f.offer.voided=true;
    if(failure==='dates')delete f.offerDates.validUntil;
    if(failure==='quantity')f.offer.quantityAvailable=5;
    if(failure==='missing')f.ctx.boson.getOffer=async()=>({exists:false});
    if(failure==='type')f.offer.priceType=1n;
    if(failure==='creator')f.offer.creator=1n;
    if(failure==='penalty')f.offer.buyerCancelPenalty=1n;
    if(failure==='deposit')f.offer.sellerDeposit=1n;
    await assert.rejects(commitOrder(f.ctx,f.state,f.listing),/unavailable|parameters changed/);
    assert.equal(f.state.orders.length,1);
  }
});
test('the payment preflight reads offer/time in one fresh canonical block and does not use a prior successful quote',async()=>{
  const f=fixture(),reads=[];
  f.ctx.provider.getBlock=async tag=>{reads.push(tag);return {number:42,hash:'canonical',timestamp:100};};
  const get=f.ctx.boson.getOffer;f.ctx.boson.getOffer=async(_id,options)=>{assert.equal(options.blockTag,42);return get();};
  const before=JSON.stringify(f.state),quote=await readOfferForCommit(f.ctx,f.state,f.listing);
  assert.equal(quote.offerId,'3');assert.equal(quote.block.hash,'canonical');assert.deepEqual(reads,['latest',42]);
  f.offer.quantityAvailable=0n;await assert.rejects(commitOrder(f.ctx,f.state,f.listing),/sold-out/);
  assert.equal(JSON.stringify(f.state),before);
});
test('invalid block data and a changed canonical block stop payment before allowance lookup',async()=>{
  for(const failure of ['reorg','timestamp','number','hash']){
    const f=fixture();let reads=0;
    f.ctx.provider.getBlock=async()=>({number:failure==='number'?NaN:42,hash:failure==='hash'?null:failure==='reorg'&&++reads>1?'changed':'canonical',timestamp:failure==='timestamp'?-1:100});
    await assert.rejects(commitOrder(f.ctx,f.state,f.listing),/block/);
  }
});
