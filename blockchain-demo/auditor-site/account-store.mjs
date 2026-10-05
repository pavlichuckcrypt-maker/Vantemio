import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ServiceError} from './user-database.mjs';
import {sellerProduct} from './fulfillment.mjs';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),random=()=>crypto.randomBytes(32).toString('hex');
const uuid=t=>typeof t==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(t);
const validToken=t=>typeof t==='string'&&/^[a-f0-9]{64}$/.test(t);
const view=r=>({id:r.id,wallet:r.wallet,displayName:r.display_name,locale:r.locale,roles:{buyer:true,seller:!!Number(r.seller)},revision:Number(r.revision),createdAt:new Date(Number(r.created_at)).toISOString()});
export async function createAccountStore(db,{origin,users}){
  if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)||!users)throw new ServiceError('Local account origin required');
  await db.transaction(async c=>{
    if(db.driver==='postgres')await c.query('SELECT pg_advisory_xact_lock(1843284534)');
    for(const sql of fs.readFileSync(fileURLToPath(new URL('./account-schema.sql',import.meta.url)),'utf8').split(';').filter(s=>s.trim()))await c.query(sql);
    const columns=await c.query(db.driver==='postgres'?"SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='vidra_seller_assets'":'PRAGMA table_info(vidra_seller_assets)');
    if(!columns.rows.some(r=>r.name==='ready'))await c.query('ALTER TABLE vidra_seller_assets ADD COLUMN ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0,1))');
    if(db.driver==='postgres'){
      for(const table of ['vidra_seller_products','vidra_seller_assets','vidra_product_assets','vidra_published_offers','vidra_publication_reservations']){
        await c.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);await c.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
        const publicRead=table==='vidra_published_offers'?" OR current_setting('vidra.catalog',true)='public'":'';
        await c.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname=current_schema() AND tablename='${table}' AND policyname='member_owner') THEN CREATE POLICY member_owner ON ${table} USING (member_id=current_setting('vidra.member',true)${publicRead}) WITH CHECK (member_id=current_setting('vidra.member',true)); END IF; END $$`);
      }
    }
  });
  const tx=fn=>db.transaction(async c=>fn(c,await db.now(c)));
  async function memberOwner(c,id){if(db.driver==='postgres')await c.query("SELECT set_config('vidra.member',$1,true)",[id]);}
  async function lock(c,key){if(db.driver==='postgres')await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['member:'+key]);}
  async function walletMember(walletToken){
    const s=await users.session(walletToken),a=s.account.toLowerCase();
    return tx(async(c,time)=>{await lock(c,a);
      // A linked Google-first member keeps its ID; otherwise reuse the original wallet profile ID.
      const r=await c.query('INSERT INTO vidra_members(id,wallet,display_name,locale,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(wallet) DO UPDATE SET wallet=excluded.wallet RETURNING *',[s.user.id,a,s.user.displayName,s.user.locale,time]);return {...view(r.rows[0]),sessionExpires:s.expires};
    });
  }
  async function googleSession(token){
    if(!validToken(token))throw new ServiceError('Account sign-in required',401);
    return tx(async(c,time)=>{const r=await c.query('SELECT m.*,s.expires FROM vidra_member_sessions s JOIN vidra_members m ON m.id=s.member_id WHERE s.token_hash=$1 AND s.origin=$2 AND s.expires>$3',[hash(token),origin,time]);if(!r.rows.length)throw new ServiceError('Account sign-in required',401);return {...view(r.rows[0]),sessionExpires:Number(r.rows[0].expires)};});
  }
  async function resolve(auth){if(auth?.mode==='wallet')return walletMember(auth.walletToken);if(auth?.mode==='google')return googleSession(auth.googleToken);throw new ServiceError('Explicit account mode required',401);}
  async function requireActive(c,time,auth,id){
    let r;
    if(auth?.mode==='wallet'&&validToken(auth.walletToken))r=await c.query('SELECT m.id FROM vidra_sessions s JOIN vidra_members m ON m.wallet=s.account WHERE s.token_hash=$1 AND s.origin=$2 AND s.expires>$3 AND m.id=$4',[hash(auth.walletToken),origin,time,id]);
    else if(auth?.mode==='google'&&validToken(auth.googleToken))r=await c.query('SELECT member_id FROM vidra_member_sessions WHERE token_hash=$1 AND origin=$2 AND expires>$3 AND member_id=$4',[hash(auth.googleToken),origin,time,id]);
    if(!r?.rows.length)throw new ServiceError('Account sign-in required',401);
  }
  async function update(auth,input){
    if(!input||Object.keys(input).sort().join(',')!=='displayName,locale,revision,seller'||typeof input.displayName!=='string'||[...input.displayName].length>80||/[\p{Cc}\p{Cf}]/u.test(input.displayName)||!['ru','en'].includes(input.locale)||typeof input.seller!=='boolean'||!Number.isInteger(input.revision)||input.revision<0)throw new ServiceError('Invalid account profile',400);
    const m=await resolve(auth);return tx(async(c,time)=>{await requireActive(c,time,auth,m.id);await lock(c,m.id);
      const r=await c.query('UPDATE vidra_members SET display_name=$1,locale=$2,seller=$3,revision=revision+1 WHERE id=$4 AND revision=$5 RETURNING *',[input.displayName.trim(),input.locale,Number(input.seller),m.id,input.revision]);if(!r.rows.length)throw new ServiceError('Profile changed; refresh before saving',409);return view(r.rows[0]);});
  }
  async function products(auth){const m=await resolve(auth);return tx(async(c,time)=>{await requireActive(c,time,auth,m.id);await memberOwner(c,m.id);
    const r=await c.query('SELECT p.id,p.revision,p.status,p.payload,a.asset_id,o.offer_id,o.transaction_hash,r.operation_key FROM vidra_seller_products p LEFT JOIN vidra_product_assets a ON a.product_id=p.id AND a.member_id=p.member_id LEFT JOIN vidra_published_offers o ON o.product_id=p.id AND o.member_id=p.member_id LEFT JOIN vidra_publication_reservations r ON r.product_id=p.id AND r.member_id=p.member_id WHERE p.member_id=$1 ORDER BY p.created_at DESC,p.id',[m.id]);
    return r.rows.map(v=>({id:v.id,revision:Number(v.revision),status:v.offer_id?'PUBLISHED':v.operation_key?'RESERVED':v.status,assetId:v.asset_id||null,offerId:v.offer_id||null,publicationTx:v.transaction_hash||null,reservationKey:v.operation_key||null,...JSON.parse(v.payload)}));});}

  async function saveProduct(auth,{id,revision,product,...extra}){
    if(Object.keys(extra).length||typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)||!Number.isInteger(revision)||revision<0)throw new ServiceError('Invalid product command',400);
    const value=sellerProduct(product),m=await resolve(auth);
    return tx(async(c,time)=>{await requireActive(c,time,auth,m.id);await lock(c,m.id);await memberOwner(c,m.id);
      const role=await c.query('SELECT seller FROM vidra_members WHERE id=$1'+(db.driver==='postgres'?' FOR UPDATE':''),[m.id]);if(Number(role.rows[0]?.seller)!==1)throw new ServiceError('Seller profile required',403);
      await assertEditable(c,m,id);
      const count=await c.query('SELECT count(*) AS n FROM vidra_seller_products WHERE member_id=$1',[m.id]);
      let r;if(revision===0){if(Number(count.rows[0].n)>=100)throw new ServiceError('Seller draft limit reached',429);r=await c.query("INSERT INTO vidra_seller_products(id,member_id,revision,status,payload,created_at) VALUES($1,$2,1,'DRAFT',$3,$4) ON CONFLICT(id) DO NOTHING RETURNING id,revision,status",[id,m.id,JSON.stringify(value),time]);}
      else r=await c.query('UPDATE vidra_seller_products SET payload=$1,revision=revision+1 WHERE id=$2 AND member_id=$3 AND revision=$4 RETURNING id,revision,status',[JSON.stringify(value),id,m.id,revision]);
      if(!r.rows.length)throw new ServiceError('Product changed or unavailable',409);return {...r.rows[0],revision:Number(r.rows[0].revision),...value};
    });
  }
  async function assertEditable(c,m,id,key=null){
    const reservation=await c.query('SELECT operation_key FROM vidra_publication_reservations WHERE product_id=$1 AND member_id=$2',[id,m.id]);
    if(reservation.rows.length&&reservation.rows[0].operation_key!==key)throw new ServiceError('Product publication reserved; recover the same operation',409);
    const published=await c.query('SELECT product_id FROM vidra_published_offers WHERE product_id=$1 AND member_id=$2',[id,m.id]);if(published.rows.length)throw new ServiceError('Published terms are immutable; create another product',409);
    if(m.wallet){await db.owner(c,m.wallet);const pending=await c.query("SELECT payload FROM vidra_wallet_intents WHERE account=$1 AND status IN ('PREPARED','SUBMITTED')",[m.wallet]);
      if(pending.rows.some(r=>{const i=JSON.parse(r.payload);return i.action==='seller-publish'&&i.productId===id&&i.key!==key;}))throw new ServiceError('Product publication pending; reconcile the same operation',409);}
  }
  async function registerAsset(auth,input){
    const {id,sha256,bytes,mime,filename,...extra}=input||{};
    if(Object.keys(extra).length||!uuid(id)||!/^[a-f0-9]{64}$/.test(sha256||'')||!Number.isInteger(bytes)||bytes<1||bytes>67108864
      ||!['video/mp4','image/png','image/jpeg','application/pdf','application/zip','application/octet-stream','text/plain'].includes(mime)||typeof filename!=='string'||!/^[-a-zA-Z0-9_.]{1,100}$/.test(filename)||filename==='.'||filename==='..')throw new ServiceError('Invalid verified asset',400);
    const m=await resolve(auth);return tx(async(c,time)=>{await requireActive(c,time,auth,m.id);await lock(c,m.id);await memberOwner(c,m.id);
      const role=await c.query('SELECT seller FROM vidra_members WHERE id=$1',[m.id]);if(Number(role.rows[0]?.seller)!==1)throw new ServiceError('Seller profile required',403);
      const old=await c.query('SELECT * FROM vidra_seller_assets WHERE member_id=$1 AND sha256=$2',[m.id,sha256]);if(old.rows.length){if(Number(old.rows[0].bytes)!==bytes)throw new ServiceError('Asset fingerprint conflict',409);return assetView(old.rows[0]);}
      const usage=await c.query('SELECT count(*) AS n,COALESCE(sum(bytes),0) AS bytes FROM vidra_seller_assets WHERE member_id=$1',[m.id]);if(Number(usage.rows[0].n)>=20||Number(usage.rows[0].bytes)+bytes>1073741824)throw new ServiceError('Seller asset storage limit reached',429);
      const r=await c.query('INSERT INTO vidra_seller_assets(id,member_id,sha256,bytes,mime,filename,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[id,m.id,sha256,bytes,mime,filename,time]);return assetView(r.rows[0]);
    });
  }
  const assetView=r=>({id:r.id,memberId:r.member_id,sha256:r.sha256,bytes:Number(r.bytes),mime:r.mime,filename:r.filename,ready:!!Number(r.ready)});
  async function assets(auth){const m=await resolve(auth);return tx(async(c,time)=>{await requireActive(c,time,auth,m.id);await memberOwner(c,m.id);return (await c.query('SELECT * FROM vidra_seller_assets WHERE member_id=$1 ORDER BY created_at DESC,id',[m.id])).rows.map(assetView);});}
  async function assetForOwner(memberId,id){
    return db.transaction(async c=>{await memberOwner(c,memberId);const r=await c.query('SELECT * FROM vidra_seller_assets WHERE member_id=$1 AND id=$2',[memberId,id]);if(!r.rows.length)throw new ServiceError('Unknown seller asset',404);return assetView(r.rows[0]);});
  }
  // Internal storage boundary: call only after the bytes have been durably
  // written and verified. Clients cannot supply readiness or paths.
  async function markAssetReady(auth,id){
    if(!uuid(id))throw new ServiceError('Invalid asset ID',400);
    const m=await resolve(auth);return tx(async(c,time)=>{await requireActive(c,time,auth,m.id);await lock(c,m.id);await memberOwner(c,m.id);
      const role=await c.query('SELECT seller FROM vidra_members WHERE id=$1',[m.id]);if(Number(role.rows[0]?.seller)!==1)throw new ServiceError('Seller profile required',403);
      const r=await c.query('UPDATE vidra_seller_assets SET ready=1 WHERE id=$1 AND member_id=$2 RETURNING *',[id,m.id]);if(!r.rows.length)throw new ServiceError('Unknown seller asset',404);return assetView(r.rows[0]);
    });
  }
  async function attachAsset(auth,{productId,revision,assetId,...extra}){
    if(Object.keys(extra).length||!uuid(productId)||!uuid(assetId)||!Number.isInteger(revision)||revision<1)throw new ServiceError('Invalid asset command',400);
    const m=await resolve(auth);return tx(async(c,time)=>{await requireActive(c,time,auth,m.id);await lock(c,m.id);await memberOwner(c,m.id);
      const role=await c.query('SELECT seller FROM vidra_members WHERE id=$1',[m.id]);if(Number(role.rows[0]?.seller)!==1)throw new ServiceError('Seller profile required',403);await assertEditable(c,m,productId);
      const p=await c.query('SELECT * FROM vidra_seller_products WHERE id=$1 AND member_id=$2',[productId,m.id]),a=await c.query('SELECT id FROM vidra_seller_assets WHERE id=$1 AND member_id=$2 AND ready=1',[assetId,m.id]);
      if(!p.rows.length||!a.rows.length)throw new ServiceError('Product or asset unavailable',404);
      if(!['digital_instant','custom_digital'].includes(JSON.parse(p.rows[0].payload).fulfillment.kind))throw new ServiceError('Digital product required for file attachment',400);
      const changed=await c.query('UPDATE vidra_seller_products SET revision=revision+1 WHERE id=$1 AND member_id=$2 AND revision=$3 RETURNING revision',[productId,m.id,revision]);if(!changed.rows.length)throw new ServiceError('Product changed; refresh before attaching',409);
      await c.query('INSERT INTO vidra_product_assets(product_id,member_id,asset_id) VALUES($1,$2,$3) ON CONFLICT(product_id) DO UPDATE SET asset_id=excluded.asset_id WHERE vidra_product_assets.member_id=$2',[productId,m.id,assetId]);return {productId,revision:Number(changed.rows[0].revision),assetId};
    });
  }
  async function publicationSnapshot(auth,productId,revision,key=null){
    if(!uuid(productId)||!Number.isInteger(revision)||revision<1||key!==null&&!/^[a-zA-Z0-9-]{16,80}$/.test(key||''))throw new ServiceError('Invalid publication command',400);
    if(auth?.mode!=='wallet')throw new ServiceError('Wallet signature required to publish',401);
    const m=await resolve(auth);if(!m.roles.seller)throw new ServiceError('Seller profile required',403);
    return tx(async(c,time)=>{await requireActive(c,time,auth,m.id);await lock(c,m.id);await memberOwner(c,m.id);
      const role=await c.query('SELECT seller FROM vidra_members WHERE id=$1',[m.id]);if(Number(role.rows[0]?.seller)!==1)throw new ServiceError('Seller profile required',403);await assertEditable(c,m,productId,key);
      const r=await c.query('SELECT id,revision,payload FROM vidra_seller_products WHERE id=$1 AND member_id=$2',[productId,m.id]);if(!r.rows.length)throw new ServiceError('Unknown seller product',404);const v=r.rows[0];if(Number(v.revision)!==revision)throw new ServiceError('Product changed; refresh before publication',409);
      const a=await c.query('SELECT a.* FROM vidra_product_assets p JOIN vidra_seller_assets a ON a.id=p.asset_id WHERE p.product_id=$1 AND p.member_id=$2 AND a.member_id=$2 AND a.ready=1',[productId,m.id]);
      if(key){
        const reserved=await c.query('SELECT * FROM vidra_publication_reservations WHERE product_id=$1 AND member_id=$2',[productId,m.id]);
        if(reserved.rows.length&&(reserved.rows[0].wallet!==m.wallet||Number(reserved.rows[0].revision)!==revision))throw new ServiceError('Publication reservation changed',409);
        await c.query('INSERT INTO vidra_publication_reservations(product_id,member_id,wallet,revision,operation_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(product_id) DO NOTHING',[productId,m.id,m.wallet,revision,key]);
      }
      return {member:m,product:{id:v.id,revision:Number(v.revision),...JSON.parse(v.payload)},asset:a.rows.length?assetView(a.rows[0]):null};
    });
  }
  // Internal journal reconciliation only. No HTTP endpoint accepts these IDs,
  // receipts or publication payloads from a client as proof of publication.
  async function recordPublication({memberId,wallet,productId,revision,sellerId,offerId,transactionHash,blockNumber,payload}){
    if(!uuid(memberId)||!uuid(productId)||!/^0x[a-fA-F0-9]{40}$/.test(wallet||'')||!/^0x[a-fA-F0-9]{64}$/.test(transactionHash||'')||!Number.isSafeInteger(blockNumber)||blockNumber<1||!Number.isInteger(revision)||revision<1||!/^[1-9]\d{0,77}$/.test(String(sellerId))||!/^[1-9]\d{0,77}$/.test(String(offerId)))throw new ServiceError('Invalid confirmed publication',400);
    return tx(async c=>{await memberOwner(c,memberId);await lock(c,memberId);
      const m=await c.query('SELECT id FROM vidra_members WHERE id=$1 AND wallet=$2',[memberId,wallet.toLowerCase()]),p=await c.query('SELECT id,revision FROM vidra_seller_products WHERE id=$1 AND member_id=$2',[productId,memberId]);if(!m.rows.length||!p.rows.length)throw new ServiceError('Publication owner changed',403);
      if(Number(p.rows[0].revision)!==revision)throw new ServiceError('Publication product revision changed',409);
      const old=await c.query('SELECT offer_id,transaction_hash,payload FROM vidra_published_offers WHERE product_id=$1 AND member_id=$2',[productId,memberId]);const raw=JSON.stringify(payload);
      if(old.rows.length){if(old.rows[0].offer_id!==String(offerId)||old.rows[0].transaction_hash!==transactionHash.toLowerCase()||old.rows[0].payload!==raw)throw new ServiceError('Publication receipt conflict',409);return;}
      await c.query('INSERT INTO vidra_published_offers(product_id,member_id,wallet,offer_id,seller_id,revision,transaction_hash,block_number,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[productId,memberId,wallet.toLowerCase(),String(offerId),String(sellerId),revision,transactionHash.toLowerCase(),blockNumber,raw]);
      await c.query('DELETE FROM vidra_publication_reservations WHERE product_id=$1 AND member_id=$2',[productId,memberId]);
    });
  }
  async function cancelUnpreparedPublication(auth,{productId,key,...extra}){
    if(Object.keys(extra).length||!uuid(productId)||!/^[-a-zA-Z0-9]{16,80}$/.test(key||'')||auth?.mode!=='wallet')throw new ServiceError('Invalid publication reservation command',400);
    const m=await resolve(auth);return db.transaction(async c=>{const time=await db.now(c);await requireActive(c,time,auth,m.id);await lock(c,m.id);await memberOwner(c,m.id);await db.owner(c,m.wallet);
      const intent=await c.query('SELECT id FROM vidra_wallet_intents WHERE account=$1 AND operation_key=$2',[m.wallet,key]);if(intent.rows.length)throw new ServiceError('Use the wallet journal to reconcile this operation',409);
      const r=await c.query('DELETE FROM vidra_publication_reservations WHERE product_id=$1 AND member_id=$2 AND wallet=$3 AND operation_key=$4 RETURNING product_id',[productId,m.id,m.wallet,key]);if(!r.rows.length)throw new ServiceError('Unknown publication reservation',404);return {productId,cancelled:true};
    });
  }
  async function releasePublication(account,key){
    // A reservation can be released only with a durable terminal journal entry.
    return db.transaction(async c=>{await db.owner(c,account.toLowerCase());
      const m=await c.query('SELECT id FROM vidra_members WHERE wallet=$1',[account.toLowerCase()]);if(!m.rows.length)return;
      await lock(c,m.rows[0].id);await memberOwner(c,m.rows[0].id);
      const r=await c.query('SELECT payload,status FROM vidra_wallet_intents WHERE account=$1 AND operation_key=$2',[account.toLowerCase(),key]);
      if(!r.rows.length||!['CANCELLED','REVERTED','SUPERSEDED','CONFIRMED'].includes(r.rows[0].status))throw new ServiceError('Publication journal is not terminal',409);
      await c.query('DELETE FROM vidra_publication_reservations WHERE member_id=$1 AND wallet=$2 AND operation_key=$3',[m.rows[0].id,account.toLowerCase(),key]);
    });
  }
  async function published(productId=null){return db.transaction(async c=>{
    if(db.driver==='postgres')await c.query("SELECT set_config('vidra.catalog','public',true)");
    const r=await c.query('SELECT payload FROM vidra_published_offers'+(productId?' WHERE product_id=$1':'')+' ORDER BY block_number DESC,product_id LIMIT 100',productId?[productId]:[]);return r.rows.map(r=>JSON.parse(r.payload));
  });}
  async function issueGoogleFlow({browserToken,walletToken=null}){
    if(!validToken(browserToken))throw new ServiceError('Invalid browser flow',400);
    const s=walletToken?await users.session(walletToken):null;
    return tx(async(c,time)=>{await c.query('DELETE FROM vidra_google_flows WHERE expires<=$1',[time]);const nonce=random();
      await c.query('INSERT INTO vidra_google_flows(nonce,browser_hash,origin,wallet_session_hash,expires) VALUES($1,$2,$3,$4,$5)',[nonce,hash(browserToken),origin,s?.sessionHash||null,time+120000]);return {nonce,expires:time+120000};});
  }
  async function consumeGoogleFlow(nonce,browserToken){
    if(!validToken(nonce)||!validToken(browserToken))throw new ServiceError('Google flow expired or invalid',401);
    return tx(async(c,time)=>{const r=await c.query('DELETE FROM vidra_google_flows WHERE nonce=$1 AND browser_hash=$2 AND origin=$3 RETURNING *',[nonce,hash(browserToken),origin]);const f=r.rows[0];if(!f||Number(f.expires)<=time)throw new ServiceError('Google flow expired or invalid',401);return {walletSessionHash:f.wallet_session_hash};});
  }
  async function finishGoogle(flow,{subject}){
    if(typeof subject!=='string'||!/^[A-Za-z0-9_-]{1,255}$/.test(subject))throw new ServiceError('Invalid Google subject',401);
    const subjectHash=hash('google:'+subject);
    return tx(async(c,time)=>{await lock(c,subjectHash);let m;
      const identity=await c.query('SELECT m.* FROM vidra_google_identities i JOIN vidra_members m ON m.id=i.member_id WHERE i.subject_hash=$1',[subjectHash]);
      if(flow.walletSessionHash){
        const s=await c.query('SELECT s.account,u.* FROM vidra_sessions s JOIN vidra_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.origin=$2 AND s.expires>$3',[flow.walletSessionHash,origin,time]);if(!s.rows.length)throw new ServiceError('Wallet signature expired; link again',401);
        const u=s.rows[0];await lock(c,u.account);
        m=(await c.query('INSERT INTO vidra_members(id,wallet,display_name,locale,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(wallet) DO UPDATE SET wallet=excluded.wallet RETURNING *',[u.id,u.account,u.display_name,u.locale,time])).rows[0];
        if(identity.rows.length&&identity.rows[0].id!==m.id)throw new ServiceError('Google identity belongs to another profile; automatic merging is disabled',409);
      }else m=identity.rows[0];
      if(!m)m=(await c.query('INSERT INTO vidra_members(id,created_at) VALUES($1,$2) RETURNING *',[crypto.randomUUID(),time])).rows[0];
      const linked=await c.query('SELECT subject_hash FROM vidra_google_identities WHERE member_id=$1',[m.id]);if(linked.rows.length&&linked.rows[0].subject_hash!==subjectHash)throw new ServiceError('Profile already has another Google identity',409);
      await c.query('INSERT INTO vidra_google_identities(subject_hash,member_id) VALUES($1,$2) ON CONFLICT(subject_hash) DO NOTHING',[subjectHash,m.id]);
      await c.query('DELETE FROM vidra_member_sessions WHERE member_id=$1 AND expires<=$2',[m.id,time]);
      const count=await c.query('SELECT count(*) AS n FROM vidra_member_sessions WHERE member_id=$1',[m.id]);if(Number(count.rows[0].n)>=10)throw new ServiceError('Account session limit',429);
      const token=random(),expires=time+600000;await c.query('INSERT INTO vidra_member_sessions(token_hash,member_id,origin,expires) VALUES($1,$2,$3,$4)',[hash(token),m.id,origin,expires]);return {token,expires,member:view(m)};
    });
  }
  async function linkWallet(auth,walletToken){
    if(auth.mode!=='google')throw new ServiceError('Google account sign-in required',401);
    const m=await resolve(auth),s=await users.session(walletToken),a=s.account.toLowerCase();
    return tx(async(c,time)=>{await requireActive(c,time,auth,m.id);await lock(c,a);
      const current=await c.query('SELECT account FROM vidra_sessions WHERE token_hash=$1 AND origin=$2 AND expires>$3',[s.sessionHash,origin,time]);if(!current.rows.length)throw new ServiceError('Wallet signature expired; link again',401);
      const other=await c.query('SELECT id FROM vidra_members WHERE wallet=$1',[a]);if(other.rows.length&&other.rows[0].id!==m.id)throw new ServiceError('Wallet belongs to another profile; automatic merging is disabled',409);
      const r=await c.query('UPDATE vidra_members SET wallet=$1,revision=revision+1 WHERE id=$2 AND (wallet IS NULL OR wallet=$1) RETURNING *',[a,m.id]);if(!r.rows.length)throw new ServiceError('Profile already has another wallet',409);return view(r.rows[0]);
    });
  }
  async function logout(token){if(validToken(token))await db.query('DELETE FROM vidra_member_sessions WHERE token_hash=$1 AND origin=$2',[hash(token),origin]);}
  async function sweep(){return tx(async(c,time)=>{for(const table of ['vidra_member_sessions','vidra_google_flows'])await c.query(`DELETE FROM ${table} WHERE expires<=$1`,[time]);});}
  return {resolve,update,products,saveProduct,registerAsset,assets,assetForOwner,markAssetReady,attachAsset,publicationSnapshot,recordPublication,cancelUnpreparedPublication,releasePublication,published,issueGoogleFlow,consumeGoogleFlow,finishGoogle,linkWallet,logout,sweep};
}
