// Every mutation is fenced to this owned, disposable, keyless loopback fork.
import fs from 'node:fs';import path from 'node:path';import net from 'node:net';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
import {Contract,JsonRpcProvider,FetchRequest,keccak256,toBeHex,parseEther} from 'ethers';import {bosonABI} from '../src/chain.mjs';
export async function withPinnedBosonFork(root,fn,{port=19558,timeoutMs=360000}={}){
 const url=`http://127.0.0.1:${port}`,manifest=JSON.parse(fs.readFileSync(path.join(root,'evidence/BASE_DEPLOYMENT_MANIFEST.json'),'utf8')),pin=JSON.parse(fs.readFileSync(path.join(root,'boson-implementation.json'),'utf8'));
 assert.equal(manifest.chainId,84532);assert.equal(manifest.sourceBosonImplementationDigest,pin.digest);
 const upstream=['https://sepolia.base.org','https://base-sepolia-rpc.publicnode.com'].map(u=>{const req=new FetchRequest(u);req.timeout=15000;return new JsonRpcProvider(req,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});});let child,local,timer;
 try{
  const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});await new Promise(r=>server.close(r));
  for(const p of upstream)assert.equal(Number(await p.send('eth_chainId',[])),84532);
  const number=(await upstream[0].getBlockNumber())-2,blocks=await Promise.all(upstream.map(p=>p.getBlock(number)));assert.ok(blocks[0]?.hash);assert.equal(blocks[0].hash,blocks[1]?.hash);
  const binary=path.join(root,'node_modules/@foundry-rs/anvil-'+process.platform+'-'+(process.arch==='arm64'?'arm64':'amd64'),'bin/anvil');
  const diagnostic=fs.openSync(path.join(root,'runtime-site',`seller-fork-${Date.now()}.log`),'wx',0o600);
  try{child=spawn(binary,['--host','127.0.0.1','--port',String(port),'--chain-id','31337','--accounts','0','--fork-url','https://base-sepolia-rpc.publicnode.com','--fork-block-number',String(number),'--no-storage-caching'],{stdio:['ignore',diagnostic,diagnostic]});}finally{fs.closeSync(diagnostic);}child.once('error',()=>{});
  timer=setTimeout(()=>child?.kill('SIGTERM'),timeoutMs);timer.unref();local=new JsonRpcProvider(url,31337,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});
  let ready=false;for(let i=0;i<360;i++){if(child.exitCode!==null)throw Error('Owned fork exited; inspect private diagnostic log');try{if(Number(await local.send('eth_chainId',[]))===31337){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'fork startup not confirmed within test budget; private diagnostic log retained');
  assert.match(await local.send('web3_clientVersion',[]),/anvil/i);assert.deepEqual(await local.send('eth_accounts',[]),[]);assert.equal((await local.getBlock(number)).hash,blocks[0].hash);
  assert.equal(keccak256(await local.getCode(manifest.sourceBoson)),manifest.sourceBosonCodeHash);assert.equal(keccak256(await local.getCode(manifest.credit)),manifest.creditCodeHash);
  const loupe=new Contract(manifest.sourceBoson,['function facets() view returns(tuple(address facetAddress,bytes4[] functionSelectors)[])'],local),facets=await loupe.facets();assert.equal(facets.length,pin.snapshot.facets.length);
  for(const f of pin.snapshot.facets){const actual=facets.find(v=>v.facetAddress.toLowerCase()===f.address);assert.ok(actual);assert.deepEqual([...actual.functionSelectors].map(v=>v.toLowerCase()).sort(),f.selectors);assert.equal(keccak256(await local.getCode(f.address)),f.codeHash);}
  const extra=JSON.parse(fs.readFileSync(path.join(root,'node_modules/@bosonprotocol/common/src/abis/IBosonOrchestrationHandler.json'),'utf8')),
    boson=new Contract(manifest.sourceBoson,[...bosonABI(),...extra],local),credit=new Contract(manifest.credit,['function balanceOf(address) view returns(uint256)','function transfer(address,uint256) returns(bool)','function approve(address,uint256) returns(bool)','function allowance(address,address) view returns(uint256)'],local);
  const priceGas=toBeHex((await local.getFeeData()).gasPrice*3n+1n);
  async function rpc(method,args){assert.ok(child.exitCode===null,'owned fork is no longer live');assert.equal(new URL(local._getConnection().url).origin,url);assert.equal(Number(await local.send('eth_chainId',[])),31337);return local.send(method,args);}
  async function unlock(a){await rpc('anvil_impersonateAccount',[a]);await rpc('anvil_setBalance',[a,toBeHex(parseEther('3'))]);}
  async function receipt(hash){for(let i=0;i<100;i++){const r=await local.getTransactionReceipt(hash);if(r)return r;await new Promise(r=>setTimeout(r,50));}throw Error('Local receipt not observed');}
  async function send(from,to,data,{gas=5000000}={}){const hash=await rpc('eth_sendTransaction',[{from,to,data,value:'0x0',gas:toBeHex(gas),gasPrice:priceGas}]);const r=await receipt(hash);assert.equal(r.status,1,'fork transaction reverted');return r;}
  function event(receipt,name){const events=receipt.logs.filter(v=>v.address.toLowerCase()===manifest.sourceBoson.toLowerCase()).map(v=>{try{return boson.interface.parseLog(v);}catch{return null;}}).filter(v=>v?.name===name);assert.equal(events.length,1);return events[0].args;}
  const selectors=new Set(facets.flatMap(f=>Array.from(f.functionSelectors,s=>s.toLowerCase())));
  return await fn({local,boson,credit,manifest,pin,sourceBlock:{number,hash:blocks[0].hash},unlock,send,event,rpc,supports:selector=>selectors.has(selector.toLowerCase())});
 }finally{clearTimeout(timer);child?.kill('SIGTERM');local?.destroy();for(const p of upstream)p.destroy();if(child&&child.exitCode===null){await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);if(child.exitCode===null)child.kill('SIGKILL');}}
}
