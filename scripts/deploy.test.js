import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet} from 'ethers';
import {deploymentWallet} from './deploy.js';
test('terminal deployment explicitly uses the saved matching relayer, rejects admin and never falls back to it',()=>{
 const admin=Wallet.createRandom(),relayer=Wallet.createRandom(),deployer=Wallet.createRandom();
 const config={vars:{ISSUER_ADDRESS:relayer.address}};
 const values={SUPER_ADMIN_ADDRESS:admin.address,ISSUER_PRIVATE_KEY:relayer.privateKey,DEPLOYER_PRIVATE_KEY:deployer.privateKey};
 assert.equal(deploymentWallet(config,[],values).address,deployer.address);
 assert.equal(deploymentWallet(config,['--use-relayer'],values).address,relayer.address);
 assert.throws(()=>deploymentWallet(config,[],{...values,DEPLOYER_PRIVATE_KEY:undefined}),/valid local deployment key/);
 assert.throws(()=>deploymentWallet(config,['--use-relayer'],{...values,ISSUER_PRIVATE_KEY:deployer.privateKey}),/must match/);
 assert.throws(()=>deploymentWallet(config,[],{...values,DEPLOYER_PRIVATE_KEY:admin.privateKey}),/never the super admin key/);
 assert.throws(()=>deploymentWallet(config,['--local'],values),/Sepolia only/);
});
