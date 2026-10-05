import { loadWallets } from '../src/vault.mjs';
import { connectBase } from '../src/base-chain.mjs';
let ctx;
try{
  const {wallets}=await loadWallets();ctx=await connectBase(wallets,{deploy:true});
  console.log('Base Sepolia contracts verified:',ctx.manifest.nft,ctx.manifest.safe);
}catch(e){console.error('BASE_DEPLOYMENT_PENDING',e.shortMessage||e.message);process.exitCode=1;}
finally{ctx?.provider.destroy();}
