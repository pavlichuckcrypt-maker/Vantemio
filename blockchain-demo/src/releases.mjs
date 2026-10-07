import {registeredSafeOwnersMatch} from './approval-authority.mjs';
import {assertRuntimeSafe} from './safe-authority.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ZeroAddress, VoidSigner, keccak256, getAddress } from 'ethers';
import { ROOT } from './compile.mjs';
import { RUNTIME, hash, save, safeProposal, executeSafe, eventArgs } from './chain.mjs';
import { evaluate, enforce, audit, verifyAudit } from './security.mjs';
import { emitReleaseKernelEvent, emitTransferKernelEvent } from './station-kernel-bridge.mjs';

export const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const PROJECT=process.env.AIM_DEMO_PROJECT?path.resolve(process.env.AIM_DEMO_PROJECT):path.join(RUNTIME,'demo-studio-project');
export let VIDEO=path.join(PROJECT,'exports','investor-demo.mp4');
export function initializeFixture(recipient) {
  const receipt=path.join(PROJECT,'final_acceptance.json');
  if(process.env.AIM_DEMO_PROJECT){if(!fs.existsSync(receipt))throw new Error('Configured studio project has no final acceptance receipt');return;}
  if(fs.existsSync(receipt)) {
    const current=JSON.parse(fs.readFileSync(receipt,'utf8'));
    if(current.recipient.toLowerCase()===recipient.toLowerCase())return;
    // The initial development fixture may use a placeholder; never overwrite an
    // actual minted release's acceptance as part of restart.
    if(fs.existsSync(path.join(RUNTIME,'release-issued.marker')))throw new Error('Demo recipient changed');
  }
  const py=process.platform==='win32'?'python':'python3';
  const result=spawnSync(py,[path.join(ROOT,'scripts','prepare-fixture.py'),recipient],{encoding:'utf8',timeout:65000});
  if(result.status!==0)throw new Error('Demo fixture preparation failed: '+result.stderr.trim());
}
export function acceptedVideo(project=PROJECT){
  const receipt=JSON.parse(fs.readFileSync(path.join(project,'final_acceptance.json'),'utf8'));
  const video=fs.realpathSync(path.resolve(project,receipt.videoPath));
  if(!video.startsWith(fs.realpathSync(project)+path.sep))throw new Error('Accepted video escapes project');
  return video;
}
function resolveReleaseScript(){
  const candidates=[
    path.join(ROOT,'..','tools','blockchain_release.py'),
    'C:\\AI\\tools\\blockchain_release.py',
    '/Users/vixstels/AIMmontag-dev-Station-20260928/work/station/tools/blockchain_release.py',
  ];
  for(const p of candidates){ try{ const s=fs.statSync(p); if(s.isFile()) return p; }catch{} }
  return candidates[0];
}
export function preparePassport(project=PROJECT) {
  const script=resolveReleaseScript();
  const py=process.platform==='win32'?'python':'python3';
  const result=spawnSync(py,[script,
    '--project',project,'--receipt',path.join(project,'final_acceptance.json')],{encoding:'utf8',timeout:15000});
  if(result.status!==0)throw new Error('Studio acceptance blocked: '+result.stdout.trim());
  const passport=JSON.parse(result.stdout);
  if(project===PROJECT)VIDEO=acceptedVideo(project);
  return passport;
}
export function metadataFor(passport,kind='video') {
  const metadata={name:passport.title,description:'AIMmontag demo certificate of an accepted '+(kind==='digital'?'digital resource':'video')+' version.',
    properties:{release_id:passport.releaseId,video_sha256:passport.videoSha256,
      terms_sha256:sha(passport.terms),content_kind:kind,test_only:true,rights:'No copyright or commercial rights transfer'}};
  const bytes=JSON.stringify(metadata);
  return {metadata,bytes,metadataHash:'0x'+sha(bytes),termsHash:'0x'+sha(passport.terms),
    uri:'data:application/json;base64,'+Buffer.from(bytes).toString('base64')};
}
export function assertReleasePassport(passport,kind,onchain){
  if(onchain.videoHash.toLowerCase()!==('0x'+passport.videoSha256).toLowerCase())throw new Error('Release ID is already bound to different video bytes');
  // Recreate the first video schema from acceptance, never a cached metadata file.
  const meta=metadataFor(passport,kind),legacy=JSON.parse(meta.bytes);delete legacy.properties.content_kind;
  const metadataMatches=onchain.metadataHash===meta.metadataHash||(kind==='video'&&onchain.metadataHash==='0x'+sha(JSON.stringify(legacy)));
  if(onchain.releaseId!==hash(passport.releaseId)||!metadataMatches||onchain.termsHash!==meta.termsHash)throw new Error('Release ID is already bound to different metadata or terms');
}
export async function transferRelease(ctx, state, { tokenId, to, releaseId } = {}) {
  if (!ctx.nft || !ctx.provider) throw new Error('NFT not deployed');
  const tid = BigInt(tokenId);
  let owner = await ctx.nft.ownerOf(tid);
  if (owner.toLowerCase() === getAddress(to).toLowerCase()) {
    try { emitTransferKernelEvent({ releaseId: releaseId||'', tokenId: String(tid), from: owner, to, chainId: ctx.manifest.chainId||84532, tx: null }); } catch {}
    return { tokenId: String(tid), owner, to: getAddress(to), idempotent: true, currentOwner: owner };
  }
  try {
    const { queryKernelEvents } = await import('./station-kernel-bridge.mjs');
    const existing = queryKernelEvents({ type: 'transfer', tokenId: String(tid) });
    if (existing.some(e => String(e.to).toLowerCase() === getAddress(to).toLowerCase())) {
      return { tokenId: String(tid), owner, to: getAddress(to), idempotent: true, currentOwner: owner };
    }
  } catch {}
  const ownerWallet = Object.values(ctx.wallets).find(w => w.address.toLowerCase() === owner.toLowerCase());
  if (!ownerWallet) throw new Error('Owner wallet not available for transfer');
  const nftAsOwner = new (await import('ethers')).Contract(ctx.manifest.nft, ctx.nft.interface, ownerWallet.connect(ctx.provider));
  const receipt = ctx.transact
    ? await ctx.transact('nft-transfer', () => nftAsOwner.transferFrom.populateTransaction(owner, getAddress(to), tid), { role: Object.entries(ctx.wallets).find(([,w])=>w.address.toLowerCase()===owner.toLowerCase())?.[0] || 'operator' })
    : await (await nftAsOwner.transferFrom(owner, getAddress(to), tid)).wait();
  owner = await ctx.nft.ownerOf(tid);
  if (owner.toLowerCase() !== getAddress(to).toLowerCase()) throw new Error('Transfer receipt owner mismatch');
  try { emitTransferKernelEvent({ releaseId: releaseId||'', tokenId: String(tid), from: ownerWallet.address, to, chainId: ctx.manifest.chainId||84532, tx: receipt.hash }); } catch {}
  const rec = { tokenId: String(tid), from: ownerWallet.address, to: getAddress(to), owner, tx: receipt.hash, block: receipt.blockNumber, chainId: ctx.manifest.chainId||84532 };
  state.receipts = state.receipts || []; state.receipts.push({ type: 'nft-transfer', ...rec }); save('state.json', state);
  return rec;
}

export async function mintRelease(ctx,state,{project=PROJECT,kind='video'}={}) {
  if(ctx.assertChain)await ctx.assertChain();
  await assertRuntimeSafe(ctx);
  const passport=preparePassport(project),video=acceptedVideo(project);
  const meta=metadataFor(passport,kind);
  const releaseId=hash(passport.releaseId);
  const token=await ctx.nft.tokenByRelease(releaseId);
  if(token!==0n) {
    const onchain=await ctx.nft.passports(token);
    assertReleasePassport(passport,kind,onchain);
    const record=state.releases.find(x=>x.releaseId===passport.releaseId);
    if(record){
      if(record.tokenId!==token.toString()||record.videoSha256!==passport.videoSha256||record.metadataHash!==onchain.metadataHash||record.termsHash!==meta.termsHash||record.chainId!==ctx.manifest.chainId||getAddress(record.owner)!==getAddress(passport.recipient))throw new Error('Stored NFT record differs from the accepted passport');
      return {...record,idempotent:true,currentOwner:await ctx.nft.ownerOf(token)};
    }
    const recovered={releaseId:passport.releaseId,tokenId:token.toString(),owner:await ctx.nft.ownerOf(token),
      videoSha256:passport.videoSha256,metadataHash:onchain.metadataHash,termsHash:onchain.termsHash,chainId:ctx.manifest.chainId,status:'confirmed',recovered:true,idempotent:true};
    state.releases.push(recovered);save('state.json',state);try{emitReleaseKernelEvent({releaseId:passport.releaseId,videoHash:passport.videoSha256,metadataHash:onchain.metadataHash,termsHash:meta.termsHash,owner:await ctx.nft.ownerOf(token),tokenId:token.toString(),chainId:ctx.manifest.chainId,tx:null,idempotent:true});}catch{}return recovered;
  }
  fs.mkdirSync(path.join(RUNTIME,'metadata'),{recursive:true});
  fs.writeFileSync(path.join(RUNTIME,'metadata',sha(meta.bytes)+'.json'),meta.bytes,{flag:'w',mode:0o600});
  const now=(await ctx.provider.getBlock('latest')).timestamp;
  const deadline=now+1800;
  const params=[releaseId,getAddress(passport.recipient),'0x'+passport.videoSha256,meta.metadataHash,meta.termsHash,meta.uri,deadline];
  const data=ctx.nft.interface.encodeFunctionData('mintRelease',params);
  const proposal=await safeProposal(ctx,ctx.manifest.nft,data);
  let simulation=false;
  try { simulation=await ctx.safe.execTransaction.staticCall(...proposal.exec); } catch {}
  const chain=Number((await ctx.provider.getNetwork()).chainId);
  const decoded=ctx.nft.interface.decodeFunctionData('mintRelease',data);
  const owners=await ctx.safe.getOwners();
  const samePassport=preparePassport(project);
  const preAudit=audit('release-proposed',{releaseId:passport.releaseId,operationDigest:proposal.digest,
    videoSha256:passport.videoSha256,metadataHash:meta.metadataHash,recipient:passport.recipient,
    nonce:proposal.nonce.toString(),deadline,approvalAddresses:proposal.approvals});
  const evidence={
    identity:Object.values(ctx.wallets).some(w=>w.address===ctx.wallets.operator.address),
    roles:ctx.wallets.operator.address!==ctx.manifest.safe && (await ctx.nft.owner()).toLowerCase()===ctx.manifest.safe.toLowerCase(),
    accepted:passport.accepted===true && passport.editorialVerified===true,
    video:sha(fs.readFileSync(video))===passport.videoSha256 && samePassport.videoSha256===passport.videoSha256,
    metadata:meta.uri.length<=2048 && sha(fs.readFileSync(path.join(RUNTIME,'metadata',sha(meta.bytes)+'.json')))===sha(meta.bytes),
    recipient:[ctx.wallets.buyer.address,ctx.wallets.seller.address].includes(getAddress(passport.recipient)),
    chain:ctx.assertChain?await ctx.assertChain():chain===31337 && ctx.manifest.publicTransactions===false,
    contract:keccak256(await ctx.provider.getCode(ctx.manifest.nft))===ctx.manifest.nftCodeHash,
    call:decoded.releaseId===releaseId && decoded.recipient===getAddress(passport.recipient) && proposal.exec[1]===0 && proposal.exec[3]===0,
    unique:await ctx.nft.tokenByRelease(releaseId)===0n && await ctx.nft.tokenByVideo('0x'+passport.videoSha256)===0n,
    limits:state.releases.length<100 && await ctx.nft.nextTokenId()<=100n,
    simulation:simulation===true,
    quorum:proposal.approvals.length===3 && new Set(proposal.approvals).size===3 && Number(await ctx.safe.getThreshold())===3 &&
      proposal.approvals.every(a=>owners.map(x=>x.toLowerCase()).includes(a.toLowerCase())) &&
      (!ctx.manifest.publicTransactions||registeredSafeOwnersMatch(owners,ctx.manifest.safeOwners,await ctx.safe.getThreshold())),
    fresh:!(await ctx.nft.paused()) && await ctx.safe.nonce()===proposal.nonce && (await ctx.provider.getBlock('latest')).timestamp<deadline,
    audit:!!preAudit && verifyAudit()===true && (await ctx.provider.getBlock('latest'))!==null
  };
  state.checks=evaluate(evidence);save('state.json',state);enforce(state.checks);
  const current=preparePassport(project);
  if(JSON.stringify(current)!==JSON.stringify(passport) || await ctx.nft.paused())throw new Error('Passport or pause changed before execution');
  audit('release-approved',{operationDigest:proposal.digest,passed:15,signatures:3,nonce:proposal.nonce.toString()});
  const receipt=await executeSafe(ctx,proposal);
  const event=eventArgs(ctx.nft,receipt,'ReleaseCertified');
  const owner=await ctx.nft.ownerOf(event.tokenId);
  const onchain=await ctx.nft.passports(event.tokenId);
  if(owner!==getAddress(passport.recipient) || onchain.videoHash!==params[2] || onchain.metadataHash!==meta.metadataHash
    || event.releaseId!==releaseId)throw new Error('NFT receipt/owner/passport verification failed');
  const record={releaseId:passport.releaseId,tokenId:event.tokenId.toString(),owner,videoSha256:passport.videoSha256,
    metadataHash:meta.metadataHash,termsHash:meta.termsHash,tx:receipt.hash,block:receipt.blockNumber,
    operationDigest:proposal.digest,approvalAddresses:proposal.approvals,status:'confirmed',
    confirmationPolicy:ctx.manifest.publicTransactions?'three public confirmations + receipt + event + ownerOf + passport':'local mined receipt + event + ownerOf + passport; no public finality claim',
    chainId:ctx.manifest.chainId,explorer:ctx.manifest.explorer?ctx.manifest.explorer+'/tx/'+receipt.hash:null,createdAt:new Date().toISOString()};
  state.releases.push(record);state.receipts.push({type:'nft-release',tx:receipt.hash,block:receipt.blockNumber});
  save('state.json',state);fs.writeFileSync(path.join(RUNTIME,'release-issued.marker'),passport.releaseId,{mode:0o600});
  audit('release-confirmed',{releaseId:passport.releaseId,tokenId:record.tokenId,tx:receipt.hash,owner});try{emitReleaseKernelEvent({releaseId:passport.releaseId,videoHash:passport.videoSha256,metadataHash:meta.metadataHash,termsHash:meta.termsHash,owner,tokenId:record.tokenId,chainId:ctx.manifest.chainId,tx:receipt.hash,idempotent:!!record.idempotent});}catch{}return record;
}
