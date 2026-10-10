import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-isolated-'));
const runtime = path.join(tmpRoot, 'runtime');
fs.mkdirSync(runtime, {recursive:true, mode:0o700});
const fakeChainDir = path.join(tmpRoot, 'src');
fs.mkdirSync(fakeChainDir, {recursive:true});
const runtimePosix = runtime.replace(/\\/g,'/');
fs.writeFileSync(path.join(fakeChainDir,'chain.mjs'), "import path from 'node:path'; export const RUNTIME='"+runtimePosix+"'; export function load(){return null;}");
fs.writeFileSync(path.join(fakeChainDir,'durable-json.mjs'),
  "import fs from 'node:fs'; import path from 'node:path'; import {randomUUID} from 'node:crypto';\n"+
  "export function writeDurableJSON(file,text){\n"+
  "  const dir=path.dirname(file), tmp=file+'.'+randomUUID()+'.tmp';\n"+
  "  let fd; try{ fd=fs.openSync(tmp,'wx',0o600); fs.writeFileSync(fd,text,'utf8'); fs.fsyncSync(fd); fs.closeSync(fd); fd=undefined; fs.renameSync(tmp,file);} finally{ if(fd!==undefined)try{fs.closeSync(fd);}catch{} if(fs.existsSync(tmp))try{fs.unlinkSync(tmp);}catch{} }\n}");
// use canonical security.mjs but with patched imports
let secSrc = fs.readFileSync('C:/AI/blockchain-demo/src/security.mjs','utf8');
// ensure it imports from local fake chain
fs.writeFileSync(path.join(fakeChainDir,'security.mjs'), secSrc);
const {audit, verifyAudit} = await import('file:///'+path.join(fakeChainDir,'security.mjs').replace(/\\/g,'/'));
function hashEntry(entry){ return crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex'); }
function writeRecomputedJournal(entries){
  let prev='0'.repeat(64);
  const lines=[];
  for(const e of entries){
    const entry={at:new Date().toISOString(), type:e.type, policy:'demo-15-v1', previous:prev, data:e.data};
    const h=hashEntry(entry);
    lines.push(JSON.stringify({...entry,hash:h}));
    prev=h;
  }
  fs.writeFileSync(path.join(runtime,'audit.jsonl'), lines.join('\n')+'\n');
}
function truncJournal(keep){
  const p=path.join(runtime,'audit.jsonl');
  const lines=fs.readFileSync(p,'utf8').trim().split('\n');
  fs.writeFileSync(p, lines.slice(0,keep).join('\n') + (keep>0?'\n':''));
}
let ok=true;
function assertThrows(fn, label){
  try{ fn(); console.log('FAIL nothrow: '+label); ok=false; } catch(e){ console.log('OK throw '+label+': '+e.message.slice(0,90)); }
}
function assertNoThrow(fn, label){
  try{ fn(); console.log('OK nothrow '+label); } catch(e){ console.log('FAIL throw '+label+': '+e.message.slice(0,120)); ok=false; }
}
assertNoThrow(()=>verifyAudit(), 'fresh empty');
audit('test-a', {v:1});
audit('test-b', {v:2});
console.log('after 2 audits anchor:', JSON.parse(fs.readFileSync(path.join(runtime,'audit.anchor.json'),'utf8')));
assertNoThrow(()=>verifyAudit(), 'legit 2 entries');
truncJournal(1);
assertThrows(()=>verifyAudit(), 'truncation to 1/2');
assertThrows(()=>audit('test-c',{v:3}), 'audit after truncation should fail');
fs.writeFileSync(path.join(runtime,'audit.jsonl'), ''); try{fs.unlinkSync(path.join(runtime,'audit.anchor.json'));}catch{}
audit('legit-1',{x:1}); audit('legit-2',{x:2}); audit('legit-3',{x:3});
assertNoThrow(()=>verifyAudit(), 'rebuild 3');
console.log('anchor 3', JSON.parse(fs.readFileSync(path.join(runtime,'audit.anchor.json'),'utf8')));
writeRecomputedJournal([{type:'evil-1',data:{x:99}},{type:'evil-2',data:{x:99}},{type:'evil-3',data:{x:99}}]);
assertThrows(()=>verifyAudit(), 'recomputed chain same count');
try{fs.unlinkSync(path.join(runtime,'audit.jsonl'));}catch{}
assertThrows(()=>verifyAudit(), 'missing journal with anchor');
assertThrows(()=>audit('after-missing',{y:1}), 'audit after missing journal');
fs.writeFileSync(path.join(runtime,'audit.jsonl'), ''); try{fs.unlinkSync(path.join(runtime,'audit.anchor.json'));}catch{}
audit('a1',{k:1}); audit('a2',{k:2});
console.log('anchor before extension', JSON.parse(fs.readFileSync(path.join(runtime,'audit.anchor.json'),'utf8')));
writeRecomputedJournal([{type:'forged-1',data:{k:9}},{type:'forged-2',data:{k:9}},{type:'extra',data:{k:9}}]);
assertThrows(()=>verifyAudit(), 'forged prefix + extension');
fs.writeFileSync(path.join(runtime,'audit.jsonl'), ''); try{fs.unlinkSync(path.join(runtime,'audit.anchor.json'));}catch{}
audit('good-1',{z:1}); audit('good-2',{z:2});
assertNoThrow(()=>verifyAudit(), 'before legit extension');
audit('good-3',{z:3});
assertNoThrow(()=>verifyAudit(), 'legit extension accepted');
console.log('anchor after extension', JSON.parse(fs.readFileSync(path.join(runtime,'audit.anchor.json'),'utf8')));
let lines=fs.readFileSync(path.join(runtime,'audit.jsonl'),'utf8').trim().split('\n');
let obj=JSON.parse(lines[0]); obj.data.tampered=true;
fs.writeFileSync(path.join(runtime,'audit.jsonl'), JSON.stringify(obj)+'\n'+lines.slice(1).join('\n')+'\n');
assertThrows(()=>verifyAudit(), 'byte tamper hash mismatch');
console.log(ok ? 'ALL_HARNESS_PASS' : 'HARNESS_FAIL');
if(!ok) process.exit(1);
