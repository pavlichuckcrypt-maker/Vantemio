import test from 'node:test';
import assert from 'node:assert/strict';
import {offerAvailability} from '../src/offer-availability.mjs';
test('sale availability respects Boson inclusive dates and stock while refusing malformed reads',()=>{
  const result={exists:true,offer:{voided:false,quantityAvailable:1n,priceType:0n,creator:0n,buyerId:0n},offerDates:{validFrom:100n,validUntil:200n}};
  for(const time of [100,150,200])assert.equal(offerAvailability(result,time).available,true);
  assert.equal(offerAvailability(result,99).reason,'not-started');assert.equal(offerAvailability(result,201).reason,'expired');
  for(const invalid of [null,{...result,exists:false},{...result,offer:{...result.offer,quantityAvailable:0n}},{...result,offer:{...result.offer,voided:true}},
    {...result,offerDates:{validFrom:200n,validUntil:100n}},{...result,offer:{quantityAvailable:'1',voided:false}}])assert.equal(offerAvailability(invalid,150).available,false);
  for(const time of [NaN,-1,0,1.5,'150'])assert.equal(offerAvailability(result,time).available,false);
});
