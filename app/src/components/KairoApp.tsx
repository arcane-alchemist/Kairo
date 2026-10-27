import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { COLORS, WEBSITE_URL, isAppUrl, isExternalUrl, isWalletUrl, nativeResultScript, parseNativeRequest, routeFromLink } from '../shell';

export default function KairoApp() {
  const web = useRef<WebView>(null);
  const loadedUrl = useRef(WEBSITE_URL);
  const sharing = useRef(false);
  const [error,setError] = useState(WEBSITE_URL ? '' : 'This app build is not configured. Install an updated Kairo app.');
  const [loading,setLoading] = useState(Boolean(WEBSITE_URL));
  const pageReady = useRef(false);
  const appliedRoute = useRef('');
  const {route} = useLocalSearchParams<{route?:string}>();

  const applyRoute = useCallback(() => {
    const path = route && routeFromLink(WEBSITE_URL + '#' + route);
    if (path && pageReady.current && appliedRoute.current !== path) {
      appliedRoute.current = path;
      web.current?.injectJavaScript(`window.location.hash=${JSON.stringify(path)};true;`);
    }
  },[route]);
  useEffect(() => {applyRoute();},[applyRoute]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress',() => {
      if (Keyboard.isVisible()) {Keyboard.dismiss();return true;}
      if (error || loading) return false;
      web.current?.injectJavaScript("window.dispatchEvent(new Event('kairo-android-back'));true;");
      return true;
    });
    return () => subscription.remove();
  },[error,loading]);

  const openExternal = useCallback(async (url: string) => {
    try {
      if (!isExternalUrl(url) && !isWalletUrl(url)) throw Error('This link is not supported.');
      if (isWalletUrl(url) && !await Linking.canOpenURL(url)) throw Error('Install MetaMask Mobile, then connect again.');
      await Linking.openURL(url);
    } catch (cause) { Alert.alert('Could not open link',cause instanceof Error ? cause.message : 'Please try again.'); }
  },[]);

  const onMessage = useCallback(async (event: WebViewMessageEvent) => {
    let id: string | undefined;
    try {
      const message = parseNativeRequest(event.nativeEvent.data,event.nativeEvent.url);
      id = message.id;
      if (message.type === 'back-root') {BackHandler.exitApp();return;}
      if (message.type === 'open-wallet') {
        if (!await Linking.canOpenURL(message.url)) throw Error('Install MetaMask Mobile before connecting your wallet.');
        await Linking.openURL(message.url);
      } else {
        if (sharing.current) throw Error('Finish saving the previous QR first.');
        if (!FileSystem.documentDirectory) throw Error('Android file storage is unavailable.');
        if (!await Sharing.isAvailableAsync()) throw Error('File sharing is unavailable on this device.');
        sharing.current = true;
        try {
          const uri = FileSystem.documentDirectory + message.name;
          await FileSystem.writeAsStringAsync(uri,message.data.split(',')[1],{encoding:FileSystem.EncodingType.Base64});
          await Sharing.shareAsync(uri,{mimeType:'image/png',dialogTitle:'Save or share your Kairo QR'});
        } finally {sharing.current = false;}
      }
      if (isAppUrl(loadedUrl.current)) web.current?.injectJavaScript(nativeResultScript(id,{completed:true}));
    } catch (cause) {
      if (id && isAppUrl(loadedUrl.current)) web.current?.injectJavaScript(nativeResultScript(id,undefined,cause instanceof Error ? cause.message : 'Please try again.'));
    }
  },[]);

  return <SafeAreaView style={styles.screen} edges={['top','right','bottom','left']}>
    {WEBSITE_URL && <WebView ref={web} style={styles.web} source={{uri:WEBSITE_URL}} applicationNameForUserAgent="KairoAndroid/1.1.0"
      javaScriptEnabled domStorageEnabled sharedCookiesEnabled thirdPartyCookiesEnabled={false}
      originWhitelist={['*']} mixedContentMode="never" allowFileAccess={false} allowUniversalAccessFromFileURLs={false}
      javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows allowsFullscreenVideo allowsInlineMediaPlayback mediaPlaybackRequiresUserAction
      textZoom={100} setBuiltInZoomControls setDisplayZoomControls={false} overScrollMode="never"
      onShouldStartLoadWithRequest={request => {
        if (isAppUrl(request.url)) return true;
        if (isExternalUrl(request.url) || isWalletUrl(request.url)) void openExternal(request.url);
        return false;
      }}
      onOpenWindow={event => void openExternal(event.nativeEvent.targetUrl)} onMessage={event => void onMessage(event)}
      onNavigationStateChange={state => {loadedUrl.current = state.url;}}
      onLoadStart={() => {pageReady.current = false;setLoading(true);setError('');}}
      onLoadEnd={() => {pageReady.current = true;setLoading(false);applyRoute();}}
      onError={() => {setLoading(false);setError('We could not reach Kairo. Check your connection and try again.');}}
      onHttpError={event => {if (isAppUrl(event.nativeEvent.url) && new URL(event.nativeEvent.url).pathname === '/' && event.nativeEvent.statusCode >= 400) {setLoading(false);setError('Kairo is temporarily unavailable. Please retry shortly.');}}}
      onRenderProcessGone={() => {setLoading(false);setError('Android closed this page to free memory. Reload to return to Kairo.');}}
      webviewDebuggingEnabled={__DEV__}
    />}
    {loading && !error && <View pointerEvents="none" style={styles.loading}><ActivityIndicator accessibilityLabel="Loading Kairo" color={COLORS.ink}/></View>}
    {!!error && <View style={styles.error} accessibilityViewIsModal><ScrollView contentContainerStyle={styles.errorContent}>
      <Text style={styles.eyebrow}>YOUR MOMENTS ARE STILL YOURS.</Text><Text style={styles.title}>Let’s get you{ '\n'}connected.</Text><Text style={styles.body} accessibilityRole="alert">{error}</Text>
      <Pressable accessibilityRole="button" style={styles.button} onPress={() => {setError(WEBSITE_URL ? '' : 'This app build is not configured. Install an updated Kairo app.');setLoading(Boolean(WEBSITE_URL));web.current?.reload();}}><Text style={styles.buttonText}>Try again ↗</Text></Pressable>
    </ScrollView></View>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:COLORS.background},web:{flex:1,backgroundColor:COLORS.background},
  loading:{position:'absolute',top:12,right:12,padding:12,borderRadius:30,backgroundColor:COLORS.paper},
  error:{position:'absolute',top:0,right:0,bottom:0,left:0,backgroundColor:COLORS.background},errorContent:{flexGrow:1,justifyContent:'center',padding:28,maxWidth:700,width:'100%',alignSelf:'center'},
  eyebrow:{fontFamily:'DMSans_400Regular',fontSize:11,letterSpacing:1.5,color:COLORS.ink,marginBottom:24},title:{fontFamily:'Outfit_600SemiBold',fontSize:42,lineHeight:46,color:COLORS.ink,letterSpacing:-1.4,flexShrink:1},
  body:{fontFamily:'DMSans_400Regular',fontSize:16,lineHeight:26,color:COLORS.ink,marginVertical:24},button:{backgroundColor:COLORS.ink,borderRadius:9,padding:18,minHeight:56,alignSelf:'flex-start'},buttonText:{fontFamily:'DMSans_400Regular',color:COLORS.paper,fontSize:15}
});
