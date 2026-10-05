import {randomBytes} from 'node:crypto';
import {getAddress,verifyMessage} from 'ethers';

// Authenticates a short local testnet session; every transaction is separately signed in the wallet.
export function createProofStore({origin,now=Date.now,limit=64,ttl=120000}={}) {
  const entries=new Map();
  function sweep(){for(const [id,c] of entries)if(c.expires<=now())entries.delete(id);}
  return {
    issue(address,chainId) {
      sweep();if(chainId!==84532)throw new Error('Base Sepolia 84532 required');
      const account=getAddress(address);
      if(entries.size>=limit)throw new Error('Too many pending proofs');
      const id=randomBytes(24).toString('hex'),expires=now()+ttl;
      const message=[`VidRa AI wallet ownership demonstration`, `Origin: ${origin}`,`Address: ${account}`,`Chain ID: 84532`,
        `Nonce: ${id}`,`Expires: ${new Date(expires).toISOString()}`,
        'This signature creates a 10-minute local Base Sepolia demo session for this address.',
        'It does not authorize asset transfers or token approvals. Every transaction needs separate wallet confirmation.',
        'Digital downloads require independently verified on-chain buyer entitlement.'].join('\n');
      entries.set(id,{account,message,expires});return {id,message,expires,account,chainId:84532};
    },
    verify(id,signature) {
      sweep();const c=entries.get(id);entries.delete(id);
      if(!c)throw new Error('Proof expired, unknown or already used');
      if(typeof signature!=='string'||signature.length!==132)throw new Error('EOA signature required');
      if(getAddress(verifyMessage(c.message,signature))!==c.account)throw new Error('Signature address mismatch');
      return {account:c.account,chainId:84532,verifiedAt:new Date(now()).toISOString(),scope:'local-testnet-wallet-session'};
    }
  };
}

// Challenges are atomically consumed in the shared database before signature recovery.
export function createPersistentProofStore({origin,store,now=Date.now}){
  return {
    async issue(address,chainId){
      const challenge=createProofStore({origin,now,limit:1}).issue(address,chainId);
      await store.issueChallenge({...challenge,account:challenge.account});return challenge;
    },
    async verify(id,signature){
      const challenge=await store.consumeChallenge(id);
      if(!challenge)throw new Error('Proof expired, unknown or already used');
      if(typeof signature!=='string'||signature.length!==132)throw new Error('EOA signature required');
      if(getAddress(verifyMessage(challenge.message,signature))!==challenge.account)throw new Error('Signature address mismatch');
      return {account:challenge.account,chainId:84532,verifiedAt:new Date(now()).toISOString(),scope:'local-testnet-wallet-session'};
    }
  };
}
