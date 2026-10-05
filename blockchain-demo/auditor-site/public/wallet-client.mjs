export const BASE_SEPOLIA='0x14a34';
export function createWalletClient(provider,onChange=()=>{},clock={}) {
  const now=clock.now||(()=>Date.now()),monotonic=clock.monotonic||(()=>performance.now());
  const schedule=clock.schedule||setTimeout,cancel=clock.cancel||clearTimeout;
  let expiryTimer=null,deadline=null,proofAttempt=0;
  let revision=0,state={account:null,chainId:null,proof:null,balance:null};
  const listeners=[];
  function clearExpiry(){if(expiryTimer!==null)cancel(expiryTimer);expiryTimer=null;deadline=null;}
  function isSessionValid(){
    if(!state.proof)return false;
    if(now()<state.proof.sessionExpires&&monotonic()<deadline)return true;
    clearExpiry();state={...state,proof:null,proofExpired:true};onChange({...state});return false;
  }
  function requireSession(){if(!isSessionValid())throw new Error('Wallet session expired. Verify your address again.');return state.proof;}
  function watchExpiry(proof){
    if(state.proof!==proof)return;
    if(!isSessionValid())return;
    expiryTimer=schedule(()=>watchExpiry(proof),Math.max(1,Math.min(proof.sessionExpires-now(),deadline-monotonic())));
    expiryTimer?.unref?.();
  }
  function invalidate(){revision++;proofAttempt++;clearExpiry();state={account:null,chainId:null,proof:null,balance:null};onChange({...state});}
  for(const event of ['accountsChanged','chainChanged','disconnect']){
    provider.on?.(event,invalidate);listeners.push([event,invalidate]);
  }
  async function connect(){
    const id=++revision;proofAttempt++;clearExpiry();state={account:null,chainId:null,proof:null,balance:null};onChange({...state});
    const accounts=await provider.request({method:'eth_requestAccounts'});
    const chainId=await provider.request({method:'eth_chainId'});
    if(id!==revision)throw new Error('Кошелёк изменился. Подключитесь снова.');
    if(!Array.isArray(accounts)||!/^0x[\da-fA-F]{40}$/.test(accounts[0]||''))throw new Error('Нет доступного адреса');
    state={account:accounts[0],chainId,proof:null,balance:null};onChange({...state});
    if(chainId.toLowerCase()!==BASE_SEPOLIA)throw new Error('Выберите Base Sepolia для демонстрации');
    const balance=await provider.request({method:'eth_getBalance',params:[state.account,'latest']});
    if(id!==revision)throw new Error('Кошелёк изменился. Подключитесь снова.');
    state.balance=balance;onChange({...state});return {...state};
  }
  return {connect,isSessionValid,requireSession,disconnect:invalidate,dispose(){invalidate();for(const [e,l] of listeners)provider.removeListener?.(e,l);},
    async send(tx){
      const proof=requireSession(),id=revision,account=state.account;
      const accounts=await provider.request({method:'eth_accounts'}),chain=await provider.request({method:'eth_chainId'});
      if(requireSession()!==proof)throw new Error('Wallet session expired. Verify your address again.');
      if(!account||id!==revision||accounts[0]?.toLowerCase()!==account.toLowerCase()||chain.toLowerCase()!==BASE_SEPOLIA||tx.chainId!==BASE_SEPOLIA||tx.from.toLowerCase()!==account.toLowerCase()||tx.value!=='0x0')throw new Error('Wallet transaction identity changed');
      return provider.request({method:'eth_sendTransaction',params:[tx]});
    },
    async switchNetwork(){
      try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:BASE_SEPOLIA}]});}
      catch(e){if(e.code!==4902)throw e;
        await provider.request({method:'wallet_addEthereumChain',params:[{chainId:BASE_SEPOLIA,chainName:'Base Sepolia',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:['https://sepolia.base.org'],blockExplorerUrls:['https://sepolia.basescan.org']}]});
        await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:BASE_SEPOLIA}]});
      }
      return connect();
    },
    async prove(post){
      if(!state.account||state.chainId?.toLowerCase()!==BASE_SEPOLIA)throw new Error('Подключите Base Sepolia');
      const id=revision,attempt=++proofAttempt,account=state.account;
      const current=await provider.request({method:'eth_accounts'}),chain=await provider.request({method:'eth_chainId'});
      if(current[0]?.toLowerCase()!==account.toLowerCase()||chain.toLowerCase()!==BASE_SEPOLIA||id!==revision){invalidate();throw new Error('Кошелёк изменился');}
      const c=await post('/api/wallet/challenge',{address:account,chainId:84532});
      if(id!==revision)throw new Error('Кошелёк изменился');
      const bytes=new TextEncoder().encode(c.message),hex='0x'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
      const signature=await provider.request({method:'personal_sign',params:[hex,account]});
      if(id!==revision)throw new Error('Кошелёк изменился');
      const proof=await post('/api/wallet/verify',{id:c.id,signature});
      if(id!==revision||attempt!==proofAttempt)throw new Error('Кошелёк изменился');
      const sessionExpires=typeof proof.sessionExpires==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(proof.sessionExpires)?Date.parse(proof.sessionExpires):proof.sessionExpires;
      const ttl=sessionExpires-now();
      if(proof.account?.toLowerCase()!==account.toLowerCase()||!Number.isSafeInteger(sessionExpires)||ttl<=0||ttl>600000)throw new Error('Invalid wallet session proof');
      clearExpiry();deadline=monotonic()+ttl;state={...state,proof:Object.freeze({...proof,sessionExpires}),proofExpired:false};
      watchExpiry(state.proof);onChange({...state});return state.proof;
    }
  };
}
