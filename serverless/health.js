import {getAddress, Wallet, ZeroAddress} from 'ethers';
import {ServiceError, errorResponse} from './errors.js';

export function checkConfig(env, {writes = false} = {}) {
  const missing = ['CHAIN_ID','CHAIN_NAME','CONTRACT_ADDRESS','PUBLIC_RPC_URL','EXPLORER_URL','SITE_ORIGIN'].filter(key => !env[key]);
  if (missing.length) throw new ServiceError('NOT_CONFIGURED', `Kairo configuration is missing: ${missing.join(', ')}.`);
  try {
    if (Number(env.CHAIN_ID) !== 11155111 || getAddress(env.CONTRACT_ADDRESS) === ZeroAddress) throw Error();
    for (const key of ['PUBLIC_RPC_URL','EXPLORER_URL','SITE_ORIGIN']) {
      const url = new URL(env[key]);
      if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) throw Error();
    }
  } catch { throw new ServiceError('NOT_CONFIGURED', 'Kairo network configuration is invalid.'); }
  if (writes) {
    if (!env.STUDENT_HASH_SECRET || env.STUDENT_HASH_SECRET.length < 32) throw new ServiceError('NOT_CONFIGURED','Kairo registration secret is not configured.');
    try {
      if (new Wallet(env.ISSUER_PRIVATE_KEY).address !== getAddress(env.ISSUER_ADDRESS)) throw Error();
    } catch { throw new ServiceError('NOT_CONFIGURED','Kairo issuer key is missing or does not match its configured address.'); }
  }
}

export async function health(request, env, connectChain) {
  const dependencies = {};
  const probe = async (name, check) => {
    let timer;
    try {
      await Promise.race([Promise.resolve().then(check),new Promise((resolve,reject) => {
        timer = setTimeout(() => reject(new ServiceError('DEPENDENCY_TIMEOUT',`Kairo’s ${name} dependency timed out.`,name)),10000);
      })]);
      dependencies[name] = {status:'ok'};
    }
    catch (error) {
      const wrapped = error instanceof ServiceError ? error : new ServiceError(({d1:'DATABASE_ERROR',r2:'R2_ERROR',durableObject:'DURABLE_OBJECT_ERROR',rpc:'RPC_UNREACHABLE'})[name] || 'NOT_CONFIGURED', `Kairo’s ${name} dependency is unavailable.`,name);
      if (wrapped !== error) wrapped.cause = error;
      const response = errorResponse(wrapped,request,env);
      const {code,error:message,requestId} = await response.json();
      dependencies[name] = {status:'error',code,message,requestId};
    } finally { clearTimeout(timer); }
  };
  await Promise.all([
    probe('config', () => checkConfig(env,{writes:true})),
    probe('d1', async () => {
      await env.DB.prepare('SELECT e.group_id,e.claim_mode,e.event_starts_at,r.checked_in_by,r.claimed_at,r.participation_role FROM events e LEFT JOIN registrations r ON e.id=r.event_id LIMIT 0').all();
      await env.DB.prepare('SELECT id FROM organizer_drafts LIMIT 0').all();
    }),
    probe('r2', async () => { await env.MEDIA.get('health/readiness'); }),
    probe('durableObject', async () => {
      const response = await env.MINT.get(env.MINT.idFromName('sepolia-issuer')).fetch(new Request('https://mint.internal/health'));
      if (!response.ok || (await response.json()).ok !== true) throw new ServiceError('DURABLE_OBJECT_ERROR','Mint coordinator is unavailable.','durableObject');
    }),
    probe('rpc', async () => {
      const chain = await connectChain(env);
      if (await chain.provider.getCode(env.CONTRACT_ADDRESS) === '0x') throw new ServiceError('CONTRACT_MISMATCH','The configured contract is not deployed.','rpc');
      await chain.contract.nextEventId();
    })
  ]);
  const ok = Object.values(dependencies).every(value => value.status === 'ok');
  return Response.json({status:ok?'ok':'degraded',dependencies},{status:ok?200:503,headers:{'cache-control':'no-store'}});
}
