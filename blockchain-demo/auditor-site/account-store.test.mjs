import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {openUserDatabase} from './user-database.mjs';import {createUserStore} from './user-store.mjs';import {createAccountStore} from './account-store.mjs';
import {deliveryWindow,fulfillmentPolicy} from './fulfillment.mjs';
const origin='http://127.0.0.1:18443',a='0x'+'ab'.repeat(20),b='0x'+'cd'.repeat(20),driver=process.env.VIDRA_TEST_DATABASE_URL?'postgres':'sqlite';
async function fixture(fn){const db=await openUserDatabase(driver==='postgres'?{connectionString:process.env.VIDRA_TEST_DATABASE_URL}:{filename:':memory:'});try{const users=await createUserStore(db,{origin}),store=await createAccountStore(db,{origin,users});
 if(driver==='postgres')await db.query('TRUNCATE vidra_google_identities,vidra_member_sessions,vidra_google_flows,vidra_seller_products,vidra_members,vidra_users CASCADE');
 const sa=await users.createSession(a),sb=await users.createSession(b),aa={mode:'wallet',walletToken:sa.token},bb={mode:'wallet',walletToken:sb.token};await fn({db,users,store,sa,sb,aa,bb});}finally{await db.close();}}
const product=kind=>({title:'Demo product',description:'Test-only product terms',price:'25',quantity:1,fulfillment:{kind,days:kind==='digital_instant'?0:7}});
test(`${driver}: buyer/seller profiles are stable, owner scoped and grant no payment authority`,()=>fixture(async({store,sa,aa,bb})=>{
 const m=await store.resolve(aa);assert.equal(m.id,sa.user.id);assert.equal(m.roles.buyer,true);assert.equal(m.roles.seller,false);
 const p=await store.update(aa,{displayName:'Seller A',locale:'en',seller:true,revision:0});assert.equal(p.roles.seller,true);
 assert.equal((await store.resolve(bb)).roles.seller,false);assert.equal((await store.resolve(aa)).id,m.id);
 await assert.rejects(store.update(aa,{displayName:'evil',locale:'en',seller:true,revision:1,id:(await store.resolve(bb)).id}),e=>e.status===400);
 const attempts=await Promise.allSettled(Array.from({length:5},()=>store.update(aa,{displayName:'race',locale:'en',seller:true,revision:1})));assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
}));
test(`${driver}: private products reject cross-owner edits, forged publication and invalid fulfillment`,()=>fixture(async({db,store,aa,bb})=>{
 const id=crypto.randomUUID();await assert.rejects(store.saveProduct(aa,{id,revision:0,product:product('digital_instant')}),e=>e.status===403);
 for(const auth of [aa,bb])await store.update(auth,{displayName:'Seller',locale:'en',seller:true,revision:0});
 for(const kind of ['digital_instant','physical','service','custom_digital']){const p=await store.saveProduct(aa,{id:kind==='digital_instant'?id:crypto.randomUUID(),revision:0,product:product(kind)});assert.equal(p.status,'DRAFT');}
 assert.equal((await store.products(aa)).length,4);assert.equal((await store.products(bb)).length,0);
 await assert.rejects(store.saveProduct(bb,{id,revision:1,product:product('digital_instant')}),e=>e.status===409);
 await assert.rejects(store.saveProduct(aa,{id:crypto.randomUUID(),revision:0,product:product('service'),status:'PUBLISHED'}),e=>e.status===400);
 await assert.rejects(store.saveProduct(aa,{id:crypto.randomUUID(),revision:0,product:{...product('service'),fulfillment:{kind:'service',days:0}}}),e=>e.status===400);
 await assert.rejects(store.saveProduct(aa,{id:crypto.randomUUID(),revision:0,product:{...product('service'),price:'1e30'}}),e=>e.status===400);
 if(driver==='postgres')assert.equal((await db.query('SELECT id FROM vidra_seller_products')).rows.length,0);
}));
test(`${driver}: Google flows are browser bound, single use and refuse automatic profile merges`,()=>fixture(async({db,store,users,sa,aa,bb})=>{
 const browserToken=crypto.randomBytes(32).toString('hex'),flow=await store.issueGoogleFlow({browserToken,walletToken:sa.token});
 await assert.rejects(store.consumeGoogleFlow(flow.nonce,'b'.repeat(64)),e=>e.status===401);
 const results=await Promise.allSettled([store.consumeGoogleFlow(flow.nonce,browserToken),store.consumeGoogleFlow(flow.nonce,browserToken)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const google=await store.finishGoogle(results.find(r=>r.status==='fulfilled').value,{subject:'subject-a'});assert.equal(google.member.id,sa.user.id);
 assert.equal((await store.resolve({mode:'google',googleToken:google.token})).id,(await store.resolve(aa)).id);
 const other=await store.finishGoogle({},{subject:'subject-b'});assert.notEqual(other.member.id,google.member.id);assert.equal(other.member.wallet,null);
 await assert.rejects(store.linkWallet({mode:'google',googleToken:other.token},sa.token),e=>e.status===409);
 const linked=await store.linkWallet({mode:'google',googleToken:other.token},(await users.createSession(b)).token);assert.equal(linked.id,other.member.id);
 assert.equal((await store.resolve(bb)).id,other.member.id);
 const taken=await store.issueGoogleFlow({browserToken,walletToken:sa.token}),takenFlow=await store.consumeGoogleFlow(taken.nonce,browserToken);
 await assert.rejects(store.finishGoogle(takenFlow,{subject:'subject-b'}),e=>e.status===409);
 const expired=await store.issueGoogleFlow({browserToken,walletToken:sa.token}),expiredFlow=await store.consumeGoogleFlow(expired.nonce,browserToken);await users.logout(sa.token);
 await assert.rejects(store.finishGoogle(expiredFlow,{subject:'subject-new'}),e=>e.status===401);
 assert.ok((await db.query('SELECT token_hash FROM vidra_member_sessions')).rows.every(r=>r.token_hash!==google.token));
 await store.logout(google.token);await assert.rejects(store.resolve({mode:'google',googleToken:google.token}),e=>e.status===401);
}));
test('fulfillment promises cannot automatically settle Boson escrow',()=>{
 const now=1000000;for(const kind of ['digital_instant','physical','service','custom_digital']){const v=deliveryWindow(product(kind).fulfillment,now);assert.equal(v.dueAt,now+product(kind).fulfillment.days*86400000);assert.equal(v.sellerSettlement,'boson-finalized-exchange');assert.equal(v.deliveryEvidenceRequired,true);}
 for(const p of [{kind:'digital_instant',days:3},{kind:'physical',days:0},{kind:'service',days:366},{kind:'custom_digital',days:-1},{kind:'service',days:7,autoComplete:true}])assert.throws(()=>fulfillmentPolicy(p),e=>e.status===400);
});
test(`${driver}: publication reservations freeze exact terms and cannot be cancelled after journal preparation`,()=>fixture(async({store,users,aa,bb})=>{
 await store.update(aa,{displayName:'Seller',locale:'en',seller:true,revision:0});const id=crypto.randomUUID(),key='seller-publication-test-key';await store.saveProduct(aa,{id,revision:0,product:product('service')});
 const snapshot=await store.publicationSnapshot(aa,id,1,key);assert.equal(snapshot.product.revision,1);assert.equal((await store.products(aa))[0].status,'RESERVED');
 await assert.rejects(store.saveProduct(aa,{id,revision:1,product:product('service')}),e=>e.status===409);
 await assert.rejects(store.publicationSnapshot(aa,id,1,'another-publication-key'),e=>e.status===409);
 assert.equal((await store.publicationSnapshot(aa,id,1,key)).member.id,snapshot.member.id);
 await assert.rejects(store.cancelUnpreparedPublication(bb,{productId:id,key}),e=>e.status===404);
 // Only the gateway exposes cancellation, under the same wallet lease as prepare.
 await users.exclusive(snapshot.member.wallet,async(account,ledger,persist)=>{ledger.intents.push({id:crypto.randomUUID(),key,account,status:'PREPARED',action:'seller-publish',productId:id});await persist();});
 await assert.rejects(store.cancelUnpreparedPublication(aa,{productId:id,key}),e=>e.status===409);await assert.rejects(store.releasePublication(snapshot.member.wallet,key),e=>e.status===409);
 await users.exclusive(snapshot.member.wallet,async(_a,ledger,persist)=>{ledger.intents.find(i=>i.key===key).status='CANCELLED';await persist();});await store.releasePublication(snapshot.member.wallet,key);
 assert.equal((await store.products(aa))[0].status,'DRAFT');await store.saveProduct(aa,{id,revision:1,product:product('service')});
}));
test(`${driver}: admitted publications are immutable, idempotent, public by explicit projection and bound to their owner`,()=>fixture(async({store,aa,bb})=>{
 await store.update(aa,{displayName:'Seller',locale:'en',seller:true,revision:0});const id=crypto.randomUUID();await store.saveProduct(aa,{id,revision:0,product:product('service')});const m=await store.resolve(aa),proof={memberId:m.id,wallet:m.wallet,productId:id,revision:1,sellerId:'44',offerId:'140',transactionHash:'0x'+'a'.repeat(64),blockNumber:42,payload:{id,offerId:'140',status:'PUBLISHED'}};
 await assert.rejects(store.recordPublication({...proof,memberId:(await store.resolve(bb)).id}),e=>e.status===403);
 await assert.rejects(store.recordPublication({...proof,revision:2}),e=>e.status===409);
 await store.recordPublication(proof);await store.recordPublication(proof);assert.equal((await store.published(id)).length,1);assert.equal((await store.products(aa))[0].status,'PUBLISHED');
 assert.deepEqual(await store.products(bb),[]);await assert.rejects(store.recordPublication({...proof,offerId:'141'}),e=>e.status===409);await assert.rejects(store.saveProduct(aa,{id,revision:1,product:product('service')}),e=>e.status===409);
}));
