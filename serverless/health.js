import {getAddress, Wallet, ZeroAddress} from 'ethers';
import {ServiceError, errorResponse} from './errors.js';
import {mediaBaseURL} from './media.js';

export function checkConfig(env, {writes = false, publicOnly = false} = {}) {
  const required = ['CHAIN_ID','CHAIN_NAME','CONTRACT_ADDRESS','PUBLIC_RPC_URL','EXPLORER_URL','SITE_ORIGIN'];
  if (!publicOnly) required.push('SUPER_ADMIN_ADDRESS');
  const missing = required.filter(key => !env[key]);
  if (missing.length) throw new ServiceError('NOT_CONFIGURED', `Kairo configuration is missing: ${missing.join(', ')}.`);
  try {
    for (const [key,fallback] of [['EVENTS_PER_WALLET_PER_DAY',5],['EMAIL_RETENTION_DAYS',30]]) {
      const value=Number(env[key] || fallback); if (!Number.isSafeInteger(value) || value<1) throw Error();
    }
    const archives=JSON.parse(env.ARCHIVE_CONTRACT_ADDRESSES || '[]');
    if (!Array.isArray(archives) || archives.some(value=>getAddress(value) === ZeroAddress)) throw Error();
    if (!publicOnly && getAddress(env.SUPER_ADMIN_ADDRESS) === ZeroAddress) throw Error();
    if (Number(env.CHAIN_ID) !== 11155111 || getAddress(env.CONTRACT_ADDRESS) === ZeroAddress) throw Error();
    for (const key of ['PUBLIC_RPC_URL','EXPLORER_URL','SITE_ORIGIN']) {
      const url = new URL(env[key]);
      if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) throw Error();
    }
  } catch { throw new ServiceError('NOT_CONFIGURED', 'Kairo network configuration is invalid.'); }
  if (writes) {
    let signer;try {signer=new Wallet(env.ISSUER_PRIVATE_KEY);}catch{throw new ServiceError('RELAYER_NOT_CONFIGURED','Set the relayer private key locally to enable gas sponsorship.','relayer');}
    if(signer.address!==getAddress(env.ISSUER_ADDRESS))throw new ServiceError('RELAYER_MISMATCH','The relayer key belongs to a different wallet. Use the key matching the configured gas-paying wallet.','relayer');
  }
}

export async function health(request, env, connectChain) {
  const dependencies = {};
  let connection;
  const chain=()=>connection ||= connectChain(env);
  const probe = async (name, check) => {
    let timer;
    try {
      await Promise.race([Promise.resolve().then(check),new Promise((resolve,reject) => {
        timer = setTimeout(() => reject(new ServiceError('DEPENDENCY_TIMEOUT',`Kairo’s ${name} dependency timed out.`,name)),10000);
      })]);
      dependencies[name] = {status:'ok'};
    }
    catch (error) {
      if(error instanceof ServiceError&&['CONTRACT_MISMATCH','RELAYER_MISMATCH','RELAYER_UNFUNDED','RELAYER_NOT_CONFIGURED','MEDIA_NOT_CONFIGURED','NOT_CONFIGURED'].includes(error.code)){dependencies[name]={status:'error',code:error.code,message:error.message};return;}
      const wrapped = error instanceof ServiceError ? error : new ServiceError(({d1:'DATABASE_ERROR',r2:'R2_ERROR',durableObject:'DURABLE_OBJECT_ERROR',rpc:'RPC_UNREACHABLE',contract:'CONTRACT_MISMATCH',relayer:'RELAYER_NOT_CONFIGURED',media:'MEDIA_NOT_CONFIGURED'})[name] || 'NOT_CONFIGURED', `Kairo’s ${name} dependency is unavailable.`,name);
      if (wrapped !== error) wrapped.cause = error;
      const response = errorResponse(wrapped,request,env);
      const {code,error:message,requestId} = await response.json();
      dependencies[name] = {status:'error',code,message,requestId};
    } finally { clearTimeout(timer); }
  };
  await Promise.all([
    probe('config', () => checkConfig(env)),
    probe('d1', async () => {
      await env.DB.prepare('SELECT e.listed,e.paused,e.deleted_at,c.method FROM events e LEFT JOIN claims c ON e.id=c.event_id LIMIT 0').all();
      await env.DB.prepare('SELECT id FROM chain_actions LIMIT 0').all();
      await env.DB.prepare('SELECT token_hash,state FROM links LIMIT 0').all();
      await env.DB.prepare('SELECT id,status,claim_id FROM poap_requests LIMIT 0').all();
    }),
    probe('r2', async () => { await env.MEDIA.get('health/readiness'); }),
    probe('durableObject', async () => {
      const response = await env.MINT.get(env.MINT.idFromName('sepolia-issuer')).fetch(new Request('https://mint.internal/health'));
      if (!response.ok || (await response.json()).ok !== true) throw new ServiceError('DURABLE_OBJECT_ERROR','Mint coordinator is unavailable.','durableObject');
    }),
    probe('rpc', async () => { await (await chain()).provider.getCode(env.CONTRACT_ADDRESS); }),
    probe('contract', async () => {
      const connected=await chain();
      if(await connected.provider.getCode(env.CONTRACT_ADDRESS)==='0x')throw new ServiceError('CONTRACT_MISMATCH','The Kairo contract is not deployed yet.','contract');
      await connected.assertContract();
    }),
    probe('relayer', async () => {
      checkConfig(env,{writes:true});
      if(await (await chain()).provider.getBalance(env.ISSUER_ADDRESS)===0n)throw new ServiceError('RELAYER_UNFUNDED','Add Sepolia test ETH to the relayer wallet.','relayer');
    }),
    probe('media', () => { mediaBaseURL(env,request.url,{publishing:true}); })
  ]);
  const ok = Object.values(dependencies).every(value => value.status === 'ok');
  return Response.json({status:ok?'ok':'degraded',dependencies},{status:ok?200:503,headers:{'cache-control':'no-store'}});
}
