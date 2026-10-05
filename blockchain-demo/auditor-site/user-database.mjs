import fs from 'node:fs';
import path from 'node:path';
import {Pool} from 'pg';

export class ServiceError extends Error {
  constructor(message,status=503){super(message);this.status=status;}
}
// One bounded pool per process. No credentials or underlying SQL errors leave this boundary.
export async function openUserDatabase({moduleRoot,connectionString,filename,poolSize=12}={}) {
  if(!connectionString&&!filename&&moduleRoot){
    const config=path.join(moduleRoot,'runtime-site/user-database.json');
    if(fs.existsSync(config)){
      const st=fs.lstatSync(config);
      if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))throw new ServiceError('Private database configuration required');
      const value=JSON.parse(fs.readFileSync(config,'utf8'));
      if(value.driver!=='postgres'||typeof value.connectionString!=='string')throw new ServiceError('Invalid database configuration');
      connectionString=value.connectionString;
    }
  }
  connectionString=process.env.VIDRA_DATABASE_URL||connectionString;
  if(!Number.isInteger(poolSize)||poolSize<1||poolSize>32)throw new ServiceError('Invalid database pool size');
  let pool,sqlite,tail=Promise.resolve(),closed=false;
  const driver=connectionString?'postgres':'sqlite';
  if(process.env.VIDRA_REQUIRE_POSTGRES==='1'&&driver!=='postgres')throw new ServiceError('PostgreSQL is required; no fallback allowed');
  const guard=fn=>async(...args)=>{try{return await fn(...args);}catch(e){if(e instanceof ServiceError)throw e;throw new ServiceError('User database unavailable');}};
  if(driver==='postgres'){
    pool=new Pool({connectionString,max:poolSize,connectionTimeoutMillis:3000,idleTimeoutMillis:30000,statement_timeout:5000,lock_timeout:2000,application_name:'vidra-user-store'});
    pool.on('error',()=>{}); // Next operation still fails closed; never replace a failed DB with memory.
    const role=await pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
    if(role.rows[0]?.rolsuper||role.rows[0]?.rolbypassrls){await pool.end();throw new ServiceError('Application database role must not bypass row security');}
  }else{
    const {DatabaseSync}=await import('node:sqlite');
    filename=filename||path.join(moduleRoot,'runtime-site/users.sqlite');
    if(filename!==':memory:'){
      fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
      if(fs.existsSync(filename)&&(!fs.lstatSync(filename).isFile()||fs.lstatSync(filename).isSymbolicLink()))throw new ServiceError('Invalid database path');
    }
    sqlite=new DatabaseSync(filename,{timeout:1500});
    sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
    if(filename!==':memory:')fs.chmodSync(filename,0o600);
  }
  function sqlQuery(sql,values=[]){
    const args=[];const normalized=sql.replace(/\$(\d+)/g,(_m,n)=>{args.push(values[Number(n)-1]);return '?';});
    const rows=sqlite.prepare(normalized).all(...args);return {rows,rowCount:rows.length};
  }
  function serial(fn){const next=tail.then(fn);tail=next.catch(()=>{});return next;}
  const query=guard((sql,values=[])=>{
    if(closed)throw new ServiceError('User database unavailable');
    return driver==='postgres'?pool.query(sql,values):serial(()=>sqlQuery(sql,values));
  });
  const transaction=guard(async(fn)=>{
    if(closed)throw new ServiceError('User database unavailable');
    if(driver==='sqlite')return serial(async()=>{sqlite.exec('BEGIN IMMEDIATE');try{const out=await fn({query:async(sql,args)=>sqlQuery(sql,args),driver});sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}});
    const client=await pool.connect();
    try{await client.query('BEGIN');const out=await fn({query:(sql,args)=>client.query(sql,args),driver});await client.query('COMMIT');return out;}
    catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
    finally{client.release();}
  });
  async function now(client){const q=client?.query||query;const r=await q(driver==='postgres'?"SELECT floor(extract(epoch from clock_timestamp())*1000)::bigint AS value":"SELECT CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) AS value");return Number(r.rows[0].value);}
  return {driver,query,transaction,now,async owner(client,account){if(driver==='postgres')await client.query("SELECT set_config('vidra.wallet',$1,true)",[account]);},async close(){closed=true;if(pool)await pool.end();else{await tail;sqlite.close();}}};
}
