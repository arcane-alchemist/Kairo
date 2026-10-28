import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const showTicket = source.slice(source.indexOf('async function showTicket('), source.indexOf('\nfunction walletHeader()'));
test('QR claims show only pending status until confirmation, then the minted artwork', async () => {
  for (const status of ['queued', 'confirmed']) {
    const statusNode = {};
    const main = { innerHTML: '', querySelector: selector => selector === '#mint-status' && main.innerHTML.includes('id="mint-status"') ? statusNode : null };
    const context = vm.createContext({config:{chainName:'Sepolia'}, main, modalBody: {}, modal: { open: false }, close() {}, clearInterval() {}, setInterval() {}, ticketTimer: null, ticketView: 0,
      date:String,time:String,esc: String, artwork: () => '<img src="hacktober.png">', location: { origin: 'https://kairo.test' }, window: {}, config: { contractAddress: 'contract' }, txLink: () => 'https://sepolia.test/tx',
      api: async () => ({ status, claimed_at: 1, wallet: 'wallet', token_id: '2' }),
    });
    await vm.runInContext(`${showTicket}\nshowTicket('ticket', {claimMode:'qr',title:'Hacktober',description:'A day of building together.',image:'hacktober.png'})`, context);
    assert.equal(main.innerHTML.includes('POAP minted!'), status === 'confirmed');
    assert.equal(main.innerHTML.includes('A day of building together.'), status === 'confirmed');
    assert.equal(main.innerHTML.includes('hacktober.png'), status === 'confirmed');
    assert.equal(main.innerHTML.includes('Add to MetaMask'), false);
    assert.equal(main.innerHTML.includes('ticket-qr'), false);
    assert.equal(main.innerHTML.includes('claim-mint'), false);
  }
});
test('claim page directs connection to the header; signed-in Mint submits the claim API', async () => {
  const nodes = Object.fromEntries(['claim-mint', 'claim-connect', 'claim-wallet', 'claim-consent','claim-consent-row'].map(id => [id, { checked: true }]));
  const main = { innerHTML: '', querySelector: selector => nodes[selector.slice(1)] };
  let submissions = 0, shown = 0;
  const context = vm.createContext({config:{chainName:'Sepolia'}, main, modalBody: {}, session: null, connectedWallet: '', date:String,time:String,esc: String, artwork: () => '<img src="hacktober.png">', window: { ethereum: {} },
    busy: async (_, action) => action(), headerConnect: () => {}, signerOnSepolia: async () => {},
    api: async () => context.session, toast() {},
    location:{href:'https://kairo.test/?qr=token',hash:''},URL,
    post: async path => { assert.equal(path, '/events/2/claim'); submissions++; return { ticket: 'ticket' }; },
    showTicket:async()=>{shown++;},
  });
  vm.runInContext(source.slice(source.indexOf('function claimForm('), source.indexOf('\nasync function showTicket(')) + "\nclaimForm({id:2,title:'Hacktober'},true)", context);
  assert.match(main.innerHTML, /id="claim-mint"[^>]*hidden[^>]*disabled/);
  assert.equal(main.innerHTML.includes('hacktober.png'), false);
  await assert.rejects(nodes['claim-mint'].onclick(), /Connect your wallet first/);
  assert.equal(submissions, 0);
  nodes['claim-connect'].onclick();
  assert.equal(submissions,0);
  context.session={wallet:'0xattendee'};
  vm.runInContext("claimForm({id:2,title:'Hacktober'},true)",context);
  await nodes['claim-mint'].onclick();
  assert.equal(submissions, 1);
  assert.equal(context.location.hash,'claim/ticket/2');
});

test('an explicitly connected authenticated wallet shows Mint without another signature', () => {
  const nodes={};const main={innerHTML:'',querySelector: selector => nodes[selector] ||= {}};
  const context=vm.createContext({date:String,time:String,config:{chainName:'Sepolia'},main,connectedWallet:'0xattendee',session:{wallet:'0xattendee'},date:String,time:String,esc:String,window:{ethereum:{}},busy(){},headerConnect(){}});
  vm.runInContext(source.slice(source.indexOf('function claimForm('),source.indexOf('\nasync function showTicket('))+"\nclaimForm({id:2,title:'Hacktober'},true)",context);
  assert.match(main.innerHTML,/Connected: 0xattendee/);
  assert.doesNotMatch(main.innerHTML,/id="claim-mint"[^>]*(hidden|disabled)/);
  assert.match(main.innerHTML,/id="claim-connect"[^>]*hidden/);
});
test('wallet connects and switches to Sepolia before requesting the sign-in signature', async () => {
  const steps=[];const signer={getAddress:async()=> '0xwallet',signMessage:async()=>{steps.push('sign');return 'signature';}};
  class Provider {async send(){steps.push('accounts');}async getSigner(){return signer;}}
  let chain='0x1';const injected={request:async({method})=>{steps.push(method);if(method==='wallet_switchEthereumChain')chain='0xaa36a7';return method==='eth_chainId'?chain:method==='eth_accounts'?['0xwallet']:null;}};
  const context=vm.createContext({BrowserProvider:Provider,connectedWallet:'0xwallet',walletRevision:0,signInRequest:Promise.resolve(),logoutRequest:Promise.resolve(),walletClient:{provider:injected},
    config:{chainId:11155111,chainName:'Sepolia'},chainHex:()=> '0xaa36a7',connectWallet:async()=>{},walletHeader(){},updateNetwork:async()=>{context.activeChain=await injected.request({method:'eth_chainId'});},
    post:async(path)=>{steps.push(path);return {message:'Sign in'};},api:async()=>({wallet:'0xwallet'}),document:{querySelector:()=>({})},short:String,toast(){},session:null});
  const start=source.indexOf('async function connect(accountChanged = false)');
  await vm.runInContext(source.slice(source.indexOf('async function switchNetwork()'),source.indexOf('function headerConnect()'))+source.slice(start,source.indexOf("\ndocument.querySelector('#wallet').onclick",start))+'\nconnect()',context);
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
  assert(main.innerHTML.includes('Second'));assert(!main.innerHTML.includes('POAP minted!'));
});

test('read-only wallet connection requests accounts without signatures, minting or automatic network changes', async () => {
  const methods = [];
  const context = vm.createContext({ chainHex(){},connectedWallet: '', session:null, walletRevision:0, chooseWallet:async()=> 'metamask',walletClient:{connect:async()=>{methods.push('MetaMask permission flow');return '0xwallet';}}, getAddress: value => value, short: value => value,
    window: { ethereum: { request: async ({ method }) => { methods.push(method); return ['0xwallet']; } } },
    document: { querySelector: () => ({}) }, updateNetwork: async () => {} });
  const start = source.indexOf('async function connectWallet()');
  await vm.runInContext(source.slice(start, source.indexOf('\nasync function updateNetwork()', start)) + '\nconnectWallet()', context);
  assert.deepEqual(methods, ['MetaMask permission flow']);
  assert.equal(context.connectedWallet, '0xwallet');
});


test('a late account approval cannot replace a connection invalidated by a wallet change',async()=>{
  const context=vm.createContext({chainHex(){},connectedWallet:'',session:null,walletRevision:0,chooseWallet:async()=> 'metamask',document:{querySelector:()=>({})},getAddress:value=>value,short:String,updateNetwork:async()=>{}});
  context.walletClient={connect:async()=>{context.walletRevision++;return '0xwallet';},disconnect(){}};
  const start=source.indexOf('async function connectWallet()');
  await assert.rejects(vm.runInContext(source.slice(start,source.indexOf('\nasync function updateNetwork()',start))+'\nconnectWallet()',context),/Wallet changed/);
  assert.equal(context.connectedWallet,'');
});

test('updateNetwork shows the active network and flags a mismatch and header places wallet on the top right side', async () => {
  const node = { hidden: false, textContent: '',classList:{toggle(){}} };
  const context = vm.createContext({
    connectedWallet: '0x9405000000000000000000000000000000000aE0',
    activeChain:'',session:{wallet:'0x9405000000000000000000000000000000000aE0'},config:{chainId:11155111,chainName:'Sepolia'},short:String,connectionState(){},
    walletClient: { provider: { request: async () => '0xaa36a7' } },
    document: { querySelector: sel => sel === '#wallet-network' ? node : {} }
  });
  const start = source.indexOf('async function updateNetwork()');
  const end = source.indexOf('\ndocument.querySelector(\'#wallet-network\').onclick', start);
  await vm.runInContext(source.slice(source.indexOf('function walletHeader()'),source.indexOf('async function switchNetwork()'))+source.slice(start, end) + '\nupdateNetwork()', context);
  assert.equal(node.hidden,false);assert.equal(node.textContent,'Sepolia');assert.equal(node.disabled,true);

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

test('unknown chain is added from runtime configuration and then explicitly switched',async()=>{
 let chain='0x1',added=false;const methods=[];const network={chainId:'0xaa36a7',rpcUrls:['https://public-rpc.test']};
 const context=vm.createContext({config:{chainName:'Sepolia',walletNetwork:network},chainHex:()=>network.chainId,activeChain:chain,
  walletClient:{provider:{request:async({method,params})=>{methods.push(method);if(method==='eth_chainId')return chain;if(method==='wallet_addEthereumChain'){assert.equal(params[0],network);added=true;}if(method==='wallet_switchEthereumChain'){if(!added)throw Object.assign(Error('Unknown chain'),{code:4902});chain=network.chainId;}}}},
  updateNetwork:async()=>{context.activeChain=chain;}
 });
 await vm.runInContext(source.slice(source.indexOf('async function switchNetwork()'),source.indexOf('function headerConnect()'))+'\nswitchNetwork()',context);
 assert.deepEqual(methods,['eth_chainId','wallet_switchEthereumChain','wallet_addEthereumChain','wallet_switchEthereumChain']);assert.equal(chain,network.chainId);
});
