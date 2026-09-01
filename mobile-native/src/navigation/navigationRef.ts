import {createNavigationContainerRef} from '@react-navigation/native';
import type {RootStackParamList} from '../types/navigation';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

type PendingRoute =
  | {name: 'Main'; params: RootStackParamList['Main']}
  | {name: 'ChatRoom'; params: RootStackParamList['ChatRoom']}
  | {name: 'Call'; params: RootStackParamList['Call']}
  | {name: 'Notifications'; params: undefined};

let pendingRoute: PendingRoute | null = null;

export function openFromNotification(data?: Record<string, string>) {
  const route = notificationRoute(data);
  if (!route) return;
  if (navigationRef.isReady()) {
    navigateRoute(route);
  } else {
    pendingRoute = route;
  }
}

export function flushPendingRoute() {
  if (!pendingRoute || !navigationRef.isReady()) return;
  const route = pendingRoute;
  pendingRoute = null;
  navigateRoute(route);
}

function navigateRoute(route: PendingRoute) {
  if (route.name === 'Main') navigationRef.navigate('Main', route.params);
  else if (route.name === 'ChatRoom') navigationRef.navigate('ChatRoom', route.params);
  else if (route.name === 'Call') navigationRef.navigate('Call', route.params);
  else navigationRef.navigate('Notifications');
}

function notificationRoute(data?: Record<string, string>): PendingRoute | null {
  if (data?.type === 'incoming_call' && data.callId) {
    return {name: 'Call', params: {callId: data.callId, incoming: true}};
  }
  if (data?.type === 'chat_message' && data.roomId) {
    return {
      name: 'ChatRoom',
      params: {roomId: data.roomId, title: data.senderName || 'Chat'},
    };
  }
  if (data?.type === 'host_approved' || data?.destination === 'host_rates') {
    return {name: 'Main', params: {screen: 'Profile', params: {focus: 'rates'}}};
  }
  return {name: 'Notifications', params: undefined};
}
