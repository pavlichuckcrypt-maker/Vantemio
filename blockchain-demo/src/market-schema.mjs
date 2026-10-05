export const KINDS=['video','digital','service','physical'];
const shapes={render:['kind','title'],mint:['assetId'],list:['kind','title','description','price','quantity','assetId'],
  buy:['listingId'],redeem:['exchangeId'],complete:['exchangeId'],cancel:['exchangeId'],refund:['exchangeId'],
  dispute:['exchangeId'],retract:['exchangeId'],delivery:['exchangeId'],pauseMarket:['paused'],withdrawSeller:[]};
function text(v,min,max){return typeof v==='string'&&v.trim().length>=min&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);}
export function validateMarketAction(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||!Object.hasOwn(shapes,input.action))throw new Error('Unknown marketplace action');
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(input.idempotencyKey||''))throw new Error('Valid idempotency key required');
  const fields=shapes[input.action];
  if(Object.keys(input).some(k=>!['action','idempotencyKey',...fields].includes(k)))throw new Error('Unknown marketplace request fields');
  for(const f of fields.filter(f=>!(f==='assetId'&&input.action==='list')))if(!Object.hasOwn(input,f))throw new Error('Missing '+f);
  for(const f of ['assetId','listingId'])if(input[f]!==undefined&&!/^[a-z0-9-]{8,64}$/.test(input[f]))throw new Error('Invalid '+f);
  if(input.exchangeId!==undefined&&!/^[1-9][0-9]{0,18}$/.test(input.exchangeId))throw new Error('Invalid exchange ID');
  if(input.kind!==undefined&&!KINDS.includes(input.kind))throw new Error('Unsupported product category');
  if(input.action==='render'&&!['video','digital'].includes(input.kind))throw new Error('Studio produces video or digital assets');
  if(input.title!==undefined&&!text(input.title,3,80))throw new Error('Title must contain 3–80 characters');
  if(input.description!==undefined&&!text(input.description,5,500))throw new Error('Description must contain 5–500 characters');
  if(input.price!==undefined&&(typeof input.price!=='string'||!/^\d{1,4}(\.\d{1,2})?$/.test(input.price)||Number(input.price)<0.01||Number(input.price)>1000))throw new Error('Price must be 0.01–1000 DEMO');
  if(input.quantity!==undefined&&(!Number.isInteger(input.quantity)||input.quantity<1||input.quantity>100))throw new Error('Quantity must be 1–100');
  if(input.action==='pauseMarket'&&typeof input.paused!=='boolean')throw new Error('Pause must be a boolean');
  if(input.action==='list'&&['video','digital'].includes(input.kind)&&!input.assetId)throw new Error('Digital listings require a registered asset');
  if(input.action==='list'&&['service','physical'].includes(input.kind)&&input.assetId)throw new Error('Service/physical listing must not claim a digital file');
  return input;
}
