import {getAddress} from 'ethers';
import {hash} from './chain.mjs';
import {preparePassport,assertReleasePassport} from './releases.mjs';

// Existing certificates are read and checked here. Listing must never silently
// create an NFT or accept a cached certificate for another file or contract.
export async function verifyAssetPublication(ctx,asset){
  if(!['video','digital'].includes(asset.kind))throw new Error('Unsupported accepted asset category');
  const passport=preparePassport(asset.project);
  if(passport.videoSha256!==asset.sha256||passport.releaseId!==asset.releaseId||passport.title!==asset.title)
    throw new Error('Accepted asset version changed');
  const certificate=asset.certificate;
  if(!certificate)return {passport,certificate:null};
  if(certificate.chainId!==84532||ctx.manifest.chainId!==84532||getAddress(certificate.contract)!==getAddress(ctx.manifest.nft))
    throw new Error('Certificate contract or chain changed');
  if(Object.keys(certificate).some(k=>!['tokenId','contract','owner','tx','explorer','chainId'].includes(k)))throw new Error('Unexpected certificate fields');
  if(certificate.tx!==undefined&&(!/^0x[0-9a-fA-F]{64}$/.test(certificate.tx)||certificate.explorer!==ctx.manifest.explorer+'/tx/'+certificate.tx))throw new Error('Certificate transaction link changed');
  if(certificate.tx===undefined&&certificate.explorer!==undefined)throw new Error('Unbound certificate explorer');
  const token=await ctx.nft.tokenByRelease(hash(passport.releaseId));
  if(token===0n||token.toString()!==certificate.tokenId)throw new Error('Certificate token differs from the accepted release');
  assertReleasePassport(passport,asset.kind,await ctx.nft.passports(token));
  return {passport,certificate:{...certificate,owner:getAddress(await ctx.nft.ownerOf(token))}};
}
