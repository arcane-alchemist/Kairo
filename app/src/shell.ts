export const SITE_ORIGIN = 'https://kairo-site-7fb.pages.dev';
export const WEBSITE_URL = SITE_ORIGIN + '/';
// sRGB equivalents of the live website’s OKLCH tokens.
export const COLORS = { background: '#e7ddf6', ink: '#321846', paper: '#faf7f1', accent: '#d5f161' };

export function isAppUrl(value: string) {
  try { const url = new URL(value); return url.origin === SITE_ORIGIN && !url.username && !url.password; } catch { return false; }
}

export function isWalletUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    return (url.protocol === 'metamask:' && ['connect','mmsdk'].includes(url.hostname)) ||
      (url.protocol === 'https:' && ['link.metamask.io','metamask.app.link'].includes(url.hostname) && /^\/(connect|mmsdk)(\/|$)/.test(url.pathname));
  } catch { return false; }
}

export function isExternalUrl(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}

export function routeFromLink(value: string): string | null {
  try {
    const url = new URL(value, WEBSITE_URL);
    if (url.protocol === 'kairo:' && ['wallet-return','return'].includes(url.hostname)) return null;
    if (url.protocol === 'kairo:') {
      const route = (url.hostname + url.pathname).replace(/^\/+|\/+$/g,'');
      if (/^drop\/[1-9]\d*$/.test(route) || /^ticket\/[a-f0-9-]{36}$/i.test(route)) return route;
      return null;
    }
    if (!isAppUrl(url.href)) return null;
    const drop = url.searchParams.get('drop');
    if (drop && /^[1-9]\d*$/.test(drop)) return 'drop/' + drop;
    const hash = url.hash.slice(1);
    return /^(?:about\/(?:proof|case-studies)|issuer\/(?:studio|guide|manage)|collector\/(?:gallery|collectors|collection)|builders\/(?:build|documentation)|tickets|drop\/[1-9]\d*|ticket\/[a-f0-9-]{36})$/i.test(hash) ? hash : null;
  } catch { return null; }
}

export type NativeRequest = { id: string; type: 'open-wallet'; url: string } |
  { id: string; type: 'save-file'; name: string; data: string } |
  { id: string; type: 'back-root' };

export function parseNativeRequest(data: string, pageUrl: string): NativeRequest {
  if (!isAppUrl(pageUrl) || data.length > 3_000_000) throw Error('Untrusted app message');
  const input: unknown = JSON.parse(data);
  if (!input || typeof input !== 'object') throw Error('Invalid app message');
  const message = input as Record<string, unknown>;
  if (typeof message.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(message.id)) throw Error('Invalid request ID');
  if (message.type === 'back-root') return {id:message.id,type:message.type};
  if (message.type === 'open-wallet' && typeof message.url === 'string' && message.url.length <= 8192 && isWalletUrl(message.url)) return {id:message.id,type:message.type,url:message.url};
  if (message.type === 'save-file' && typeof message.name === 'string' && /^kairo-(?:ticket|drop)-[a-zA-Z0-9-]{1,80}\.png$/.test(message.name) && typeof message.data === 'string' && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(message.data) && message.data.split(',')[1].length % 4 === 0) return {id:message.id,type:message.type,name:message.name,data:message.data};
  throw Error('Unsupported app request');
}

export function nativeResultScript(id: string, result?: unknown, error?: string) {
  return `window.dispatchEvent(new CustomEvent('kairo-native-result',{detail:${JSON.stringify({id,result,error})}}));true;`;
}
