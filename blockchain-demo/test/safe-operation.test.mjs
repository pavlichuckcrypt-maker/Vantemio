import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet,Interface,ZeroAddress,concat,keccak256,TypedDataEncoder} from 'ethers';
import {artifact,compile} from '../src/compile.mjs';
import {assertAllowedSafeCall,verifySafeProposal,verifySafeBroadcast} from '../src/safe-operation.mjs';
import {broadcastJournaled} from '../src/public-journal.mjs';
const types={SafeTx:[{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'data',type:'bytes'},{name:'operation',type:'uint8'},{name:'safeTxGas',type:'uint256'},{name:'baseGas',type:'uint256'},{name:'gasPrice',type:'uint256'},{name:'gasToken',type:'address'},{name:'refundReceiver',type:'address'},{name:'nonce',type:'uint256'}]};
function fixture(method='pause'){
 const wallets=Array.from({length:5},()=>Wallet.createRandom()).sort((a,b)=>a.address.toLowerCase().localeCompare(b.address.toLowerCase()));
 const operator=Wallet.createRandom(),safeAddress='0x'+'a'.repeat(40),nftAddress='0x'+'b'.repeat(40),nftInterface=new Interface(compile().StudioRelease.abi),safeInterface=new Interface(artifact('@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json').abi);
 const data=nftInterface.encodeFunctionData(method,method==='mintRelease'?['0x'+'1'.repeat(64),wallets[4].address,'0x'+'2'.repeat(64),'0x'+'3'.repeat(64),'0x'+'4'.repeat(64),'data:test',1100]:[]);
 const args=[nftAddress,0,data,0,0,0,0,ZeroAddress,ZeroAddress,2n];
 const digestFor=a=>TypedDataEncoder.hash({chainId:84532,verifyingContract:safeAddress},types,Object.fromEntries(types.SafeTx.map((t,i)=>[t.name,a[i]])));
 const digest=digestFor(args),signatures=concat(wallets.slice(0,3).map(w=>w.signingKey.sign(digest).serialized));
 const proposal={digest,nonce:2n,signatures,exec:[...args.slice(0,9),signatures],approvals:wallets.slice(0,3).map(w=>w.address),issuedAtMonotonic:123.123};
 const ctx={manifest:{chainId:84532,publicTransactions:true,safe:safeAddress,nft:nftAddress,nftCodeHash:keccak256('0x6000'),safeOwners:wallets.map(w=>w.address)},wallets:{operator},assertAuthority:async()=>({}),safe:{interface:safeInterface,nonce:async()=>2n,getTransactionHash:async(...a)=>digestFor(a)},nft:{interface:nftInterface,paused:async()=>false},provider:{getCode:async()=> '0x6000',getBlock:async()=>({timestamp:1000}),getTransactionCount:async()=>7}};
 const request={chainId:84532,from:operator.address,to:safeAddress,data:safeInterface.encodeFunctionData('execTransaction',proposal.exec),value:0n,nonce:7,type:2,gasLimit:100000,maxFeePerGas:100000000n,maxPriorityFeePerGas:1000000n};
 return {ctx,proposal,request,wallets,options:{monotonicNow:()=>1000}};
}
test('Safe proposal and prepared outer transaction prove exact call and three sorted registered signatures',async()=>{
 for(const method of ['pause','unpause','mintRelease']){const f=fixture(method);assert.equal((await verifySafeProposal(f.ctx,f.proposal,f.options)).method,method);assert.equal((await verifySafeBroadcast(f.ctx,'operator',f.request,f.proposal,f.options)).digest,f.proposal.digest);}
});
test('Safe gateway refuses other targets, methods, trailing bytes, delegatecall and refund parameters',async()=>{
 const f=fixture();assert.throws(()=>assertAllowedSafeCall(f.ctx,f.ctx.manifest.safe,f.proposal.exec[2]),/target/);
 assert.throws(()=>assertAllowedSafeCall(f.ctx,f.ctx.manifest.nft,f.ctx.nft.interface.encodeFunctionData('transferOwnership',[f.ctx.wallets.operator.address])),/method/);
 assert.throws(()=>assertAllowedSafeCall(f.ctx,f.ctx.manifest.nft,f.proposal.exec[2]+'00'),/calldata/);
 for(const i of [1,3,4,5,6,7,8]){const p=structuredClone(f.proposal);p.exec[i]=i<7?1:f.ctx.manifest.safe;await assert.rejects(verifySafeProposal(f.ctx,p,f.options),/parameters changed/);}
});
test('Safe digest, signature count, order and registered recovered identities cannot be substituted',async()=>{
 const f=fixture();
 for(const alter of [p=>p.digest='0x'+'f'.repeat(64),p=>p.exec[2]=f.ctx.nft.interface.encodeFunctionData('unpause'),p=>p.signatures=p.exec[9]=concat(f.wallets.slice(0,2).map(w=>w.signingKey.sign(p.digest).serialized)),p=>p.approvals.reverse(),p=>p.signatures=p.exec[9]=concat(f.wallets.slice(0,3).reverse().map(w=>w.signingKey.sign(p.digest).serialized)),p=>p.signatures=p.exec[9]=concat([Wallet.createRandom(),...f.wallets.slice(0,2)].map(w=>w.signingKey.sign(p.digest).serialized))]){const p=structuredClone(f.proposal);alter(p);await assert.rejects(verifySafeProposal(f.ctx,p,f.options),/digest or signatures|exactly three|sorted registered/);}
});
test('stale nonce, NFT code/pause/deadline and the exact monotonic expiry boundary fail closed',async()=>{
 const f=fixture('mintRelease');
 await assert.rejects(verifySafeProposal({...f.ctx,safe:{...f.ctx.safe,nonce:async()=>3n}},f.proposal,f.options),/Stale/);
 await assert.rejects(verifySafeProposal({...f.ctx,provider:{...f.ctx.provider,getCode:async()=> '0x6001'}},f.proposal,f.options),/code changed/);
 await assert.rejects(verifySafeProposal({...f.ctx,nft:{...f.ctx.nft,paused:async()=>true}},f.proposal,f.options),/paused/);
 await assert.rejects(verifySafeProposal({...f.ctx,provider:{...f.ctx.provider,getBlock:async()=>({timestamp:1100})}},f.proposal,f.options),/deadline/);
 await assert.rejects(verifySafeProposal(f.ctx,f.proposal,{monotonicNow:()=>f.proposal.issuedAtMonotonic+120000}),/expired/);
 await assert.rejects(verifySafeProposal(f.ctx,f.proposal,{monotonicNow:()=>NaN}),/expired/);
 assert.ok(await verifySafeProposal(f.ctx,f.proposal,{monotonicNow:()=>f.proposal.issuedAtMonotonic+119999}));
});
test('outer transaction cannot change actor, Safe address, bytes, value, network or pending executor nonce',async()=>{
 const f=fixture();
 for(const change of [{from:f.wallets[0].address},{to:f.ctx.manifest.nft},{value:1n},{chainId:8453},{data:f.request.data+'00'}])await assert.rejects(verifySafeBroadcast(f.ctx,'operator',{...f.request,...change},f.proposal,f.options),/differs/);
 await assert.rejects(verifySafeBroadcast(f.ctx,'buyer',f.request,f.proposal,f.options),/differs/);
 await assert.rejects(verifySafeBroadcast(f.ctx,'operator',f.request,null,f.options),/differs/);
 await assert.rejects(verifySafeBroadcast(f.ctx,'operator',{...f.request,nonce:8},f.proposal,f.options),/executor nonce/);
});
test('Safe approval expiry during wallet preparation blocks journaling and public broadcast',async()=>{
 const f=fixture();let elapsed=1000,pending=null,broadcasts=0,signs=0;
 const wallet={address:f.request.from,populateTransaction:async r=>{elapsed=f.proposal.issuedAtMonotonic+120000;return r;},signTransaction:async()=>{signs++;return f.ctx.wallets.operator.signTransaction(f.request);}};
 await assert.rejects(broadcastJournaled({provider:{broadcastTransaction:async()=>{broadcasts++;}},wallet,request:f.request,label:'safe-execution',role:'operator',read:()=>pending,store:r=>pending=r,beforeBroadcast:r=>verifySafeBroadcast(f.ctx,'operator',r,f.proposal,{monotonicNow:()=>elapsed})}),/expired/);
 assert.equal(signs,1);assert.equal(pending,null);assert.equal(broadcasts,0);
});
