import notifee from '@notifee/react-native';
import {NavigationContainer, DefaultTheme} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useEffect} from 'react';
import {StatusBar, StyleSheet, Text, View} from 'react-native';
import {Compass, HeartHandshake, MessageCircle, UserRound, WalletCards} from 'lucide-react-native';
import {SafeAreaProvider, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {BrandedLoader} from './src/components/BrandedLoader';
import {IncomingCallListener} from './src/components/IncomingCallListener';
import {ProfileImageGate} from './src/components/ProfileImageGate';
import {handleNotificationEvent, consumeInitialNotification} from './src/lib/notifications';
import {flushPendingRoute, navigationRef} from './src/navigation/navigationRef';
import {AuthScreen} from './src/screens/AuthScreen';
import {CallScreen} from './src/screens/CallScreen';
import {ChatRoomScreen} from './src/screens/ChatRoomScreen';
import {ChatsScreen} from './src/screens/ChatsScreen';
import {DiscoverScreen} from './src/screens/DiscoverScreen';
import {HostProfileScreen} from './src/screens/HostProfileScreen';
import {NotificationsScreen} from './src/screens/NotificationsScreen';
import {PoliciesScreen} from './src/screens/PoliciesScreen';
import {ProfileScreen} from './src/screens/ProfileScreen';
import {RandomScreen} from './src/screens/RandomScreen';
import {RegisterScreen} from './src/screens/RegisterScreen';
import {SettingsScreen} from './src/screens/SettingsScreen';
import {WalletScreen} from './src/screens/WalletScreen';
import {AppProvider, useApp} from './src/state/AppProvider';
import {colors} from './src/theme';
import type {MainTabParamList, RootStackParamList} from './src/types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

const navigationTheme = {
  ...DefaultTheme,
  colors: {...DefaultTheme.colors, background: colors.canvas, card: colors.surface, text: colors.ink, border: colors.line, primary: colors.coral},
};

function MainTabs() {
  const {unreadChats} = useApp();
  const insets = useSafeAreaInsets();
  return (
    <Tabs.Navigator
      initialRouteName="Discover"
      backBehavior="initialRoute"
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        animation: 'shift',
        sceneStyle: {backgroundColor: colors.canvas},
        tabBarActiveTintColor: colors.coral,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 64 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ],
        tabBarIcon: ({color, size, focused}) => tabIcon(route.name, color, size, focused),
        tabBarBadge: route.name === 'Chats' && unreadChats > 0 ? (unreadChats > 9 ? '9+' : unreadChats) : undefined,
        tabBarBadgeStyle: styles.tabBadge,
      })}>
      <Tabs.Screen name="Discover" component={DiscoverScreen} options={{tabBarLabel: 'Explore'}} />
      <Tabs.Screen name="Chats" component={ChatsScreen} options={{tabBarLabel: 'Messages'}} />
      <Tabs.Screen name="Random" component={RandomScreen} options={{tabBarLabel: 'Match'}} />
      <Tabs.Screen name="Wallet" component={WalletScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

function AppNavigator() {
  const {session, viewer, loading, deviceBanned} = useApp();
  if (loading || (session && !viewer)) return <BrandedLoader label="Preparing WetDreams" />;
  if (deviceBanned) return <BannedScreen />;

  return (
    <>
      <Stack.Navigator screenOptions={{headerShown: false, animation: 'slide_from_right'}}>
        {session ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} options={{animation: 'fade'}} />
            <Stack.Screen name="ChatRoom" component={ChatRoomScreen} />
            <Stack.Screen name="HostProfile" component={HostProfileScreen} />
            <Stack.Screen name="Call" component={CallScreen} options={{animation: 'fade', gestureEnabled: false}} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Policies" component={PoliciesScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Auth" component={AuthScreen} options={{animation: 'fade'}} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </Stack.Navigator>
      {session ? <IncomingCallListener /> : null}
      {session ? <ProfileImageGate /> : null}
    </>
  );
}

export default function App() {
  useEffect(() => {
    const unsubscribe = notifee.onForegroundEvent(handleNotificationEvent);
    void consumeInitialNotification();
    return unsubscribe;
  }, []);
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
        <AppProvider>
          <NavigationContainer ref={navigationRef} theme={navigationTheme} onReady={flushPendingRoute} linking={{prefixes: ['wetdreams://'], config: {screens: {ChatRoom: 'chat/:roomId', Call: 'call/:callId', Notifications: 'notifications'}}}}>
            <AppNavigator />
          </NavigationContainer>
        </AppProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function tabIcon(name: keyof MainTabParamList, color: string, size: number, focused: boolean) {
  const icon = name === 'Discover'
    ? <Compass size={size} color={color} />
    : name === 'Chats'
      ? <MessageCircle size={size} color={color} />
      : name === 'Random'
        ? <HeartHandshake size={size} color={color} />
        : name === 'Wallet'
          ? <WalletCards size={size} color={color} />
          : <UserRound size={size} color={color} />;
  return <View style={[styles.tabIcon, focused && styles.tabIconActive]}>{icon}</View>;
}

function BannedScreen() {
  return <View style={styles.banned}><Text style={styles.bannedTitle}>Device blocked</Text><Text style={styles.bannedText}>This device cannot use WetDreams because it reached the platform safety block limit.</Text></View>;
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: colors.surface},
  tabBar: {paddingTop: 5, borderTopColor: colors.line, backgroundColor: colors.surface},
  tabLabel: {fontSize: 10, fontWeight: '800'},
  tabIcon: {width: 38, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  tabIconActive: {backgroundColor: colors.coralSoft},
  tabBadge: {fontSize: 10, fontWeight: '900', backgroundColor: colors.coral},
  banned: {flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.canvas},
  bannedTitle: {fontSize: 30, fontWeight: '900', color: colors.danger},
  bannedText: {fontSize: 16, lineHeight: 24, color: colors.muted, textAlign: 'center'},
});
