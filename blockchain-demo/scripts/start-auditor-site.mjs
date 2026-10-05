import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startAuditorSite} from '../auditor-site/runtime.mjs';
const moduleRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
try {
  const result=await startAuditorSite({moduleRoot,port:Number(process.env.VIDRA_SITE_PORT||18340),mediaHome:process.env.VIDRA_MEDIA_HOME});
  console.log(`Auditor website ${result.reused?'already running':'ready'}: ${result.url}`);
} catch(e) {console.error(e.message);process.exitCode=1;}
