import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Contract,JsonRpcProvider,FetchRequest,keccak256,parseEther } from 'ethers';
import { ROOT } from '../src/compile.mjs';
import { bosonABI,json } from '../src/chain.mjs';
import { DEMO_HOME } from '../src/vault.mjs';
const origin='http://127.0.0.1:18339',tests=[];
let s;const providers=[];
async function refresh(){s=await(await fetch(origin+'/api/state')).json();assert.equal(s.manifest.chainId,84532);return s;}
async function post(input){return fetch(origin+'/api/market/action',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Demo-CSRF':s.csrf},body:JSON.stringify(input),signal:AbortSignal.timeout(180000)});}
async function action(action,params={},key=crypto.randomUUID()){const response=await post({action,idempotencyKey:key,...params}),result=await response.json();if(!response.ok)throw new Error(result.error);await refresh();return result.result;}
async function deny(action,params={}){const r=await post({action,idempotencyKey:crypto.randomUUID(),...params});assert.equal(r.status,400);return (await r.json()).error;}
async function check(name,fn){await fn();tests.push({name,passed:true});console.log('PASS',name);}
try{
 await refresh();assert.equal(s.deploymentReady,true);assert.equal(s.pendingTransaction,false);
 const before=s.receipts.length;
 const request=new FetchRequest('https://sepolia.base.org');request.timeout=20000;const p=new JsonRpcProvider(request,84532,{staticNetwork:true,batchMaxCount:1});providers.push(p);
 const boson=new Contract(s.manifest.sourceBoson,bosonABI(),p);
 const wallets=s.wallets;const buyerAddress=Array.isArray(wallets)?wallets.find(w=>w.role==='buyer').address:wallets.buyer.address;
 let asset=s.marketplace.assets.find(a=>a.kind==='video'),listing,order,digital,resource;
 await check('studio export quality and existing certificate bind actual content',async()=>{assert.ok(asset);assert.equal(asset.quality.width,1920);assert.equal(asset.quality.height,1080);const certificate=await action('mint',{assetId:asset.id});assert.equal(certificate.videoSha256,asset.sha256);});
 await check('seller publishes an immutable content-linked offer in official Boson',async()=>{const key=crypto.randomUUID(),params={kind:'video',assetId:asset.id,title:'Verified video license',description:'Demo file access to accepted studio video; no copyright or passport transfer.',price:'25',quantity:10};listing=await action('list',params,key);const count=s.receipts.length,again=await action('list',params,key);assert.equal(again.offerId,listing.offerId);assert.equal(s.receipts.length,count);
   const chain=await boson.getOffer(listing.offerId);assert.equal(chain.offer.price,parseEther('25'));assert.equal(chain.offer.metadataHash,listing.metadataHash);assert.equal(chain.offer.sellerId.toString(),s.commerce.sellerId);});
 await check('purchase idempotency prevents duplicate Boson exchanges and parameter substitution',async()=>{const key=crypto.randomUUID();order=await action('buy',{listingId:listing.id},key);const count=s.receipts.length,again=await action('buy',{listingId:listing.id},key);assert.equal(again.exchangeId,order.exchangeId);assert.equal(s.receipts.length,count);
   assert.equal((await post({action:'buy',idempotencyKey:key,listingId:'legacy-service'})).status,400);});
 await check('unredeemed order and premature completion cannot receive/settle a digital file',async()=>{await deny('delivery',{exchangeId:order.exchangeId});await deny('complete',{exchangeId:order.exchangeId});});
 await check('redeemed buyer receives exact bytes once; replay is refused',async()=>{await action('redeem',{exchangeId:order.exchangeId});const g=await action('delivery',{exchangeId:order.exchangeId});
   const headers={'X-Demo-CSRF':s.csrf,'X-Delivery-Token':g.token};const r=await fetch(origin+'/api/market/delivery',{headers});assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.sha256);
   assert.equal((await fetch(origin+'/api/market/delivery',{headers})).status,400);assert.equal((await fetch(origin+'/api/market/delivery')).status,403);await refresh();assert.equal(s.orders.find(o=>o.exchangeId===order.exchangeId).deliveredSha256,asset.sha256);});
 await check('digital file delivery settles the official Boson exchange',async()=>{await action('complete',{exchangeId:order.exchangeId});assert.equal(Number((await boson.getExchange(order.exchangeId)).exchange.state),4);});
 await check('digital resource is produced, fingerprinted, tokenized and listed',async()=>{resource=await action('render',{kind:'digital',title:'Studio Neutral LUT · security demo'});assert.equal(resource.quality.samples,4913);const cert=await action('mint',{assetId:resource.id});assert.equal(cert.videoSha256,resource.sha256);digital=await action('list',{kind:'digital',assetId:resource.id,title:'LUT digital resource',description:'Generated neutral CUBE resource; test-only license.',price:'7.5',quantity:12});assert.equal((await boson.getOffer(digital.offerId)).offer.price,parseEther('7.5'));});
 let cancelled;
 await check('Safe pause stops new purchases and publication',async()=>{cancelled=await action('buy',{listingId:digital.id});await action('pauseMarket',{paused:true});assert.equal(s.paused,true);await deny('buy',{listingId:listing.id});await deny('list',{kind:'service',title:'Paused service',description:'Must not be published while paused.',price:'10',quantity:1});});
 await check('cancellation and exact wallet refund remain possible while paused; delivery is denied',async()=>{await action('cancel',{exchangeId:cancelled.exchangeId});await deny('delivery',{exchangeId:cancelled.exchangeId});const before=Number(s.commerce.buyerBalance);await action('refund',{exchangeId:cancelled.exchangeId});assert.equal(Number(s.commerce.buyerBalance),before+7.5);await action('pauseMarket',{paused:false});});
 await check('service and physical-demo categories publish real protocol offers',async()=>{for(const [kind,price]of [['service','11'],['physical','40']]){const l=await action('list',{kind,title:kind==='service'?'Монтажная услуга · demo':'Studio print · test item',description:'Public testnet example; no real commission or shipment.',price,quantity:3});assert.equal((await boson.getOffer(l.offerId)).offer.price,parseEther(price));}});
 await check('seller proceeds withdraw to actual demo wallet',async()=>{const available=Number(s.commerce.sellerAvailable);assert.ok(available>0);const result=await action('withdrawSeller');assert.equal(Number(result.amount),available);assert.equal(Number(s.commerce.sellerAvailable),0);});
 await check('foreign origins, altered actor/chain and public evidence secret fields are denied',async()=>{assert.equal((await fetch(origin+'/api/market/action',{method:'POST',headers:{Origin:'https://foreign.invalid','Content-Type':'application/json'},body:'{}'})).status,403);await deny('buy',{listingId:listing.id,chainId:8453});await deny('buy',{listingId:listing.id,role:'seller'});
   const evidence=await(await fetch(origin+'/api/evidence')).text();assert.ok(!/"csrf"|privateKey|mnemonic|"token"|studio-api-token|"project"|"file"/.test(evidence));assert.equal(s.auditVerified,true);});
 await check('every new chain receipt is confirmed on two Base RPCs',async()=>{const q=new FetchRequest('https://base-sepolia-rpc.publicnode.com');q.timeout=20000;const p2=new JsonRpcProvider(q,84532,{staticNetwork:true,batchMaxCount:1});providers.push(p2);
   assert.equal(Number(await p.send('eth_chainId',[])),84532);assert.equal(Number(await p2.send('eth_chainId',[])),84532);
   for(const record of s.receipts.slice(before)){const a=await p.getTransactionReceipt(record.tx),b=await p2.getTransactionReceipt(record.tx);assert.equal(a.status,1);assert.equal(a.blockHash,b.blockHash);assert.equal(a.blockHash,record.blockHash);assert.ok(await a.confirmations()>=3);}
   assert.equal(keccak256(await p2.getCode(s.manifest.sourceBoson)),s.manifest.sourceBosonCodeHash);});
 const evidence=await(await fetch(origin+'/api/evidence')).json();const report={schemaVersion:2,verifiedAt:new Date().toISOString(),chainId:84532,mode:'public-base-sepolia',testsPassed:tests.length,tests,unitTestReport:'UNIT_TEST_VERIFICATION.json; run npm test separately',newPublicReceipts:evidence.receipts.slice(before),evidence,
   limitations:['Same-Mac demo signers; no independent custody.','Boson uses EOA transactions after a verified software quorum.','Digital access license is separate from NFT passport/copyright.','Physical/service examples do not prove real shipment or service performance.']};
 for(const file of [path.join(ROOT,'evidence/MARKETPLACE_VERIFICATION.json'),path.join(DEMO_HOME,'MARKETPLACE_VERIFICATION.json')])fs.writeFileSync(file,json(report)+'\n',{mode:0o600});
 console.log('Marketplace verified:',tests.length,'live scenarios; buyer',buyerAddress);
}catch(e){console.error('MARKETPLACE_VERIFY_FAILED',e.shortMessage||e.message);process.exitCode=1;fs.writeFileSync(path.join(ROOT,'evidence/MARKETPLACE_PROGRESS.json'),json({at:new Date().toISOString(),passed:tests,error:e.shortMessage||e.message})+'\n');}
finally{providers.forEach(p=>p.destroy());}
