import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import notifee from '@notifee/react-native';
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  Image,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
  RtcSurfaceView,
  type IRtcEngine,
  type IRtcEngineEventHandler,
} from 'react-native-agora';
import {Camera, CameraOff, Gift, Mic, MicOff, Phone, PhoneOff, RotateCcw, Volume2} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {authenticatedPost} from '../lib/api';
import {TipSheet} from '../components/TipSheet';
import {supabase} from '../lib/supabase';
import {useApp} from '../state/AppProvider';
import {colors, radii, spacing} from '../theme';
import type {Database} from '../types/database';
import type {RootStackParamList} from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Call'>;
type Call = Database['public']['Tables']['calls']['Row'];
type AgoraToken = {appId: string; channel: string; token: string; uid: string; expiresAt: number};
const SecureWindow = NativeModules.SecureWindow as {setSecure?: (enabled: boolean) => void} | undefined;

export function CallScreen({route, navigation}: Props) {
  const insets = useSafeAreaInsets();
  const {callId} = route.params;
  const {viewer, refreshViewer} = useApp();
  const [call, setCall] = useState<Call | null>(null);
  const [otherName, setOtherName] = useState('Kizo user');
  const [otherAvatar, setOtherAvatar] = useState<string | null>(null);
  const [otherIsHost, setOtherIsHost] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [tipText, setTipText] = useState<string | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const engineRef = useRef<IRtcEngine | null>(null);
  const initializedFor = useRef<string | null>(null);
  const closedRef = useRef(false);
  const tipScale = useRef(new Animated.Value(0)).current;

  const closeCallScreen = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace('Main');
  }, [navigation]);

  const loadCall = useCallback(async () => {
    if (!viewer) return;
    const {data: nextCall} = await supabase.from('calls').select('*').eq('id', callId).single();
    if (!nextCall) return;
    setCall(nextCall);
    const otherId = nextCall.caller_id === viewer.account.id ? nextCall.receiver_id : nextCall.caller_id;
    const [{data: account}, {data: media}] = await Promise.all([
      supabase.from('users').select('display_name, is_verified').eq('id', otherId).single(),
      supabase.from('profile_media').select('cloudinary_url').eq('user_id', otherId).eq('is_primary', true).maybeSingle(),
    ]);
    setOtherName(account?.display_name || 'Kizo user');
    setOtherIsHost(account?.is_verified === true);
    setOtherAvatar(media?.cloudinary_url || null);
  }, [callId, viewer]);

  useEffect(() => {
    SecureWindow?.setSecure?.(true);
    return () => SecureWindow?.setSecure?.(false);
  }, []);

  useEffect(() => {
    void loadCall();
    const channel = supabase.channel(`native-call-${callId}`)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'calls', filter: `id=eq.${callId}`}, payload => {
        const next = payload.new as Call;
        setCall(next);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [callId, loadCall]);

  useEffect(() => {
    if (call?.status === 'ongoing' && initializedFor.current !== call.id) {
      initializedFor.current = call.id;
      void notifee.cancelNotification(`call-${call.id}`);
      void joinAgora(call);
    }
    if (call && ['ended', 'declined', 'missed', 'failed'].includes(call.status)) {
      cleanupAgora();
      void refreshViewer();
      const timeout = setTimeout(closeCallScreen, 650);
      return () => clearTimeout(timeout);
    }
  // The RTC setup is keyed to call state and guarded per call id.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call, closeCallScreen, refreshViewer]);

  useEffect(() => {
    if (!call?.started_at || call.status !== 'ongoing') return;
    const update = () => setSeconds(Math.max(0, Math.floor((Date.now() - new Date(call.started_at!).getTime()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [call?.started_at, call?.status]);

  useEffect(() => () => cleanupAgora(), []);

  async function requestMediaPermissions(video: boolean) {
    if (Platform.OS !== 'android') return true;
    const requested = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    if (video) requested.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    const result = await PermissionsAndroid.requestMultiple(requested);
    return requested.every(permission => result[permission] === PermissionsAndroid.RESULTS.GRANTED);
  }

  async function accept() {
    if (!call) return;
    const granted = await requestMediaPermissions(call.call_type === 'video');
    if (!granted) return Alert.alert('Permission required', 'Camera and microphone access are required for this call.');
    const {data: accepted, error} = await supabase.rpc('respond_to_call', {p_call_id: call.id, p_accept: true});
    if (error || !accepted) Alert.alert('Call unavailable', error?.message || 'The caller is no longer available.');
    else await notifee.cancelNotification(`call-${call.id}`);
  }

  async function decline() {
    if (!call) return;
    await supabase.rpc('respond_to_call', {p_call_id: call.id, p_accept: false});
    await notifee.cancelNotification(`call-${call.id}`);
    closeCallScreen();
  }

  async function joinAgora(activeCall: Call) {
    if (!viewer) return;
    setJoining(true);
    try {
      const video = activeCall.call_type === 'video';
      const granted = await requestMediaPermissions(video);
      if (!granted) throw new Error('Camera and microphone permissions are required.');
      const credentials = await authenticatedPost<AgoraToken>('/api/agora/token', {callId: activeCall.id});
      const engine = createAgoraRtcEngine();
      const handler: IRtcEngineEventHandler = {
        onJoinChannelSuccess: () => {
          console.info('[CallScreen] Agora joined', activeCall.id);
          setJoined(true);
          setJoining(false);
        },
        onUserJoined: (_connection, uid) => {
          console.info('[CallScreen] Agora remote joined', uid);
          setRemoteUid(uid);
        },
        onUserOffline: (_connection, uid) => {
          console.info('[CallScreen] Agora remote left', uid);
          setRemoteUid(null);
        },
        onError: (code, message) => {
          console.error('[CallScreen] Agora error', code, message);
          Alert.alert('Call error', message || `Agora could not connect (${code}).`);
        },
      };
      engine.initialize({appId: credentials.appId});
      engine.registerEventHandler(handler);
      engine.enableAudio();
      engine.setEnableSpeakerphone(true);
      if (video) {
        engine.enableVideo();
        engine.startPreview();
      }
      const result = engine.joinChannelWithUserAccount(
        credentials.token,
        credentials.channel,
        credentials.uid,
        {
          channelProfile: ChannelProfileType.ChannelProfileCommunication,
          clientRoleType: ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          publishCameraTrack: video,
          autoSubscribeAudio: true,
          autoSubscribeVideo: video,
        },
      );
      if (result < 0) throw new Error(`Agora join failed (${result}).`);
      engineRef.current = engine;
    } catch (error) {
      setJoining(false);
      Alert.alert('Could not connect', error instanceof Error ? error.message : 'Call setup failed.');
      await supabase.rpc('end_call', {p_call_id: activeCall.id});
    }
  }

  function cleanupAgora() {
    const engine = engineRef.current;
    engineRef.current = null;
    if (engine) {
      engine.leaveChannel();
      engine.release();
    }
  }

  async function endCall() {
    if (call) await supabase.rpc('end_call', {p_call_id: call.id});
    if (call) await notifee.cancelNotification(`call-${call.id}`);
    cleanupAgora();
    await refreshViewer();
    closeCallScreen();
  }

  function toggleMute() {
    const next = !muted;
    engineRef.current?.muteLocalAudioStream(next);
    setMuted(next);
  }
  function toggleVideo() {
    const next = !cameraOff;
    engineRef.current?.muteLocalVideoStream(next);
    setCameraOff(next);
  }
  function toggleSpeaker() {
    const next = !speaker;
    engineRef.current?.setEnableSpeakerphone(next);
    setSpeaker(next);
  }

  async function sendTip(amount: number) {
    if (!call) return false;
    const {error} = await supabase.rpc('send_tip', {p_amount: amount, p_room_id: call.room_id, p_call_id: call.id});
    if (error) { Alert.alert(error.message.includes('INSUFFICIENT') ? 'Not enough coins' : 'Tip failed', error.message.includes('INSUFFICIENT') ? 'Request coins from Wallet on WhatsApp after the call.' : error.message); return false; }
    await refreshViewer();
    setTipText(`${amount} coin tip sent!`);
    tipScale.setValue(0);
    Animated.sequence([
      Animated.spring(tipScale, {toValue: 1, useNativeDriver: true}),
      Animated.delay(1300),
      Animated.timing(tipScale, {toValue: 0, duration: 240, useNativeDriver: true}),
    ]).start(() => setTipText(null));
    return true;
  }

  const incoming = call && viewer && call.receiver_id === viewer.account.id;
  const video = call?.call_type === 'video';
  const statusText = call?.status === 'ringing'
    ? (incoming ? `Incoming ${call.call_type} call` : 'Calling...')
    : joining
      ? 'Connecting securely...'
      : joined && remoteUid !== null
        ? `Connected · ${formatDuration(seconds)}`
        : joined
          ? 'Waiting for the other person...'
          : 'Preparing call...';
  return (
    <View style={styles.root}>
      {video && joined ? (
        <>
          {remoteUid !== null ? <RtcSurfaceView style={StyleSheet.absoluteFill} canvas={{uid: remoteUid}} /> : <View style={[StyleSheet.absoluteFill, styles.waiting]}><Text style={styles.waitingText}>Waiting for video...</Text></View>}
          {!cameraOff ? <View style={styles.localVideo}><RtcSurfaceView style={StyleSheet.absoluteFill} canvas={{uid: 0}} zOrderMediaOverlay /></View> : null}
        </>
      ) : (
        <View style={styles.audioStage}>
          {otherAvatar ? <Image source={{uri: otherAvatar}} style={styles.heroAvatar} /> : <View style={[styles.heroAvatar, styles.heroFallback]}><Text style={styles.heroInitial}>{otherName.charAt(0)}</Text></View>}
        </View>
      )}
      <View style={styles.topCopy}><Text style={styles.otherName}>{otherName}</Text><Text style={styles.callStatus}>{statusText}</Text></View>
      {tipText ? <Animated.View style={[styles.tipToast, {transform: [{scale: tipScale}]}]}><Gift size={30} color={colors.coral} /><Text style={styles.tipToastText}>{tipText}</Text></Animated.View> : null}
      {call?.status === 'ringing' && incoming ? (
        <View style={[styles.incomingActions, {bottom: 70 + insets.bottom}]}>
          <CallControl color="rgba(197,47,73,0.78)" icon={<PhoneOff size={29} color={colors.white} />} label="Decline" onPress={() => void decline()} />
          <CallControl color="rgba(22,132,91,0.78)" icon={<Phone size={29} color={colors.white} />} label="Accept" onPress={() => void accept()} />
        </View>
      ) : (
        <View style={[styles.controlsPanel, {paddingBottom: 35 + insets.bottom}]}>
          <View style={styles.controls}>
            <CallControl icon={muted ? <MicOff size={25} color={colors.white} /> : <Mic size={25} color={colors.white} />} label={muted ? 'Unmute' : 'Mute'} onPress={toggleMute} />
            <CallControl icon={<Volume2 size={25} color={colors.white} />} label={speaker ? 'Speaker' : 'Earpiece'} onPress={toggleSpeaker} />
            {video ? <CallControl icon={cameraOff ? <CameraOff size={25} color={colors.white} /> : <Camera size={25} color={colors.white} />} label={cameraOff ? 'Camera on' : 'Camera off'} onPress={toggleVideo} /> : null}
            {video ? <CallControl icon={<RotateCcw size={25} color={colors.white} />} label="Flip" onPress={() => engineRef.current?.switchCamera()} /> : null}
            {otherIsHost ? <CallControl icon={<Gift size={25} color={colors.white} />} label="Tip" onPress={() => setTipOpen(true)} /> : null}
          </View>
          <Pressable onPress={() => void endCall()} style={styles.end}><PhoneOff size={31} color={colors.white} /></Pressable>
        </View>
      )}
      <TipSheet visible={otherIsHost && tipOpen} balance={Number(viewer?.wallet.coins_balance || 0)} onClose={() => setTipOpen(false)} onSend={sendTip} />
    </View>
  );
}

function CallControl({icon, label, onPress, color}: {icon: React.ReactNode; label: string; onPress: () => void; color?: string}) {
  return <Pressable onPress={onPress} style={styles.controlWrap}><View style={[styles.control, color ? {backgroundColor: color} : null]}>{icon}</View><Text style={styles.controlLabel}>{label}</Text></Pressable>;
}
function formatDuration(value: number) { const minutes = Math.floor(value / 60).toString().padStart(2, '0'); return `${minutes}:${(value % 60).toString().padStart(2, '0')}`; }

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#101412'},
  waiting: {alignItems: 'center', justifyContent: 'center', backgroundColor: '#171C19'},
  waitingText: {color: colors.white, fontWeight: '700'},
  audioStage: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  heroAvatar: {width: 172, height: 172, borderRadius: 86, borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)'},
  heroFallback: {backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center'},
  heroInitial: {fontSize: 64, fontWeight: '900', color: colors.teal},
  localVideo: {position: 'absolute', right: spacing.md, top: 126, width: 112, height: 160, borderRadius: radii.md, overflow: 'hidden', backgroundColor: '#171C19'},
  topCopy: {position: 'absolute', top: 45, left: spacing.lg, right: spacing.lg, alignItems: 'center'},
  otherName: {color: colors.white, fontSize: 26, fontWeight: '900'},
  callStatus: {marginTop: 4, color: 'rgba(255,255,255,0.75)', fontSize: 15},
  tipToast: {position: 'absolute', top: '36%', alignSelf: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surface},
  tipToastText: {fontSize: 18, fontWeight: '900', color: colors.ink},
  incomingActions: {position: 'absolute', left: 45, right: 45, flexDirection: 'row', justifyContent: 'space-between'},
  controlsPanel: {position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, alignItems: 'center', gap: spacing.md},
  controls: {maxWidth: 350, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center', gap: spacing.xs}, controlWrap: {width: 62, alignItems: 'center', gap: 5}, control: {width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlay, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)'}, controlLabel: {fontSize: 10, fontWeight: '700', color: colors.white, textAlign: 'center'}, end: {width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(197,47,73,0.78)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)'},
});
