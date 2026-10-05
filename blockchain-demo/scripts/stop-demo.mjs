import fs from 'node:fs';
import path from 'node:path';
import {NETWORK,RUNTIME} from '../src/chain.mjs';
import {stopVerifiedRuntime} from '../src/runtime-identity.mjs';
const info=JSON.parse(fs.readFileSync(path.join(RUNTIME,'server-info.json'),'utf8'));
await stopVerifiedRuntime(info,{network:NETWORK});
console.log('Demo shutdown requested; state remains saved.');
