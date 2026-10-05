// Non-preminted static offers used by this demo. Date boundaries are inclusive,
// matching Boson's commit checks; unknown fields cannot permit a payment.
export function offerAvailability(result,timestamp){
  if(result?.exists!==true)return {available:false,reason:'missing'};
  const {offer,offerDates}=result;
  if(!offer||typeof offer.voided!=='boolean'||typeof offer.quantityAvailable!=='bigint'
    ||!offerDates||typeof offerDates.validFrom!=='bigint'||typeof offerDates.validUntil!=='bigint'
    ||!Number.isSafeInteger(timestamp)||timestamp<=0||offerDates.validFrom<0n||offerDates.validUntil<=offerDates.validFrom)
    return {available:false,reason:'unverified'};
  if(offer.voided)return {available:false,reason:'voided'};
  if(offer.priceType!==0n||offer.creator!==0n||offer.buyerId!==0n)return {available:false,reason:'unsupported-offer'};
  if(offer.quantityAvailable<=0n)return {available:false,reason:'sold-out'};
  const time=BigInt(timestamp);
  if(time<offerDates.validFrom)return {available:false,reason:'not-started'};
  if(time>offerDates.validUntil)return {available:false,reason:'expired'};
  return {available:true,reason:null};
}
