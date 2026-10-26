const requests = new Map();
export function isNativeApp(win = window) {
  return /KairoAndroid\//.test(win.navigator?.userAgent || '') && typeof win.ReactNativeWebView?.postMessage === 'function';
}
export function nativeRequest(type, payload = {}, win = window) {
  if (!isNativeApp(win)) return Promise.reject(Error('This action requires the Android app.'));
  const id = win.crypto.randomUUID();
  return new Promise((resolve,reject) => {
    const timeout = win.setTimeout(() => { requests.delete(id); reject(Error('The Android action timed out. Try again.')); },120000);
    requests.set(id,{resolve,reject,timeout,win});
    try { win.ReactNativeWebView.postMessage(JSON.stringify({...payload,id,type})); }
    catch (error) {requests.delete(id);win.clearTimeout(timeout);reject(error);}
  });
}
export function mountNative(win = window, doc = document) {
  if (!isNativeApp(win)) return;
  doc.documentElement.dataset.native = 'android';
  const initialHistory = win.history.length;
  win.addEventListener('kairo-native-result',event => {
    const request = requests.get(event.detail?.id); if (!request) return;
    requests.delete(event.detail.id); request.win.clearTimeout(request.timeout);
    if (event.detail.error) request.reject(Error(event.detail.error)); else request.resolve(event.detail.result);
  });
  win.addEventListener('kairo-android-back',() => {
    const dialog = [...doc.querySelectorAll('dialog')].find(item => item.open);
    if (dialog) { dialog.close(); return; }
    const menu = doc.querySelector('.menu-button[aria-expanded="true"]');
    if (menu) { menu.click(); return; }
    const expanded = [...doc.querySelectorAll('details[open]')];
    if (expanded.length) { expanded.forEach(item => {item.open=false;}); return; }
    if (doc.fullscreenElement) { doc.exitFullscreen().catch(() => {}); return; }
    if (win.location.hash && win.location.hash !== '#') {
      if (win.history.length > initialHistory) win.history.back(); else win.location.hash = '';
      return;
    }
    win.ReactNativeWebView.postMessage(JSON.stringify({id:win.crypto.randomUUID(),type:'back-root'}));
  });
}
export async function downloadQR(data, name, win = window, doc = document) {
  if (isNativeApp(win)) return nativeRequest('save-file',{data,name},win);
  const link = doc.createElement('a'); link.href = data; link.download = name; link.click();
}
