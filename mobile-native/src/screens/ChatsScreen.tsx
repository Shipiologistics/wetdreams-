import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NavigationProp} from '@react-navigation/native';
import {useCallback, useMemo, useState} from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {MessageCircle} from 'lucide-react-native';
import {ScreenHeader} from '../components/ScreenHeader';
import {supabase} from '../lib/supabase';
import {useApp} from '../state/AppProvider';
import {colors, spacing} from '../theme';
import type {Database} from '../types/database';
import type {RootStackParamList} from '../types/navigation';

type Room = Database['public']['Tables']['chat_rooms']['Row'];
type Account = Database['public']['Tables']['users']['Row'];
type Media = Database['public']['Tables']['profile_media']['Row'];
type Message = Database['public']['Tables']['messages']['Row'];
type Conversation = {room: Room; account: Account; avatar: string | null; last: Message | null; unread: number};

export function ChatsScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const {viewer, unreadNotifications} = useApp();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const load = useCallback(async () => {
    if (!viewer) return;
    const userId = viewer.account.id;
    const {data: roomRows} = await supabase
      .from('chat_rooms')
      .select('*')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .eq('status', 'active')
      .neq('room_type', 'random')
      .order('last_message_at', {ascending: false});
    const nextRooms = roomRows || [];
    const otherIds = Array.from(new Set(nextRooms.map(room => room.user_a === userId ? room.user_b : room.user_a)));
    const roomIds = nextRooms.map(room => room.id);
    const [{data: accountRows}, {data: mediaRows}, {data: messageRows}] = await Promise.all([
      otherIds.length ? supabase.from('users').select('*').in('id', otherIds) : Promise.resolve({data: []}),
      otherIds.length ? supabase.from('profile_media').select('*').in('user_id', otherIds).eq('is_primary', true) : Promise.resolve({data: []}),
      roomIds.length ? supabase.from('messages').select('*').in('room_id', roomIds).gt('expires_at', new Date().toISOString()).order('created_at', {ascending: false}).limit(500) : Promise.resolve({data: []}),
    ]);
    setRooms(nextRooms);
    setAccounts((accountRows || []) as Account[]);
    setMedia((mediaRows || []) as Media[]);
    setMessages((messageRows || []) as Message[]);
    setLoading(false);
    const undeliveredRooms = nextRooms.filter(room => (messageRows || []).some(message => message.room_id === room.id && message.sender_id !== userId && !message.delivered_at));
    await Promise.all(undeliveredRooms.map(room => supabase.rpc('mark_room_delivered', {p_room_id: room.id})));
  }, [viewer]);

  useFocusEffect(useCallback(() => {
    void load();
    if (!viewer) return () => undefined;
    const channel = supabase.channel(`native-conversations-${viewer.account.id}`)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'messages'}, () => void load())
      .on('postgres_changes', {event: '*', schema: 'public', table: 'chat_rooms'}, () => void load())
      .on('postgres_changes', {event: '*', schema: 'public', table: 'users'}, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, viewer]));

  const conversations = useMemo<Conversation[]>(() => {
    if (!viewer) return [];
    const userId = viewer.account.id;
    return rooms.flatMap(room => {
      const otherId = room.user_a === userId ? room.user_b : room.user_a;
      const account = accounts.find(item => item.id === otherId);
      if (!account) return [];
      const roomMessages = messages.filter(message => message.room_id === room.id);
      return [{
        room,
        account,
        avatar: media.find(item => item.user_id === otherId)?.cloudinary_url || null,
        last: roomMessages[0] || null,
        unread: roomMessages.filter(message => message.sender_id !== userId && !message.read_at).length,
      }];
    }).sort((a, b) => new Date(b.last?.created_at || b.room.last_message_at).getTime() - new Date(a.last?.created_at || a.room.last_message_at).getTime());
  }, [accounts, media, messages, rooms, viewer]);
  const active = useMemo(() => conversations.filter(item => item.account.status === 'online').slice(0, 12), [conversations]);
  const visibleConversations = filter === 'unread' ? conversations.filter(item => item.unread > 0) : conversations;

  return (
    <View style={styles.root}>
      <ScreenHeader title="Messages" eyebrow="Stay connected" coins={Number(viewer?.wallet.coins_balance || 0)} unreadNotifications={unreadNotifications} onNotifications={() => navigation.navigate('Notifications')} />
      <FlatList
        data={visibleConversations}
        keyExtractor={item => item.room.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.coral} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<View style={styles.listHeader}>{active.length ? <View style={styles.activeSection}><View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Active now</Text><Text style={styles.sectionMeta}>{active.length} online</Text></View><FlatList horizontal data={active} keyExtractor={item => `active-${item.room.id}`} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeList} renderItem={({item}) => <Pressable onPress={() => navigation.navigate('ChatRoom', {roomId: item.room.id, otherUserId: item.account.id, title: item.account.display_name})} style={styles.activePerson}><View style={styles.activeRing}>{item.avatar ? <Image source={{uri: item.avatar}} style={styles.activeAvatar} /> : <View style={[styles.activeAvatar, styles.fallback]}><Text style={styles.activeInitial}>{item.account.display_name.charAt(0)}</Text></View>}<View style={styles.activeDot} /></View><Text numberOfLines={1} style={styles.activeName}>{item.account.display_name.split(' ')[0]}</Text></Pressable>} /></View> : null}<View style={styles.conversationHeading}><Text style={styles.sectionTitle}>Conversations</Text><View style={styles.segment}><Pressable onPress={() => setFilter('all')} style={[styles.segmentButton, filter === 'all' && styles.segmentActive]}><Text style={[styles.segmentText, filter === 'all' && styles.segmentTextActive]}>All</Text></Pressable><Pressable onPress={() => setFilter('unread')} style={[styles.segmentButton, filter === 'unread' && styles.segmentActive]}><Text style={[styles.segmentText, filter === 'unread' && styles.segmentTextActive]}>Unread</Text></Pressable></View></View></View>}
        renderItem={({item}) => (
          <Pressable
            onPress={() => navigation.navigate('ChatRoom', {roomId: item.room.id, otherUserId: item.account.id, title: item.account.display_name})}
            style={({pressed}) => [styles.row, pressed && styles.pressed]}>
            <View>
              {item.avatar ? <Image source={{uri: item.avatar}} style={styles.avatar} /> : <View style={[styles.avatar, styles.fallback]}><Text style={styles.initial}>{item.account.display_name.charAt(0)}</Text></View>}
              <View style={[styles.status, item.account.status === 'online' && styles.statusOnline, (item.account.status === 'busy' || item.account.status === 'in_call') && styles.statusBusy]} />
            </View>
            <View style={styles.copy}>
              <View style={styles.titleRow}><Text numberOfLines={1} style={styles.name}>{item.account.display_name}</Text><Text style={styles.time}>{relativeTime(item.last?.created_at || item.room.last_message_at)}</Text></View>
              <Text numberOfLines={1} style={styles.preview}>{preview(item.last)}</Text>
            </View>
            {item.unread ? <View style={styles.badge}><Text style={styles.badgeText}>{item.unread > 9 ? '9+' : item.unread}</Text></View> : null}
          </Pressable>
        )}
        ListEmptyComponent={!loading ? <View style={styles.empty}><View style={styles.emptyIcon}><MessageCircle size={31} color={colors.teal} /></View><Text style={styles.emptyTitle}>{filter === 'unread' ? 'No unread messages' : 'No conversations yet'}</Text><Text style={styles.emptyText}>{filter === 'unread' ? 'You are all caught up.' : 'Start a conversation from Discover.'}</Text></View> : null}
      />
    </View>
  );
}

function preview(message: Message | null) {
  if (!message) return 'Start the conversation';
  if (message.message_type === 'text' || message.message_type === 'emoji') return message.content || 'New message';
  return message.message_type === 'image' ? 'Sent a photo' : `Sent ${message.message_type}`;
}
function relativeTime(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.canvas},
  list: {padding: spacing.md, paddingBottom: 112},
  listHeader: {marginHorizontal: -spacing.md, gap: spacing.md, marginBottom: spacing.sm}, activeSection: {paddingTop: spacing.sm, gap: spacing.sm}, sectionHeading: {paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, sectionTitle: {fontSize: 17, fontWeight: '900', color: colors.ink}, sectionMeta: {fontSize: 12, color: colors.muted}, activeList: {paddingHorizontal: spacing.md, gap: spacing.sm}, activePerson: {width: 64, alignItems: 'center', gap: 5}, activeRing: {width: 58, height: 58, padding: 2, borderWidth: 2, borderColor: colors.teal, borderRadius: 29}, activeAvatar: {width: '100%', height: '100%', borderRadius: 27}, activeInitial: {fontWeight: '900', color: colors.teal}, activeDot: {position: 'absolute', right: 0, bottom: 0, width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.success}, activeName: {width: 64, fontSize: 11, textAlign: 'center', fontWeight: '700', color: colors.ink}, conversationHeading: {paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, segment: {height: 34, padding: 3, flexDirection: 'row', borderRadius: 17, backgroundColor: colors.surface}, segmentButton: {minWidth: 48, paddingHorizontal: spacing.sm, borderRadius: 14, alignItems: 'center', justifyContent: 'center'}, segmentActive: {backgroundColor: colors.black}, segmentText: {fontSize: 11, fontWeight: '800', color: colors.muted}, segmentTextActive: {color: colors.white},
  row: {minHeight: 80, marginBottom: spacing.xs, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: 8, backgroundColor: colors.surface},
  pressed: {backgroundColor: colors.tealSoft},
  avatar: {width: 56, height: 56, borderRadius: 28},
  fallback: {backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center'},
  initial: {fontSize: 22, fontWeight: '900', color: colors.teal},
  status: {position: 'absolute', right: 0, bottom: 1, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.muted},
  statusOnline: {backgroundColor: colors.success},
  statusBusy: {backgroundColor: colors.mustard},
  copy: {flex: 1, gap: 4},
  titleRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  name: {flex: 1, fontSize: 16, fontWeight: '900', color: colors.ink},
  time: {fontSize: 12, color: colors.muted},
  preview: {fontSize: 14, color: colors.muted},
  badge: {minWidth: 23, height: 23, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.coral},
  badgeText: {fontSize: 11, fontWeight: '900', color: colors.white},
  empty: {alignItems: 'center', padding: spacing.xxl, gap: spacing.xs}, emptyIcon: {width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealSoft},
  emptyTitle: {fontSize: 20, fontWeight: '900', color: colors.ink},
  emptyText: {fontSize: 14, color: colors.muted, textAlign: 'center'},
});
