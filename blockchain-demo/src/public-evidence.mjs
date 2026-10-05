import fs from 'node:fs';
import path from 'node:path';
import {readVerifiedBytes} from './verified-file.mjs';
export const PUBLIC_EVIDENCE_FILES=Object.freeze([
  "BASE_DEPLOYMENT_MANIFEST.json",
  "BASE_PUBLIC_RECEIPTS.json",
  "BASE_VERIFICATION.json",
  "MARKETPLACE_VERIFICATION.json",
  "MARKET_CATEGORIES_VERIFICATION.json",
  "DEMO_READY_VERIFICATION.json",
  "DEMO_HEALTH_WINDOW.json",
  "UNIT_TEST_VERIFICATION.json",
  "DEMO_REQUIREMENTS_AUDIT.json",
  "STUDIO_STATUS_VERIFICATION.json",
  "SOURCE_PACKAGE_VERIFICATION.json",
  "OFFER_BINDING_VERIFICATION.json",
  "BOSON_IMPLEMENTATION_VERIFICATION.json",
  "SAFE_AUTHORITY_VERIFICATION.json",
  "SAFE_OPERATION_VERIFICATION.json",
  "SIGNED_TRANSACTION_VERIFICATION.json",
  "RUNTIME_IDENTITY_VERIFICATION.json",
  "LIVE_SAFE_OPERATION_VERIFICATION.json",
  "LIVE_SAFE_MINT_VERIFICATION.json",
  "APPROVAL_BROADCAST_VERIFICATION.json",
  "LIVE_COMMERCE_BROADCAST_VERIFICATION.json",
  "PURCHASE_PREFLIGHT_VERIFICATION.json",
  "LIVE_PURCHASE_PREFLIGHT_VERIFICATION.json",
  "SNAPSHOT_VERIFICATION.json",
  "INTERFACE_LAYOUT_VERIFICATION.json",
  "CONTENT_VERIFICATION.json",
  "RESILIENCE_VERIFICATION.json",
  "PURCHASE_RECOVERY_VERIFICATION.json",
  "LIVE_PURCHASE_RECOVERY_VERIFICATION.json",
  "DEPENDENCY_AUDIT.json",
  "VIDRA_DEPENDENCY_AUDIT.json",
  "DEPENDENCY_LICENSE_INVENTORY.json",
  "VIDRA_BILINGUAL_SITE_VERIFICATION.json",
  "VIDRA_BILINGUAL_STUDIO_VERIFICATION.json",
  "VIDRA_ENGLISH_WORKFLOW_VERIFICATION.json",
  "VIDRA_ENGLISH_VIDEO_PROVENANCE.json",
  "VIDRA_IDEMPOTENCY_ORDER_VERIFICATION.json",
  "VIDRA_PUBLICATION_VERIFICATION.json",
  "VIDRA_SITE_VERIFICATION.json",
  "BASE_FUNDING_RECEIPT.json",
  "BASE_PREFLIGHT.json",
  "BASE_BLOCKER.json",
  "VIDRA_PLATFORM_SECURITY_AUDIT.json",
  "VIDRA_METAMASK_TEST_FUNDING.json",
  "VIDRA_METAMASK_FLOW_VERIFICATION.json"
]);
const allowed=new Set(PUBLIC_EVIDENCE_FILES),restricted=new Set(['privatekey','mnemonic','seedphrase','password','csrf','token','keystore','file','project','signature','rawtransaction','signedtransaction']);
export function assertPublicEvidence(value){
  if(Array.isArray(value)){for(const item of value)assertPublicEvidence(item);return;}
  if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){if(restricted.has(key.toLowerCase().replace(/[_-]/g,'')))throw new Error('Restricted field in public evidence');assertPublicEvidence(item);}
  if(typeof value==='string'&&/gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value))throw new Error('Restricted material in public evidence');
}
export function readPublicEvidence(directory,name){
  if(!allowed.has(name))throw new Error('Report is not approved for publication');
  const bytes=readVerifiedBytes(path.join(directory,name),null,{root:directory,maxBytes:2*1024*1024}).bytes;
  const data=JSON.parse(bytes.toString('utf8'));assertPublicEvidence(data);return data;
}
export function listPublicEvidence(directory){return PUBLIC_EVIDENCE_FILES.filter(name=>{try{readPublicEvidence(directory,name);return true;}catch{return false;}});}
