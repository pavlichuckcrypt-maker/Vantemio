import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from '../src/compile.mjs';
import {DEMO_HOME} from '../src/vault.mjs';
import {json} from '../src/chain.mjs';

const origin='http://127.0.0.1:18339',tests=[];
let state=await(await fetch(origin+'/api/state')).json();
assert.equal(state.manifest.chainId,84532);assert.equal(state.pendingTransaction,false);
async function refresh(){state=await(await fetch(origin+'/api/state')).json();}
async function call(action,params={}){
 const r=await fetch(origin+'/api/market/action',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Demo-CSRF':state.csrf},body:JSON.stringify({action,...params,idempotencyKey:crypto.randomUUID()}),signal:AbortSignal.timeout(180000)});
 const data=await r.json();if(!r.ok)throw new Error(data.error);await refresh();return data.result;
}
async function deniedDelivery(exchangeId){await assert.rejects(()=>call('delivery',{exchangeId}),/no digital download|redeemed or completed/);}
async function check(name,fn){await fn();tests.push({name,passed:true});console.log('PASS',name);}
await check('LUT resource completes payment, rNFT, redemption, exact file delivery and settlement',async()=>{
 const l=state.marketplace.listings.find(l=>l.kind==='digital'),before=Number(state.commerce.buyerBalance);
 assert.ok(l);const o=await call('buy',{listingId:l.id});assert.equal(Number(state.commerce.buyerBalance),before-Number(l.price));
 await call('redeem',{exchangeId:o.exchangeId});const grant=await call('delivery',{exchangeId:o.exchangeId});
 const response=await fetch(origin+'/api/market/delivery',{headers:{'X-Demo-CSRF':state.csrf,'X-Delivery-Token':grant.token}});
 assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),l.assetSha256);
 assert.match(bytes.toString(),/LUT_3D_SIZE 17/);assert.ok(grant.filename.endsWith('.cube'));
 await call('complete',{exchangeId:o.exchangeId});assert.equal(state.orders.find(x=>x.exchangeId===o.exchangeId).state,'COMPLETED');
});
await check('new service offer uses its actual price and completes a demo buyer confirmation',async()=>{
 const l=state.marketplace.listings.find(l=>l.kind==='service'&&l.id!=='legacy-service'),before=Number(state.commerce.buyerBalance);
 assert.ok(l);const o=await call('buy',{listingId:l.id});assert.equal(Number(state.commerce.buyerBalance),before-Number(l.price));
 await call('redeem',{exchangeId:o.exchangeId});await deniedDelivery(o.exchangeId);
 await call('complete',{exchangeId:o.exchangeId});assert.equal(state.orders.find(x=>x.exchangeId===o.exchangeId).state,'COMPLETED');
});
await check('physical demo item purchases at the published price, denies digital download and refunds exactly',async()=>{
 const l=state.marketplace.listings.find(l=>l.kind==='physical'),before=Number(state.commerce.buyerBalance);
 assert.ok(l);const o=await call('buy',{listingId:l.id});assert.equal(Number(state.commerce.buyerBalance),before-Number(l.price));
 await deniedDelivery(o.exchangeId);await call('cancel',{exchangeId:o.exchangeId});await call('refund',{exchangeId:o.exchangeId});
 assert.equal(Number(state.commerce.buyerBalance),before);assert.equal(state.orders.find(x=>x.exchangeId===o.exchangeId).refundWithdrawn,true);
});
await check('tokenization-only path issues an author-owned NFT without creating a Boson sale',async()=>{
 const offers=state.marketplace.listings.length,asset=await call('render',{kind:'video',title:'Studio certificate only · no marketplace sale'});
 const certificate=await call('mint',{assetId:asset.id});assert.ok(certificate.tokenId);
 assert.equal(state.marketplace.listings.length,offers);assert.ok(!state.marketplace.listings.some(l=>l.assetId===asset.id));
 assert.equal(state.marketplace.assets.find(a=>a.id===asset.id).certificate.owner.toLowerCase(),state.manifest.sellerAddress?.toLowerCase()||'0xb986fafde18de1e9d5d8986cd8a927d6ca0932d0');
});
const result={schemaVersion:1,verifiedAt:new Date().toISOString(),chainId:84532,testsPassed:tests.length,tests,
 evidence:await(await fetch(origin+'/api/evidence')).json(),limitations:['Service completion is a demo buyer confirmation, not proof of real service performance.','Physical example tests protocol purchase/refund, not real shipment.']};
for(const f of [path.join(ROOT,'evidence/MARKET_CATEGORIES_VERIFICATION.json'),path.join(DEMO_HOME,'MARKET_CATEGORIES_VERIFICATION.json')])fs.writeFileSync(f,json(result)+'\n',{mode:0o600});
console.log('All marketplace categories verified:',tests.length,'scenarios');
