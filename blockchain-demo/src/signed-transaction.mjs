import {Transaction,getAddress,keccak256} from 'ethers';
const fields=r=>({chainId:r.chainId,type:r.type,nonce:r.nonce,to:r.to??null,data:r.data??'0x',value:r.value??0n,gasLimit:r.gasLimit,maxFeePerGas:r.maxFeePerGas,maxPriorityFeePerGas:r.maxPriorityFeePerGas,accessList:r.accessList??[]});
export function bindPreparedTransaction(original,prepared,address){
 const from=getAddress(address);
 if([original.from,prepared.from].some(a=>a!=null&&getAddress(a)!==from))throw new Error('Prepared transaction actor changed');
 const actual=Transaction.from(fields(prepared));
 const expected=Transaction.from(fields({...prepared,...original,to:original.to??null,data:original.data??'0x',value:original.value??0n}));
 if(actual.chainId!==84532n||actual.type!==2||!Number.isSafeInteger(actual.nonce)||actual.nonce<0||actual.gasLimit<=0n||actual.gasLimit>6000000n||actual.maxFeePerGas==null||actual.maxFeePerGas<=0n||actual.maxFeePerGas>1000000000n||actual.maxPriorityFeePerGas==null||actual.maxPriorityFeePerGas<0n||actual.maxPriorityFeePerGas>actual.maxFeePerGas)throw new Error('Signed transaction network/type/fee limits invalid');
 if(actual.unsignedSerialized!==expected.unsignedSerialized)throw new Error('Wallet preparation changed validated transaction fields');
 const accessList=Object.freeze(actual.accessList.map(a=>Object.freeze({address:a.address,storageKeys:Object.freeze([...a.storageKeys])})));
 return Object.freeze({from,unsignedSerialized:actual.unsignedSerialized,fields:Object.freeze({...fields(actual),from,accessList})});
}
export function verifySignedTransaction(raw,binding){
 const signed=Transaction.from(raw);
 if(!signed.isSigned()||signed.from!==binding.from||signed.unsignedSerialized!==binding.unsignedSerialized||signed.hash!==keccak256(raw))throw new Error('Signed bytes differ from validated transaction');
 return binding.fields;
}
