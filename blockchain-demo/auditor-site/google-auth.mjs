import fs from 'node:fs';
import path from 'node:path';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {ServiceError} from './user-database.mjs';
export function googleConfiguration(moduleRoot){
  const file=path.join(moduleRoot,'runtime-site/google-oauth.json');let clientId=process.env.VIDRA_GOOGLE_CLIENT_ID||null;
  if(!clientId&&fs.existsSync(file)){
    const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))throw new ServiceError('Private Google configuration required');
    const config=JSON.parse(fs.readFileSync(file,'utf8'));if(Object.keys(config).join(',')!=='clientId')throw new ServiceError('Invalid Google configuration');clientId=config.clientId;
  }
  if(clientId!==null&&(typeof clientId!=='string'||!/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId)))throw new ServiceError('Invalid Google client ID');
  return {enabled:!!clientId,clientId};
}
export function createGoogleVerifier({clientId,keySet=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'),{timeoutDuration:5000,cooldownDuration:30000})}){
  return async(credential,nonce)=>{
    if(!clientId)throw new ServiceError('Google sign-in is not configured',503);
    if(typeof credential!=='string'||credential.length>8192||typeof nonce!=='string'||!/^[a-f0-9]{64}$/.test(nonce))throw new ServiceError('Invalid Google proof',401);
    try{
      const {payload}=await jwtVerify(credential,keySet,{algorithms:['RS256'],audience:clientId,issuer:['accounts.google.com','https://accounts.google.com'],requiredClaims:['sub','exp','iat','nonce'],maxTokenAge:'10m',clockTolerance:0});
      if(payload.aud!==clientId||(payload.azp!==undefined&&payload.azp!==clientId)||payload.nonce!==nonce||typeof payload.sub!=='string'||!/^[A-Za-z0-9_-]{1,255}$/.test(payload.sub)||payload.email_verified!==true)throw new Error('Invalid claims');
      // Email, raw credentials, provider picture and names are deliberately not persisted.
      return {subject:payload.sub};
    }catch{throw new ServiceError('Google proof invalid or expired',401);}
  };
}
