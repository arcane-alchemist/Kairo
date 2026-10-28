import {ServiceError} from './errors.js';

export function mediaBaseURL(env,requestUrl,{publishing=false}={}) {
 let url;
 try {url=new URL(env.MEDIA_BASE_URL || new URL('/media/',requestUrl));}
 catch {throw new ServiceError('MEDIA_NOT_CONFIGURED','Connect public artwork storage before publishing.','media');}
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.search||url.hash||url.protocol!=='https:'&&!(url.protocol==='http:'&&local&&!publishing)||publishing&&local) {
  throw new ServiceError('MEDIA_NOT_CONFIGURED','Connect public artwork storage before publishing.','media');
 }
 return url.href.replace(/\/?$/,'/');
}
export function metadataKey(uri,env,requestUrl) {
 const base=mediaBaseURL(env,requestUrl);
 const key=uri.startsWith(base)?uri.slice(base.length):uri.match(/\/(metadata\/[a-f0-9]{64}\.json)$/)?.[1];
 return /^metadata\/[a-f0-9]{64}\.json$/.test(key||'')?key:null;
}
export async function verifyPublicMetadata(uri,expected,readJSON) {
 let response;
 try {response=await fetch(uri,{redirect:'manual',signal:AbortSignal.timeout(8000)});}
 catch {throw new ServiceError('MEDIA_UNREACHABLE','Your artwork upload is saved, but its public URL is unavailable. Retry publishing in a moment.','media');}
 if(!response.ok)throw new ServiceError('MEDIA_UNREACHABLE','Your artwork is not publicly readable yet. Retry publishing in a moment.','media');
 const actual=await readJSON(response);
 if(JSON.stringify(actual)!==JSON.stringify(expected))throw new ServiceError('MEDIA_MISMATCH','The public artwork does not match your saved badge. Upload the design again.','media');
}

export function displayMediaURL(value,env,requestUrl) {
 if(!value)return value;
 try {
  const url=new URL(value),site=new URL(env.SITE_ORIGIN||requestUrl);
  const key=url.pathname.match(/^\/media\/((?:art|video)\/[a-f0-9]{64}\.(?:png|jpg|svg|mp4|webm))$/)?.[1];
  if(key&&url.origin===site.origin&&!url.search&&!url.hash)return mediaBaseURL(env,requestUrl)+key;
 }catch{}
 return value;
}
