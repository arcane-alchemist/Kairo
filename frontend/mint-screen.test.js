import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const showTicket = source.slice(source.indexOf('async function showTicket('), source.indexOf('\nasync function connect()'));
test('QR claims show only pending status until confirmation, then the minted artwork', async () => {
  for (const status of ['queued', 'confirmed']) {
    const statusNode = {};
    const main = { innerHTML: '', querySelector: selector => selector === '#mint-status' && main.innerHTML.includes('id="mint-status"') ? statusNode : null };
    const context = vm.createContext({ main, modalBody: {}, modal: { open: false }, close() {}, clearInterval() {}, setInterval() {}, ticketTimer: null, ticketView: 0,
      esc: String, artwork: () => '<img src="hacktober.png">', location: { origin: 'https://kairo.test' }, window: {}, config: { contractAddress: 'contract' }, txLink: () => 'https://sepolia.test/tx',
      api: async () => ({ status, claimed_at: 1, wallet: 'wallet', token_id: '2' }),
    });
    await vm.runInContext(`${showTicket}\nshowTicket('ticket', {claimMode:'qr',title:'Hacktober',image:'hacktober.png'})`, context);
    assert.equal(main.innerHTML.includes('POAP Minted'), status === 'confirmed');
    assert.equal(main.innerHTML.includes('hacktober.png'), status === 'confirmed');
    assert.equal(main.innerHTML.includes('Add to MetaMask'), false);
    assert.equal(main.innerHTML.includes('ticket-qr'), false);
    assert.equal(main.innerHTML.includes('claim-mint'), false);
  }
});
test('Connect authenticates the wallet without starting a mint; Mint submits the real claim API', async () => {
  const nodes = Object.fromEntries(['claim-mint', 'claim-connect', 'claim-wallet', 'claim-consent','claim-consent-row'].map(id => [id, { checked: true }]));
  const main = { innerHTML: '', querySelector: selector => nodes[selector.slice(1)] };
  let submissions = 0, shown = 0;
  const context = vm.createContext({ main, modalBody: {}, session: null, connectedWallet: '', esc: String, artwork: () => '<img src="hacktober.png">', window: { ethereum: {} },
    busy: async (_, action) => action(), connect: async () => { context.session = { wallet: '0xattendee' }; }, signerOnSepolia: async () => {},
    api: async () => context.session, toast() {},
    post: async path => { assert.equal(path, '/events/2/claim'); submissions++; return { ticket: 'ticket' }; },
    localStorage: { getItem: () => '[]', setItem() { throw Error('Device storage blocked'); } }, showTicket: async () => { shown++; },
  });
  vm.runInContext(source.slice(source.indexOf('function claimForm('), source.indexOf('\nfunction rsvpForm(')) + "\nclaimForm({id:2,title:'Hacktober'},true)", context);
  assert.match(main.innerHTML, /id="claim-mint"[^>]*hidden[^>]*disabled/);
  assert.equal(main.innerHTML.includes('hacktober.png'), false);
  await assert.rejects(nodes['claim-mint'].onclick(), /Connect your MetaMask wallet first/);
  assert.equal(submissions, 0);
  await nodes['claim-connect'].onclick();
  assert.equal(submissions, 0);
  assert.equal(nodes['claim-mint'].disabled, false);
  assert.equal(nodes['claim-mint'].hidden, false);
  assert.equal(nodes['claim-connect'].hidden, true);
  await nodes['claim-mint'].onclick();
  assert.equal(submissions, 1);
  assert.equal(shown, 1);
});

test('an explicitly connected authenticated wallet shows Mint without another signature', () => {
  const nodes={};const main={innerHTML:'',querySelector: selector => nodes[selector] ||= {}};
  const context=vm.createContext({main,connectedWallet:'0xattendee',session:{wallet:'0xattendee'},esc:String,window:{ethereum:{}},busy(){}});
  vm.runInContext(source.slice(source.indexOf('function claimForm('),source.indexOf('\nfunction rsvpForm('))+"\nclaimForm({id:2,title:'Hacktober'},true)",context);
  assert.match(main.innerHTML,/Connected: 0xattendee/);
  assert.doesNotMatch(main.innerHTML,/id="claim-mint"[^>]*(hidden|disabled)/);
  assert.match(main.innerHTML,/id="claim-connect"[^>]*hidden/);
});
test('wallet connects and switches to Sepolia before requesting the sign-in signature', async () => {
  const steps=[];const signer={getAddress:async()=> '0xwallet',signMessage:async()=>{steps.push('sign');return 'signature';}};
  class Provider {async send(){steps.push('accounts');}async getSigner(){return signer;}}
  const injected={request:async({method})=>{steps.push(method);return method==='eth_chainId'?'0x1':method==='eth_accounts'?['0xwallet']:null;}};
  const context=vm.createContext({BrowserProvider:Provider,connectedWallet:'0xwallet',walletRevision:0,logoutRequest:Promise.resolve(),walletClient:{provider:injected},
    post:async(path)=>{steps.push(path);return {message:'Sign in'};},api:async()=>({wallet:'0xwallet'}),document:{querySelector:()=>({})},short:String,toast(){},session:null});
  const start=source.indexOf('async function connect()');
  await vm.runInContext(source.slice(start,source.indexOf("\ndocument.querySelector('#wallet').onclick",start))+'\nconnect()',context);
  assert(steps.indexOf('wallet_switchEthereumChain')<steps.indexOf('sign'));
  assert(steps.indexOf('sign')<steps.indexOf('/auth/verify'));
});
test('a late mint response cannot replace a newer ticket screen', async () => {
  let resolveFirst,requests=0;const node={};
  const main={innerHTML:'',querySelector:selector=>selector==='#mint-status'&&main.innerHTML.includes('id="mint-status"')?node:null};
  const context=vm.createContext({main,modalBody:{},modal:{open:false},close(){},clearInterval(){},setInterval(){},ticketTimer:null,ticketView:0,esc:String,window:{},artwork:()=>'<img>',
    api:async()=>++requests===1?new Promise(resolve=>{resolveFirst=resolve;}):{status:'pending',claimed_at:1}});
  vm.runInContext(showTicket,context);
  const first=vm.runInContext("showTicket('first',{claimMode:'qr',title:'First'})",context);
  await vm.runInContext("showTicket('second',{claimMode:'qr',title:'Second'})",context);
  resolveFirst({status:'confirmed'});await first;
  assert(main.innerHTML.includes('Second'));assert(!main.innerHTML.includes('POAP Minted'));
});

test('read-only wallet connection requests accounts without signatures, minting or automatic network changes', async () => {
  const methods = [];
  const context = vm.createContext({ connectedWallet: '', session:null, walletRevision:0, walletClient:{connect:async()=>{methods.push('MetaMask permission flow');return '0xwallet';}}, getAddress: value => value, short: value => value,
    window: { ethereum: { request: async ({ method }) => { methods.push(method); return ['0xwallet']; } } },
    document: { querySelector: () => ({}) }, updateNetwork: async () => {} });
  const start = source.indexOf('async function connectWallet()');
  await vm.runInContext(source.slice(start, source.indexOf('\nasync function updateNetwork()', start)) + '\nconnectWallet()', context);
  assert.deepEqual(methods, ['MetaMask permission flow']);
  assert.equal(context.connectedWallet, '0xwallet');
});


test('a late account approval cannot replace a connection invalidated by a wallet change',async()=>{
  const context=vm.createContext({connectedWallet:'',session:null,walletRevision:0,document:{querySelector:()=>({})},getAddress:value=>value,short:String,updateNetwork:async()=>{}});
  context.walletClient={connect:async()=>{context.walletRevision++;return '0xwallet';},disconnect(){}};
  const start=source.indexOf('async function connectWallet()');
  await assert.rejects(vm.runInContext(source.slice(start,source.indexOf('\nasync function updateNetwork()',start))+'\nconnectWallet()',context),/Wallet changed/);
  assert.equal(context.connectedWallet,'');
});

test('updateNetwork hides Sepolia connected and header places wallet on the top right side', async () => {
  const node = { hidden: false, textContent: '' };
  const context = vm.createContext({
    connectedWallet: '0x9405000000000000000000000000000000000aE0',
    activeChain: '',
    walletClient: { provider: { request: async () => '0xaa36a7' } },
    document: { querySelector: sel => sel === '#wallet-network' ? node : null }
  });
  const start = source.indexOf('async function updateNetwork()');
  const end = source.indexOf('\ndocument.querySelector(\'#wallet-network\').onclick', start);
  await vm.runInContext(source.slice(start, end) + '\nupdateNetwork()', context);
  assert.equal(node.hidden, true);

  context.walletClient.provider.request = async () => '0x1';
  await vm.runInContext('updateNetwork()', context);
  assert.equal(node.hidden, false);
  assert.equal(node.textContent, 'Switch to Sepolia');

  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const walletPos = html.indexOf('id="wallet"');
  const installPos = html.indexOf('id="install-app"');
  const networkPos = html.indexOf('id="wallet-network"');
  assert.ok(walletPos > installPos && walletPos > networkPos, 'wallet address button is on the top right side');
});
