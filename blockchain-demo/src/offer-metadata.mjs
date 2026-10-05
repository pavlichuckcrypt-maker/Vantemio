import {keccak256,toUtf8Bytes} from 'ethers';

const dataUri=bytes=>'data:application/json;base64,'+Buffer.from(bytes).toString('base64');
const legacyMetadata={name:'Video editing / accepted final cut',description:'Testnet demo service; no monetary value',testOnly:true};

export function marketOfferMetadata(listing){
  const metadata={schemaVersion:1,name:listing.title,description:listing.description,category:listing.kind,
    terms:listing.terms,assetSha256:listing.assetSha256||null,certificate:listing.certificate||null,testOnly:true};
  const bytes=JSON.stringify(metadata);
  return {metadata,metadataHash:keccak256(toUtf8Bytes(bytes)),metadataUri:dataUri(bytes)};
}

// Compare the actual displayed conditions with the immutable Boson data URI,
// rather than comparing two saved copies of an opaque hash.
export function assertOfferMetadata(listing,offer,{legacyOfferId}={}){
  if(!listing||listing.id==='legacy-service'){
    if(listing&&(listing.offerId!==legacyOfferId||listing.kind!=='service'||listing.price!=='25'
      ||listing.title!=='Монтаж видео · исходное демо'||listing.description!=='Готовое тестовое предложение монтажной студии.'
      ||listing.terms!=='Testnet demonstration service only.'||listing.assetId!==null||listing.assetSha256!==null
      ||listing.certificate!==null||listing.metadataHash!==''))throw new Error('Original service presentation changed');
    if(offer.metadataHash!==''||offer.metadataUri!==dataUri(JSON.stringify(legacyMetadata)))throw new Error('Original service metadata changed');
    return;
  }
  const expected=marketOfferMetadata(listing);
  if(listing.metadataHash!==expected.metadataHash||offer.metadataHash!==expected.metadataHash||offer.metadataUri!==expected.metadataUri)
    throw new Error('Published offer content or conditions changed');
}

export function assertListingAsset(listing,asset){
  if(!asset||asset.id!==listing.assetId||asset.kind!==listing.kind||asset.sha256!==listing.assetSha256)
    throw new Error('Delivery fingerprint or category mismatch');
  const certificate=listing.certificate;
  if(certificate&&(!asset.certificate||certificate.tokenId!==asset.certificate.tokenId
    ||certificate.contract.toLowerCase()!==asset.certificate.contract.toLowerCase()
    ||certificate.chainId!==84532||asset.certificate.chainId!==84532))throw new Error('Delivery certificate differs from the published offer');
}
