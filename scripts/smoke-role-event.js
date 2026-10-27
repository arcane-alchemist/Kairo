import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ContractFactory,HDNodeWallet,JsonRpcProvider} from 'ethers';
import {createHandler} from '../serverless/worker.js';
import {connectChain} from '../serverless/chain.js';
import {mintNext} from '../serverless/mint.js';

// Isolated integration test: real Anvil transactions, disposable wallets, and no production bindings.
const origin='http://localhost:8790',rpc='http://127.0.0.1:18545';
const anvil=spawn('anvil',['--host','127.0.0.1','--port','18545','--chain-id','11155111','--block-time','1','--silent'],{stdio:'ignore'});
let sqlite,provider;
function stop(){if(sqlite){sqlite.close();sqlite=null;}provider?.destroy();anvil.kill();}
process.once('SIGINT',()=>{stop();process.exit();});
process.once('SIGTERM',()=>{stop();process.exit();});
try {
  for(let attempt=0;;attempt++) {
    if(anvil.exitCode!==null)throw Error('Local Anvil could not start; check port 18545.');
    try {const response=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})});assert.equal((await response.json()).result,'0xaa36a7');break;}
    catch(error){if(attempt>=30)throw error;await new Promise(resolve=>setTimeout(resolve,100));}
  }
  provider=new JsonRpcProvider(rpc,11155111,{staticNetwork:true});provider.pollingInterval=200;
  const phrase='test test test test test test test test test test test junk';
  const [admin,issuer,collector]=[0,1,2].map(index=>HDNodeWallet.fromPhrase(phrase,undefined,`m/44'/60'/0'/0/${index}`).connect(provider));
  const artifact=JSON.parse(readFileSync('out/Kairo.sol/Kairo.json','utf8'));
  const contract=await new ContractFactory(artifact.abi,artifact.bytecode.object,admin).deploy(admin.address);await contract.waitForDeployment();
  sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const name of readdirSync('serverless/migrations').filter(name=>name.endsWith('.sql')).sort())sqlite.exec(readFileSync(`serverless/migrations/${name}`,'utf8'));
  const DB={prepare(sql){let values=[];const query={bind(...args){values=args;return query;},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async run(){const result=sqlite.prepare(sql).run(...values);return {meta:{changes:result.changes}};}};return query;},async batch(queries){sqlite.exec('BEGIN');try{const results=[];for(const query of queries)results.push(await query.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  const objects=new Map();
  const env={DB,CONTRACT_ADDRESS:await contract.getAddress(),ISSUER_ADDRESS:issuer.address,ISSUER_PRIVATE_KEY:issuer.privateKey,STUDENT_HASH_SECRET:crypto.randomUUID()+crypto.randomUUID(),SITE_ORIGIN:origin,CHAIN_ID:'11155111',CHAIN_NAME:'Local blockchain test',PUBLIC_RPC_URL:rpc,SEPOLIA_RPC_URL:rpc,EXPLORER_URL:origin,MAX_FEE_GWEI:'10',
    MEDIA:{async put(key,value,options){objects.set(key,{value,...options});},async get(key){const object=objects.get(key);return object&&{body:object.value,httpMetadata:object.httpMetadata,async json(){return JSON.parse(object.value);}};}},
    MINT:{idFromName(){return 'local-test';},get(){return {async fetch(request){return Response.json(new URL(request.url).pathname==='/health'?{ok:true}:{queued:true});}};}},
    ASSETS:{async fetch(){return new Response('Local test has no deployed assets',{status:404});}}
  };
  const handle=createHandler(),chain=await connectChain(env);
  async function request(path,input,cookie='') {
    const response=await handle(new Request(origin+'/api'+path,{method:input===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',cookie},...(input===undefined?{}:{body:JSON.stringify(input)})}),env);
    const data=await response.json();assert(response.ok,`${path}: ${response.status} ${data.error||''}`);return {data,response};
  }
  async function login(wallet){const {data:challenge}=await request('/auth/challenge',{wallet:wallet.address});const {response}=await request('/auth/verify',{id:challenge.id,signature:await wallet.signMessage(challenge.message)});return response.headers.get('set-cookie').split(';')[0];}
  const adminCookie=await login(admin),collectorCookie=await login(collector);
  const title='Kairo Demo — Build Together',description='A dummy campus hackathon celebrating creative coding, teamwork and community. A keepsake for attendees, volunteers and judges. Local blockchain test only; no real attendance is certified.';
  const roleArtwork=[];
  for(const [role,cap] of [['Attendee',20],['Volunteer',5],['Judge',3]]) {
    const {data:art}=await request('/artwork',{name:title,description,role},adminCookie);
    roleArtwork.push({role,cap,...art});
    const metadata=await (await env.MEDIA.get(art.uri.split('/media/')[1])).json();assert.equal(metadata.attributes[0].value,role);
  }
  assert.equal(new Set(roleArtwork.map(art=>art.image)).size,3);
  const now=Math.floor(Date.now()/1000),start=now+60;
  const details={title,description,club:'Kairo test community',category:'Hackathon',campus:'Local test campus',eligibility:'',roles:roleArtwork.map(art=>art.role),venue:'Local integration test',organizer:admin.address,claimMode:'attendance',cap:20,eventStartsAt:start,eventEndsAt:start+3600,mintStartsAt:start,mintEndsAt:start+7200,rsvpDeadline:start-1,...roleArtwork[0],roleArtwork};
  const {data:draft}=await request('/organizer/events',{...details,submit:true},adminCookie);
  const drops=[];
  for(const art of roleArtwork) {
    const tx=await contract.createEvent(art.uri,art.cap,start,start+7200,admin.address,issuer.address),receipt=await tx.wait(2);
    const created=receipt.logs.map(log=>{try{return contract.interface.parseLog(log);}catch{return null;}}).find(log=>log?.name==='EventCreated');
    const id=Number(created.args.eventId);
    await request('/events',{...details,...art,roles:[art.role],id,draftId:draft.id},adminCookie);
    const {data:registration}=await request(`/events/${id}/rsvp`,{studentId:'DEMO-'+art.role,permanentConsent:true},collectorCookie);
    drops.push({...art,id,ticket:registration.ticket,createTransaction:receipt.hash});
  }
  console.log('Role drops created with supplies 20/5/3. Waiting for the actual event window before check-in.');
  while (Math.floor(Date.now()/1000) <= start) await new Promise(resolve=>setTimeout(resolve,250));
  await provider.send('evm_mine',[]);
  for(const drop of drops) {
    // Test-only verifier attestation for a clearly labeled dummy event.
    await request(`/tickets/${drop.ticket}/check-in`,{physicallyVerified:true,studentId:'DEMO-'+drop.role},adminCookie);
    for(let attempt=0;;attempt++) {
      await mintNext(DB,chain);const {data:ticket}=await request(`/tickets/${drop.ticket}`);
      if(ticket.status==='confirmed'){drop.tokenId=ticket.token_id;drop.mintTransaction=ticket.tx_hash;break;}
      assert.notEqual(ticket.status,'failed');assert(attempt<30,'Local mint did not confirm');await new Promise(resolve=>setTimeout(resolve,250));
    }
    assert.equal(await contract.ownerOf(drop.tokenId),collector.address);assert.equal(await contract.tokenURI(drop.tokenId),drop.uri);assert.equal((await contract.events(drop.id)).cap,BigInt(drop.cap));assert(await contract.locked(drop.tokenId));
  }
  const {data:collection}=await request('/wallet-collection?wallet='+collector.address);assert.equal(collection.total,3);assert.equal(collection.items.length,3);assert.deepEqual(collection.items.map(item=>item.role).sort(),['Attendee','Judge','Volunteer']);
  assert(collection.items.every(item=>item.ownershipVerified&&item.image&&item.description===description));
  console.log(JSON.stringify({status:'PASS',network:'Isolated local Anvil blockchain; NOT live Sepolia',roles:drops.map(({role,cap,tokenId})=>({role,cap,tokenId})),galleryItems:collection.items.length,checks:['description-generated artwork','signed login','draft submission','real role-drop creation','RSVP','test check-in','sponsored mint queue','two confirmations','ownership','immutable URI','soulbound lock','Gallery API']},null,2));
  stop();
  console.log('Cleanup complete: disposable blockchain, event database and artwork discarded.');
} catch(error){console.error('Local role test failed:',error.message);stop();process.exitCode=1;}
