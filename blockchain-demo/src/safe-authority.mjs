import {keccak256,ZeroAddress} from 'ethers';
import {getSafeSingletonDeployment} from '@safe-global/safe-deployments';
import {artifact} from './compile.mjs';
import {registeredSafeOwnersMatch} from './approval-authority.mjs';
export const SAFE_MODULE_SENTINEL='0x0000000000000000000000000000000000000001';
export const SAFE_GUARD_SLOT='0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8';
export const SAFE_FALLBACK_SLOT='0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5';
const zero='0x'+'0'.repeat(64);
export async function assertSafeAuthority(ctx,{blockTag}={}){
 const {provider,manifest,safe}=ctx;
 if(manifest?.chainId!==84532||!manifest.publicTransactions||!safe)throw new Error('Public Base Safe authority required');
 if(Number(await provider.send('eth_chainId',[]))!==84532)throw new Error('Safe authority requires Base Sepolia');
 const singleton=getSafeSingletonDeployment({version:'1.4.1',network:'84532'})?.networkAddresses['84532'];
 if(typeof singleton!=='string'||manifest.safeSingleton?.toLowerCase()!==singleton.toLowerCase())throw new Error('Safe singleton differs from official registry');
 const block=await provider.getBlock(blockTag??'latest');if(!block?.hash||!Number.isSafeInteger(block.number))throw new Error('Missing Safe authority block');
 const [proxy,masterCopy,singletonCode]=await Promise.all([provider.getCode(manifest.safe,block.number),provider.getStorage(manifest.safe,0,block.number),provider.getCode(singleton,block.number)]);
 const proxyHash=keccak256(artifact('@safe-global/safe-contracts/build/artifacts/contracts/proxies/SafeProxy.sol/SafeProxy.json').deployedBytecode);
 const singletonHash=keccak256(artifact('@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json').deployedBytecode);
 if(keccak256(proxy)!==proxyHash||proxyHash!==manifest.safeCodeHash||masterCopy.toLowerCase()!==('0x'+singleton.slice(2).toLowerCase().padStart(64,'0'))||keccak256(singletonCode)!==singletonHash)throw new Error('Safe proxy or implementation changed');
 const options={blockTag:block.number};
 const [owners,threshold,modules,guard,fallback]=await Promise.all([safe.getOwners(options),safe.getThreshold(options),safe.getModulesPaginated(SAFE_MODULE_SENTINEL,1,options),provider.getStorage(manifest.safe,SAFE_GUARD_SLOT,block.number),provider.getStorage(manifest.safe,SAFE_FALLBACK_SLOT,block.number)]);
 if(!registeredSafeOwnersMatch(Array.from(owners),manifest.safeOwners,threshold))throw new Error('Safe registered authority changed');
 if(!Array.isArray(modules[0])||modules[0].length!==0||modules[1]?.toLowerCase()!==SAFE_MODULE_SENTINEL)throw new Error('Unexpected Safe module; 3-of-5 owner policy alone is insufficient');
 if(guard.toLowerCase()!==zero||fallback.toLowerCase()!==zero)throw new Error('Unexpected Safe guard or fallback handler');
 if((await provider.getBlock(block.number))?.hash!==block.hash)throw new Error('Safe authority block is no longer canonical');
 return {chainId:84532,safe:manifest.safe,singleton,proxyCodeHash:proxyHash,singletonCodeHash:singletonHash,owners:Array.from(owners),threshold:3,modules:[],guard:ZeroAddress,fallbackHandler:ZeroAddress,block:{number:block.number,hash:block.hash}};
}
export async function assertRuntimeSafe(ctx,options={}){
 if(ctx.manifest?.chainId!==84532)return;
 if(typeof ctx.assertAuthority!=='function')throw new Error('Public Safe authority verifier missing');
 return ctx.assertAuthority(options);
}
