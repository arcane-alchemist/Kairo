export class ApiError extends Error {
  constructor(message, code, status = 0) { super(message); this.code = code; this.status = status; }
}

export function createApiClient({fetchRequest = fetch, timeoutMs = 12000, wait = ms => new Promise(resolve => setTimeout(resolve,ms)), retryDelays = [350,1000]} = {}) {
  return async function request(path, options = {}) {
    const {allowDegraded,quiet,...fetchOptions}=options;
    const get = (options.method || 'GET').toUpperCase() === 'GET';
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let failure;
      try {
        const response = await fetchRequest(`/api${path}`, {credentials:'same-origin',...fetchOptions,signal:controller.signal,
          headers:{'Content-Type':'application/json',...options.headers}});
        let data;
        try { data = await response.json(); }
        catch { throw new ApiError('Kairo had a problem (unreadable response). Try again.','INVALID_RESPONSE',response.status); }
        if (response.ok || allowDegraded && path === '/health' && response.status === 503 && data.dependencies) return data;
        const code = data.code || 'REQUEST_FAILED';
        const actionable=['ISSUER_NOT_AUTHORIZED','CONTRACT_MISMATCH','RELAYER_MISMATCH','RELAYER_UNFUNDED','RELAYER_NOT_CONFIGURED','MEDIA_NOT_CONFIGURED','MEDIA_UNREACHABLE','MEDIA_MISMATCH'].includes(code);
        const message = actionable ? data.error : response.status === 401 || code === 'WRONG_NETWORK'
          ? 'Your wallet or the network is wrong. Use Connect wallet or the network switch in the header.'
          : response.status >= 500 ? `Kairo had a problem. Try again.${code === 'NOT_CONFIGURED' ? ' Its configuration needs attention.' : ''}`
          : data.error || `Kairo could not complete this request (${response.status}).`;
        throw new ApiError(message,code,response.status);
      } catch (error) {
        failure = error instanceof ApiError ? error : new ApiError('Can’t reach Kairo. Check your connection, then retry.','UNREACHABLE');
      } finally { clearTimeout(timeout); }
      const retryable = failure.status === 0 || failure.code === 'INVALID_RESPONSE' || failure.status >= 500;
      if (!get || !retryable || ['NOT_CONFIGURED','CONTRACT_MISMATCH'].includes(failure.code) || attempt >= retryDelays.length) throw failure;
      await wait(retryDelays[attempt]);
    }
  };
}
