import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { ROOT } from './compile.mjs';
import { RUNTIME,load,save,hash,safeProposal,executeSafe } from './chain.mjs';
import { preparePassport,mintRelease,sha } from './releases.mjs';
import { createMarketOffer,commitOrder,transitionOrder,withdrawRefund,withdrawSeller } from './boson.mjs';
import { audit } from './security.mjs';
import { validateMarketAction } from './market-schema.mjs';
import { runIdempotent,requestMatches } from './idempotency.mjs';
import { checkedAssetFile,verifyDelivery,createDeliveryVault } from './delivery.mjs';
import { approveDelivery } from './commerce-policy.mjs';
import { emitKernelEvent, emitOrderKernelEvent, emitDeliveryKernelEvent } from './station-kernel-bridge.mjs';
import {reconcilePurchases} from './purchase-recovery.mjs';
import {verifyAssetPublication} from './asset-publication.mjs';
import {assertRuntimeBoson} from './boson-implementation.mjs';

export const market=load('marketplace.json',{schemaVersion:2,paused:false,assets:[],listings:[],timeline:[],requests:{}});
const delivery=createDeliveryVault();
function persist(){save('marketplace.json',market);}
export function marketEvent(type,title,details={}){ try{emitKernelEvent({type:'market:'+type,title,...details,chainId:84532});}catch{}
  const entry={at:new Date().toISOString(),type,title,...details};market.timeline.unshift(entry);market.timeline=market.timeline.slice(0,150);
  audit('market-'+type,{title,...details});persist();
}
export function publicMarket(){return {schemaVersion:market.schemaVersion,paused:market.paused,
  assets:market.assets.map(({id,kind,title,sha256,quality,releaseId,certificate,createdAt})=>({id,kind,title,sha256,quality,releaseId,certificate,createdAt,
    previewUrl:kind==='video'?'/api/market/preview/'+id:null})),
  listings:market.listings,timeline:market.timeline,deliveryPolicy:'Redeemed/completed on-chain buyer; fingerprint; 60-second single-use grant',transfer:'NFT transfer via ERC721 transferFrom (owner signer) + transfer:kernel event + no-replay guard',
  commercePolicy:'Three verified EIP-712 approvals bind Base, role, target, calldata, implementation digest, nonce and expiry; final pre-broadcast verification; demo EOAs send; same-Mac custody'};}
export async function initializeMarket(ctx,state){
  if(market.listings.some(l=>l.id==='legacy-service')){await recoverMarketPurchases(ctx,state);return;}
  const result=await ctx.boson.getOffer(state.offerId);if(!result.exists)throw new Error('Original demo offer missing');
  market.listings.push({id:'legacy-service',kind:'service',title:'Монтаж видео · исходное демо',description:'Готовое тестовое предложение монтажной студии.',
    price:'25',quantity:Number(result.offer.quantityAvailable),terms:'Testnet demonstration service only.',assetId:null,assetSha256:null,certificate:null,
    metadataHash:result.offer.metadataHash,offerId:state.offerId,status:'PUBLISHED',createdAt:new Date().toISOString()});persist();await recoverMarketPurchases(ctx,state);
}
export async function recoverMarketPurchases(ctx,state){
  await assertRuntimeBoson(ctx);
  const records=[...load('public-receipts.json',[]),...load('confirmed-intents.json',[])];
  const unique=[...new Map(records.map(record=>[record.tx,record])).values()];
  return reconcilePurchases(ctx,state,market,unique,{persistState:()=>save('state.json',state),persistMarket:persist,
    onRecovered:order=>marketEvent('purchase-recovered','Покупка восстановлена по двум публичным RPC',{exchangeId:order.exchangeId,tx:order.txs[0].tx})});
}
function runPython(args){return new Promise((resolve,reject)=>{
  const child=spawn('python3',args,{cwd:ROOT,stdio:['ignore','pipe','pipe']});let out='',err='';
  const timer=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('Demo export timed out'));},150000);
  child.stdout.on('data',b=>{out+=b;if(out.length>32768)child.kill('SIGTERM');});child.stderr.on('data',b=>{err=(err+b).slice(-4000);});
  child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(new Error('Demo export failed: '+err.slice(-500)));else{try{resolve(JSON.parse(out));}catch{reject(new Error('Invalid export report'));}}});
});}
async function renderAsset(ctx,input){
  if(market.assets.length>=20)throw new Error('Demo asset limit reached');
  const id=crypto.randomUUID(),project=path.join(RUNTIME,'market-assets',id);
  marketEvent('render-start','Студия: начата сборка демо-ресурса',{assetId:id,kind:input.kind});
  const result=await runPython([path.join(ROOT,'scripts/render-market-asset.py'),project,input.kind,input.title,ctx.wallets.seller.address,String(20+market.assets.length*8)]);
  const passport=preparePassport(project);
  if(passport.videoSha256!==result.sha256)throw new Error('Export acceptance fingerprint mismatch');
  const asset={id,kind:input.kind,title:input.title,project,...result,createdAt:new Date().toISOString()};
  checkedAssetFile(asset);market.assets.unshift(asset);persist();
  marketEvent('render-confirmed','Студия: файл создан и технически проверен',{assetId:id,kind:input.kind,sha256:asset.sha256});
  return publicMarket().assets.find(a=>a.id===id);
}
export function registeredProject(project){const resolved=path.resolve(project||'');return market.assets.find(a=>path.resolve(a.project)===resolved);}
export async function syncCertificate(ctx,state,asset){
  checkedAssetFile(asset);
  const record=await mintRelease(ctx,state,{project:asset.project,kind:asset.kind});
  if(record.videoSha256!==asset.sha256)throw new Error('Certificate fingerprint mismatch');
  asset.certificate={tokenId:record.tokenId,contract:ctx.manifest.nft,owner:record.currentOwner||record.owner,tx:record.tx,explorer:record.explorer,chainId:84532};persist();
  marketEvent('nft-confirmed','NFT-паспорт подтверждён в Base Sepolia',{assetId:asset.id,tokenId:record.tokenId,tx:record.tx});
  return record;
}
async function publishListing(ctx,state,input){
  if(market.listings.length>=50)throw new Error('Demo listing limit reached');
  let asset=null,certificate=null;
  if(input.assetId){asset=market.assets.find(a=>a.id===input.assetId);if(!asset||asset.kind!==input.kind)throw new Error('Listing asset/category mismatch');checkedAssetFile(asset);
    ({certificate}=await verifyAssetPublication(ctx,asset));}
  const terms=input.kind==='physical'?'Testnet item only; no real shipment or money.':input.kind==='service'?'Testnet service demonstration; no real commission or payment.':'Demo file access license; no copyright transfer. NFT passport stays with creator.';
  const listing={id:crypto.randomUUID(),kind:input.kind,title:input.title,description:input.description,price:input.price,quantity:input.quantity,
    terms,assetId:asset?.id||null,assetSha256:asset?.sha256||null,certificate,createdAt:new Date().toISOString()};
  const result=await createMarketOffer(ctx,state,listing);
  market.listings.unshift({...listing,...result,status:'PUBLISHED'});persist();try{emitKernelEvent({type:'offer',offerId:result.offerId||result.id,listingId:listing.id,kind:listing.kind,chainId:84532});}catch{}
  marketEvent('listing-confirmed','Предложение опубликовано в Boson',{listingId:listing.id,offerId:result.offerId,kind:input.kind,tx:result.tx});
  return market.listings[0];
}
export async function handleMarketAction(ctx,state,raw){
  const input=validateMarketAction(raw);
  if(ctx.manifest.chainId!==84532||!ctx.manifest.publicTransactions||!ctx.boson)throw new Error('Marketplace requires deployed public Base Sepolia');
  await ctx.assertChain();
  // Delivery grants are short-lived capabilities; never persist them in idempotency or public evidence.
  if(input.action==='delivery'){
    const verified=await verifyDelivery(ctx,state,market,input.exchangeId);
    const binding={exchangeId:input.exchangeId,assetId:verified.asset.id,sha256:verified.asset.sha256};
    market.deliveryNonce=(market.deliveryNonce||0)+1;persist();await approveDelivery(ctx,binding,market.deliveryNonce);
    const grant=delivery.issue(binding);
    const releaseId = verified.asset.releaseId || verified.order.listingId || null;
    const channelId = verified.listing.channelId || verified.asset.channelId || ctx.manifest.channelId || undefined;
    if (channelId && !String(channelId).startsWith('UC')) throw new Error('Invalid channel binding');
    // fail-closed: kernel delivery events must persist; do not swallow write/bridge failures
    emitKernelEvent({type:'delivery:grant-issued', exchangeId:String(input.exchangeId), assetId:verified.asset.id, assetSha256:verified.asset.sha256, listingId:verified.listing.id, releaseId, channelId, chainId:ctx.manifest.chainId||84532});
    emitDeliveryKernelEvent({exchangeId:String(input.exchangeId),assetId:verified.asset.id,assetSha256:verified.asset.sha256,releaseId,listingId:verified.listing.id,channelId,chainId:ctx.manifest.chainId||84532});
    return {...grant,filename:path.basename(verified.file),sha256:verified.asset.sha256};
  }
  const prior=market.requests[input.idempotencyKey];
  if(requestMatches(prior,input)&&['pending','failed'].includes(prior.status)&&input.action==='buy')await recoverMarketPurchases(ctx,state);
  return runIdempotent(market.requests,input,async()=>{
    const previous=ctx.marketRequest;ctx.marketRequest={key:input.idempotencyKey,digest:hash(JSON.stringify(input)),action:input.action};
    try{
     if(input.action==='render')return renderAsset(ctx,input);
     if(input.action==='mint'){const asset=market.assets.find(a=>a.id===input.assetId);if(!asset)throw new Error('Unknown studio asset');return syncCertificate(ctx,state,asset);}
     if(input.action==='transfer'){ const {transferRelease}=await import('./releases.mjs'); const s=load('state.json',{releases:[]}); const assetForRelease = input.assetId ? market.assets.find(a=>a.id===input.assetId) : null; const stateForRelease = s.releases.find(r=>String(r.tokenId)===String(input.tokenId))?.releaseId || null; const releaseHint = input.releaseId || assetForRelease?.releaseId || stateForRelease || null; const r=await transferRelease(ctx,state,{tokenId:input.tokenId,to:input.to,releaseId:releaseHint}); marketEvent('transfer', 'NFT передан', {tokenId:String(input.tokenId), to:input.to, tx:r.tx||null, releaseId: releaseHint}); return r; }
     if(input.action==='list')return publishListing(ctx,state,input);
    if(input.action==='buy'){const listing=market.listings.find(l=>l.id===input.listingId);if(!listing)throw new Error('Unknown listing');
      const order=await commitOrder(ctx,state,listing);marketEvent('purchase-confirmed','Покупка подтверждена: Boson rNFT получен',{listingId:listing.id,exchangeId:order.exchangeId,tx:order.txs[0].tx});return order;}
    if(input.action==='pauseMarket'){const current=await ctx.nft.paused();let tx=null;
      if(current!==input.paused){const proposal=await safeProposal(ctx,ctx.manifest.nft,ctx.nft.interface.encodeFunctionData(input.paused?'pause':'unpause'));tx=(await executeSafe(ctx,proposal)).hash;}
      market.paused=input.paused;persist();marketEvent('pause','Safe: '+(input.paused?'новые продажи остановлены':'работа возобновлена'),{paused:input.paused,tx});return {paused:input.paused,tx};}
    if(input.action==='withdrawSeller'){const result=await withdrawSeller(ctx,state);marketEvent('seller-withdrawn','Средства продавца выведены в кошелёк',{tx:result.tx,amount:result.amount});return result;}
    const order=input.action==='refund'?await withdrawRefund(ctx,state,input.exchangeId):await transitionOrder(ctx,state,input.exchangeId,input.action);
    marketEvent('order-'+input.action,'Заказ: '+input.action,{exchangeId:order.exchangeId,tx:order.txs.at(-1).tx});return order;
    }finally{ctx.marketRequest=previous;}
  },persist);
}
export async function consumeDelivery(ctx,state,token){
  const grant=delivery.consume(token),verified=await verifyDelivery(ctx,state,market,grant.exchangeId);
  if(verified.asset.id!==grant.assetId||verified.asset.sha256!==grant.sha256)throw new Error('Delivery binding changed');
  return verified;
}
export function previewFile(id){const asset=market.assets.find(a=>a.id===id&&a.kind==='video');if(!asset?.preview)throw new Error('Unknown preview');
  const file=fs.realpathSync(asset.preview),base=fs.realpathSync(path.join(RUNTIME,'market-assets'));
  if(!file.startsWith(base+path.sep))throw new Error('Preview path escaped');return file;}
