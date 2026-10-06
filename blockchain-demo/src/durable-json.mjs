import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// The intent must reach disk before any irreversible chain broadcast.
export function writeDurableJSON(file,text){
  const directory=path.dirname(file),temporary=file+'.'+randomUUID()+'.tmp';
  let fd;
  try{
    fd=fs.openSync(temporary,'wx',0o600);
    fs.writeFileSync(fd,text,'utf8');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    fs.renameSync(temporary,file);
    try{
      const parent=fs.openSync(directory,'r');try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
    }catch(e){
      // Windows/SMB directory fsync may throw EPERM/EPERM-equivalent — file durability already ensured above.
      if(e && (e.code==='EPERM' || e.code==='EINVAL' || e.code==='EBADF')){} else throw e;
    }
  }finally{
    if(fd!==undefined)try{fs.closeSync(fd);}catch{}
    if(fs.existsSync(temporary))try{fs.unlinkSync(temporary);}catch{}
  }
}
