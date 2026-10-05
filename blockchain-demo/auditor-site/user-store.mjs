import fs from 'node:fs';
import crypto from 'node:crypto';
import {getAddress} from 'ethers';
import {fileURLToPath} from 'node:url';
import {ServiceError} from './user-database.mjs';
const wallet=a=>getAddress(a).toLowerCase();
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const random=()=>crypto.randomBytes(32).toString('hex');
const profile=r=>({id:r.id,account:getAddress(r.account),chainId:r.chain_id,displayName:r.display_name,locale:r.locale,revision:r.revision,createdAt:new Date(Number(r.created_at)).toISOString()});
export async function createUserStore(db,{origin}={}){
  if(typeof origin!=='string'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw new ServiceError('Local Base Sepolia origin required');
  await db.transaction(async c=>{
    if(db.driver==='postgres')await c.query('SELECT pg_advisory_xact_lock(1843284532)');
    for(const sql of fs.readFileSync(fileURLToPath(new URL('./user-schema.sql',import.meta.url)),'utf8').split(';').filter(v=>v.trim()))await c.query(sql);
    if(db.driver==='postgres')for(const table of ['vidra_wallet_intents','vidra_wallet_orders']){
      await c.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);await c.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await c.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname=current_schema() AND tablename='${table}' AND policyname='wallet_owner') THEN CREATE POLICY wallet_owner ON ${table} USING (account=current_setting('vidra.wallet',true)) WITH CHECK (account=current_setting('vidra.wallet',true)); END IF; END $$`);
    }
    await c.query("INSERT INTO vidra_meta(key,value) VALUES('schema_version','1') ON CONFLICT(key) DO NOTHING");
    const version=await c.query("SELECT value FROM vidra_meta WHERE key='schema_version'");if(version.rows[0]?.value!=='1')throw new ServiceError('Unsupported user database schema');
  });
  async function tx(fn){return db.transaction(async c=>fn(c,await db.now(c)));}
  async function meta(key){const r=await db.query('INSERT INTO vidra_meta(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=vidra_meta.value RETURNING value',[key,random()]);return r.rows[0].value;}
  const csrf=await meta('csrf:'+origin);
  async function ensure(c,a,time,authenticated=false){
    const r=await c.query('INSERT INTO vidra_users(id,chain_id,account,created_at,last_auth_at) VALUES($1,84532,$2,$3,$4) ON CONFLICT(account) DO UPDATE SET last_auth_at=COALESCE(excluded.last_auth_at,vidra_users.last_auth_at) RETURNING *',[crypto.randomUUID(),a,time,authenticated?time:null]);return r.rows[0];
  }
  async function rateLimit(key,max=60,period=60000){
    if(typeof key!=='string'||key.length>200)throw new ServiceError('Invalid rate key',400);
    return tx(async(c,time)=>{const r=await c.query('INSERT INTO vidra_rate_limits(key,window_at,count) VALUES($1,$2,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN vidra_rate_limits.window_at<=$3 THEN 1 ELSE vidra_rate_limits.count+1 END, window_at=CASE WHEN vidra_rate_limits.window_at<=$3 THEN $2 ELSE vidra_rate_limits.window_at END RETURNING count',[digest(origin+key),time,time-period]);if(r.rows[0].count>max)throw new ServiceError('Request limit exceeded; retry later',429);});
  }
  async function issueChallenge({id,account,message,expires}){
    const a=wallet(account);return tx(async(c,time)=>{
      if(db.driver==='postgres')await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['challenge:'+a]);
      await c.query('DELETE FROM vidra_challenges WHERE account=$1 AND expires<=$2',[a,time]);
      const n=await c.query('SELECT count(*) AS n FROM vidra_challenges WHERE account=$1',[a]);if(Number(n.rows[0].n)>=4)throw new ServiceError('Too many pending proofs for this wallet',429);
      if(expires<=time||expires>time+125000)throw new ServiceError('Invalid challenge expiry',400);
      await c.query('INSERT INTO vidra_challenges(id,account,origin,message,expires) VALUES($1,$2,$3,$4,$5)',[id,a,origin,message,expires]);
    });
  }
  async function consumeChallenge(id){
    if(typeof id!=='string'||!/^[a-f0-9]{48}$/.test(id))throw new ServiceError('Proof expired, unknown or already used',401);
    return tx(async(c,time)=>{const r=await c.query('DELETE FROM vidra_challenges WHERE id=$1 AND origin=$2 RETURNING *',[id,origin]);const v=r.rows[0];return v&&Number(v.expires)>time?{account:getAddress(v.account),message:v.message}:null;});
  }
  async function createSession(account,previousToken){
    const a=wallet(account);return tx(async(c,time)=>{
      const u=await ensure(c,a,time,true);
      if(typeof previousToken==='string'&&/^[a-f0-9]{64}$/.test(previousToken))await c.query('DELETE FROM vidra_sessions WHERE token_hash=$1 AND origin=$2',[digest(previousToken),origin]);
      await c.query('DELETE FROM vidra_sessions WHERE account=$1 AND expires<=$2',[a,time]);
      const n=await c.query('SELECT count(*) AS n FROM vidra_sessions WHERE account=$1',[a]);if(Number(n.rows[0].n)>=10)throw new ServiceError('Session limit for this wallet',429);
      const token=random(),expires=time+600000;
      await c.query('INSERT INTO vidra_sessions(token_hash,user_id,account,origin,expires,created_at) VALUES($1,$2,$3,$4,$5,$6)',[digest(token),u.id,a,origin,expires,time]);
      return {token,account:getAddress(a),user:profile(u),expires};
    });
  }
  async function session(token){
    if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new ServiceError('Wallet ownership signature required',401);
    return tx(async(c,time)=>{const r=await c.query('SELECT s.token_hash,s.expires,u.* FROM vidra_sessions s JOIN vidra_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.origin=$2 AND s.expires>$3',[digest(token),origin,time]);const v=r.rows[0];if(!v||v.account===undefined)throw new ServiceError('Wallet ownership signature required',401);return {account:getAddress(v.account),expires:Number(v.expires),sessionHash:v.token_hash,user:profile(v)};});
  }
  async function logout(token){if(typeof token==='string'&&/^[a-f0-9]{64}$/.test(token))await db.query('DELETE FROM vidra_sessions WHERE token_hash=$1 AND origin=$2',[digest(token),origin]);}
  async function updateProfile(token,input){
    if(!input||Object.keys(input).sort().join(',')!=='displayName,locale,revision'||typeof input.displayName!=='string'||[...input.displayName].length>80||/[\p{Cc}\p{Cf}]/u.test(input.displayName)||!['ru','en'].includes(input.locale)||!Number.isInteger(input.revision)||input.revision<0)throw new ServiceError('Invalid profile fields',400);
    const s=await session(token);
    return tx(async(c,time)=>{const active=await c.query('SELECT user_id FROM vidra_sessions WHERE token_hash=$1 AND expires>$2 AND origin=$3',[s.sessionHash,time,origin]);if(!active.rows.length)throw new ServiceError('Wallet ownership signature required',401);
      const r=await c.query('UPDATE vidra_users SET display_name=$1,locale=$2,revision=revision+1 WHERE id=$3 AND account=$4 AND revision=$5 RETURNING *',[input.displayName.trim(),input.locale,s.user.id,wallet(s.account),input.revision]);if(!r.rows[0])throw new ServiceError('Profile changed; refresh before saving',409);return profile(r.rows[0]);});
  }
  async function issueGrant(s,{exchangeId,sha256}){
    if(!/^\d{1,78}$/.test(String(exchangeId))||!/^[a-f0-9]{64}$/.test(sha256||''))throw new ServiceError('Invalid delivery binding',400);
    return tx(async(c,time)=>{const active=await c.query('SELECT user_id FROM vidra_sessions WHERE token_hash=$1 AND account=$2 AND origin=$3 AND expires>$4'+(db.driver==='postgres'?' FOR UPDATE':''),[s.sessionHash,wallet(s.account),origin,time]);if(!active.rows.length)throw new ServiceError('Wallet ownership signature required',401);
      await c.query('DELETE FROM vidra_grants WHERE session_hash=$1 AND expires<=$2',[s.sessionHash,time]);
      const n=await c.query('SELECT count(*) AS n FROM vidra_grants WHERE session_hash=$1',[s.sessionHash]);if(Number(n.rows[0].n)>=4)throw new ServiceError('Delivery limit for this session',429);
      const token=random(),expires=time+60000;await c.query('INSERT INTO vidra_grants(token_hash,session_hash,account,exchange_id,sha256,expires) VALUES($1,$2,$3,$4,$5,$6)',[digest(token),s.sessionHash,wallet(s.account),String(exchangeId),sha256,expires]);return {token,sha256,expires};
    });
  }
  async function consumeGrant(s,token){
    if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new ServiceError('Invalid grant',403);
    return tx(async(c,time)=>{const active=await c.query('SELECT user_id FROM vidra_sessions WHERE token_hash=$1 AND account=$2 AND origin=$3 AND expires>$4'+(db.driver==='postgres'?' FOR UPDATE':''),[s.sessionHash,wallet(s.account),origin,time]);if(!active.rows.length)throw new ServiceError('Wallet ownership signature required',401);
      const r=await c.query('DELETE FROM vidra_grants WHERE token_hash=$1 AND session_hash=$2 AND account=$3 AND expires>$4 RETURNING *',[digest(token),s.sessionHash,wallet(s.account),time]);if(!r.rows[0])throw new ServiceError('Grant expired or buyer changed',403);return {exchangeId:r.rows[0].exchange_id,sha256:r.rows[0].sha256};});
  }
  async function ledger(account){const a=wallet(account);return db.transaction(async c=>{await db.owner(c,a);const [i,o]=await Promise.all([c.query('SELECT payload FROM vidra_wallet_intents WHERE account=$1 ORDER BY id',[a]),c.query('SELECT payload FROM vidra_wallet_orders WHERE account=$1 ORDER BY length(exchange_id),exchange_id',[a])]);return {intents:i.rows.map(r=>JSON.parse(r.payload)),orders:o.rows.map(r=>JSON.parse(r.payload))};});}
  async function intentByKey(account,key){
    const a=wallet(account);if(typeof key!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(key))throw new ServiceError('Invalid recovery key',400);
    return db.transaction(async c=>{await db.owner(c,a);const r=await c.query('SELECT payload FROM vidra_wallet_intents WHERE account=$1 AND operation_key=$2',[a,key]);
      if(!r.rows.length)throw new ServiceError('Unknown wallet intent',404);const i=JSON.parse(r.rows[0].payload);
      if(wallet(i.account)!==a||i.key!==key)throw new ServiceError('Recovery ownership mismatch',403);return i;
    });
  }
  async function saveLedger(account,value,lock){
    const a=wallet(account);return tx(async(c,time)=>{
      await db.owner(c,a);
      const fence=await c.query('SELECT token FROM vidra_wallet_locks WHERE account=$1 AND token=$2 AND expires>$3'+(db.driver==='postgres'?' FOR UPDATE':''),[a,lock,time]);if(!fence.rows.length)throw new ServiceError('Wallet operation lease lost',409);
      for(const i of value.intents){if(wallet(i.account)!==a)throw new ServiceError('Wrong wallet owner',403);const r=await c.query('INSERT INTO vidra_wallet_intents(id,account,operation_key,status,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload WHERE vidra_wallet_intents.account=$2 AND vidra_wallet_intents.operation_key=$3 RETURNING id',[i.id,a,i.key,i.status,JSON.stringify(i)]);if(!r.rows.length)throw new ServiceError('Intent ownership conflict',409);}
      for(const o of value.orders){if(wallet(o.account)!==a)throw new ServiceError('Wrong wallet owner',403);const r=await c.query('INSERT INTO vidra_wallet_orders(exchange_id,account,payload) VALUES($1,$2,$3) ON CONFLICT(exchange_id) DO UPDATE SET payload=excluded.payload WHERE vidra_wallet_orders.account=$2 RETURNING exchange_id',[String(o.exchangeId),a,JSON.stringify(o)]);if(!r.rows.length)throw new ServiceError('Order ownership conflict',409);}
    });
  }
  async function exclusive(account,fn){
    const a=wallet(account),token=random();
    const acquired=await tx(async(c,time)=>c.query('INSERT INTO vidra_wallet_locks(account,token,expires) VALUES($1,$2,$3) ON CONFLICT(account) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE vidra_wallet_locks.expires<=$4 RETURNING token',[a,token,time+90000,time]));
    if(!acquired.rows.length)throw new ServiceError('Wallet operation already active',409);
    let lost=false,renewing=false;
    const timer=setInterval(async()=>{if(renewing)return;renewing=true;try{const r=await tx(async(c,time)=>c.query('UPDATE vidra_wallet_locks SET expires=$1 WHERE account=$2 AND token=$3 AND expires>$4 RETURNING token',[time+90000,a,token,time]));if(!r.rows.length)lost=true;}catch{lost=true;}finally{renewing=false;}},15000);timer.unref();
    try{const data=await ledger(a);const persist=()=>{if(lost)throw new ServiceError('Wallet operation lease lost',409);return saveLedger(a,data,token);};const out=await fn(getAddress(a),data,persist);if(lost)throw new ServiceError('Wallet operation lease lost',409);return out;}
    finally{clearInterval(timer);await db.query('DELETE FROM vidra_wallet_locks WHERE account=$1 AND token=$2',[a,token]).catch(()=>{});}
  }
  async function withMarketCapacity(lane,fn){
    if(!['checkout','read'].includes(lane)||typeof fn!=='function')throw new ServiceError('Invalid market capacity',400);
    const token=random(),limit=lane==='checkout'?8:4;
    const slot=await tx(async(c,time)=>{
      if(db.driver==='postgres')await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['market-capacity:'+lane]);
      await c.query('DELETE FROM vidra_market_capacity WHERE lane=$1 AND expires<=$2',[lane,time]);
      const used=new Set((await c.query('SELECT slot FROM vidra_market_capacity WHERE lane=$1',[lane])).rows.map(r=>Number(r.slot)));
      const free=Array.from({length:limit},(_,i)=>i).find(i=>!used.has(i));
      if(free===undefined)throw new ServiceError('Shared market capacity busy; retry the same request later',503);
      await c.query('INSERT INTO vidra_market_capacity(lane,slot,token,expires) VALUES($1,$2,$3,$4)',[lane,free,token,time+90000]);return free;
    });
    let lost=false,renewing=false;
    const timer=setInterval(async()=>{if(renewing)return;renewing=true;try{const r=await tx(async(c,time)=>c.query('UPDATE vidra_market_capacity SET expires=$1 WHERE lane=$2 AND slot=$3 AND token=$4 AND expires>$5 RETURNING slot',[time+90000,lane,slot,token,time]));if(!r.rows.length)lost=true;}catch{lost=true;}finally{renewing=false;}},15000);timer.unref();
    try{const result=await fn();if(lost)throw new ServiceError('Market capacity lease lost; reconcile the same intent',503);return result;}
    finally{clearInterval(timer);await db.query('DELETE FROM vidra_market_capacity WHERE lane=$1 AND slot=$2 AND token=$3',[lane,slot,token]).catch(()=>{});}
  }
  async function importLegacy(value){
    if(!value||value.schemaVersion!==1||!Array.isArray(value.intents)||!Array.isArray(value.orders))throw new ServiceError('Invalid legacy wallet ledger');
    const marker='legacy-wallet-ledger-v1',hash=digest(JSON.stringify(value));
    // All owners and the marker commit together. Competing workers never see a partial migration.
    return db.transaction(async c=>{
      if(db.driver==='postgres')await c.query('SELECT pg_advisory_xact_lock(1843284533)');
      const done=await c.query('SELECT value FROM vidra_meta WHERE key=$1',[marker]);
      if(done.rows.length){if(done.rows[0].value!==hash)throw new ServiceError('Legacy wallet ledger changed after import');return;}
      const accounts=new Set([...value.intents,...value.orders].map(v=>wallet(v.account)));
      for(const a of accounts){
        await db.owner(c,a);
        const existing=await c.query('SELECT id FROM vidra_wallet_intents WHERE account=$1 UNION ALL SELECT exchange_id FROM vidra_wallet_orders WHERE account=$1',[a]);
        if(existing.rows.length)throw new ServiceError('Refuse legacy import over existing wallet data');
        for(const i of value.intents.filter(i=>wallet(i.account)===a))await c.query('INSERT INTO vidra_wallet_intents(id,account,operation_key,status,payload) VALUES($1,$2,$3,$4,$5)',[i.id,a,i.key,i.status,JSON.stringify(i)]);
        for(const o of value.orders.filter(o=>wallet(o.account)===a))await c.query('INSERT INTO vidra_wallet_orders(exchange_id,account,payload) VALUES($1,$2,$3)',[String(o.exchangeId),a,JSON.stringify(o)]);
      }
      await c.query('INSERT INTO vidra_meta(key,value) VALUES($1,$2)',[marker,hash]);
    });
  }
  async function sweep(){return tx(async(c,time)=>{for(const table of ['vidra_grants','vidra_sessions','vidra_challenges'])await c.query(`DELETE FROM ${table} WHERE expires<=$1`,[time]);await c.query('DELETE FROM vidra_rate_limits WHERE window_at<$1',[time-3600000]);});}
  return {csrf,driver:db.driver,rateLimit,issueChallenge,consumeChallenge,createSession,session,logout,updateProfile,issueGrant,consumeGrant,ledger,intentByKey,exclusive,withMarketCapacity,importLegacy,sweep};
}
