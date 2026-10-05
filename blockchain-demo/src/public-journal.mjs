import { keccak256 } from 'ethers';
import {bindPreparedTransaction,verifySignedTransaction} from './signed-transaction.mjs';

// Persist the signed transaction's hash before any network broadcast. An
// ambiguous RPC response must never result in a new nonce or replacement call.
export async function broadcastJournaled({provider,wallet,request,label,role,operation=null,store,read,beforeBroadcast=null}) {
  const pending=read();
  if(pending)throw new Error('Unreconciled public transaction '+pending.tx+'; inspect its receipt before retry');
  if(operation&&(Object.keys(operation).some(k=>!['key','digest','action'].includes(k))||!/^[a-zA-Z0-9-]{16,80}$/.test(operation.key||'')||!/^0x[a-fA-F0-9]{64}$/.test(operation.digest||'')||!/^[a-zA-Z]{2,32}$/.test(operation.action||'')))throw new Error('Invalid marketplace operation binding');
  const operationBinding=operation?Object.freeze({...operation}):null;
  const original=structuredClone(request);
  const prepared=await wallet.populateTransaction(request);
  if(Number(prepared.chainId)!==84532)throw new Error('Journal only permits Base Sepolia 84532');
  const binding=bindPreparedTransaction(original,prepared,wallet.address);
  const raw=await wallet.signTransaction(prepared);
  const signed=verifySignedTransaction(raw,binding);
  if(beforeBroadcast)await beforeBroadcast(signed);
  if(read())throw new Error('Unreconciled public transaction appeared during preparation; inspect its receipt before retry');
  const tx=keccak256(raw);
  store({schemaVersion:1,chainId:84532,tx,label,role,from:signed.from,
    nonce:signed.nonce,to:signed.to??null,data:signed.data,
    value:String(signed.value),at:new Date().toISOString(),status:'broadcast-uncertain',...(operationBinding?{operation:operationBinding}: {})});
  // Raw signed bytes are intentionally not persisted or exported. The hash is
  // enough to inspect canonical results; retry remains blocked if not found.
  const response=await provider.broadcastTransaction(raw);
  if(response.hash.toLowerCase()!==tx.toLowerCase())throw new Error('Broadcast returned an unexpected transaction hash');
  return response;
}
