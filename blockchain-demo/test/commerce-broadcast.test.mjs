import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet,keccak256,TypedDataEncoder,Interface} from 'ethers';
import {COMMERCE_POLICY,verifyCommerceBroadcast} from '../src/commerce-policy.mjs';
import {broadcastJournaled} from '../src/public-journal.mjs';
const types={Operation:[{name:'policy',type:'string'},{name:'action',type:'string'},{name:'actor',type:'address'},{name:'dataHash',type:'bytes32'},{name:'implementationDigest',type:'bytes32'},{name:'nonce',type:'uint256'},{name:'expiresAt',type:'uint256'}]};
async function fixture(method='commitToOffer'){
 const wallets=Array.from({length:5},()=>Wallet.createRandom()),owners=wallets.map(w=>w.address),implementationDigest='0x'+'a'.repeat(64);
 const bosonInterface=new Interface(['function commitToOffer(address,uint256)','function withdrawFunds(uint256,address[],uint256[])']);
 const data=bosonInterface.encodeFunctionData(method,method==='withdrawFunds'?[7,[owners[0]],[1]]:[owners[3],7]);
 const request={chainId:84532,from:owners[3],to:owners[4],nonce:4,data,value:0n,type:2,gasLimit:100000n,maxFeePerGas:100000000n,maxPriorityFeePerGas:1000000n};
 const domain={name:'AIMmontag Demo Commerce',version:'3',chainId:84532,verifyingContract:request.to};
 const message={policy:COMMERCE_POLICY,action:'boson-commit',actor:request.from,dataHash:keccak256(request.data),implementationDigest,nonce:4,expiresAt:1060};
 const signatures=await Promise.all(wallets.slice(0,3).map(async w=>({address:w.address,signature:await w.signTypedData(domain,types,message)})));
 const approval={policy:COMMERCE_POLICY,digest:TypedDataEncoder.hash(domain,types,message),nonce:4,expiresAt:1060,implementationDigest,authorization:{domain,message,signatures,issuedAtMonotonic:0}};
 const ctx={manifest:{chainId:84532,publicTransactions:true,sourceBoson:request.to,credit:owners[0],sourceBosonImplementationDigest:implementationDigest,safeOwners:owners},wallets:{buyer:wallets[3]},
  boson:{interface:bosonInterface},credit:{interface:new Interface(['function approve(address,uint256)'])},nft:{paused:async()=>false},
  assertAuthority:async()=>({}),assertProtocol:async()=>({digest:implementationDigest}),safe:{getOwners:async()=>owners,getThreshold:async()=>3n},provider:{getBlock:async()=>({timestamp:1000}),getTransactionCount:async()=>4}};
 return {ctx,request,approval,wallets,owners};
}
test('prepared commerce request must retain signed actor/target/code/data/nonce/expiry and fresh authority',async()=>{
 const f=await fixture(),options={monotonicNow:()=>1000,expectedAction:'boson-commit',readLocalPause:()=>false};
 const prepared=await f.wallets[3].connect({getNetwork:async()=>({chainId:84532n})}).populateTransaction(f.request);
 assert.equal((await verifyCommerceBroadcast(f.ctx,'buyer',prepared,f.approval,options)).digest,f.approval.digest);
 assert.equal((await verifyCommerceBroadcast(f.ctx,'buyer',f.request,f.approval,options)).digest,f.approval.digest);
 for(const change of [{from:f.owners[0]},{to:f.owners[0]},{chainId:8453},{nonce:5},{data:'0x1235'},{value:1n}])await assert.rejects(verifyCommerceBroadcast(f.ctx,'buyer',{...f.request,...change},f.approval,options),/authorization changed/);
 await assert.rejects(verifyCommerceBroadcast(f.ctx,'buyer',f.request,f.approval,{...options,expectedAction:'other-action'}),/authorization changed/);
 await assert.rejects(verifyCommerceBroadcast({...f.ctx,assertProtocol:async()=>({digest:'0x'+'b'.repeat(64)})},'buyer',f.request,f.approval,options),/implementation changed/);
 for(const [safe,provider] of [[{...f.ctx.safe,getOwners:async()=>[...f.owners.slice(0,4),Wallet.createRandom().address]},f.ctx.provider],[f.ctx.safe,{...f.ctx.provider,getTransactionCount:async()=>5}]])await assert.rejects(verifyCommerceBroadcast({...f.ctx,safe,provider},'buyer',f.request,f.approval,options),/nonce or approval owners changed/);
 await assert.rejects(verifyCommerceBroadcast({...f.ctx,provider:{...f.ctx.provider,getBlock:async()=>({timestamp:1060})}},'buyer',f.request,f.approval,options),/stale commerce approval/);
 await assert.rejects(verifyCommerceBroadcast(f.ctx,'buyer',f.request,{...f.approval,digest:'0x'+'0'.repeat(64)},options),/digest changed/);
});
test('slow wallet preparation or stalled chain clock cannot send an expired approval or leave a pending hash',async()=>{
 const f=await fixture();let elapsed=0,pending,calls=0,signed=0;
 const wallet={address:f.request.from,populateTransaction:async request=>{const prepared=await f.wallets[3].connect({getNetwork:async()=>({chainId:84532n})}).populateTransaction(request);elapsed=120000;return prepared;},signTransaction:async request=>{signed++;return f.wallets[3].signTransaction(request);}};
 await assert.rejects(broadcastJournaled({wallet,request:f.request,label:'boson-commit',role:'buyer',read:()=>pending,store:r=>{pending=r;},
  provider:{broadcastTransaction:async()=>{calls++;assert.fail('Expired send');}},beforeBroadcast:r=>verifyCommerceBroadcast(f.ctx,'buyer',r,f.approval,{monotonicNow:()=>elapsed,expectedAction:'boson-commit',readLocalPause:()=>false})}),/expired during transaction preparation/);
 assert.equal(signed,1);assert.equal(calls,0);assert.equal(pending,undefined);
 const fractional={...f.approval,authorization:{...f.approval.authorization,issuedAtMonotonic:10248.706208}};
 await assert.rejects(verifyCommerceBroadcast(f.ctx,'buyer',f.request,fractional,{monotonicNow:()=>fractional.authorization.issuedAtMonotonic+120000,readLocalPause:()=>false}),/expired during transaction preparation/);
});
test('a late pause refuses new commitments while an authorized withdrawal remains possible',async()=>{
 const f=await fixture(),options={monotonicNow:()=>1000,expectedAction:'boson-commit',readLocalPause:()=>true};
 await assert.rejects(verifyCommerceBroadcast(f.ctx,'buyer',f.request,f.approval,options),/paused before broadcast/);
 await assert.rejects(verifyCommerceBroadcast({...f.ctx,nft:{paused:async()=>true}},'buyer',f.request,f.approval,{...options,readLocalPause:()=>false}),/paused before broadcast/);
 const withdrawal=await fixture('withdrawFunds');assert.equal((await verifyCommerceBroadcast({...withdrawal.ctx,nft:{paused:async()=>true}},'buyer',withdrawal.request,withdrawal.approval,options)).digest,withdrawal.approval.digest);
});
test('a pending transaction arriving during the final guard prevents overwrite and another send',async()=>{
 const f=await fixture();let pending=null,calls=0,writes=0;
 await assert.rejects(broadcastJournaled({wallet:{address:f.request.from,populateTransaction:async r=>r,signTransaction:r=>f.wallets[3].signTransaction(r)},request:f.request,label:'test',role:'buyer',read:()=>pending,
  store:()=>{writes++;},provider:{broadcastTransaction:async()=>{calls++;}},beforeBroadcast:async()=>{pending={tx:'already-in-flight'};}}),/appeared during preparation/);
 assert.equal(writes,0);assert.equal(calls,0);assert.equal(pending.tx,'already-in-flight');
});
