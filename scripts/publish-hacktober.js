import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Contract, JsonRpcProvider, Wallet, keccak256, parseUnits, formatEther } from 'ethers';
import QRCode from 'qrcode';
const site='https://kairo-site-7fb.pages.dev';
const path='data/hacktober-drop.json';
const details={title:'Hacktober',description:'Celebrate the spirit of open source with Hacktoberfest 2026 at SRM AP!\nThis POAP commemorates a celebration of collaboration, creativity, and community-driven innovation. Representing the joy of building together, sharing knowledge, and contributing to Free and Open Source Software (FOSS), it honors everyone who takes a step toward making open source more accessible and impactful.',venue:'SRM University AP',club:'FOSS · SRM AP',category:'Technology',claimMode:'qr',
  eventStartsAt:Date.parse('2026-10-10T20:00:00+05:30')/1000,eventEndsAt:Date.parse('2026-10-11T12:00:00+05:30')/1000,
  rsvpDeadline:Date.parse('2026-10-10T19:00:00+05:30')/1000};
const mintStarts=Date.parse('2026-10-11T09:30:00+05:30')/1000,mintEnds=Date.parse('2026-10-11T13:00:00+05:30')/1000;
let cookie='';
async function api(route,input){
  const r=await fetch(site+'/api'+route,{headers:{origin:site,'content-type':'application/json',cookie},...(input===undefined?{}:{method:'POST',body:JSON.stringify(input)})});
  if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
  const result=await r.json();assert(r.ok,`${route}: ${r.status} ${result.error||''}`);return result;
}
async function main(){
  assert(details.rsvpDeadline<details.eventStartsAt && details.eventStartsAt<mintStarts && mintStarts<details.eventEndsAt && details.eventEndsAt<mintEnds);
  assert(Date.now()/1000<mintEnds,'Mint window has ended; do not create this drop');
  const provider=new JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  assert.equal((await provider.getNetwork()).chainId,11155111n);
  const config=await api('/config');const admin=new Wallet(process.env.DEPLOYER_PRIVATE_KEY,provider);
  const {abi}=JSON.parse(readFileSync('out/Kairo.sol/Kairo.json'));const contract=new Contract(config.contractAddress,abi,admin);
  assert(await contract.hasRole(await contract.DEFAULT_ADMIN_ROLE(),admin.address));
  mkdirSync('data',{recursive:true});
  const state=existsSync(path)?JSON.parse(readFileSync(path)):{contract:config.contractAddress};
  assert.equal(state.contract,config.contractAddress);
  const save=()=>writeFileSync(path,JSON.stringify(state,null,2),{mode:0o600});
  const challenge=await api('/auth/challenge',{});await api('/auth/verify',{id:challenge.id,signature:await admin.signMessage(challenge.message)});
  const image=readFileSync('output/artwork/hacktoberfest-foss-srm-ap-2026.png');assert(image.length<=2*1024*1024);
  if(!state.media){state.media=await api('/artwork',{name:details.title,description:details.description,image:'data:image/png;base64,'+image.toString('base64')});save();}
  assert.deepEqual(Buffer.from(await(await fetch(state.media.image)).arrayBuffer()),image,'Hosted artwork differs from original');
  if(!state.eventId){
    if(!state.raw){
      const fees=await provider.getFeeData();assert(fees.maxFeePerGas<=parseUnits('2','gwei'),'Gas too expensive');
      const request=await admin.populateTransaction(await contract.createEvent.populateTransaction(state.media.uri,50,mintStarts,mintEnds,admin.address,config.issuerAddress,{maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas}));
      assert(request.gasLimit*request.maxFeePerGas<parseUnits('0.002','ether'),'Creation exceeds gas budget');
      state.raw=await admin.signTransaction(request);state.createHash=keccak256(state.raw);save();
    }
    let receipt=await provider.getTransactionReceipt(state.createHash);
    if(!receipt){try{await provider.broadcastTransaction(state.raw)}catch{assert(await provider.getTransaction(state.createHash),'Broadcast failed')};console.log('Creating Hacktober drop:',state.createHash);receipt=await provider.waitForTransaction(state.createHash,2,180000);}
    assert.equal(receipt?.status,1,'Drop creation pending or failed');
    for(const log of receipt.logs){try{const parsed=contract.interface.parseLog(log);if(parsed?.name==='EventCreated')state.eventId=Number(parsed.args.eventId)}catch{}}
    assert(state.eventId);save();
  }
  await api('/events',{...details,...state.media,id:state.eventId});
  const event=(await api('/events')).find(e=>e.id===state.eventId);assert.equal(event.claimMode,'qr');assert.equal(event.cap,50);assert.equal(event.remaining,50);
  const onchain=await contract.events(state.eventId);assert.equal(onchain.cap,50n);assert.equal(onchain.minted,0n);assert(await contract.canMint(state.eventId,config.issuerAddress));
  const url=site+'/#drop/'+state.eventId;mkdirSync('output/hacktober',{recursive:true});
  await QRCode.toFile('output/hacktober/drop-qr.png',url,{width:1000,margin:4,errorCorrectionLevel:'H',color:{dark:'#382457',light:'#ffffff'}});
  const receipt=await provider.getTransactionReceipt(state.createHash);
  const report={...details,dropId:state.eventId,url,capacity:50,mintStartsAt:mintStarts,mintEndsAt:mintEnds,artwork:state.media.image,metadata:state.media.uri,contract:config.contractAddress,createTransaction:state.createHash,creationGasETH:formatEther(receipt.fee),minted:0};
  writeFileSync('deployments/hacktober.json',JSON.stringify(report,null,2)+'\n');
  await api('/auth/logout',{});console.log(JSON.stringify(report,null,2));provider.destroy();
}
main().catch(error=>{console.error('Hacktober publish stopped:',error.code||error.name,error.code==='ERR_ASSERTION'?error.message:'');process.exit(1)});
