import { JsonRpcProvider, FetchRequest } from 'ethers';
import { NETWORK, load, save } from '../src/chain.mjs';
import { BASE_RPC, BASE_CHECK_RPC, assertBase } from '../src/base-chain.mjs';

if(NETWORK!=='base-sepolia')throw new Error('Set AIM_DEMO_NETWORK=base-sepolia');
const pending=load('pending.json');
if(!pending){console.log('No pending Base transaction. Nothing was sent.');process.exit(0);}
const providers=[BASE_RPC,BASE_CHECK_RPC].map(url=>{
  const request=new FetchRequest(url);request.timeout=20000;
  return new JsonRpcProvider(request,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});
});
try {
  for(const p of providers)await assertBase(p);
  const tx=await providers[0].getTransaction(pending.tx);
  const receipts=await Promise.all(providers.map(p=>p.getTransactionReceipt(pending.tx)));
  if(!tx||receipts.some(r=>!r))throw new Error('Transaction has no confirmed receipt on both RPCs. Retry remains blocked.');
  if(Number(tx.chainId)!==84532||tx.from.toLowerCase()!==pending.from.toLowerCase()||tx.nonce!==pending.nonce||
    tx.data!==pending.data||String(tx.value)!==pending.value||tx.to?.toLowerCase()!==pending.to?.toLowerCase())
    throw new Error('Public transaction differs from the persisted signed intent');
  const [a,b]=receipts;
  if(a.blockHash!==b.blockHash||(await providers[0].getBlock(a.blockNumber)).hash!==a.blockHash)
    throw new Error('Public providers do not agree on the canonical receipt');
  const confirmations=(await providers[0].getBlockNumber())-a.blockNumber+1;
  if(confirmations<3)throw new Error('Receipt needs three public confirmations');
  const result={chainId:84532,tx:a.hash,label:pending.label,role:pending.role,
    status:a.status,block:a.blockNumber,blockHash:a.blockHash,confirmations,
    deploymentAddress:a.contractAddress,explorer:'https://sepolia.basescan.org/tx/'+a.hash,
    inspectedAt:new Date().toISOString(),resubmitted:false,pendingCleared:false};
  save('pending-inspection.json',result);console.log(JSON.stringify(result,null,2));
  // Inspection alone does not reconstruct application state. Leave the durable
  // pending intent in place so no new nonce can be sent by mistake.
}finally{for(const p of providers)p.destroy();}
