import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Wallet, encryptKeystoreJson } from 'ethers';

export const DEMO_HOME = process.env.AIM_DEMO_HOME || path.join(os.homedir(),'Desktop','AIMmontag_Blockchain');
const ROLES = ['operator','seller','buyer','resolver','signer1','signer2','signer3','signer4','signer5'];
function secureDir(dir) { fs.mkdirSync(dir,{recursive:true,mode:0o700}); fs.chmodSync(dir,0o700); }

export async function loadWallets() {
  secureDir(DEMO_HOME);
  const vaultPath = path.join(DEMO_HOME,'demo-wallets.encrypted.json');
  const service = 'AIMmontag.blockchain-demo.test-only';
  const localDir = path.join(os.homedir(),'.config','aimmontag-blockchain-demo');
  const fallbackPath = path.join(localDir,'test-only-vault-password');
  let password, storage;
  if (process.platform === 'darwin') {
    const found = spawnSync('/usr/bin/security',['find-generic-password','-a',os.userInfo().username,'-s',service,'-w'],{encoding:'utf8'});
    if (found.status===0) { password=found.stdout.trim(); storage='macOS Keychain'; }
  }
  if (!password && fs.existsSync(fallbackPath)) {
    password=fs.readFileSync(fallbackPath,'utf8'); storage='separate local test-only password file';
  }
  if (!password && fs.existsSync(vaultPath)) throw new Error('Demo vault exists but its password is unavailable; refusing to replace wallets.');
  if (!password) {
    password=crypto.randomBytes(32).toString('base64url');
    if (process.platform==='darwin') {
      const saved=spawnSync('/usr/bin/security',['add-generic-password','-a',os.userInfo().username,'-s',service,'-w',password],{encoding:'utf8'});
      if(saved.status===0) storage='macOS Keychain';
    }
    if(!storage) { secureDir(localDir); fs.writeFileSync(fallbackPath,password,{mode:0o600,flag:'wx'}); storage='separate local test-only password file'; }
  }
  let entries;
  if (fs.existsSync(vaultPath)) entries=JSON.parse(fs.readFileSync(vaultPath,'utf8')).wallets;
  else {
    entries=[];
    for(const role of ROLES) {
      const wallet=Wallet.createRandom();
      // No mnemonic is persisted. Encrypted V3 keystores contain only demo private keys.
      const keystore=await encryptKeystoreJson({address:wallet.address,privateKey:wallet.privateKey},password,
        {scrypt:{N:16384,r:8,p:1}});
      entries.push({role,address:wallet.address,keystore:JSON.parse(keystore)});
    }
    fs.writeFileSync(vaultPath,JSON.stringify({testOnly:true,independentCustody:false,storage,wallets:entries},null,2),{mode:0o600,flag:'wx'});
  }
  const wallets={};
  for(const entry of entries) wallets[entry.role]=await Wallet.fromEncryptedJson(JSON.stringify(entry.keystore),password);
  if(ROLES.some(role=>!wallets[role]) || new Set(Object.values(wallets).map(x=>x.address)).size!==ROLES.length)
    throw new Error('Incomplete or duplicate demo wallet inventory');
  const publicInventory={testOnly:true,independentCustody:false,storage,wallets:entries.map(({role,address})=>({role,address}))};
  fs.writeFileSync(path.join(DEMO_HOME,'PUBLIC_DEMO_WALLETS.json'),JSON.stringify(publicInventory,null,2),{mode:0o600});
  return {wallets,publicInventory};
}
