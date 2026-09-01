import type {NavigatorScreenParams} from '@react-navigation/native';

export type RootStackParamList = {
  Auth: undefined;
  Register: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  ChatRoom: {roomId: string; otherUserId?: string; title?: string};
  HostProfile: {userId: string};
  Call: {callId: string; incoming?: boolean};
  Notifications: undefined;
  Settings: undefined;
  Policies: {page: 'privacy' | 'terms' | 'safety' | 'host-policy' | 'refund-policy'};
};

export type MainTabParamList = {
  Discover: undefined;
  Chats: undefined;
  Random: undefined;
  Wallet: undefined;
  Profile: undefined;
};
