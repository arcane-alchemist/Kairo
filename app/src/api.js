import { DEFAULT_API } from './model';
export const WEBSITE_URL = 'https://kairo-site-7fb.pages.dev';
export const API_URL = process.env.EXPO_PUBLIC_API_URL || DEFAULT_API;
export async function api(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${API_URL}/api${path}`, { signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Origin: new URL(API_URL).origin },
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || `Request failed (${response.status})`);
    return result;
  } finally { clearTimeout(timeout); }
}
