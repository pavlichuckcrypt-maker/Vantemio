// Non-custodial Base Sepolia adapter. External wallets sign transactions.
// Three local test reviewers sign transient policy data only, never transactions.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {Contract,JsonRpcProvider,FetchRequest,getAddress,parseEther,keccak256,toBeHex} from 'ethers';
import {bosonABI} from '../src/chain.mjs';
import {sellerRegistration,sellerOffer,assertSellerOwner,assertSellerOffer} from './seller-contract.mjs';
import {createSellerReviewer} from './seller-review.mjs';
import {sellerReceiptEvent,verifySellerRegistration,verifiedSellerListing,publicSellerListing} from './seller-publication.mjs';
import {deliveryWindow} from './fulfillment.mjs';
import {assertSafeAuthority} from '../src/safe-authority.mjs';
import {assertBosonImplementation} from '../src/boson-implementation.mjs';
import {assertOfferMetadata,assertListingAsset} from '../src/offer-metadata.mjs';
import {offerAvailability} from '../src/offer-availability.mjs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {readVerifiedBytes} from '../src/verified-file.mjs';
import {assertWalletReceiptAgreement} from '../src/wallet-receipt.mjs';

export const ACTIONS={redeem:{method:'redeemVoucher',state:0},complete:{method:'completeExchange',state:3},cancel:{method:'cancelVoucher',state:0},dispute:{method:'raiseDispute',state:3},retract:{method:'retractDispute',state:5}};
export function walletGasLimit(estimate){const gas=BigInt(estimate)*12n/10n+10000n;if(gas>2500000n)throw new Error('Demo gas limit exceeded');return gas;}
export function assertWalletTransaction(tx,intent){
  if(!tx||Number(tx.chainId)!==84532||getAddress(tx.from)!==getAddress(intent.account)
    ||getAddress(tx.to)!==getAddress(intent.tx.to)||tx.data.toLowerCase()!==intent.tx.data.toLowerCase()
    ||BigInt(tx.value)!==0n||BigInt(tx.nonce)!==BigInt(intent.tx.nonce)
    ||BigInt(tx.gasLimit)<=0n||BigInt(tx.gasLimit)>BigInt(intent.tx.gas)||BigInt(tx.gasLimit)>2500000n)throw new Error('Wallet transaction differs from prepared testnet intent');
}
export function assertWalletEntitlement(exchange,buyer,order,listing,account){
  if(!exchange.exists||!buyer.exists||String(exchange.exchange.offerId)!==String(listing.offerId)
    ||String(exchange.exchange.buyerId)!==String(order.buyerId)||getAddress(buyer.buyer.wallet)!==getAddress(account)
    ||![3,4].includes(Number(exchange.exchange.state)))throw new Error('Wallet buyer/offer/state entitlement mismatch');
}
function provider(url){const r=new FetchRequest(url);r.timeout=20000;return new JsonRpcProvider(r,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});}
const same=(a,b)=>getAddress(a)===getAddress(b);
// This retires only an approval whose nonce can no longer execute. It never
// infers a purchase from an allowance or treats a relay hash as our receipt.
export function assertApprovalRetirement(intent,views,{now=Date.now(),price,data,to}={}){
  if(!intent||intent.action!=='approve'||intent.status!=='PREPARED'||intent.hash||!Number.isFinite(intent.expires)||now<intent.expires)throw new Error('Only an expired unbound approval can be retired');
  if(!same(intent.tx.to,to)||intent.tx.data.toLowerCase()!==data.toLowerCase()||BigInt(intent.tx.value)!==0n||BigInt(intent.tx.chainId)!==84532n)throw new Error('Approval bindings changed');
  if(!Array.isArray(views)||views.length!==2)throw new Error('Two canonical approval views required');
  for(const v of views)if(v.chainId!==84532||!/^0x[\da-fA-F]{64}$/.test(v.blockHash||'')||v.blockHash!==views[0].blockHash||!Number.isSafeInteger(v.block)||v.block<0||v.block!==views[0].block||!Number.isSafeInteger(v.latestBlock)||v.latestBlock-v.block+1<3||BigInt(v.nonce)<=BigInt(intent.tx.nonce)||BigInt(v.allowance)!==parseEther(price))throw new Error('Approval retirement evidence mismatch');
  return {chainId:84532,block:views[0].block,blockHash:views[0].blockHash,nonce:views.map(v=>String(v.nonce)),allowance:views.map(v=>String(v.allowance))};
}
export async function createWalletMarket(moduleRoot,{store,accounts,assets}={}){
  if(!store)throw new Error('Persistent wallet store required');
  const ledgerFile=path.join(moduleRoot,'runtime-site/wallet-market.json');
  if(fs.existsSync(ledgerFile))await store.importLegacy(JSON.parse(fs.readFileSync(ledgerFile,'utf8')));
  const context=new AsyncLocalStorage();
  const ledger=new Proxy({}, {get(_target,key){const value=context.getStore();if(!value)throw new Error('Wallet scope required');return value.ledger[key];}});
  const persist=()=>context.getStore().persist();
  const manifest=JSON.parse(fs.readFileSync(path.join(moduleRoot,'evidence/BASE_DEPLOYMENT_MANIFEST.json'),'utf8'));
  if(manifest.chainId!==84532||!manifest.publicTransactions)throw new Error('Only public Base Sepolia allowed');
  const providers=[provider('https://sepolia.base.org'),provider('https://base-sepolia-rpc.publicnode.com')],p=providers[0];
  const orchestration=JSON.parse(fs.readFileSync(path.join(moduleRoot,'node_modules/@bosonprotocol/common/src/abis/IBosonOrchestrationHandler.json'),'utf8'));
  const boson=new Contract(manifest.sourceBoson,[...bosonABI(),...orchestration],p),credit=new Contract(manifest.credit,['function allowance(address,address) view returns(uint256)','function balanceOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)'],p);
  const nft=new Contract(manifest.nft,['function paused() view returns(bool)','function ownerOf(uint256) view returns(address)'],p);
  const safe=new Contract(manifest.safe,['function getOwners() view returns(address[])','function getThreshold() view returns(uint256)','function getModulesPaginated(address,uint256) view returns(address[],address)'],p);
  const ctx={provider:p,manifest,safe},reviewSeller=createSellerReviewer(manifest,boson.interface,{creditInterface:credit.interface});
  const pin=JSON.parse(fs.readFileSync(path.join(moduleRoot,'boson-implementation.json'),'utf8'));
  const atomicReady=pin.digest===manifest.sourceBosonImplementationDigest&&pin.snapshot.facets.some(f=>f.selectors.includes(boson.interface.getFunction('commitToOfferAndRedeemVoucher').selector.toLowerCase()));
  function registry(){const m=JSON.parse(fs.readFileSync(path.join(moduleRoot,'runtime-base/marketplace.json'),'utf8')),
    s=JSON.parse(fs.readFileSync(path.join(moduleRoot,'runtime-base/state.json'),'utf8'));return {m,s};}
  async function checkedBlock({sale=false}={}){
    for(const rpc of providers)if(Number(await rpc.send('eth_chainId',[]))!==84532)throw new Error('Wrong RPC chain');
    const block=await p.getBlock('latest');
    if(!block?.hash)throw new Error('Missing block');
    if((await providers[1].getBlock(block.number))?.hash!==block.hash)throw new Error('RPC canonical block mismatch');
    await assertSafeAuthority(ctx,{blockTag:block.number});await assertBosonImplementation(p,manifest,{blockTag:block.number});
    if(keccak256(await p.getCode(manifest.credit,block.number))!==manifest.creditCodeHash||keccak256(await p.getCode(manifest.nft,block.number))!==manifest.nftCodeHash)throw new Error('Pinned token code changed');
    if(sale&&(await nft.paused({blockTag:block.number})||registry().m.paused))throw new Error('New sales paused');return block;
  }
  async function listing(id,block,{delivery=false}={}){
    if(accounts){const [l]=await accounts.published(id);if(l){
      const r=await boson.getOffer(l.offerId,{blockTag:block.number}),seller=await boson.getSeller(l.sellerId,{blockTag:block.number});
      assertSellerOwner(seller,l.sellerWallet,{sellerId:l.sellerId});assertSellerOffer(r,l.spec,{sellerId:l.sellerId,offerId:l.offerId,allowVoided:delivery});
      if(l.assetId){const a=await accounts.assetForOwner(l.memberId,l.assetId);if(a.sha256!==l.assetSha256||a.bytes!==l.assetBytes||!a.ready)throw new Error('Seller asset binding changed');assets.verified(a);}
      return {l,r,m:null};
    }}
    const {m,s}=registry(),l=m.listings.find(v=>v.id===id);
    if(!l||l.status!=='PUBLISHED')throw new Error('Unknown published listing');
    const r=await boson.getOffer(l.offerId,{blockTag:block.number});
    if(!r.exists||String(r.offer.sellerId)!==String(s.sellerId)||!same(r.offer.exchangeToken,manifest.credit)
      ||r.offer.price!==parseEther(l.price)||r.offer.sellerDeposit!==0n||r.offer.buyerCancelPenalty!==0n)throw new Error('Offer bindings changed');
    assertOfferMetadata(l,r.offer,{legacyOfferId:s.offerId});
    if(l.assetId){const a=m.assets.find(v=>v.id===l.assetId);assertListingAsset(l,a);
      if(!a?.certificate||!same(await nft.ownerOf(a.certificate.tokenId,{blockTag:block.number}),a.certificate.owner))throw new Error('Author NFT ownership changed');}
    return {l,r,m};
  }
  async function exclusive(account,fn){return store.exclusive(account,(account,ledger,persist)=>context.run({ledger,persist},()=>fn(account)));}
  let readBlock=null,readBlockInflight=null;
  async function snapshotBlock(){
    if(readBlock&&Date.now()-readBlock.at<10000)return readBlock.block;
    if(readBlockInflight)return readBlockInflight;
    readBlockInflight=checkedBlock().then(block=>{readBlock={block,at:Date.now()};return block;});
    try{return await readBlockInflight;}finally{readBlockInflight=null;}
  }
  async function orderView(order,account,block){
    if(!same(order.account,account))throw new Error('Wrong order owner');
    const ex=await boson.getExchange(order.exchangeId,{blockTag:block.number}),buyer=await boson.getBuyer(order.buyerId,{blockTag:block.number});
    if(!ex.exists||!buyer.exists||!same(buyer.buyer.wallet,account)||String(ex.exchange.buyerId)!==String(order.buyerId)||String(ex.exchange.offerId)!==order.offerId)throw new Error('Order ownership changed');
    return {...order,state:Number(ex.exchange.state),...(order.fulfillment&&Number(ex.voucher?.redeemedDate)>0?{deliveryWindow:deliveryWindow(order.fulfillment,Number(ex.voucher.redeemedDate)*1000)}:{})};
  }
  async function prepare(account,{key,action,listingId,exchangeId,productId,revision},auth=null){return exclusive(account,async account=>{
    if(typeof key!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(key))throw new Error('Durable idempotency key required');
    if(!['approve','commit','seller-create','seller-publish','seller-withdraw',...Object.keys(ACTIONS)].includes(action))throw new Error('Unknown wallet action');
    const digest=crypto.createHash('sha256').update(JSON.stringify({account,action,listingId:listingId||null,exchangeId:exchangeId||null,productId:productId||null,revision:revision??null})).digest('hex');
    const old=ledger.intents.find(i=>i.key===key);if(old){const legacy=crypto.createHash('sha256').update(JSON.stringify({account,action,listingId:listingId||null,exchangeId:exchangeId||null})).digest('hex');if(old.digest!==digest&&!(productId===undefined&&revision===undefined&&!action.startsWith('seller-')&&old.digest===legacy))throw new Error('Idempotency parameters changed');return old;}
    if(ledger.intents.length>=2000)throw new Error('Wallet history limit');
    if(ledger.intents.some(i=>same(i.account,account)&&['PREPARED','SUBMITTED'].includes(i.status)))throw new Error('Previous wallet intent must be reconciled first');
    const block=await checkedBlock({sale:['approve','commit','seller-create','seller-publish'].includes(action)});let contract,args,method,title,price='0',l=null,order=null,sellerContext=null;
    if(await p.getCode(account,block.number)!=='0x')throw new Error('This demo requires a standard wallet account on Base Sepolia; smart-account relay receipts are not supported');
    if(action.startsWith('seller-')){
      if(!accounts||!assets||auth?.mode!=='wallet')throw new Error('Verified seller wallet session required');
      const member=await accounts.resolve(auth);if(action!=='seller-withdraw'&&!member.roles.seller||!same(member.wallet,account))throw new Error('Verified seller profile required');
      contract=boson;title='Boson seller';const record=await boson.getSellerByAddress(account,{blockTag:block.number});
      if(action==='seller-create'){if(record.exists)throw new Error('Boson seller already registered');const spec=sellerRegistration(member,account);method=spec.method;args=spec.args;sellerContext={memberId:member.id,sellerMetadataUri:args[0].metadataUri};}
      else{const sellerId=assertSellerOwner(record,account);
        if(action==='seller-publish'){
          const snapshot=await accounts.publicationSnapshot(auth,productId,revision,key);if(snapshot.asset)assets.verified(snapshot.asset);
          const reference=await boson.getOffer(registry().s.offerId,{blockTag:block.number}),spec=sellerOffer({...snapshot,account,sellerId,credit:manifest.credit,now:block.timestamp,
            disputePeriod:await boson.getMinDisputePeriod({blockTag:block.number}),resolutionPeriod:await boson.getMinResolutionPeriod({blockTag:block.number}),resolverId:String(reference.disputeResolutionTerms.disputeResolverId)});
          method=spec.method;args=spec.args;title=snapshot.product.title;price=snapshot.product.price;
          sellerContext={memberId:member.id,productId,revision,sellerId,sellerSpec:spec,sellerProduct:snapshot.product,sellerAsset:snapshot.asset};
        }else{const available=await boson.getAllAvailableFunds(sellerId,{blockTag:block.number}),amount=available.find(f=>same(f.tokenAddress,manifest.credit))?.availableAmount||0n;if(amount<=0n)throw new Error('No finalized DEMO funds available');
          method='withdrawFunds';args=[sellerId,[manifest.credit],[amount]];sellerContext={memberId:member.id,sellerId,withdrawAmount:String(amount)};}
      }
    }else if(['approve','commit'].includes(action)){
      const found=await listing(listingId,block);l=found.l;
      const availability=offerAvailability(found.r,block.timestamp);if(!availability.available)throw new Error('Offer unavailable: '+availability.reason);
      price=l.price;title=l.title;
      if(await credit.balanceOf(account,{blockTag:block.number})<parseEther(price))throw new Error('Insufficient test DEMO balance');
      if(action==='approve'){contract=credit;method='approve';args=[manifest.sourceBoson,parseEther(price)];}
      else{if(await credit.allowance(account,manifest.sourceBoson,{blockTag:block.number})<parseEther(price))throw new Error('Approve the exact DEMO price first');contract=boson;const instant=atomicReady&&l.fulfillment?.kind==='digital_instant'&&!!l.assetId;method=instant?'commitToOfferAndRedeemVoucher':'commitToOffer';args=instant?[l.offerId]:[account,l.offerId];}
    }else{
      order=ledger.orders.find(o=>o.exchangeId===String(exchangeId)&&same(o.account,account));if(!order)throw new Error('Unknown wallet order');
      const current=await orderView(order,account,block),rule=ACTIONS[action];
      if(current.state!==rule.state)throw new Error('Invalid wallet order transition');
      if(action==='complete'&&order.assetId&&!order.deliveredSha256)throw new Error('Verified file delivery required');
      contract=boson;method=rule.method;args=[order.exchangeId];title=order.title;price=order.price;
    }
    const data=contract.interface.encodeFunctionData(method,args),tx={from:account,to:await contract.getAddress(),data,value:'0x0',chainId:'0x14a34',nonce:toBeHex(await p.getTransactionCount(account,'pending'))};
    await p.call(tx);tx.gas=toBeHex(walletGasLimit(await p.estimateGas(tx)));
    const review=await reviewSeller(tx,{action,block,binding:sellerContext||{listingId:l?.id||order?.listingId,offerId:l?.offerId||order?.offerId,exchangeId:order?.exchangeId||null,assetSha256:l?.assetSha256||order?.assetSha256||null}});
    if((await p.getBlock('latest')).timestamp>=review.expiresAt||(await p.getBlock(block.number))?.hash!==block.hash||await p.getTransactionCount(account,'pending')!==Number(BigInt(tx.nonce)))throw new Error('Preparation block or nonce changed');
    const intent={id:crypto.randomUUID(),key,digest,account,action,listingId:l?.id||order?.listingId,offerId:l?.offerId||order?.offerId,exchangeId:order?.exchangeId||null,title,price,assetId:l?.assetId||order?.assetId||null,
      assetSha256:l?.assetSha256||order?.assetSha256||null,fulfillment:l?.fulfillment||order?.fulfillment||null,atomicReady:method==='commitToOfferAndRedeemVoucher',...(sellerContext?JSON.parse(JSON.stringify(sellerContext,(_key,value)=>typeof value==='bigint'?String(value):value)):{}),platformReview:review,status:'PREPARED',preparedAt:new Date().toISOString(),expires:Date.now()+120000,tx};
    ledger.intents.push(intent);await persist();return intent;
  });}
  // Recheck immediately before opening the external wallet confirmation. This
  // renews policy review for the SAME calldata/nonce; it never signs, broadcasts,
  // recreates an operation or resumes a locally ambiguous send automatically.
  async function reviewIntent(account,id,auth){return exclusive(account,async account=>{
    const i=ledger.intents.find(v=>v.id===id&&same(v.account,account));if(!i||i.status!=='PREPARED'||i.hash)throw new Error('Only an unbound prepared intent can be reviewed');
    const block=await checkedBlock({sale:['approve','commit','seller-create','seller-publish'].includes(i.action)});
    if(await p.getCode(account,block.number)!=='0x'||await p.getTransactionCount(account,'pending')!==Number(BigInt(i.tx.nonce)))throw new Error('Prepared wallet nonce or account changed');
    if(i.action.startsWith('seller-')){
      const member=await accounts.resolve(auth);if(member.id!==i.memberId||!same(member.wallet,account)||i.action!=='seller-withdraw'&&!member.roles.seller)throw new Error('Prepared seller profile changed');
      const record=await boson.getSellerByAddress(account,{blockTag:block.number});
      if(i.action==='seller-create'){if(record.exists)throw new Error('Seller was registered outside this intent');const spec=sellerRegistration(member,account);if(boson.interface.encodeFunctionData(spec.method,spec.args).toLowerCase()!==i.tx.data.toLowerCase())throw new Error('Prepared seller registration changed');}
      else{assertSellerOwner(record,account,{sellerId:i.sellerId});
        if(i.action==='seller-publish'){const snapshot=await accounts.publicationSnapshot(auth,i.productId,i.revision,i.key);if(snapshot.asset)assets.verified(snapshot.asset);
          const spec=sellerOffer({...snapshot,account,sellerId:i.sellerId,credit:manifest.credit,now:Number(i.sellerSpec.args[1].validFrom)+1,disputePeriod:i.sellerSpec.args[2].disputePeriod,resolutionPeriod:i.sellerSpec.args[2].resolutionPeriod,resolverId:i.sellerSpec.args[3].disputeResolverId});
          if(boson.interface.encodeFunctionData(spec.method,spec.args).toLowerCase()!==i.tx.data.toLowerCase())throw new Error('Prepared product terms or asset changed');}
      }
    }else if(['approve','commit'].includes(i.action)){
      const {l,r}=await listing(i.listingId,block);if(!offerAvailability(r,block.timestamp).available||String(l.offerId)!==i.offerId||l.price!==i.price||l.assetSha256!==i.assetSha256)throw new Error('Prepared purchase offer changed');
      if(await credit.balanceOf(account,{blockTag:block.number})<parseEther(i.price)||i.action==='commit'&&await credit.allowance(account,manifest.sourceBoson,{blockTag:block.number})<parseEther(i.price))throw new Error('Prepared test balance or allowance changed');
    }else{const order=ledger.orders.find(o=>o.exchangeId===i.exchangeId&&same(o.account,account));if(!order||(await orderView(order,account,block)).state!==ACTIONS[i.action]?.state)throw new Error('Prepared order transition changed');if(i.action==='complete'&&order.assetId&&!order.deliveredSha256)throw new Error('Verified file delivery required');}
    await p.call(i.tx);const proof=await reviewSeller(i.tx,{action:i.action,block,binding:{intentId:i.id,operationDigest:i.digest,memberId:i.memberId||null,productId:i.productId||null,assetSha256:i.assetSha256||i.sellerAsset?.sha256||null}});
    if((await p.getBlock(block.number))?.hash!==block.hash||await p.getTransactionCount(account,'pending')!==Number(BigInt(i.tx.nonce))||(await p.getBlock('latest')).timestamp>=proof.expiresAt)throw new Error('Review block, nonce or lifetime changed');
    i.platformReview=proof;i.expires=Math.min(Date.now()+120000,proof.expiresAt*1000);await persist();return i;
  });}
  async function reconcile(account,{id,hash}){return exclusive(account,async account=>{
    const i=ledger.intents.find(v=>v.id===id&&same(v.account,account));if(!i)throw new Error('Unknown wallet intent');
    if(!/^0x[\da-fA-F]{64}$/.test(hash||''))throw new Error('Transaction hash required');
    if(i.hash&&i.hash.toLowerCase()!==hash.toLowerCase())throw new Error('Intent already bound to another transaction');
    if(['CANCELLED','SUPERSEDED'].includes(i.status))throw new Error('Intent cancelled or superseded');
    const results=await Promise.all(providers.map(async rpc=>{const receipt=await rpc.getTransactionReceipt(hash);return {receipt,tx:await rpc.getTransaction(hash)};}));
    // A pasted foreign hash cannot permanently bind this intent. Unknown transactions
    // leave it PREPARED and blocked from a fresh purchase until the owner reconciles it.
    for(const r of results)if(r.tx)assertWalletTransaction(r.tx,i);
    if(!results.some(r=>r.tx))throw new Error('Transaction not visible yet; keep the same intent and retry its hash');
    const wasConfirmed=i.status==='CONFIRMED';if(!wasConfirmed){i.hash=hash;i.status='SUBMITTED';await persist();}
    const views=await Promise.all(results.map(async(r,index)=>({...r,canonicalBlockHash:r.receipt?(await providers[index].getBlock(r.receipt.blockNumber))?.hash:null,latestBlock:await providers[index].getBlockNumber()})));
    const receipt=assertWalletReceiptAgreement(views,hash);if(receipt.status!==1){if(wasConfirmed)throw new Error('Confirmed wallet receipt changed');i.status='REVERTED';await persist();if(i.action==='seller-publish')await accounts.releasePublication(account,i.key);throw new Error('Wallet transaction reverted');}
    if(i.action.startsWith('seller-')){
      await checkedBlock();const tag={blockTag:receipt.blockNumber};await assertBosonImplementation(p,manifest,tag);await assertSafeAuthority(ctx,tag);
      if(i.action==='seller-create'){const e=sellerReceiptEvent(receipt,boson.interface,manifest.sourceBoson,'SellerCreated',account),record=await boson.getSellerByAddress(account,tag);i.sellerId=verifySellerRegistration(record,e,i,account);}
      else if(i.action==='seller-publish'){const e=sellerReceiptEvent(receipt,boson.interface,manifest.sourceBoson,'OfferCreated',account),offer=await boson.getOffer(e.offerId,tag),seller=await boson.getSeller(i.sellerId,tag),publication=verifiedSellerListing(offer,seller,e,i,account,receipt);
        await accounts.recordPublication({memberId:i.memberId,wallet:account,productId:i.productId,revision:i.revision,sellerId:i.sellerId,offerId:publication.offerId,transactionHash:hash,blockNumber:receipt.blockNumber,payload:publication});i.offerId=publication.offerId;catalogCache=null;
      }else{const e=sellerReceiptEvent(receipt,boson.interface,manifest.sourceBoson,'FundsWithdrawn',account);assertSellerOwner(await boson.getSeller(i.sellerId,tag),account,{sellerId:i.sellerId});
        if(String(e.entityId)!==i.sellerId||!same(e.withdrawnTo,account)||!same(e.tokenAddress,manifest.credit)||BigInt(e.amount)!==BigInt(i.withdrawAmount))throw new Error('Seller withdrawal recipient or amount changed');}
      if((await providers[1].getBlock(receipt.blockNumber))?.hash!==receipt.blockHash)throw new Error('Seller receipt block changed');
    }
    if(i.action==='commit'){
      const events=receipt.logs.filter(log=>same(log.address,manifest.sourceBoson)).map(log=>{try{return boson.interface.parseLog(log);}catch{return null;}}).filter(e=>e?.name==='BuyerCommitted');
      const e=events.find(e=>String(e.args.offerId)===i.offerId);if(!e||events.length!==1||!same(e.args.executedBy,account))throw new Error('BuyerCommitted event missing or actor changed');
      const tag={blockTag:receipt.blockNumber},record=await boson.getExchange(e.args.exchangeId,tag),buyer=await boson.getBuyer(e.args.buyerId,tag);
      if(!record.exists||!buyer.exists||String(record.exchange.buyerId)!==String(e.args.buyerId)||String(record.exchange.offerId)!==i.offerId||!same(buyer.buyer.wallet,account))throw new Error('Committed buyer or offer changed');
      if(i.atomicReady){const redeemed=sellerReceiptEvent(receipt,boson.interface,manifest.sourceBoson,'VoucherRedeemed',account);if(String(redeemed.exchangeId)!==String(e.args.exchangeId)||![3,4].includes(Number(record.exchange.state)))throw new Error('Atomic redemption receipt changed');}
      const ex=String(e.args.exchangeId);if(!ledger.orders.some(o=>o.exchangeId===ex))ledger.orders.push({account,exchangeId:ex,buyerId:String(e.args.buyerId),offerId:i.offerId,listingId:i.listingId,title:i.title,price:i.price,assetId:i.assetId,assetSha256:i.assetSha256,fulfillment:i.fulfillment||null,atomicReady:!!i.atomicReady,commitTx:hash});
      i.exchangeId=ex;
    }
    i.status='CONFIRMED';i.block=receipt.blockNumber;await persist();if(i.action==='seller-publish')await accounts.releasePublication(account,i.key);return i;
  });}
  async function digitalFile(account,exchangeId){return exclusive(account,async account=>{
    const order=ledger.orders.find(o=>o.exchangeId===String(exchangeId)&&same(o.account,account));if(!order)throw new Error('Unknown wallet order');
    const block=await checkedBlock(),{l,m}=await listing(order.listingId,block,{delivery:true});
    const ex=await boson.getExchange(order.exchangeId,{blockTag:block.number}),buyer=await boson.getBuyer(order.buyerId,{blockTag:block.number});assertWalletEntitlement(ex,buyer,order,l,account);
    if(!['video','digital'].includes(l.kind)||!l.assetId)throw new Error('This item has no digital file');let a,result;
    if(l.source==='seller-wallet'){a=await accounts.assetForOwner(l.memberId,l.assetId);result=assets.verified(a);}
    else{a=m.assets.find(v=>v.id===l.assetId);assertListingAsset(l,a);result=readVerifiedBytes(a.file,a.sha256,{root:path.join(moduleRoot,'runtime-base/market-assets'),maxBytes:64*1024*1024});}
    const {file,bytes}=result;
    const deliveryReview=await reviewSeller.delivery(account,{block,nonce:await p.getTransactionCount(account,'pending'),binding:{chainId:84532,exchangeId:order.exchangeId,offerId:order.offerId,buyerId:order.buyerId,assetSha256:a.sha256,assetBytes:bytes.length}});
    if((await p.getBlock(block.number))?.hash!==block.hash)throw new Error('Delivery block changed');
    return {file,bytes,filename:a.filename||path.basename(file),mime:a.mime||(file.endsWith('.mp4')?'video/mp4':'text/plain'),sha256:a.sha256,order,async confirm(){return exclusive(account,async account=>{const latest=ledger.orders.find(o=>o.exchangeId===order.exchangeId&&same(o.account,account));if(!latest)throw new Error('Unknown wallet order');latest.deliveredSha256=a.sha256;latest.deliveryReview=deliveryReview;await persist();});}};
  });}
  async function retireApproval(account,id){return exclusive(account,async account=>{
    const i=ledger.intents.find(v=>v.id===id&&same(v.account,account));
    if(!i||i.action!=='approve'||i.status!=='PREPARED'||i.hash||Date.now()<i.expires)throw new Error('Only an expired unbound approval can be retired');
    const head=await checkedBlock(),number=head.number-2;
    if(number<0)throw new Error('Missing confirmed block');
    const {l}=await listing(i.listingId,{number});
    const views=await Promise.all(providers.map(async rpc=>{
      const block=await rpc.getBlock(number),token=credit.connect(rpc);
      return {chainId:Number(await rpc.send('eth_chainId',[])),block:number,blockHash:block?.hash,latestBlock:await rpc.getBlockNumber(),nonce:await rpc.getTransactionCount(account,number),allowance:await token.allowance(account,manifest.sourceBoson,{blockTag:number})};
    }));
    const proof=assertApprovalRetirement(i,views,{price:l.price,to:manifest.credit,data:credit.interface.encodeFunctionData('approve',[manifest.sourceBoson,parseEther(l.price)])});
    for(const rpc of providers)if((await rpc.getBlock(number))?.hash!==proof.blockHash)throw new Error('Retirement block changed');
    i.status='SUPERSEDED';i.retiredAt=new Date().toISOString();i.retirement={reason:'confirmed-nonce-consumed-and-exact-allowance',...proof};await persist();return i;
  });}
  async function orderPage(orders,account,block){const result=[];for(let start=0;start<orders.length;start+=4)result.push(...await Promise.all(orders.slice(start,start+4).map(o=>orderView(o,account,block))));return result;}
  let catalogCache=null,catalogInflight=null;
  async function catalog(){if(!accounts)return [];if(catalogCache&&Date.now()-catalogCache.at<10000)return catalogCache.items;if(catalogInflight)return catalogInflight;catalogInflight=(async()=>{const block=await snapshotBlock(),items=await accounts.published(),result=[];for(let start=0;start<items.length;start+=4)result.push(...await Promise.all(items.slice(start,start+4).map(async l=>{try{const verified=await listing(l.id,block);return {...publicSellerListing(verified.l),available:offerAvailability(verified.r,block.timestamp).available};}catch{return {...publicSellerListing(l),available:false,verification:'unavailable'};}})));catalogCache={at:Date.now(),items:result};return result;})();try{return await catalogInflight;}finally{catalogInflight=null;}}
  return {cancelReservation(account,auth,input){return exclusive(account,async account=>{const member=await accounts.resolve(auth);if(!same(member.wallet,account))throw new Error('Publication reservation owner changed');return accounts.cancelUnpreparedPublication(auth,input);});},catalog,prepare,reviewIntent,reconcile,digitalFile,retireApproval,close(){for(const rpc of providers)rpc.destroy();},
    async cancel(account,id){return exclusive(account,async account=>{const i=ledger.intents.find(v=>v.id===id&&same(v.account,account));if(!i||i.status!=='PREPARED'||i.hash)throw new Error('Only an explicitly rejected unsent request can be cancelled');i.status='CANCELLED';await persist();if(i.action==='seller-publish')await accounts.releasePublication(account,i.key);return i;});},
    async state(account){const ledger=await store.ledger(account),block=await snapshotBlock(),sellerRecord=await boson.getSellerByAddress(account,{blockTag:block.number});let seller={registered:false,owned:false,sellerId:null,availableDemo:'0'};
      if(sellerRecord.exists){seller={...seller,registered:true,sellerId:String(sellerRecord.seller.id)};try{assertSellerOwner(sellerRecord,account);seller.owned=true;const funds=await boson.getAllAvailableFunds(seller.sellerId,{blockTag:block.number});seller.availableDemo=String(funds.find(f=>same(f.tokenAddress,manifest.credit))?.availableAmount||0n);}catch{}}
      return {seller,account:getAddress(account),chainId:84532,credit:manifest.credit,balance:(await credit.balanceOf(account,{blockTag:block.number})).toString(),
      orders:await orderPage(ledger.orders.filter(o=>same(o.account,account)).slice(-20),account,block),intents:ledger.intents.filter(i=>same(i.account,account)).sort((a,b)=>a.preparedAt.localeCompare(b.preparedAt)).slice(-20),block:block.number,ordersHasMore:ledger.orders.length>20};}
  };
}
