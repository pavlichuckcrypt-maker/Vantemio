// Local PostgreSQL for this demo only; never prints configuration or credentials.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';import {Client} from 'pg';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),dir=path.join(root,'runtime-site');fs.mkdirSync(dir,{recursive:true,mode:0o700});
const name='vidra-user-postgres',port=18432,label='vidra.local.user-db',image='postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
const secretsFile=path.join(dir,'postgres-local-private.json'),configFile=path.join(dir,'user-database.json'),envFile=path.join(dir,'postgres-local.env');
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}).trim();
try{
  docker('info','--format','{{.ServerVersion}}');
  if(fs.existsSync(secretsFile)&&((fs.statSync(secretsFile).mode&0o077)||fs.lstatSync(secretsFile).isSymbolicLink()))throw Error('Private configuration permissions required');
  const secret=fs.existsSync(secretsFile)?JSON.parse(fs.readFileSync(secretsFile,'utf8')):{admin:crypto.randomBytes(32).toString('hex'),app:crypto.randomBytes(32).toString('hex')};
  if(!/^[a-f0-9]{64}$/.test(secret.admin)||!/^[a-f0-9]{64}$/.test(secret.app))throw Error('Invalid private configuration');
  fs.writeFileSync(secretsFile,JSON.stringify(secret),{mode:0o600});fs.chmodSync(secretsFile,0o600);
  let existing=null;try{existing=JSON.parse(docker('inspect',name))[0];}catch{}
  if(existing){if(existing.Config.Labels?.[label]!==root)throw Error('Refuse unknown database container');if(!existing.State.Running)docker('start',name);}
  else{
    fs.writeFileSync(envFile,`POSTGRES_USER=vidra_admin\nPOSTGRES_PASSWORD=${secret.admin}\nPOSTGRES_DB=vidra_users\n`,{mode:0o600});fs.chmodSync(envFile,0o600);
    docker('run','-d','--name',name,'--label',label+'='+root,'--restart','unless-stopped','--memory','512m','--cpus','2','--env-file',envFile,'-p',`127.0.0.1:${port}:5432`,'-v','vidra-user-postgres-data:/var/lib/postgresql/data',image);
  }
  let admin;
  for(let i=0;i<40;i++){
    const c=new Client({host:'127.0.0.1',port,user:'vidra_admin',password:secret.admin,database:'vidra_users',connectionTimeoutMillis:1500});
    try{await c.connect();admin=c;break;}catch{await c.end().catch(()=>{});await delay(250);}
  }
  if(!admin)throw Error('PostgreSQL startup not confirmed');
  try{
    const role=await admin.query("SELECT 1 FROM pg_roles WHERE rolname='vidra_app'");
    if(!role.rows.length)await admin.query(`CREATE ROLE vidra_app LOGIN PASSWORD '${secret.app}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    await admin.query('GRANT CONNECT ON DATABASE vidra_users TO vidra_app');await admin.query('GRANT USAGE,CREATE ON SCHEMA public TO vidra_app');
    const version=(await admin.query('SHOW server_version')).rows[0].server_version;
    fs.writeFileSync(configFile,JSON.stringify({driver:'postgres',connectionString:`postgresql://vidra_app:${secret.app}@127.0.0.1:${port}/vidra_users`})+'\n',{mode:0o600});fs.chmodSync(configFile,0o600);
    console.log(JSON.stringify({service:'vidra-local-user-database',driver:'postgres',version,loopbackOnly:true,nonSuperuserApplication:true,persistentVolume:true,imagePinned:true,port}));
  }finally{await admin.end();}
}catch{console.error('Local user database startup failed; inspect Docker and private configuration. No credentials printed.');process.exitCode=1;}
