export const PAGE_HEADERS = {
  'Cache-Control': 'no-cache',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data: blob:; media-src 'self' https: data: blob:; connect-src 'self' https: wss:; worker-src 'self' blob:; frame-src 'self' https://auth.privy.io https://*.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'X-Frame-Options': 'DENY'
};
export const SVG_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox; base-uri 'none'";
