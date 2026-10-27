import {pathToFileURL} from 'node:url';

export async function smokeLocal(baseUrl, fetchRequest = fetch) {
  const base = new URL(baseUrl);
  if (!['localhost','127.0.0.1','[::1]'].includes(base.hostname)) throw Error('smoke:local accepts a loopback dev server only.');
  const failures = [];
  for (const path of ['/api/config','/api/health','/api/events']) {
    try {
      let response;
      try { response = await fetchRequest(new URL(path,base),{signal:AbortSignal.timeout(20000)}); }
      catch { throw Error(`${path}: cannot reach the local Worker. Start npm run dev and check its output.`); }
      let data;
      try { data = await response.json(); } catch { throw Error(`${path}: expected JSON, received an unreadable response.`); }
      if (!response.ok) {
        const failed = data.dependencies && Object.entries(data.dependencies).filter(([,value])=>value.status !== 'ok').map(([name,value])=>`${name}: ${value.code}`).join(', ');
        throw Error(`${path}: HTTP ${response.status}; ${failed || data.code || 'request failed'}`);
      }
      if (path === '/api/config' && (!data.chainId || !data.contractAddress || !data.walletNetwork?.rpcUrls?.length || !Array.isArray(data.categories))) throw Error('Runtime config is incomplete.');
      if (path === '/api/health' && (data.status !== 'ok' || Object.values(data.dependencies || {}).some(value=>value.status !== 'ok'))) throw Error('Health check reports a degraded dependency.');
      if (path === '/api/events' && !Array.isArray(data)) throw Error('Events response must be an array.');
      console.log(`PASS ${path} (${response.status})`);
    } catch (error) { failures.push(error.message); }
  }
  if (failures.length) throw Error(failures.join('\n'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await smokeLocal(process.env.KAIRO_LOCAL_URL || 'http://localhost:8787'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
