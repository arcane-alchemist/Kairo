import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {execFileSync} from 'node:child_process';
import {Wallet} from 'ethers';
const base='http://localhost:8787',config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const values=parseEnv(readFileSync('.dev.vars','utf8')),wallet=new Wallet(values.ISSUER_PRIVATE_KEY);
assert.notEqual(wallet.address.toLowerCase(),values.SUPER_ADMIN_ADDRESS.toLowerCase(),'Never use the super admin private key for CLI checks');
let cookie='',art;
async function request(path,input) {
 const response=await fetch(`${base}/api${path}`,{method:input===undefined?'GET':'POST',headers:{origin:base,'content-type':'application/json',...(cookie?{cookie}:{})},...(input===undefined?{}:{body:JSON.stringify(input)}),signal:AbortSignal.timeout(20000)});
 const data=await response.json();assert(response.ok,`${path}: ${data.code||response.status}`);return {response,data};
}
try {
 const {data:runtime}=await request('/config');assert.equal(runtime.chainId,11155111);assert(runtime.mediaBaseUrl.startsWith('https://'));
 const {data:challenge}=await request('/auth/challenge',{wallet:wallet.address});assert(challenge.message.includes('URI: '+base));
 const verified=await request('/auth/verify',{id:challenge.id,signature:await wallet.signMessage(challenge.message)});cookie=verified.response.headers.get('set-cookie').split(';')[0];
 const {data:me}=await request('/auth/me');assert.equal(me.wallet,wallet.address);assert.equal(me.admin,false);
 const {data:workspace}=await request('/organizer/events');assert(Array.isArray(workspace.events));
 ({data:art}=await request('/artwork',{name:`Kairo media check ${crypto.randomUUID()}`,description:'Checks public artwork availability. No event or token is created.',role:'Attendee'}));
 assert(art.uri.startsWith(runtime.mediaBaseUrl));assert(art.image.startsWith(runtime.mediaBaseUrl));
 const metadataResponse=await fetch(art.uri,{signal:AbortSignal.timeout(15000)});assert.equal(metadataResponse.status,200);
 const metadata=await metadataResponse.json();assert.equal(metadata.image,art.image);assert.equal(metadata.attributes[0].value,'Attendee');
 const imageResponse=await fetch(art.image,{signal:AbortSignal.timeout(15000)});assert.equal(imageResponse.status,200);assert((await imageResponse.text()).includes('<svg'));
 console.log(JSON.stringify({status:'PASS',wallet:wallet.address,checks:['real wallet-bound SIWE','organizer workspace','generated badge upload through local Worker','public metadata','public badge image'],eventsCreated:0,tokensMinted:0,websiteDeployed:false}));
} catch(error){console.error('Local application verification failed:',error.message);process.exitCode=1;}
finally {
 if(cookie){try{await request('/auth/logout',{});}catch{console.error('Test session cleanup failed');process.exitCode=1;}}
 if(art){
  for(const uri of [art.image,art.uri]) {
   const key=new URL(uri).pathname.match(/(?:^|\/)((?:art|metadata)\/[a-f0-9]{64}\.(?:svg|json))$/)?.[1];assert(key,'Unexpected verification artwork path');
   try{execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','r2','object','delete',`${config.r2_buckets[0].bucket_name}/${key}`,'--remote'],{stdio:['ignore','pipe','pipe']});}
   catch{console.error('Temporary artwork cleanup failed:',key);process.exitCode=1;}
  }
  console.log('Temporary badge and metadata removed.');
 }
}
