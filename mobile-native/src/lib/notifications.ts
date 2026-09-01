import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  EventType,
  type Event,
  type Notification,
} from '@notifee/react-native';
import {
  getMessaging,
  getToken,
  onMessage,
  requestPermission as requestMessagingPermission,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import {Platform} from 'react-native';
import {getDeviceId} from './device';
import {supabase} from './supabase';
import {openFromNotification} from '../navigation/navigationRef';
import {colors} from '../theme';

export async function configureNotifications() {
  await notifee.createChannel({
    id: 'messages',
    name: 'Messages',
    importance: AndroidImportance.HIGH,
    vibration: true,
  });
  await notifee.createChannel({
    id: 'incoming_calls',
    name: 'Incoming calls',
    importance: AndroidImportance.HIGH,
    vibration: true,
    sound: 'default',
  });
}

export async function registerPushToken() {
  await configureNotifications();
  await notifee.requestPermission();
  await requestMessagingPermission(getMessaging());
  const token = await getToken(getMessaging());
  const deviceId = await getDeviceId();
  const {error} = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: Platform.OS,
    p_device_id: deviceId,
  });
  if (error) throw error;
  return token;
}

export function listenForForegroundMessages() {
  return onMessage(getMessaging(), displayRemoteMessage);
}

export async function displayRemoteMessage(message: RemoteMessage) {
  const data = stringData(message.data);
  const isCall = data.type === 'incoming_call';
  const notification: Notification = {
    id: isCall && data.callId ? `call-${data.callId}` : message.messageId,
    title: message.notification?.title || data.title || (isCall ? `Incoming ${data.callType || ''} call` : data.senderName || 'New message'),
    body: message.notification?.body || data.body || (isCall ? data.callerName || 'Kizo call' : 'You have a new message'),
    data,
    android: {
      channelId: isCall ? 'incoming_calls' : data.channelId || 'messages',
      smallIcon: 'ic_stat_wetdreams',
      color: colors.coral,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      category: isCall ? AndroidCategory.CALL : AndroidCategory.MESSAGE,
      pressAction: {id: 'default', launchActivity: 'default'},
      ...(isCall
        ? {
            ongoing: true,
            autoCancel: false,
            fullScreenAction: {id: 'default', launchActivity: 'default'},
            actions: [
              {title: 'Decline', pressAction: {id: 'decline'}},
              {title: 'Accept', pressAction: {id: 'accept', launchActivity: 'default'}},
            ],
          }
        : {autoCancel: true}),
    },
  };
  await notifee.displayNotification(notification);
}

export async function handleNotificationEvent({type, detail}: Event) {
  if (type !== EventType.PRESS && type !== EventType.ACTION_PRESS) return;
  const data = stringData(detail.notification?.data);
  const callId = data.callId;

  if (callId && detail.pressAction?.id === 'decline') {
    await supabase.rpc('respond_to_call', {p_call_id: callId, p_accept: false});
    await notifee.cancelNotification(`call-${callId}`);
    return;
  }
  if (callId && detail.pressAction?.id === 'accept') {
    const {data: accepted} = await supabase.rpc('respond_to_call', {
      p_call_id: callId,
      p_accept: true,
    });
    if (accepted) openFromNotification({...data, type: 'incoming_call'});
    await notifee.cancelNotification(`call-${callId}`);
    return;
  }
  openFromNotification(data);
}

export async function consumeInitialNotification() {
  const initial = await notifee.getInitialNotification();
  if (initial?.notification.data) {
    openFromNotification(stringData(initial.notification.data));
  }
}

function stringData(data?: Record<string, string | number | object> | null) {
  const result: Record<string, string> = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    result[key] = typeof value === 'string' ? value : JSON.stringify(value);
  });
  return result;
}
