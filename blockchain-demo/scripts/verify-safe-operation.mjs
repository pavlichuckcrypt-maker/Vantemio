// Real Safe ECDSA approval and public simulation; no native signing or broadcasting.
import assert from 'node:assert/strict';
import path from 'node:path';
import {ROOT} from '../src/compile.mjs';
import {load,json,safeProposal} from '../src/chain.mjs';
import {connectBase} from '../src/base-chain.mjs';
import {loadWallets} from '../src/vault.mjs';
import {verifySafeProposal,verifySafeBroadcast} from '../src/safe-operation.mjs';
import {writeDurableJSON} from '../src/durable-json.mjs';
if(process.env.AIM_DEMO_NETWORK!=='base-sepolia'||load('pending.json'))throw new Error('Idle explicit Base profile required');
const before=load('public-receipts.json').length,{wallets}=await loadWallets(),ctx=await connectBase(wallets);
try{
 assert.equal(await ctx.nft.paused(),false);
 const proposal=await safeProposal(ctx,ctx.manifest.nft,ctx.nft.interface.encodeFunctionData('pause'));
 assert.equal(await ctx.safe.execTransaction.staticCall(...proposal.exec),true);
 const request={...await ctx.safe.execTransaction.populateTransaction(...proposal.exec),chainId:84532,from:ctx.wallets.operator.address,nonce:await ctx.provider.getTransactionCount(ctx.wallets.operator.address,'pending'),value:0n};
 const result=await verifySafeBroadcast(ctx,'operator',request,proposal);
 const probes=[];
 await assert.rejects(ctx.transact('safe-execution',async()=>request),/bound proposal/);probes.push({name:'missing-gateway-proposal',refusedBeforeGasAndSigning:true});
 for(const [name,change]of [['changed-target',{to:ctx.manifest.nft}],['changed-actor',{from:ctx.wallets.buyer.address}],['changed-calldata',{data:request.data+'00'}],['native-value',{value:1n}],['wrong-chain',{chainId:8453}]]){
  await assert.rejects(verifySafeBroadcast(ctx,'operator',{...request,...change},proposal));probes.push({name,refused:true,method:'Copy of real prepared request changed in memory'});
 }
 await assert.rejects(verifySafeBroadcast(ctx,'buyer',request,proposal));probes.push({name:'wrong-role',refused:true});
 await assert.rejects(verifySafeProposal(ctx,proposal,{monotonicNow:()=>proposal.issuedAtMonotonic+120000}),/expired/);probes.push({name:'exact-monotonic-expiry',refused:true,method:'Injected test clock; live chain unchanged'});
 const two=await safeProposal(ctx,ctx.manifest.nft,ctx.nft.interface.encodeFunctionData('pause'),2);await assert.rejects(verifySafeProposal(ctx,two),/exactly three/);probes.push({name:'two-signatures',refused:true,method:'Two real off-chain signatures; no transaction signing'});
 assert.equal(load('public-receipts.json').length,before);assert.equal(load('pending.json'),null);
 const report={verifiedAt:new Date().toISOString(),passed:true,chainId:84532,testOnly:true,method:result.method,digest:result.digest,approvalAddresses:proposal.approvals,signatureCount:3,safeNonce:proposal.nonce.toString(),simulation:true,probes,nativeTransactionsSigned:0,chainWritesCreated:0,receiptCountBefore:before,receiptCountAfter:before,scope:'Real registered Safe keys sign the actual pinned Safe digest; public execTransaction eth_call succeeds. Runtime guard checks canonical NFT-only mint/pause/unpause call, zero CALL/value/refunds, exact sorted three ECDSA approvals, current Safe nonce/authority and code, outer executor/from/to/bytes/nonce and 120-second monotonic deadline. Negative copies and clock changes stay in memory. The software timeout is not expiry enforced by the Safe contract; all demo signers are on one Mac.'};
 writeDurableJSON(path.join(ROOT,'evidence/SAFE_OPERATION_VERIFICATION.json'),json(report)+'\n');console.log(json(report));
}finally{ctx.provider.destroy();}
