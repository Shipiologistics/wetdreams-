import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {BadgeCheck, MapPin, MessageCircle, Phone, Star, Video} from 'lucide-react-native';
import {ScreenHeader} from '../components/ScreenHeader';
import {authenticatedPost} from '../lib/api';
import {supabase} from '../lib/supabase';
import {useApp} from '../state/AppProvider';
import {colors, radii, spacing} from '../theme';
import type {Database} from '../types/database';
import type {RootStackParamList} from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'HostProfile'>;
type Account = Database['public']['Tables']['users']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];
type Media = Database['public']['Tables']['profile_media']['Row'];
type Rating = Database['public']['Tables']['ratings']['Row'];

export function HostProfileScreen({route, navigation}: Props) {
  const {viewer, unreadNotifications} = useApp();
  const [account, setAccount] = useState<Account | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [raterNames, setRaterNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const userId = route.params.userId;
    const [{data: accountRow}, {data: profileRow}, {data: mediaRows}, {data: ratingRows}] = await Promise.all([
      supabase.from('users').select('*').eq('id', userId).single(),
      supabase.from('profiles').select('*').eq('user_id', userId).single(),
      supabase.from('profile_media').select('*').eq('user_id', userId).order('position'),
      supabase.from('ratings').select('*').eq('rated_user_id', userId).order('created_at', {ascending: false}),
    ]);
    setAccount(accountRow);
    setProfile(profileRow);
    setMedia(mediaRows || []);
    setRatings(ratingRows || []);
    const ids = Array.from(new Set((ratingRows || []).map(item => item.rater_id)));
    if (ids.length) {
      const {data: raters} = await supabase.from('users').select('id, display_name').in('id', ids);
      setRaterNames(Object.fromEntries((raters || []).map(item => [item.id, item.display_name])));
    }
  }, [route.params.userId]);

  useEffect(() => { void load(); }, [load]);
  const average = useMemo(() => ratings.length ? ratings.reduce((sum, item) => sum + item.score, 0) / ratings.length : null, [ratings]);

  async function room() {
    const {data, error} = await supabase.rpc('create_or_get_direct_room', {p_target_user: route.params.userId});
    if (error || !data) throw new Error(error?.message || 'Could not open conversation.');
    return data;
  }

  async function message() {
    try { navigation.navigate('ChatRoom', {roomId: await room(), otherUserId: account?.id, title: account?.display_name}); }
    catch (error) { Alert.alert('Could not open chat', error instanceof Error ? error.message : 'Please try again.'); }
  }

  async function call(type: 'audio' | 'video') {
    if (account?.status === 'busy' || account?.status === 'in_call') return Alert.alert('Busy', 'Try again after the current call ends.');
    try {
      const roomId = await room();
      const {data: callId, error} = await supabase.rpc('start_call', {p_room_id: roomId, p_call_type: type});
      if (error || !callId) throw error || new Error('Could not start call.');
      void authenticatedPost('/api/calls/notify', {callId}).catch(() => undefined);
      navigation.navigate('Call', {callId});
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Please try again.';
      Alert.alert(errorMessage.includes('INSUFFICIENT') ? 'Add coins first' : 'Call failed', errorMessage.includes('INSUFFICIENT') ? 'Open Wallet and request coins on WhatsApp.' : errorMessage);
    }
  }

  async function rate(score: number) {
    const {error} = await supabase.rpc('submit_host_review', {p_rated_user: route.params.userId, p_score: score, p_comment: null});
    if (error) return Alert.alert(error.message.includes('NOT_ELIGIBLE') ? 'Verified callers only' : 'Rating failed', error.message.includes('NOT_ELIGIBLE') ? 'Complete a call with this host before rating.' : error.message);
    await load();
    Alert.alert('Rating saved', 'Thanks for sharing your experience.');
  }

  const main = media.find(item => item.is_primary) || media[0];
  return (
    <View style={styles.root}>
      <ScreenHeader back title={account?.display_name || 'Profile'} eyebrow="Host profile" coins={Number(viewer?.wallet.coins_balance || 0)} unreadNotifications={unreadNotifications} onNotifications={() => navigation.navigate('Notifications')} />
      <ScrollView contentContainerStyle={styles.content}>
        {main ? <Image source={{uri: main.cloudinary_url}} style={styles.hero} resizeMode="cover" /> : <View style={[styles.hero, styles.fallback]}><Text style={styles.initial}>{account?.display_name.charAt(0)}</Text></View>}
        {media.length > 1 ? <FlatList horizontal data={media} keyExtractor={item => item.id} contentContainerStyle={styles.gallery} showsHorizontalScrollIndicator={false} renderItem={({item}) => <Image source={{uri: item.cloudinary_url}} style={styles.thumb} />} /> : null}
        <View style={styles.details}>
          <View style={styles.nameRow}><Text style={styles.name}>{account?.display_name}{profile?.age ? `, ${profile.age}` : ''}</Text>{account?.is_verified ? <BadgeCheck size={23} color={colors.teal} /> : null}</View>
          {profile?.location ? <Text style={styles.location}><MapPin size={16} color={colors.teal} /> {profile.location}</Text> : null}
          <Text style={styles.bio}>{profile?.bio || 'Open to a good conversation.'}</Text>
          {profile?.tags.length ? <View style={styles.tags}>{profile.tags.map(tag => <Text key={tag} style={styles.tag}>{tag}</Text>)}</View> : null}
          <View style={styles.rates}><View><Text style={styles.rateLabel}>Chat</Text><Text style={styles.rateValue}>{profile?.chat_rate_coins || 0}/min</Text></View><View><Text style={styles.rateLabel}>Audio</Text><Text style={styles.rateValue}>{profile?.audio_call_rate_coins || 0}/min</Text></View><View><Text style={styles.rateLabel}>Video</Text><Text style={styles.rateValue}>{profile?.video_call_rate_coins || 0}/min</Text></View></View>
          <View style={styles.actions}><Pressable onPress={() => void message()} style={[styles.action, styles.message]}><MessageCircle size={22} color={colors.white} /><Text style={styles.actionLabel}>Message</Text></Pressable><Pressable onPress={() => void call('audio')} style={styles.iconAction}><Phone size={23} color={colors.ink} /></Pressable><Pressable onPress={() => void call('video')} style={styles.iconAction}><Video size={23} color={colors.ink} /></Pressable></View>
        </View>
        <View style={styles.reviewSection}>
          <View style={styles.reviewHeading}><View><Text style={styles.reviewTitle}>Caller ratings</Text><Text style={styles.reviewNote}>Only people who completed a call can rate.</Text></View>{average ? <View style={styles.average}><Star size={18} color="#74510A" fill="#74510A" /><Text style={styles.averageText}>{average.toFixed(1)}</Text></View> : null}</View>
          <View style={styles.rateButtons}>{[1, 2, 3, 4, 5].map(score => <Pressable key={score} onPress={() => void rate(score)} style={styles.starButton}><Star size={23} color={colors.mustard} fill={score <= Math.round(average || 0) ? colors.mustard : 'transparent'} /></Pressable>)}</View>
          {ratings.length ? ratings.map(item => <View key={item.id} style={styles.ratingRow}><View style={styles.raterAvatar}><Text style={styles.raterInitial}>{(raterNames[item.rater_id] || 'Verified caller').charAt(0)}</Text></View><View style={styles.ratingCopy}><Text style={styles.raterName}>{raterNames[item.rater_id] || 'Verified caller'}</Text><View style={styles.stars}>{Array.from({length: 5}, (_, index) => <Star key={index} size={13} color={colors.mustard} fill={index < item.score ? colors.mustard : 'transparent'} />)}</View></View></View>) : <Text style={styles.noReviews}>No ratings yet.</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.canvas}, content: {padding: spacing.md, gap: spacing.md, paddingBottom: 40},
  hero: {width: '100%', aspectRatio: 1, borderRadius: radii.md, backgroundColor: colors.tealSoft}, fallback: {alignItems: 'center', justifyContent: 'center'}, initial: {fontSize: 96, fontWeight: '900', color: colors.teal},
  gallery: {gap: spacing.xs}, thumb: {width: 76, height: 76, borderRadius: radii.sm},
  details: {padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line}, nameRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs}, name: {fontSize: 29, fontWeight: '900', color: colors.ink}, location: {fontSize: 15, color: colors.teal}, bio: {fontSize: 16, lineHeight: 24, color: colors.muted},
  tags: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs}, tag: {paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.round, overflow: 'hidden', backgroundColor: colors.tealSoft, color: colors.teal, fontWeight: '700'},
  rates: {flexDirection: 'row', gap: spacing.xs}, rateLabel: {fontSize: 11, textTransform: 'uppercase', color: colors.muted}, rateValue: {fontSize: 17, fontWeight: '900', color: colors.ink},
  actions: {flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs}, action: {height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radii.md}, message: {flex: 1, backgroundColor: colors.coral}, actionLabel: {fontSize: 17, fontWeight: '900', color: colors.white}, iconAction: {width: 54, height: 52, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center'},
  reviewSection: {padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderRadius: radii.md}, reviewHeading: {flexDirection: 'row', justifyContent: 'space-between'}, reviewTitle: {fontSize: 21, fontWeight: '900', color: colors.ink}, reviewNote: {fontSize: 12, color: colors.muted}, average: {flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, borderRadius: radii.round, backgroundColor: colors.mustardSoft}, averageText: {fontSize: 18, fontWeight: '900', color: '#74510A'},
  rateButtons: {flexDirection: 'row', gap: spacing.xs}, starButton: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, backgroundColor: colors.canvas},
  ratingRow: {minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line}, raterAvatar: {width: 38, height: 38, borderRadius: 19, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center'}, raterInitial: {fontWeight: '900', color: colors.teal}, ratingCopy: {gap: 3}, raterName: {fontWeight: '900', color: colors.ink}, stars: {flexDirection: 'row'}, noReviews: {color: colors.muted},
});
