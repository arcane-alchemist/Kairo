import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {Contract,JsonRpcProvider} from 'ethers';
import {getPlatformProxy} from 'wrangler';
// Restore the local listing only after checking its immutable Sepolia record and existing artwork.
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const manifest=JSON.parse(readFileSync('deployments/hacktober.json','utf8'));
const provider=new JsonRpcProvider(config.vars.PUBLIC_RPC_URL,11155111,{staticNetwork:true});
const path='.wrangler/restore-hacktober.json';let proxy;
try {
 assert.equal(BigInt(await provider.send('eth_chainId',[])),11155111n);
 const contract=new Contract(manifest.contract,['function events(uint256) view returns(string uri,uint64 cap,uint64 minted,uint64 startsAt,uint64 endsAt,bool paused)','function eventAdmin(uint256) view returns(address)'],provider);
 const event=await contract.events(manifest.dropId),organizer=await contract.eventAdmin(manifest.dropId);
 assert.equal(event.uri,manifest.metadata);assert.equal(Number(event.cap),manifest.capacity);
 assert.equal(Number(event.startsAt),manifest.mintStartsAt);assert.equal(Number(event.endsAt),manifest.mintEndsAt);
 writeFileSync(path,JSON.stringify({name:'kairo-local-restore',compatibility_date:config.compatibility_date,r2_buckets:config.r2_buckets,d1_databases:config.d1_databases}));
 proxy=await getPlatformProxy({configPath:path,persist:{path:`${process.cwd()}/.wrangler/state/v3`},remoteBindings:true});
 const metadata=await proxy.env.MEDIA.get(manifest.metadata.split('/media/')[1]);assert(metadata,'Existing frozen metadata missing');
 const badge=await metadata.json();assert.equal(badge.image,manifest.artwork);
 assert(await proxy.env.MEDIA.get(manifest.artwork.split('/media/')[1]),'Existing artwork missing');
 const existing=await proxy.env.DB.prepare('SELECT uri FROM events WHERE id=?').bind(manifest.dropId).first();
 if(existing)assert.equal(existing.uri,manifest.metadata,'Local event ID belongs to another record');
 else await proxy.env.DB.prepare(`INSERT INTO events(id,title,description,club,category,venue,image,uri,starts_at,ends_at,cap,organizer,created_at,roles,event_starts_at,event_ends_at,paused)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(manifest.dropId,manifest.title,manifest.description,manifest.club,manifest.category,manifest.venue,manifest.artwork,event.uri,Number(event.startsAt),Number(event.endsAt),Number(event.cap),organizer,manifest.eventStartsAt,'["Attendee"]',manifest.eventStartsAt,manifest.eventEndsAt,Number(event.paused)).run();
 console.log('Verified Hacktober listing restored locally. On-chain records, frozen metadata and remote database unchanged.');
}finally{provider.destroy();await proxy?.dispose();try{unlinkSync(path);}catch{}}
