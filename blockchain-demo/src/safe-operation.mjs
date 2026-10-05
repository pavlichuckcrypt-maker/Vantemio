import {ZeroAddress,getAddress,getBytes,recoverAddress,keccak256,hexlify} from 'ethers';
import {assertRuntimeSafe} from './safe-authority.mjs';
const sameAddress=(a,b)=>typeof a==='string'&&typeof b==='string'&&getAddress(a)===getAddress(b);
export function assertAllowedSafeCall(ctx,to,data){
 if(ctx.manifest?.chainId!==84532)return;
 if(!sameAddress(to,ctx.manifest.nft))throw new Error('Safe target is not the registered NFT');
 const decoded=ctx.nft.interface.parseTransaction({data});
 if(!decoded||!['mintRelease','pause','unpause'].includes(decoded.name)||ctx.nft.interface.encodeFunctionData(decoded.name,decoded.args).toLowerCase()!==data.toLowerCase())throw new Error('Safe method or calldata is not allowed');
 return decoded;
}
export async function verifySafeProposal(ctx,proposal,{monotonicNow=()=>performance.now()}={}){
 if(ctx.manifest?.chainId!==84532)return;
 await assertRuntimeSafe(ctx);
 const e=proposal?.exec;
 if(!Array.isArray(e)||e.length!==10||[1,3,4,5,6].some(i=>BigInt(e[i])!==0n)||!sameAddress(e[7],ZeroAddress)||!sameAddress(e[8],ZeroAddress))throw new Error('Safe operation/refund/value parameters changed');
 const call=assertAllowedSafeCall(ctx,e[0],e[2]);
 const now=monotonicNow();
 if(!Number.isFinite(proposal.issuedAtMonotonic)||proposal.issuedAtMonotonic<0||!Number.isFinite(now)||now<proposal.issuedAtMonotonic||now>=proposal.issuedAtMonotonic+120000)throw new Error('Safe approval expired during transaction preparation');
 if(await ctx.safe.nonce()!==proposal.nonce)throw new Error('Stale Safe nonce');
 const digest=await ctx.safe.getTransactionHash(...e.slice(0,9),proposal.nonce);
 if(digest!==proposal.digest||e[9]!==proposal.signatures)throw new Error('Safe signed digest or signatures changed');
 const bytes=getBytes(proposal.signatures);if(bytes.length!==195)throw new Error('Safe requires exactly three ECDSA signatures');
 const recovered=Array.from({length:3},(_,i)=>recoverAddress(digest,hexlify(bytes.slice(i*65,(i+1)*65))));
 const registered=ctx.manifest.safeOwners.map(a=>a.toLowerCase());
 if(new Set(recovered.map(a=>a.toLowerCase())).size!==3||recovered.some((a,i)=>!registered.includes(a.toLowerCase())||(i>0&&recovered[i-1].toLowerCase()>=a.toLowerCase()))||!Array.isArray(proposal.approvals)||proposal.approvals.length!==3||recovered.some((a,i)=>!sameAddress(a,proposal.approvals[i])))throw new Error('Safe signatures do not match sorted registered approvals');
 if(keccak256(await ctx.provider.getCode(ctx.manifest.nft))!==ctx.manifest.nftCodeHash)throw new Error('Safe NFT code changed');
 if(call.name==='mintRelease'&&(await ctx.nft.paused()||call.args.deadline<=BigInt((await ctx.provider.getBlock('latest')).timestamp)))throw new Error('NFT paused or mint deadline expired');
 return {digest,method:call.name};
}
export async function verifySafeBroadcast(ctx,role,request,proposal,options={}){
 if(ctx.manifest?.chainId!==84532)return;
 if(!proposal||role!=='operator'||Number(request.chainId)!==84532||!sameAddress(request.from,ctx.wallets.operator.address)||!sameAddress(request.to,ctx.manifest.safe)||BigInt(request.value??0)!==0n||request.data?.toLowerCase()!==ctx.safe.interface.encodeFunctionData('execTransaction',proposal.exec).toLowerCase())throw new Error('Safe prepared transaction differs from its approval');
 const result=await verifySafeProposal(ctx,proposal,options);
 if(await ctx.provider.getTransactionCount(request.from,'pending')!==request.nonce)throw new Error('Safe executor nonce changed before broadcast');
 return result;
}
