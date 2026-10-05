// Only public reads and mutated in-memory probes. No wallet keys, approvals or sends.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Contract,JsonRpcProvider,FetchRequest,keccak256} from 'ethers';
import {ROOT} from '../src/compile.mjs';
import {load,bosonABI} from '../src/chain.mjs';
import {BASE_RPC,BASE_CHECK_RPC,assertBase} from '../src/base-chain.mjs';
import {readOfferForCommit,commitOrder} from '../src/boson.mjs';
import {assertBosonImplementation} from '../src/boson-implementation.mjs';
if(process.env.AIM_DEMO_NETWORK!=='base-sepolia')throw new Error('Explicit public Base profile required');
const state=load('state.json'),market=load('marketplace.json'),manifest=load('manifest.json');
if(manifest.chainId!==84532||!manifest.publicTransactions||load('pending.json'))throw new Error('Public idle Base manifest required');
const before={receipts:load('public-receipts.json').length,orders:state.orders.length};
const providers=[BASE_RPC,BASE_CHECK_RPC].map(url=>{const request=new FetchRequest(url);request.timeout=15000;return new JsonRpcProvider(request,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});});
try{
  for(const p of providers){
    await assertBase(p);
    for(const [address,expected]of [[manifest.sourceBoson,manifest.sourceBosonCodeHash],[manifest.credit,manifest.creditCodeHash]])
      if(keccak256(await p.getCode(address))!==expected)throw new Error('Pinned purchase contract code changed');
  }
  const contexts=providers.map(p=>({manifest,provider:p,boson:new Contract(manifest.sourceBoson,bosonABI(),p),assertChain:()=>assertBase(p),assertProtocol:options=>assertBosonImplementation(p,manifest,options),
    wallets:{buyer:{address:'0x'+'1'.repeat(40)}},credit:{allowance:()=>assert.fail('Unexpected payment/approval access')},transact:()=>assert.fail('Verifier must never send')}));
  const offers=[];
  for(const listing of market.listings){
    const quotes=await Promise.all(contexts.map(ctx=>readOfferForCommit(ctx,state,listing)));
    if(quotes.some(q=>q.offer.offer.quantityAvailable!==quotes[0].offer.offer.quantityAvailable))throw new Error('RPCs disagree on current stock');
    offers.push({offerId:listing.offerId,available:true,quantityAvailable:quotes[0].offer.offer.quantityAvailable.toString(),
      blocks:quotes.map(q=>({number:q.block.number,hash:q.block.hash,timestamp:q.block.timestamp})),
      staticSellerOffer:true,zeroSellerDeposit:true,zeroCancelPenalty:true});
  }
  const listing=market.listings.find(l=>l.id!=='legacy-service');if(!listing)throw new Error('Published marketplace offer required');
  const negativeCases=[];
  for(const failure of ['expired','not-started','sold-out','voided','unsupported-offer','cancel-penalty','seller-deposit','missing','noncanonical']){
    const base=contexts[0];
    const ctx={...base,boson:{getOffer:async(id,options)=>{
      const r=await base.boson.getOffer(id,options);
      const result={exists:r.exists,offer:r.offer.toObject(),offerDates:r.offerDates.toObject()};
      if(failure==='expired'){const b=await base.provider.getBlock(options.blockTag);result.offerDates.validUntil=BigInt(b.timestamp)-1n;}
      if(failure==='not-started'){const b=await base.provider.getBlock(options.blockTag);result.offerDates.validFrom=BigInt(b.timestamp)+3600n;}
      if(failure==='sold-out')result.offer.quantityAvailable=0n;
      if(failure==='voided')result.offer.voided=true;
      if(failure==='unsupported-offer')result.offer.priceType=1n;
      if(failure==='cancel-penalty')result.offer.buyerCancelPenalty=1n;
      if(failure==='seller-deposit')result.offer.sellerDeposit=1n;
      return result;
    }}};
    if(failure==='noncanonical')ctx.provider={getBlock:async tag=>{const b=await base.provider.getBlock(tag);return tag==='latest'?b:{...b,hash:'0x'+'0'.repeat(64)};}};
    const candidate=failure==='missing'?{...listing,offerId:'999999999'}:listing;
    await assert.rejects(commitOrder(ctx,state,candidate),failure==='noncanonical'?/no longer canonical/:failure==='missing'||failure==='cancel-penalty'||failure==='seller-deposit'?/parameters changed/:/unavailable/);
    negativeCases.push({name:failure,refusedBeforeAllowanceAndSend:true,method:failure==='missing'?'Actual public missing offer ID':'In-memory changed reads derived from the actual public offer; no chain mutation'});
  }
  if(load('public-receipts.json').length!==before.receipts||load('state.json').orders.length!==before.orders||load('pending.json'))throw new Error('Live writes overlapped verification');
  const report={verifiedAt:new Date().toISOString(),status:'passed',chainId:84532,testOnly:true,providersVerified:2,offers,
    offerCount:offers.length,negativeCases,chainWritesCreated:0,receiptCountBefore:before.receipts,receiptCountAfter:load('public-receipts.json').length,
    allowanceReadsDuringNegativeProbes:0,sendAttempts:0,
    protocolReference:'https://github.com/bosonprotocol/boson-protocol-contracts/blob/v2.5.0/contracts/protocol/facets/ExchangeCommitFacet.sol#L407-L413',
    limits:'Positive quotes use actual current contracts on two RPCs and a fresh canonical block per quote. Except the real missing offer ID, negative probes alter in-memory read responses; no unavailable offers were created on-chain. This verifies the runtime pre-payment guard, not an atomic reservation of stock; simulation and the final contract still protect later state changes.'};
  fs.writeFileSync(path.join(ROOT,'evidence/PURCHASE_PREFLIGHT_VERIFICATION.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{providers.forEach(p=>p.destroy());}
