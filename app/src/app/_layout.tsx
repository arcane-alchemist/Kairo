import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { COLORS } from '../shell';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Layout() {
  const [loaded, error] = useFonts({Outfit_600SemiBold:require('@expo-google-fonts/outfit/600SemiBold/Outfit_600SemiBold.ttf'),DMSans_400Regular:require('@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf')});
  useEffect(() => { if (loaded || error) SplashScreen.hideAsync().catch(() => {}); },[loaded,error]);
  if (!loaded && !error) return null;
  return <><StatusBar style="dark"/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:COLORS.background},animation:'none'}}/></>;
}
