export function withOperationLock(locks,work){
  if(!locks)throw new Error('Блокировка операций браузера недоступна');
  return locks.request('aim-base-operation',{ifAvailable:true},lock=>{
    if(!lock)throw new Error('Другая вкладка выполняет операцию. Дождитесь результата.');
    return work();
  });
}
// Persist only public operation parameters and a random retry key, never credentials.
export function createIntentClient({storage,fetch,randomUUID,csrf,withLock}) {
  const storageKey='aim-base-operation-intents-v1';
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
  function read(){
    const raw=storage.getItem(storageKey),entries=raw?JSON.parse(raw):{};
    if(!entries||Array.isArray(entries)||typeof entries!=='object'||Object.values(entries).some(v=>typeof v!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(v)))throw new Error('Журнал повторов повреждён; нужна проверка операций');
    return entries;
  }
  return async function request(action,params={},legacy=false){
    const durable=!legacy&&action!=='delivery';
    const execute=async()=>{
      const identity=JSON.stringify(canonical([action,params]));
      const entries=durable?read():{},key=entries[identity]||randomUUID();
      if(durable){
        if(!entries[identity]&&Object.keys(entries).length>=200)throw new Error('Журнал повторов заполнен; нужна проверка операций');
        entries[identity]=key;
        // Failure to save the intent prevents the POST entirely.
        storage.setItem(storageKey,JSON.stringify(entries));
      }
      let response,data;
      try{
        response=await fetch(legacy?'/api/action':'/api/market/action',{method:'POST',headers:{'Content-Type':'application/json','X-Demo-CSRF':csrf()},body:JSON.stringify({action,...params,...(legacy?{}:{idempotencyKey:key})})});
        data=await response.json();
      }catch(error){throw new Error('Ответ не получен. Повтор использует тот же ключ; новая операция не отправляется автоматически.',{cause:error});}
      if(!response.ok)throw new Error(data.error||'Операция отклонена');
      if(data.ok!==true||!data.result||typeof data.result!=='object')throw new Error('Ответ операции не подтверждён; ключ повтора сохранён');
      if(durable){const current=read();delete current[identity];storage.setItem(storageKey,JSON.stringify(current));}
      return data.result;
    };
    // Concurrent tabs are refused rather than queued as another purchase.
    if(durable){if(!withLock)throw new Error('Блокировка операций браузера недоступна');return withLock(execute);}
    return execute();
  };
}
