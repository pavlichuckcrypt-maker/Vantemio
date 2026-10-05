import { ZeroAddress, ZeroHash, parseEther, formatEther } from 'ethers';
import { eventArgs, save, load } from './chain.mjs';
import { audit } from './security.mjs';
import { approveCommerce } from './commerce-policy.mjs';
import {marketOfferMetadata,assertOfferMetadata} from './offer-metadata.mjs';
import {offerAvailability} from './offer-availability.mjs';
import {assertRuntimeBoson} from './boson-implementation.mjs';

export const EXCHANGE_STATES=['COMMITTED','REVOKED','CANCELLED','REDEEMED','COMPLETED','DISPUTED'];
const uri = content => 'data:application/json;base64,'+Buffer.from(JSON.stringify(content)).toString('base64');

async function write(ctx,role,label,contract,method,args) {
  await contract[method].staticCall(...args);
  if(ctx.transact){const request=await contract[method].populateTransaction(...args);
    const approval=await approveCommerce(ctx,role,label,contract,method,request);
    if((await ctx.provider.getBlock('latest')).timestamp>=approval.expiresAt)throw new Error('Commerce approval expired before sending');
    return ctx.transact(label,async()=>({...request,nonce:approval.nonce}),{role,operation:ctx.marketRequest,commerceApproval:approval});}
  return (await contract[method](...args)).wait();
}

export async function initializeCommerce(ctx,state) {
  const {boson,signers,wallets,manifest}=ctx;
  if(!state.sellerId) {
    const receipt=await write(ctx,'seller','boson-seller',boson.connect(signers.seller),'createSeller',[
      {id:0,assistant:wallets.seller.address,admin:wallets.seller.address,clerk:ZeroAddress,
        treasury:wallets.seller.address,active:true,metadataUri:uri({name:'AIMmontag demo studio',testOnly:true})},
      {tokenId:0,tokenType:0},{contractURI:uri({name:'AIMmontag Demo Orders'}),royaltyPercentage:0,collectionSalt:ZeroHash},
      {gasLimit:5000000}]);
    const e=eventArgs(boson,receipt,'SellerCreated');
    state.sellerId=e.sellerId.toString();state.voucher=e.voucherCloneAddress;
    state.receipts.push({type:'boson-seller',tx:receipt.hash,block:receipt.blockNumber});save('state.json',state);
  }
  if(!state.resolverId) {
    const receipt=await write(ctx,'resolver','boson-resolver',boson.connect(signers.resolver),'createDisputeResolver',[
      {id:0,escalationResponsePeriod:604800,assistant:wallets.resolver.address,admin:wallets.resolver.address,
        clerk:ZeroAddress,treasury:wallets.resolver.address,metadataUri:uri({name:'Demo dispute resolver',testOnly:true}),active:true},
      [{tokenAddress:manifest.credit,tokenName:'DEMO',feeAmount:0}],[],{gasLimit:2500000}]);
    state.resolverId=eventArgs(boson,receipt,'DisputeResolverCreated').disputeResolverId.toString();
    state.receipts.push({type:'boson-resolver',tx:receipt.hash,block:receipt.blockNumber});save('state.json',state);
  }
  if(!state.offerId) {
    const now=(await ctx.provider.getBlock('latest')).timestamp;
    const disputePeriod=await boson.getMinDisputePeriod();
    const resolutionPeriod=await boson.getMinResolutionPeriod();
    const receipt=await write(ctx,'seller','boson-offer',boson.connect(signers.seller),'createOffer',[
      {id:0,sellerId:state.sellerId,price:parseEther('25'),sellerDeposit:0,buyerCancelPenalty:0,
        quantityAvailable:100,exchangeToken:manifest.credit,priceType:0,creator:0,
        metadataUri:uri({name:'Video editing / accepted final cut',description:'Testnet demo service; no monetary value',testOnly:true}),
        metadataHash:'',voided:false,collectionIndex:0,royaltyInfo:[{recipients:[],bps:[]}],buyerId:0},
      {validFrom:now-1,validUntil:now+365*86400,voucherRedeemableFrom:now-1,voucherRedeemableUntil:0},
      {disputePeriod,voucherValid:30*86400,resolutionPeriod},
      {disputeResolverId:state.resolverId,mutualizerAddress:ZeroAddress},0,parseEther('25'),{gasLimit:3500000}]);
    state.offerId=eventArgs(boson,receipt,'OfferCreated').offerId.toString();
    state.receipts.push({type:'boson-offer',tx:receipt.hash,block:receipt.blockNumber});save('state.json',state);
  }
}

export async function readOfferForCommit(ctx,state,listing=null){
  if(ctx.assertChain)await ctx.assertChain();
  const offerId=listing?.offerId||state.offerId;
  const expectedPrice=listing?.price||'25';
  const block=await ctx.provider.getBlock('latest');
  if(!block?.hash||!Number.isSafeInteger(block.number)||!Number.isSafeInteger(block.timestamp)||block.timestamp<=0)throw new Error('Purchase block is unverified');
  await assertRuntimeBoson(ctx,{blockTag:block.number});
  const offer=await ctx.boson.getOffer(offerId,{blockTag:block.number});
  if(!offer.exists || offer.offer.exchangeToken.toLowerCase()!==ctx.manifest.credit.toLowerCase()
      || offer.offer.sellerId.toString()!==state.sellerId || offer.offer.price!==parseEther(expectedPrice)
      || offer.offer.sellerDeposit!==0n || offer.offer.buyerCancelPenalty!==0n
      || listing&&offer.offer.metadataHash!==listing.metadataHash)
    throw new Error('Boson offer parameters changed');
  assertOfferMetadata(listing,offer.offer,{legacyOfferId:state.offerId});
  const availability=offerAvailability(offer,block.timestamp);
  if(!availability.available)throw new Error('Boson offer is unavailable: '+availability.reason);
  if((await ctx.provider.getBlock(block.number))?.hash!==block.hash)throw new Error('Purchase block is no longer canonical');
  return {offerId,expectedPrice,offer,block};
}
export async function commitOrder(ctx,state,listing=null) {
  if(state.orders.length>=100) throw new Error('Demo order limit reached');
  const {offerId,expectedPrice,offer}=await readOfferForCommit(ctx,state,listing);
  const allowance=await ctx.credit.allowance(ctx.wallets.buyer.address,ctx.manifest.sourceBoson);
  if(allowance<offer.offer.price) await write(ctx,'buyer','demo-credit-approval',ctx.credit.connect(ctx.signers.buyer),'approve',[ctx.manifest.sourceBoson,offer.offer.price]);
  const contract=ctx.boson.connect(ctx.signers.buyer);
  await contract.commitToOffer.staticCall(ctx.wallets.buyer.address,offerId);
  audit('order-approved',{offerId,price:expectedPrice,currency:'DEMO',mode:ctx.manifest.mode,authority:'demo-buyer-EOA with software quorum'});
  const receipt=await write(ctx,'buyer','boson-commit',contract,'commitToOffer',[ctx.wallets.buyer.address,offerId,{gasLimit:2500000}]);
  const event=eventArgs(contract,receipt,'BuyerCommitted');
  const order={exchangeId:event.exchangeId.toString(),buyerId:event.buyerId.toString(),offerId,
    ...(listing?{listingId:listing.id,title:listing.title,kind:listing.kind,assetId:listing.assetId}:{}),
    state:'COMMITTED',price:expectedPrice,currency:'DEMO',createdAt:new Date().toISOString(),
    txs:[{action:'commit',tx:receipt.hash,block:receipt.blockNumber}]};
  state.orders.unshift(order); save('state.json',state);
  audit('order-committed',{exchangeId:order.exchangeId,tx:receipt.hash});
  await refreshOrder(ctx,order);return order;
}
export async function refreshOrder(ctx,order,options={}) {
  const result=await ctx.boson.getExchange(order.exchangeId,options);
  if(!result.exists || result.exchange.offerId.toString()!==order.offerId || result.exchange.buyerId.toString()!==order.buyerId)throw new Error('Boson exchange verification failed');
  order.state=EXCHANGE_STATES[Number(result.exchange.state)]??'UNKNOWN';
  order.redeemedAt=result.voucher.redeemedDate.toString();
  if(order.state==='DISPUTED') {
    const dispute=await ctx.boson.getDispute(order.exchangeId,options);
    order.disputeState=Number(dispute.dispute.state);
    order.disputeFinalizedAt=dispute.disputeDates.finalized.toString();
    order.disputeRetracted=order.txs.some(t=>t.action==='retract')&&dispute.disputeDates.finalized>0n;
  }
  return order;
}
export async function transitionOrder(ctx,state,id,action) {
  const order=state.orders.find(x=>x.exchangeId===String(id));if(!order)throw new Error('Unknown demo order');
  await refreshOrder(ctx,order);
  const transitions={redeem:['COMMITTED','redeemVoucher'],complete:['REDEEMED','completeExchange'],
    cancel:['COMMITTED','cancelVoucher'],dispute:['REDEEMED','raiseDispute'],retract:['DISPUTED','retractDispute']};
  const rule=transitions[action];if(!rule || rule[0]!==order.state)throw new Error('Invalid Boson transition');
  if(action==='complete'&&order.assetId&&!order.deliveredSha256)throw new Error('Digital file delivery must precede completion');
  const contract=ctx.boson.connect(ctx.signers.buyer);
  await contract[rule[1]].staticCall(order.exchangeId);
  audit('order-transition-approved',{exchangeId:order.exchangeId,action,authority:'demo-buyer-EOA'});
  const receipt=await write(ctx,'buyer','boson-'+action,contract,rule[1],[order.exchangeId,{gasLimit:2000000}]);
  if(receipt.status!==1)throw new Error('Order transaction reverted');
  if(action==='retract'&&eventArgs(contract,receipt,'DisputeRetracted').exchangeId.toString()!==order.exchangeId)
    throw new Error('Dispute retraction event mismatch');
  order.txs.push({action,tx:receipt.hash,block:receipt.blockNumber});
  await refreshOrder(ctx,order);save('state.json',state);
  audit('order-transition-confirmed',{exchangeId:order.exchangeId,action,state:order.state,tx:receipt.hash});return order;
}
export async function withdrawRefund(ctx,state,id) {
  const order=state.orders.find(x=>x.exchangeId===String(id));if(!order)throw new Error('Unknown demo order');
  await refreshOrder(ctx,order);
  if(order.state!=='CANCELLED'||order.refundWithdrawn)throw new Error('No pending refund for this order');
  const amount=parseEther(order.price);
  const available=await ctx.boson.getAllAvailableFunds(order.buyerId);
  const funds=available.find(f=>f.tokenAddress.toLowerCase()===ctx.manifest.credit.toLowerCase());
  if(!funds||funds.availableAmount<amount)throw new Error('Refund is not available in Boson');
  const contract=ctx.boson.connect(ctx.signers.buyer);
  await contract.withdrawFunds.staticCall(order.buyerId,[ctx.manifest.credit],[amount]);
  const before=await ctx.credit.balanceOf(ctx.wallets.buyer.address);
  audit('refund-approved',{exchangeId:order.exchangeId,amount:order.price,authority:'demo-buyer-EOA'});
  const receipt=await write(ctx,'buyer','boson-refund',contract,'withdrawFunds',[order.buyerId,[ctx.manifest.credit],[amount],{gasLimit:1500000}]);
  if(await ctx.credit.balanceOf(ctx.wallets.buyer.address)!==before+amount)throw new Error('Refund balance verification failed');
  order.refundWithdrawn=true;order.txs.push({action:'refund',tx:receipt.hash,block:receipt.blockNumber});save('state.json',state);
  audit('refund-confirmed',{exchangeId:order.exchangeId,tx:receipt.hash});return order;
}
export async function commerceSummary(ctx,state,options={}) {
  const [allFunds,buyerFunds,buyerBalance,protocolBalance]=await Promise.all([
    ctx.boson.getAllAvailableFunds(state.sellerId,options),
    state.orders.length?ctx.boson.getAllAvailableFunds(state.orders[0].buyerId,options):[],
    ctx.credit.balanceOf(ctx.wallets.buyer.address,options),
    ctx.credit.balanceOf(ctx.manifest.sourceBoson,options)
  ]);
  const funds=allFunds.filter(f=>f.tokenAddress.toLowerCase()===ctx.manifest.credit.toLowerCase());
  const refund=buyerFunds.find(f=>f.tokenAddress.toLowerCase()===ctx.manifest.credit.toLowerCase());
  return {sellerId:state.sellerId,resolverId:state.resolverId,offerId:state.offerId,voucher:state.voucher,
    price:'25',currency:'DEMO',buyerBalance:formatEther(buyerBalance),
    sellerAvailable:funds.length?formatEther(funds[0].availableAmount):'0',
    buyerRefundAvailable:refund?formatEther(refund.availableAmount):'0',
    protocolBalance:formatEther(protocolBalance),
    authority:ctx.manifest.publicTransactions?'demo EOAs + 3 verified software approvals; same Mac':'demo EOAs; automatic test signing',escrow:ctx.manifest.publicTransactions?'official Boson contracts on public Base Sepolia':'official Boson contracts on local fork'};
}

export async function createMarketOffer(ctx,state,listing) {
  const now=(await ctx.provider.getBlock('latest')).timestamp;
  const {metadataHash,metadataUri}=marketOfferMetadata(listing);
  const receipt=await write(ctx,'seller','boson-market-offer',ctx.boson.connect(ctx.signers.seller),'createOffer',[
    {id:0,sellerId:state.sellerId,price:parseEther(listing.price),sellerDeposit:0,buyerCancelPenalty:0,
      quantityAvailable:listing.quantity,exchangeToken:ctx.manifest.credit,priceType:0,creator:0,
      metadataUri,metadataHash,voided:false,collectionIndex:0,royaltyInfo:[{recipients:[],bps:[]}],buyerId:0},
    {validFrom:now-1,validUntil:now+365*86400,voucherRedeemableFrom:now-1,voucherRedeemableUntil:0},
    {disputePeriod:await ctx.boson.getMinDisputePeriod(),voucherValid:30*86400,resolutionPeriod:await ctx.boson.getMinResolutionPeriod()},
    {disputeResolverId:state.resolverId,mutualizerAddress:ZeroAddress},0,parseEther(listing.price),{gasLimit:3500000}]);
  const offerId=eventArgs(ctx.boson,receipt,'OfferCreated').offerId.toString();
  return {offerId,metadataHash,tx:receipt.hash,block:receipt.blockNumber,
    explorer:ctx.manifest.explorer+'/tx/'+receipt.hash};
}

export async function withdrawSeller(ctx,state){
  const all=await ctx.boson.getAllAvailableFunds(state.sellerId);
  const amount=all.find(f=>f.tokenAddress.toLowerCase()===ctx.manifest.credit.toLowerCase())?.availableAmount;
  if(!amount||amount<=0n)throw new Error('No seller proceeds available');
  const before=await ctx.credit.balanceOf(ctx.wallets.seller.address);
  const receipt=await write(ctx,'seller','boson-seller-withdraw',ctx.boson.connect(ctx.signers.seller),'withdrawFunds',
    [state.sellerId,[ctx.manifest.credit],[amount],{gasLimit:1500000}]);
  if(await ctx.credit.balanceOf(ctx.wallets.seller.address)!==before+amount)throw new Error('Seller withdrawal balance verification failed');
  audit('seller-withdrawn',{sellerId:state.sellerId,amount:amount.toString(),tx:receipt.hash});
  return {amount:formatEther(amount),tx:receipt.hash,explorer:ctx.manifest.explorer+'/tx/'+receipt.hash};
}
