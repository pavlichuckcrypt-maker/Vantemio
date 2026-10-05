import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {readVerifiedBytes} from '../src/verified-file.mjs';
import {ServiceError} from './user-database.mjs';

export const SELLER_ASSET_LIMIT=64*1024*1024;
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s);
function directory(dir){
  try{fs.mkdirSync(dir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  const st=fs.lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||fs.realpathSync(dir)!==dir)throw new ServiceError('Private asset directory unavailable');
  fs.chmodSync(dir,0o700);return dir;
}
// The account store reserves metadata/quota first. An interrupted upload remains
// unready and can be retried with the same hash; it never becomes a paid file.
export function createSellerAssetStorage(moduleRoot,accounts,{runtimeRoot=null}={}){
  const base=fs.realpathSync(moduleRoot),runtime=runtimeRoot?fs.realpathSync(runtimeRoot):path.join(base,'runtime-site');
  if(!fs.lstatSync(runtime).isDirectory()||fs.lstatSync(runtime).isSymbolicLink()||fs.realpathSync(runtime)!==runtime)throw new ServiceError('Private asset runtime unavailable');
  const root=directory(path.join(runtime,'seller-assets'));
  function location(asset){
    if(!uuid(asset?.memberId)||!/^[a-f0-9]{64}$/.test(asset?.sha256||'')||!Number.isSafeInteger(asset.bytes)||asset.bytes<1||asset.bytes>SELLER_ASSET_LIMIT)throw new ServiceError('Invalid private asset binding');
    return path.join(directory(path.join(root,asset.memberId)),asset.sha256+'.bin');
  }
  function verified(asset,{allowUnready=false}={}){
    if(!allowUnready&&!asset.ready)throw new ServiceError('Asset upload is incomplete',409);
    const file=location(asset),st=fs.lstatSync(file);
    if(st.isSymbolicLink()||!st.isFile()||(st.mode&0o077)||st.nlink!==1)throw new ServiceError('Private regular asset required');
    const result=readVerifiedBytes(file,asset.sha256,{root,maxBytes:SELLER_ASSET_LIMIT});
    if(result.bytes.length!==asset.bytes)throw new ServiceError('Asset byte count changed');return result;
  }
  async function upload(auth,{bytes,mime,filename}){
    if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>SELLER_ASSET_LIMIT)throw new ServiceError('File must be within 64 MiB',400);
    const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
    const asset=await accounts.registerAsset(auth,{id:crypto.randomUUID(),sha256,bytes:bytes.length,mime,filename}),file=location(asset);
    const temporary=path.join(path.dirname(file),'.upload-'+crypto.randomUUID());let handle;
    try{
      if(!fs.existsSync(file)){
        handle=await fs.promises.open(temporary,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;
        // Atomic no-replace publication. Concurrent copies of the same asset
        // share one immutable file; an existing corrupt file is never overwritten.
        try{await fs.promises.link(temporary,file);}catch(e){if(e.code!=='EEXIST')throw e;}
        await fs.promises.unlink(temporary);
        const dir=await fs.promises.open(path.dirname(file),'r');try{await dir.sync();}finally{await dir.close();}
      }
      // A concurrent uploader may be removing its temporary hard link.
      for(let attempt=0;;attempt++){try{verified(asset,{allowUnready:true});break;}catch(e){if(attempt>=2||!fs.existsSync(file)||fs.lstatSync(file).nlink!==2)throw e;await new Promise(resolve=>setTimeout(resolve,10));}}
      return await accounts.markAssetReady(auth,asset.id);
    }finally{
      if(handle)await handle.close().catch(()=>{});
      await fs.promises.unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});
    }
  }
  return {upload,verified,root};
}
