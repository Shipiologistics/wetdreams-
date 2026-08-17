import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useCallback, useEffect, useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {Bell, CheckCheck, Coins, MessageCircle, Phone} from 'lucide-react-native';
import {ScreenHeader} from '../components/ScreenHeader';
import {supabase} from '../lib/supabase';
import {useApp} from '../state/AppProvider';
import {colors, radii, spacing} from '../theme';
import type {Database} from '../types/database';
import type {RootStackParamList} from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;
type Notification = Database['public']['Tables']['app_notifications']['Row'];

export function NotificationsScreen({navigation}: Props) {
  const {viewer, refreshViewer} = useApp();
  const [items, setItems] = useState<Notification[]>([]);
  const load = useCallback(async () => {
    if (!viewer) return;
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const {data} = await supabase.from('app_notifications').select('*').eq('user_id', viewer.account.id).gte('created_at', sevenDaysAgo).order('created_at', {ascending: false}).limit(100);
    setItems(data || []);
  }, [viewer]);

  useEffect(() => {
    void load().then(async () => {
      await supabase.rpc('mark_notifications_read', {p_notification_ids: null});
      await refreshViewer();
    });
    if (!viewer) return;
    const channel = supabase.channel(`native-notifications-${viewer.account.id}`).on('postgres_changes', {event: '*', schema: 'public', table: 'app_notifications', filter: `user_id=eq.${viewer.account.id}`}, () => void load()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, refreshViewer, viewer]);

  function open(item: Notification) {
    const metadata = item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata) ? item.metadata as Record<string, unknown> : {};
    const roomId = typeof metadata.room_id === 'string' ? metadata.room_id : item.href.match(/\/chat\/([^?]+)/)?.[1];
    const callId = typeof metadata.call_id === 'string' ? metadata.call_id : null;
    if (item.type.includes('call') && callId) navigation.navigate('Call', {callId, incoming: true});
    else if (roomId) navigation.navigate('ChatRoom', {roomId});
  }

  return (
    <View style={styles.root}>
      <ScreenHeader back title="Notifications" eyebrow="Updates and activity" />
      <View style={styles.read}><CheckCheck size={17} color={colors.teal} /><Text style={styles.readText}>Opened notifications are marked read automatically.</Text></View>
      <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={styles.list} renderItem={({item}) => <Pressable onPress={() => open(item)} style={[styles.row, !item.read_at && styles.unread]}><View style={styles.icon}>{iconFor(item.type)}</View><View style={styles.copy}><Text style={styles.title}>{item.title}</Text><Text style={styles.body}>{item.body}</Text><Text style={styles.time}>{new Date(item.created_at).toLocaleString('en-IN')}</Text></View></Pressable>} ListEmptyComponent={<View style={styles.empty}><Bell size={42} color={colors.teal} /><Text style={styles.emptyTitle}>You are all caught up</Text><Text style={styles.emptyText}>Notifications clear from this inbox after 7 days.</Text></View>} />
    </View>
  );
}

function iconFor(type: string) { if (type.includes('message')) return <MessageCircle size={21} color={colors.teal} />; if (type.includes('call')) return <Phone size={21} color={colors.teal} />; if (type.includes('wallet') || type.includes('tip')) return <Coins size={21} color={colors.mustard} />; return <Bell size={21} color={colors.teal} />; }

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.canvas},
  read: {paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.tealSoft},
  readText: {fontSize: 12, color: colors.teal},
  list: {padding: spacing.md, gap: spacing.xs},
  row: {minHeight: 82, padding: spacing.md, flexDirection: 'row', gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surface},
  unread: {borderLeftWidth: 4, borderLeftColor: colors.coral},
  icon: {width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealSoft},
  copy: {flex: 1, gap: 3},
  title: {fontSize: 15, fontWeight: '900', color: colors.ink},
  body: {fontSize: 14, lineHeight: 20, color: colors.muted},
  time: {fontSize: 11, color: colors.muted},
  empty: {alignItems: 'center', padding: spacing.xxl, gap: spacing.xs},
  emptyTitle: {fontSize: 20, fontWeight: '900', color: colors.ink},
  emptyText: {color: colors.muted, textAlign: 'center'},
});
