// No wallet loading, signing, delivery capabilities, production edits or chain writes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Contract,JsonRpcProvider,FetchRequest,keccak256,parseEther} from 'ethers';
import {ROOT} from '../src/compile.mjs';
import {load,bosonABI} from '../src/chain.mjs';
import {BASE_RPC,BASE_CHECK_RPC,assertBase} from '../src/base-chain.mjs';
import {assertOfferMetadata,assertListingAsset} from '../src/offer-metadata.mjs';
import {checkedAssetFile} from '../src/delivery.mjs';
import {verifyAssetPublication} from '../src/asset-publication.mjs';
if(process.env.AIM_DEMO_NETWORK!=='base-sepolia')throw new Error('Explicit Base Sepolia required');
const state=load('state.json'),market=load('marketplace.json'),manifest=load('manifest.json');
if(manifest.chainId!==84532||!manifest.publicTransactions)throw new Error('Public Base manifest required');
const before={receipts:load('public-receipts.json').length,orders:state.orders.length,pending:load('pending.json')};
if(before.pending)throw new Error('Defer binding check while a public transaction is pending');
const providers=[BASE_RPC,BASE_CHECK_RPC].map(url=>{const request=new FetchRequest(url);request.timeout=15000;return new JsonRpcProvider(request,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});});
try{
  await Promise.all(providers.map(assertBase));
  const blockTag=Math.min(...await Promise.all(providers.map(p=>p.getBlockNumber())))-2;
  const blocks=await Promise.all(providers.map(p=>p.getBlock(blockTag)));
  if(!blocks[0]?.hash||blocks[0].hash!==blocks[1]?.hash)throw new Error('RPCs disagree on the binding block');
  const contracts=providers.map(p=>new Contract(manifest.sourceBoson,bosonABI(),p));
  const nfts=providers.map(p=>new Contract(manifest.nft,['function passports(uint256) view returns (bytes32 releaseId, bytes32 videoHash, bytes32 metadataHash, bytes32 termsHash)','function tokenByRelease(bytes32) view returns (uint256)','function ownerOf(uint256) view returns (address)'],p));
  for(const p of providers)for(const [address,expected]of [[manifest.sourceBoson,manifest.sourceBosonCodeHash],[manifest.nft,manifest.nftCodeHash],[manifest.credit,manifest.creditCodeHash]])
    if(keccak256(await p.getCode(address,blockTag))!==expected)throw new Error('Pinned contract code changed');
  const assets=[],negativeCases=[];
  for(const asset of market.assets){
    checkedAssetFile(asset);await verifyAssetPublication({manifest,nft:nfts[0]},asset);
    assets.push({assetId:asset.id,kind:asset.kind,acceptedVersionVerified:true,certificateTokenId:asset.certificate?.tokenId||null});
  }
  const certified=market.assets.find(a=>a.certificate);
  if(certified){
    await assert.rejects(verifyAssetPublication({manifest,nft:nfts[0]},{...certified,certificate:{...certified.certificate,tokenId:'99999999'}}),/Certificate token differs/);
    negativeCases.push('An existing accepted asset cannot publish a substituted cached token; actual NFT mapping was read, no mint or offer was sent.');
  }
  const offers=[];
  for(const listing of market.listings){
    const results=await Promise.all(contracts.map(c=>c.getOffer(listing.offerId,{blockTag})));
    for(const {exists,offer}of results){
      if(!exists||offer.sellerId.toString()!==state.sellerId||offer.exchangeToken.toLowerCase()!==manifest.credit.toLowerCase()||offer.price!==parseEther(listing.price))throw new Error('Offer parameters changed: '+listing.offerId);
      assertOfferMetadata(listing,offer,{legacyOfferId:state.offerId});
    }
    if(results[0].offer.metadataUri!==results[1].offer.metadataUri||results[0].offer.metadataHash!==results[1].offer.metadataHash)throw new Error('RPCs disagree on offer metadata');
    assert.throws(()=>assertOfferMetadata({...listing,terms:listing.terms+' changed after publication'},results[0].offer,{legacyOfferId:state.offerId}));
    negativeCases.push('Offer '+listing.offerId+': modified local conditions refused against its actual public metadata.');
    if(listing.assetId){
      const asset=market.assets.find(a=>a.id===listing.assetId);assertListingAsset(listing,asset);checkedAssetFile(asset);
      if(listing.certificate){
        if(listing.certificate.contract.toLowerCase()!==manifest.nft.toLowerCase())throw new Error('Foreign certificate contract');
        const passports=await Promise.all(nfts.map(c=>c.passports(listing.certificate.tokenId,{blockTag})));
        if(passports.some(p=>p.videoHash.toLowerCase()!=='0x'+listing.assetSha256))throw new Error('NFT content differs from the published file');
      }
    }
    offers.push({offerId:listing.offerId,kind:listing.kind,conditionsAndUriVerified:true,assetSha256:listing.assetSha256,certificateTokenId:listing.certificate?.tokenId||null});
  }
  const finalBlocks=await Promise.all(providers.map(p=>p.getBlock(blockTag)));
  if(finalBlocks.some(b=>b?.hash!==blocks[0].hash))throw new Error('Binding block changed during reads');
  if(load('public-receipts.json').length!==before.receipts||load('state.json').orders.length!==before.orders||load('pending.json'))throw new Error('Live writes overlapped this verification');
  const report={verifiedAt:new Date().toISOString(),status:'passed',chainId:84532,testOnly:true,providersVerified:2,
    block:blockTag,blockHash:blocks[0].hash,offers,assets,offerCount:offers.length,assetCount:assets.length,negativeCases,chainWritesCreated:0,
    receiptCountBefore:before.receipts,receiptCountAfter:load('public-receipts.json').length,
    checks:['official pinned code on two RPCs','displayed category/title/description/terms/file/certificate reconstruct exact Boson hash and data URI','original service migration has pinned metadata and cannot bypass digital binding','delivered asset category/fingerprint/certificate matches the published offer','all studio assets pass fresh acceptance and existing-certificate publication guard without signing','published digital bytes and certificate fingerprints match','same canonical block before and after offer reads'],
    limits:'Read-only current offer/content verification. Negative probes clone local inputs and use actual public contract data with shared runtime guards; they do not submit HTTP purchases or chain writes. Fresh publication guard reads latest NFT data. Historical lifecycle transactions and actual crash recovery are documented separately.'};
  fs.writeFileSync(path.join(ROOT,'evidence/OFFER_BINDING_VERIFICATION.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{providers.forEach(p=>p.destroy());}
