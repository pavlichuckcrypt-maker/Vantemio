import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {writeDurableJSON} from '../src/durable-json.mjs';

test('critical JSON replaces a previous record atomically with private permissions and no leftover temporary data',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'aim-durable-test-'));
  try{
    const file=path.join(directory,'pending.json');
    fs.writeFileSync(file,'{"old":true}',{mode:0o644});
    const next={chainId:84532,status:'broadcast-uncertain',tx:'0x'+'1'.repeat(64)};
    writeDurableJSON(file,JSON.stringify(next));
    assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),next);
    if(process.platform!=='win32'){
      assert.equal(fs.statSync(file).mode&0o777,0o600);
    }else{
      // Windows ACLs govern privacy, not POSIX mode bits — durability is the invariant.
      assert.ok(fs.existsSync(file));
    }
    assert.deepEqual(fs.readdirSync(directory),['pending.json']);
    assert.throws(()=>writeDurableJSON(path.join(directory,'missing','pending.json'),'{}'));
    assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),next);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
