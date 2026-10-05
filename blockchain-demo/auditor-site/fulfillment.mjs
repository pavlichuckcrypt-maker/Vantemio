import {ServiceError} from './user-database.mjs';
export const FULFILLMENT_KINDS=Object.freeze(['digital_instant','physical','service','custom_digital']);
// A promise of delivery is never evidence of delivery or permission to release escrow.
export function fulfillmentPolicy(input){
  if(!input||Object.keys(input).sort().join(',')!=='days,kind'||!FULFILLMENT_KINDS.includes(input.kind)
    ||!Number.isInteger(input.days)||input.days<0||input.days>365
    ||(input.kind==='digital_instant'?input.days!==0:input.days<1))throw new ServiceError('Invalid fulfillment policy',400);
  return Object.freeze({kind:input.kind,days:input.days});
}
export function deliveryWindow(policy,confirmedAt){
  const p=fulfillmentPolicy(policy);
  if(!Number.isSafeInteger(confirmedAt)||confirmedAt<0)throw new ServiceError('Invalid confirmed purchase time',400);
  return {kind:p.kind,dueAt:confirmedAt+p.days*86400000,instant:p.kind==='digital_instant',
    payment:'boson-escrow',sellerSettlement:'boson-finalized-exchange',deliveryEvidenceRequired:true};
}
export function sellerProduct(input){
  if(!input||Object.keys(input).sort().join(',')!=='description,fulfillment,price,quantity,title')throw new ServiceError('Invalid product fields',400);
  for(const [key,max] of [['title',120],['description',1200]])if(typeof input[key]!=='string'||!input[key].trim()||[...input[key]].length>max||/[\p{Cc}\p{Cf}]/u.test(input[key]))throw new ServiceError('Invalid product text',400);
  if(typeof input.price!=='string'||!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(input.price)||Number(input.price)<=0||!Number.isInteger(input.quantity)||input.quantity<1||input.quantity>100000)throw new ServiceError('Invalid product price or quantity',400);
  return {title:input.title.trim(),description:input.description.trim(),price:input.price,quantity:input.quantity,fulfillment:fulfillmentPolicy(input.fulfillment)};
}
