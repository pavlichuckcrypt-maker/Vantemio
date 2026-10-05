import {getAddress} from 'ethers';
import {assertSellerOwner,assertSellerOffer} from './seller-contract.mjs';
const same=(a,b)=>getAddress(a)===getAddress(b);
export function sellerReceiptEvent(receipt,iface,address,name,account){
 const events=receipt.logs.filter(log=>same(log.address,address)).map(log=>{try{return iface.parseLog(log);}catch{return null;}}).filter(e=>e?.name===name);
 if(events.length!==1||!same(events[0].args.executedBy,account))throw new Error('Seller receipt event or actor mismatch');return events[0].args;
}
export function verifySellerRegistration(record,event,intent,account){
 const id=assertSellerOwner(record,account);if(id!==String(event.sellerId)||record.seller.metadataUri!==intent.sellerMetadataUri||event.seller.metadataUri!==intent.sellerMetadataUri)throw new Error('Seller registration metadata changed');
 assertSellerOwner({exists:true,seller:event.seller,authToken:event.authToken},account,{sellerId:id});return id;
}
export function verifiedSellerListing(record,seller,event,intent,account,receipt){
 const spec=intent.sellerSpec,sellerId=assertSellerOwner(seller,account,{sellerId:intent.sellerId}),offerId=String(event.offerId);
 if(String(event.sellerId)!==sellerId||BigInt(event.offer.quantityAvailable)!==BigInt(spec.args[0].quantityAvailable))throw new Error('Offer receipt seller or stock changed');
 assertSellerOffer(record,spec,{sellerId,offerId});
 // Verify the full creation event as well as the receipt-block storage. Other
 // buyers may reduce stock later in the same block; the creation event cannot.
 assertSellerOffer({exists:true,offer:event.offer,offerDates:event.offerDates,offerDurations:event.offerDurations,disputeResolutionTerms:event.disputeResolutionTerms},spec,{sellerId,offerId});
 const p=intent.sellerProduct,a=intent.sellerAsset;
 return {id:p.id,status:'PUBLISHED',source:'seller-wallet',title:p.title,description:p.description,price:p.price,quantity:p.quantity,
  kind:['digital_instant','custom_digital'].includes(p.fulfillment.kind)?'digital':p.fulfillment.kind,fulfillment:p.fulfillment,
  assetId:a?.id||null,assetSha256:a?.sha256||null,filename:a?.filename||null,mime:a?.mime||null,assetBytes:a?.bytes||null,
  memberId:intent.memberId,sellerWallet:getAddress(account),sellerId,offerId,revision:p.revision,
  publicationTx:receipt.hash,publicationBlock:receipt.blockNumber,spec};
}
export function publicSellerListing(l){
 const {spec,memberId,filename,mime,assetBytes,...publicFields}=l;
 return {...publicFields,terms:`${l.fulfillment.kind}; fulfillment ${l.fulfillment.days} days from redemption; Boson escrow/dispute rules apply`};
}
