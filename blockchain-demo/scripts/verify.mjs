import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Contract, JsonRpcProvider, NonceManager, parseEther, keccak256 } from 'ethers';
import { loadWallets, DEMO_HOME } from '../src/vault.mjs';
import { ROOT, compile, artifact } from '../src/compile.mjs';
import { load, save, json, hash, safeProposal } from '../src/chain.mjs';
import { verifyAudit } from '../src/security.mjs';

const origin='http://127.0.0.1:18337';
let state=await (await fetch(origin+'/api/state')).json();
assert.equal(state.manifest.chainId,31337);assert.equal(state.publicTransactions,false);
const tests=[];
process.on('uncaughtException',error=>{console.error('VERIFY_FAILED',error.shortMessage||error.message);process.exit(1);});
async function check(name,fn){await fn();tests.push({name,passed:true});console.log('PASS',name);}
async function action(name,exchangeId){
  const response=await fetch(origin+'/api/action',{method:'POST',headers:{'Content-Type':'application/json','Origin':origin,'X-Demo-CSRF':state.csrf},
    body:JSON.stringify({action:name,...(exchangeId?{exchangeId}:{})})});
  const body=await response.json();if(!response.ok)throw new Error(body.error);return body.result;
}
const {wallets}=await loadWallets();
const manifest=state.manifest;
const provider=new JsonRpcProvider('http://127.0.0.1:19545',31337,{staticNetwork:true,cacheTimeout:-1,batchMaxCount:1});
const signer=new NonceManager(wallets.operator.connect(provider));
const compiled=compile();
const nft=new Contract(manifest.nft,compiled.StudioRelease.abi,signer);
const safeArtifact=artifact('@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json');
const safe=new Contract(manifest.safe,safeArtifact.abi,signer);
const ctx={safe,wallets};
const now=(await provider.getBlock('latest')).timestamp;
const params=[hash('negative-test-release'),wallets.buyer.address,hash('negative-test-video'),hash('metadata'),hash('terms'),
  'data:application/json;base64,e30=',now+1800];
const calldata=nft.interface.encodeFunctionData('mintRelease',params);
await check('contract runtime fingerprint and owner are pinned',async()=>{
  assert.equal(keccak256(await provider.getCode(manifest.nft)),manifest.nftCodeHash);
  assert.equal((await nft.owner()).toLowerCase(),manifest.safe.toLowerCase());
});
await check('one EOA cannot mint directly',()=>assert.rejects(()=>nft.mintRelease.staticCall(...params)));
await check('two Safe signatures cannot authorize mint',async()=>{
  const proposal=await safeProposal(ctx,manifest.nft,calldata,2);
  await assert.rejects(()=>safe.execTransaction.staticCall(...proposal.exec));
});
const valid=await safeProposal(ctx,manifest.nft,calldata,3);
await check('three real signatures pass Safe simulation',async()=>assert.equal(await safe.execTransaction.staticCall(...valid.exec),true));
await check('recipient substitution invalidates signed calldata',async()=>{
  const changed=[...valid.exec];const p=[...params];p[1]=wallets.seller.address;changed[2]=nft.interface.encodeFunctionData('mintRelease',p);
  await assert.rejects(()=>safe.execTransaction.staticCall(...changed));
});
await check('expired authorization fails at the NFT contract',async()=>{
  const p=[...params];p[6]=now-1;
  const proposal=await safeProposal(ctx,manifest.nft,nft.interface.encodeFunctionData('mintRelease',p),3);
  await assert.rejects(()=>safe.execTransaction.staticCall(...proposal.exec),error=>error.code==='CALL_EXCEPTION');
});
await check('repeat studio callback returns the same NFT',async()=>{
  const first=await action('mint'), second=await action('mint');
  assert.equal(first.tokenId,second.tokenId);assert.equal(second.idempotent,true);
  assert.equal((await nft.nextTokenId()).toString(),'2');
});
await check('duplicate release cannot be minted through Safe',async()=>{
  const r=state.releases[0];const p=[...params];p[0]=hash(r.releaseId);p[2]='0x'+r.videoSha256;
  const proposal=await safeProposal(ctx,manifest.nft,nft.interface.encodeFunctionData('mintRelease',p),3);
  await assert.rejects(()=>safe.execTransaction.staticCall(...proposal.exec),error=>error.code==='CALL_EXCEPTION');
});
await check('NFT owner and immutable hashes match the studio export',async()=>{
  const release=state.releases[0];const passport=await nft.passports(release.tokenId);
  assert.equal(await nft.ownerOf(release.tokenId),release.owner);
  assert.equal(passport.videoHash,'0x'+release.videoSha256);
  assert.equal(passport.metadataHash,release.metadataHash);
});
await check('missing CSRF and foreign origin are rejected',async()=>{
  const response=await fetch(origin+'/api/action',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://foreign.invalid'},body:'{"action":"mint"}'});
  assert.equal(response.status,403);
});
await check('unknown mutation fields are rejected',async()=>{
  const response=await fetch(origin+'/api/action',{method:'POST',headers:{'Content-Type':'application/json','Origin':origin,'X-Demo-CSRF':state.csrf},body:'{"action":"mint","recipient":"0x0000000000000000000000000000000000000001"}'});
  assert.equal(response.status,400);
});
await check('pause stops simulated issuance; unpause restores it',async()=>{
  await action('pause');assert.equal(await nft.paused(),true);
  const p=await safeProposal(ctx,manifest.nft,calldata,3);
  await assert.rejects(()=>safe.execTransaction.staticCall(...p.exec),error=>error.code==='CALL_EXCEPTION');
  await action('unpause');assert.equal(await nft.paused(),false);
});
await check('Boson paid order commits, redeems and completes',async()=>{
  const order=await action('commit');
  assert.equal(order.state,'COMMITTED');
  await assert.rejects(()=>action('complete',order.exchangeId),/Invalid Boson transition/);
  assert.equal((await action('redeem',order.exchangeId)).state,'REDEEMED');
  assert.equal((await action('complete',order.exchangeId)).state,'COMPLETED');
});
await check('Boson cancellation returns the full demo payment',async()=>{
  const before=await (await fetch(origin+'/api/state')).json();
  const order=await action('commit');assert.equal((await action('cancel',order.exchangeId)).state,'CANCELLED');
  assert.equal((await action('refund',order.exchangeId)).refundWithdrawn,true);
  const after=await (await fetch(origin+'/api/state')).json();
  assert.equal(after.commerce.buyerBalance,before.commerce.buyerBalance);
});
await check('Boson dispute and retraction execute on-chain',async()=>{
  const order=await action('commit');await action('redeem',order.exchangeId);
  assert.equal((await action('dispute',order.exchangeId)).state,'DISPUTED');
  const retracted=await action('retract',order.exchangeId);
  assert.equal(retracted.disputeRetracted,true);assert.ok(BigInt(retracted.disputeFinalizedAt)>0n);
});
await check('audit hash chain verifies and public evidence contains no credentials',async()=>{
  assert.equal(verifyAudit(),true);
  const evidence=await (await fetch(origin+'/api/evidence')).text();
  assert.ok(!/privateKey|mnemonic|keystore|"csrf"|password/.test(evidence));
});
state=await (await fetch(origin+'/api/evidence')).json();
const report={schemaVersion:1,verifiedAt:new Date().toISOString(),mode:'local-base-sepolia-fork',
  publicTransactions:false,independentCustody:false,testsPassed:tests.length,tests,
  unitTestCommand:'npm test (18 Node tests, including 9 Python acceptance cases)',
  evidence:state,publicFaucet:{status:'blocked',provider:'Quicknode',reason:'New wallet rejected for having no mainnet ETH balance',publicETHReceived:false},
  limitations:['NFT gates + Safe are implemented; Boson demo orders use EOA test signing.',
    'Demo signers share this machine. Production custody, independent approvals and mainnet are not configured.',
    'The studio hook is an explicit acceptance adapter. Automatic invocation by a production renderer remains a separate integration step.']};
fs.mkdirSync(path.join(ROOT,'evidence'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'evidence','DEMO_VERIFICATION.json'),json(report)+'\n');
fs.writeFileSync(path.join(DEMO_HOME,'DEMO_VERIFICATION.json'),json(report)+'\n',{mode:0o600});
fs.writeFileSync(path.join(ROOT,'evidence','DEPLOYMENT_MANIFEST.json'),json(manifest)+'\n');
console.log(`Verified ${tests.length} live scenarios. Public evidence saved.`);
provider.destroy();
