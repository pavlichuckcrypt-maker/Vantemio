import {runSellerCommand,cancelSellerReservation,getWalletSnapshot,getMarketSnapshot} from './wallet-workspace.mjs';
import {t,getLanguage,localizeError} from './i18n.mjs';
const $=id=>document.getElementById(id),base='/api/wallet/account/';
let csrf,config,mode=null,member=null,wallet=null,epoch=0,drafts=[],assets=[],chain=null,busy=false,googleLoading=null,expiryTimer=null;
function clear(){clearTimeout(expiryTimer);expiryTimer=null;epoch++;member=null;drafts=[];assets=[];chain=null;$('account-panel').hidden=true;$('seller-products').replaceChildren();$('account-name').value='';render();}
function authHeaders(){return {'X-Vidra-Account-Mode':mode,...(mode==='wallet'||wallet?.proof?{'X-Vidra-Wallet':wallet?.account}:{})};}
async function request(route,body){const r=await fetch(base+route,{headers:{...authHeaders(),...(body?{'Content-Type':'application/json','X-Vidra-CSRF':csrf}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const v=await r.json();if(!r.ok)throw new Error(v.error);return v;}
function status(text){$('account-status').textContent=text;}
function render(){
  if(member?.sessionExpires&&Date.now()>=member.sessionExpires){clear();return;}
  clearTimeout(expiryTimer);if(member?.sessionExpires)expiryTimer=setTimeout(()=>clear(),Math.min(600000,Math.max(1,member.sessionExpires-Date.now())));
  $('account-panel').hidden=!member;$('account-link-google').disabled=!config?.google.enabled||!wallet?.proof||busy;
  $('account-link-wallet').disabled=mode!=='google'||!member||!wallet?.proof||busy;
  $('account-logout').disabled=mode!=='google'||!member||busy;
  $('account-google').disabled=!config?.google.enabled||busy;
  $('google-status').textContent=config&&!config.google.enabled?t('googleUnconfigured'):'';
  if(!member){status(t('accountSignIn'));return;}
  $('account-name').value=member.displayName;$('account-locale').value=member.locale;$('account-seller').checked=member.roles.seller;$('product-form').hidden=!member.roles.seller;
  status(t('accountSession',{mode:mode==='wallet'?'Wallet':'Google',id:member.id}));
  $('seller-products').replaceChildren();
  for(const p of drafts){const card=document.createElement('article'),title=document.createElement('h3'),summary=document.createElement('p');title.textContent=p.title;
    summary.textContent=`${t({DRAFT:'accountDraft',RESERVED:'sellerReserved',PUBLISHED:'sellerPublished'}[p.status])} · ${p.price} DEMO · ${t({digital_instant:'productInstant',physical:'productPhysical',service:'productService',custom_digital:'productCustom'}[p.fulfillment.kind])} · ${p.fulfillment.days} ${getLanguage()==='ru'?'дн.':'days'}`;card.append(title,summary);
    if(p.publicationTx){const link=document.createElement('a');link.textContent='Boson offer #'+p.offerId+' ↗';link.href='https://sepolia.basescan.org/tx/'+p.publicationTx;link.target='_blank';link.rel='noreferrer';card.append(link);}
    const attached=assets.find(a=>a.id===p.assetId);if(attached){const proof=document.createElement('p');proof.className='caption';proof.textContent=attached.filename+' · SHA-256 '+attached.sha256;card.append(proof);}
    if(p.status==='DRAFT'){
      if(['digital_instant','custom_digital'].includes(p.fulfillment.kind)){
        const select=document.createElement('select');select.setAttribute('aria-label',t('sellerChooseFile'));for(const asset of assets.filter(a=>a.ready)){const option=document.createElement('option');option.value=asset.id;option.textContent=asset.filename+' · '+asset.bytes+' bytes';select.append(option);}select.value=p.assetId||select.options[0]?.value||'';
        const attach=button('sellerAttach',()=>guarded(async()=>{const ticket=epoch;await request('attach-asset',{productId:p.id,revision:p.revision,assetId:select.value});if(ticket===epoch)await load();}));attach.disabled=!select.value||busy;card.append(select,attach);
      }
      const publish=button('sellerPublish',()=>guarded(async()=>{const ticket=epoch;await runSellerCommand('seller-publish',{productId:p.id,revision:p.revision});if(ticket===epoch)await load();}));publish.dataset.sellerPublish='true';publish.dataset.assetReady=String(p.fulfillment.kind!=='digital_instant'||!!attached?.ready);publish.disabled=busy||mode!=='wallet'||!wallet?.proof||!chain?.seller?.owned||p.fulfillment.kind==='digital_instant'&&!attached?.ready;card.append(publish);
    }else if(p.status==='RESERVED'){
      const recovery=document.createElement('a');recovery.href='#wallet-commerce';recovery.textContent=t('sellerRecover');card.append(recovery);
      const cancel=button('sellerCancelReservation',()=>guarded(async()=>{const ticket=epoch;await cancelSellerReservation(p.id,p.reservationKey);if(ticket===epoch)await load();}));cancel.disabled=busy||mode!=='wallet'||!wallet?.proof;card.append(cancel);
    }
    $('seller-products').append(card);
  }
  renderSeller();
}
async function guarded(fn){if(busy)return;busy=true;$('account-save').disabled=true;renderButtons();try{await fn();}catch(e){status(localizeError(e.message));if(/sign-in required|signature required|session account changed/i.test(e.message)){clear();status(localizeError(e.message));}}finally{busy=false;$('account-save').disabled=false;renderButtons();}}
function button(key,fn){const b=document.createElement('button');b.type='button';b.className='button outline';b.textContent=t(key);b.onclick=fn;return b;}
function renderSeller(){
 const seller=chain?.seller; $('seller-chain-panel').hidden=!member?.roles.seller&&!seller?.registered;
 $('seller-chain-status').textContent=!wallet?.proof?t('accountNeedWallet'):!seller?t('sellerSyncNeeded'):seller.owned?t('sellerRegistered',{id:seller.sellerId,balance:(BigInt(seller.availableDemo)/10n**16n).toString().replace(/(\d{2})$/,'.$1')}):seller.registered?t('sellerForeignRoles'):t('sellerUnregistered');
 $('seller-register').disabled=busy||mode!=='wallet'||!member?.roles.seller||!wallet?.proof||!seller||seller.registered;
 $('seller-withdraw').disabled=busy||mode!=='wallet'||!wallet?.proof||!seller?.owned||BigInt(seller.availableDemo)<=0n;
 $('seller-upload-button').disabled=busy||!member?.roles.seller;
 for(const b of document.querySelectorAll('[data-seller-publish]'))b.disabled=busy||mode!=='wallet'||!wallet?.proof||!seller?.owned||b.dataset.assetReady!=='true';
}
function renderButtons(){
  $('account-google').disabled=!config?.google.enabled||busy;$('account-link-google').disabled=!config?.google.enabled||!wallet?.proof||busy;
  $('account-link-wallet').disabled=mode!=='google'||!member||!wallet?.proof||busy;$('account-logout').disabled=mode!=='google'||!member||busy;renderSeller();
}
async function load(){const ticket=epoch,v=await request('profile');if(ticket!==epoch)return;const p=await request('products'),a=await request('assets');if(ticket!==epoch)return;member=v.member;drafts=p.products;assets=a.assets;chain=getMarketSnapshot();render();}
window.addEventListener('vidra-wallet-session',e=>{const previous=wallet;wallet=e.detail;
  if(previous?.account!==wallet.account||previous?.proof!==wallet.proof){$('google-button').replaceChildren();if(mode==='wallet')clear();else epoch++;}
  if(previous?.account!==wallet.account||!wallet.proof)chain=null;renderButtons();
});
window.addEventListener('vidra-market-state',e=>{if(wallet?.proof&&e.detail.account.toLowerCase()===wallet.account?.toLowerCase()){chain=e.detail;renderSeller();}});
$('account-wallet').onclick=()=>guarded(async()=>{if(!wallet?.proof)throw new Error(t('accountNeedWallet'));clear();mode='wallet';await load();});
$('account-save').onclick=()=>guarded(async()=>{if(!member)return;const ticket=epoch,v=await request('profile',{displayName:$('account-name').value,locale:$('account-locale').value,seller:$('account-seller').checked,revision:member.revision});if(ticket!==epoch)return;member={...v.member,sessionExpires:member?.sessionExpires};render();status(t('accountSaved'));});
$('product-kind').onchange=()=>{const instant=$('product-kind').value==='digital_instant';$('product-days').value=instant?'0':'3';$('product-days').min=instant?'0':'1';$('product-days').disabled=instant;};$('product-kind').onchange();
$('product-form').onsubmit=e=>{e.preventDefault();void guarded(async()=>{if(!member?.roles.seller)return;const ticket=epoch;
  const product={title:$('product-title').value,description:$('product-description').value,price:$('product-price').value,quantity:Number($('product-quantity').value),fulfillment:{kind:$('product-kind').value,days:Number($('product-days').value)}};
  await request('products',{id:crypto.randomUUID(),revision:0,product});if(ticket!==epoch)return;await load();if(ticket===epoch)status(t('productSaved'));});};
function loadGoogle(){if(window.google?.accounts?.id)return Promise.resolve();if(googleLoading)return googleLoading;
  googleLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.referrerPolicy='no-referrer-when-downgrade';script.onload=resolve;script.onerror=()=>{script.remove();googleLoading=null;reject(new Error(t('accountOAuthFailed')));};document.head.append(script);});return googleLoading;}
async function beginGoogle(link){
  if(!config?.google.enabled)return;const ticket=++epoch;
  const flow=await request('google/challenge',{mode:link?'link':'login'});await loadGoogle();if(ticket!==epoch)return;
  window.google.accounts.id.initialize({client_id:config.google.clientId,nonce:flow.nonce,auto_select:false,callback:credential=>{void guarded(async()=>{
    if(ticket!==epoch)return;const v=await request('google/verify',{nonce:flow.nonce,credential:credential.credential});if(ticket!==epoch)return;
    clear();mode='google';member=v.member;await load();$('google-button').replaceChildren();
  });}});
  $('google-button').replaceChildren();window.google.accounts.id.renderButton($('google-button'),{type:'standard',theme:'outline',size:'large',text:link?'continue_with':'signin_with',locale:getLanguage()});
}
$('account-google').onclick=()=>guarded(()=>beginGoogle(false));$('account-link-google').onclick=()=>guarded(()=>beginGoogle(true));
$('account-link-wallet').onclick=()=>guarded(async()=>{const ticket=epoch,v=await request('link-wallet',{});if(ticket!==epoch)return;member={...v.member,sessionExpires:member?.sessionExpires};render();});
$('account-logout').onclick=()=>guarded(async()=>{await request('logout',{});mode=null;clear();});
new MutationObserver(()=>render()).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
try{const site=await(await fetch('/api/site')).json();csrf=site.csrf;config=await request('config');mode='google';try{await load();}catch{mode=null;clear();}render();}catch(e){status(localizeError(e.message));}

$('seller-register').onclick=()=>guarded(async()=>{const ticket=epoch;await runSellerCommand('seller-create');if(ticket===epoch)await load();});
$('seller-withdraw').onclick=()=>guarded(async()=>{const ticket=epoch;await runSellerCommand('seller-withdraw');if(ticket===epoch)await load();});
$('seller-upload-button').onclick=()=>guarded(async()=>{const file=$('seller-upload').files[0];if(!file||!file.size||file.size>config.assetLimitBytes)throw new Error(t('sellerFileLimit'));const ticket=epoch;
 const filename=file.name.replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,100)||'resource.bin',mime=['video/mp4','image/png','image/jpeg','application/pdf','application/zip','text/plain'].includes(file.type)?file.type:'application/octet-stream';
 const r=await fetch(base+'assets/upload',{method:'POST',headers:{...authHeaders(),'X-Vidra-CSRF':csrf,'X-Vidra-Filename':filename,'Content-Type':mime},body:file});const v=await r.json();if(!r.ok)throw new Error(v.error);if(ticket!==epoch)return;await load();$('seller-upload-status').textContent=t('sellerUploaded',{name:v.asset.filename,hash:v.asset.sha256});});
wallet=getWalletSnapshot();chain=getMarketSnapshot();renderButtons();
