const lower=value=>String(value||'').toLowerCase();
function fingerprint(r){
  return JSON.stringify({hash:lower(r.hash??r.transactionHash),blockHash:lower(r.blockHash),blockNumber:r.blockNumber,index:r.index??r.transactionIndex,
    status:r.status,gasUsed:String(r.gasUsed),cumulativeGasUsed:String(r.cumulativeGasUsed),
    logs:r.logs.map(l=>({address:lower(l.address),data:lower(l.data),topics:l.topics.map(lower),index:l.index??l.logIndex,
      transactionHash:lower(l.transactionHash),blockHash:lower(l.blockHash),removed:!!l.removed}))});
}
export function assertWalletReceiptAgreement(views,hash){
  if(!Array.isArray(views)||views.length!==2)throw new Error('Two independent RPC receipts required');
  for(const {tx,receipt:r,canonicalBlockHash,latestBlock}of views){
    if(!tx||!r)throw new Error('Wallet transaction is pending');
    if(lower(r.hash??r.transactionHash)!==lower(hash)||lower(tx.hash)!==lower(hash)
      ||!/^0x[\da-f]{64}$/.test(lower(r.blockHash))||lower(canonicalBlockHash)!==lower(r.blockHash)
      ||tx.blockNumber!==r.blockNumber||lower(tx.blockHash)!==lower(r.blockHash))throw new Error('Wallet receipt identity or canonical block mismatch');
    if(!Number.isSafeInteger(r.blockNumber)||!Number.isSafeInteger(latestBlock)||![0,1].includes(r.status)
      ||!Number.isSafeInteger(r.index??r.transactionIndex)||!Array.isArray(r.logs))throw new Error('Invalid wallet receipt');
    if(latestBlock-r.blockNumber+1<3)throw new Error('Three confirmations required; reconcile the same intent again');
    for(const l of r.logs)if(l.removed||lower(l.transactionHash)!==lower(hash)||lower(l.blockHash)!==lower(r.blockHash))throw new Error('Wallet event identity mismatch');
  }
  if(fingerprint(views[0].receipt)!==fingerprint(views[1].receipt))throw new Error('RPC receipt content mismatch');
  return views[0].receipt;
}
