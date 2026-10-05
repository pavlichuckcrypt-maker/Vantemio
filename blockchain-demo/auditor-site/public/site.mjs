import {bindWalletWorkspace} from './wallet-workspace.mjs';
import {reconcileWithRetry,mergeRecoveryIntent} from './wallet-recovery.mjs';
import {t,locale,applyLanguage,setLanguage,getLanguage,localizeError} from './i18n.mjs';
import {createWalletClient,BASE_SEPOLIA} from './wallet-client.mjs';
import {createWalletDiscovery} from './wallet-discovery.mjs';
const $=id=>document.getElementById(id),providers=new Map();let client=null,selectedProvider=null,providerConflicts=0,csrf=null,walletState=null,marketState=null,operation=false,listings=[],sellerListings=[],siteData=null,lastEvidence=null,fundingFilter='all',funding=[],evidenceError=null,evidenceBusy=false,userProfile=null;
applyLanguage(document);
for(const button of document.querySelectorAll('[data-language]'))button.onclick=()=>changeLanguage(button.dataset.language);
async function post(url,body,account=walletState?.account){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Vidra-CSRF':csrf,...(account?{'X-Vidra-Wallet':account}:{})},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function link(text,href){const n=node('a',text);n.href=href;if(href.startsWith('https://')){n.target='_blank';n.rel='noreferrer';}return n;}
const discovery=createWalletDiscovery(window,snapshot=>{
  providers.clear();for(const entry of snapshot.entries)providers.set(entry.info.uuid,entry);providerConflicts=snapshot.conflicts;
  if(selectedProvider&&![...providers.values()].some(p=>p.provider===selectedProvider)){client?.dispose();client=null;selectedProvider=null;}
  renderProviders();
});
function renderProviders(){const selected=$('wallet-select').value;$('wallet-select').replaceChildren();
  for(const [id,p] of providers){const o=node('option',p.info.name||'EVM Wallet');o.value=id;$('wallet-select').append(o);}
  if(providers.has(selected))$('wallet-select').value=selected;
  else if(selectedProvider){const replacement=[...providers].find(([,p])=>p.provider===selectedProvider);if(replacement)$('wallet-select').value=replacement[0];}
  if(!providers.size){$('wallet-select').append(node('option',t('Кошелёк не найден в этом браузере')));$('wallet-status').textContent=t('Откройте этот сайт в Chrome / другом браузере с установленным MetaMask.');}
  $('wallet-discovery-status').textContent=providerConflicts?t('walletDiscoveryConflict'):t('walletProviderWarning');
  $('connect-wallet').disabled=!providers.size;
}
discovery.refresh();
renderProviders();
function updateWallet(s,renderOnly=false){
  if(typeof window.dispatchEvent==='function'&&typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('vidra-wallet-session',{detail:{account:s.account,proof:s.proof}}));
const hadProof=!!walletState?.proof,previousAccount=walletState?.account,previousProof=walletState?.proof;walletState=s;const connected=!!s.account,base=s.chainId?.toLowerCase()===BASE_SEPOLIA;
  if(!s.proof){userProfile=null;renderProfile();marketState=null;setMarketButtons(false);$('wallet-orders').replaceChildren();$('wallet-market-status').textContent=t(s.proofExpired?'walletSessionExpired':'s062');if(!renderOnly&&csrf&&hadProof&&!s.proofExpired)void post('/api/wallet/logout',{},previousAccount).catch(()=>{});}
  $('disconnect-wallet').disabled=!connected;$('switch-wallet').disabled=!connected||base;$('prove-wallet').disabled=!connected||!base||!csrf;
  $('wallet-details').replaceChildren();for(const [k,v] of [[t('Адрес'),s.account],[t('Сеть'),s.chainId?(base?'Base Sepolia · 84532':t('unsupported',{chain:s.chainId})):null],[t('Тестовый ETH'),s.balance!==null?formatWei(s.balance):null]]){
    if(v!==null){$('wallet-details').append(node('dt',k),node('dd',v));}}
  $('wallet-status').textContent=connected?(base?t('Адрес подключён к Base Sepolia.'):t('Нужна сеть Base Sepolia.')):t('Адрес не подключён.');
  $('wallet-proof').textContent=s.proof?t('proof',{account:s.proof.account,time:new Date(s.proof.sessionExpires).toLocaleTimeString(locale())}):s.proofExpired?t('walletSessionExpired'):t('Подпись создаёт 10-минутную локальную тестовую сессию. Она не разрешает списание: каждая транзакция подтверждается отдельно.');
  if(s.proof!==previousProof&&s.proof?.user&&s.proof.user.account.toLowerCase()===s.account.toLowerCase()){userProfile=s.proof.user;renderProfile();}if(s.proof&&!renderOnly)void syncMarket();
}
function renderProfile(){
  const p=userProfile,valid=p&&walletState?.proof&&p.account.toLowerCase()===walletState.account?.toLowerCase();
  $('wallet-profile').hidden=!valid;
  if(!valid){$('profile-name').value='';$('profile-id').textContent='';$('profile-status').textContent='';return;}
  $('profile-id').textContent=p.id;$('profile-name').value=p.displayName;$('profile-locale').value=p.locale;
}
$('save-profile').onclick=async()=>{
  if(!client?.isSessionValid()||!userProfile)return;
  const proof=walletState.proof,account=walletState.account,p=userProfile;
  $('save-profile').disabled=true;
  try{const d=await post('/api/wallet/profile',{displayName:$('profile-name').value,locale:$('profile-locale').value,revision:p.revision},account);
    if(!client?.isSessionValid()||walletState.proof!==proof||walletState.account!==account)return;
    if(d.user?.account.toLowerCase()!==account.toLowerCase())throw new Error('Wallet session account changed');
    userProfile=d.user;renderProfile();$('profile-status').textContent=t('profileSaved');
  }catch(e){if(client?.isSessionValid()&&walletState.proof===proof&&walletState.account===account)$('profile-status').textContent=localizeError(e.message);}
  finally{$('save-profile').disabled=false;}
};
function formatWei(hex){const n=BigInt(hex),unit=10n**18n;return `${n/unit}.${(n%unit).toString().padStart(18,'0').slice(0,6)}`;}
async function guarded(button,fn){button.disabled=true;try{await fn();}catch(e){$('wallet-status').textContent=e.code===4001?t('Запрос отклонён в кошельке.'):localizeError(e.message)||t('Кошелёк недоступен');}finally{button.disabled=button.id==='connect-wallet'?!providers.size:!walletState?.account||(button.id==='prove-wallet'&&walletState.chainId?.toLowerCase()!==BASE_SEPOLIA);}}
$('connect-wallet').onclick=()=>guarded($('connect-wallet'),async()=>{const provider=providers.get($('wallet-select').value)?.provider;if(!provider)throw new Error(t('walletUnavailable'));client?.dispose();selectedProvider=provider;client=createWalletClient(provider,updateWallet);await client.connect();});
$('wallet-select').onchange=()=>{client?.dispose();client=null;selectedProvider=null;updateWallet({account:null,chainId:null,proof:null,balance:null});};
$('disconnect-wallet').onclick=()=>client?.disconnect();
$('switch-wallet').onclick=()=>guarded($('switch-wallet'),()=>client.switchNetwork());
$('prove-wallet').onclick=()=>guarded($('prove-wallet'),()=>client.prove(post));
const documentNames={"MULTIUSER_ARCHITECTURE_RU_EN.txt":"multiuserDocument","START_HERE_RU.txt": "Начать проверку · запуск и сценарий", "AUDIT_AND_ARCHITECTURE_RU.txt": "Архитектура · безопасность · ограничения", "APPLICATION_DRAFTS_RU_EN.txt": "Черновики заявок · RU / EN", "FUNDING_SHORTLIST_RU.txt": "Программы финансирования · критерии", "ROADMAP_AND_BUDGET_RU.txt": "План развития · бюджетные сценарии", "PUBLICATION_REGISTER_RU.txt": "GitHub · состав публикации", "AUDITOR_OVERVIEW_EN.txt": "overview"};
function renderDocuments(){if(!siteData)return;$('document-list').replaceChildren();for(const name of siteData.documents)$('document-list').append(link(t(documentNames[name]||name),'/docs/'+name));}
function renderDemoMedia(){
  if(!siteData)return;
  const url=getLanguage()==='en'?'/media/demo-en.mp4':'/media/demo.mp4',available=siteData.media.includes(url);
  if(available){if($('demo-video').getAttribute('src')!==url)$('demo-video').setAttribute('src',url);}
  else $('demo-video').removeAttribute('src');
  $('demo-media-missing').hidden=available;
}
try{const data=await (await fetch('/api/site')).json();csrf=data.csrf;siteData=data;renderDocuments();
  for(const name of data.evidence)$('evidence-list').append(link(name,'/evidence/'+name));
  renderDemoMedia();
  for(const [id,url] of [['content-video','/media/content.mp4']])if(!data.media.includes(url)){$(id).removeAttribute('src');const fallback=node('p',t('Файл доступен в локальном демонстрационном пакете; на этом запуске media не подключён.'),'caption');fallback.dataset.i18n='Файл доступен в локальном демонстрационном пакете; на этом запуске media не подключён.';$(id).insertAdjacentElement('afterend',fallback);}
}catch(e){$('document-list').append(node('p',t('Документы временно недоступны: ')+localizeError(e.message)));}
async function refresh(){const button=$('refresh');button.disabled=true;evidenceBusy=true;evidenceError=null;$('live-status').textContent=t('Сверка с работающей студией…');
  try{const r=await fetch('/api/evidence');const data=await r.json();if(!r.ok)throw new Error(data.error);
    lastEvidence=data;try{const catalog=await fetch('/api/catalog'),result=await catalog.json();if(!catalog.ok)throw new Error(result.error);sellerListings=result.listings;}catch{sellerListings=sellerListings.map(l=>({...l,available:false}));}renderEvidence(data);
  }catch(e){evidenceError=e.message;renderEvidenceFailure();}
  finally{button.disabled=false;evidenceBusy=false;}
}
function renderEvidenceFailure(){$('live-status').textContent=t('Студия недоступна · ')+localizeError(evidenceError);$('verified-at').textContent=t('Актуальный снимок недоступен; предыдущие цифры, если показаны, устарели. Исторические отчёты сохранены.');}
function renderEvidence(data){
    const projection=data.chainView||{};
    $('receipts').textContent=data.receipts?.length??'—';$('nfts').textContent=data.releases?.length??'—';
    $('offers').textContent=data.marketplace?.listings?.length??'—';$('orders').textContent=data.orders?.length??'—';
    $('live-status').textContent=!projection.verified?t('RPC-сверка не подтверждена'):data.pendingTransaction?t('Есть ожидающая транзакция'):data.active||data.queued?t('Студия выполняет операцию'):t('Сверено по canonical block · Base Sepolia');
    const selected=$('wallet-listing').value;listings=[...(data.marketplace?.listings||[]),...sellerListings];$('wallet-listing').replaceChildren();for(const l of listings){const o=node('option',t('listing',{title:localizeError(l.title),price:l.price,id:l.offerId,available:l.available?t('доступно'):t('недоступно')}));o.value=l.id;o.disabled=!l.available;$('wallet-listing').append(o);}if(listings.some(l=>l.id===selected))$('wallet-listing').value=selected;renderTerms();
    $('snapshot-time').textContent=new Date(data.exportedAt).toLocaleString(locale());
    $('verified-at').textContent=t('Снимок ответа студии: ')+new Date(data.exportedAt).toLocaleString(locale())+t('. Детали независимой RPC-сверки — в JSON.');
    $('contracts').replaceChildren();for(const [name,address] of [[t('NFT-паспорта'),data.manifest.nft],['Safe 3/5',data.manifest.safe],['Boson Protocol',data.manifest.sourceBoson]])if(address)$('contracts').append(link(name+' ↗ '+address,'https://sepolia.basescan.org/address/'+address));
}
$('refresh').onclick=refresh;void refresh();
function renderTerms(){const l=listings.find(l=>l.id===$('wallet-listing').value);$('wallet-terms').textContent=l?t('offerTerms',{description:localizeError(l.description||l.title),terms:l.terms||t('не указаны'),hash:l.assetSha256?'SHA-256: '+l.assetSha256:''}):t('Выберите тестовое предложение.');}
$('wallet-listing').onchange=renderTerms;
function renderFunding(filter=fundingFilter){$('funding-list').replaceChildren();for(const p of funding.filter(p=>filter==='all'||p.category===filter)){
  const translated=getLanguage()==='en'?p.en:p;const c=node('article',undefined,'funding-card');c.append(node('span',translated.type,'tag'),node('h3',p.name),node('p',translated.support,'support'),node('p',translated.fit),node('p',translated.status),link(t('Официальная программа ↗'),p.url));$('funding-list').append(c);}}
try{funding=await(await fetch('/funding.json')).json();renderFunding();}catch(e){$('funding-list').append(node('p',t('Реестр программ недоступен.')));}
for(const b of document.querySelectorAll('[data-filter]'))b.onclick=()=>{for(const x of document.querySelectorAll('[data-filter]'))x.classList.toggle('active',x===b);fundingFilter=b.dataset.filter;renderFunding();};

function setMarketButtons(enabled){enabled=enabled&&!!client?.isSessionValid();for(const id of ['wallet-approve','wallet-commit','wallet-sync','wallet-reconcile','wallet-retire'])$(id).disabled=!enabled||operation;}
function storageKey(account){if(!/^0x[\da-fA-F]{40}$/.test(account||''))throw new Error(t('Адрес запроса не определён'));return 'vidra-wallet-intent:'+account.toLowerCase();}
function saveIntent(value){const key=storageKey(value.account),raw=JSON.stringify(value);localStorage.setItem(key,raw);if(localStorage.getItem(key)!==raw)throw new Error(t('Не удалось сохранить запрос до подписи'));}
function readIntent(){const raw=localStorage.getItem(storageKey(walletState?.account));return raw?JSON.parse(raw):null;}
async function syncMarket(){
  if(!client?.isSessionValid())return;const proof=walletState.proof,account=walletState.account;try{const r=await fetch('/api/wallet/state',{headers:{'X-Vidra-Wallet':account}});const d=await r.json();if(!client?.isSessionValid()||walletState?.proof!==proof||walletState?.account!==account)return;if(!r.ok)throw new Error(d.error);
    if(d.account.toLowerCase()!==walletState.account.toLowerCase())throw new Error(t('Сессия другого кошелька'));marketState=d;window.dispatchEvent(new CustomEvent('vidra-market-state',{detail:d}));if(d.user?.account.toLowerCase()===account.toLowerCase()){userProfile=d.user;renderProfile();}
    const local=readIntent();let intents=d.intents;
    if(local&&!intents.some(i=>i.key===local.key)){
      const recovery=await fetch('/api/wallet/intent?key='+encodeURIComponent(local.key),{headers:{'X-Vidra-Wallet':account}}),value=await recovery.json();
      if(!client?.isSessionValid()||walletState?.proof!==proof||walletState?.account!==account)return;
      // A prepare request may have timed out before reaching the server. Missing
      // data is not authority to discard its durable key or broadcast again.
      if(!recovery.ok&&recovery.status!==404)throw new Error(value.error);
      if(recovery.ok)intents=[...intents,value.intent];
    }
    const recovered=mergeRecoveryIntent(local,intents,account);if(recovered)saveIntent(recovered);d.intents=intents;
    renderMarket(d);
  }catch(e){if(!client?.isSessionValid()||walletState?.proof!==proof||walletState?.account!==account)return;marketState=null;setMarketButtons(false);$('wallet-orders').replaceChildren();$('wallet-market-status').textContent=localizeError(e.message);}
}
function renderMarket(d){
    if(!client?.isSessionValid())return;
    $('wallet-market-status').textContent=t('market',{account:d.account,balance:formatWei('0x'+BigInt(d.balance).toString(16)),block:d.block});
    const pending=d.intents.find(i=>['PREPARED','SUBMITTED'].includes(i.status));if(pending)$('wallet-market-status').textContent+=t(' Есть незавершённый запрос: ')+pending.action+t('. Восстановите его, не повторяйте покупку.');
    setMarketButtons(true);$('wallet-orders').replaceChildren();
    for(const o of d.orders){const c=node('article');c.append(node('h3',t('order',{id:o.exchangeId,title:localizeError(o.title)})),node('p',`${o.state===4?t('orderCompleted'):t('orderChainState',{state:o.state})} · ${o.price} DEMO`),link(t('Commit в BaseScan ↗'),'https://sepolia.basescan.org/tx/'+o.commitTx));
      for(const [action,title,states]of [['redeem',t('Получить заказ'),[0]],['complete',t('Завершить'),[3]],['cancel',t('Отменить'),[0]],['dispute',t('Открыть спор'),[3]],['retract',t('Отозвать спор'),[5]]])if(states.includes(o.state)){const b=node('button',title,'button outline');b.onclick=()=>runMarket(()=>walletAction(action,null,o.exchangeId));c.append(b);}
      if(o.fulfillment&&o.deliveryWindow)c.append(node('p',t('fulfillmentDue',{days:o.fulfillment.days,date:new Date(o.deliveryWindow.dueAt).toLocaleString(locale())}),'caption'));
      if(o.state===0&&o.assetId){const b=node('button',t('instantDelivery'),'button');b.onclick=()=>runMarket(async()=>{await walletAction('redeem',null,o.exchangeId);await downloadWallet(o.exchangeId);});c.append(b);}
      if([3,4].includes(o.state)&&o.assetId){const b=node('button',t('Скачать проверенный файл'),'button outline');b.onclick=()=>runMarket(()=>downloadWallet(o.exchangeId));c.append(b);}$('wallet-orders').append(c);}
}
async function runMarket(fn){
  if(operation)return;operation=true;setMarketButtons(false);try{
    client?.requireSession();if(!walletState?.proof)throw new Error(t('walletSessionExpired'));
    if(!navigator.locks)throw new Error(t('Браузер без Web Locks: операции отключены'));
    await navigator.locks.request('vidra-wallet-'+walletState.account.toLowerCase(),{ifAvailable:true},async lock=>{if(!lock)throw new Error(t('Операция уже открыта в другой вкладке'));client.requireSession();$('wallet-market-status').textContent='';await fn();});
  }catch(e){$('wallet-market-status').textContent=e.code===4001?t('Операция отклонена в MetaMask.'):localizeError(e.message);}finally{const result=$('wallet-market-status').textContent;operation=false;await syncMarket();if(result&&client?.isSessionValid())$('wallet-market-status').textContent=result+' · '+$('wallet-market-status').textContent;}
}
async function walletAction(action,listingId,exchangeId,extra={}){
  if(!walletState?.proof||!client)throw new Error(t('Подтвердите сессию вашего адреса'));
  const old=readIntent();if(old&&['PREPARED','SUBMITTED'].includes(old.status))throw new Error(t('Сначала восстановите незавершённый запрос'));
  const key=crypto.randomUUID(),input={key,action,...extra,...(listingId?{listingId}:{}),...(exchangeId?{exchangeId}:{})};
  // A durable key exists before the HTTP request: an HTTP timeout must not generate a new purchase.
  saveIntent({key,account:walletState.account,status:'PREPARED',input,sendStarted:false});const i=await post('/api/wallet/prepare',input);await sendIntent({...i,input,sendStarted:false});
}
async function sendIntent(i){
  client.requireSession();saveIntent(i);
  if(i.status!=='PREPARED')throw new Error(t('Запрос истёк или уже отправлен'));
  const reviewed=await post('/api/wallet/review',{id:i.id});if(reviewed.id!==i.id||reviewed.key!==i.key||JSON.stringify(reviewed.tx)!==JSON.stringify(i.tx))throw new Error('Prepared wallet transaction changed during review');
  i={...reviewed,input:i.input,sendStarted:i.sendStarted};saveIntent(i);client.requireSession();if(Date.now()>=i.expires)throw new Error(t('Запрос истёк или уже отправлен'));
  $('wallet-market-status').textContent=t('confirm',{action:i.action,price:i.price,title:localizeError(i.title)});
  saveIntent({...i,sendStarted:true});
  try{const hash=await client.send(i.tx);i={...i,hash,status:'SUBMITTED',sendStarted:true};saveIntent(i);$('wallet-tx-hash').value=hash;
    const confirmed=await reconcileWithRetry(body=>post('/api/wallet/reconcile',body),{id:i.id,hash});saveIntent(confirmed);if(confirmed.action==='commit'&&confirmed.atomicReady&&confirmed.exchangeId)await downloadWallet(confirmed.exchangeId);
  }catch(e){if(e.code===4001){const cancelled=await post('/api/wallet/cancel',{id:i.id});saveIntent(cancelled);}throw e;}
}
async function downloadWallet(exchangeId){
  const proof=client.requireSession();const ensureSession=()=>{if(client.requireSession()!==proof)throw new Error(t('walletSessionExpired'));};
  const grant=await post('/api/wallet/delivery',{exchangeId});ensureSession();const r=await fetch('/api/wallet/file',{headers:{'X-Vidra-CSRF':csrf,'X-Wallet-Grant':grant.token,'X-Vidra-Wallet':walletState.account}});
  if(!r.ok)throw new Error((await r.json()).error);const bytes=await r.arrayBuffer();const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  ensureSession();if(digest!==grant.sha256)throw new Error('Downloaded SHA-256 differs');const href=URL.createObjectURL(new Blob([bytes],{type:r.headers.get('content-type')}));
  const a=link('','');a.href=href;a.download=r.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]||'VidRa-demo';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(href);
  $('wallet-market-status').textContent=t('Получен файл, SHA-256 проверен: ')+digest;
}
$('wallet-approve').onclick=()=>runMarket(()=>walletAction('approve',$('wallet-listing').value));
$('wallet-commit').onclick=()=>runMarket(()=>walletAction('commit',$('wallet-listing').value));
$('wallet-sync').onclick=syncMarket;
$('wallet-retire').onclick=()=>runMarket(async()=>{const i=readIntent();if(!i?.id)throw new Error(t('Нет сохранённого запроса'));saveIntent(await post('/api/wallet/retire-approval',{id:i.id}));$('wallet-tx-hash').value='';$('wallet-market-status').textContent=t('approvalRetired');});
$('wallet-reconcile').onclick=()=>runMarket(async()=>{let i=readIntent();if(!i)throw new Error(t('Нет сохранённого запроса'));if(!i.id)i={...await post('/api/wallet/prepare',i.input),input:i.input,sendStarted:i.sendStarted};const hash=$('wallet-tx-hash').value.trim()||i.hash;if(!hash){if(i.status==='PREPARED'&&i.sendStarted===false)return sendIntent(i);throw new Error(t('Введите хеш из MetaMask: повторная отправка неоднозначного запроса запрещена'));}saveIntent(await reconcileWithRetry(body=>post('/api/wallet/reconcile',body),{id:i.id,hash}));});

function changeLanguage(language){setLanguage(language);client?.isSessionValid();applyLanguage(document);renderDemoMedia();renderProviders();renderDocuments();if(walletState)updateWallet(walletState,true);if(evidenceError)renderEvidenceFailure();else if(evidenceBusy)$('live-status').textContent=t('Сверка с работающей студией…');else if(lastEvidence)renderEvidence(lastEvidence);else renderTerms();if(marketState)renderMarket(marketState);renderFunding();}

applyLanguage(document);

// Recheck synchronously after a suspended/background tab resumes; no automatic signing.
window.addEventListener('focus',()=>client?.isSessionValid());
document.addEventListener?.('visibilitychange',()=>client?.isSessionValid());

export function getWalletSnapshot(){return walletState?{account:walletState.account,proof:walletState.proof}:null;}
export function getMarketSnapshot(){return marketState;}
export async function runSellerCommand(action,extra={}){if(!['seller-create','seller-publish','seller-withdraw'].includes(action))throw new Error('Unknown seller command');await runMarket(()=>walletAction(action,null,null,extra));await refresh();}
export async function cancelSellerReservation(productId,key){await runMarket(async()=>{const result=await post('/api/wallet/cancel-reservation',{productId,key});const local=readIntent();if(local?.key===key)saveIntent({...local,status:'CANCELLED'});return result;});}

bindWalletWorkspace({getWalletSnapshot,getMarketSnapshot,runSellerCommand,cancelSellerReservation});
