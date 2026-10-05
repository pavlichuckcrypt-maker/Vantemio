import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Contract, JsonRpcProvider, FetchRequest, keccak256 } from 'ethers';
import { ROOT, compile, artifact } from '../src/compile.mjs';
import { loadWallets, DEMO_HOME } from '../src/vault.mjs';
import { safeProposal, hash, load, json, bosonABI } from '../src/chain.mjs';
import { verifyAudit } from '../src/security.mjs';
import { PROJECT } from '../src/releases.mjs';
import { BASE_RPC, BASE_CHECK_RPC, assertBase } from '../src/base-chain.mjs';
process.on('uncaughtException',e=>{console.error('BASE_VERIFY_FAILED',e.shortMessage||e.message);process.exit(1);});
const origin='http://127.0.0.1:18339';const tests=[];
async function check(name,fn){await fn();tests.push({name,passed:true});console.log('PASS',name);}
let state=await(await fetch(origin+'/api/state')).json();
assert.equal(state.mode,'PUBLIC BASE SEPOLIA');assert.equal(state.deploymentReady,true);
const {wallets}=await loadWallets();const m=state.manifest;
function provider(url){const request=new FetchRequest(url);request.timeout=20000;return new JsonRpcProvider(request,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});}
const p=provider(BASE_RPC),p2=provider(BASE_CHECK_RPC);
const nft=new Contract(m.nft,compile().StudioRelease.abi,wallets.operator.connect(p));
const safe=new Contract(m.safe,artifact('@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json').abi,wallets.operator.connect(p));
const ctx={safe,wallets};const r=state.releases[0];const initialNextTokenId=await nft.nextTokenId();
const now=(await p.getBlock('latest')).timestamp;
const params=[hash('base-security-simulation'),wallets.buyer.address,hash('simulation-video'),hash('simulation-metadata'),hash('terms'),'data:application/json;base64,e30=',now+1800];
async function action(action,exchangeId){const response=await fetch(origin+'/api/action',{method:'POST',headers:{'Content-Type':'application/json','Origin':origin,'X-Demo-CSRF':state.csrf},body:JSON.stringify({action,...(exchangeId?{exchangeId}:{})})});const result=await response.json();if(!response.ok)throw new Error(result.error);return result.result;}
await check('two public RPCs confirm Base Sepolia chain 84532',async()=>{await assertBase(p);await assertBase(p2);});
await check('public contract runtime, Safe authority and five owners match',async()=>{
 assert.equal(keccak256(await p.getCode(m.nft)),m.nftCodeHash);
 assert.equal(keccak256(await p2.getCode(m.nft)),m.nftCodeHash);
 assert.equal((await nft.owner()).toLowerCase(),m.safe.toLowerCase());assert.equal(Number(await safe.getThreshold()),3);
 assert.equal((await safe.getOwners()).length,5);
});
await check('all 15 issuance gates passed with public-chain evidence',async()=>{
 assert.equal(state.checks.length,15);assert.ok(state.checks.every(c=>c.passed));assert.equal(r.chainId,84532);
});
await check('one EOA cannot issue a public NFT',()=>assert.rejects(()=>nft.mintRelease.staticCall(...params)));
const data=nft.interface.encodeFunctionData('mintRelease',params);
await check('two signatures are rejected by the deployed Safe',async()=>{const s=await safeProposal(ctx,m.nft,data,2);await assert.rejects(()=>safe.execTransaction.staticCall(...s.exec));});
await check('three signatures pass the deployed Safe simulation',async()=>{const s=await safeProposal(ctx,m.nft,data,3);assert.equal(await safe.execTransaction.staticCall(...s.exec),true);});
await check('recipient substitution invalidates the public Safe authorization',async()=>{
 const s=await safeProposal(ctx,m.nft,data,3),changed=[...s.exec],q=[...params];q[1]=wallets.seller.address;changed[2]=nft.interface.encodeFunctionData('mintRelease',q);
 await assert.rejects(()=>safe.execTransaction.staticCall(...changed));
});
await check('expired issuance is rejected on the public contract',async()=>{
 const q=[...params];q[6]=now-1;const s=await safeProposal(ctx,m.nft,nft.interface.encodeFunctionData('mintRelease',q),3);
 await assert.rejects(()=>safe.execTransaction.staticCall(...s.exec));
});
await check('NFT ownership, hashes and metadata match the accepted real video',async()=>{
 const passport=await nft.passports(r.tokenId);assert.equal(await nft.ownerOf(r.tokenId),r.owner);
 assert.equal(passport.videoHash,'0x'+r.videoSha256);assert.equal(passport.metadataHash,r.metadataHash);assert.equal(passport.termsHash,r.termsHash);
 const uri=await nft.tokenURI(r.tokenId);const text=Buffer.from(uri.split(',')[1],'base64').toString();
 assert.equal('0x'+(await import('node:crypto')).createHash('sha256').update(text).digest('hex'),r.metadataHash);
 const accepted=await(await fetch(origin+'/api/passport')).json();assert.equal(accepted.videoSha256,r.videoSha256);
});
await check('deployment and mint receipts are canonical on both public RPCs',async()=>{
 const receipts=load('public-receipts.json');assert.ok(receipts.length>=3);
 for(const record of receipts){const a=await p.getTransactionReceipt(record.tx),b=await p2.getTransactionReceipt(record.tx);
  assert.equal(a.status,1);assert.equal(a.blockHash,b.blockHash);assert.equal((await p.getBlock(a.blockNumber)).hash,a.blockHash);
  assert.ok((await p.getBlockNumber())-a.blockNumber>=2);
 }
});
await check('the actual studio after-render callback is idempotent',async()=>{
 const result=spawnSync('python3',[path.join(ROOT,'../tools/blockchain_publish.py'),'--project',PROJECT],{encoding:'utf8',timeout:150000});
 assert.equal(result.status,0,result.stdout);const published=JSON.parse(result.stdout);assert.equal(published.idempotent,true);
 assert.equal(published.tokenId,r.tokenId);assert.equal(published.chainId,84532);assert.equal(await nft.nextTokenId(),initialNextTokenId);
});
await check('a rendered but unaccepted version cannot trigger publication',async()=>{
 const file=path.join(PROJECT,'final_acceptance.json'),original=fs.readFileSync(file,'utf8');
 try{const changed=JSON.parse(original);changed.accepted=false;fs.writeFileSync(file,JSON.stringify(changed));
  const result=spawnSync('python3',[path.join(ROOT,'../tools/blockchain_publish.py'),'--project',PROJECT],{encoding:'utf8',timeout:15000});
  assert.equal(result.status,2);assert.equal(JSON.parse(result.stdout).status,'pending');
 }finally{fs.writeFileSync(file,original);}
});
await check('anonymous studio callbacks and foreign origins are rejected',async()=>{
 let response=await fetch(origin+'/api/studio-release',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,403);
 response=await fetch(origin+'/api/action',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://foreign.invalid'},body:'{"action":"mint"}'});assert.equal(response.status,403);
});
await check('pause and resume execute real BASE transactions',async()=>{
 await action('pause');assert.equal(await nft.paused(),true);
 const s=await safeProposal(ctx,m.nft,data,3);await assert.rejects(()=>safe.execTransaction.staticCall(...s.exec));
 await action('unpause');assert.equal(await nft.paused(),false);
});
await check('redacted evidence and audit contain no credential fields',async()=>{
 assert.equal(verifyAudit(),true);const text=await(await fetch(origin+'/api/evidence')).text();
 assert.ok(!/privateKey|mnemonic|keystore|"csrf"|password|studio-api-token/.test(text));
});

const boson=new Contract(m.sourceBoson,bosonABI(),p);
const credit=new Contract(m.credit,compile().DemoCredit.abi,p);
await check('paid public Boson order redeems and completes',async()=>{
 const order=await action('commit');await action('redeem',order.exchangeId);await action('complete',order.exchangeId);
 const exchange=await boson.getExchange(order.exchangeId);assert.equal(exchange.exists,true);assert.equal(Number(exchange.exchange.state),4);
});
await check('cancellation releases escrow and withdraws the actual refund',async()=>{
 const before=await credit.balanceOf(wallets.buyer.address);const order=await action('commit');
 assert.equal(await credit.balanceOf(wallets.buyer.address),before-25000000000000000000n);
 await action('cancel',order.exchangeId);await action('refund',order.exchangeId);
 assert.equal(await credit.balanceOf(wallets.buyer.address),before);
 assert.equal(Number((await boson.getExchange(order.exchangeId)).exchange.state),2);
});
await check('public Boson dispute is raised and retracted with chain evidence',async()=>{
 const order=await action('commit');await action('redeem',order.exchangeId);await action('dispute',order.exchangeId);
 assert.equal(Number((await boson.getExchange(order.exchangeId)).exchange.state),5);
 const result=await action('retract',order.exchangeId);assert.equal(result.disputeRetracted,true);
 assert.ok((await boson.getDispute(order.exchangeId)).disputeDates.finalized>0n);
});
await check('all Boson receipts exist on both public providers',async()=>{
 const receipts=load('public-receipts.json');assert.ok(receipts.some(r=>r.label==='boson-refund'));
 for(const record of receipts.filter(r=>r.label.startsWith('boson-'))){const a=await p.getTransactionReceipt(record.tx),b=await p2.getTransactionReceipt(record.tx);assert.equal(a.status,1);assert.equal(a.blockHash,b.blockHash);}
});

state=await(await fetch(origin+'/api/evidence')).json();
const report={schemaVersion:1,verifiedAt:new Date().toISOString(),mode:'public-base-sepolia',chainId:84532,publicTransactions:true,
 testsPassed:tests.length,tests,unitTestReport:'UNIT_TEST_VERIFICATION.json; run npm test separately',evidence:state,
 funding:load('funding-receipt.json'),publicReceipts:load('public-receipts.json'),
 limitations:['Demo signers share this Mac; independent custody is not claimed.','NFT issuance uses 15 gates and Safe 3/5; commerce uses verified software quorum before automatic demo EOA transactions.','NFT association and token ownership do not prove copyright.']};
for(const file of [path.join(ROOT,'evidence/BASE_VERIFICATION.json'),path.join(DEMO_HOME,'BASE_VERIFICATION.json')])fs.writeFileSync(file,json(report)+'\n',{mode:0o600});
fs.writeFileSync(path.join(ROOT,'evidence/BASE_DEPLOYMENT_MANIFEST.json'),json(m)+'\n');
console.log('Public BASE verification saved:',tests.length,'live scenarios');p.destroy();p2.destroy();
