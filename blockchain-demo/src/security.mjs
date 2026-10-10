import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RUNTIME, load } from './chain.mjs';
import { writeDurableJSON } from './durable-json.mjs';
export const POLICY='demo-15-v1';
export const CHECKS=[
  ['identity','Registered initiator'],['roles','Assigned demo roles'],
  ['accepted','Accepted final version'],['video','Matching video hash'],
  ['metadata','Pinned passport and terms'],['recipient','Verified recipient'],
  ['chain','Allowed demo network'],['contract','Verified code and ownership'],
  ['call','Exact transaction parameters'],['unique','No duplicate issuance'],
  ['limits','Operation limits'],['simulation','Successful simulation'],
  ['quorum','Safe quorum: 3 of 5'],['fresh','Fresh approval; issuance active'],
  ['audit','Recorded audit evidence']
];
export function evaluate(evidence) {
  return CHECKS.map(([id,label],index)=>({number:index+1,id,label,passed:evidence[id]===true,
    policy:POLICY,reason:evidence[id]===true?'verified':'missing_or_failed'}));
}
export function enforce(checks) {
  if(checks.length!==15 || checks.some((c,i)=>c.id!==CHECKS[i][0] || c.passed!==true))
    throw new Error('Security checks failed: '+checks.filter(c=>c.passed!==true).map(c=>c.id).join(', '));
}
function anchorPath(){ return path.join(RUNTIME,'audit.anchor.json'); }
let unstableAnchorAvailableLogged=false;
let unstableAnchorErrorLogged=false;
function readAnchor(){
  const p=anchorPath();
  if(!fs.existsSync(p)) return null;
  try{
    const raw=fs.readFileSync(p,'utf8');
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed)) throw new Error('Audit anchor malformed');
    if(typeof parsed!=='object' || parsed===null || !parsed.policy || !parsed.head || !Number.isSafeInteger(parsed.count)) throw new Error('Audit anchor malformed');
    if(!parsed.head || typeof parsed.head!=='string' || !/^[0-9a-f]{64}$/.test(parsed.head)) throw new Error('Audit anchor malformed');
    return parsed;
  }catch(e){
    if(!unstableAnchorErrorLogged){ try{ console.error('[audit-anchor] corrupt anchor rejected; manual recovery required'); }catch{}; unstableAnchorErrorLogged=true; unstableAnchorAvailableLogged=false; }
    throw new Error('Audit anchor unavailable — manual approved recovery required');
  }
}
function writeAnchor(head,count,genesis){
  fs.mkdirSync(RUNTIME,{recursive:true,mode:0o700});
  const anchor={policy:POLICY,head, count, genesis: genesis??'0'.repeat(64), anchoredAt:new Date().toISOString()};
  writeDurableJSON(anchorPath(), JSON.stringify(anchor,null,2));
  return anchor;
}
function recomputeChain(file){
  const raw=fs.readFileSync(file,'utf8').trim();
  if(!raw) return {count:0, head:'0'.repeat(64), genesis:'0'.repeat(64), entries:[]};
  const lines=raw.split('\n');
  let previous='0'.repeat(64);
  let genesis='0'.repeat(64);
  const entries=[];
  for(let idx=0; idx<lines.length; idx++){
    const line=lines[idx];
    if(!line) continue;
    let parsed;
    try{ parsed=JSON.parse(line); }catch{ throw new Error('Audit hash chain mismatch'); }
    const {hash,...entry}=parsed;
    if(typeof hash!=='string' || typeof entry.previous!=='string') throw new Error('Audit hash chain mismatch');
    if(entry.previous!==previous) throw new Error('Audit hash chain mismatch');
    const computed=crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex');
    if(computed!==hash) throw new Error('Audit hash chain mismatch');
    entries.push({...entry,hash});
    if(idx===0) genesis=previous;
    previous=hash;
  }
  return {count:entries.length, head:entries.length?previous:'0'.repeat(64), genesis, entries};
}
export function audit(type,data) {
  fs.mkdirSync(RUNTIME,{recursive:true,mode:0o700});
  const file=path.join(RUNTIME,'audit.jsonl');
  const anchorBefore=readAnchor();
  let previous='0'.repeat(64);
  let count=0;
  let genesis='0'.repeat(64);
  if(fs.existsSync(file)) {
    const chain=recomputeChain(file);
    if(chain.entries.some(e=>e.policy!==POLICY)) throw new Error('Audit hash chain mismatch');
    if(anchorBefore){
      if(anchorBefore.policy!==POLICY) throw new Error('Audit anchor mismatch');
      if(chain.count < anchorBefore.count) throw new Error('Audit truncation detected');
      if(chain.count === anchorBefore.count && chain.count>0 && chain.head !== anchorBefore.head) throw new Error('Audit recomputed chain rejected');
      if(chain.count > anchorBefore.count){
        const prefixHead=chain.entries[anchorBefore.count-1]?.hash ?? '0'.repeat(64);
        if(prefixHead !== anchorBefore.head) throw new Error('Audit recomputed chain rejected');
      }
      if(chain.count>0 && chain.genesis !== anchorBefore.genesis) throw new Error('Audit recomputed chain rejected');
    }
    previous=chain.head;
    count=chain.count;
    genesis=chain.count?chain.genesis:'0'.repeat(64);
  } else {
    if(anchorBefore && anchorBefore.count>0) throw new Error('Audit history lost');
  }
  // Reject prior unanchored history before changing durable bytes.
  if(!anchorBefore && count>0) throw new Error('Audit anchor unavailable — manual approved recovery required');
  const entry={at:new Date().toISOString(),type,policy:POLICY,previous,data};
  const hash=crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex');
  fs.appendFileSync(file,JSON.stringify({...entry,hash})+'\n',{mode:0o600});
  const newCount=count+1;
  const newGenesis = count===0 ? '0'.repeat(64) : (anchorBefore?.genesis ?? genesis);
  if(!anchorBefore) {
    if(count>0){
      throw new Error('Audit anchor unavailable — manual approved recovery required');
    }
    writeAnchor(hash,newCount,newGenesis);
  } else {
    if(newCount < anchorBefore.count) throw new Error('Audit truncation detected');
    writeAnchor(hash,newCount,anchorBefore.genesis ?? newGenesis);
  }
  return hash;
}
export function verifyAudit() {
  const file=path.join(RUNTIME,'audit.jsonl');
  const anchor=readAnchor();
  const exists=fs.existsSync(file);
  if(!exists){
    if(anchor && anchor.count>0) throw new Error('Audit history lost');
    return true;
  }
  const chain=recomputeChain(file);
  if(chain.count===0){
    if(anchor && anchor.count>0) throw new Error('Audit history lost');
    return true;
  }
  if(chain.entries.some(e=>e.policy!==POLICY)) throw new Error('Audit hash chain mismatch');
  if(!anchor){
    if(chain.count>0){
      if(!unstableAnchorAvailableLogged){
        try{ console.warn('[audit-anchor] missing anchor — fail-closed: forged journal would re-anchor if adoption allowed; run approved recovery'); }catch{}
        unstableAnchorAvailableLogged=true;
      }
      throw new Error('Audit anchor unavailable — manual approved recovery required');
    }
    writeAnchor(chain.head, chain.count, chain.genesis);
    return true;
  }
  if(anchor.policy!==POLICY) throw new Error('Audit anchor mismatch');
  if(chain.count < anchor.count) throw new Error('Audit truncation detected');
  if(chain.count === anchor.count && chain.head !== anchor.head) throw new Error('Audit recomputed chain rejected');
  if(chain.count > anchor.count){
    const prefixHead=chain.entries[anchor.count-1]?.hash ?? '0'.repeat(64);
    if(prefixHead !== anchor.head) throw new Error('Audit recomputed chain rejected');
    writeAnchor(chain.head, chain.count, anchor.genesis);
    return true;
  }
  if(chain.head !== anchor.head) throw new Error('Audit recomputed chain rejected');
  if(chain.genesis !== anchor.genesis) throw new Error('Audit recomputed chain rejected');
  return true;
}
