import test from 'node:test';import assert from 'node:assert/strict';import {generateKeyPair,SignJWT} from 'jose';
import {createGoogleVerifier} from './google-auth.mjs';
test('Google JWT rejects forged signature, issuer, audience, nonce, expiry and unverified email',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256'),other=await generateKeyPair('RS256'),nonce='a'.repeat(64),clientId='123-demo.apps.googleusercontent.com',now=Math.floor(Date.now()/1000);
 const verify=createGoogleVerifier({clientId,keySet:publicKey});
 async function token(overrides={},key=privateKey){return new SignJWT({sub:'google-subject-1',iss:'https://accounts.google.com',aud:clientId,nonce,iat:now,exp:now+120,email_verified:true,...overrides}).setProtectedHeader({alg:'RS256'}).sign(key);}
 assert.deepEqual(await verify(await token(),nonce),{subject:'google-subject-1'});
 for(const bad of [{iss:'https://evil.example'},{aud:'another-client'},{aud:[clientId,'other-client']},{azp:'other-client'},{nonce:'b'.repeat(64)},{exp:now-1},{iat:now-1000},{email_verified:false},{sub:''}])await assert.rejects(verify(await token(bad),nonce),e=>e.status===401);
 await assert.rejects(verify(await token({},other.privateKey),nonce),e=>e.status===401);
 await assert.rejects(createGoogleVerifier({clientId:null})('token',nonce),e=>e.status===503);
});
