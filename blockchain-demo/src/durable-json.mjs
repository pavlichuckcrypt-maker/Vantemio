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
    const parent=fs.openSync(directory,'r');try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
  }finally{
    if(fd!==undefined)fs.closeSync(fd);
    if(fs.existsSync(temporary))fs.unlinkSync(temporary);
  }
}
