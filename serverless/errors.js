export class ServiceError extends Error {
  constructor(code, message, dependency = 'config', status = 503) {
    super(message); this.code = code; this.dependency = dependency; this.status = status;
  }
}

export function errorResponse(error, request, env = {}) {
  const requestId = crypto.randomUUID();
  const message = String(error?.message || error);
  const code = error instanceof ServiceError ? error.code
    : /D1_|SQLITE|SQL_|no such (?:table|column)|database/i.test(message) ? 'DATABASE_ERROR'
    : ['NETWORK_ERROR','SERVER_ERROR','TIMEOUT','UNKNOWN_ERROR'].includes(error?.code) || /fetch failed|network|ECONN|connect|RPC|timed? ?out/i.test(message) ? 'RPC_UNREACHABLE'
    : error?.code === 'CALL_EXCEPTION' ? 'CONTRACT_MISMATCH' : 'INTERNAL_ERROR';
  const publicMessage = error instanceof ServiceError ? error.message : ({
    DATABASE_ERROR:'Kairo could not read its database. Please try again.',
    RPC_UNREACHABLE:'Kairo cannot reach the blockchain network. Please try again.',
    CONTRACT_MISMATCH:'Kairo’s contract configuration needs attention.',
    INTERNAL_ERROR:'Kairo had a problem. Please try again.'
  })[code];
  const redact = value => {
    let text = String(value || '');
    for (const [key, secret] of Object.entries(env)) if (/SECRET|PRIVATE_KEY|RPC_URL/.test(key) && typeof secret === 'string' && secret) text = text.replaceAll(secret, '[redacted]');
    return text.replace(/https?:\/\/[^\s"<>]+/g,'[url]').replace(/(?:0x)?[a-f0-9]{64}/gi,'[redacted]').slice(0,4000);
  };
  console.error(JSON.stringify({event:'request_failed',requestId,method:request.method,path:new URL(request.url).pathname,code,
    error:{name:error?.name,code:error?.code,message:redact(message),cause:redact(error?.cause?.message),stack:redact(error?.stack)}}));
  return Response.json({error:publicMessage,code,requestId}, {status:error instanceof ServiceError ? error.status : 503,headers:{'cache-control':'no-store'}});
}
