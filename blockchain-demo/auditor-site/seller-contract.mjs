import crypto from 'node:crypto';
import {getAddress,keccak256,toUtf8Bytes,ZeroAddress,ZeroHash,parseEther} from 'ethers';
import {ServiceError} from './user-database.mjs';
import {sellerProduct} from './fulfillment.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const decimal=/^[1-9]\d{0,77}$/;
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const uri=v=>'data:application/json;base64,'+Buffer.from(JSON.stringify(v)).toString('base64');
const same=(a,b)=>getAddress(a)===getAddress(b);
function actor(member,account){
  if(!member||!uuid.test(member.id)||member.roles?.seller!==true||!member.wallet||!same(member.wallet,account))throw new ServiceError('Verified seller profile and wallet required',403);
  return getAddress(account);
}
export function sellerRegistration(member,account){
  const a=actor(member,account),metadata={schema:'vidra-seller-v1',chainId:84532,memberId:member.id,account:a.toLowerCase(),testOnly:true};
  return {method:'createSeller',args:[{id:0,assistant:a,admin:a,clerk:ZeroAddress,treasury:a,active:true,metadataUri:uri(metadata)},
    {tokenId:0,tokenType:0},{contractURI:uri({schema:'vidra-voucher-v1',memberId:member.id,testOnly:true}),royaltyPercentage:0,collectionSalt:ZeroHash}],metadata};
}
export function assertSellerOwner(record,account,{sellerId}={}){
  if(!record?.exists||record.seller.active!==true||!decimal.test(String(record.seller.id))
    ||sellerId!==undefined&&String(record.seller.id)!==String(sellerId)
    ||!same(record.seller.assistant,account)||!same(record.seller.admin,account)||!same(record.seller.treasury,account)
    ||!same(record.seller.clerk,ZeroAddress)||Number(record.authToken.tokenType)!==0||BigInt(record.authToken.tokenId)!==0n)throw new ServiceError('Boson seller ownership changed',403);
  return String(record.seller.id);
}
export function sellerOffer({member,account,product,asset=null,sellerId,credit,now,disputePeriod,resolutionPeriod,resolverId}){
  const a=actor(member,account),body=sellerProduct({title:product?.title,description:product?.description,price:product?.price,quantity:product?.quantity,fulfillment:product?.fulfillment});
  if(!uuid.test(product?.id)||!Number.isInteger(product.revision)||product.revision<1||!decimal.test(String(sellerId))||!decimal.test(String(resolverId))
    ||!Number.isSafeInteger(now)||now<1||BigInt(disputePeriod)<=0n||BigInt(resolutionPeriod)<=0n)throw new ServiceError('Invalid seller offer bindings',400);
  const token=getAddress(credit);if(same(token,ZeroAddress))throw new ServiceError('Pinned test token required',400);
  const digital=['digital_instant','custom_digital'].includes(body.fulfillment.kind);
  // Ready files must already exist in the owner's verified asset store. Custom
  // work is allowed without a result yet; later delivery must bind its own hash.
  if(body.fulfillment.kind==='digital_instant'&&!asset)throw new ServiceError('Verified ready file required before publication',409);
  if(asset&&(!digital||!uuid.test(asset.id)||asset.memberId!==member.id||!/^[a-f0-9]{64}$/.test(asset.sha256)||!Number.isInteger(asset.bytes)||asset.bytes<1||asset.bytes>67108864))throw new ServiceError('Seller asset ownership or fingerprint mismatch',403);
  const binding={schema:'vidra-boson-offer-v1',chainId:84532,memberId:member.id,account:a.toLowerCase(),productId:product.id,revision:product.revision,
    productSha256:sha(body),assetSha256:asset?.sha256||null,testOnly:true};
  const metadataUri=uri(binding),metadataHash=keccak256(toUtf8Bytes(JSON.stringify(binding))),price=parseEther(body.price);
  const offer={id:0,sellerId,price,sellerDeposit:0,buyerCancelPenalty:0,quantityAvailable:body.quantity,exchangeToken:token,priceType:0,creator:0,
    metadataUri,metadataHash,voided:false,collectionIndex:0,royaltyInfo:[{recipients:[],bps:[]}],buyerId:0};
  // Production/delivery time is an off-chain obligation from redemption, never a
  // permission to settle. Give the buyer an explicit redemption window as well.
  const dates={validFrom:now-1,validUntil:now+90*86400,voucherRedeemableFrom:0,voucherRedeemableUntil:0};
  const durations={disputePeriod,voucherValid:Math.max(30,body.fulfillment.days+14)*86400,resolutionPeriod};
  return {method:'createOffer',args:[offer,dates,durations,{disputeResolverId:resolverId,mutualizerAddress:ZeroAddress},0,price],
    binding,body,asset:asset?{id:asset.id,sha256:asset.sha256,bytes:asset.bytes}:null,metadataUri,metadataHash};
}
export function assertSellerOffer(record,spec,{sellerId,offerId,allowVoided=false}={}){
  if(!record?.exists)throw new ServiceError('Published Boson offer missing',409);
  const o=record.offer,expected=spec.args[0],dates=spec.args[1],durations=spec.args[2];
  if(String(o.sellerId)!==String(sellerId??expected.sellerId)||offerId!==undefined&&String(o.id)!==String(offerId)
    ||!same(o.exchangeToken,expected.exchangeToken)||BigInt(o.price)!==BigInt(expected.price)||BigInt(o.sellerDeposit)!==0n||BigInt(o.buyerCancelPenalty)!==0n
    ||Number(o.priceType)!==0||Number(o.creator)!==0||BigInt(o.buyerId)!==0n||BigInt(o.collectionIndex)!==0n||o.voided&&!allowVoided
    ||BigInt(o.quantityAvailable)>BigInt(expected.quantityAvailable)||BigInt(o.quantityAvailable)<0n||o.metadataUri!==spec.metadataUri||o.metadataHash!==spec.metadataHash
    ||o.royaltyInfo.length!==1||o.royaltyInfo[0].recipients.length||o.royaltyInfo[0].bps.length)throw new ServiceError('Published Boson offer bindings changed',409);
  for(const [key,value]of Object.entries(dates))if(BigInt(record.offerDates[key])!==BigInt(value))throw new ServiceError('Published redemption dates changed',409);
  for(const [key,value]of Object.entries(durations))if(BigInt(record.offerDurations[key])!==BigInt(value))throw new ServiceError('Published exchange periods changed',409);
  if(String(record.disputeResolutionTerms.disputeResolverId)!==String(spec.args[3].disputeResolverId)||!same(record.disputeResolutionTerms.mutualizerAddress,ZeroAddress))throw new ServiceError('Published dispute resolver changed',409);
  return true;
}
