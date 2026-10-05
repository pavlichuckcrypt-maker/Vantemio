import test from 'node:test';import assert from 'node:assert/strict';
import {createWalletDiscovery} from './public/wallet-discovery.mjs';
const uuid=n=>`${n.toString(16).padStart(8,'0')}-1234-4123-8123-123456789abc`;
const provider=()=>({calls:[],async request(input){this.calls.push(input);}});
function fixture(){const target=new EventTarget(),changes=[],discovery=createWalletDiscovery(target,s=>changes.push(s));
  const announce=(p,id=uuid(1),name='MetaMask',rdns='io.metamask')=>{const event=new Event('eip6963:announceProvider');Object.defineProperty(event,'detail',{value:{provider:p,info:{uuid:id,name,rdns,icon:'data:image/svg+xml,<svg onload="bad()"/>'}}});target.dispatchEvent(event);};
  return{target,changes,discovery,announce};
}
test('standard discovery finds both wallets before the legacy fallback and never requests accounts or signatures',()=>{
  const f=fixture(),a=provider(),b=provider();f.target.ethereum=a;
  f.target.addEventListener('eip6963:requestProvider',()=>{f.announce(a);f.announce(b,uuid(2),'Other Wallet','com.other.wallet');});
  f.discovery.refresh();assert.deepEqual(f.discovery.list().entries.map(p=>p.provider),[a,b]);assert.equal(f.discovery.list().entries.some(p=>p.info.uuid==='legacy'),false);
  assert.deepEqual(a.calls,[]);assert.deepEqual(b.calls,[]);assert.ok(Object.isFrozen(f.discovery.list().entries[0].info));assert.equal(f.discovery.list().entries[0].info.icon,undefined);f.discovery.dispose();
});
test('late standard announcements replace duplicate legacy entries without creating duplicate choices',()=>{
  const f=fixture(),a=provider();f.target.ethereum=a;f.discovery.refresh();assert.equal(f.discovery.list().entries[0].info.uuid,'legacy');
  f.announce(a);f.announce(a);f.announce(a,uuid(2));assert.equal(f.discovery.list().entries.length,1);assert.equal(f.discovery.list().entries[0].info.uuid,uuid(1));assert.deepEqual(a.calls,[]);f.discovery.dispose();
});
test('a colliding UUID disables that choice and cannot replace it or revive it through legacy fallback',()=>{
  const f=fixture(),a=provider(),b=provider();f.announce(a);f.announce(b);f.target.ethereum=b;f.discovery.refresh();f.announce(a);
  assert.equal(f.discovery.list().entries.length,0);assert.equal(f.discovery.list().conflicts,1);assert.deepEqual(a.calls,[]);assert.deepEqual(b.calls,[]);f.discovery.dispose();
});
test('malformed announcements, metadata getters and a changed identity fail closed with bounded memory',()=>{
  const f=fixture(),a=provider();f.announce(a,'not-a-uuid');f.announce(a,uuid(1),'','io.metamask');f.announce(a,uuid(1),'x','javascript:bad');f.announce(a,uuid(1),'x\nspoof');f.announce({request:1});
  const event=new Event('eip6963:announceProvider');Object.defineProperty(event,'detail',{get(){throw Error('getter');}});assert.doesNotThrow(()=>f.target.dispatchEvent(event));assert.equal(f.discovery.list().entries.length,0);
  f.announce(a);f.announce(a,uuid(1),'Renamed');assert.equal(f.discovery.list().conflicts,1);
  for(let n=2;n<=100;n++)f.announce(provider(),uuid(n));assert.equal(f.discovery.list().entries.length+f.discovery.list().conflicts,16);f.discovery.dispose();
});
test('disposal removes event listeners and stops discovery without altering any wallet',()=>{
  const f=fixture(),a=provider();f.announce(a);const before=f.changes.length;f.discovery.dispose();f.announce(provider(),uuid(2));f.discovery.refresh();assert.equal(f.changes.length,before);assert.equal(f.discovery.list().entries.length,0);assert.deepEqual(a.calls,[]);
});
