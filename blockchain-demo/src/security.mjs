import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RUNTIME, load } from './chain.mjs';
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
export function audit(type,data) {
  fs.mkdirSync(RUNTIME,{recursive:true,mode:0o700});
  const file=path.join(RUNTIME,'audit.jsonl');
  let previous='0'.repeat(64);
  if(fs.existsSync(file)) {
    const last=fs.readFileSync(file,'utf8').trim().split('\n').at(-1);
    if(last) previous=JSON.parse(last).hash;
  }
  const entry={at:new Date().toISOString(),type,policy:POLICY,previous,data};
  const hash=crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex');
  fs.appendFileSync(file,JSON.stringify({...entry,hash})+'\n',{mode:0o600});
  return hash;
}
export function verifyAudit() {
  const file=path.join(RUNTIME,'audit.jsonl');
  if(!fs.existsSync(file))return true;
  let previous='0'.repeat(64);
  for(const line of fs.readFileSync(file,'utf8').trim().split('\n')) {
    if(!line)continue;
    const {hash,...entry}=JSON.parse(line);
    if(entry.previous!==previous || crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex')!==hash)
      throw new Error('Audit hash chain mismatch');
    previous=hash;
  }
  return true;
}
