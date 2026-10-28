import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {ContractFactory,JsonRpcProvider,ZeroAddress,parseEther,toQuantity} from 'ethers';
import {fixture} from '../serverless/test-fixture.js';
import {connectChain} from '../serverless/chain.js';
import {actionNext} from '../serverless/publish.js';
import {mintNext} from '../serverless/mint.js';

// Real EVM integration in an isolated local Sepolia-ID chain. Never uses saved keys or the live database.
const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const anvil=spawn('anvil',['--host','127.0.0.1','--port',String(port),'--chain-id','11155111','--accounts','0','--silent'],{stdio:['ignore','ignore','pipe']});
let startupError,connected,stderr='';anvil.on('error',error=>{startupError=error;});anvil.stderr.on('data',chunk=>{stderr+=chunk;});
const f=fixture(),provider=new JsonRpcProvider(`http://127.0.0.1:${port}`,11155111,{staticNetwork:true,cacheTimeout:-1});
const checks=[];
try {
 for(let attempt=0;;attempt++) {
  if(startupError)throw startupError;
  if(anvil.exitCode!==null)throw Error(`Anvil failed: ${stderr}`);
  try{await provider.send('eth_chainId',[]);break;}catch(error){if(attempt===30)throw error;await delay(100);}
 }
 await provider.send('anvil_setBalance',[f.organizer.address,toQuantity(parseEther('100'))]);
 const artifact=JSON.parse(readFileSync('out/Kairo.sol/Kairo.json','utf8'));
 const contract=await new ContractFactory(artifact.abi,artifact.bytecode.object,f.organizer.connect(provider)).deploy(f.admin.address,f.organizer.address,ZeroAddress);
 await contract.waitForDeployment();
 f.env.CONTRACT_ADDRESS=await contract.getAddress();f.env.SEPOLIA_RPC_URL=`http://127.0.0.1:${port}`;
 connected=await connectChain(f.env);Object.assign(f.chain,connected);
 f.sqlite.exec('DELETE FROM events');
 async function request(path,data,cookie,status=200) {
  const response=await f.request(path,data,cookie),result=await response.json();
  assert.equal(response.status,status,`${path}: ${JSON.stringify(result)}`);return result;
 }
 async function login(wallet) {
  const challenge=await request('/auth/challenge',{wallet:wallet.address});
  const response=await f.request('/auth/verify',{id:challenge.id,signature:await wallet.signMessage(challenge.message)});
  assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];
 }
 async function settle(table,run) {
  for(let attempt=0;attempt<25;attempt++) {
   await run();await provider.send('evm_mine',[]);await provider.send('evm_mine',[]);await delay(350);
   if(!f.sqlite.prepare(`SELECT id FROM ${table} WHERE status IN ('pending','submitted')`).get())return;
  }
  throw Error(`Queue did not settle: ${JSON.stringify(f.sqlite.prepare(`SELECT status,error FROM ${table}`).all())}`);
 }
 const owner=await login(f.organizer),admin=await login(f.admin),participant=await login(f.participant),outsider=await login(f.outsider);
 assert.equal((await request('/auth/me',undefined,admin)).admin,true);assert.equal((await request('/auth/me',undefined,owner)).admin,false);checks.push('wallet-signed SIWE and role isolation');
 const title='Workflow verification',description='A community workshop about open source and building together.';
 const generated=await request('/artwork',{name:title,description,role:'Attendee'},owner);
 const custom=await request('/artwork',{name:title,description,role:'Speaker',image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='},owner);
 assert(generated.image.endsWith('.svg'));assert(custom.image.endsWith('.png'));checks.push('generated SVG and custom PNG artwork with frozen metadata');
 const id=crypto.randomUUID(),seconds=Math.floor(Date.now()/1000);
 await request('/organizer/events',{id,title,description,club:'Community',category:'Workshop',venue:'Hall A',approximateAttendees:8,eventStartsAt:seconds-60,eventEndsAt:seconds+3600,mintStartsAt:seconds-60,mintEndsAt:seconds+3600,roleArtwork:[{role:'Attendee',cap:8,...generated},{role:'Speaker',cap:8,...custom}]},owner,202);
 await settle('chain_actions',()=>actionNext(f.DB,f.chain));
 const publication=await request(`/publications/${id}`,undefined,owner);assert.equal(publication.status,'live');
 const [attendee,speaker]=publication.events.map(e=>e.id);checks.push('sponsored on-chain publication of an ongoing event with two roles');
 await request(`/admin/events/${attendee}`,{action:'edit',title:'Updated listing',description:'Updated event description',venue:'Hall B',category:'Community',club:'Updated club',campus:'North',eventStartsAt:seconds-120,eventEndsAt:seconds+4000,approximateAttendees:12},owner,403);
 await request(`/admin/events/${attendee}`,{action:'edit',title:'Updated listing',description:'Updated event description',venue:'Hall B',category:'Community',club:'Updated club',campus:'North',eventStartsAt:seconds-120,eventEndsAt:seconds+4000,approximateAttendees:12},admin);
 assert.equal((await request(`/events/${speaker}`)).venue,'Hall B');assert.equal((await contract.events(attendee)).uri,generated.uri);checks.push('admin edits across roles without changing published badge metadata');
 const wanted=await request(`/events/${attendee}/requests`,{permanentConsent:true},participant,201);
 const rejected=await request(`/events/${attendee}/requests`,{permanentConsent:true},outsider,201);
 await request(`/admin/events/${attendee}/requests/${rejected.id}/reject`,{},admin);
 await request(`/admin/events/${attendee}/requests/${wanted.id}/accept`,{},owner,403);
 await request(`/admin/events/${attendee}/requests/${wanted.id}/accept`,{},admin,202);
 await request(`/admin/events/${speaker}/mint`,{wallet:f.participant.address},admin,202);
 await settle('jobs',()=>mintNext(f.DB,f.chain));checks.push('request rejection without mint, acceptance and direct address mint through real relayer transactions');
 assert.equal((await request(`/admin/events/${speaker}/mint`,{wallet:f.participant.address},admin,409)).code,'CONFLICT');
 const mine=await request('/my/requests',undefined,participant);assert.equal(mine.rows[0].mint_status,'confirmed');
 const denied=await request('/my/requests',undefined,outsider);assert.equal(denied.rows[0].status,'rejected');assert.equal(await contract.tokenFor(attendee,f.outsider.address),0n);
 const gallery=await request(`/wallet-collection?wallet=${f.participant.address}`);assert.equal(gallery.items.length,2);
 for(const item of gallery.items){assert(item.ownershipVerified);assert.equal(item.claimMethod,'ADMIN');assert(item.transactionHash);assert.equal(item.metadataStatus,'Available · contract URI verified');assert.equal(item.title,title);}
 assert(gallery.items.some(i=>i.image===custom.image));assert(gallery.items.some(i=>i.image===generated.image));checks.push('on-chain ownership, exact custom/generated artwork, issuance history and Gallery metadata');
 const qr=await request(`/events/${attendee}/qr`,undefined,owner);
 await request(`/events/${attendee}/claim`,{permanentConsent:true,qr:qr.token},owner,202);
 const links=await request(`/events/${speaker}/links`,{recipients:[{email:'guest@example.org',role:'Speaker'}]},owner,201);
 await request('/redeem/claim',{permanentConsent:true,token:links.links[0].link.split('/').at(-1)},outsider,202);
 await settle('jobs',()=>mintNext(f.DB,f.chain));assert.equal(f.sqlite.prepare("SELECT state FROM links").get().state,'minted');checks.push('existing rotating QR and single-use link mint flows');
 await request(`/admin/events/${attendee}`,{action:'pause'},admin,202);await settle('chain_actions',()=>actionNext(f.DB,f.chain));
 assert.equal((await contract.events(attendee)).paused,true);assert.equal((await contract.events(speaker)).paused,true);
 await request(`/admin/events/${attendee}/mint`,{wallet:f.admin.address},admin,409);
 await request(`/admin/events/${attendee}`,{action:'resume'},admin,202);await settle('chain_actions',()=>actionNext(f.DB,f.chain));
 await request(`/admin/events/${attendee}/mint`,{wallet:f.admin.address},admin,202);await settle('jobs',()=>mintNext(f.DB,f.chain));checks.push('group pause/resume and minting after resume');
 assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 console.log(JSON.stringify({status:'PASS',network:'isolated local EVM, chain ID 11155111',checks,confirmedMints:f.sqlite.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status='confirmed'").get().count,liveSepoliaTransactions:0},null,2));
} finally {
 connected?.provider.destroy();provider.destroy();f.sqlite.close();anvil.kill('SIGTERM');
}
