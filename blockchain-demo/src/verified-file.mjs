import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Consumers send this exact buffer. They must never reopen the pathname after
// checking a digest: another process can replace or alter it between operations.
export function readVerifiedBytes(input,expectedSha256,{root,maxBytes=256*1024*1024}={}){
  if(expectedSha256!==null&&!/^[a-f0-9]{64}$/.test(expectedSha256||''))throw new Error('Expected SHA-256 required');
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error('Invalid byte limit');
  const entry=fs.lstatSync(input);if(entry.isSymbolicLink())throw new Error('Symbolic file rejected');if(!entry.isFile())throw new Error('Regular file required');
  const file=fs.realpathSync(input);
  if(root){const base=fs.realpathSync(root),relative=path.relative(base,file);if(!relative||relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw new Error('File escaped approved root');}
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try{
    const before=fs.fstatSync(fd);if(!before.isFile()||!Number.isSafeInteger(before.size)||before.size<1||before.size>maxBytes)throw new Error('Regular file within byte limit required');
    const bytes=Buffer.alloc(before.size);let offset=0;
    while(offset<bytes.length){const n=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);if(!n)throw new Error('File changed while reading');offset+=n;}
    const after=fs.fstatSync(fd);
    if(['dev','ino','size','mtimeMs','ctimeMs'].some(k=>before[k]!==after[k]))throw new Error('File changed while reading');
    const sha256=crypto.createHash('sha256').update(bytes).digest('hex');if(expectedSha256!==null&&sha256!==expectedSha256)throw new Error('Verified file hash mismatch');
    return {file,bytes,sha256};
  }finally{fs.closeSync(fd);}
}
