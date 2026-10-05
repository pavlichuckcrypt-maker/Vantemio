import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Interface,ZeroAddress} from 'ethers';
import {bosonABI} from '../src/chain.mjs';import {sellerRegistration,sellerOffer,assertSellerOwner,assertSellerOffer} from './seller-contract.mjs';
const account='0x'+'ab'.repeat(20),other='0x'+'cd'.repeat(20),credit='0x'+'12'.repeat(20),member={id:crypto.randomUUID(),wallet:account,roles:{buyer:true,seller:true}},product={id:crypto.randomUUID(),revision:1,title:'Private draft title',description:'Private commercial terms',price:'25',quantity:3,fulfillment:{kind:'service',days:7}};
const spec=(overrides={})=>sellerOffer({member,account,product,sellerId:'100',credit,now:1700000000,disputePeriod:600,resolutionPeriod:600,resolverId:'2',...overrides});
const asRecord=s=>({exists:true,offer:{...s.args[0],id:300},offerDates:s.args[1],offerDurations:s.args[2],disputeResolutionTerms:s.args[3]});
test('seller calls bind assistant, admin and treasury to the verified wallet; no private product text is on chain',()=>{
 const abi=new Interface(bosonABI()),r=sellerRegistration(member,account),decoded=abi.decodeFunctionData(r.method,abi.encodeFunctionData(r.method,r.args));
 assert.equal(decoded._seller.assistant.toLowerCase(),account);assert.equal(decoded._seller.admin.toLowerCase(),account);assert.equal(decoded._seller.treasury.toLowerCase(),account);assert.equal(decoded._seller.clerk,ZeroAddress);
 assert.throws(()=>sellerRegistration({...member,roles:{seller:false}},account),e=>e.status===403);assert.throws(()=>sellerRegistration(member,other),e=>e.status===403);
 const s=spec(),data=abi.encodeFunctionData(s.method,s.args);assert.equal(abi.parseTransaction({data}).name,'createOffer');
 const metadata=JSON.parse(Buffer.from(s.metadataUri.split(',')[1],'base64').toString());assert.equal(metadata.productId,product.id);assert.equal(metadata.revision,1);assert.equal(JSON.stringify(metadata).includes(product.title),false);assert.equal(JSON.stringify(metadata).includes(product.description),false);
 assert.notEqual(spec({product:{...product,fulfillment:{kind:'service',days:8}}}).metadataHash,s.metadataHash);assert.notEqual(spec({product:{...product,price:'26'}}).metadataHash,s.metadataHash);
});
test('seller ownership rejects foreign treasury, inactive entity and token-admin takeover',()=>{
 const r={exists:true,seller:{id:'100',assistant:account,admin:account,treasury:account,clerk:ZeroAddress,active:true},authToken:{tokenType:0,tokenId:0}};assert.equal(assertSellerOwner(r,account),'100');
 for(const patch of [{treasury:other},{assistant:other},{admin:other},{active:false},{clerk:other}])assert.throws(()=>assertSellerOwner({...r,seller:{...r.seller,...patch}},account),e=>e.status===403);
 assert.throws(()=>assertSellerOwner({...r,authToken:{tokenType:1,tokenId:22}},account),e=>e.status===403);
});
test('ready-file offers require owner-scoped exact hashes; expiry never authorizes settlement',()=>{
 const p={...product,fulfillment:{kind:'digital_instant',days:0}},asset={id:crypto.randomUUID(),memberId:member.id,sha256:'a'.repeat(64),bytes:100};
 assert.throws(()=>spec({product:p}),e=>e.status===409);const s=spec({product:p,asset});assert.equal(s.binding.assetSha256,asset.sha256);
 assert.throws(()=>spec({product:p,asset:{...asset,memberId:crypto.randomUUID()}}),e=>e.status===403);assert.throws(()=>spec({product:p,asset:{...asset,bytes:67108865}}),e=>e.status===403);
 assert.equal(spec({product:{...product,fulfillment:{kind:'service',days:365}}}).args[2].voucherValid,379*86400);
});
test('offer verification rejects changed price, seller, token, royalty, metadata, resolver and delivery periods',()=>{
 const s=spec(),r=asRecord(s);assert.equal(assertSellerOffer(r,s,{sellerId:'100',offerId:'300'}),true);
 for(const patch of [{price:26n},{sellerId:'101'},{exchangeToken:other},{metadataHash:'tampered'},{sellerDeposit:1n},{buyerCancelPenalty:1n},{royaltyInfo:[{recipients:[other],bps:[1]}]},{creator:1},{buyerId:1},{voided:true}])assert.throws(()=>assertSellerOffer({...r,offer:{...r.offer,...patch}},s),e=>e.status===409);
 assert.throws(()=>assertSellerOffer({...r,offerDurations:{...r.offerDurations,voucherValid:1}},s),e=>e.status===409);
 assert.throws(()=>assertSellerOffer({...r,disputeResolutionTerms:{...r.disputeResolutionTerms,disputeResolverId:99}},s),e=>e.status===409);
});
