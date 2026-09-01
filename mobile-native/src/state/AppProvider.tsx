import type {Session} from '@supabase/supabase-js';
import type {ReactNode} from 'react';
import {
  AppState,
  Alert,
  type AppStateStatus,
} from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {getDeviceId, registerCurrentDevice} from '../lib/device';
import {
  configureNotifications,
  listenForForegroundMessages,
  registerPushToken,
} from '../lib/notifications';
import {authenticatedPost} from '../lib/api';
import {supabase} from '../lib/supabase';
import type {Database} from '../types/database';

type Account = Database['public']['Tables']['users']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];
type Wallet = Database['public']['Tables']['wallets']['Row'];

type Viewer = {
  session: Session;
  account: Account;
  profile: Profile;
  wallet: Wallet;
};

type AppContextValue = {
  session: Session | null;
  viewer: Viewer | null;
  loading: boolean;
  deviceBanned: boolean;
  unreadNotifications: number;
  unreadChats: number;
  refreshViewer: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({children}: {children: ReactNode}) {
  const [session, setSession] = useState<Session | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceBanned, setDeviceBanned] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);
  const sessionRef = useRef<Session | null>(null);
  const signupBonusClaimRef = useRef<string | null>(null);
  sessionRef.current = session;

  const refreshViewer = useCallback(async () => {
    const activeSession = sessionRef.current;
    if (!activeSession) {
      setViewer(null);
      return;
    }

    const userId = activeSession.user.id;
    const [{data: account}, {data: profile}, {data: wallet}, {count}] = await Promise.all([
      supabase.from('users').select('*').eq('id', userId).single(),
      supabase.from('profiles').select('*').eq('user_id', userId).single(),
      supabase.from('wallets').select('*').eq('user_id', userId).single(),
      supabase
        .from('app_notifications')
        .select('id', {head: true, count: 'exact'})
        .eq('user_id', userId)
        .is('read_at', null),
    ]);

    if (account && profile && wallet) {
      setViewer({session: activeSession, account, profile, wallet});
      setUnreadNotifications(count || 0);
      const {data: rooms} = await supabase
        .from('chat_rooms')
        .select('id')
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .eq('status', 'active')
        .neq('room_type', 'random');
      const roomIds = (rooms || []).map(room => room.id);
      if (roomIds.length) {
        const {count: unreadCount} = await supabase
          .from('messages')
          .select('id', {head: true, count: 'exact'})
          .in('room_id', roomIds)
          .neq('sender_id', userId)
          .is('read_at', null)
          .gt('expires_at', new Date().toISOString());
        setUnreadChats(unreadCount || 0);
      } else {
        setUnreadChats(0);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({data}) => {
      if (!mounted) return;
      sessionRef.current = data.session;
      setSession(data.session);
      setLoading(false);
      if (data.session) setTimeout(() => void refreshViewer(), 0);
    });
    const {data: authListener} = supabase.auth.onAuthStateChange((_event, nextSession) => {
      sessionRef.current = nextSession;
      setSession(nextSession);
      if (!nextSession) setViewer(null);
      setTimeout(() => void refreshViewer(), 0);
    });
    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [refreshViewer]);

  useEffect(() => {
    void configureNotifications();
    return listenForForegroundMessages();
  }, []);

  useEffect(() => {
    if (!session) return;
    if (signupBonusClaimRef.current !== session.user.id) {
      signupBonusClaimRef.current = session.user.id;
      authenticatedPost<{credited: boolean}>('/api/wallet/signup-bonus', {})
        .then((result) => {
          if (result.credited) void refreshViewer();
        })
        .catch(() => undefined);
    }

    registerCurrentDevice()
      .then(({banned}) => {
        setDeviceBanned(banned);
        if (!banned) void registerPushToken().catch(() => undefined);
      })
      .catch(error => Alert.alert('Device check failed', error.message));

    const userId = session.user.id;
    const channel = supabase
      .channel(`native-viewer-${userId}`)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'users', filter: `id=eq.${userId}`}, () => void refreshViewer())
      .on('postgres_changes', {event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${userId}`}, () => void refreshViewer())
      .on('postgres_changes', {event: '*', schema: 'public', table: 'app_notifications', filter: `user_id=eq.${userId}`}, () => void refreshViewer())
      .on('postgres_changes', {event: '*', schema: 'public', table: 'messages'}, () => void refreshViewer())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshViewer, session]);

  useEffect(() => {
    if (!session) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const heartbeat = async (presence: 'online' | 'offline') => {
      const deviceId = await getDeviceId();
      await supabase.rpc('track_visitor_session', {
        p_session_id: `native-${deviceId}`.slice(0, 120),
        p_device_id: deviceId,
        p_path: '/native',
        p_presence: presence,
        p_user_agent: 'Kizo React Native Android',
      });
    };
    const setState = (state: AppStateStatus) => {
      if (interval) clearInterval(interval);
      if (state === 'active') {
        void heartbeat('online');
        interval = setInterval(() => void heartbeat('online'), 4 * 60 * 1000);
      } else {
        void heartbeat('offline');
      }
    };
    setState(AppState.currentState);
    const listener = AppState.addEventListener('change', setState);
    return () => {
      if (interval) clearInterval(interval);
      listener.remove();
      void heartbeat('offline');
    };
  }, [session]);

  const signOut = useCallback(async () => {
    const deviceId = await getDeviceId();
    await supabase.rpc('track_visitor_session', {
      p_session_id: `native-${deviceId}`.slice(0, 120),
      p_device_id: deviceId,
      p_path: '/native',
      p_presence: 'offline',
      p_user_agent: 'Kizo React Native Android',
    });
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({session, viewer, loading, deviceBanned, unreadNotifications, unreadChats, refreshViewer, signOut}),
    [session, viewer, loading, deviceBanned, unreadNotifications, unreadChats, refreshViewer, signOut],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider.');
  return value;
}
