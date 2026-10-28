import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {Wallet} from 'ethers';
import {createHandler,digest} from './worker.js';

export function fixture(origin='https://kairo.test') {
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync('serverless/migrations').sort())sqlite.exec(readFileSync(`serverless/migrations/${file}`,'utf8'));
 const DB={prepare(sql){let values=[];const q={bind(...args){values=args;return q;},first:async()=>sqlite.prepare(sql).get(...values)||null,all:async()=>({results:sqlite.prepare(sql).all(...values)}),run:async()=>q.execute(),execute(){if(/RETURNING/i.test(sql)){const results=sqlite.prepare(sql).all(...values);return {results,meta:{changes:results.length}};}return {meta:{changes:sqlite.prepare(sql).run(...values).changes}};}};return q;},async batch(queries){sqlite.exec('BEGIN');try{const results=queries.map(q=>q.execute());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 const admin=Wallet.createRandom(),organizer=Wallet.createRandom(),participant=Wallet.createRandom(),outsider=Wallet.createRandom(),seconds=Math.floor(Date.now()/1000),objects=new Map();
 sqlite.prepare(`INSERT INTO events(id,title,description,club,category,venue,image,uri,starts_at,ends_at,cap,organizer,created_at,roles,event_starts_at,event_ends_at) VALUES(1,'Campus event','A day of building','Code club','Technology','Hall A','https://kairo.test/media/art/test.svg','ipfs://old',?,?,2,?,?,?, ?,?)`).run(seconds-10,seconds+3600,organizer.address,seconds,'["Attendee"]',seconds-10,seconds+3600);
 const env={DB,SUPER_ADMIN_ADDRESS:admin.address,QR_HMAC_SECRET:'q'.repeat(32),EMAIL_RETENTION_DAYS:'30',EVENTS_PER_WALLET_PER_DAY:'5',SITE_ORIGIN:'https://kairo.test',ISSUER_PRIVATE_KEY:organizer.privateKey,ISSUER_ADDRESS:organizer.address,CHAIN_ID:'11155111',CHAIN_NAME:'Sepolia',CONTRACT_ADDRESS:admin.address,PUBLIC_RPC_URL:'https://rpc.test',EXPLORER_URL:'https://sepolia.etherscan.io',MEDIA:{async get(key){const value=objects.get(key);return value?{json:async()=>JSON.parse(value),body:value,httpMetadata:{contentType:'application/json'}}:null;},async put(key,value){objects.set(key,typeof value==='string'?value:new TextDecoder().decode(value));}},ASSETS:{fetch:async()=>new Response('asset')},MINT:{idFromName:()=>'',get:()=>({fetch:async()=>Response.json({ok:true,queued:true})})}};
 const chain={assertMintReady:async()=>{},assertReady:async()=>{},event:async()=>({cap:2n,minted:0n,startsAt:BigInt(seconds-10),endsAt:BigInt(seconds+3600),paused:false}),token:async()=> '0',admin:async()=>true,signMint:async()=>({raw:'signed',hash:'0xmint'}),signAction:async()=>({raw:'publish',hash:'0xpublish'}),receipt:async()=>null,broadcast:async()=>{},createdEvents:()=>[2],provider:{getBalance:async()=>1000000000000000000n}};
 const handler=createHandler(async()=>chain);
 const request=(path,data,cookie,method)=>handler(new Request(`${origin}/api${path}`,{method:method||(data===undefined?'GET':'POST'),headers:{Origin:origin,'content-type':'application/json',...(cookie?{cookie}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})}),env);
 async function login(wallet){const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');sqlite.prepare('INSERT INTO sessions VALUES(?,?,?)').run(await digest(token),wallet.address,seconds+600);return `kairo_session=${token}`;}
 return {sqlite,DB,env,admin,organizer,participant,outsider,seconds,chain,request,login,objects};
}
