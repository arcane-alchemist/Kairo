import test from 'node:test';
import assert from 'node:assert/strict';
process.env.EXPO_PUBLIC_API_URL ||= 'https://kairo.test';
const {isAppUrl,isExternalUrl,isWalletUrl,routeFromLink,parseNativeRequest,nativeResultScript,SITE_ORIGIN} = await import('./shell.ts');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXuoAAAAASUVORK5CYII=';

test('only the production HTTPS origin can retain the native WebView bridge',()=>{
  assert(isAppUrl(SITE_ORIGIN+'/#issuer/studio'));
  for(const value of ['http://kairo-site-7fb.pages.dev/','https://kairo-site-7fb.pages.dev.evil.test/','javascript:alert(1)','file:///etc/passwd','https://evil.test/','https://user:pass@kairo-site-7fb.pages.dev'])assert(!isAppUrl(value),value);
});
test('native wallet launching permits only the official MetaMask connection routes',()=>{
  for(const value of ['metamask://connect/mwp?p=abc&c=1','https://metamask.app.link/connect/mwp?p=abc','https://link.metamask.io/connect'])assert(isWalletUrl(value),value);
  for(const value of ['intent://evil','metamask://send/0x123','https://evil.test/connect','https://metamask.app.link.evil.test/connect','https://metamask.app.link/dapp/evil.test','javascript:alert(1)'])assert(!isWalletUrl(value),value);
  assert(isExternalUrl('https://sepolia.etherscan.io/tx/0x123'));assert(!isExternalUrl('http://evil.test'));
});
test('deep links retain real routes and reject arbitrary content destinations',()=>{
  assert.equal(routeFromLink('kairo://drop/2'),'drop/2');assert.equal(routeFromLink(SITE_ORIGIN+'/?drop=2'),'drop/2');
  assert.equal(routeFromLink(SITE_ORIGIN+'/#issuer/studio'),'issuer/studio');assert.equal(routeFromLink('kairo://wallet-return'),null);
  assert.equal(routeFromLink('https://evil.test/#issuer/studio'),null);assert.equal(routeFromLink(SITE_ORIGIN+'/#drop/0'),null);
});
test('file messages validate source, PNG data, size and filename before writing to native storage',()=>{
  const request={id:'request-1',type:'save-file',data:png,name:'kairo-drop-2.png'};
  assert.deepEqual(parseNativeRequest(JSON.stringify(request),SITE_ORIGIN),request);
  for(const bad of [{...request,name:'../../private.png'},{...request,data:'data:text/html;base64,AAAA'},{...request,data:'data:image/png;base64,AAAA'},{...request,type:'execute'},{...request,id:'<script>'}])assert.throws(()=>parseNativeRequest(JSON.stringify(bad),SITE_ORIGIN));
  assert.throws(()=>parseNativeRequest(JSON.stringify(request),'https://evil.test'));assert.throws(()=>parseNativeRequest('x'.repeat(3000001),SITE_ORIGIN));
});
test('native reply scripts serialize content instead of executing it',()=>{
  const script=nativeResultScript('id',undefined,'";window.stolen=true;//');
  assert(script.includes('kairo-native-result'));assert(script.includes('\\";window.stolen=true;//'));assert(script.endsWith('true;'));
});

test('native chrome uses the exact sRGB equivalents of the website palette',async()=>{
  const {readFileSync}=await import('node:fs');const {COLORS}=await import('./shell.ts');const css=readFileSync(new URL('../../frontend/styles.css',import.meta.url),'utf8');
  const names={background:'bg',ink:'ink',paper:'paper',accent:'accent'};
  for(const [name,token] of Object.entries(names)){
    const match=css.match(new RegExp('--'+token+':oklch\\(([\\d.]+)% ([\\d.]+) ([\\d.]+)\\)'));assert(match);
    const L=Number(match[1])/100,C=Number(match[2]),h=Number(match[3])*Math.PI/180,a=C*Math.cos(h),b=C*Math.sin(h);
    const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;
    const rgb=[4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s];
    const hex='#'+rgb.map(v=>Math.round(Math.max(0,Math.min(1,v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055))*255).toString(16).padStart(2,'0')).join('');assert.equal(COLORS[name],hex,name);
  }
});

test('the USB test build trusts only its fixed loopback origin',async()=>{
  const {execFileSync}=await import('node:child_process');
  const output=execFileSync(process.execPath,['--input-type=module','-e',"import {SITE_ORIGIN,isAppUrl,isExternalUrl} from './src/shell.ts'; console.log(JSON.stringify({origin:SITE_ORIGIN,local:isAppUrl('http://127.0.0.1:8787/'),production:isAppUrl('https://kairo-site-7fb.pages.dev/'),other:isAppUrl('http://evil.test/'),externalHttp:isExternalUrl('http://evil.test/')}))"],{cwd:new URL('..',import.meta.url),env:{...process.env,EXPO_PUBLIC_KAIRO_LOCAL:'1',EXPO_PUBLIC_API_URL:'http://127.0.0.1:8787'},encoding:'utf8'});
  assert.deepEqual(JSON.parse(output),{origin:'http://127.0.0.1:8787',local:true,production:false,other:false,externalHttp:false});
});

test('missing or unsafe build origins fail closed instead of falling back to a hardcoded server',async()=>{
 const {execFileSync}=await import('node:child_process');
 for(const value of ['', 'http://192.0.2.1:8787','https://user:secret@kairo.test','https://kairo.test/nested']){
  const output=execFileSync(process.execPath,['--input-type=module','-e',"import {SITE_ORIGIN,WEBSITE_URL,isAppUrl} from './src/shell.ts'; console.log(JSON.stringify({origin:SITE_ORIGIN,url:WEBSITE_URL,allowed:isAppUrl('https://kairo.test/')}))"],{cwd:new URL('..',import.meta.url),env:{...process.env,EXPO_PUBLIC_KAIRO_LOCAL:'1',EXPO_PUBLIC_API_URL:value},encoding:'utf8'});
  assert.deepEqual(JSON.parse(output),{origin:'',url:'',allowed:false});
 }
});
