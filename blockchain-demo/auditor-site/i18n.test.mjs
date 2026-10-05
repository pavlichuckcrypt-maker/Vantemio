import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MESSAGES,resolveLanguage,t,setLanguage,localizeError} from './public/i18n.mjs';
const root=new URL('./public/',import.meta.url);
test('language query takes precedence, valid preference persists, invalid input and inaccessible storage are safe',()=>{
  const saved={getItem:()=> 'en'};
  assert.equal(resolveLanguage('?lang=ru',saved),'ru');assert.equal(resolveLanguage('',saved),'en');
  assert.equal(resolveLanguage('?lang=<script>',{getItem:()=> 'invalid'}),'ru');
  assert.equal(resolveLanguage('',{getItem(){throw new Error('blocked');}}),'ru');
});
test('every static, accessibility and dynamic translation has both languages and preserves interpolated values as text',()=>{
  const html=fs.readFileSync(new URL('index.html',root),'utf8'),source=fs.readFileSync(new URL('site.mjs',root),'utf8')+'\n'+fs.readFileSync(new URL('account.mjs',root),'utf8');
  const keys=[...html.matchAll(/data-i18n(?:-aria|-content)?="([^"]+)"/g),...source.matchAll(/\bt\('([^']+)'/g)].map(m=>m[1]);
  for(const key of keys)for(const language of ['ru','en'])assert.ok(MESSAGES[key]?.[language],`${key}: ${language}`);
  for(const [key,pair]of Object.entries(MESSAGES))assert.ok(!/[А-Яа-яЁё]/.test(pair.en),`${key} untranslated`);
  setLanguage('en');assert.equal(t('unsupported',{chain:'<img src=x onerror=bad>'}),'Unsupported network · <img src=x onerror=bad>');
  assert.equal(localizeError('Кошелёк изменился. Подключитесь снова.'),'The wallet changed. Connect again.');setLanguage('ru');
});
test('all funding cards have complete English descriptions without changing amounts, categories or source URLs',()=>{
  const rows=JSON.parse(fs.readFileSync(new URL('funding.json',root)));assert.equal(rows.length,11);
  for(const row of rows){for(const field of ['type','support','fit','status'])assert.ok(row.en[field]&&!/[А-Яа-яЁё]/.test(row.en[field]),row.name+field);assert.match(row.url,/^https:\/\//);}
  assert.match(rows[0].support,/4,000/);assert.match(rows[0].en.support,/4,000/);
  assert.equal(rows.filter(r=>r.category==='credits').length,3);
});
test('switching the actual site with a connected and proved wallet changes rendering only',async()=>{
  const originalNow=Date.now;
  const descriptors=new Map(['document','window','location','history','localStorage','fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  class Element{constructor(tag='div'){this.tagName=tag;this.dataset={};this.children=[];this.value='';this.textContent='';this.disabled=false;this.classList={toggle(){}};}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(k,v){this[k]=v;}getAttribute(k){return this[k]??null;}removeAttribute(k){delete this[k];}insertAdjacentElement(_where,n){this.children.push(n);}}
  const ids=new Map(),staticNodes=[new Element()];staticNodes[0].dataset.i18n='s008';
  const languages=['ru','en'].map(value=>{const e=new Element('button');e.dataset.language=value;return e;});
  const filters=['all','cash','credits','conditional'].map(value=>{const e=new Element('button');e.dataset.filter=value;return e;});
  const calls=[],requests=[],storage=new Map(),profile={id:'profile-a',displayName:'Demo user',locale:'ru',revision:0},account='0x'+'12'.repeat(20),listing='demo-listing';
  const doc={documentElement:{lang:'ru'},getElementById(id){if(!ids.has(id))ids.set(id,new Element());return ids.get(id);},createElement:tag=>new Element(tag),querySelectorAll(selector){return selector==='[data-language]'?languages:selector==='[data-filter]'?filters:selector==='[data-i18n]'?staticNodes:[];}};
  const walletEvents=new Map();
  globalThis.document=doc;globalThis.window={addEventListener(type,fn){walletEvents.set(type,fn);},removeEventListener(type){walletEvents.delete(type);},dispatchEvent(event){walletEvents.get(event.type)?.(event);},ethereum:{request:async input=>{calls.push(input.method);return input.method==='eth_chainId'?'0x14a34':input.method==='eth_getBalance'?'0x0':input.method==='personal_sign'?'0xsignature':[account];}}};
  globalThis.location={search:'',href:'http://127.0.0.1:18340/#wallet'};globalThis.history={replaceState(_a,_b,url){globalThis.location.href=String(url);}};globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
  const rows=JSON.parse(fs.readFileSync(new URL('funding.json',root)));
  let evidenceFails=false,delayedState=false,releaseState,intents=[],recoveryMissing=false;
  globalThis.fetch=async(url,options={})=>{requests.push([url,options.method||'GET']);if(url==='/api/evidence'&&evidenceFails)return{ok:false,json:async()=>({error:'Studio offline'})};let data;
    if(url==='/api/site')data={csrf:'csrf',documents:['AUDITOR_OVERVIEW_EN.txt'],evidence:[],media:['/media/demo.mp4','/media/demo-en.mp4','/media/content.mp4']};
    else if(url==='/api/evidence')data={chainView:{verified:true},exportedAt:'2026-10-03T17:00:00Z',manifest:{},marketplace:{listings:[{id:listing,title:'Монтажная услуга · demo',price:11,offerId:134,available:true,terms:'Original signed terms'}]}};
    else if(url==='/funding.json')data=rows;
    else if(url==='/api/wallet/challenge')data={id:'challenge',message:'Test session challenge'};
    else if(url==='/api/wallet/verify')data={account,user:{...profile,account},sessionExpires:new Date(Date.now()+600000).toISOString()};
    else if(url==='/api/wallet/state'){if(delayedState)await new Promise(resolve=>{releaseState=resolve;});data={account,user:{...profile,account},balance:'0',block:123,intents,orders:[]};}
    else if(url.startsWith('/api/wallet/intent?key=')){if(recoveryMissing)return {ok:false,status:404,json:async()=>({error:'Unknown wallet intent'})};assert.equal(options.headers['X-Vidra-Wallet'],account);const stored=JSON.parse(storage.get('vidra-wallet-intent:'+account.toLowerCase()));data={intent:{...stored,status:'REVERTED'}};}
    else if(url==='/api/wallet/profile'){assert.equal(options.headers['X-Vidra-Wallet'],account);Object.assign(profile,JSON.parse(options.body),{revision:profile.revision+1});data={user:{...profile,account}};}
    else if(url==='/api/wallet/logout')data={};
    else throw new Error('Unexpected network request '+url);
    return{ok:true,json:async()=>data};};
  try{
    setLanguage('ru');await import('./public/site.mjs?test='+Date.now());await new Promise(setImmediate);
    ids.get('wallet-select').value='legacy';await ids.get('connect-wallet').onclick();await ids.get('prove-wallet').onclick();await new Promise(setImmediate);
    assert.equal(ids.get('wallet-profile').hidden,false);assert.equal(ids.get('profile-id').textContent,'profile-a');ids.get('profile-name').value='My edited profile';await ids.get('save-profile').onclick();assert.equal(profile.displayName,'My edited profile');
    ids.get('wallet-listing').value=listing;filters[2].onclick();
    const before={requests:requests.length,walletCalls:calls.length,stored:storage.size};languages[1].onclick();
    assert.equal(requests.length,before.requests,'no HTTP reads or writes on language change');assert.equal(calls.length,before.walletCalls,'no provider calls on language change');
    assert.equal(ids.get('profile-name').value,'My edited profile','language change cannot restore the old profile carried by the login proof');assert.equal(ids.get('profile-locale').value,'ru');
    assert.equal(doc.documentElement.lang,'en');assert.equal(ids.get('demo-video').getAttribute('src'),'/media/demo-en.mp4');assert.equal(ids.get('demo-media-missing').hidden,true);assert.match(ids.get('wallet-proof').textContent,/Your address session is verified/);assert.equal(ids.get('wallet-listing').value,listing);assert.equal(ids.get('funding-list').children.length,3);assert.equal(storage.get('vidra-language'),'en');assert.match(globalThis.location.href,/\?lang=en#wallet$/);
    assert.ok(!calls.includes('eth_sendTransaction'));assert.match(ids.get('wallet-terms').textContent,/Original signed terms/);
    const recoveryKey='vidra-wallet-intent:'+account.toLowerCase(),hash='0x'+'ab'.repeat(32);
    const local={account,key:'durable-recover-key',id:'recover-id',status:'SUBMITTED',hash,sendStarted:true,input:{key:'durable-recover-key',action:'commit'}};
    storage.set(recoveryKey,JSON.stringify(local));intents=[{account,key:local.key,id:local.id,status:'PREPARED'}];await ids.get('wallet-sync').onclick();
    assert.equal(JSON.parse(storage.get(recoveryKey)).hash,hash,'actual UI refresh retains the known broadcast hash');
    intents=[{...intents[0],status:'REVERTED',hash}];await ids.get('wallet-sync').onclick();
    assert.equal(JSON.parse(storage.get(recoveryKey)).status,'REVERTED','actual UI adopts terminal failure instead of blocking the next purchase');intents=[];await ids.get('wallet-sync').onclick();assert.ok(requests.some(([u])=>u.startsWith('/api/wallet/intent?key=')),'actual UI looks up older recovery outside the state page');
    storage.set(recoveryKey,JSON.stringify(local));recoveryMissing=true;await ids.get('wallet-sync').onclick();
    assert.equal(JSON.parse(storage.get(recoveryKey)).hash,hash,'404 cannot erase a known broadcast');assert.equal(ids.get('wallet-reconcile').disabled,false,'missing server data must leave recovery available');recoveryMissing=false;
    const durable='{"key":"pending-preserved","status":"SUBMITTED"}';storage.set('vidra-wallet-intent',durable);
    delayedState=true;const expiredResponse=ids.get('wallet-sync').onclick();await new Promise(setImmediate);
    const beforeExpiry={calls:calls.length,requests:requests.length};Date.now=()=>originalNow()+600001;
    walletEvents.get('focus')();releaseState();await expiredResponse;
    assert.match(ids.get('wallet-proof').textContent,/wallet session expired/);assert.equal(ids.get('wallet-commit').disabled,true);assert.equal(ids.get('wallet-orders').children.length,0);assert.equal(ids.get('wallet-profile').hidden,true);assert.equal(ids.get('profile-name').value,'');
    assert.equal(calls.length,beforeExpiry.calls,'expiry never signs or broadcasts');assert.equal(requests.length,beforeExpiry.requests,'expiry never races renewal with logout');assert.equal(storage.get('vidra-wallet-intent'),durable,'expiry retains durable recovery state');
    languages[0].onclick();languages[1].onclick();assert.match(ids.get('wallet-proof').textContent,/wallet session expired/);assert.equal(ids.get('wallet-commit').disabled,true,'language rendering cannot restore an expired session');
    Date.now=originalNow;delayedState=false;await ids.get('prove-wallet').onclick();await new Promise(setImmediate);assert.equal(ids.get('wallet-commit').disabled,false,'explicit fresh signature restores checkout');
    evidenceFails=true;await ids.get('refresh').onclick();languages[0].onclick();assert.equal(ids.get('demo-video').getAttribute('src'),'/media/demo.mp4');assert.match(ids.get('live-status').textContent,/Студия недоступна/);assert.match(ids.get('verified-at').textContent,/устарели/,'language change cannot restore a stale verified status');
    delayedState=true;const pending=ids.get('wallet-sync').onclick();await new Promise(setImmediate);ids.get('disconnect-wallet').onclick();releaseState();await pending;assert.equal(ids.get('wallet-commit').disabled,true,'an old wallet response cannot enable checkout after disconnect');assert.equal(ids.get('wallet-orders').children.length,0);assert.equal(ids.get('wallet-profile').hidden,true);assert.equal(ids.get('profile-name').value,'');
    delayedState=false;await ids.get('connect-wallet').onclick();await ids.get('prove-wallet').onclick();await new Promise(setImmediate);
    const provider=globalThis.window.ethereum,uuid='350670db-19fa-4704-a166-e52e178b59d2',beforeDiscovery=calls.length;
    walletEvents.get('eip6963:announceProvider')({detail:{provider,info:{uuid,name:'MetaMask',rdns:'io.metamask'}}});
    assert.equal(ids.get('wallet-select').children.length,1,'late EIP-6963 does not duplicate a legacy wallet');assert.equal(ids.get('wallet-select').value,uuid);assert.equal(calls.length,beforeDiscovery,'late discovery never connects or signs');assert.match(ids.get('wallet-proof').textContent,/подтверждена/,'the same provider preserves the verified session');
    walletEvents.get('eip6963:announceProvider')({detail:{provider:{request(){throw Error('wrong wallet must not be called');}},info:{uuid,name:'MetaMask',rdns:'io.metamask'}}});
    await new Promise(setImmediate);assert.equal(ids.get('connect-wallet').disabled,true);assert.equal(ids.get('prove-wallet').disabled,true);assert.equal(ids.get('wallet-commit').disabled,true);assert.match(ids.get('wallet-discovery-status').textContent,/конфликтующие/);assert.equal(calls.length,beforeDiscovery);assert.ok(requests.some(([url,method])=>url==='/api/wallet/logout'&&method==='POST'));
  }finally{Date.now=originalNow;for(const [key,descriptor]of descriptors)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];setLanguage('ru');}
});
