import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './compile.mjs';
import { loadWallets, DEMO_HOME } from './vault.mjs';
import { NETWORK, RUNTIME, startChain, load, save, json, safeProposal, executeSafe } from './chain.mjs';
import { connectBase } from './base-chain.mjs';
import { connectBsc } from './bsc-chain.mjs';
import { initializeCommerce, commitOrder, refreshOrder, transitionOrder, withdrawRefund, commerceSummary } from './boson.mjs';
import { initializeFixture, mintRelease, preparePassport, PROJECT, VIDEO } from './releases.mjs';
import { CHECKS, audit, verifyAudit } from './security.mjs';
import { market,publicMarket,handleMarketAction,consumeDelivery,previewFile,registeredProject,syncCertificate,initializeMarket,marketEvent } from './marketplace.mjs';
import { checkedAssetSnapshot } from './delivery.mjs';
import { validateMarketAction } from './market-schema.mjs';
import { createChainView } from './chain-view.mjs';
import {runtimeIdentity} from './runtime-identity.mjs';
import { emitDeliveryKernelEvent } from './station-kernel-bridge.mjs';

const isBsc=NETWORK==='bsc-testnet';
const isBase=NETWORK==='base-sepolia';
const isPublic=isBase||isBsc;
const port=Number(process.env.AIM_DEMO_PORT||(isBase?18339:isBsc?18338:18337));
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local port');
const origin=`http://127.0.0.1:${port}`;
const csrf=crypto.randomBytes(32).toString('hex');
const instanceId=crypto.randomUUID();
const {wallets,publicInventory}=await loadWallets();
let ctx=isBase?await connectBase(wallets):isBsc?await connectBsc(wallets):await startChain(wallets);
const state=load('state.json',{receipts:[],releases:[],orders:[],checks:[]});
verifyAudit();initializeFixture(wallets.buyer.address);
preparePassport();
if(!isBsc&&ctx.credit){await initializeCommerce(ctx,state);for(const order of state.orders)await refreshOrder(ctx,order);}
if(isBase&&ctx.boson)await initializeMarket(ctx,state);
save('state.json',state);
const tokenFile=path.join(RUNTIME,'studio-api-token');
if(!fs.existsSync(tokenFile))fs.writeFileSync(tokenFile,crypto.randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
const studioToken=fs.readFileSync(tokenFile,'utf8');
let queue=Promise.resolve();
let queued=0;
let active=null;
const readChainView=createChainView();
function enqueue(operation){
  if(queued>=6)throw new Error('Demo operation queue is full; wait for confirmation');
  queued++;const work=queue.then(operation).finally(()=>queued--);queue=work.catch(()=>{});return work;
}

async function snapshot() {
  const receipts=isPublic?load('public-receipts.json',[]):[];
  const projection=isBase&&ctx.nft&&ctx.boson?await readChainView({...ctx,sellerId:state.sellerId,resolverId:state.resolverId,offerId:state.offerId,voucher:state.voucher},{releases:state.releases,orders:state.orders,marketplace:publicMarket()},{revision:receipts.length+':'+(receipts.at(-1)?.tx||'')}):{releases:state.releases,orders:state.orders,marketplace:isBase?publicMarket():null};
  return {mode:isBase?'PUBLIC BASE SEPOLIA':isBsc?'PUBLIC BSC TESTNET':'LOCAL BASE SEPOLIA FORK',publicTransactions:isPublic,independentCustody:false,
    deploymentReady:!!ctx.nft,funding:Object.hasOwn(projection,'funding')?projection.funding:isPublic?{address:wallets.operator.address,balance:(await ctx.provider.getBalance(wallets.operator.address)).toString(),unit:'wei'}:null,
    manifest:ctx.manifest,wallets:publicInventory.wallets,commerce:Object.hasOwn(projection,'commerce')?projection.commerce:!ctx.boson?{available:false,status:'Public deployment pending; fund test ETH and deploy',buyerBalance:'0',sellerAvailable:'0'}:await commerceSummary(ctx,state),
    ...projection,checks:state.checks,
    checkDefinitions:CHECKS.map(([id,label],i)=>({number:i+1,id,label})),
    paused:Object.hasOwn(projection,'paused')?projection.paused:ctx.nft?await ctx.nft.paused():false,active,queued,csrf,
    securityScope:'NFT: 15 gates + on-chain Safe 3/5. Boson: 3 verified software approvals + strict intents. Same-Mac demo custody.',
    pendingTransaction:!!load('pending.json'),auditVerified:verifyAudit(),
    receipts,studioIntegration:{projectRegistered:true,automaticHook:'tools/blockchain_publish.py after_render; acceptance required'}};
}
function send(res,code,value,type='application/json') {
  res.writeHead(code,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
  res.end(type==='application/json'?json(value):value);
}
async function body(req) {
  let content='';for await(const chunk of req){content+=chunk;if(content.length>16384)throw new Error('Request too large');}
  return content?JSON.parse(content):{};
}
const server=http.createServer(async(req,res)=>{
  try {
    if(req.headers.host!==`127.0.0.1:${port}`){send(res,403,{error:'Invalid host'});return;}
    if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==origin){send(res,403,{error:'Foreign origin rejected'});return;}
    const url=new URL(req.url,origin);
    if(isBase&&req.method==='POST'&&url.pathname==='/api/market/action'){
      if(req.headers.origin!==origin||req.headers['x-demo-csrf']!==csrf){send(res,403,{error:'Origin or CSRF verification failed'});return;}
      const input=validateMarketAction(await body(req));
      const work=enqueue(async()=>{active=input.action;try{return await handleMarketAction(ctx,state,input);}finally{active=null;}});
      send(res,200,{ok:true,result:await work});return;
    }
    if(isBase&&req.method==='GET'&&url.pathname==='/api/market/delivery'){
      if(req.headers['x-demo-csrf']!==csrf){send(res,403,{error:'Creator/buyer console authentication required'});return;}
      const verified=await consumeDelivery(ctx,state,req.headers['x-delivery-token']);
      res.writeHead(200,{'Content-Type':verified.asset.kind==='video'?'video/mp4':'text/plain','Content-Disposition':'attachment; filename="'+path.basename(verified.file)+'"',
        'Content-Length':verified.bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
      res.once('finish',()=>{verified.order.deliveredSha256=verified.asset.sha256;save('state.json',state);
        {
          const releaseId = verified.asset.releaseId || verified.order.listingId || null;
          const channelId = verified.listing.channelId || verified.asset.channelId || ctx.manifest.channelId || undefined;
          if (channelId && !String(channelId).startsWith('UC')) throw new Error('Invalid channel binding');
          emitDeliveryKernelEvent({exchangeId:verified.order.exchangeId,assetId:verified.asset.id,assetSha256:verified.asset.sha256,releaseId,listingId:verified.listing.id,channelId,chainId:ctx.manifest.chainId||84532});
        }
        marketEvent('delivery-confirmed','Цифровой файл выдан покупателю',{exchangeId:verified.order.exchangeId,assetSha256:verified.asset.sha256});});
      res.end(verified.bytes);return;
    }
    if(isBase&&req.method==='GET'&&url.pathname.startsWith('/api/market/master/')){
      if(req.headers['x-demo-csrf']!==csrf){send(res,403,{error:'Creator console authentication required'});return;}
      const asset=market.assets.find(a=>a.id===url.pathname.slice('/api/market/master/'.length));if(!asset)throw new Error('Unknown asset');
      const snapshot=checkedAssetSnapshot(asset);res.writeHead(200,{'Content-Type':asset.kind==='video'?'video/mp4':'text/plain','Content-Length':snapshot.bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(snapshot.bytes);return;
    }
    if(isBase&&req.method==='GET'&&url.pathname.startsWith('/api/market/preview/')){
      const file=previewFile(url.pathname.slice('/api/market/preview/'.length)),size=fs.statSync(file).size;
      res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);return;
    }
    if(req.method==='GET'&&url.pathname==='/api/runtime'){send(res,200,runtimeIdentity({network:NETWORK,manifest:ctx.manifest,pid:process.pid,instanceId,active,queued,pendingTransaction:!!load('pending.json')}));return;}
    if(req.method==='GET'&&url.pathname==='/api/state'){send(res,200,await snapshot());return;}
    if(req.method==='GET'&&url.pathname==='/api/evidence') {
      const result={...await snapshot(),csrf:undefined,exportedAt:new Date().toISOString()};send(res,200,result);return;
    }
    if(req.method==='GET'&&url.pathname==='/api/passport'){send(res,200,preparePassport());return;}
    if(req.method==='GET'&&url.pathname==='/video') {
      const size=fs.statSync(VIDEO).size;const range=req.headers.range;
      if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m){res.writeHead(416);res.end();return;}
        const start=Number(m[1]),end=Math.min(m[2]?Number(m[2]):size-1,size-1);
        if(start>end){res.writeHead(416);res.end();return;}
        res.writeHead(206,{'Content-Type':'video/mp4','Content-Range':`bytes ${start}-${end}/${size}`,'Accept-Ranges':'bytes','Content-Length':end-start+1});fs.createReadStream(VIDEO,{start,end}).pipe(res);
      }else{res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':size,'Accept-Ranges':'bytes'});fs.createReadStream(VIDEO).pipe(res);}return;
    }
    if(req.method==='POST'&&url.pathname==='/api/action') {
      if(req.headers.origin!==origin||req.headers['x-demo-csrf']!==csrf){send(res,403,{error:'Origin or CSRF verification failed'});return;}
      const input=await body(req);
        if(Object.keys(input).some(k=>!['action','exchangeId','tokenId','to','releaseId','assetId'].includes(k)))throw new Error('Unknown request fields');
       const allowed=isBsc?['deploy','mint','pause','unpause']:[...(isBase?['deploy']:[]),'mint','transfer','commit','redeem','complete','cancel','refund','dispute','retract','pause','unpause'];
      if(!allowed.includes(input.action))throw new Error('Unknown action');
      // Serial execution prevents wallet nonce and approval races within this demo.
      const work=enqueue(async()=>{
        active=input.action;
        try{
          if(input.action==='deploy'){
            const old=ctx;ctx=isBase?await connectBase(wallets,{deploy:true}):await connectBsc(wallets,{deploy:true});old.provider.destroy();if(isBase)await initializeCommerce(ctx,state);return{nft:ctx.manifest.nft,safe:ctx.manifest.safe};
          }
          if(!ctx.nft)throw new Error('Public deployment is pending; fund the operator with testnet gas and deploy first');
          if(input.action==='mint')return await mintRelease(ctx,state);
           if(input.action==='transfer'){ if(!input.tokenId||!input.to) throw new Error('transfer requires tokenId and to'); const hint = input.releaseId || (input.assetId ? (await import('./marketplace.mjs')).market.assets.find(a=>a.id===input.assetId)?.releaseId : null) || (await (await import('./chain.mjs')).load('marketplace.json',null))?.assets?.find(a=>a.certificate?.tokenId===String(input.tokenId))?.releaseId || null; return await (await import('./releases.mjs')).transferRelease(ctx,state,{tokenId:input.tokenId,to:input.to,releaseId:hint||input.releaseId}); }
           if(input.action==='commit')return await commitOrder(ctx,state);
          if(input.action==='refund')return await withdrawRefund(ctx,state,input.exchangeId);
          if(input.action==='pause'||input.action==='unpause'){
            const proposal=await safeProposal(ctx,ctx.manifest.nft,ctx.nft.interface.encodeFunctionData(input.action));
            const receipt=await executeSafe(ctx,proposal);audit(input.action,{tx:receipt.hash,approvals:3});return{tx:receipt.hash,paused:await ctx.nft.paused()};
          }
          return await transitionOrder(ctx,state,input.exchangeId,input.action);
        }finally{active=null;}
      });
      const result=await work;send(res,200,{ok:true,result});return;
    }
    if(req.method==='POST'&&url.pathname==='/api/studio-release'){
      if(req.headers['x-studio-token']!==studioToken){send(res,403,{error:'Studio authentication required'});return;}
      const input=await body(req);
      const asset=isBase?registeredProject(input.project):null;
      if(Object.keys(input).some(k=>!['project','acceptanceReceiptSha256'].includes(k))||(!asset&&path.resolve(input.project||'')!==PROJECT))
        throw new Error('Unregistered studio project');
      const work=enqueue(async()=>{
        active='studio-release';
        try{
          if(!ctx.nft)throw new Error('Public deployment pending');
          const passport=preparePassport(asset?.project||PROJECT);
          if(passport.acceptanceReceiptSha256!==input.acceptanceReceiptSha256)throw new Error('Acceptance changed before publication');
          return await (asset?syncCertificate(ctx,state,asset):mintRelease(ctx,state));
        }finally{active=null;}
      });send(res,200,{ok:true,result:await work});return;
    }
    const assets={'/':isBase?'studio.html':'index.html','/studio':'studio.html','/studio.mjs':'studio.mjs','/studio-i18n.mjs':'studio-i18n.mjs','/intent-client.mjs':'intent-client.mjs','/studio.css':'studio.css','/legacy':'index.html','/app.mjs':'app.mjs','/style.css':'style.css'};
    if(req.method==='GET'&&assets[url.pathname]){
      const mime=assets[url.pathname].endsWith('.html')?'text/html':assets[url.pathname].endsWith('.mjs')?'text/javascript':'text/css';
      let content=fs.readFileSync(path.join(ROOT,'public',assets[url.pathname]),'utf8');
      if(isBase&&['/','/legacy'].includes(url.pathname))content=content.replace('LOCAL TESTNET FORK','PUBLIC BASE SEPOLIA').replace('<strong>Sandbox environment.</strong>','<strong>Public testnet.</strong>').replace('<div class="hero-actions">','<div class="hero-actions"><button id="deploy" class="small" disabled>Deploy test contracts</button>').replace('Real EVM execution and official Boson contracts on a local fork of Base Sepolia. Transactions are local; credits have no monetary value.','Public Base Sepolia chain 84532. Receipts verify NFT ownership and Boson orders on this public blockchain. Deployment and confirmation status appear below. Test ETH and DEMO credits have no monetary value.').replace('Base Sepolia source · local chain 31337','Public Base Sepolia · chain 84532').replace('Export contract addresses, the fork block, NFT fingerprints and Boson order transactions. Public-network execution is explicitly marked as pending.','Export public Base contract addresses, NFT fingerprints and confirmed Boson order receipts.');
      if(isBsc&&url.pathname==='/')content=content.replace('LOCAL TESTNET FORK','PUBLIC BSC TESTNET').replace('/app.mjs','/bsc-app.mjs')
        .replace('Real EVM execution and official Boson contracts on a local fork of Base Sepolia. Transactions are local; credits have no monetary value.','BSC Testnet chain 97. Public transactions appear in BscScan after deployment; tBNB has no monetary value. NFT state is verified against the public RPC.')
        .replace('Base Sepolia source · local chain 31337','Public BSC Testnet · chain 97')
        .replace('Export contract addresses, the fork block, NFT fingerprints and Boson order transactions. Public-network execution is explicitly marked as pending.','Export public BSC contract addresses, NFT fingerprints and confirmed transaction receipts. Deployment status is reported separately.')
        .replace('id="mint"','id="mint"').replace('id="commerce"','id="commerce" hidden');
      send(res,200,content,mime);return;
    }
    if(req.method==='GET'&&url.pathname==='/bsc-app.mjs'){send(res,200,fs.readFileSync(path.join(ROOT,'public/bsc-app.mjs'),'utf8'),'text/javascript');return;}
    send(res,404,{error:'Not found'});
  }catch(error){send(res,400,{ok:false,error:error.shortMessage||error.message||'Demo operation failed'});}
});
server.requestTimeout=30000;server.headersTimeout=10000;
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
save('server-info.json',{url:origin,pid:process.pid,mode:NETWORK,instanceId});
fs.writeFileSync(path.join(DEMO_HOME,isBase?'BASE_DEMO_URL.txt':isBsc?'BSC_DEMO_URL.txt':'DEMO_URL.txt'),origin+'\n'+(isBase?'Public Base Sepolia chain 84532.':isBsc?'Public BSC Testnet; inspect deploymentReady for readiness.':'Local fork, no public-network transactions.')+'\n',{mode:0o600});
console.log(`AIMmontag blockchain demo ready: ${origin} (${NETWORK}, test only)`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{server.close();await queue;if(ctx.evm)await ctx.evm.disconnect();else ctx.provider.destroy();process.exit(0);});
