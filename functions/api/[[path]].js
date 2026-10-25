const WORKER = 'https://kairo.aakritigupta7227.workers.dev';
export async function onRequest({ request }) {
  const url = new URL(request.url);
  if (!['GET','HEAD'].includes(request.method) && request.headers.get('origin') !== url.origin) {
    return Response.json({ error: 'Request origin is not allowed' }, { status: 403 });
  }
  const target = new URL(url.pathname + url.search, WORKER);
  const headers = new Headers(request.headers);
  headers.set('origin', WORKER);
  headers.delete('host');
  const upstream = await fetch(new Request(target, { method: request.method, headers,
    body: ['GET','HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual', duplex: 'half' }));
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
