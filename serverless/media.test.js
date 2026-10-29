import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaBaseURL,metadataKey,verifyPublicMetadata,displayMediaURL} from './media.js';

test('localhost may publish through configured public artwork storage, without freezing localhost URLs',()=>{
 const env={MEDIA_BASE_URL:'https://public-art.r2.dev/'};
 assert.equal(mediaBaseURL(env,'http://localhost:8787',{publishing:true}),'https://public-art.r2.dev/');
 assert.equal(mediaBaseURL({},'https://kairo.test'),'https://kairo.test/media/');
 assert.throws(()=>mediaBaseURL({},'http://localhost:8787',{publishing:true}),{code:'MEDIA_NOT_CONFIGURED'});
 for(const value of ['http://remote.test/','https://name:secret@art.test/','https://art.test/?query=1','invalid'])assert.throws(()=>mediaBaseURL({MEDIA_BASE_URL:value},'https://kairo.test',{publishing:true}),{code:'MEDIA_NOT_CONFIGURED'});
});
test('collection reads work for public R2 URLs and archived Worker media URLs',()=>{
 const hash='a'.repeat(64),env={MEDIA_BASE_URL:'https://art.r2.dev/'};
 assert.equal(metadataKey(`https://art.r2.dev/metadata/${hash}.json`,env,'https://kairo.test'),`metadata/${hash}.json`);
 assert.equal(metadataKey(`https://older.test/media/metadata/${hash}.json`,env,'https://kairo.test'),`metadata/${hash}.json`);
 assert.equal(metadataKey('https://evil.test/metadata/not-a-hash.json',env,'https://kairo.test'),null);
});
test('publication verifies public metadata bytes and rejects unavailable or different content',async t=>{
 const expected={name:'Event',image:'https://art.test/image.png'};
 const readJSON=response=>response.json();
 const fetchMock=t.mock.method(globalThis,'fetch',async(_uri,options)=>{assert.equal(options.redirect,'manual');return Response.json(expected);});
 await verifyPublicMetadata('https://art.test/metadata.json',expected,readJSON);
 fetchMock.mock.mockImplementation(async()=>new Response(null,{status:302,headers:{location:'https://other.test/'}}));
 await assert.rejects(verifyPublicMetadata('https://art.test/metadata.json',expected,readJSON),{code:'MEDIA_UNREACHABLE'});
 fetchMock.mock.mockImplementation(async()=>new Response('Not found',{status:404}));
 await assert.rejects(verifyPublicMetadata('https://art.test/metadata.json',expected,readJSON),{code:'MEDIA_UNREACHABLE'});
 fetchMock.mock.mockImplementation(async()=>Response.json({name:'Different event'}));
 await assert.rejects(verifyPublicMetadata('https://art.test/metadata.json',expected,readJSON),{code:'MEDIA_MISMATCH'});
});

test('legacy artwork uses the current public host without changing third-party or immutable metadata URLs',()=>{
 const env={SITE_ORIGIN:'https://old.test',MEDIA_BASE_URL:'https://art.r2.dev/'};
 const key=`art/${'a'.repeat(64)}.png`,old=`https://old.test/media/${key}`;
 assert.equal(displayMediaURL(old,env,'http://localhost:8787'),`https://art.r2.dev/${key}`);
 for(const value of [old.replace('old.test','other.test'),old+'?x=1','ipfs://image','https://old.test/media/not-a-hash.png'])assert.equal(displayMediaURL(value,env,'http://localhost:8787'),value);
});

test('a temporary network failure or public-host outage recovers without changing the frozen URL',async t=>{
 const expected={name:'Campus workshop',image:'https://art.test/art/badge.png'},uri='https://art.test/metadata/badge.json';
 const mock=t.mock.method(globalThis,'fetch',async()=>Response.json(expected));
 for(const failure of ['network',429,503]){
  let attempts=0;
  mock.mock.mockImplementation(async requested=>{
   assert.equal(requested,uri);
   if(++attempts===1){if(failure==='network')throw TypeError('fetch failed');return new Response(null,{status:failure});}
   return Response.json(expected);
  });
  await verifyPublicMetadata(uri,expected,response=>response.json());assert.equal(attempts,2);
 }
});

test('permanent public-host failures identify the host and never publish through a fallback URL',async t=>{
 let attempts=0;
 t.mock.method(globalThis,'fetch',async()=>{attempts++;throw TypeError('fetch failed');});
 await assert.rejects(verifyPublicMetadata('https://missing-art.test/metadata/badge.json',{},response=>response.json()),error=>error.code==='MEDIA_UNREACHABLE'&&error.message.includes('missing-art.test')&&error.message.includes('MEDIA_BASE_URL'));
 assert.equal(attempts,2);
});

test('wrong public routes and non-JSON responses fail with actionable media errors',async t=>{
 const mock=t.mock.method(globalThis,'fetch',async()=>new Response('Not found',{status:404}));let attempts=0;
 mock.mock.mockImplementation(async()=>{attempts++;return new Response('Not found',{status:404});});
 await assert.rejects(verifyPublicMetadata('https://art.test/metadata/badge.json',{},response=>response.json()),error=>error.code==='MEDIA_UNREACHABLE'&&error.message.includes('HTTP 404'));
 assert.equal(attempts,1);
 mock.mock.mockImplementation(async()=>new Response('<html>Sign in</html>'));
 await assert.rejects(verifyPublicMetadata('https://art.test/metadata/badge.json',{},response=>response.json()),{code:'MEDIA_MISMATCH'});
});
