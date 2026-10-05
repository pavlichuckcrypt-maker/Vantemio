import test from 'node:test';import assert from 'node:assert/strict';
test('actual seller UI saves edited fields, creates private drafts and discards responses after wallet switch',async()=>{
 const keys=['document','window','MutationObserver','fetch'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 class Element{constructor(){this.value='';this.children=[];this.disabled=false;this.checked=false;this.dataset={};this.attributes={};this._text='';}get textContent(){return this._text+this.children.map(c=>c.textContent||'').join('');}set textContent(value){this._text=value;this.children=[];}get options(){return this.children;}setAttribute(k,v){this.attributes[k]=v;}replaceChildren(...items){this.children=items;}append(...items){this.children.push(...items);}}
 const ids=new Map(),events=new Map(),account='0x'+'12'.repeat(20);let current={id:'owner-a',wallet:account,displayName:'Old name',locale:'ru',roles:{buyer:true,seller:false},revision:0},products=[],delay=false,release;
 const requests=[];globalThis.document={documentElement:{lang:'ru'},getElementById(id){if(!ids.has(id))ids.set(id,new Element());return ids.get(id);},createElement(){return new Element();},querySelectorAll(){return [];}};
 globalThis.window={addEventListener:(name,fn)=>events.set(name,fn)};globalThis.MutationObserver=class{observe(){}};
 globalThis.fetch=async(url,opts={})=>{const b=opts.body?JSON.parse(opts.body):null;requests.push({url,opts,body:b});let value,status=200;
  if(url==='/api/site')value={csrf:'demo-csrf'};
  else if(url.endsWith('/config'))value={google:{enabled:false,clientId:null}};
  else if(opts.headers['X-Vidra-Account-Mode']!=='wallet'){status=401;value={error:'Account sign-in required'};}
  else if(url.endsWith('/profile')&&b){current={...current,displayName:b.displayName,locale:b.locale,roles:{buyer:true,seller:b.seller},revision:current.revision+1};value={member:current};}
  else if(url.endsWith('/profile'))value={member:current};
  else if(url.endsWith('/products')&&b){products.push({id:b.id,status:'DRAFT',revision:1,...b.product});value={product:products.at(-1)};}
  else if(url.endsWith('/assets'))value={assets:[]};
  else if(url.endsWith('/products')){if(delay)await new Promise(r=>release=r);value={products};}
  return {ok:status===200,status,json:async()=>value};
 };
 try{await import('./public/account.mjs?ui-account-test');assert.equal(ids.get('account-google').disabled,true);
  events.get('vidra-wallet-session')({detail:{account,proof:{account}}});await ids.get('account-wallet').onclick();
  ids.get('account-name').value='<script>seller</script>';ids.get('account-seller').checked=true;ids.get('account-locale').value='en';await ids.get('account-save').onclick();
  const save=requests.find(r=>r.url.endsWith('/profile')&&r.body);assert.equal(save.body.displayName,'<script>seller</script>');assert.equal(save.body.seller,true);assert.equal(ids.get('product-form').hidden,false);
  for(const [id,value]of Object.entries({'product-title':'Private video','product-description':'Test access','product-price':'25','product-quantity':'1','product-kind':'digital_instant','product-days':'0'}))document.getElementById(id).value=value;
  ids.get('product-form').onsubmit({preventDefault(){}});await new Promise(r=>setTimeout(r,10));
  assert.equal(products.length,1);assert.equal(products[0].status,'DRAFT');assert.ok(ids.get('seller-products').children[0].textContent.includes('Private video'));
  delay=true;const pending=ids.get('account-wallet').onclick();await new Promise(setImmediate);events.get('vidra-wallet-session')({detail:{account:'0x'+'34'.repeat(20),proof:null}});release();await pending;
  assert.equal(ids.get('account-panel').hidden,true);assert.equal(ids.get('seller-products').children.length,0);assert.equal(ids.get('account-name').value,'');
  assert.equal(requests.some(r=>r.url.includes('prepare')||r.url.includes('reconcile')),false,'profile UI never signs or broadcasts');
 }finally{for(const [key,value]of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});
