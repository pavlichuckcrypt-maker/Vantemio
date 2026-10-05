import test from 'node:test';import assert from 'node:assert/strict';import {Wallet,Interface} from 'ethers';
import {createSellerReviewer} from './seller-review.mjs';
const signers=Array.from({length:5},()=>Wallet.createRandom()),actor=Wallet.createRandom().address,boson=new Interface(['function createSeller(uint256)','function createOffer(uint256)','function withdrawFunds(uint256)']),
 manifest={chainId:84532,publicTransactions:true,sourceBoson:Wallet.createRandom().address,sourceBosonImplementationDigest:'0x'+'a'.repeat(64),safeOwners:signers.map(s=>s.address)},block={number:42,timestamp:1000,hash:'0x'+'b'.repeat(64)};
const tx={from:actor,to:manifest.sourceBoson,value:'0x0',chainId:'0x14a34',nonce:'0x1',data:boson.encodeFunctionData('createOffer',[1])},binding={memberId:'member',productId:'product',revision:1,price:25000000000000000000n,assetSha256:'c'.repeat(64)};
test('seller review needs three distinct registered signers and exports no signature or key',async()=>{
 const review=createSellerReviewer(manifest,boson,{loadSigners:async()=>signers.slice(0,3)}),p=await review(tx,{action:'seller-publish',block,binding});
 assert.equal(p.actor,actor);assert.equal(p.nonce,1);assert.equal(p.approvals.length,3);assert.equal(p.independentCustody,false);assert.ok(!/signature|privateKey|mnemonic|seed/i.test(JSON.stringify(p)));
 const changed=await review(tx,{action:'seller-publish',block,binding:{...binding,revision:2}});assert.notEqual(p.digest,changed.digest);
 for(const selected of [signers.slice(0,2),[signers[0],signers[0],signers[1]],[signers[0],signers[1],Wallet.createRandom()]])await assert.rejects(createSellerReviewer(manifest,boson,{loadSigners:async()=>selected})(tx,{action:'seller-publish',block,binding}));
});
test('digital delivery review binds buyer, order and exact file hash without exporting authorization',async()=>{
 const review=createSellerReviewer(manifest,boson,{loadSigners:async()=>signers.slice(0,3)}),binding={chainId:84532,exchangeId:'1',offerId:'2',buyerId:'3',assetSha256:'c'.repeat(64)};
 const proof=await review.delivery(actor,{block,binding,nonce:1});assert.equal(proof.action,'digital-delivery');assert.equal(proof.approvals.length,3);
 assert.notEqual(proof.digest,(await review.delivery(actor,{block,binding:{...binding,assetSha256:'d'.repeat(64)},nonce:1})).digest);
 await assert.rejects(review.delivery(actor,{block,binding:{...binding,chainId:1},nonce:1}));
});
test('seller review rejects wrong chain, value, target, method and nonce',async()=>{
 const review=createSellerReviewer(manifest,boson,{loadSigners:async()=>signers.slice(0,3)});
 for(const patch of [{chainId:1},{value:'0x1'},{to:actor},{data:boson.encodeFunctionData('withdrawFunds',[1])},{nonce:'0x20000000000000'}])await assert.rejects(review({...tx,...patch},{action:'seller-publish',block,binding}));
 await assert.rejects(review(tx,{action:'unknown',block,binding}));
});
