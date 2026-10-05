// Real Base reads and three off-chain demo approvals. No native transaction is signed/sent.
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {parseEther,ZeroAddress} from 'ethers';
import {ROOT} from '../src/compile.mjs';
import {load,json} from '../src/chain.mjs';
import {connectBase} from '../src/base-chain.mjs';
import {loadWallets} from '../src/vault.mjs';
import {approveCommerce,verifyCommerceBroadcast,COMMERCE_POLICY} from '../src/commerce-policy.mjs';
import {broadcastJournaled} from '../src/public-journal.mjs';
import {writeDurableJSON} from '../src/durable-json.mjs';
import {marketOfferMetadata} from '../src/offer-metadata.mjs';
if(process.env.AIM_DEMO_NETWORK!=='base-sepolia')throw new Error('Explicit Base profile required');
const origin='http://127.0.0.1:18339',response=await fetch(origin+'/api/evidence',{signal:AbortSignal.timeout(30000)}),s=await response.json();
if(!response.ok||s.manifest?.chainId!==84532||!s.chainView?.verified||s.active||s.pendingTransaction)throw new Error('Idle verified Base service required');
const before=s.receipts.length,{wallets}=await loadWallets(),ctx=await connectBase(wallets);
try{
  const state=load('state.json'),contract=ctx.boson.connect(ctx.signers.seller),now=(await ctx.provider.getBlock('latest')).timestamp;
  const metadata=marketOfferMetadata({title:'Approval verification',description:'Off-chain simulation only; no offer created.',kind:'service',terms:'Test-only verification; no service commissioned.',assetSha256:null,certificate:null});
  const args=[{id:0,sellerId:state.sellerId,price:parseEther('1'),sellerDeposit:0,buyerCancelPenalty:0,quantityAvailable:1,exchangeToken:ctx.manifest.credit,priceType:0,creator:0,metadataUri:metadata.metadataUri,metadataHash:metadata.metadataHash,voided:false,collectionIndex:0,royaltyInfo:[{recipients:[],bps:[]}],buyerId:0},
    {validFrom:now-1,validUntil:now+86400,voucherRedeemableFrom:now-1,voucherRedeemableUntil:0},
    {disputePeriod:await ctx.boson.getMinDisputePeriod(),voucherValid:86400,resolutionPeriod:await ctx.boson.getMinResolutionPeriod()},
    {disputeResolverId:state.resolverId,mutualizerAddress:ZeroAddress},0,parseEther('1')];
  await contract.createOffer.staticCall(...args); // Real eth_call, no offer or funds changed.
  const populated=await contract.createOffer.populateTransaction(...args),label='boson-offer-verification';
  const approval=await approveCommerce(ctx,'seller',label,contract,'createOffer',populated);
  const request={...populated,from:wallets.seller.address,chainId:84532,value:0n,nonce:approval.nonce};
  const valid=await verifyCommerceBroadcast(ctx,'seller',request,approval,{expectedAction:label});
  assert.equal(valid.policy,COMMERCE_POLICY);assert.equal(approval.approvals.length,3);
  const probes=[];
  for(const [name,change]of [['actor',{from:wallets.buyer.address}],['nonce',{nonce:approval.nonce+1}],['calldata',{data:request.data+'00'}],['native-value',{value:1n}],['target',{to:ctx.manifest.credit}],['network',{chainId:8453}]]){
    await assert.rejects(verifyCommerceBroadcast(ctx,'seller',{...request,...change},approval,{expectedAction:label}),/authorization changed/);
    probes.push({name,refused:true,method:'Changed prepared input in memory; original real off-chain signatures retained'});
  }
  await assert.rejects(verifyCommerceBroadcast({...ctx,assertProtocol:async()=>({digest:'0x'+'0'.repeat(64)})},'seller',request,approval,{expectedAction:label}),/implementation changed/);
  probes.push({name:'implementation-digest',refused:true,method:'In-memory changed verifier result; live code unchanged'});
  await assert.rejects(ctx.transact(label,async()=>({...request}),{role:'seller'}),/requires a verified approval bundle/);
  probes.push({name:'missing-approval',refused:true,method:'Actual protected transaction gateway; refused before fee estimation/wallet signing'});
  let pending=null,signCalls=0,sendCalls=0;
  await assert.rejects(broadcastJournaled({provider:{broadcastTransaction:async()=>{sendCalls++;assert.fail('Never send');}},
    wallet:{address:wallets.seller.address,populateTransaction:async r=>r,signTransaction:async()=>{signCalls++;return '0x00';}},
    request,label,role:'seller',store:r=>{pending=r;},read:()=>pending,
    beforeBroadcast:r=>verifyCommerceBroadcast(ctx,'seller',r,approval,{expectedAction:label,monotonicNow:()=>approval.authorization.issuedAtMonotonic+120000})}),/expired during transaction preparation/);
  assert.equal(pending,null);assert.equal(signCalls,1);assert.equal(sendCalls,0);
  probes.push({name:'preparation-deadline',refused:true,method:'Actual journal and runtime final guard, real typed approvals/current chain reads; wallet native-sign step stubbed, monotonic delay modeled at 120 seconds; no pending persistence/broadcast'});
  const after=await(await fetch(origin+'/api/evidence',{signal:AbortSignal.timeout(30000)})).json();
  if(after.receipts.length!==before||after.pendingTransaction||load('pending.json'))throw new Error('Live writes overlapped approval verification');
  const reportPath=path.join(ROOT,'evidence/APPROVAL_BROADCAST_VERIFICATION.json'),previous=fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath,'utf8')):null;
  const readonlySimulationHistory=previous?.readonlySimulationHistory||[];
  if(previous?.simulation?.startsWith('withdrawFunds'))readonlySimulationHistory.push({verifiedAt:previous.verifiedAt,simulation:previous.simulation,quorumDigest:previous.quorumDigest,receiptCountBefore:previous.receiptCountBefore,receiptCountAfter:previous.receiptCountAfter});
  const report={verifiedAt:new Date().toISOString(),passed:true,chainId:84532,testOnly:true,policy:COMMERCE_POLICY,readonlySimulationHistory,
    offchainApprovalsVerified:3,implementationDigest:valid.implementationDigest,quorumDigest:valid.digest,
    requestSimulated:true,simulation:'createOffer: seller, test service, 1 DEMO, quantity 1; eth_call only, no offer published; remains usable after all seller proceeds are withdrawn',probes,
    nativeTransactionsSigned:0,broadcastAttempts:sendCalls,chainWritesCreated:0,receiptCountBefore:before,receiptCountAfter:after.receipts.length,
    expiredProbePersistedPending:false,
    limits:'Real demo EIP-712 signatures and live pinned protocol/authority/nonce reads. Negative inputs and delay are modeled in memory; no protocol state is changed. Software quorum/expiry gates are enforced by this runtime, not by the native EOA transaction or Boson contracts. Raw approval signatures remain in memory and are not exported. Same-Mac demo custody remains.'};
  writeDurableJSON(reportPath,json(report)+'\n');console.log(json(report));
}finally{ctx.provider.destroy();}
