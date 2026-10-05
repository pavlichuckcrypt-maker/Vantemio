import { keccak256, TypedDataEncoder, verifyTypedData } from 'ethers';
import { hash, load } from './chain.mjs';
import {registeredSafeOwnersMatch} from './approval-authority.mjs';
import { audit, verifyAudit } from './security.mjs';
import {assertRuntimeBoson} from './boson-implementation.mjs';
import {assertRuntimeSafe} from './safe-authority.mjs';

export const COMMERCE_POLICY='demo-commerce-v3';
const types={Operation:[{name:'policy',type:'string'},{name:'action',type:'string'},
  {name:'actor',type:'address'},{name:'dataHash',type:'bytes32'},{name:'implementationDigest',type:'bytes32'},{name:'nonce',type:'uint256'},
  {name:'expiresAt',type:'uint256'}]};
const roles={createSeller:'seller',createDisputeResolver:'resolver',createOffer:'seller',
  commitToOffer:'buyer',approve:'buyer',redeemVoucher:'buyer',completeExchange:'buyer',
  cancelVoucher:'buyer',raiseDispute:'buyer',retractDispute:'buyer',withdrawFunds:['buyer','seller']};
export function verifyQuorum(domain,message,approvals,owners,now,implementationDigest) {
  if(domain.name!=='AIMmontag Demo Commerce'||domain.version!=='3'||domain.chainId!==84532||message.policy!==COMMERCE_POLICY
    ||!/^0x[a-fA-F0-9]{64}$/.test(implementationDigest||'')||message.implementationDigest!==implementationDigest
    ||!Number.isSafeInteger(message.expiresAt)||message.expiresAt<=now||message.expiresAt>now+180)
    throw new Error('Invalid or stale commerce approval');
  if(!Array.isArray(approvals)||approvals.length!==3)throw new Error('Commerce quorum requires 3 approvals');
  const allowed=new Set(owners.map(a=>a.toLowerCase())),seen=new Set();
  for(const a of approvals){const recovered=verifyTypedData(domain,types,message,a.signature).toLowerCase();
    if(recovered!==a.address.toLowerCase()||!allowed.has(recovered)||seen.has(recovered))throw new Error('Commerce approval signer mismatch');seen.add(recovered);}
  return TypedDataEncoder.hash(domain,types,message);
}
export async function approveCommerce(ctx,role,label,contract,method,request) {
  if(ctx.manifest.chainId!==84532||!ctx.manifest.publicTransactions)throw new Error('Commerce policy requires public Base Sepolia');
  await ctx.assertChain();verifyAudit();
  if(!(Array.isArray(roles[method])?roles[method].includes(role):roles[method]===role)||!ctx.wallets[role]||request.value&&BigInt(request.value)!==0n)throw new Error('Unauthorized commerce role or value');
  const credit=method==='approve';const target=credit?ctx.manifest.credit:ctx.manifest.sourceBoson;
  const expectedHash=credit?ctx.manifest.creditCodeHash:ctx.manifest.sourceBosonCodeHash;
  if(contract.target.toLowerCase()!==target.toLowerCase()||request.to.toLowerCase()!==target.toLowerCase()
    ||keccak256(await ctx.provider.getCode(target))!==expectedHash)throw new Error('Unapproved commerce contract');
  if(contract.interface.parseTransaction({data:request.data}).name!==method)throw new Error('Commerce calldata selector mismatch');
  const implementation=await assertRuntimeBoson(ctx);
  await assertRuntimeSafe(ctx);
  if((load('marketplace.json',{}).paused||await ctx.nft.paused())&&['createOffer','commitToOffer','approve'].includes(method))throw new Error('Marketplace is paused; cancellation and refund remain available');
  const now=(await ctx.provider.getBlock('latest')).timestamp;
  const issuedAtMonotonic=performance.now();
  const nonce=await ctx.provider.getTransactionCount(ctx.wallets[role].address,'pending');
  const domain={name:'AIMmontag Demo Commerce',version:'3',chainId:84532,verifyingContract:target};
  const implementationDigest=ctx.manifest.sourceBosonImplementationDigest;
  if(implementation?.digest!==implementationDigest)throw new Error('Commerce implementation approval mismatch');
  const message={policy:COMMERCE_POLICY,action:label,actor:ctx.wallets[role].address,dataHash:keccak256(request.data),implementationDigest,nonce,expiresAt:now+120};
  const owners=ctx.manifest.safeOwners;
  const actualOwners=(await ctx.safe.getOwners()).map(a=>a.toLowerCase()).sort();
  if(!registeredSafeOwnersMatch(actualOwners,owners,await ctx.safe.getThreshold()))throw new Error('Registered approval owners changed');
  const signers=Object.entries(ctx.wallets).filter(([r])=>r.startsWith('signer')).map(([,w])=>w)
    .filter(w=>owners.some(a=>a.toLowerCase()===w.address.toLowerCase())).slice(0,3);
  const approvals=await Promise.all(signers.map(async w=>({address:w.address,signature:await w.signTypedData(domain,types,message)})));
  const digest=verifyQuorum(domain,message,approvals,owners,now,implementationDigest);
  if(await ctx.provider.getTransactionCount(message.actor,'pending')!==nonce)throw new Error('Commerce nonce changed before execution');
  audit('commerce-quorum-approved',{policy:COMMERCE_POLICY,action:label,role,digest,target,nonce,
    approvals:approvals.map(a=>a.address),expiresAt:message.expiresAt,dataHash:message.dataHash,implementationDigest});
  return {policy:COMMERCE_POLICY,digest,nonce,approvals:approvals.map(a=>a.address),expiresAt:message.expiresAt,implementationDigest,
    authorization:{domain,message,signatures:approvals,issuedAtMonotonic}};
}

// Called after wallet population/signing and immediately before durable journal/broadcast.
// No persistence here: signatures stay in memory and are never exported as evidence.
export async function verifyCommerceBroadcast(ctx,role,request,approval,{monotonicNow=()=>performance.now(),expectedAction,readLocalPause=()=>Boolean(load('marketplace.json',{}).paused)}={}){
  const auth=approval?.authorization,m=auth?.message,d=auth?.domain;
  if(!auth||!m||!d||ctx.manifest.chainId!==84532||!ctx.manifest.publicTransactions||approval.policy!==COMMERCE_POLICY||Number(request.chainId)!==84532
    ||typeof m.actor!=='string'||typeof d.verifyingContract!=='string'||expectedAction&&m.action!==expectedAction
    ||!ctx.wallets[role]||m.actor.toLowerCase()!==ctx.wallets[role].address.toLowerCase()
    ||request.from?.toLowerCase()!==m.actor.toLowerCase()||request.to?.toLowerCase()!==d.verifyingContract.toLowerCase()
    ||![ctx.manifest.sourceBoson,ctx.manifest.credit].some(a=>a?.toLowerCase()===request.to.toLowerCase())
    ||BigInt(request.value??0)!==0n||String(request.nonce)!==String(m.nonce)||keccak256(request.data||'0x')!==m.dataHash
    ||approval.nonce!==m.nonce||approval.expiresAt!==m.expiresAt||approval.implementationDigest!==m.implementationDigest)
    throw new Error('Commerce broadcast authorization changed');
  const contract=request.to.toLowerCase()===ctx.manifest.credit.toLowerCase()?ctx.credit:ctx.boson;
  const method=contract.interface.parseTransaction({data:request.data})?.name;
  if(!(Array.isArray(roles[method])?roles[method].includes(role):roles[method]===role))throw new Error('Commerce method/role changed before broadcast');
  const implementation=await assertRuntimeBoson(ctx);
  if(implementation?.digest!==ctx.manifest.sourceBosonImplementationDigest)throw new Error('Commerce implementation changed before broadcast');
  await assertRuntimeSafe(ctx);
  const [owners,threshold,nonce]=await Promise.all([ctx.safe.getOwners(),ctx.safe.getThreshold(),ctx.provider.getTransactionCount(m.actor,'pending')]);
  if(!registeredSafeOwnersMatch(owners,ctx.manifest.safeOwners,threshold)||nonce!==m.nonce)throw new Error('Commerce nonce or approval owners changed before broadcast');
  if(['createOffer','commitToOffer','approve'].includes(method)&&(readLocalPause()||await ctx.nft.paused()))throw new Error('Marketplace paused before broadcast; cancellation and refund remain available');
  const now=(await ctx.provider.getBlock('latest')).timestamp,monotonicTime=monotonicNow();
  if(!Number.isFinite(auth.issuedAtMonotonic)||!Number.isFinite(monotonicTime)||monotonicTime<auth.issuedAtMonotonic
    ||monotonicTime>=auth.issuedAtMonotonic+120000)throw new Error('Commerce approval expired during transaction preparation');
  const digest=verifyQuorum(d,m,auth.signatures,ctx.manifest.safeOwners,now,ctx.manifest.sourceBosonImplementationDigest);
  if(digest!==approval.digest)throw new Error('Commerce approval digest changed before broadcast');
  return {policy:COMMERCE_POLICY,digest,nonce,implementationDigest:implementation.digest,expiresAt:m.expiresAt};
}

export async function approveDelivery(ctx,binding,nonce){
  if(ctx.manifest.chainId!==84532||!ctx.manifest.publicTransactions)throw new Error('Delivery requires public Base Sepolia');
  await ctx.assertChain();verifyAudit();
  if(keccak256(await ctx.provider.getCode(ctx.manifest.sourceBoson))!==ctx.manifest.sourceBosonCodeHash)throw new Error('Delivery protocol code changed');
  const implementation=await assertRuntimeBoson(ctx);
  await assertRuntimeSafe(ctx);
  const actualOwners=(await ctx.safe.getOwners()).map(a=>a.toLowerCase()).sort();
  if(!registeredSafeOwnersMatch(actualOwners,ctx.manifest.safeOwners,await ctx.safe.getThreshold()))throw new Error('Delivery approval owners changed');
  const now=(await ctx.provider.getBlock('latest')).timestamp;
  const domain={name:'AIMmontag Demo Commerce',version:'3',chainId:84532,verifyingContract:ctx.manifest.sourceBoson};
  const implementationDigest=ctx.manifest.sourceBosonImplementationDigest;
  if(implementation?.digest!==implementationDigest)throw new Error('Delivery implementation approval mismatch');
  const message={policy:COMMERCE_POLICY,action:'digital-delivery',actor:ctx.wallets.buyer.address,
    dataHash:hash(JSON.stringify(binding)),implementationDigest,nonce,expiresAt:now+90};
  const owners=ctx.manifest.safeOwners,signers=Object.entries(ctx.wallets).filter(([r])=>r.startsWith('signer')).map(([,w])=>w)
    .filter(w=>owners.some(a=>a.toLowerCase()===w.address.toLowerCase())).slice(0,3);
  const approvals=await Promise.all(signers.map(async w=>({address:w.address,signature:await w.signTypedData(domain,types,message)})));
  const digest=verifyQuorum(domain,message,approvals,owners,now,implementationDigest);
  audit('delivery-quorum-approved',{policy:COMMERCE_POLICY,digest,nonce,assetSha256:binding.sha256,exchangeId:binding.exchangeId,
    approvals:approvals.map(a=>a.address),expiresAt:message.expiresAt,implementationDigest});
  return digest;
}
