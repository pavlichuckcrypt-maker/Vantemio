let state,busy=false;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(t,error=false){$('toast').textContent=t;$('toast').className='toast visible'+(error?' error':'');}
document.querySelector('.contract-box').insertAdjacentHTML('beforeend','<p id="funding" class="fine"></p><button id="deploy" class="small" disabled>Deploy to public BSC Testnet</button>');
document.querySelector('.hero p').textContent='An accepted video version, certified by a public ERC-721 passport on BSC Testnet.';
document.querySelector('nav a[href="#commerce"]').textContent='BSC Testnet';
document.querySelector('nav a[href="#commerce"]').href='https://testnet.bscscan.com';
document.querySelector('.hero-actions a').href='#release';document.querySelector('.hero-actions a').textContent='Inspect public certificate →';
async function refresh(){const r=await fetch('/api/state');state=await r.json();if(!r.ok)throw new Error(state.error);render();}
function render(){
 const ready=state.deploymentReady,r=state.releases[0],m=state.manifest;
 $('nft-address').innerHTML=ready?`<a href="${m.explorer}/address/${m.nft}" target="_blank" rel="noreferrer">${esc(m.nft)} ↗</a>`:'Not deployed on public BSC yet';
 $('funding').textContent=`Operator: ${state.funding.address} · ${(Number(state.funding.tBNB)/1e18).toFixed(7)} tBNB`;
 $('deploy').hidden=ready;$('deploy').disabled=busy||Number(state.funding.tBNB)===0;
 $('mint').textContent=r?'Verify public passport ↗':'Issue public video passport ↗';
 $('release-status').textContent=r?'Confirmed on BSC Testnet':ready?'Ready to issue':'Awaiting tBNB / deployment';
 $('release-status').className='pill'+(r?' ok':'');
 $('nft-result').innerHTML=r?`<strong>Token #${esc(r.tokenId)} · Confirmed on BSC Testnet</strong><br>Owner ${esc(r.currentOwner||r.owner)}<br><a href="${m.explorer}/tx/${r.tx}" target="_blank" rel="noreferrer">Public transaction ↗</a><br><a href="${m.explorer}/token/${m.nft}?a=${r.tokenId}" target="_blank" rel="noreferrer">NFT in BscScan ↗</a>`:'No public NFT has been issued yet.';
 $('safe-info').textContent=ready?`Safe 3 of 5 · ${m.safe} · signers on this Mac`:'Safe 3 of 5 · deployment pending';
 $('pause-info').textContent=ready?(state.paused?'Issuance paused':'Issuance active'):'Public deployment pending';
 $('pause').textContent=state.paused?'Resume issuance':'Pause issuance';
 $('checks').innerHTML=state.checkDefinitions.map(d=>{const c=state.checks.find(x=>x.id===d.id);return `<div class="check ${c?(c.passed?'pass':'fail'):''}"><b>${c?(c.passed?'✓':'×'):d.number}</b><span>${esc(d.id==='chain'?'Public BSC Testnet 97':d.label)}</span></div>`;}).join('');
 const passed=state.checks.filter(x=>x.passed).length;$('checks-count').textContent=state.checks.length?`${passed} / 15 passed`:'Not run';
 $('checks-count').className='pill'+(passed===15?' ok':'');
 $('fork-info').textContent='Public BSC Testnet · chain 97 · 3 receipt confirmations';
 $('mint').disabled=busy||!ready||(state.paused&&!r);$('pause').disabled=busy||!ready;
}
async function action(name){if(busy||!state)return;busy=true;render();toast('Sending to public BSC Testnet; waiting for confirmations…');try{
 const r=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json','X-Demo-CSRF':state.csrf},body:JSON.stringify({action:name})});
 const v=await r.json();if(!r.ok)throw new Error(v.error);await refresh();toast(v.result.idempotent?'Existing public NFT verified; no duplicate issued.':'Public BSC transaction confirmed.');
 }catch(e){toast(e.message,true);await refresh().catch(()=>{});}finally{busy=false;render();}}
 $('mint').addEventListener('click',()=>action('mint'));$('deploy').addEventListener('click',()=>action('deploy'));
 $('pause').addEventListener('click',()=>action(state.paused?'unpause':'pause'));
try{await refresh();const r=await fetch('/api/passport');const p=await r.json();if(!r.ok)throw new Error(p.error);
 $('passport').innerHTML=`<div class="field"><label>ACCEPTED STUDIO RELEASE</label><strong>${esc(p.title)}</strong></div><div class="field"><label>RELEASE ID</label><code>${esc(p.releaseId)}</code></div><div class="field"><label>VIDEO SHA-256</label><code>${esc(p.videoSha256)}</code></div><div class="field"><label>RECIPIENT</label><code>${esc(p.recipient)}</code></div><p class="fine">The studio's after-render hook submits this accepted version automatically. Copyright remains governed by separate terms.</p>`;
}catch(e){toast(e.message,true);}
