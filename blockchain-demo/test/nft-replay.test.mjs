import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {mintRelease,metadataFor,sha} from '../src/releases.mjs';
import {hash} from '../src/chain.mjs';
import {verifyAssetPublication} from '../src/asset-publication.mjs';

function fixture(){
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'aim-nft-replay-'));
  fs.mkdirSync(path.join(project,'plan'));fs.writeFileSync(path.join(project,'video.mp4'),'accepted test fixture bytes');
  const script='## 01 — Demo\n\nVerified demo script.\n';
  fs.writeFileSync(path.join(project,'plan/GUION_ES.md'),script);
  fs.writeFileSync(path.join(project,'plan/EDITORIAL_STATUS.json'),JSON.stringify({chapters:{1:{editorial_status:'accepted',audited_chapter_sha256:sha(script.trimEnd())}}}));
  const owner='0x'+'1'.repeat(40),currentOwner='0x'+'2'.repeat(40);
  const receipt={schemaVersion:1,releaseId:'nft-replay-fixture',accepted:true,reviewer:'test only',videoPath:'video.mp4',
    videoSha256:sha('accepted test fixture bytes'),recipient:owner,title:'Accepted title',terms:'Accepted test terms',demoFixture:true};
  const meta=metadataFor(receipt);
  const record={releaseId:receipt.releaseId,tokenId:'4',owner,videoSha256:receipt.videoSha256,metadataHash:meta.metadataHash,termsHash:meta.termsHash,chainId:84532,status:'confirmed'};
  const state={releases:[record]};let chainChecks=0,ownerReads=0;
  const ctx={manifest:{chainId:84532},assertAuthority:async()=>({}),assertChain:async()=>{chainChecks++;return true;},nft:{
    tokenByRelease:async id=>{assert.equal(id,hash(receipt.releaseId));return 4n;},
    passports:async()=>({releaseId:hash(receipt.releaseId),videoHash:'0x'+receipt.videoSha256,metadataHash:meta.metadataHash,termsHash:meta.termsHash}),
    ownerOf:async()=>{ownerReads++;return currentOwner;}
  }};
  const write=()=>fs.writeFileSync(path.join(project,'final_acceptance.json'),JSON.stringify(receipt));write();
  return {project,receipt,record,state,ctx,currentOwner,write,counts:()=>({chainChecks,ownerReads}),cleanup:()=>fs.rmSync(project,{recursive:true,force:true})};
}
test('an existing NFT repeat checks the accepted metadata and terms even when video bytes have not changed',async()=>{
  for(const field of ['title','terms','kind']){
    const f=fixture();try{
      if(field!=='kind'){f.receipt[field]='changed after publication';f.write();}
      const before=JSON.stringify(f.state);
      await assert.rejects(mintRelease(f.ctx,f.state,{project:f.project,kind:field==='kind'?'digital':'video'}),/different metadata or terms/);
      assert.equal(JSON.stringify(f.state),before);assert.equal(f.counts().ownerReads,0);
    }finally{f.cleanup();}
  }
});
test('a valid NFT repeat reads current ownership; a substituted cached token, owner or chain cannot be confirmed',async()=>{
  const f=fixture();try{
    const before=JSON.stringify(f.state),result=await mintRelease(f.ctx,f.state,{project:f.project});
    assert.equal(result.idempotent,true);assert.equal(result.currentOwner,f.currentOwner);assert.equal(result.owner,f.record.owner);
    assert.equal(JSON.stringify(f.state),before);assert.deepEqual(f.counts(),{chainChecks:1,ownerReads:1});
  }finally{f.cleanup();}
  for(const [field,value] of [['tokenId','99'],['owner','0x'+'3'.repeat(40)],['chainId',31337],['videoSha256','0'.repeat(64)]]){
    const f=fixture();try{
      f.record[field]=value;const before=JSON.stringify(f.state);
      await assert.rejects(mintRelease(f.ctx,f.state,{project:f.project}),/Stored NFT record differs/);
      assert.equal(JSON.stringify(f.state),before);assert.equal(f.counts().ownerReads,0);
    }finally{f.cleanup();}
  }
});
test('the original video metadata schema remains replayable while changed title, terms and content kind are refused',async()=>{
  const f=fixture();try{
    const legacy=metadataFor(f.receipt).metadata;delete legacy.properties.content_kind;
    f.record.metadataHash='0x'+sha(JSON.stringify(legacy));
    f.ctx.nft.passports=async()=>({releaseId:hash(f.receipt.releaseId),videoHash:'0x'+f.record.videoSha256,metadataHash:f.record.metadataHash,termsHash:f.record.termsHash});
    assert.equal((await mintRelease(f.ctx,f.state,{project:f.project})).idempotent,true);
    await assert.rejects(mintRelease(f.ctx,f.state,{project:f.project,kind:'digital'}),/different metadata or terms/);
    for(const field of ['title','terms']){const original=f.receipt[field];f.receipt[field]='changed legacy passport';f.write();
      await assert.rejects(mintRelease(f.ctx,f.state,{project:f.project}),/different metadata or terms/);
      f.receipt[field]=original;f.write();}
  }finally{f.cleanup();}
});
test('both video and digital listings require fresh accepted content before offer creation',async()=>{
  for(const kind of ['video','digital'])for(const failure of ['unaccepted','fingerprint','title']){
    const f=fixture();try{
      const asset={kind,project:f.project,releaseId:f.receipt.releaseId,title:f.receipt.title,sha256:f.receipt.videoSha256,certificate:null};
      if(failure==='unaccepted'){f.receipt.accepted=false;f.write();}
      if(failure==='fingerprint')asset.sha256='0'.repeat(64);
      if(failure==='title')asset.title='Stale displayed title';
      await assert.rejects(verifyAssetPublication(f.ctx,asset));assert.equal(f.counts().ownerReads,0);
    }finally{f.cleanup();}
  }
});
test('listing checks an existing NFT and reads ownership without minting or changing the stored certificate',async()=>{
  const f=fixture();try{
    f.ctx.manifest.nft='0x'+'3'.repeat(40);f.ctx.transact=()=>assert.fail('listing validation cannot mint');
    const certificate={chainId:84532,contract:f.ctx.manifest.nft,tokenId:'4',owner:f.record.owner};
    const asset={kind:'video',project:f.project,releaseId:f.receipt.releaseId,title:f.receipt.title,sha256:f.receipt.videoSha256,certificate};
    const before=JSON.stringify(asset),result=await verifyAssetPublication(f.ctx,asset);
    assert.equal(result.certificate.owner.toLowerCase(),f.currentOwner.toLowerCase());
    assert.equal(JSON.stringify(asset),before);assert.equal(f.counts().ownerReads,1);
  }finally{f.cleanup();}
});
test('listing refuses a cached foreign NFT, token, metadata, conditions or unsafe explorer before publication',async()=>{
  for(const failure of ['contract','chain','token','metadata','terms','link','injected']){
    const f=fixture();try{
      f.ctx.manifest.nft='0x'+'3'.repeat(40);f.ctx.manifest.explorer='https://sepolia.basescan.org';
      f.ctx.transact=()=>assert.fail('invalid certificate cannot publish');
      const certificate={chainId:84532,contract:f.ctx.manifest.nft,tokenId:'4',owner:f.record.owner};
      const asset={kind:'video',project:f.project,releaseId:f.receipt.releaseId,title:f.receipt.title,sha256:f.receipt.videoSha256,certificate};
      if(failure==='contract')certificate.contract='0x'+'4'.repeat(40);
      if(failure==='chain')certificate.chainId=8453;
      if(failure==='token')certificate.tokenId='999';
      if(failure==='metadata'){f.receipt.title=asset.title='Changed acceptance title';f.write();}
      if(failure==='terms'){f.receipt.terms='Changed conditions';f.write();}
      if(failure==='link'){certificate.tx='0x'+'1'.repeat(64);certificate.explorer='javascript:alert(1)';}
      if(failure==='injected')certificate.privateKey='injected fixture';
      await assert.rejects(verifyAssetPublication(f.ctx,asset));assert.equal(f.counts().ownerReads,0);
    }finally{f.cleanup();}
  }
});
