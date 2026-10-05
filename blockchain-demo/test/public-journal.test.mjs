import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, keccak256 } from 'ethers';
import { broadcastJournaled } from '../src/public-journal.mjs';

const wallet=Wallet.createRandom();
const request={chainId:84532,nonce:0,to:wallet.address,data:'0x',value:0n,
  type:2,gasLimit:21000n,maxFeePerGas:100000000n,maxPriorityFeePerGas:1000000n};
const signer={address:wallet.address,populateTransaction:async r=>r,
  signTransaction:r=>wallet.signTransaction(r)};

test('ambiguous broadcast leaves a persisted hash and refuses a second send',async()=>{
  let pending,calls=0;
  const args={wallet:signer,request,label:'test',role:'operator',read:()=>pending,
    store:p=>{pending=p;},provider:{broadcastTransaction:async raw=>{
      calls++;assert.equal(pending.tx,keccak256(raw));throw new Error('RPC timeout');
    }}};
  await assert.rejects(()=>broadcastJournaled(args),/RPC timeout/);
  assert.equal(pending.chainId,84532);assert.equal(pending.nonce,0);
  assert.ok(!JSON.stringify(pending).includes('privateKey'));
  await assert.rejects(()=>broadcastJournaled(args),/Unreconciled/);
  assert.equal(calls,1);
});

test('journal refuses mainnet before signing or broadcasting',async()=>{
  let written=false,signed=false;
  await assert.rejects(()=>broadcastJournaled({wallet:{...signer,signTransaction:async()=>{signed=true;}},
    request:{...request,chainId:8453},label:'test',role:'operator',read:()=>null,
    store:()=>{written=true;},provider:{broadcastTransaction:async()=>assert.fail('broadcast')}}),/Base Sepolia/);
  assert.equal(written,false);assert.equal(signed,false);
});
test('a market request binding reaches durable storage before broadcast and a storage failure prevents sending',async()=>{
  const operation={key:'purchase-request-key-1234',digest:'0x'+'1'.repeat(64),action:'buy'};
  let pending,calls=0;
  const args={wallet:signer,request,label:'boson-commit',role:'buyer',operation,read:()=>null,store:record=>{pending=record;},
    provider:{broadcastTransaction:async raw=>{calls++;assert.deepEqual(pending.operation,operation);return {hash:keccak256(raw)};}}};
  await broadcastJournaled(args);assert.equal(calls,1);
  await assert.rejects(broadcastJournaled({...args,store:()=>{throw new Error('disk write unavailable');}}),/disk write/);
  assert.equal(calls,1);
  await assert.rejects(broadcastJournaled({...args,operation:{...operation,privateKey:'do-not-persist'}}),/operation binding/);
  assert.equal(calls,1);
});
