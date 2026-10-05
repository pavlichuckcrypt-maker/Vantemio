// Read-only acceptance verification. Never exports or signs with MetaMask keys.
import fs from 'node:fs';import path from 'node:path';
import {fileURLToPath} from 'node:url';import {Contract,JsonRpcProvider,FetchRequest,getAddress} from 'ethers';
import {openUserDatabase} from '../auditor-site/user-database.mjs';import {createUserStore} from '../auditor-site/user-store.mjs';
import {bosonABI} from '../src/chain.mjs';import {assertWalletTransaction,createWalletMarket} from '../auditor-site/wallet-market.mjs';
import {assertWalletReceiptAgreement} from '../src/wallet-receipt.mjs';import {readVerifiedBytes} from '../src/verified-file.mjs';import {assertPublicEvidence} from '../src/public-evidence.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),account=getAddress('0x98539cf1e88f2621705644061881bD42e10C5E92');
const database=await openUserDatabase({moduleRoot:root}),store=await createUserStore(database,{origin:'http://127.0.0.1:18340'});let market;
const manifest=JSON.parse(fs.readFileSync(path.join(root,'evidence/BASE_DEPLOYMENT_MANIFEST.json'))),ledger=await store.ledger(account);
const order=ledger.orders.find(o=>getAddress(o.account)===account&&o.exchangeId==='261');
if(!order||order.offerId!=='138'||order.price!=='25'||!order.deliveredSha256)throw Error('Expected actual MetaMask order and delivery missing');
const urls=['https://sepolia.base.org','https://base-sepolia-rpc.publicnode.com'],providers=urls.map(url=>{const r=new FetchRequest(url);r.timeout=20000;return new JsonRpcProvider(r,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});});
try{
  const transactions=[];
  for(const action of ['commit','redeem','complete']){
    const i=ledger.intents.find(i=>getAddress(i.account)===account&&i.action===action&&i.exchangeId==='261'&&i.status==='CONFIRMED');if(!i)throw Error('Confirmed wallet action missing: '+action);
    const views=await Promise.all(providers.map(async rpc=>{const receipt=await rpc.getTransactionReceipt(i.hash),tx=await rpc.getTransaction(i.hash);assertWalletTransaction(tx,i);return{tx,receipt,canonicalBlockHash:receipt?(await rpc.getBlock(receipt.blockNumber))?.hash:null,latestBlock:await rpc.getBlockNumber()};}));
    const receipt=assertWalletReceiptAgreement(views,i.hash);if(receipt.status!==1)throw Error('Reverted actual wallet action');
    transactions.push({action,hash:i.hash,block:receipt.blockNumber,blockHash:receipt.blockHash,from:views[0].tx.from,to:views[0].tx.to,nonce:views[0].tx.nonce,gasLimit:String(views[0].tx.gasLimit),gasUsed:String(receipt.gasUsed),exactIntentMatched:true});
  }
  const block=Math.min(...await Promise.all(providers.map(p=>p.getBlockNumber())))-2;
  const states=await Promise.all(providers.map(async rpc=>{
    const boson=new Contract(manifest.sourceBoson,bosonABI(),rpc),credit=new Contract(manifest.credit,['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)'],rpc),nft=new Contract(manifest.nft,['function ownerOf(uint256) view returns(address)'],rpc);
    const [header,ex,buyer,code,nonce,balance,allowance,owner]=await Promise.all([rpc.getBlock(block),boson.getExchange('261',{blockTag:block}),boson.getBuyer(order.buyerId,{blockTag:block}),rpc.getCode(account,block),rpc.getTransactionCount(account,block),credit.balanceOf(account,{blockTag:block}),credit.allowance(account,manifest.sourceBoson,{blockTag:block}),nft.ownerOf(8,{blockTag:block})]);
    if(Number(await rpc.send('eth_chainId',[]))!==84532||!ex.exists||Number(ex.exchange.state)!==4||String(ex.exchange.offerId)!=='138'||String(ex.exchange.buyerId)!==order.buyerId||!buyer.exists||getAddress(buyer.buyer.wallet)!==account||code!=='0x'||balance!==75000000000000000000n||allowance!==0n)throw Error('Wallet/order chain bindings changed');
    return{blockHash:header.hash,exchangeState:'COMPLETED',buyerId:order.buyerId,nonce,balance:String(balance),allowance:String(allowance),authorNFT8Owner:owner,standardAccount:true};
  }));
  if(JSON.stringify(states[0])!==JSON.stringify(states[1]))throw Error('Independent state disagreement');
  const marketplace=JSON.parse(fs.readFileSync(path.join(root,'runtime-base/marketplace.json'))),asset=marketplace.assets.find(a=>a.id===order.assetId);
  if(!asset||asset.sha256!==order.deliveredSha256||asset.sha256!==order.assetSha256||getAddress(asset.certificate.owner)!==getAddress(states[0].authorNFT8Owner))throw Error('Asset/NFT bindings changed');
  const downloaded=process.env.VIDRA_VERIFIED_DOWNLOAD;if(!downloaded)throw Error('VIDRA_VERIFIED_DOWNLOAD required');
  const verified=readVerifiedBytes(downloaded,asset.sha256,{root:path.dirname(downloaded)});
  market=await createWalletMarket(root,{store});const marketState=await market.state(account);if(marketState.orders.find(o=>o.exchangeId==='261')?.state!==4)throw Error('Live wallet adapter mismatch');
  const superseded=ledger.intents.find(i=>getAddress(i.account)===account&&i.action==='approve'&&i.status==='SUPERSEDED');if(!superseded?.retirement)throw Error('Historical approval recovery missing');
  const report={schemaVersion:1,status:'passed',verifiedAt:new Date().toISOString(),testOnly:true,chainId:84532,actualMetaMaskExtension:true,browser:'Normal Google Chrome',profile:'VidRa AI · Base Sepolia Demo',account,offerId:'138',exchangeId:'261',priceDEMO:'25',creditContract:manifest.credit,boson:manifest.sourceBoson,nftTokenId:'8',canonicalBlock:block,rpcProviders:2,minimumConfirmations:3,...states[0],transactions,downloadBytes:verified.bytes.length,assetSha256:verified.sha256,exactBrowserDownloadVerified:true,externalPrivateKeyStoredByServer:false,seedBackupConfirmed:false,approvalRecovery:superseded.retirement,relayReceiptAccepted:false,verificationChainWrites:0,limits:['Only Base Sepolia test assets','Smart-account relayed receipts are unsupported; choose test ETH in MetaMask network fee options','Existing managed-wallet video is historical; this report verifies the additional actual MetaMask workflow','All Safe demo signers remain on one Mac']};
  assertPublicEvidence(report);fs.writeFileSync(process.env.VIDRA_VERIFICATION_REPORT||path.join(root,'runtime-site/METAMASK_MULTIUSER_READONLY_VERIFICATION.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,account,exchangeId:'261',exchangeState:'COMPLETED',transactions:transactions.length,downloadSha256:verified.sha256,rpcProviders:2}));
}finally{market?.close();for(const p of providers)p.destroy();await database.close();}
