import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RUNTIME } from './chain.mjs';
import { audit } from './security.mjs';
import { sha } from './releases.mjs';
import {parseEther} from 'ethers';
import {assertOfferMetadata,assertListingAsset} from './offer-metadata.mjs';
import {assertRuntimeBoson} from './boson-implementation.mjs';
import {assertRuntimeSafe} from './safe-authority.mjs';
import {readVerifiedBytes} from './verified-file.mjs';

export function assertEntitlement(exchange,buyer,order,listing,address){
  if(!exchange.exists||!buyer.exists||exchange.exchange.offerId.toString()!==listing.offerId
    ||exchange.exchange.buyerId.toString()!==order.buyerId||buyer.buyer.wallet.toLowerCase()!==address.toLowerCase())throw new Error('Delivery buyer/offer mismatch');
  if(![3,4].includes(Number(exchange.exchange.state)))throw new Error('Digital delivery requires redeemed or completed exchange');
  if(!['video','digital'].includes(listing.kind)||!listing.assetId)throw new Error('This product has no digital download');
}
export function checkedAssetFile(asset){
  return checkedAssetSnapshot(asset).file;
}
export function checkedAssetSnapshot(asset){return readVerifiedBytes(asset.file,asset.sha256,{root:path.join(RUNTIME,'market-assets')});}
export function createDeliveryVault(){
  const grants=new Map();
  return {
    issue(binding,now=Date.now()){for(const [key,g]of grants)if(g.expiresAt<=now)grants.delete(key);
      if(grants.size>=100)throw new Error('Delivery grant limit reached');
      const token=crypto.randomBytes(32).toString('hex');grants.set(sha(token),{...binding,expiresAt:now+60000});return {token,expiresAt:now+60000};},
    consume(token,now=Date.now()){if(typeof token!=='string'||!(/^[a-f0-9]{64}$/.test(token)))throw new Error('Invalid delivery grant');
      const key=sha(token),g=grants.get(key);grants.delete(key);if(!g||g.expiresAt<=now)throw new Error('Expired or already used delivery grant');return g;}
  };
}
export async function verifyDelivery(ctx,state,market,exchangeId){
  await ctx.assertChain();
  await assertRuntimeSafe(ctx);
  await assertRuntimeBoson(ctx);
  const order=state.orders.find(o=>o.exchangeId===exchangeId);if(!order)throw new Error('Unknown delivery order');
  const listing=market.listings.find(l=>l.id===order.listingId);if(!listing)throw new Error('Unknown delivery listing');
  const [exchange,buyer,result]=await Promise.all([ctx.boson.getExchange(exchangeId),ctx.boson.getBuyer(order.buyerId),ctx.boson.getOffer(listing.offerId)]);
  assertEntitlement(exchange,buyer,order,listing,ctx.wallets.buyer.address);
  const offer=result.offer;
  if(!result.exists||order.offerId!==listing.offerId||offer.sellerId.toString()!==state.sellerId
    ||offer.exchangeToken.toLowerCase()!==ctx.manifest.credit.toLowerCase()||offer.price!==parseEther(listing.price))throw new Error('Delivery offer bindings changed');
  assertOfferMetadata(listing,offer,{legacyOfferId:state.offerId});
  const asset=market.assets.find(a=>a.id===listing.assetId);
  assertListingAsset(listing,asset);
  const {file,bytes}=checkedAssetSnapshot(asset);
  audit('delivery-entitlement-verified',{exchangeId,listingId:listing.id,buyer:ctx.wallets.buyer.address,assetSha256:asset.sha256});
  return {file,bytes,asset,order,listing};
}
