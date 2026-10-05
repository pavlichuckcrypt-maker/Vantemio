// EIP-6963 metadata is self-reported; it is not proof of extension authenticity.
export function createWalletDiscovery(target,onChange=()=>{}) {
  const entries=new Map(),blocked=new Set(),limit=16;
  let disposed=false;
  const snapshot=()=>({entries:[...entries.values()],conflicts:blocked.size});
  const notify=()=>onChange(snapshot());
  function announce(event) {
    if(disposed)return;
    try {
      const {info,provider}=event?.detail||{},uuid=info?.uuid,name=info?.name,rdns=info?.rdns;
      if(typeof uuid!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)||
        typeof name!=='string'||!name.trim()||name.length>80||/[\u0000-\u001f\u007f]/.test(name)||
        typeof rdns!=='string'||rdns.length>253||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(rdns)||
        typeof provider?.request!=='function')return;
      const id=uuid.toLowerCase();if(blocked.has(id))return;
      const previous=entries.get(id);
      if(previous) {
        if(previous.provider===provider&&previous.info.name===name&&previous.info.rdns===rdns)return;
        // A conflicting announcement must never replace the provider the user selected.
        entries.delete(id);blocked.add(id);notify();return;
      }
      const duplicate=[...entries.values()].find(p=>p.provider===provider&&p.info.uuid!=='legacy');
      if(duplicate)return;
      entries.delete('legacy');
      if(entries.size+blocked.size>=limit)return;
      entries.set(id,Object.freeze({provider,info:Object.freeze({uuid:id,name,rdns})}));notify();
    }catch { /* Ignore malformed announcements and throwing metadata getters. */ }
  }
  target.addEventListener('eip6963:announceProvider',announce);
  return {
    list:snapshot,
    refresh() {
      if(disposed)return;
      target.dispatchEvent(new Event('eip6963:requestProvider'));
      // A legacy provider is only a fallback when no standard provider was announced.
      if(!entries.size&&!blocked.size) {
        try {
          const provider=target.ethereum;
          if(typeof provider?.request==='function'&&entries.get('legacy')?.provider!==provider){
            entries.set('legacy',Object.freeze({provider,info:Object.freeze({uuid:'legacy',name:provider.isMetaMask?'MetaMask':'EVM Wallet',rdns:null})}));notify();
          }
        }catch {}
      }
      return snapshot();
    },
    dispose(){disposed=true;target.removeEventListener('eip6963:announceProvider',announce);entries.clear();blocked.clear();}
  };
}
