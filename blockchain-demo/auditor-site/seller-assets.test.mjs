import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';
import {openUserDatabase} from './user-database.mjs';import {createUserStore} from './user-store.mjs';import {createAccountStore} from './account-store.mjs';import {createSellerAssetStorage} from './seller-assets.mjs';
const driver=process.env.VIDRA_TEST_DATABASE_URL?'postgres':'sqlite';
async function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vidra-seller-assets-'));fs.mkdirSync(path.join(root,'runtime-site'),{mode:0o700});
 const db=await openUserDatabase(driver==='postgres'?{connectionString:process.env.VIDRA_TEST_DATABASE_URL}:{filename:':memory:'});
 try{const users=await createUserStore(db,{origin:'http://127.0.0.1:18443'}),accounts=await createAccountStore(db,{origin:'http://127.0.0.1:18443',users}),storage=createSellerAssetStorage(root,accounts);
  if(driver==='postgres')await db.query('TRUNCATE vidra_members,vidra_users CASCADE');
  const aa={mode:'wallet',walletToken:(await users.createSession('0x'+'ab'.repeat(20))).token},bb={mode:'wallet',walletToken:(await users.createSession('0x'+'cd'.repeat(20))).token};
  for(const auth of [aa,bb])await accounts.update(auth,{displayName:'Seller',locale:'en',seller:true,revision:0});
  await fn({db,users,accounts,storage,aa,bb,root});
 }finally{await db.close();fs.rmSync(root,{recursive:true,force:true});}
}
const body={title:'Ready resource',description:'Private file access',price:'25',quantity:1,fulfillment:{kind:'digital_instant',days:0}};
test(`${driver}: files become ready only after durable private storage and remain owner scoped`,()=>fixture(async({accounts,storage,aa,bb})=>{
 const bytes=Buffer.from('private purchased content'),a=await storage.upload(aa,{bytes,mime:'text/plain',filename:'content.txt'});
 assert.equal(a.ready,true);assert.deepEqual(storage.verified(a).bytes,bytes);assert.equal(fs.statSync(storage.verified(a).file).mode&0o777,0o600);
 assert.equal((await accounts.assets(bb)).length,0);await assert.rejects(accounts.assetForOwner((await accounts.resolve(bb)).id,a.id),e=>e.status===404);
 const id=crypto.randomUUID();await accounts.saveProduct(aa,{id,revision:0,product:body});
 await assert.rejects(accounts.attachAsset(bb,{productId:id,revision:1,assetId:a.id}),e=>e.status===404);
 const attached=await accounts.attachAsset(aa,{productId:id,revision:1,assetId:a.id});assert.equal(attached.revision,2);
 assert.equal((await accounts.publicationSnapshot(aa,id,2)).asset.sha256,a.sha256);
 assert.deepEqual(await accounts.published(),[]);
}));
test(`${driver}: unready reservations, path injection, removed roles and stale revisions fail closed`,()=>fixture(async({accounts,storage,aa})=>{
 const id=crypto.randomUUID(),sha256='a'.repeat(64);await accounts.saveProduct(aa,{id,revision:0,product:body});
 const reserved=await accounts.registerAsset(aa,{id:crypto.randomUUID(),sha256,bytes:12,mime:'text/plain',filename:'x.txt'});assert.equal(reserved.ready,false);
 await assert.rejects(accounts.attachAsset(aa,{productId:id,revision:1,assetId:reserved.id}),e=>e.status===404);
 assert.throws(()=>storage.verified(reserved),e=>e.status===409);
 for(const filename of ['../x','..','x\r\nHeader:value','x/y'])await assert.rejects(storage.upload(aa,{bytes:Buffer.from(filename),mime:'text/plain',filename}),e=>e.status===400);
 const a=await storage.upload(aa,{bytes:Buffer.from('valid'),mime:'text/plain',filename:'valid.txt'});
 await accounts.attachAsset(aa,{productId:id,revision:1,assetId:a.id});await assert.rejects(accounts.publicationSnapshot(aa,id,1),e=>e.status===409);
 await accounts.update(aa,{displayName:'Buyer',locale:'en',seller:false,revision:1});
 await assert.rejects(accounts.attachAsset(aa,{productId:id,revision:2,assetId:a.id}),e=>e.status===403);await assert.rejects(accounts.publicationSnapshot(aa,id,2),e=>e.status===403);
}));
test(`${driver}: concurrent same-content uploads reuse one asset; mutation and symlinks cannot replace paid bytes`,()=>fixture(async({accounts,storage,aa,root})=>{
 const bytes=Buffer.from('same content'),results=await Promise.all(Array.from({length:5},()=>storage.upload(aa,{bytes,mime:'text/plain',filename:'x.txt'})));assert.equal(new Set(results.map(a=>a.id)).size,1);assert.equal((await accounts.assets(aa)).length,1);
 const a=results[0],file=storage.verified(a).file;fs.writeFileSync(file,'corrupt',{mode:0o600});
 assert.throws(()=>storage.verified(a));await assert.rejects(storage.upload(aa,{bytes,mime:'text/plain',filename:'x.txt'}));assert.equal(fs.readFileSync(file,'utf8'),'corrupt');
 fs.unlinkSync(file);const target=path.join(root,'external-private.txt');fs.writeFileSync(target,bytes,{mode:0o600});fs.symlinkSync(target,file);assert.throws(()=>storage.verified(a));await assert.rejects(storage.upload(aa,{bytes,mime:'text/plain',filename:'x.txt'}));assert.equal(fs.readFileSync(target,'utf8'),'same content');
}));
