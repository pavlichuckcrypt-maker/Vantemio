import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {Wallet,getAddress,keccak256} from 'ethers';
import {COMMERCE_POLICY,verifyQuorum} from '../src/commerce-policy.mjs';
const types={Operation:[{name:'policy',type:'string'},{name:'action',type:'string'},{name:'actor',type:'address'},{name:'dataHash',type:'bytes32'},{name:'implementationDigest',type:'bytes32'},{name:'nonce',type:'uint256'},{name:'expiresAt',type:'uint256'}]};
const methods={'seller-create':'createSeller','seller-publish':'createOffer','seller-withdraw':'withdrawFunds',approve:'approve',commit:['commitToOffer','commitToOfferAndRedeemVoucher'],redeem:'redeemVoucher',complete:'completeExchange',cancel:'cancelVoucher',dispute:'raiseDispute',retract:'retractDispute'};
const run=promisify(execFile),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function privateFile(file){const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)||st.nlink!==1||st.size>2*1024*1024)throw new Error('Existing private reviewer vault required');return fs.readFileSync(file,'utf8');}
// Read an already-created test vault. Never create a key, password, inventory,
// Keychain item or Ethereum transaction here. Only three registered reviewer
// keystores are decrypted; raw signatures remain in this call's memory.
export async function loadExistingSellerReviewers(manifest){
 const file=path.join(process.env.AIM_DEMO_HOME||path.join(os.homedir(),'Desktop','AIMmontag_Blockchain'),'demo-wallets.encrypted.json');
 const vault=JSON.parse(privateFile(file));if(vault.testOnly!==true||vault.independentCustody!==false||!Array.isArray(vault.wallets))throw new Error('Test-only reviewer vault required');
 const owners=manifest.safeOwners?.map(a=>getAddress(a).toLowerCase());if(!owners||owners.length!==5||new Set(owners).size!==5)throw new Error('Registered five-owner Safe required');
 const entries=['signer1','signer2','signer3'].map(role=>{const candidates=vault.wallets.filter(e=>e.role===role);if(candidates.length!==1||!owners.includes(getAddress(candidates[0].address).toLowerCase()))throw new Error('Registered reviewer missing');return candidates[0];});
 let password;
 if(process.platform==='darwin'){try{const result=await run('/usr/bin/security',['find-generic-password','-a',os.userInfo().username,'-s','AIMmontag.blockchain-demo.test-only','-w'],{encoding:'utf8',timeout:5000,maxBuffer:4096});password=result.stdout.trim();}catch{}}
 if(!password){const fallback=path.join(os.homedir(),'.config','aimmontag-blockchain-demo','test-only-vault-password');try{password=privateFile(fallback);}catch{}}
 if(!password)throw new Error('Existing reviewer vault password unavailable');
 try{return await Promise.all(entries.map(async entry=>{const signer=await Wallet.fromEncryptedJson(JSON.stringify(entry.keystore),password);if(signer.address.toLowerCase()!==entry.address.toLowerCase())throw new Error('Reviewer keystore address changed');return signer;}));}
 catch{throw new Error('Existing reviewer keystore unavailable');}finally{password=null;}
}
export function createSellerReviewer(manifest,bosonInterface,{loadSigners=()=>loadExistingSellerReviewers(manifest),creditInterface=null}={}){
 let signers=null,inflight=null;
 async function reviewers(){if(signers)return signers;if(!inflight)inflight=loadSigners().then(s=>{signers=s;return s;}).finally(()=>{inflight=null;});return inflight;}
 async function approve({action,actor,target,dataHash,nonce,block,binding}){
  if(!Number.isSafeInteger(nonce)||nonce<0)throw new Error('Invalid platform review nonce');
  const bindingSha256=sha(JSON.stringify(binding,(_key,value)=>typeof value==='bigint'?String(value):value)),domain={name:'AIMmontag Demo Commerce',version:'3',chainId:84532,verifyingContract:target},
   message={policy:COMMERCE_POLICY,action:action+':'+bindingSha256,actor:getAddress(actor),dataHash,implementationDigest:manifest.sourceBosonImplementationDigest,nonce,expiresAt:block.timestamp+120};
  const selected=await reviewers();if(!Array.isArray(selected)||selected.length!==3)throw new Error('Three platform reviewers required');
  const signatures=await Promise.all(selected.map(async s=>({address:s.address,signature:await s.signTypedData(domain,types,message)}))),
   digest=verifyQuorum(domain,message,signatures,manifest.safeOwners,block.timestamp,manifest.sourceBosonImplementationDigest);
  return {policy:COMMERCE_POLICY,action,digest,actor:message.actor,target:domain.verifyingContract,dataHash:message.dataHash,nonce,expiresAt:message.expiresAt,
   implementationDigest:message.implementationDigest,bindingSha256,approvals:signatures.map(s=>s.address),block:{number:block.number,hash:block.hash},
   independentCustody:false,scope:'platform review; external wallet signs all transactions'};
 }
 function boundary(block){if(manifest.chainId!==84532||manifest.publicTransactions!==true||!/^0x[a-fA-F0-9]{64}$/.test(manifest.sourceBosonImplementationDigest||'')||!Number.isSafeInteger(block?.timestamp)||!Number.isSafeInteger(block?.number)||!/^0x[a-fA-F0-9]{64}$/.test(block?.hash||''))throw new Error('Invalid platform review boundary');}
 async function review(tx,{action,block,binding}){
  boundary(block);const target=action==='approve'?manifest.credit:manifest.sourceBoson,iface=action==='approve'?creditInterface:bosonInterface,allowed=methods[action];
  if(!allowed||Number(tx.chainId)!==84532||BigInt(tx.value??0)!==0n||getAddress(tx.to)!==getAddress(target)||![allowed].flat().includes(iface?.parseTransaction({data:tx.data})?.name))throw new Error('Invalid seller review boundary');
  return approve({action,actor:tx.from,target,dataHash:keccak256(tx.data),nonce:Number(BigInt(tx.nonce)),block,binding});
 }
 review.delivery=async(account,{block,binding,nonce})=>{boundary(block);if(!binding||binding.chainId!==84532||!/^\d+$/.test(String(binding.exchangeId))||!/^\d+$/.test(String(binding.offerId))||!/^\d+$/.test(String(binding.buyerId))||!getAddress(account)||!/^[a-f0-9]{64}$/.test(binding.assetSha256||''))throw new Error('Invalid digital delivery review');
  return approve({action:'digital-delivery',actor:account,target:manifest.sourceBoson,dataHash:'0x'+sha(JSON.stringify(binding,(_key,value)=>typeof value==='bigint'?String(value):value)),nonce,block,binding});};
 return review;
}
