import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readVerifiedBytes} from '../src/verified-file.mjs';
import {listPublicEvidence,readPublicEvidence} from '../src/public-evidence.mjs';
import {createSiteIdentity,writeSiteInfo} from './runtime.mjs';
import {openUserDatabase,ServiceError} from './user-database.mjs';
import {createUserStore} from './user-store.mjs';
import {createAccountStore} from './account-store.mjs';
import {createSellerAssetStorage,SELLER_ASSET_LIMIT} from './seller-assets.mjs';
import {googleConfiguration,createGoogleVerifier} from './google-auth.mjs';
import {createMarketAdmission,MARKET_LIMITS} from './market-admission.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),moduleRoot=path.dirname(root);
const port=Number(process.env.VIDRA_SITE_PORT||18340);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid site port');
const origin=`http://127.0.0.1:${port}`;
const database=await openUserDatabase({moduleRoot,filename:process.env.VIDRA_USER_DATABASE_FILE}),users=await createUserStore(database,{origin}),csrf=users.csrf;
const accounts=await createAccountStore(database,{origin,users}),google=googleConfiguration(moduleRoot),verifyGoogle=createGoogleVerifier(google);
const sellerAssets=createSellerAssetStorage(moduleRoot,accounts,{runtimeRoot:process.env.VIDRA_ASSET_RUNTIME_DIR});let uploads=0;
const siteIdentity=createSiteIdentity();
let walletMarket=null,proofStore=null;
const getMarket=()=>walletMarket??=import('./wallet-market.mjs').then(({createWalletMarket})=>createWalletMarket(moduleRoot,{store:users,accounts,assets:sellerAssets}));
const getProofs=()=>proofStore??=import('./wallet-proof.mjs').then(({createPersistentProofStore})=>createPersistentProofStore({origin,store:users}));
function cookieToken(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('vidra-wallet='))?.slice(13);}
function namedCookie(req,name){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);}
async function accountAuth(req){
  const mode=req.headers['x-vidra-account-mode'];
  if(mode==='wallet'){await walletSession(req);return {mode,walletToken:cookieToken(req)};}
  if(mode==='google')return {mode,googleToken:namedCookie(req,'vidra-member')};
  throw new ServiceError('Explicit account mode required',401);
}
async function walletSession(req){
  const s=await users.session(cookieToken(req));
  if(typeof req.headers['x-vidra-wallet']!=='string'||req.headers['x-vidra-wallet'].toLowerCase()!==s.account.toLowerCase())throw new ServiceError('Wallet session account changed',401);
  return s;
}
let active=0;const marketAdmission=createMarketAdmission();
async function marketRequest(req,res,s,fn,lane='checkout'){
  await users.rateLimit('market-'+lane+':'+s.account.toLowerCase(),60);
  const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort();};
  res.once('close',abort);
  try{return await marketAdmission.run(lane,s.account,async()=>{
    // A logout or wallet switch while waiting must invalidate queued work.
    const current=await walletSession(req);if(current.user.id!==s.user.id)throw new ServiceError('Wallet session account changed',401);
    if(controller.signal.aborted)throw new ServiceError('Request disconnected',499);
    return users.withMarketCapacity(lane,fn);
  },{signal:controller.signal});}finally{res.removeListener('close',abort);}
}
const publicFiles={'/wallet-workspace.mjs':'wallet-workspace.mjs','/account.mjs':'account.mjs','/':'index.html','/site.css':'site.css','/site.mjs':'site.mjs','/wallet-client.mjs':'wallet-client.mjs','/wallet-discovery.mjs':'wallet-discovery.mjs','/wallet-recovery.mjs':'wallet-recovery.mjs','/i18n.mjs':'i18n.mjs','/funding.json':'funding.json'};
const documents=['START_HERE_RU.txt','AUDIT_AND_ARCHITECTURE_RU.txt','PUBLICATION_REGISTER_RU.txt','AUDITOR_OVERVIEW_EN.txt','MULTIUSER_ARCHITECTURE_RU_EN.txt'];
const evidence=listPublicEvidence(path.join(moduleRoot,'evidence'));
const mediaHome=process.env.VIDRA_MEDIA_HOME||path.join(process.env.HOME,'Desktop/AIMmontag_Blockchain');
const media={'/media/demo.mp4':['AIMmontag_INVESTOR_DEMO_RU.mp4','46d655c8ca302cdd3c74db5fa64ebf6b806965594b34c5ae356f065fd952e6a6'],
  '/media/demo-en.mp4':['VIDRA_AI_INVESTOR_DEMO_EN.mp4','e16c4ecdd1e306e043f1f96dbff6300f59d904ac9f60be16c40b01c923310832'],
  '/media/content.mp4':['DEMO_CONTENT_NFT4.mp4','7dd41cd465fbbf3d046124f846dcf46abfda257eb63a2730275a9da11b6ac7f5']};
const checkedMedia=new Map();for(const [url,[name,hash]] of Object.entries(media)){
  const file=path.join(mediaHome,name);try{
    let verified;try{verified=readVerifiedBytes(file,hash,{root:mediaHome});}catch(e){
      // macOS may update metadata on first access. Retry the entire bounded,
      // pinned read once; never accept bytes from a failed or mismatched read.
      if(e.message!=='File changed while reading')throw e;
      verified=readVerifiedBytes(file,hash,{root:mediaHome});
    }checkedMedia.set(url,verified);
  }catch(e){console.warn(JSON.stringify({event:'auditor-media-unavailable',name,reason:e.message}));}
}
function reply(res,code,data,type='application/json'){
  res.writeHead(code,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':`default-src 'self'; script-src 'self' ${google.enabled?"https://accounts.google.com/gsi/client":""}; style-src 'self' ${google.enabled?"https://accounts.google.com/gsi/style":""}; connect-src 'self' ${google.enabled?"https://accounts.google.com/gsi/":""}; frame-src ${google.enabled?"https://accounts.google.com/gsi/":"'none'"}; media-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`});
  res.end(type==='application/json'?JSON.stringify(data):data);
}
async function body(req,limit=2048){const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>limit)throw new ServiceError('Request too large',413);chunks.push(b);}const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw new ServiceError('Object body required',400);return value;}
let cache=null,inflight=null;
async function readDemo(){
  if(cache&&Date.now()-cache.at<15000)return cache.data;
  if(inflight)return inflight;
  inflight=(async()=>{const r=await fetch('http://127.0.0.1:18339/api/evidence',{redirect:'error',signal:AbortSignal.timeout(35000)});
    if(!r.ok)throw new Error('Studio evidence unavailable');const data=await r.json();
    if(data.manifest?.chainId!==84532||!data.publicTransactions)throw new Error('Public Base Sepolia required');
    delete data.csrf;cache={at:Date.now(),data};return data;})();
  try{return await inflight;}finally{inflight=null;}
}
const server=http.createServer(async(req,res)=>{
  if(active>=256){res.setHeader('Retry-After','5');reply(res,503,{error:'Server busy; retry later'});return;}
  active++;try{
  if(req.headers.host!==`127.0.0.1:${port}`){reply(res,403,{error:'Invalid host'});return;}
  if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==origin){reply(res,403,{error:'Foreign origin'});return;}
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/api/wallet/account/')){
    if(req.method==='GET'&&url.pathname==='/api/wallet/account/config'){reply(res,200,{google,roles:['buyer','seller'],fulfillmentKinds:['digital_instant','physical','service','custom_digital'],sellerPublishing:'wallet-signed; pinned Boson receipt required',assetLimitBytes:SELLER_ASSET_LIMIT});return;}
    if(req.method==='POST'){
      if(req.headers.origin!==origin||req.headers['x-vidra-csrf']!==csrf)throw new ServiceError('Origin/CSRF required',403);
      if(url.pathname==='/api/wallet/account/assets/upload'){
        const auth=await accountAuth(req),member=await accounts.resolve(auth);if(!member.roles.seller)throw new ServiceError('Seller profile required',403);
        await users.rateLimit('asset-upload:'+member.id,10);
        if(uploads>=2)throw new ServiceError('Upload capacity busy; retry later',503);
        const length=Number(req.headers['content-length']);if(!Number.isSafeInteger(length)||length<1||length>SELLER_ASSET_LIMIT)throw new ServiceError('File must be within 64 MiB',413);
        uploads++;try{const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>length||size>SELLER_ASSET_LIMIT)throw new ServiceError('Upload too large',413);chunks.push(b);}if(size!==length)throw new ServiceError('Upload incomplete',400);
          reply(res,200,{asset:await sellerAssets.upload(auth,{bytes:Buffer.concat(chunks,size),mime:req.headers['content-type'],filename:req.headers['x-vidra-filename']})});return;
        }finally{uploads--;}
      }
      const b=await body(req,12288);
      if(url.pathname==='/api/wallet/account/google/challenge'){
        if(!google.enabled)throw new ServiceError('Google sign-in is not configured',503);
        if(Object.keys(b).join(',')!=='mode'||!['login','link'].includes(b.mode))throw new ServiceError('Invalid Google flow mode',400);
        await users.rateLimit('google-challenge:'+req.socket.remoteAddress,20);
        if(b.mode==='link')await walletSession(req);
        const browserToken=crypto.randomBytes(32).toString('hex'),f=await accounts.issueGoogleFlow({browserToken,walletToken:b.mode==='link'?cookieToken(req):null});
        res.setHeader('Set-Cookie',`vidra-google-flow=${browserToken}; HttpOnly; SameSite=Strict; Path=/api/wallet/account; Max-Age=120`);reply(res,200,f);return;
      }
      if(url.pathname==='/api/wallet/account/google/verify'){
        if(!google.enabled)throw new ServiceError('Google sign-in is not configured',503);
        if(Object.keys(b).sort().join(',')!=='credential,nonce')throw new ServiceError('Invalid Google fields',400);
        await users.rateLimit('google-verify:'+req.socket.remoteAddress,30);
        const flow=await accounts.consumeGoogleFlow(b.nonce,namedCookie(req,'vidra-google-flow')),
          identity=await verifyGoogle(b.credential,b.nonce),s=await accounts.finishGoogle(flow,identity);
        res.setHeader('Set-Cookie',`vidra-member=${s.token}; HttpOnly; SameSite=Strict; Path=/api/wallet/account; Max-Age=600`);
        reply(res,200,{member:s.member,expires:s.expires});return;
      }
      const auth=await accountAuth(req),m=await accounts.resolve(auth);await users.rateLimit('member-write:'+m.id,30);
      if(url.pathname==='/api/wallet/account/profile'){reply(res,200,{member:await accounts.update(auth,b)});return;}
      if(url.pathname==='/api/wallet/account/products'){reply(res,200,{product:await accounts.saveProduct(auth,b)});return;}
      if(url.pathname==='/api/wallet/account/attach-asset'){reply(res,200,await accounts.attachAsset(auth,b));return;}
      if(url.pathname==='/api/wallet/account/link-wallet'){
        if(Object.keys(b).length)throw new ServiceError('Unknown account fields',400);await walletSession(req);reply(res,200,{member:await accounts.linkWallet(auth,cookieToken(req))});return;
      }
      if(url.pathname==='/api/wallet/account/logout'){if(Object.keys(b).length)throw new ServiceError('Unknown account fields',400);await accounts.logout(namedCookie(req,'vidra-member'));reply(res,200,{ok:true});return;}
      throw new ServiceError('Unknown account command',404);
    }
    if(req.method==='GET'){
      const auth=await accountAuth(req),m=await accounts.resolve(auth);await users.rateLimit('member-read:'+m.id,60);
      if(url.pathname==='/api/wallet/account/profile'){reply(res,200,{member:m});return;}
      if(url.pathname==='/api/wallet/account/products'){reply(res,200,{products:await accounts.products(auth)});return;}
      if(url.pathname==='/api/wallet/account/assets'){reply(res,200,{assets:await accounts.assets(auth)});return;}
    }
    throw new ServiceError('Unknown account route',404);
  }
  if(req.method==='POST'&&url.pathname.startsWith('/api/wallet/')){
    if(req.headers.origin!==origin||req.headers['x-vidra-csrf']!==csrf){reply(res,403,{error:'Origin/CSRF required'});return;}
    const b=await body(req);
    if(url.pathname==='/api/wallet/challenge'){
      if(Object.keys(b).some(k=>!['address','chainId'].includes(k)))throw new Error('Unknown fields');
      await users.rateLimit('challenge:'+req.socket.remoteAddress,60);reply(res,200,await (await getProofs()).issue(b.address,b.chainId));return;
    }
    if(url.pathname==='/api/wallet/verify'){
      if(Object.keys(b).some(k=>!['id','signature'].includes(k)))throw new Error('Unknown fields');
      await users.rateLimit('verify:'+req.socket.remoteAddress,90);
      const proof=await (await getProofs()).verify(b.id,b.signature),s=await users.createSession(proof.account,cookieToken(req));
      res.setHeader('Set-Cookie',`vidra-wallet=${s.token}; HttpOnly; SameSite=Strict; Path=/api/wallet; Max-Age=600`);
      reply(res,200,{...proof,user:s.user,scope:'local-testnet-wallet-checkout',sessionExpires:new Date(s.expires).toISOString()});return;
    }
    if(url.pathname==='/api/wallet/logout'){
      if(cookieToken(req)){await walletSession(req);await users.logout(cookieToken(req));}
      // Revoke the token without clearing a newer cookie set by another tab.
      reply(res,200,{ok:true});return;
    }
    if(url.pathname==='/api/wallet/profile'){
      const s=await walletSession(req);await users.rateLimit('profile-write:'+s.user.id,30);
      reply(res,200,{user:await users.updateProfile(cookieToken(req),b)});return;
    }
    if(['/api/wallet/prepare','/api/wallet/reconcile','/api/wallet/cancel','/api/wallet/retire-approval','/api/wallet/delivery','/api/wallet/cancel-reservation','/api/wallet/review'].includes(url.pathname)){
      const s=await walletSession(req);await marketRequest(req,res,s,async()=>{const market=await getMarket();
      const keys=url.pathname.endsWith('cancel-reservation')?['productId','key']:url.pathname.endsWith('prepare')?['key','action','listingId','exchangeId','productId','revision']:url.pathname.endsWith('reconcile')?['id','hash']:['/api/wallet/cancel','/api/wallet/retire-approval','/api/wallet/review'].includes(url.pathname)?['id']:['exchangeId'];
      if(Object.keys(b).some(k=>!keys.includes(k)))throw new Error('Unknown wallet fields');
      if(url.pathname.endsWith('cancel-reservation'))reply(res,200,await market.cancelReservation(s.account,{mode:'wallet',walletToken:cookieToken(req)},b));
      else if(url.pathname.endsWith('prepare'))reply(res,200,await market.prepare(s.account,b,{mode:'wallet',walletToken:cookieToken(req)}));
      else if(url.pathname.endsWith('review'))reply(res,200,await market.reviewIntent(s.account,b.id,{mode:'wallet',walletToken:cookieToken(req)}));
      else if(url.pathname.endsWith('reconcile'))reply(res,200,await market.reconcile(s.account,b));
      else if(url.pathname.endsWith('retire-approval'))reply(res,200,await market.retireApproval(s.account,b.id));
      else if(url.pathname.endsWith('cancel'))reply(res,200,await market.cancel(s.account,b.id));
      else{
        const f=await market.digitalFile(s.account,b.exchangeId);
        reply(res,200,await users.issueGrant(s,{exchangeId:String(b.exchangeId),sha256:f.sha256}));
      }});return;
    }
  }
  if(req.method!=='GET'){reply(res,405,{error:'Method not allowed'});return;}
  if(url.pathname==='/api/wallet/profile'){const s=await walletSession(req);reply(res,200,{user:s.user});return;}
  if(url.pathname==='/api/wallet/intent'){
    const s=await walletSession(req);if([...url.searchParams.keys()].some(k=>k!=='key')||url.searchParams.getAll('key').length!==1)throw new ServiceError('Invalid recovery query',400);
    await users.rateLimit('recovery-read:'+s.account.toLowerCase(),60);reply(res,200,{intent:await users.intentByKey(s.account,url.searchParams.get('key'))});return;
  }
  if(url.pathname==='/api/wallet/state'){const s=await walletSession(req);await marketRequest(req,res,s,async()=>reply(res,200,{...await (await getMarket()).state(s.account),user:s.user}),'read');return;}
  if(url.pathname==='/api/wallet/file'){
    if(req.headers['x-vidra-csrf']!==csrf)throw new Error('CSRF required');const s=await walletSession(req);
    await marketRequest(req,res,s,async()=>{
      const g=await users.consumeGrant(s,req.headers['x-wallet-grant']);
      const f=await (await getMarket()).digitalFile(s.account,g.exchangeId);if(f.sha256!==g.sha256)throw new Error('Delivery changed');
      res.writeHead(200,{'Content-Type':f.mime,'Content-Length':f.bytes.length,
        'Content-Disposition':`attachment; filename="${f.filename}"`,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
      res.once('finish',()=>{void f.confirm().catch(()=>console.warn('Delivery confirmation not persisted; reconciliation required'));});res.end(f.bytes);
    });return;
  }
  if(url.pathname==='/api/health'){await database.query('SELECT 1');reply(res,200,{status:'ready',driver:database.driver,persistent:true,scope:'local-user-storage-only; chain readiness checked separately'});return;}
  if(url.pathname==='/api/runtime'){reply(res,200,siteIdentity);return;}
  if(url.pathname==='/api/catalog'){await users.rateLimit('catalog-read:'+req.socket.remoteAddress,60);reply(res,200,{listings:await users.withMarketCapacity('read',async()=>await(await getMarket()).catalog())});return;}
  if(url.pathname==='/api/site'){reply(res,200,{name:'VidRa AI',chainId:84532,csrf,documents,evidence,media:[...checkedMedia.keys()],demoUrl:'http://127.0.0.1:18339/',userStorage:{driver:database.driver,persistent:true,chainId:84532,scope:'wallet-profiles-and-checkout',limits:{http:256,...MARKET_LIMITS,databasePool:12,digitalFileBytes:67108864},marketScope:'store-first; rendering deferred until funding'}});return;}
  if(url.pathname==='/api/evidence'){reply(res,200,await readDemo());return;}
  if(publicFiles[url.pathname]){const n=publicFiles[url.pathname],type=n.endsWith('.html')?'text/html':n.endsWith('.css')?'text/css':n.endsWith('.mjs')?'text/javascript':'application/json';
    const text=await fs.promises.readFile(path.join(root,'public',n),'utf8');reply(res,200,type==='application/json'?JSON.parse(text):text,type);return;}
  if(url.pathname.startsWith('/docs/')&&documents.includes(url.pathname.slice(6))){reply(res,200,await fs.promises.readFile(path.join(root,'docs',url.pathname.slice(6)),'utf8'),'text/plain');return;}
  if(url.pathname.startsWith('/evidence/')&&evidence.includes(url.pathname.slice(10))){reply(res,200,readPublicEvidence(path.join(moduleRoot,'evidence'),url.pathname.slice(10)));return;}
  if(checkedMedia.has(url.pathname)){
    const {bytes}=checkedMedia.get(url.pathname),size=bytes.length;let start=0,end=size-1,code=200;
    if(req.headers.range){const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!m){reply(res,416,{error:'Invalid range'});return;}
      start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),size-1):size-1;
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end){reply(res,416,{error:'Invalid range'});return;}code=206;}
    res.writeHead(code,{'Content-Type':'video/mp4','Content-Length':end-start+1,'Accept-Ranges':'bytes',...(code===206?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
    res.end(bytes.subarray(start,end+1));return;
  }
  reply(res,404,{error:'Not found'});
}catch(e){if(res.headersSent)res.destroy();else{const status=e instanceof ServiceError?e.status:400;if(status===429||status===503)res.setHeader('Retry-After','5');reply(res,status,{error:e.message});}}finally{active--;}});
server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxHeadersCount=64;
const cleanup=setInterval(()=>{void Promise.all([users.sweep(),accounts.sweep()]).catch(()=>{});},60000);cleanup.unref();
process.once('SIGTERM',()=>{clearInterval(cleanup);server.close(()=>{void Promise.resolve(walletMarket).then(m=>m?.close()).catch(()=>{}).finally(()=>database.close().finally(()=>process.exit(0)));});});
server.listen(port,'127.0.0.1',()=>{writeSiteInfo(moduleRoot,port,siteIdentity);console.log(`VidRa AI auditor website: ${origin}`);});
