import fs from 'node:fs';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {setTimeout as delay} from 'node:timers/promises';import {openUserDatabase} from './user-database.mjs';
const execute=promisify(execFile);
// Recovery is limited to this app's private, known loopback PostgreSQL installation.
export async function ensureUserDatabase(moduleRoot){
 if(process.env.VIDRA_USER_DATABASE_FILE)return;
 const config=path.join(moduleRoot,'runtime-site/user-database.json');if(!fs.existsSync(config)&&!process.env.VIDRA_DATABASE_URL)return;
 async function ready(){let db;try{db=await openUserDatabase({moduleRoot});await db.query('SELECT 1');return true;}catch{return false;}finally{await db?.close().catch(()=>{});}}
 if(await ready())return;
 if(process.env.VIDRA_DATABASE_URL)throw Error('Configured user database unavailable; startup withheld');
 const st=fs.lstatSync(config);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))throw Error('Private database configuration required');
 const value=JSON.parse(fs.readFileSync(config,'utf8')),url=new URL(value.connectionString);
 if(value.driver!=='postgres'||url.hostname!=='127.0.0.1'||url.port!=='18432'||url.username!=='vidra_app'||url.pathname!=='/vidra_users')throw Error('Unknown database installation; automatic recovery withheld');
 let dockerReady=false;
 try{await execute('docker',['info','--format','{{.ServerVersion}}'],{timeout:3000});dockerReady=true;}catch{}
 if(!dockerReady&&process.platform==='darwin'){
  await execute('open',['-a','Docker'],{timeout:5000});
  for(const deadline=Date.now()+60000;Date.now()<deadline;){try{await execute('docker',['info','--format','{{.ServerVersion}}'],{timeout:3000});dockerReady=true;break;}catch{await delay(1000);}}
 }
 if(!dockerReady)throw Error('Docker unavailable; user database startup withheld');
 try{await execute(process.execPath,[path.join(moduleRoot,'scripts/start-user-database.mjs')],{cwd:moduleRoot,timeout:60000,maxBuffer:65536});}catch{throw Error('Local user database recovery failed; no credentials printed');}
 if(!await ready())throw Error('User database recovery not confirmed');
}
