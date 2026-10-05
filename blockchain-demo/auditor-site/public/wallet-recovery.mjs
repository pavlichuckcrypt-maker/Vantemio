// Receipt visibility may lag a mined transaction. Retry reads of one immutable
// intent/hash only; never repeat wallet signing or a purchase preparation.
const pending=new Set(['Wallet transaction is pending','Three confirmations required; reconcile the same intent again','Wallet receipt identity or canonical block mismatch','Transaction not visible yet; keep the same intent and retry its hash']);
// Refresh recovery from the owner's ledger without forgetting a locally known
// broadcast or clearing an unknown intent merely because a page omitted it.
export function mergeRecoveryIntent(local,intents,account){
  const address=/^0x[\da-fA-F]{40}$/;
  if(!address.test(account||'')||!Array.isArray(intents))throw new Error('Invalid recovery ledger');
  const sameOwner=i=>address.test(i?.account||'')&&i.account.toLowerCase()===account.toLowerCase();
  if(local&&!sameOwner(local)||intents.some(i=>!sameOwner(i)))throw new Error('Recovery wallet owner mismatch');
  const active=intents.filter(i=>['PREPARED','SUBMITTED'].includes(i.status));
  if(active.length>1)throw new Error('Multiple active wallet intents');
  const current=active[0]||intents.find(i=>local&&i.key===local.key);
  if(!current)return local;
  const matching=local?.key===current.key;
  if(matching&&local.id&&local.id!==current.id)throw new Error('Recovery intent identity mismatch');
  if(!['PREPARED','SUBMITTED','CONFIRMED','REVERTED','CANCELLED','SUPERSEDED'].includes(current.status))throw new Error('Invalid recovery intent status');
  const transaction=/^0x[\da-fA-F]{64}$/;
  if(current.hash&&!transaction.test(current.hash)||matching&&local.hash&&!transaction.test(local.hash))throw new Error('Invalid recovery transaction hash');
  if(matching&&local.hash&&current.hash&&local.hash.toLowerCase()!==current.hash.toLowerCase())throw new Error('Recovery transaction hash mismatch');
  if(['SUBMITTED','CONFIRMED','REVERTED'].includes(current.status)&&!transaction.test(current.hash||''))throw new Error('Missing recovery transaction hash');
  if(matching&&local.hash&&current.status==='CANCELLED')throw new Error('Cancelled intent has an observed transaction; do not repeat the purchase');
  if(['CONFIRMED','REVERTED','CANCELLED','SUPERSEDED'].includes(current.status))return {...current};
  const hash=current.hash||(matching?local.hash:undefined);
  return {...current,...(matching?{input:local.input}:{}),...(hash?{hash,status:'SUBMITTED'}:{}),sendStarted:hash||current.status==='SUBMITTED'||!matching?true:local.sendStarted!==false};
}
export async function reconcileWithRetry(reconcile,{id,hash},{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=5}={}){
  if(typeof id!=='string'||!id||!/^0x[\da-fA-F]{64}$/.test(hash||'')||!Number.isSafeInteger(attempts)||attempts<1||attempts>5)throw new Error('Invalid recovery identity');
  const body=Object.freeze({id,hash});
  for(let n=0;n<attempts;n++){
    try{const result=await reconcile(body);if(result?.id!==id||result?.hash?.toLowerCase()!==hash.toLowerCase()||result?.status!=='CONFIRMED')throw new Error('Recovery response identity mismatch');return result;}
    catch(error){if(!pending.has(error.message)||n===attempts-1)throw error;await wait(2000);}
  }
}
