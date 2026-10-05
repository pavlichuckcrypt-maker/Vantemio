import {JsonRpcProvider,FetchRequest,parseEther,keccak256} from 'ethers';
import {BASE_CHECK_RPC,assertBase} from './base-chain.mjs';
import {hash,eventArgs} from './chain.mjs';
import {refreshOrder} from './boson.mjs';
import {validateMarketAction} from './market-schema.mjs';
import {assertOfferMetadata} from './offer-metadata.mjs';

// No signer calls, resends or pending-file deletion. Only canonical reads and local reconstruction.
export async function verifyPurchaseReceipt(ctx,state,market,record,providers){
  if(ctx.manifest.chainId!==84532||!ctx.manifest.publicTransactions||record.chainId!==84532||record.label!=='boson-commit'||record.role!=='buyer'||record.status!==1||!/^0x[a-fA-F0-9]{64}$/.test(record.tx||''))throw new Error('Unregistered purchase receipt');
  if(providers?.length!==2||providers[0]===providers[1])throw new Error('Two distinct RPC providers required for recovery');
  await Promise.all(providers.map(assertBase));
  const receipts=await Promise.all(providers.map(p=>p.getTransactionReceipt(record.tx)));
  const txs=await Promise.all(providers.map(p=>p.getTransaction(record.tx)));
  const heads=await Promise.all(providers.map(p=>p.getBlockNumber()));
  const blockTag=Math.min(...heads)-2;
  for(let i=0;i<2;i++){
    const r=receipts[i],tx=txs[i];
    if(!r||r.status!==1||r.hash.toLowerCase()!==record.tx.toLowerCase()||r.blockNumber!==record.block||r.blockHash!==record.blockHash||blockTag<r.blockNumber)throw new Error('Purchase receipt is unconfirmed or differs from the archive');
    if(!tx||tx.hash?.toLowerCase()!==record.tx.toLowerCase()||Number(tx.chainId)!==84532||tx.to?.toLowerCase()!==ctx.manifest.sourceBoson.toLowerCase()||tx.from.toLowerCase()!==ctx.wallets.buyer.address.toLowerCase()||tx.value!==0n)throw new Error('Purchase actor, target, chain or value differs');
    if(i&&tx.data!==txs[0].data)throw new Error('RPCs disagree on purchase calldata');
    if((await providers[i].getBlock(r.blockNumber))?.hash!==r.blockHash)throw new Error('Purchase receipt is not canonical');
    for(const [address,expected]of [[ctx.manifest.sourceBoson,ctx.manifest.sourceBosonCodeHash],[ctx.manifest.credit,ctx.manifest.creditCodeHash]])if(keccak256(await providers[i].getCode(address,blockTag))!==expected)throw new Error('Recovery contract code differs from the manifest');
  }
  const blocks=await Promise.all(providers.map(p=>p.getBlock(blockTag)));
  if(!blocks[0]?.hash||blocks[0].hash!==blocks[1]?.hash)throw new Error('RPCs disagree on the recovery block');
  const decoded=ctx.boson.interface.parseTransaction({data:txs[0].data,value:0n});
  if(decoded?.name!=='commitToOffer'||decoded.args[0].toLowerCase()!==ctx.wallets.buyer.address.toLowerCase())throw new Error('Receipt does not execute the registered buyer commitment');
  const offerId=decoded.args[1].toString(),listing=market.listings.find(l=>l.offerId===offerId);
  if(!listing)throw new Error('Purchase refers to an unregistered listing');
  const event=eventArgs(ctx.boson,receipts[0],'BuyerCommitted');
  if(event.offerId.toString()!==offerId||event.executedBy.toLowerCase()!==ctx.wallets.buyer.address.toLowerCase()||event.exchange.offerId!==event.offerId||event.exchange.buyerId!==event.buyerId||event.exchange.id!==event.exchangeId)throw new Error('BuyerCommitted event bindings differ');
  const exchangeId=event.exchangeId.toString(),buyerId=event.buyerId.toString(),options={blockTag};
  const snapshots=[];
  for(const p of providers){
    const boson=ctx.boson.connect(p);
    const [x,buyer,result]=await Promise.all([boson.getExchange(exchangeId,options),boson.getBuyer(buyerId,options),boson.getOffer(offerId,options)]);
    if(!x.exists||x.exchange.offerId.toString()!==offerId||x.exchange.buyerId.toString()!==buyerId||!buyer.exists||buyer.buyer.wallet.toLowerCase()!==ctx.wallets.buyer.address.toLowerCase())throw new Error('Recovered exchange does not belong to the registered buyer');
    const offer=result.offer;
    if(!result.exists||offer.sellerId.toString()!==state.sellerId||offer.exchangeToken.toLowerCase()!==ctx.manifest.credit.toLowerCase()||offer.price!==parseEther(listing.price)||offer.metadataHash!==listing.metadataHash)throw new Error('Recovered offer terms differ');
    assertOfferMetadata(listing,offer,{legacyOfferId:state.offerId});
    const dispute=Number(x.exchange.state)===5?await boson.getDispute(exchangeId,options):null;
    snapshots.push(JSON.stringify({exchange:x.exchange,voucher:x.voucher,buyer:buyer.buyer,offer,dispute},(_key,value)=>typeof value==='bigint'?value.toString():value));
  }
  if(snapshots[0]!==snapshots[1])throw new Error('RPCs disagree on the recovered order state');
  const order={exchangeId,buyerId,offerId,listingId:listing.id,title:listing.title,kind:listing.kind,assetId:listing.assetId,
    state:'COMMITTED',price:listing.price,currency:'DEMO',createdAt:new Date(Number(event.voucher.committedDate)*1000).toISOString(),
    txs:[{action:'commit',tx:record.tx,block:record.block}],recovered:true,recoveryBlock:blockTag};
  await refreshOrder({...ctx,boson:ctx.boson.connect(providers[0])},order,options);
  const finalBlocks=await Promise.all(providers.map(p=>p.getBlock(blockTag)));
  if(finalBlocks.some(b=>b?.hash!==blocks[0].hash))throw new Error('Recovery block changed during verification');
  return order;
}

export async function reconcilePurchases(ctx,state,market,records,{providers,persistState,persistMarket,onRecovered=()=>{}}={}){
  const candidates=records.filter(r=>r.label==='boson-commit'&&(!state.orders.some(o=>o.txs.some(t=>t.action==='commit'&&t.tx.toLowerCase()===r.tx.toLowerCase()))||r.operation&&['pending','failed'].includes(market.requests[r.operation.key]?.status)));
  if(!candidates.length)return [];
  if(candidates.length>100)throw new Error('Recovery operation limit exceeded');
  let check;
  if(!providers){const request=new FetchRequest(BASE_CHECK_RPC);request.timeout=15000;check=new JsonRpcProvider(request,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});providers=[ctx.provider,check];}
  const recovered=[];
  try{
    for(const record of candidates){
      const order=await verifyPurchaseReceipt(ctx,state,market,record,providers),existing=state.orders.find(o=>o.exchangeId===order.exchangeId);
      if(existing&&(existing.offerId!==order.offerId||existing.buyerId!==order.buyerId))throw new Error('Stored order conflicts with recovered exchange');
      const request=record.operation?market.requests[record.operation.key]:null;
      if(record.operation&&(!request?.input||record.operation.action!=='buy'||request.input.action!=='buy'||request.input.listingId!==order.listingId||request.digest!==record.operation.digest||hash(JSON.stringify(request.input))!==request.digest||request.input.idempotencyKey!==record.operation.key))throw new Error('Recovery request binding differs');
      if(request)validateMarketAction(request.input);
      if(!existing){if(state.orders.length>=100)throw new Error('Demo order limit reached');state.orders.unshift(order);}
      else Object.assign(existing,{state:order.state,redeemedAt:order.redeemedAt,recovered:true,recoveryBlock:order.recoveryBlock,
        ...(order.disputeState!==undefined?{disputeState:order.disputeState,disputeFinalizedAt:order.disputeFinalizedAt}: {})});
      persistState();const result=existing||order;
      if(request){market.requests[record.operation.key]={...request,status:'confirmed',result,recovered:true,recoveredAt:new Date().toISOString()};persistMarket();}
      onRecovered(result);recovered.push(result);
    }
    return recovered;
  }finally{check?.destroy();}
}
