let state, busy=false;
const $=id=>document.getElementById(id);
const escape=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=address=>address?address.slice(0,8)+'…'+address.slice(-6):'—';
function toast(message,error=false){$('toast').textContent=message;$('toast').className='toast visible'+(error?' error':'');setTimeout(()=>$('toast').classList.remove('visible'),6000);}
async function refresh(){const response=await fetch('/api/state');state=await response.json();if(!response.ok)throw new Error(state.error);render();}
function render(){
 $('nft-address').textContent=state.manifest.nft||'Deployment pending';
 if($('deploy'))$('deploy').hidden=state.deploymentReady;
 $('buyer-balance').textContent=Number(state.commerce.buyerBalance).toLocaleString()+' DEMO';
 $('seller-balance').textContent=Number(state.commerce.sellerAvailable).toLocaleString()+' DEMO';
 $('fork-info').textContent=state.publicTransactions?'Public Base Sepolia · chain 84532':`Base Sepolia block ${state.manifest.forkBlock?.toLocaleString()} · local chain 31337`;
 $('safe-info').textContent=state.deploymentReady?`Safe 3 of 5 · ${short(state.manifest.safe)} · demo custody`:'Safe 3 of 5 · deployment pending';
 $('pause-info').textContent=!state.deploymentReady?'Contracts not deployed':state.paused?'Issuance paused':'Issuance active';
 $('pause').textContent=state.paused?'Resume issuance':'Pause issuance';
 const release=state.releases[0];
 $('release-status').textContent=!state.deploymentReady?'Awaiting test ETH and deployment':release?(state.publicTransactions?'Verified on Base Sepolia':'Verified on local chain'):state.paused?'Issuance paused':'Ready to issue';
 $('release-status').className='pill'+(release?' ok':'');
 $('mint').textContent=release?'Verify existing passport ↗':'Issue video passport ↗';
 $('nft-result').innerHTML=release?`<strong>Token #${escape(release.tokenId)} · Confirmed</strong><br>Owner ${escape(release.owner)}<br><code>Tx ${escape(release.tx||'Recovered from chain')}</code>${release.explorer?`<br><a href="${escape(release.explorer)}" target="_blank" rel="noopener">View on BaseScan ↗</a>`:''}`:'';
 const defs=state.checkDefinitions;
 $('checks').innerHTML=defs.map(d=>{const check=state.checks.find(c=>c.id===d.id);return `<div class="check ${check?(check.passed?'pass':'fail'):''}"><b>${check?(check.passed?'✓':'×'):d.number}</b><span>${escape(d.label)}</span></div>`;}).join('');
 const passed=state.checks.filter(c=>c.passed).length;
 $('checks-count').textContent=state.checks.length?`${passed} / 15 passed`:'Not run';
 $('checks-count').className='pill'+(passed===15?' ok':'');
 const actions={COMMITTED:[['redeem','Redeem voucher'],['cancel','Cancel order']],CANCELLED:[['refund','Withdraw refund']],REDEEMED:[['complete','Confirm completion'],['dispute','Raise dispute']],DISPUTED:[['retract','Retract dispute']]};
 $('orders').innerHTML=!state.deploymentReady?'<div class="empty">Public Boson setup awaits test ETH and deployment.</div>':state.orders.length?state.orders.map(o=>`<div class="order"><div class="order-top"><strong>Order #${escape(o.exchangeId)}</strong><span class="pill ${o.state==='COMPLETED'?'ok':''}">${escape(o.disputeRetracted?'DISPUTE RETRACTED':o.refundWithdrawn?'REFUND WITHDRAWN':o.state)}</span></div><div class="tx">Offer #${escape(o.offerId)} · 25 DEMO · ${escape(o.txs.at(-1).tx)}${state.publicTransactions?` · <a href="${escape(state.manifest.explorer+'/tx/'+o.txs.at(-1).tx)}" target="_blank" rel="noopener">View on BaseScan ↗</a>`:''}</div><div class="order-actions">${(o.refundWithdrawn||o.disputeRetracted?[]:actions[o.state]||[]).map(([action,label])=>`<button class="small ${action==='dispute'?'warn':''}" data-action="${action}" data-order="${escape(o.exchangeId)}">${label}</button>`).join('')}</div></div>`).join(''):'<div class="empty">No orders yet. Create one to see escrow, redemption and completion.</div>';
 document.querySelectorAll('button').forEach(b=>b.disabled=busy);
 if((state.paused&&!release)||!state.deploymentReady)$('mint').disabled=true;
 if(!state.deploymentReady){$('pause').disabled=true;$('commit').disabled=true;}
}
async function action(name,exchangeId){if(busy)return;busy=true;render();toast(state.publicTransactions?'Submitting to Base Sepolia…':'Executing on the local chain…');try{
 const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json','X-Demo-CSRF':state.csrf},body:JSON.stringify({action:name,...(exchangeId?{exchangeId}:{})})});
 const result=await response.json();if(!response.ok)throw new Error(result.error);
 toast(result.result.idempotent?'Existing NFT verified. No duplicate was issued.':`${name==='mint'?'Video passport':name} confirmed ${state.publicTransactions?'on Base Sepolia':'on the local chain'}.`);
 await refresh();
 }catch(error){toast(error.message,true);await refresh().catch(()=>{});}finally{busy=false;render();}}
if($('deploy'))$('deploy').addEventListener('click',()=>action('deploy'));
$('mint').addEventListener('click',()=>action('mint'));
$('commit').addEventListener('click',()=>action('commit'));
$('pause').addEventListener('click',()=>action(state.paused?'unpause':'pause'));
$('orders').addEventListener('click',event=>{const b=event.target.closest('button[data-action]');if(b)action(b.dataset.action,b.dataset.order);});
try{await refresh();const response=await fetch('/api/passport');const p=await response.json();if(!response.ok)throw new Error(p.error);
 $('passport').innerHTML=`<div class="field"><label>ACCEPTED VERSION</label><strong>${escape(p.title)}</strong></div><div class="field"><label>RELEASE ID</label><code>${escape(p.releaseId)}</code></div><div class="field"><label>VIDEO SHA-256</label><code>${escape(p.videoSha256)}</code></div><div class="field"><label>REGISTERED RECIPIENT</label><code>${escape(p.recipient)}</code></div><div class="field"><label>STUDIO INTEGRATION</label><span>Final-file receipt + fresh editorial evidence verified</span></div>`;
}catch(error){toast(error.message,true);$('passport').textContent='Demo backend unavailable: '+error.message;}
