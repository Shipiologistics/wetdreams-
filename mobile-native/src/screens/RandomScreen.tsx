import {useNavigation} from '@react-navigation/native';
import type {NavigationProp} from '@react-navigation/native';
import {useEffect, useRef, useState} from 'react';
import {Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {HeartHandshake, Phone, Send, ShieldCheck, Sparkles, Video, X} from 'lucide-react-native';
import {ScreenHeader} from '../components/ScreenHeader';
import {WetButton} from '../components/WetButton';
import {authenticatedPost} from '../lib/api';
import {supabase} from '../lib/supabase';
import {useApp} from '../state/AppProvider';
import {colors, radii, spacing} from '../theme';
import type {Database} from '../types/database';
import type {RootStackParamList} from '../types/navigation';

type Message = Database['public']['Tables']['messages']['Row'];
type State = 'idle' | 'waiting' | 'matched';

export function RandomScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const {viewer, unreadNotifications} = useApp();
  const [state, setState] = useState<State>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [otherId, setOtherId] = useState<string | null>(null);
  const [otherName, setOtherName] = useState('New connection');
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const resetNext = useRef(false);

  useEffect(() => {
    if (state !== 'waiting' || !viewer) return;
    let mounted = true;
    const match = async () => {
      const {data, error} = await supabase.rpc('match_random_chat', {p_reset: resetNext.current});
      resetNext.current = false;
      if (!mounted || (error && error.message.includes('MATCH_RETRY'))) return;
      if (error) { setState('idle'); return Alert.alert('Match failed', error.message); }
      if (data) void openRoom(data);
    };
    const channel = supabase.channel(`native-random-queue-${viewer.account.id}`)
      .on('postgres_changes', {event: 'UPDATE', schema: 'public', table: 'random_chat_queue', filter: `user_id=eq.${viewer.account.id}`}, payload => {
        const row = payload.new as {status: string; matched_room_id: string | null};
        if (row.status === 'matched' && row.matched_room_id) void openRoom(row.matched_room_id);
      })
      .subscribe();
    void match();
    const timer = setInterval(() => void match(), 1600);
    return () => { mounted = false; clearInterval(timer); void supabase.removeChannel(channel); };
  // Queue subscriptions are rebuilt only when the queue state or viewer changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, viewer]);

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`native-random-room-${roomId}`)
      .on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}`}, payload => setMessages(current => current.some(item => item.id === (payload.new as Message).id) ? current : [...current, payload.new as Message]))
      .on('postgres_changes', {event: 'UPDATE', schema: 'public', table: 'chat_rooms', filter: `id=eq.${roomId}`}, payload => {
        const room = payload.new as Database['public']['Tables']['chat_rooms']['Row'];
        if (room.status !== 'active') resetRoom();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [roomId]);

  async function openRoom(id: string) {
    if (!viewer || roomId === id) return;
    const {data: room} = await supabase.from('chat_rooms').select('*').eq('id', id).single();
    if (!room) return;
    const nextOtherId = room.user_a === viewer.account.id ? room.user_b : room.user_a;
    const [{data: account}, {data: existing}] = await Promise.all([
      supabase.from('users').select('display_name').eq('id', nextOtherId).single(),
      supabase.from('messages').select('*').eq('room_id', id).gt('expires_at', new Date().toISOString()).order('created_at'),
    ]);
    setRoomId(id);
    setOtherId(nextOtherId);
    setOtherName(account?.display_name || 'New connection');
    setMessages(existing || []);
    setState('matched');
  }

  function start() {
    resetNext.current = true;
    setMessages([]);
    setRoomId(null);
    setOtherId(null);
    setState('waiting');
  }

  async function cancel() {
    await supabase.rpc('cancel_random_chat');
    resetRoom();
  }

  async function end() {
    if (roomId) await supabase.rpc('disconnect_random_chat', {p_room_id: roomId});
    resetRoom();
  }

  function resetRoom() {
    setRoomId(null);
    setOtherId(null);
    setOtherName('New connection');
    setMessages([]);
    setText('');
    setState('idle');
  }

  async function send() {
    if (!roomId || !text.trim()) return;
    const content = text.trim();
    setText('');
    const {data, error} = await supabase.rpc('send_message', {p_room_id: roomId, p_message_type: 'text', p_content: content});
    if (error) Alert.alert('Not sent', error.message);
    else if (data) setMessages(current => current.some(item => item.id === data.id) ? current : [...current, data]);
  }

  async function call(type: 'audio' | 'video') {
    if (!roomId || !otherId) return;
    const {data: callId, error} = await supabase.rpc('start_call', {p_room_id: roomId, p_call_type: type});
    if (error || !callId) return Alert.alert(error?.message.includes('INSUFFICIENT') ? 'Add coins first' : 'Call failed', error?.message.includes('INSUFFICIENT') ? 'Random chat is free, but calls use the other person’s per-minute rate.' : error?.message || 'Please try again.');
    void authenticatedPost('/api/calls/notify', {callId}).catch(() => undefined);
    navigation.navigate('Call', {callId});
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Random" eyebrow="Meet someone new" coins={Number(viewer?.wallet.coins_balance || 0)} unreadNotifications={unreadNotifications} onNotifications={() => navigation.navigate('Notifications')} />
      {state === 'matched' ? (
        <View style={styles.chat}>
          <View style={styles.matchHeader}><View><Text style={styles.connected}>Connected now</Text><Text style={styles.matchName}>{otherName}</Text></View><View style={styles.callActions}><Pressable onPress={() => void call('audio')} style={styles.icon}><Phone size={22} color={colors.ink} /></Pressable><Pressable onPress={() => void call('video')} style={styles.icon}><Video size={22} color={colors.ink} /></Pressable></View></View>
          <Text style={styles.freeNote}>Messages are free here. Calls use the receiver’s per-minute rate.</Text>
          <FlatList data={messages} keyExtractor={item => item.id} contentContainerStyle={styles.messages} renderItem={({item}) => <View style={[styles.bubble, item.sender_id === viewer?.account.id ? styles.mine : styles.theirs]}><Text style={styles.message}>{item.content}</Text><Text style={styles.time}>{new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</Text></View>} />
          <View style={styles.composer}><TextInput value={text} onChangeText={setText} placeholder="Say hello" placeholderTextColor={colors.muted} style={styles.input} /><Pressable onPress={() => void send()} style={styles.send}><Send size={22} color={colors.white} /></Pressable></View>
          <WetButton title="End random chat" variant="danger" onPress={() => void end()} icon={<X size={20} color={colors.white} />} style={styles.end} />
        </View>
      ) : (
        <View style={styles.stage}>
          <View style={[styles.visual, state === 'waiting' && styles.searching]}><HeartHandshake size={60} color={colors.teal} /></View>
          <Sparkles size={23} color={colors.mustard} />
          <Text style={styles.title}>{state === 'waiting' ? 'Looking nearby' : 'Meet someone new'}</Text>
          <Text style={styles.copy}>{state === 'waiting' ? 'Hold on, this usually takes a moment.' : 'Each start connects you to the next available person. Random chats disappear when they end.'}</Text>
          {state === 'waiting' ? <WetButton title="Cancel search" variant="outline" onPress={() => void cancel()} /> : <WetButton title="Start random chat" onPress={start} icon={<HeartHandshake size={21} color={colors.white} />} />}
          <View style={styles.safety}><ShieldCheck size={19} color={colors.teal} /><Text style={styles.safetyText}>18+ only. Keep personal details private.</Text></View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.canvas},
  stage: {flex: 1, padding: spacing.xl, alignItems: 'center', justifyContent: 'center', gap: spacing.md},
  visual: {width: 170, height: 170, borderRadius: 85, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealSoft, borderWidth: 12, borderColor: '#EFF7F5'},
  searching: {borderColor: colors.mustardSoft},
  title: {fontSize: 29, fontWeight: '900', color: colors.ink, textAlign: 'center'},
  copy: {fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center'},
  safety: {marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  safetyText: {fontSize: 12, color: colors.muted},
  chat: {flex: 1},
  matchHeader: {minHeight: 72, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface},
  connected: {fontSize: 11, fontWeight: '900', textTransform: 'uppercase', color: colors.success},
  matchName: {fontSize: 20, fontWeight: '900', color: colors.ink},
  callActions: {flexDirection: 'row', gap: spacing.xs},
  icon: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  freeNote: {padding: spacing.sm, textAlign: 'center', color: colors.teal, backgroundColor: colors.tealSoft, fontSize: 12, fontWeight: '700'},
  messages: {padding: spacing.md, gap: spacing.xs, flexGrow: 1},
  bubble: {maxWidth: '82%', minWidth: 90, padding: spacing.sm, borderRadius: radii.md},
  mine: {alignSelf: 'flex-end', backgroundColor: '#DDF3EF'},
  theirs: {alignSelf: 'flex-start', backgroundColor: colors.surface},
  message: {fontSize: 16, color: colors.ink},
  time: {alignSelf: 'flex-end', fontSize: 10, color: colors.muted},
  composer: {padding: spacing.xs, flexDirection: 'row', gap: spacing.xs, backgroundColor: colors.surface},
  input: {flex: 1, height: 50, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, color: colors.ink},
  send: {width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coral},
  end: {margin: spacing.sm},
});
