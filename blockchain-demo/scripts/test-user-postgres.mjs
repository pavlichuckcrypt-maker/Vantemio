// Isolated schema in the local test DB. Never truncate the live application schema.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {Pool} from 'pg';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),dir=path.join(root,'runtime-site');
const config=JSON.parse(fs.readFileSync(path.join(dir,'user-database.json'),'utf8')),secret=JSON.parse(fs.readFileSync(path.join(dir,'postgres-local-private.json'),'utf8'));
const app=new URL(config.connectionString),adminURL=new URL(app);adminURL.username='vidra_admin';adminURL.password=secret.admin;
const admin=new Pool({connectionString:String(adminURL),max:1}),schema='vidra_test_'+crypto.randomBytes(8).toString('hex');
let code=1;
try{await admin.query(`CREATE SCHEMA ${schema} AUTHORIZATION vidra_app`);app.searchParams.set('options','-c search_path='+schema);
 const child=spawn(process.execPath,['--test','--test-concurrency=1',path.join(root,'auditor-site/account-store.test.mjs'),path.join(root,'auditor-site/seller-assets.test.mjs'),path.join(root,'auditor-site/user-store.test.mjs'),path.join(root,'auditor-site/user-http.test.mjs')],{cwd:root,stdio:'inherit',env:{...process.env,VIDRA_DATABASE_URL:'',VIDRA_TEST_DATABASE_URL:String(app),VIDRA_USER_TEST_REPORT:process.env.VIDRA_USER_TEST_REPORT||path.join(dir,'MULTIUSER_POSTGRES_HTTP_VERIFICATION.json')}});
 code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',value=>resolve(value??1));});
}finally{await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
process.exitCode=code;
