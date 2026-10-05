import {ServiceError} from './user-database.mjs';

export const MARKET_LIMITS=Object.freeze({checkout:8,read:4,queuedPerLane:64,waitMs:8000});

// The queue holds HTTP work only. It never signs or retries a wallet transaction.
export function createMarketAdmission({limits=MARKET_LIMITS}={}){
  const lanes=new Map(['checkout','read'].map(lane=>[lane,{active:0,queue:[],wallets:new Set()}]));
  function drain(lane,state){
    while(state.active<limits[lane]&&state.queue.length){
      const entry=state.queue.shift();clearTimeout(entry.timer);
      entry.signal?.removeEventListener('abort',entry.abort);
      if(entry.signal?.aborted){state.wallets.delete(entry.wallet);entry.reject(new ServiceError('Request disconnected',499));continue;}
      state.active++;
      Promise.resolve().then(entry.fn).then(entry.resolve,entry.reject).finally(()=>{
        state.active--;state.wallets.delete(entry.wallet);drain(lane,state);
      });
    }
  }
  function run(lane,account,fn,{signal}={}){
    const state=lanes.get(lane);
    if(!state||typeof account!=='string'||typeof fn!=='function')return Promise.reject(new ServiceError('Invalid market admission',400));
    if(signal?.aborted)return Promise.reject(new ServiceError('Request disconnected',499));
    const wallet=account.toLowerCase();
    if(state.wallets.has(wallet))return Promise.reject(new ServiceError('Wallet request already active or queued',409));
    if(state.active>=limits[lane]&&state.queue.length>=limits.queuedPerLane)return Promise.reject(new ServiceError('Market queue full; retry the same request later',503));
    state.wallets.add(wallet);
    return new Promise((resolve,reject)=>{
      const entry={wallet,fn,signal,resolve,reject};
      function remove(error){const index=state.queue.indexOf(entry);if(index<0)return;state.queue.splice(index,1);clearTimeout(entry.timer);signal?.removeEventListener('abort',entry.abort);state.wallets.delete(wallet);reject(error);}
      entry.abort=()=>remove(new ServiceError('Request disconnected',499));
      entry.timer=setTimeout(()=>remove(new ServiceError('Market queue wait expired; retry the same request later',503)),limits.waitMs);
      signal?.addEventListener('abort',entry.abort,{once:true});state.queue.push(entry);drain(lane,state);
    });
  }
  return {run,snapshot(){return Object.fromEntries([...lanes].map(([name,state])=>[name,{active:state.active,queued:state.queue.length}]));}};
}
