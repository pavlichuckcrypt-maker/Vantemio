import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {Wallet} from 'ethers';import {openUserDatabase} from './user-database.mjs';import {createUserStore} from './user-store.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),pause=ms=>new Promise(r=>setTimeout(r,ms));
test('real HTTP wallet profiles, cross-tab isolation, overload, restart and bounded concurrent load',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vidra-http-')),probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const origin=`http://127.0.0.1:${port}`;
 const pg=process.env.VIDRA_TEST_DATABASE_URL,filename=path.join(tmp,'users.sqlite'),db=await openUserDatabase(pg?{connectionString:pg}:{filename});const store=await createUserStore(db,{origin});
 let child,identity;const cookies=[];let csrf;
 async function start(){child=spawn(process.execPath,['auditor-site/server.mjs'],{cwd:root,stdio:'ignore',env:{...process.env,VIDRA_SITE_PORT:String(port),VIDRA_MEDIA_HOME:tmp,VIDRA_ASSET_RUNTIME_DIR:tmp,VIDRA_DATABASE_URL:pg||'',VIDRA_USER_DATABASE_FILE:pg?'':filename}});for(const until=Date.now()+90000;Date.now()<until;){try{const r=await fetch(origin+'/api/runtime',{signal:AbortSignal.timeout(1000)});const v=await r.json();if(v.pid===child.pid&&v.service==='vidra-ai-auditor'){identity=v;csrf=(await(await fetch(origin+'/api/site')).json()).csrf;return;}}catch{}if(child.exitCode!==null)throw Error('Isolated HTTP server exited');await pause(200);}throw Error('Isolated HTTP server startup timeout');}
 async function stop(){if(!child||child.exitCode!==null)return;const current=await(await fetch(origin+'/api/runtime')).json();assert.equal(current.pid,child.pid);assert.equal(current.instanceId,identity.instanceId);child.kill('SIGTERM');await new Promise((r,j)=>{const timer=setTimeout(()=>j(Error('Owned HTTP server shutdown timeout')),10000);child.once('exit',()=>{clearTimeout(timer);r();});});}
 async function req(route,{cookie,account,body,foreign=false,mode}={}){const r=await fetch(origin+'/api/wallet/'+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:foreign?'http://example.com':origin,'X-Vidra-CSRF':csrf}:{}),...(cookie?{Cookie:cookie}:{}),...(account?{'X-Vidra-Wallet':account}:{}),...(mode?{'X-Vidra-Account-Mode':mode}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],retry:r.headers.get('retry-after')};}
 const stats={schemaVersion:1,verifiedAt:new Date().toISOString(),scope:'local-wallet-profile-and-database-load; no blockchain broadcasts',driver:db.driver,checks:{},load:null};
 try{await start();const health=await(await fetch(origin+'/api/health')).json();assert.equal(health.driver,db.driver);assert.equal(health.status,'ready');stats.checks.databaseHealthVerified=true;
  for(let i=0;i<10;i++){const w=Wallet.createRandom(),c=await req('challenge',{body:{address:w.address,chainId:84532}});assert.equal(c.status,200);const v=await req('verify',{body:{id:c.body.id,signature:await w.signMessage(c.body.message)}});assert.equal(v.status,200);cookies.push({account:w.address,cookie:v.cookie,id:v.body.user.id});}
  stats.checks.tenIndependentSignedWallets=true;
  const a=cookies[0],b=cookies[1];assert.notEqual(a.id,b.id);
  assert.equal((await req('profile',{cookie:b.cookie,account:a.account})).status,401);
  assert.equal((await req('profile',{cookie:b.cookie,account:a.account,body:{displayName:'forged',locale:'en',revision:0}})).status,401);
  assert.equal((await req('logout',{cookie:b.cookie,account:a.account,body:{}})).status,401);
  assert.equal((await req('profile',{cookie:b.cookie,account:b.account})).status,200);
  assert.equal((await req('profile',{...a,body:{displayName:'Demo owner',locale:'en',revision:0}})).status,200);
  assert.equal((await req('profile',{...a,body:{displayName:'evil',locale:'en',revision:1,account:b.account}})).status,400);
  assert.equal((await req('profile',{...a,foreign:true,body:{displayName:'evil',locale:'en',revision:1}})).status,403);
  assert.equal((await req('profile',{...b})).body.user.displayName,'');stats.checks.crossTabOwnerBinding=true;stats.checks.forgedOwnerAndOriginRejected=true;
  const config=await req('account/config');assert.equal(config.status,200);assert.equal(config.body.google.enabled,false);
  assert.equal((await req('account/google/challenge',{body:{mode:'login'}})).status,503);
  assert.equal((await req('account/profile',{...a})).status,401);
  const ma=await req('account/profile',{...a,mode:'wallet'});assert.equal(ma.body.member.id,a.id);
  assert.equal((await req('account/profile',{...a,mode:'wallet',body:{displayName:'My store',locale:'en',seller:true,revision:0}})).status,200);
  const draft={id:crypto.randomUUID(),revision:0,product:{title:'Ready file',description:'Test file access',price:'25',quantity:1,fulfillment:{kind:'digital_instant',days:0}}};
  assert.equal((await req('account/products',{...a,mode:'wallet',body:draft})).status,200);
  assert.equal((await req('account/products',{...b,mode:'wallet'})).body.products.length,0);
  assert.equal((await req('account/products',{cookie:b.cookie,account:a.account,mode:'wallet',body:draft})).status,401);
  assert.equal((await req('account/products',{...a,mode:'wallet',foreign:true,body:draft})).status,403);
  stats.checks.sellerDraftOwnerAndOriginVerified=true;stats.checks.unconfiguredGoogleFailsClosed=true;
  const fileBytes=Buffer.from('owner-scoped HTTP asset fixture');
  async function upload(user,{foreign=false,filename='paid-resource.txt'}={}){const r=await fetch(origin+'/api/wallet/account/assets/upload',{method:'POST',headers:{Cookie:user.cookie,'X-Vidra-Wallet':user.account,'X-Vidra-Account-Mode':'wallet',Origin:foreign?'http://example.com':origin,'X-Vidra-CSRF':csrf,'Content-Type':'text/plain','X-Vidra-Filename':filename},body:fileBytes});return {status:r.status,body:await r.json()};}
  assert.equal((await upload(b)).status,403);assert.equal((await upload(a,{foreign:true})).status,403);assert.equal((await upload(a,{filename:'../escape'})).status,400);
  const asset=await upload(a);assert.equal(asset.status,200);assert.equal(asset.body.asset.ready,true);assert.equal((await req('account/assets',{...b,mode:'wallet'})).body.assets.length,0);
  assert.equal((await req('account/attach-asset',{...a,mode:'wallet',body:{productId:draft.id,revision:1,assetId:asset.body.asset.id}})).status,200);
  assert.equal((await req('account/products',{...a,mode:'wallet'})).body.products[0].revision,2);
  assert.equal((await req('account/products',{...a,mode:'wallet'})).body.products[0].status,'DRAFT');stats.checks.privateUploadOwnershipOriginAndAttachment=true;
  const recoveryKey='shared-http-recovery-operation';
  for(const user of [a,b])await store.exclusive(user.account,async(account,data,persist)=>{data.intents.push({account,key:recoveryKey,id:user.id,status:'CONFIRMED'});await persist();});
  assert.equal((await req('intent?key='+recoveryKey,a)).body.intent.id,a.id);
  assert.equal((await req('intent?key='+recoveryKey,b)).body.intent.id,b.id);
  assert.equal((await req('intent?key='+recoveryKey,{cookie:b.cookie,account:a.account})).status,401);
  assert.equal((await req('intent?key=unknown-operation-key',a)).status,404);
  assert.equal((await req('intent?key='+recoveryKey+'&key='+recoveryKey,a)).status,400);
  assert.equal((await req('intent?key='+recoveryKey+'&account='+b.account,a)).status,400);
  stats.checks.ownerScopedRecoveryLookup=true;
  const waits=[]; // Saturate only local HTTP admission with incomplete small POST bodies, no RPC traffic.
  try{for(let i=0;i<256;i++){const q=http.request(origin+'/api/wallet/profile',{method:'POST',headers:{Origin:origin,'X-Vidra-CSRF':csrf,'Content-Type':'application/json','Content-Length':'20'} });q.on('error',()=>{});q.write('{');waits.push(q);}
   await pause(200);const blocked=await req('profile',{...a});assert.equal(blocked.status,503);assert.equal(blocked.retry,'5');stats.checks.boundedAdmissionWithRetryAfter=true;
  }finally{for(const q of waits)q.destroy();await pause(200);}
  const createStarted=performance.now();const ids=new Set();
  for(let offset=0;offset<1000;offset+=20)await Promise.all(Array.from({length:20},(_,n)=>'0x'+(10000+offset+n).toString(16).padStart(40,'0')).map(async account=>{const s=await store.createSession(account);ids.add(s.user.id);await store.updateProfile(s.token,{displayName:account,locale:'en',revision:0});assert.equal((await store.session(s.token)).user.account.toLowerCase(),account);}));
  assert.equal(ids.size,1000);stats.checks.thousandDistinctDatabaseProfiles=true;const profileCreationMs=Math.round(performance.now()-createStarted);
  const latencies=[],startTime=performance.now();let completed=0;
  async function worker(){while(completed<1000){const index=completed++;if(index>=1000)return;const user=cookies[index%10],before=performance.now();const r=await req('profile',user);assert.equal(r.status,200);assert.equal(r.body.user.id,user.id);assert.equal(r.body.user.account.toLowerCase(),user.account.toLowerCase());latencies.push(performance.now()-before);}}
  await Promise.all(Array.from({length:50},worker));const elapsed=performance.now()-startTime;latencies.sort((a,b)=>a-b);
  stats.load={signedWallets:10,databaseProfiles:1000,profileCreationMs,httpRequests:1000,concurrentHttpWorkers:50,failures:0,durationMs:Math.round(elapsed),requestsPerSecond:Math.round(1000000/elapsed),p50Ms:Math.round(latencies[499]),p95Ms:Math.round(latencies[949]),p99Ms:Math.round(latencies[989]),limits:{httpRequests:256,checkoutRequests:8,databaseConnectionsPerProcess:12}};
  await stop();await start();const r=await req('profile',a);assert.equal(r.status,200);assert.equal(r.body.user.id,a.id);assert.equal(r.body.user.displayName,'Demo owner');stats.checks.sessionAndProfileSurviveRestart=true;
  assert.equal((await req('logout',{...a,body:{}})).status,200);assert.equal((await req('profile',a)).status,401);stats.checks.logoutRevokesSession=true;
  assert.equal((await fetch(origin+'/api/runtime')).status,200);stats.checks.serverStillResponsive=true;
  if(process.env.VIDRA_USER_TEST_REPORT)fs.writeFileSync(process.env.VIDRA_USER_TEST_REPORT,JSON.stringify(stats,null,2)+'\n');console.log(JSON.stringify({driver:stats.driver,checks:stats.checks,load:stats.load}));
 }finally{await stop();await db.close();fs.rmSync(tmp,{recursive:true,force:true});}
});
