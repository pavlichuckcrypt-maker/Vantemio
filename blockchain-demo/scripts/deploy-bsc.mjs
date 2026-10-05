import { loadWallets } from '../src/vault.mjs';
import { connectBsc } from '../src/bsc-chain.mjs';
let ctx;
try{
  const {wallets}=await loadWallets();ctx=await connectBsc(wallets,{deploy:true});
  console.log('BSC Testnet contracts verified:',ctx.manifest.nft,ctx.manifest.safe);
}catch(e){console.error('BSC_DEPLOYMENT_PENDING',e.shortMessage||e.message);process.exitCode=1;}
finally{ctx?.provider.destroy();}
