import {parseEther} from 'ethers';
import {refreshOrder,commerceSummary} from './boson.mjs';
import {assertOfferMetadata} from './offer-metadata.mjs';
import {offerAvailability} from './offer-availability.mjs';
import {assertRuntimeBoson} from './boson-implementation.mjs';
import {assertRuntimeSafe} from './safe-authority.mjs';

// Read-only projection: never overwrite durable receipts, orders or mint ownership.
export function createChainView({now=()=>Date.now(),ttl=15000}={}){
  let cached=null,inFlight=null;
  return async function view(ctx,source,{revision=''}={}){
    const key=JSON.stringify([source,revision]);
    if(cached?.key===key&&now()-cached.at<ttl)return structuredClone(cached.value);
    if(inFlight){await inFlight;return view(ctx,source,{revision});}
    const captured=structuredClone(source);
    const work=(async()=>{
      try{
        await ctx.assertChain();
        const block=await ctx.provider.getBlock('latest');
        if(!block?.hash)throw new Error('Missing canonical chain block');
        const options={blockTag:block.number};
        await assertRuntimeBoson(ctx,options);
        await assertRuntimeSafe(ctx,options);
        const [balance,commerce,paused]=await Promise.all([
          ctx.provider.getBalance(ctx.wallets.operator.address,block.number),
          commerceSummary(ctx,{sellerId:ctx.sellerId,resolverId:ctx.resolverId,offerId:ctx.offerId,voucher:ctx.voucher,orders:captured.orders},options),
          ctx.nft.paused(options)
        ]);
        captured.orders=await Promise.all(captured.orders.map(order=>refreshOrder(ctx,order,options)));
        captured.releases=await Promise.all(captured.releases.map(async release=>({...release,mintOwner:release.owner,owner:await ctx.nft.ownerOf(release.tokenId,options)})));
        const owners=new Map(captured.releases.map(r=>[r.tokenId,r.owner]));
        for(const asset of captured.marketplace.assets){if(asset.certificate){const owner=owners.get(asset.certificate.tokenId);if(!owner)throw new Error('Unregistered NFT certificate');asset.certificate={...asset.certificate,owner};}}
        captured.marketplace.listings=await Promise.all(captured.marketplace.listings.map(async listing=>{
          const result=await ctx.boson.getOffer(listing.offerId,options),offer=result.offer;
          if(!result.exists||offer.sellerId.toString()!==ctx.sellerId||offer.exchangeToken.toLowerCase()!==ctx.manifest.credit.toLowerCase()||offer.price!==parseEther(listing.price)||offer.metadataHash!==listing.metadataHash)throw new Error('Published offer binding changed: '+listing.offerId);
          assertOfferMetadata(listing,offer,{legacyOfferId:ctx.offerId});
          const quantityAvailable=offer.quantityAvailable.toString(),availability=offerAvailability(result,block.timestamp);
          return {...listing,quantityAvailable,available:availability.available,availabilityReason:availability.reason};
        }));
        const canonical=await ctx.provider.getBlock(block.number);
        if(canonical?.hash!==block.hash)throw new Error('Chain view block changed during verification');
        captured.funding={address:ctx.wallets.operator.address,balance:balance.toString(),unit:'wei'};
        captured.commerce=commerce;captured.paused=paused;
        captured.chainView={verified:true,block:block.number,blockHash:block.hash,checkedAt:new Date(now()).toISOString(),refreshSeconds:ttl/1000};
      }catch(error){
        captured.funding=null;captured.paused=true;
        captured.commerce={available:false,status:'Chain verification unavailable',buyerBalance:'0',sellerAvailable:'0'};
        captured.chainView={verified:false,checkedAt:new Date(now()).toISOString(),error:error.shortMessage||error.message,refreshSeconds:ttl/1000};
      }
      cached={key,at:now(),value:captured};return captured;
    })();
    inFlight=work;
    try{return structuredClone(await work);}finally{if(inFlight===work)inFlight=null;}
  };
}
