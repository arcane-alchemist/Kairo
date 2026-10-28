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
