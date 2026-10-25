import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import QRCode from 'qrcode';
import { api, API_URL, WEBSITE_URL } from './src/api';
import { mintStatus, parseCode, searchDrops } from './src/model';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
const tabs = [['Collection','▱'],['Explore','⌕'],['Dispenser','▦'],['Notifications','♧'],['Settings','☷']];
const purple = '#564584';
const short = value => value ? value.slice(0,8) + '…' + value.slice(-6) : '';
const date = seconds => new Date(seconds*1000).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
const time = seconds => new Date(seconds*1000).toLocaleString();
const walletPattern = /^0x[\da-fA-F]{40}$/;
function Button({ title, onPress, secondary, disabled }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button,secondary && s.secondary,disabled && {opacity:.5}]}><Text style={[s.buttonText,secondary && {color:purple}]}>{title}</Text></Pressable>; }
function Field({ placeholder, value, onChangeText, ...props }) { return <TextInput style={s.input} placeholderTextColor="#afa3d5" placeholder={placeholder} value={value} onChangeText={onChangeText} {...props}/>; }
function Empty({ title, text }) { return <View style={s.empty}><Text style={s.emptyIcon}>✧</Text><Text style={s.emptyTitle}>{title}</Text><Text style={s.muted}>{text}</Text></View>; }
function QR({ value }) {
  const matrix = QRCode.create(value, { errorCorrectionLevel:'M' }).modules;
  let path = ''; for(let y=0;y<matrix.size;y++)for(let x=0;x<matrix.size;x++)if(matrix.get(y,x))path += `M${x+4} ${y+4}h1v1h-1z`;
  return <View style={s.qr}><Svg width={220} height={220} viewBox={`0 0 ${matrix.size+8} ${matrix.size+8}`}><Path d={`M0 0h${matrix.size+8}v${matrix.size+8}H0z`} fill="white"/><Path d={path} fill={purple}/></Svg></View>;
}
async function readTickets() {
  // Tickets are bearer credentials: native devices store them in encrypted storage.
  const raw = Platform.OS === 'web' ? sessionStorage.getItem('kairo-tickets') : await SecureStore.getItemAsync('kairo-tickets');
  return JSON.parse(raw || '[]');
}
async function storeTickets(tickets) {
  const raw = JSON.stringify(tickets);
  if(Platform.OS === 'web')sessionStorage.setItem('kairo-tickets',raw); else await SecureStore.setItemAsync('kairo-tickets',raw);
}
export default function App() { return <SafeAreaProvider><Home/></SafeAreaProvider>; }
function Home() {
  const [ready,setReady] = useState(false), [account,setAccount] = useState(''), [address,setAddress] = useState('');
  const [profile,setProfile] = useState({}), [tab,setTab] = useState('Collection');
  const [drops,setDrops] = useState([]), [collection,setCollection] = useState([]), [collectorCollection,setCollectorCollection] = useState([]), [tickets,setTickets] = useState([]), [statuses,setStatuses] = useState([]);
  const [favorites,setFavorites] = useState([]), [following,setFollowing] = useState([]), [moments,setMoments] = useState([]);
  const [query,setQuery] = useState(''), [selected,setSelected] = useState(null), [dialog,setDialog] = useState(null), [error,setError] = useState(''), [loading,setLoading] = useState(false);
  const [student,setStudent] = useState(''), [consent,setConsent] = useState(false), [code,setCode] = useState(''), [caption,setCaption] = useState(''), [photo,setPhoto] = useState(null);
  const [camera,setCamera] = useState(false), [permission,requestPermission] = useCameraPermissions();
  useEffect(() => { (async()=>{try {
    const saved = JSON.parse(await AsyncStorage.getItem('kairo-profile') || '{}'); setProfile(saved);setAccount(saved.wallet||'');setAddress(saved.wallet||'');
    setTickets(await readTickets()); setFavorites(JSON.parse(await AsyncStorage.getItem('kairo-favorites')||'[]'));
    setFollowing(JSON.parse(await AsyncStorage.getItem('kairo-following')||'[]'));setMoments(JSON.parse(await AsyncStorage.getItem('kairo-moments')||'[]'));
  }catch(e){setError(e.message)}finally{setReady(true)}})(); },[]);
  const run = async action => {setLoading(true);setError('');try{await action()}catch(e){setError(e.message)}finally{setLoading(false)}};
  const refresh = async () => {
    const data = await api('/events');setDrops(data);
    if(account)setCollection(await api('/collection?wallet='+encodeURIComponent(account)));else setCollection([]);
    const results = await Promise.all(tickets.map(async ticket => {try{return {...await api('/tickets/'+ticket.id), title:data.find(d=>d.id===ticket.eventId)?.title||'Drop #'+ticket.eventId}}catch(e){return {id:ticket.id,error:e.message,title:'Ticket unavailable'}}}));
    setStatuses(results);
    if (Platform.OS !== 'web' && (await Notifications.getPermissionsAsync()).granted) {
      const notified = JSON.parse(await AsyncStorage.getItem('kairo-notified') || '[]');
      for (const ticket of results) if (ticket.status === 'confirmed' && !notified.includes(ticket.id)) {
        await Notifications.scheduleNotificationAsync({ content: { title: 'Your Kairo collectible is minted', body: ticket.title }, trigger: null });
        notified.push(ticket.id);
        await AsyncStorage.setItem('kairo-notified', JSON.stringify(notified));
      }
    }
  };
  useEffect(()=>{if(!ready)return;run(refresh);const timer=setInterval(()=>refresh().catch(e=>setError(e.message)),15000);return()=>clearInterval(timer)},[ready,account,tickets]);
  async function setWallet() {
    if(!walletPattern.test(address.trim()) || /^0x0{40}$/.test(address.trim()))throw Error('Enter a valid Ethereum wallet address.');
    const next={...profile,wallet:address.trim()};await AsyncStorage.setItem('kairo-profile',JSON.stringify(next));setProfile(next);setAccount(next.wallet);setDialog(null);
  }
  async function favorite(id) {const next=favorites.includes(id)?favorites.filter(v=>v!==id):[...favorites,id];await AsyncStorage.setItem('kairo-favorites',JSON.stringify(next));setFavorites(next)}
  function openDrop(drop){setSelected(drop);setStudent('');setConsent(false);setDialog('drop')}
  async function processCode(value) {
    const parsed=parseCode(value);setCamera(false);
    if(parsed.type==='wallet'){setAddress(parsed.value);setDialog('account');return;}
    if(parsed.type==='ticket'){
      const ticket=await api('/tickets/'+parsed.value);
      if(!tickets.some(t=>t.id===parsed.value)){const next=[...tickets,{id:parsed.value,eventId:ticket.event_id}];await storeTickets(next);setTickets(next)}
      setSelected({...ticket,title:drops.find(d=>d.id===ticket.event_id)?.title||'Your ticket'});setDialog('ticket');return;
    }
    const drop=drops.find(d=>d.id===parsed.value);if(!drop)throw Error('Drop not found. Refresh Explore and try again.');openDrop(drop);
  }
  async function scan(){const result=permission?.granted?permission:await requestPermission();if(!result.granted)throw Error('Camera permission is required for QR scanning. You can enter a code instead.');setDialog('scan');setCamera(true)}
  async function rsvp(){
    if(!account)throw Error('Set your wallet address in Settings first.');
    if(!consent)throw Error('Confirm permanent collectible consent.');
    const result=await api(`/events/${selected.id}/rsvp`,{studentId:student,wallet:account,permanentConsent:true});
    const next=[...tickets,{id:result.ticket,eventId:selected.id}];await storeTickets(next);setTickets(next);
    setSelected({id:result.ticket,event_id:selected.id,title:selected.title});setDialog('ticket');
  }
  async function walletBrowser(route='organizer') {
    const url=WEBSITE_URL+'/#'+route;
    const target=route.startsWith('drop/') ? WEBSITE_URL+'/?drop='+route.split('/')[1] : url;
    const deep='https://link.metamask.io/dapp/'+target.replace(/^https:\/\//,'');
    await Linking.openURL(deep);
  }
  async function addMoment(){
    if(!caption.trim())throw Error('Write a caption for your moment.');
    const next=[{id:Date.now(),caption:caption.trim(),image:photo,wallet:account,dropId:selected?.id||null},...moments];
    await AsyncStorage.setItem('kairo-moments',JSON.stringify(next));setMoments(next);setCaption('');setPhoto(null);setDialog('capsule');
  }
  async function choosePhoto(){
    const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();if(!permission.granted)throw Error('Photo access was not allowed.');
    const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:.45,base64:true,allowsEditing:true});
    if(!result.canceled){const image=result.assets[0];if(!image.base64 || image.base64.length>1400000)throw Error('Choose a smaller photo (under 1 MB).');setPhoto('data:image/jpeg;base64,'+image.base64)}
  }
  const rows = (data) => data.map(drop=><Pressable key={`${drop.id}-${drop.tokenId||''}`} style={s.row} onPress={()=>openDrop(drop)} accessibilityRole="button"><Image source={{uri:drop.image}} style={s.thumb}/><View style={{flex:1}}><Text style={s.small}>{date(drop.startsAt)} – {date(drop.endsAt)}</Text><Text style={s.rowTitle}>{drop.title}</Text><Text style={s.small}>DROP #{drop.id} {drop.tokenId ? `· NFT #${drop.tokenId}`:''} · Sepolia</Text></View><Text style={s.arrow}>›</Text></Pressable>);
  const ticketsUI = statuses.map(ticket=><Pressable key={ticket.id} style={s.panel} onPress={()=>{setSelected(ticket);setDialog('ticket')}}><Text style={s.rowTitle}>{ticket.title}</Text><Text style={s.small}>{ticket.error||mintStatus(ticket)}</Text>{ticket.tx_hash&&<Text style={s.link} onPress={()=>Linking.openURL('https://sepolia.etherscan.io/tx/'+ticket.tx_hash)}>View transaction ↗</Text>}</Pressable>);
  if(!ready)return <SafeAreaView style={s.screen}><ActivityIndicator color={purple}/></SafeAreaView>;
  if(!account)return <SafeAreaView style={s.screen}><StatusBar style="dark"/><ScrollView contentContainerStyle={s.welcome}><Text style={s.seal}>✧</Text><Text style={s.brand}>KAIRO HOME</Text><Text style={s.title}>Welcome to Kairo Home!</Text><Text style={s.muted}>Collect campus memories that stay with you.</Text><Field placeholder="Your Ethereum wallet address" value={address} onChangeText={setAddress} autoCapitalize="none"/><Button title="Set account" onPress={()=>run(setWallet)}/><Button secondary title="Scan wallet QR" onPress={()=>run(scan)}/><Text style={s.small}>Address-only viewing. No private keys, email custody, or wallet transaction needed.</Text>{error&&<Text style={s.error}>{error}</Text>}</ScrollView>{scanner()}</SafeAreaView>;
  function scanner(){return <Modal visible={camera} onRequestClose={()=>setCamera(false)}><SafeAreaView style={s.screen}><Text style={s.heading}>Scan a Kairo QR</Text>{camera&&permission?.granted&&<CameraView style={{flex:1}} facing="back" barcodeScannerSettings={{barcodeTypes:['qr']}} onBarcodeScanned={({data})=>{setCamera(false);run(()=>processCode(data))}}/>}<Button title="Cancel" onPress={()=>setCamera(false)}/></SafeAreaView></Modal>}
  return <SafeAreaView style={s.screen}><StatusBar style="dark"/>
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={()=>run(refresh)} tintColor={purple}/>}>
      {error?<View style={s.errorBox}><Text style={s.error}>{error}</Text><Button secondary title="Retry" onPress={()=>run(refresh)}/></View>:null}
      {tab==='Collection'&&<><View style={s.profileHeader}><Text style={s.decor}>✧  ◇  ✦</Text><Text style={s.avatar}>☺</Text></View><Text style={s.heading}>{profile.nickname||short(account)}</Text><Text style={s.small} selectable>{account}</Text><View style={s.actions}><Button secondary title="My Capsule ✧" onPress={()=>setDialog('capsule')}/><Button secondary title="Share profile" onPress={()=>Share.share({message:account})}/></View><Text style={s.heading}>♧ {collection.length} collectibles</Text><Text style={s.small}>Sepolia · Soulbound · Pull down to refresh</Text>{collection.length?rows(collection):<Empty title="You haven't minted any collectibles yet" text="RSVP to a drop and attend the event. Staff verify attendance before the relayer mints your NFT."/>}</>}
      {tab==='Explore'&&<><Text style={s.heroIcon}>⌕ ✧</Text><Text style={[s.title,{textAlign:'center'}]}>Explore</Text><Text style={[s.muted,{textAlign:'center'}]}>Search collectors and drops. Find a campus moment worth keeping.</Text><Field placeholder="Search drops, clubs, or Drop ID" value={query} onChangeText={setQuery}/><Button secondary title="Browse a collector address" onPress={()=>{setAddress('');setDialog('collector')}}/>{rows(searchDrops(drops,query))}{!searchDrops(drops,query).length&&<Empty title="No matching drops" text="No sample data is shown. Published drops appear here."/>}<Text style={s.heading}>Favorites {favorites.length} & Following {following.length}</Text>{rows(drops.filter(d=>favorites.includes(d.id)))}{following.map(wallet=><Button key={wallet} secondary title={short(wallet)} onPress={()=>run(async()=>{setCollectorCollection(await api('/collection?wallet='+wallet));setSelected({wallet});setDialog('collectorResults')})}/>)}</>}
      {tab==='Dispenser'&&<><Text style={s.heading}>Kairo Dispenser</Text><Text style={s.muted}>Share a drop's RSVP QR. Import its Drop ID below. Issuance still requires staff to verify attendance.</Text><Field placeholder="Drop ID" value={code} onChangeText={setCode} keyboardType="number-pad"/><Button title="Import drop" onPress={()=>run(async()=>{const result=parseCode(code);if(result.type!=='drop')throw Error('Enter a Drop ID');const drop=drops.find(d=>d.id===result.value);if(!drop)throw Error('Drop not found');setSelected(drop);setDialog('dispenser')})}/><Text style={s.heroIcon}>▦ ✧</Text><Button secondary title="Open staff check-in in MetaMask" onPress={()=>run(()=>walletBrowser())}/><Text style={s.small}>Staff authenticate with their wallet on the live site. This QR shares registration, not permission to mint.</Text><Text style={s.heading}>Your RSVP tickets</Text>{ticketsUI}</>}
      {tab==='Notifications'&&<><Text style={s.heading}>Notifications</Text><Text style={s.muted}>Live RSVP and mint status. Refreshes every 15 seconds while the app is open.</Text>{ticketsUI}{!statuses.length&&<Empty title="No notifications yet" text="Your RSVPs and mint confirmations will appear here."/>}</>}
      {tab==='Settings'&&<><Text style={s.heading}>Settings</Text><Text style={s.rowTitle}>Set a nickname</Text><Field placeholder="Nickname (on this device)" value={profile.nickname||''} onChangeText={nickname=>setProfile({...profile,nickname})}/><Button secondary title="Save nickname" onPress={()=>run(()=>AsyncStorage.setItem('kairo-profile',JSON.stringify(profile)))}/><View style={s.panel}><Text selectable style={s.small}>{account}</Text><View style={s.actions}><Button secondary title="Copy address" onPress={()=>run(()=>Clipboard.setStringAsync(account))}/><Button secondary title="Generate QR" onPress={()=>{setSelected({value:account});setDialog('qr')}}/></View></View><Button secondary title="Connect wallet in MetaMask" onPress={()=>run(()=>walletBrowser())}/><Button secondary title="Change account" onPress={()=>{setAddress(account);setDialog('account')}}/><Button secondary title="Mint notification permission" onPress={()=>run(async()=>{const p=await Notifications.requestPermissionsAsync();Alert.alert('Notifications',p.granted?'Permission enabled. Confirmed mints can notify you when this app refreshes.':'Permission denied; status remains in the app.')})}/><Button secondary title="FAQ" onPress={()=>setDialog('faq')}/><Button secondary title="POAPs by network · Sepolia" onPress={()=>Alert.alert('Sepolia only','Kairo currently issues on Sepolia testnet. Mainnet and Gnosis are not connected.')}/><Button secondary title="Log out" onPress={()=>run(async()=>{await AsyncStorage.removeItem('kairo-profile');setAccount('');setAddress('');setProfile({})})}/><Text style={s.small}>Kairo Home · 1.0.0{ '\n'}No private keys are stored in this app.</Text></>}
    </ScrollView>
    <Pressable style={s.mint} accessibilityRole="button" onPress={()=>{setCode('');setDialog('mint')}}><Text style={s.mintText}>Mint ♧</Text></Pressable>
    <View style={s.nav}>{tabs.map(([name,icon])=><Pressable accessibilityRole="tab" accessibilityState={{selected:tab===name}} key={name} style={s.navItem} onPress={()=>setTab(name)}><Text style={[s.navIcon,tab===name&&s.active]}>{icon}</Text><Text style={[s.navText,tab===name&&s.active]}>{name}</Text></Pressable>)}</View>
    <Modal visible={!!dialog&&!camera&&dialog!=='scan'} animationType="slide" onRequestClose={()=>setDialog(null)}><SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content}><Button secondary title="‹ Back" onPress={()=>setDialog(null)}/>{error&&<Text style={s.error}>{error}</Text>}
      {dialog==='drop'&&selected&&<><Image source={{uri:selected.image}} style={s.dropArt}/><View style={s.actions}><Text style={s.small}>DROP #{selected.id} · Sepolia</Text><Button secondary title={favorites.includes(selected.id)?'★ Saved':'☆ Favorite'} onPress={()=>run(()=>favorite(selected.id))}/></View><Text style={s.title}>{selected.title}</Text><Text style={s.body}>▣ {date(selected.startsAt)} – {date(selected.endsAt)}</Text><Text style={s.body}>⌖ {selected.venue}</Text><Text style={s.body}>{selected.description}</Text><View style={s.panel}><Text style={s.small}>Minting opens {time(selected.mintStartsAt)}{ '\n'}Minting closes {time(selected.mintEndsAt)}{ '\n'}RSVP deadline {time(selected.rsvpDeadline)}{ '\n'}Capacity {selected.cap===0?'Unlimited':selected.cap}</Text></View>{selected.tokenId&&<Text style={s.body}>Your NFT #{selected.tokenId} · permanently soulbound</Text>}<Button secondary title="Share drop" onPress={()=>Share.share({message:'Kairo Drop #'+selected.id+' — '+selected.title})}/>{selected.claimMode==='qr'&&<Button title="Claim on Sepolia in MetaMask" onPress={()=>run(()=>walletBrowser('drop/'+selected.id))}/>}<Button secondary title="Add Moment" onPress={()=>setDialog('moment')}/>{selected.claimMode!=='qr'&&selected.rsvpDeadline>Date.now()/1000&&!selected.tokenId&&<><Field placeholder="College student ID" value={student} onChangeText={setStudent}/><Pressable accessibilityRole="checkbox" accessibilityState={{checked:consent}} onPress={()=>setConsent(!consent)} style={s.panel}><Text style={s.small}>{consent?'☑':'☐'} I want this permanent NFT after attending. It cannot be transferred or burned. Event ownership is public.</Text></Pressable><Button title="RSVP — no gas required" disabled={loading} onPress={()=>run(rsvp)}/></>}</>}
      {dialog==='ticket'&&selected&&<><Text style={s.title}>{selected.title}</Text><QR value={selected.id}/><Text selectable style={s.small}>{selected.id}</Text><Text style={s.body}>{mintStatus(selected)}</Text><Text style={s.muted}>{selected.claimed_at ? 'Your wallet claim is saved. The sponsored relayer submits the Sepolia mint.' : 'Show this QR and your college ID to event staff. Possession of this ticket alone does not prove attendance.'}</Text></>}
      {dialog==='dispenser'&&selected&&<><Text style={s.title}>{selected.title}</Text><QR value={'drop:'+selected.id}/><Text style={s.heading}>DROP #{selected.id}</Text><Text style={s.muted}>Attendees scan this in Kairo Home to open the RSVP form.</Text><Button title="Share Drop ID" onPress={()=>Share.share({message:'drop:'+selected.id})}/></>}
      {dialog==='mint'&&<><Text style={s.title}>Collect a campus moment</Text><Button title="Scan QR code ▦" onPress={()=>run(scan)}/><Field placeholder="Enter Drop ID or ticket code" value={code} onChangeText={setCode} autoCapitalize="none"/><Button secondary title="Enter code #" onPress={()=>run(()=>processCode(code))}/><Text style={s.muted}>Minting follows RSVP and in-person staff verification. A code cannot bypass attendance checks.</Text></>}
      {(dialog==='account'||dialog==='collector')&&<><Text style={s.title}>{dialog==='account'?'Your wallet address':'Browse a collector'}</Text><Field placeholder="0x…" value={address} onChangeText={setAddress} autoCapitalize="none"/><Button title={dialog==='account'?'Set account':'View collection'} onPress={()=>run(dialog==='account'?setWallet:async()=>{if(!walletPattern.test(address))throw Error('Enter a valid wallet address');setCollectorCollection(await api('/collection?wallet='+address));setSelected({wallet:address});setDialog('collectorResults')})}/></>}
      {dialog==='collectorResults'&&<><Text style={s.heading}>{short(selected.wallet)}</Text>{rows(collectorCollection)}{!collectorCollection.length&&<Empty title="No Kairo collectibles" text="This address has no confirmed Kairo mints in the app database."/>}<Button title="Follow on this device" onPress={()=>run(async()=>{const next=[...new Set([...following,selected.wallet])];await AsyncStorage.setItem('kairo-following',JSON.stringify(next));setFollowing(next);setDialog(null);await refresh()})}/></>}
      {dialog==='qr'&&<><QR value={selected.value}/><Text selectable style={s.small}>{selected.value}</Text></>}
      {dialog==='capsule'&&<><Text style={s.title}>My Capsule</Text><Text style={s.small}>Private moments saved on this device. Not uploaded or shared automatically.</Text>{moments.filter(m=>m.wallet===account).map(m=><View key={m.id} style={s.panel}>{m.image&&<Image source={{uri:m.image}} style={s.momentImage}/>}<Text style={s.body}>{m.caption}</Text><Text style={s.small}>{new Date(m.id).toLocaleDateString()}{m.dropId?' · Drop #'+m.dropId:''}</Text><Button secondary title="Share caption" onPress={()=>Share.share({message:m.caption})}/></View>)}{!moments.some(m=>m.wallet===account)&&<Empty title="No moments yet" text="Save a favorite campus memory."/>}<Button title="Add Moment ✧" onPress={()=>{setSelected(null);setDialog('moment')}}/></>}
      {dialog==='moment'&&<><Text style={s.title}>Add Moment</Text><Field placeholder="Your memory" value={caption} onChangeText={setCaption} multiline maxLength={1000}/><Button secondary title="Choose photo" onPress={()=>run(choosePhoto)}/>{photo&&<Image source={{uri:photo}} style={s.momentImage}/>}<Button title="Save to My Capsule" onPress={()=>run(addMoment)}/></>}
      {dialog==='faq'&&<><Text style={s.title}>How Kairo works</Text><Text style={s.body}>RSVP with your wallet address and college ID. Event staff verify you in person, then the sponsored relayer mints on Sepolia. You pay no gas. Your collectible cannot transfer or burn.</Text><Text style={s.body}>A displayed address is for viewing, not proof of wallet ownership. Organizer privileges require a real wallet signature in the MetaMask browser.</Text><Text style={s.body}>Favorites, following, nicknames, and capsule moments are device-local. There is no ENS or email wallet custody, NFT trading, background push service, location minting, NFC claim, or secret-word bypass.</Text></>}
    </ScrollView></SafeAreaView></Modal>{scanner()}
  </SafeAreaView>;
}
const s=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#fff'},content:{padding:22,paddingBottom:115,gap:16},welcome:{padding:26,paddingTop:65,gap:22},
  title:{fontSize:30,fontWeight:'800',color:'#493d6b',marginVertical:10},heading:{fontSize:25,fontWeight:'800',color:'#493d6b'},body:{fontSize:18,lineHeight:28,color:'#514568'},muted:{fontSize:17,lineHeight:27,color:'#a799cb'},small:{fontSize:13,lineHeight:21,color:'#7f7397'},
  button:{paddingVertical:16,paddingHorizontal:19,backgroundColor:'#9b85f4',borderRadius:30,borderWidth:1,borderColor:purple,marginVertical:4,shadowColor:purple,shadowOpacity:.3,shadowOffset:{width:0,height:6},shadowRadius:0,elevation:2},secondary:{backgroundColor:'#fff',borderColor:'#c1b4e1',shadowOpacity:0,elevation:0},buttonText:{textAlign:'center',fontSize:16,fontWeight:'700',color:'white'},input:{borderWidth:1.5,borderColor:'#c1b4e1',borderRadius:20,padding:17,fontSize:17,color:purple,backgroundColor:'#fff'},
  profileHeader:{height:145,backgroundColor:'#ddd2ff',borderRadius:30,padding:20,overflow:'hidden'},decor:{fontSize:44,color:'#a28cf3',letterSpacing:15},avatar:{fontSize:48,color:purple},actions:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8},panel:{padding:17,backgroundColor:'#f5f1ff',borderWidth:1,borderColor:'#dfd5ef',borderRadius:22,gap:9},
  row:{flexDirection:'row',gap:15,alignItems:'center',backgroundColor:'#f7f3ff',padding:14,borderRadius:18},thumb:{width:65,height:65,borderRadius:33},rowTitle:{fontSize:17,fontWeight:'700',color:'#493d6b'},arrow:{fontSize:26,color:purple},dropArt:{width:'100%',aspectRatio:1,borderRadius:200,resizeMode:'contain',backgroundColor:'#f7f3ff'},momentImage:{width:'100%',height:230,borderRadius:20,resizeMode:'cover'},
  nav:{flexDirection:'row',borderTopWidth:1,borderColor:'#eee8f7',paddingTop:10,paddingBottom:8,backgroundColor:'#fff'},navItem:{flex:1,alignItems:'center',gap:4},navIcon:{fontSize:28,color:'#baace0'},navText:{fontSize:10,color:'#baace0'},active:{color:purple,fontWeight:'700'},mint:{position:'absolute',right:23,bottom:94,borderRadius:32,paddingHorizontal:29,paddingVertical:16,backgroundColor:'#9b85f4',borderWidth:1,borderColor:purple,shadowColor:purple,shadowOpacity:.5,shadowOffset:{width:0,height:7},shadowRadius:0,elevation:4},mintText:{fontSize:24,fontWeight:'800',color:'#fff'},
  empty:{alignItems:'center',paddingVertical:35,gap:16},emptyIcon:{fontSize:85,color:'#d3c7f2'},emptyTitle:{fontSize:24,fontWeight:'800',color:'#b4a1e0',textAlign:'center'},heroIcon:{fontSize:85,color:'#c4b5ed',textAlign:'center',marginTop:15},seal:{fontSize:145,color:'#ad98de',textAlign:'center'},brand:{letterSpacing:5,textAlign:'center',color:purple},qr:{alignSelf:'center',padding:10,backgroundColor:'#fff',borderRadius:20},error:{color:'#9a2945',fontSize:15,lineHeight:23},errorBox:{backgroundColor:'#fff0f3',padding:15,borderRadius:15},link:{color:purple,fontWeight:'700'}
});
