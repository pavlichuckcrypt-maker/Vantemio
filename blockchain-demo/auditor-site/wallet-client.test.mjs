import test from 'node:test';import assert from 'node:assert/strict';
import {createWalletClient,BASE_SEPOLIA} from './public/wallet-client.mjs';
const account='0x'+'12'.repeat(20);
function fixture(chain=BASE_SEPOLIA){const listeners={},calls=[];return {listeners,calls,provider:{on(e,f){listeners[e]=f;},removeListener(e){delete listeners[e];},async request({method,params}){
  calls.push(method);return method==='eth_requestAccounts'||method==='eth_accounts'?[account]:method==='eth_chainId'?chain:method==='eth_getBalance'?'0x0':method==='personal_sign'?'0x'+'22'.repeat(65):null;}}};}
test('connect reads only; account and chain events invalidate ownership evidence',async()=>{
  const f=fixture(),states=[],c=createWalletClient(f.provider,s=>states.push(s));await c.connect();
  assert.deepEqual(f.calls,['eth_requestAccounts','eth_chainId','eth_getBalance']);
  await c.prove(async(p)=>p.endsWith('challenge')?{id:'nonce',message:'local proof'}:{account,scope:'local-wallet-ownership-only',sessionExpires:Date.now()+600000});
  assert.ok(states.at(-1).proof);f.listeners.accountsChanged();assert.equal(states.at(-1).proof,null);
  await assert.rejects(c.prove(()=>{}),/Подключите/);c.dispose();assert.equal(Object.keys(f.listeners).length,0);
});
test('mainnet is refused without automatic switch or signing',async()=>{
  const f=fixture('0x2105'),c=createWalletClient(f.provider);await assert.rejects(c.connect(),/Sepolia/);
  assert.equal(f.calls.includes('personal_sign'),false);assert.equal(f.calls.includes('wallet_switchEthereumChain'),false);
});
test('explicit network selection adds only Base Sepolia when MetaMask reports an unknown chain',async()=>{
  const f=fixture();let switches=0,config=null;
  const original=f.provider.request;f.provider.request=async a=>{
    if(a.method==='wallet_switchEthereumChain'){switches++;if(switches===1)throw Object.assign(new Error('Unknown chain'),{code:4902});return null;}
    if(a.method==='wallet_addEthereumChain'){config=a.params[0];return null;}
    return original(a);
  };
  const c=createWalletClient(f.provider);await c.switchNetwork();
  assert.equal(switches,2);assert.equal(config.chainId,BASE_SEPOLIA);
  assert.deepEqual(config.rpcUrls,['https://sepolia.base.org']);
  assert.deepEqual(config.blockExplorerUrls,['https://sepolia.basescan.org']);
  assert.equal(f.calls.includes('personal_sign'),false);assert.equal(f.calls.includes('eth_sendTransaction'),false);
});
test('a rejected network selection does not add a chain or request accounts',async()=>{
  const calls=[],c=createWalletClient({async request(a){calls.push(a.method);throw Object.assign(new Error('Rejected'),{code:4001});}});
  await assert.rejects(c.switchNetwork(),e=>e.code===4001);assert.deepEqual(calls,['wallet_switchEthereumChain']);
});
test('account race while signing cannot publish a stale proof',async()=>{
  const f=fixture();const original=f.provider.request;f.provider.request=async a=>{
    const r=await original(a);if(a.method==='personal_sign')f.listeners.chainChanged();return r;};
  const c=createWalletClient(f.provider);await c.connect();let verified=false;
  await assert.rejects(c.prove(async p=>{if(p.endsWith('verify'))verified=true;return{id:'n',message:'m'};}),/изменился/);
  assert.equal(verified,false);
});
function fakeTime(){
  let wall=1000000,mono=100,tick=0;const timers=new Map(),history=[];
  return {clock:{now:()=>wall,monotonic:()=>mono,schedule(fn,ms){const id=++tick;timers.set(id,{fn,ms});history.push(fn);return id;},cancel:id=>timers.delete(id)},
    advance(ms){wall+=ms;mono+=ms;},rollback(ms){wall-=ms;},fire(){const entries=[...timers];timers.clear();for(const [,t]of entries)t.fn();},get count(){return timers.size;},history,now:()=>wall};
}
async function provedFixture(ttl=600000){const f=fixture(),time=fakeTime(),states=[],posts=[];
  const c=createWalletClient(f.provider,s=>states.push(s),time.clock);
  const post=async path=>{posts.push(path);return path.endsWith('challenge')?{id:'n',message:'proof'}:{account,sessionExpires:time.now()+ttl};};
  await c.connect();await c.prove(post);return {f,time,states,posts,c,post};
}
test('expiry clears only the proof at the exact deadline without signing, sending or HTTP logout',async()=>{
  const {f,time,states,posts,c}=await provedFixture();const calls=[...f.calls],http=[...posts];
  time.advance(599999);assert.equal(c.isSessionValid(),true);time.advance(1);time.fire();
  assert.equal(c.isSessionValid(),false);assert.equal(states.at(-1).proof,null);assert.equal(states.at(-1).proofExpired,true);assert.equal(states.at(-1).account,account);
  assert.deepEqual(f.calls,calls);assert.deepEqual(posts,http);assert.equal(time.count,0);
  const count=states.length;assert.equal(c.isSessionValid(),false);assert.equal(states.length,count);c.dispose();
});
test('paused timers and a backward wall clock cannot extend the session',async()=>{
  for(const rollback of [false,true]){const {time,c}=await provedFixture();time.advance(600000);if(rollback)time.rollback(600000);
    assert.equal(c.isSessionValid(),false);await assert.rejects(c.send({}),/session expired/);c.dispose();}
});
test('old timer callbacks cannot expire a renewed proof; dispose and wallet events cancel timers',async()=>{
  const {time,c,post,f}=await provedFixture(1000);const old=time.history[0];time.advance(500);await c.prove(post);old();
  assert.equal(c.isSessionValid(),true);assert.equal(time.count,1);f.listeners.chainChanged();assert.equal(time.count,0);assert.equal(c.isSessionValid(),false);
  await c.connect();await c.prove(post);assert.equal(time.count,1);c.dispose();assert.equal(time.count,0);
});
test('expiration during provider identity reads refuses broadcast',async()=>{
  const {f,time,c}=await provedFixture(1000);const original=f.provider.request;
  f.provider.request=async input=>{const value=await original(input);if(input.method==='eth_chainId')time.advance(1000);return value;};
  await assert.rejects(c.send({chainId:BASE_SEPOLIA,from:account,value:'0x0'}),/session expired/);
  assert.ok(!f.calls.includes('eth_sendTransaction'));c.dispose();
});
test('invalid, expired, excessive-duration or mismatched server proofs fail closed',async()=>{
  for(const proof of [{account},{account,sessionExpires:1000000},{account,sessionExpires:1600001},{account:'0x'+'ff'.repeat(20),sessionExpires:1000100}]){
    const f=fixture(),time=fakeTime(),c=createWalletClient(f.provider,()=>{},time.clock);await c.connect();
    await assert.rejects(c.prove(async p=>p.endsWith('challenge')?{id:'n',message:'m'}:proof),/Invalid wallet session/);assert.equal(c.isSessionValid(),false);assert.equal(time.count,0);c.dispose();
  }
});
