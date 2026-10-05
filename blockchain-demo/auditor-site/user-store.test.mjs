import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {Wallet} from 'ethers';
import {openUserDatabase} from './user-database.mjs';
import {createUserStore} from './user-store.mjs';
import {createPersistentProofStore} from './wallet-proof.mjs';
const origin='http://127.0.0.1:18442',a='0x'+'ab'.repeat(20),b='0x'+'cd'.repeat(20),sha='a'.repeat(64);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const tables=['vidra_market_capacity','vidra_grants','vidra_sessions','vidra_challenges','vidra_wallet_intents','vidra_wallet_orders','vidra_wallet_locks','vidra_users','vidra_rate_limits','vidra_meta'];
const driver=process.env.VIDRA_TEST_DATABASE_URL?'postgres':'sqlite';
async function fixture(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'vidra-users-')); const opts=driver==='postgres'?{connectionString:process.env.VIDRA_TEST_DATABASE_URL}:{filename:path.join(temp,'users.sqlite')};
 const db=await openUserDatabase(opts),store=await createUserStore(db,{origin});
 if(driver==='postgres')await db.query('TRUNCATE '+tables.join(',')+' CASCADE');
 const fresh=await createUserStore(db,{origin});
 return {db,store:fresh,opts,async close(){await db.close();fs.rmSync(temp,{recursive:true,force:true});}};
}
async function run(name,fn){test(`${driver}: ${name}`,async()=>{const f=await fixture();try{await fn(f);}finally{await f.close();}});}
run('real signatures are bound to origin/address and challenges are consumed once',async({store})=>{
 const signer=Wallet.createRandom(),wrong=Wallet.createRandom(),proofs=createPersistentProofStore({origin,store});
 const c=await proofs.issue(signer.address,84532);const sig=await signer.signMessage(c.message);
 const results=await Promise.allSettled([proofs.verify(c.id,sig),proofs.verify(c.id,sig)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const second=await proofs.issue(signer.address,84532);await assert.rejects(proofs.verify(second.id,await wrong.signMessage(second.message)),/mismatch/);await assert.rejects(proofs.verify(second.id,await signer.signMessage(second.message)),/already used/);
 const third=await proofs.issue(signer.address,84532);await assert.rejects(proofs.verify(third.id,await signer.signMessage(third.message.replace(origin,'http://127.0.0.1:18443'))),/mismatch/);
 await assert.rejects(proofs.issue(signer.address,1),/84532/);
});
run('profiles have stable IDs; updates are owner scoped and reject forged fields/stale revisions',async({db,store})=>{
 const sa=await store.createSession(a),sb=await store.createSession(b);assert.notEqual(sa.user.id,sb.user.id);
 const again=await store.createSession(a.toUpperCase().replace('0X','0x'));assert.equal(sa.user.id,again.user.id);
 const changed=await store.updateProfile(sa.token,{displayName:'Alice <script>',locale:'en',revision:0});assert.equal(changed.revision,1);assert.equal((await store.session(sb.token)).user.displayName,'');
 await assert.rejects(store.updateProfile(sa.token,{displayName:'evil',locale:'en',revision:1,account:b}),e=>e.status===400);
 await assert.rejects(store.updateProfile(sa.token,{displayName:'stale',locale:'ru',revision:0}),e=>e.status===409);
 await assert.rejects(store.updateProfile(sa.token,{displayName:'hidden\u202e',locale:'ru',revision:1}),e=>e.status===400);
 const tokens=await db.query('SELECT token_hash FROM vidra_sessions');assert.ok(tokens.rows.every(r=>r.token_hash!==sa.token&&r.token_hash!==sb.token));
});
run('sessions survive process connections; logout and expiry revoke grants',async({db,store,opts})=>{
 const s=await store.createSession(a),another=await openUserDatabase(opts);try{const worker=await createUserStore(another,{origin});assert.equal(worker.csrf,store.csrf);assert.equal((await worker.session(s.token)).user.id,s.user.id);
 const foreign=await createUserStore(another,{origin:'http://127.0.0.1:18443'});await assert.rejects(foreign.session(s.token),e=>e.status===401);
 const auth=await store.session(s.token),grant=await store.issueGrant(auth,{exchangeId:'1',sha256:sha});await worker.logout(s.token);await assert.rejects(store.session(s.token),e=>e.status===401);await assert.rejects(store.consumeGrant(auth,grant.token),e=>e.status===401);
 const s2=await store.createSession(a);await db.query('UPDATE vidra_sessions SET expires=0');await assert.rejects(store.session(s2.token),e=>e.status===401);
 }finally{await another?.close();}
});
run('delivery grants are single use and a different buyer cannot consume or invalidate them',async({store})=>{
 const sa=await store.createSession(a),sb=await store.createSession(b),aa=await store.session(sa.token),bb=await store.session(sb.token);
 const g=await store.issueGrant(aa,{exchangeId:'123',sha256:sha});await assert.rejects(store.consumeGrant(bb,g.token),e=>e.status===403);
 const both=await Promise.allSettled([store.consumeGrant(aa,g.token),store.consumeGrant(aa,g.token)]);assert.equal(both.filter(r=>r.status==='fulfilled').length,1);
 const other=await store.createSession(a);const gg=await store.issueGrant(aa,{exchangeId:'124',sha256:sha});await assert.rejects(store.consumeGrant(await store.session(other.token),gg.token),e=>e.status===403);
});
run('wallet operations exclude competing workers but different owners run concurrently',async({store,db,opts})=>{
 const second=await openUserDatabase(opts);try{const worker=await createUserStore(second,{origin});let release,entered;const ready=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 const first=store.exclusive(a,async(_a,data,persist)=>{data.intents.push({id:crypto.randomUUID(),account:a,key:'same-key',status:'PREPARED'});await persist();entered();await hold;});await ready;
 await assert.rejects(worker.exclusive(a,async()=>{}),e=>e.status===409);
 await worker.exclusive(b,async(_b,data,persist)=>{data.intents.push({id:crypto.randomUUID(),account:b,key:'same-key',status:'PREPARED'});data.orders.push({account:b,exchangeId:'22'});await persist();});
 release();await first;assert.equal((await store.ledger(a)).intents.length,1);assert.equal((await store.ledger(a)).orders.length,0);assert.equal((await store.ledger(b)).orders[0].exchangeId,'22');
 const unscoped=driver==='postgres'?await db.query('SELECT * FROM vidra_wallet_orders'):null;if(unscoped)assert.equal(unscoped.rows.length,0,'FORCE RLS rejects unscoped reads, even table owner');
 await assert.rejects(store.exclusive(a,async(_a,data,persist)=>{data.orders.push({account:b,exchangeId:'22'});await persist();}),e=>e.status===403);
 await assert.rejects(store.exclusive(a,async(_a,data,persist)=>{data.intents.push({id:crypto.randomUUID(),account:a,key:'second',status:'PREPARED'});await persist();}),/database unavailable/);
 assert.equal((await store.ledger(a)).intents.length,1);
 }finally{await second.close();}
});
run('expired lease fences stale persistence and allows recovery without broadcasting',async({db,store})=>{
 await store.exclusive(a,async(_a,data,persist)=>{data.intents.push({id:crypto.randomUUID(),account:a,key:'fenced',status:'SUBMITTED',hash:'0x'+'1'.repeat(64)});await db.query('UPDATE vidra_wallet_locks SET expires=0 WHERE account=$1',[a]);await assert.rejects(persist(),e=>e.status===409);});
 assert.equal((await store.ledger(a)).intents.length,0);
 await store.exclusive(a,async(_a,data,persist)=>{data.intents.push({id:crypto.randomUUID(),account:a,key:'recovery',status:'SUBMITTED',hash:'0x'+'2'.repeat(64)});await persist();});assert.equal((await store.ledger(a)).intents[0].status,'SUBMITTED');
});
run('legacy migration is atomic, repeatable and refuses changed snapshots',async({db,store})=>{
 const broken={schemaVersion:1,intents:[],orders:[{account:a,exchangeId:'1'},{account:b,exchangeId:'1'}]};await assert.rejects(store.importLegacy(broken));assert.equal((await store.ledger(a)).orders.length,0);assert.equal((await db.query("SELECT * FROM vidra_meta WHERE key='legacy-wallet-ledger-v1'")).rows.length,0);
 const valid={schemaVersion:1,intents:[],orders:[{account:a,exchangeId:'1'},{account:b,exchangeId:'2'}]};await Promise.all([store.importLegacy(valid),store.importLegacy(valid)]);assert.equal((await store.ledger(a)).orders.length,1);assert.equal((await store.ledger(b)).orders.length,1);await assert.rejects(store.importLegacy({...valid,orders:[]}),/changed after import/);
});
run('concurrent updates have one winner and rate limits never reset on reconnect',async({store,opts})=>{
 const s=await store.createSession(a);const saves=await Promise.allSettled(Array.from({length:10},(_,i)=>store.updateProfile(s.token,{displayName:'Name '+i,locale:'en',revision:0})));assert.equal(saves.filter(r=>r.status==='fulfilled').length,1);assert.equal((await store.session(s.token)).user.revision,1);
 const attempts=await Promise.allSettled(Array.from({length:10},()=>store.rateLimit('bounded',3)));assert.equal(attempts.filter(r=>r.status==='fulfilled').length,3);
 const db=await openUserDatabase(opts);try{const worker=await createUserStore(db,{origin});await assert.rejects(worker.rateLimit('bounded',3),e=>e.status===429);}finally{await db.close();}
});
run('per-owner limits withstand concurrent challenge and delivery requests',async({store})=>{
 const proofs=createPersistentProofStore({origin,store});const c=await Promise.allSettled(Array.from({length:10},()=>proofs.issue(a,84532)));assert.equal(c.filter(r=>r.status==='fulfilled').length,4);
 const s=await store.createSession(a),auth=await store.session(s.token);const g=await Promise.allSettled(Array.from({length:10},()=>store.issueGrant(auth,{exchangeId:'1',sha256:sha})));assert.equal(g.filter(r=>r.status==='fulfilled').length,4);
});
run('100 independent profiles remain distinct under bounded parallel requests',async({store})=>{
 const accounts=Array.from({length:100},(_,i)=>'0x'+(i+1).toString(16).padStart(40,'0'));const ids=new Set();
 for(let i=0;i<accounts.length;i+=10){await Promise.all(accounts.slice(i,i+10).map(async(account)=>{const s=await store.createSession(account);ids.add(s.user.id);const p=await store.updateProfile(s.token,{displayName:account,locale:'en',revision:0});assert.equal(p.account.toLowerCase(),account);assert.equal((await store.session(s.token)).user.displayName,account);}));}
 assert.equal(ids.size,100);
});

run('shared checkout capacity separates reads, bounds workers and releases on failure',async({store,opts})=>{
 const another=await openUserDatabase(opts);const held=[];try{
 const worker=await createUserStore(another,{origin});
 for(let i=0;i<8;i++){let release,entered;const ready=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 const promise=(i%2?worker:store).withMarketCapacity('checkout',async()=>{entered();await hold;});held.push({release,promise});await ready;}
 await assert.rejects(worker.withMarketCapacity('checkout',()=>{}),e=>e.status===503);
 assert.equal(await worker.withMarketCapacity('read',()=>17),17);
 for(const entry of held)entry.release();await Promise.all(held.map(x=>x.promise));held.length=0;
 await assert.rejects(worker.withMarketCapacity('checkout',()=>{throw new Error('RPC failed');}),/RPC failed/);
 assert.equal(await store.withMarketCapacity('checkout',()=>23),23);
 }finally{for(const entry of held)entry.release();await Promise.allSettled(held.map(x=>x.promise));await another.close();}
});

run('expired capacity can be reclaimed and an old worker cannot delete the new lease',async({store,db})=>{
 let release,entered;const ready=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 const first=store.withMarketCapacity('checkout',async()=>{entered();await hold;});await ready;
 await db.query('UPDATE vidra_market_capacity SET expires=0');
 await store.withMarketCapacity('checkout',async()=>{release();await first;const rows=await db.query("SELECT * FROM vidra_market_capacity WHERE lane='checkout'");assert.equal(rows.rows.length,1);});
 assert.equal((await db.query('SELECT * FROM vidra_market_capacity')).rows.length,0);
});

run('50 checkout journals remain owner isolated across workers and survive replay/reconnect',async({store,opts})=>{
 const another=driver==='postgres'?await openUserDatabase(opts):null;const worker=another?await createUserStore(another,{origin}):store;
 const accounts=Array.from({length:50},(_,i)=>'0x'+(i+1).toString(16).padStart(40,'0'));
 let next=0,active=0,peak=0;
 const purchase=async(owner,index)=>{const s=index%2?worker:store;return s.withMarketCapacity('checkout',()=>s.exclusive(owner,async(account,data,persist)=>{
   active++;peak=Math.max(peak,active);try{
    const key='durable-purchase-key';const old=data.intents.find(i=>i.key===key);if(old)return old.id;
    const intent={id:crypto.randomUUID(),account,key,status:'PREPARED'};data.intents.push(intent);await persist();
    // Synthetic receipt IDs exercise storage only; they are never chain evidence.
    intent.status='SUBMITTED';intent.hash='fixture-'+index;await persist();
    intent.status='CONFIRMED';data.orders.push({account,exchangeId:String(1000+index),commitTx:intent.hash});await persist();return intent.id;
   }finally{active--;}
 }));};
 try{await Promise.all(Array.from({length:8},async()=>{while(next<accounts.length){const i=next++;await purchase(accounts[i],i);}}));assert.ok(peak<=8);
 for(let i=0;i<accounts.length;i++){const before=await store.ledger(accounts[i]);assert.equal(before.orders.length,1);assert.equal(before.orders[0].account.toLowerCase(),accounts[i]);assert.equal(await purchase(accounts[i],i),before.intents[0].id);assert.equal((await worker.ledger(accounts[i])).orders.length,1);}
 }finally{await another?.close();}
});

run('exact recovery lookup finds old operations without returning another owner data',async({store,opts})=>{
 const key='shared-recovery-operation';
 for(const [account,id]of [[a,'alice-old'],[b,'bob-old']])await store.exclusive(account,async(_owner,data,persist)=>{
  data.intents.push({account,id,key,status:'CONFIRMED',hash:'0x'+'ab'.repeat(32)});
  for(let i=0;i<25;i++)data.intents.push({account,id:id+'-'+i,key:'historical-operation-'+i,status:'CONFIRMED'});await persist();
 });
 assert.equal((await store.intentByKey(a,key)).id,'alice-old');assert.equal((await store.intentByKey(b,key)).id,'bob-old');
 await store.exclusive(b,async(_owner,data,persist)=>{data.intents.push({account:b,id:'bob-only',key:'bob-private-operation',status:'REVERTED'});await persist();});
 await assert.rejects(store.intentByKey(a,'bob-private-operation'),e=>e.status===404);
 await assert.rejects(store.intentByKey(a,key+'\' OR TRUE'),e=>e.status===400);
 const another=await openUserDatabase(opts);try{const worker=await createUserStore(another,{origin});assert.equal((await worker.intentByKey(a,key)).id,'alice-old');}finally{await another.close();}
});
