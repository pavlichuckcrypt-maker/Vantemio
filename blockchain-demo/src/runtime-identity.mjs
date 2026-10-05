import net from 'node:net';
const profiles={'base-sepolia':{chainId:84532,port:18339,publicTransactions:true},'bsc-testnet':{chainId:97,port:18338,publicTransactions:true},'local-fork':{chainId:31337,port:18337,publicTransactions:false}};
const scope='Process identity only; blockchain verification uses /api/evidence';
function profile(network){if(!Object.hasOwn(profiles,network))throw new Error('Unknown demo runtime profile');return profiles[network];}
function loopback(url){const u=new URL(url);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||!Number.isInteger(Number(u.port))||Number(u.port)<1024||Number(u.port)>65535)throw new Error('Runtime control requires a plain loopback origin');return u;}
export function demoOrigin(network,port){const p=profile(network),value=port==null?p.port:Number(port);const url=`http://127.0.0.1:${value}`;loopback(url);return url;}
export function runtimeIdentity({network,manifest,pid,instanceId,active,queued,pendingTransaction}){
 const result={schemaVersion:1,service:'AIMmontag-demo-runtime',mode:network,chainId:manifest.chainId,publicTransactions:profile(network).publicTransactions,pid,instanceId,active,queued,pendingTransaction,scope};
 validateRuntimeIdentity(result,{network});return result;
}
export function validateRuntimeIdentity(value,{network,pid,instanceId}={}){
 const p=profile(network),keys=['schemaVersion','service','mode','chainId','publicTransactions','pid','instanceId','active','queued','pendingTransaction','scope'];
 if(!value||typeof value!=='object'||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k))||value.schemaVersion!==1||value.service!=='AIMmontag-demo-runtime'||value.mode!==network||value.chainId!==p.chainId||value.publicTransactions!==p.publicTransactions||!Number.isSafeInteger(value.pid)||value.pid<=1||(typeof value.instanceId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.instanceId))||(value.active!==null&&(typeof value.active!=='string'||!value.active))||!Number.isSafeInteger(value.queued)||value.queued<0||value.queued>6||typeof value.pendingTransaction!=='boolean'||value.scope!==scope||(pid!=null&&value.pid!==pid)||(instanceId!=null&&value.instanceId!==instanceId))throw new Error('Runtime identity or process record mismatch');
 return value;
}
export async function readRuntimeIdentity({url,network,pid,instanceId,fetcher=fetch,timeout=5000}){
 const origin=loopback(url).origin,response=await fetcher(origin+'/api/runtime',{signal:AbortSignal.timeout(timeout),redirect:'error'});
 if(!response.ok)throw new Error('Runtime identity endpoint unavailable');
 return validateRuntimeIdentity(await response.json(),{network,pid,instanceId});
}
export async function assertPortFree(url,{timeout=800}={}){
 const u=loopback(url);
 const free=await new Promise(resolve=>{const socket=net.createConnection({host:u.hostname,port:Number(u.port)});let done=false;const finish=result=>{if(done)return;done=true;socket.destroy();resolve(result);};socket.once('connect',()=>finish(false));socket.once('error',e=>finish(e.code==='ECONNREFUSED'));socket.setTimeout(timeout,()=>finish(false));});
 if(!free)throw new Error('Existing or uncertain loopback listener; no second demo may launch');
}
export async function stopVerifiedRuntime(info,{network,fetcher=fetch,signal=(pid)=>process.kill(pid,'SIGTERM')}={}){
 if(info?.mode!==network||!Number.isSafeInteger(info.pid)||info.pid<=1||typeof info.instanceId!=='string')throw new Error('Invalid demo process record');
 const identity=await readRuntimeIdentity({url:info.url,network,pid:info.pid,instanceId:info.instanceId,fetcher});
 if(identity.active!==null||identity.queued!==0||identity.pendingTransaction)throw new Error('Demo operation or unresolved public transaction active; shutdown refused');
 signal(info.pid);return identity;
}
