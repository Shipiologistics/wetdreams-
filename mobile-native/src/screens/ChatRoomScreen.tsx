import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import ImagePicker from 'react-native-image-crop-picker';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ChevronLeft, Gift, ImagePlus, MoreVertical, Phone, Send, Video, X} from 'lucide-react-native';
import {authenticatedPost} from '../lib/api';
import {uploadToCloudinary} from '../lib/cloudinary';
import {getDeviceId} from '../lib/device';
import {supabase} from '../lib/supabase';
import {useApp} from '../state/AppProvider';
import {colors, radii, spacing} from '../theme';
import type {Database} from '../types/database';
import type {RootStackParamList} from '../types/navigation';
import {WetButton} from '../components/WetButton';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatRoom'>;
type Message = Database['public']['Tables']['messages']['Row'];
type Account = Database['public']['Tables']['users']['Row'];

export function ChatRoomScreen({route, navigation}: Props) {
  const insets = useSafeAreaInsets();
  const {roomId} = route.params;
  const {viewer, refreshViewer} = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<Account | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [viewerBlocked, setViewerBlocked] = useState(false);
  const [otherBlocked, setOtherBlocked] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    if (!viewer) return;
    const [{data: room}, {data: rows}, {data: blockState}] = await Promise.all([
      supabase.from('chat_rooms').select('*').eq('id', roomId).single(),
      supabase.from('messages').select('*').eq('room_id', roomId).gt('expires_at', new Date().toISOString()).order('created_at'),
      supabase.rpc('get_room_block_state', {p_room_id: roomId}),
    ]);
    if (!room) return;
    const otherId = room.user_a === viewer.account.id ? room.user_b : room.user_a;
    const [{data: account}, {data: media}] = await Promise.all([
      supabase.from('users').select('*').eq('id', otherId).single(),
      supabase.from('profile_media').select('cloudinary_url').eq('user_id', otherId).eq('is_primary', true).maybeSingle(),
    ]);
    setOther(account);
    setAvatar(media?.cloudinary_url || null);
    setMessages(rows || []);
    setViewerBlocked(Boolean(blockState?.[0]?.viewer_blocked_other));
    setOtherBlocked(Boolean(blockState?.[0]?.other_blocked_viewer));
    await supabase.rpc('mark_room_delivered', {p_room_id: roomId});
    await supabase.rpc('mark_room_read', {p_room_id: roomId});
    await refreshViewer();
  }, [refreshViewer, roomId, viewer]);

  useEffect(() => {
    void load();
    const channel = supabase.channel(`native-room-${roomId}`)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}`}, () => void load())
      .on('postgres_changes', {event: '*', schema: 'public', table: 'calls', filter: `room_id=eq.${roomId}`}, payload => {
        const call = payload.new as Database['public']['Tables']['calls']['Row'];
        if (viewer && call.receiver_id === viewer.account.id && call.status === 'ringing') navigation.navigate('Call', {callId: call.id, incoming: true});
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, navigation, roomId, viewer]);

  useEffect(() => {
    if (messages.length) requestAnimationFrame(() => listRef.current?.scrollToEnd({animated: false}));
  }, [messages.length]);

  async function sendMessage(kind: 'text' | 'image', image?: {url: string; publicId: string; resourceType: string}) {
    if (!viewer || viewerBlocked || otherBlocked) return;
    const content = text.trim();
    if (kind === 'text' && !content) return;
    setSending(true);
    const mediaFields = image ? {
      p_cloudinary_url: image.url,
      p_cloudinary_public_id: image.publicId,
      p_cloudinary_resource_type: image.resourceType,
    } : {};
    const {data: message, error} = await supabase.rpc('send_message', {
      p_room_id: roomId,
      p_message_type: kind,
      p_content: kind === 'text' ? content : '',
      ...mediaFields,
    });
    if (error || !message) {
      setSending(false);
      return Alert.alert('Message not sent', error?.message || 'Please try again.');
    }
    setText('');
    setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message]);
    setSending(false);
    void authenticatedPost('/api/messages/notify', {messageId: message.id}).catch(() => undefined);
    await refreshViewer();
  }

  async function addPhoto() {
    try {
      const selected = await ImagePicker.openPicker({mediaType: 'photo', cropping: false, forceJpg: true});
      setSending(true);
      const uploaded = await uploadToCloudinary(selected);
      await sendMessage('image', uploaded);
    } catch (error) {
      setSending(false);
      if (!String(error).includes('cancel')) Alert.alert('Photo failed', 'Could not send this photo.');
    }
  }

  async function startCall(type: 'audio' | 'video') {
    if (!other || viewerBlocked || otherBlocked) return;
    if (other.status === 'busy' || other.status === 'in_call') return Alert.alert('Busy', `${other.display_name} is on another call.`);
    const {data: callId, error} = await supabase.rpc('start_call', {p_room_id: roomId, p_call_type: type});
    if (error || !callId) {
      if (error?.message.includes('INSUFFICIENT_BALANCE')) return Alert.alert('Add coins first', 'Open Wallet and choose a coin pack.');
      return Alert.alert('Could not start call', error?.message || 'Please try again.');
    }
    void authenticatedPost('/api/calls/notify', {callId}).catch(() => undefined);
    navigation.navigate('Call', {callId});
  }

  async function blockOrUnblock() {
    if (!other) return;
    const {error} = viewerBlocked
      ? await supabase.rpc('unblock_user', {p_blocked_user: other.id})
      : await supabase.rpc('block_user', {p_blocked_user: other.id, p_device_id: await getDeviceId()});
    if (error) return Alert.alert('Could not update block', error.message);
    setMenuOpen(false);
    await load();
  }

  async function report() {
    if (!other) return;
    const {error} = await supabase.rpc('report_user', {p_reason: 'Reported from native chat', p_reported_user: other.id, p_room_id: roomId});
    setMenuOpen(false);
    Alert.alert(error ? 'Report failed' : 'Report sent', error?.message || 'Our safety team will review it.');
  }

  async function sendTip(amount: number) {
    const {error} = await supabase.rpc('send_tip', {p_amount: amount, p_room_id: roomId, p_call_id: null});
    if (error) return Alert.alert(error.message.includes('INSUFFICIENT') ? 'Not enough coins' : 'Tip failed', error.message.includes('INSUFFICIENT') ? 'Add coins in Wallet and try again.' : error.message);
    setTipOpen(false);
    await refreshViewer();
    Alert.alert('Tip sent', `${amount} coins sent to ${other?.display_name || 'host'}.`);
  }

  const blocked = viewerBlocked || otherBlocked;
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}><ChevronLeft size={29} color={colors.ink} /></Pressable>
        {avatar ? <Image source={{uri: avatar}} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarText}>{other?.display_name?.charAt(0) || '?'}</Text></View>}
        <Pressable style={styles.identity} onPress={() => other && navigation.navigate('HostProfile', {userId: other.id})}>
          <Text numberOfLines={1} style={styles.name}>{other?.display_name || route.params.title || 'Chat'}</Text>
          <Text style={styles.status}>{other?.status === 'online' ? 'online' : other?.status === 'busy' || other?.status === 'in_call' ? 'busy' : other ? 'offline' : 'loading...'}</Text>
        </Pressable>
        <Pressable disabled={blocked} onPress={() => void startCall('audio')} style={styles.headerButton}><Phone size={24} color={blocked ? colors.muted : colors.ink} /></Pressable>
        <Pressable disabled={blocked} onPress={() => void startCall('video')} style={styles.headerButton}><Video size={24} color={blocked ? colors.muted : colors.ink} /></Pressable>
        <Pressable onPress={() => setMenuOpen(true)} style={styles.headerButton}><MoreVertical size={24} color={colors.ink} /></Pressable>
      </View>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messages}
        renderItem={({item}) => <MessageBubble message={item} mine={item.sender_id === viewer?.account.id} />}
        ListHeaderComponent={<View style={styles.person}><View style={[styles.largeAvatar, styles.avatarFallback]}>{avatar ? <Image source={{uri: avatar}} style={styles.largeAvatar} /> : <Text style={styles.largeInitial}>{other?.display_name?.charAt(0) || '?'}</Text>}</View><Text style={styles.personName}>{other?.display_name}</Text><Text style={styles.username}>@{other?.username}</Text></View>}
      />
      {blocked ? <View style={styles.blocked}><Text style={styles.blockedText}>{viewerBlocked ? 'You blocked this user.' : 'Messaging and calls are unavailable.'}</Text></View> : (
        <View style={[styles.composer, {paddingBottom: Math.max(insets.bottom, spacing.sm)}]}>
          <Pressable onPress={() => void addPhoto()} style={styles.composerIcon}><ImagePlus size={25} color={colors.ink} /></Pressable>
          <Pressable onPress={() => setTipOpen(true)} style={styles.composerIcon}><Gift size={24} color={colors.ink} /></Pressable>
          <TextInput value={text} onChangeText={setText} placeholder="Write a message" placeholderTextColor={colors.muted} multiline style={styles.input} />
          <Pressable disabled={sending || !text.trim()} onPress={() => void sendMessage('text')} style={[styles.send, (sending || !text.trim()) && styles.sendDisabled]}><Send size={23} color={colors.white} /></Pressable>
        </View>
      )}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}><Pressable style={styles.modalBackdrop} onPress={() => setMenuOpen(false)}><View style={styles.menu}><WetButton title={viewerBlocked ? 'Unblock user' : 'Block user'} variant={viewerBlocked ? 'outline' : 'danger'} onPress={() => void blockOrUnblock()} /><WetButton title="Report user" variant="outline" onPress={() => void report()} /></View></Pressable></Modal>
      <Modal visible={tipOpen} transparent animationType="slide" onRequestClose={() => setTipOpen(false)}><Pressable style={styles.modalBackdrop} onPress={() => setTipOpen(false)}><Pressable style={styles.tipSheet} onPress={() => undefined}><View style={styles.tipHeading}><View><Text style={styles.tipEyebrow}>Make their day</Text><Text style={styles.tipTitle}>Send a tip</Text></View><Pressable onPress={() => setTipOpen(false)} style={styles.headerButton}><X size={24} color={colors.ink} /></Pressable></View><Text style={styles.tipBalance}>Balance: {Number(viewer?.wallet.coins_balance || 0)} coins</Text><View style={styles.tipGrid}>{[5, 10, 25, 50].map(amount => <Pressable key={amount} onPress={() => void sendTip(amount)} style={styles.tipAmount}><Gift size={22} color={colors.coral} /><Text style={styles.tipAmountText}>{amount}</Text><Text style={styles.tipCoin}>coins</Text></Pressable>)}</View></Pressable></Pressable></Modal>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({message, mine}: {message: Message; mine: boolean}) {
  const time = new Date(message.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  const ticks = message.read_at ? '✓✓' : message.delivered_at ? '✓✓' : '✓';
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
      {message.message_type === 'image' && message.cloudinary_url ? <Image source={{uri: message.cloudinary_url}} style={styles.messageImage} /> : <Text style={styles.messageText}>{message.content}</Text>}
      <View style={styles.meta}><Text style={styles.time}>{time}</Text>{mine ? <Text style={[styles.ticks, message.read_at && styles.read]}>{ticks}</Text> : null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#F3F5F1'},
  header: {height: 74, paddingHorizontal: spacing.xs, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line},
  headerButton: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  avatar: {width: 44, height: 44, borderRadius: 22},
  avatarFallback: {backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center'},
  avatarText: {fontSize: 18, fontWeight: '900', color: colors.teal},
  identity: {flex: 1, minWidth: 0, paddingHorizontal: spacing.xs},
  name: {fontSize: 17, fontWeight: '900', color: colors.ink},
  status: {fontSize: 12, color: colors.muted},
  messages: {padding: spacing.md, gap: spacing.xs, flexGrow: 1},
  person: {alignItems: 'center', paddingVertical: spacing.lg, gap: 3},
  largeAvatar: {width: 94, height: 94, borderRadius: 47},
  largeInitial: {fontSize: 34, fontWeight: '900', color: colors.teal},
  personName: {fontSize: 22, fontWeight: '900', color: colors.ink},
  username: {color: colors.muted},
  bubble: {maxWidth: '82%', minWidth: 92, padding: spacing.sm, borderRadius: radii.md, marginVertical: 2},
  mine: {alignSelf: 'flex-end', backgroundColor: '#DDF3EF'},
  theirs: {alignSelf: 'flex-start', backgroundColor: colors.surface},
  messageText: {fontSize: 16, lineHeight: 22, color: colors.ink, paddingRight: spacing.sm},
  messageImage: {width: 230, aspectRatio: 1, borderRadius: radii.sm, backgroundColor: colors.line},
  meta: {alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3},
  time: {fontSize: 10, color: colors.muted},
  ticks: {fontSize: 12, fontWeight: '900', color: colors.muted},
  read: {color: '#1686C9'},
  composer: {padding: spacing.xs, flexDirection: 'row', alignItems: 'flex-end', gap: 4, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line},
  composerIcon: {width: 43, height: 48, alignItems: 'center', justifyContent: 'center'},
  input: {flex: 1, minHeight: 48, maxHeight: 112, paddingHorizontal: spacing.md, paddingTop: 13, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, color: colors.ink, fontSize: 16, backgroundColor: colors.canvas},
  send: {width: 49, height: 49, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coral},
  sendDisabled: {opacity: 0.45},
  blocked: {minHeight: 62, padding: spacing.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface},
  blockedText: {fontWeight: '800', color: colors.danger},
  modalBackdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,18,16,0.45)'},
  menu: {padding: spacing.lg, paddingBottom: 34, gap: spacing.sm, backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18},
  tipSheet: {padding: spacing.lg, paddingBottom: 34, gap: spacing.md, backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18},
  tipHeading: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  tipEyebrow: {fontSize: 12, fontWeight: '900', textTransform: 'uppercase', color: colors.teal},
  tipTitle: {fontSize: 27, fontWeight: '900', color: colors.ink},
  tipBalance: {fontSize: 14, color: colors.muted},
  tipGrid: {flexDirection: 'row', gap: spacing.xs},
  tipAmount: {flex: 1, minHeight: 96, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas},
  tipAmountText: {fontSize: 21, fontWeight: '900', color: colors.ink},
  tipCoin: {fontSize: 11, color: colors.muted},
});
