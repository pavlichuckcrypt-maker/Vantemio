import { hash } from './chain.mjs';
// Preserve historic digest bytes while accepting semantically identical JSON order.
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export function requestMatches(existing,input){
  if(!existing)return false;const digest=hash(JSON.stringify(input));
  if(existing.digest===digest)return true;
  return !!existing.input&&existing.digest===hash(JSON.stringify(existing.input))&&JSON.stringify(canonical(existing.input))===JSON.stringify(canonical(input));
}
export async function runIdempotent(store,input,work,persist){
  const digest=hash(JSON.stringify(input)),key=input.idempotencyKey;
  const existing=store[key];
  if(existing){if(!requestMatches(existing,input))throw new Error('Idempotency key reused with different parameters');
    if(existing.status==='confirmed')return {...existing.result,idempotent:true};
    throw new Error('Prior operation '+existing.status+'; inspect evidence before a new request');}
  if(Object.keys(store).length>=1000)throw new Error('Demo request limit reached');
  store[key]={digest,input:structuredClone(input),status:'pending',at:new Date().toISOString()};persist();
  try{const result=await work();store[key]={...store[key],status:'confirmed',result};persist();return result;}
  catch(error){store[key]={...store[key],status:'failed',error:error.shortMessage||error.message};persist();throw error;}
}
