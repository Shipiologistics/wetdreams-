import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NavigationProp} from '@react-navigation/native';
import {useCallback, useMemo, useState} from 'react';
import {
  Alert,
  BackHandler,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  BadgeCheck,
  Heart,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  SlidersHorizontal,
  Star,
  Video,
  X,
} from 'lucide-react-native';
import {ScreenHeader} from '../components/ScreenHeader';
import {SelectField} from '../components/SelectField';
import {WetButton} from '../components/WetButton';
import {authenticatedPost} from '../lib/api';
import {getCitiesForState, indianLocations, parseLocation} from '../lib/location-options';
import {supabase} from '../lib/supabase';
import {useApp} from '../state/AppProvider';
import {colors, radii, spacing} from '../theme';
import type {Database} from '../types/database';
import type {RootStackParamList} from '../types/navigation';

type Account = Database['public']['Tables']['users']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];
type Media = Database['public']['Tables']['profile_media']['Row'];
type Host = {account: Account; profile: Profile; media: Media[]; rating: number | null; favorite: boolean};

export function DiscoverScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const {viewer, unreadNotifications} = useApp();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);

  const load = useCallback(async () => {
    if (!viewer) return;
    const {data: accounts, error} = await supabase
      .from('users')
      .select('*')
      .eq('is_banned', false)
      .eq('is_guest', false)
      .eq('is_verified', true)
      .eq('role', 'user')
      .eq('gender', 'female')
      .neq('id', viewer.account.id);
    if (error) {
      setLoading(false);
      Alert.alert('Could not load profiles', error.message);
      return;
    }

    const unique = Array.from(new Map((accounts || []).map(account => [account.id, account])).values());
    const ids = unique.map(account => account.id);
    if (!ids.length) {
      setHosts([]);
      setLoading(false);
      return;
    }
    const [{data: profiles}, {data: media}, {data: ratings}, {data: favorites}] = await Promise.all([
      supabase.from('profiles').select('*').in('user_id', ids),
      supabase.from('profile_media').select('*').in('user_id', ids).order('position'),
      supabase.from('ratings').select('rated_user_id, score').in('rated_user_id', ids),
      supabase.from('favorites').select('favorite_user_id').eq('user_id', viewer.account.id),
    ]);
    const favoriteIds = new Set((favorites || []).map(item => item.favorite_user_id));
    const profileMap = new Map((profiles || []).map(profile => [profile.user_id, profile]));
    const models = unique.flatMap(account => {
      const profile = profileMap.get(account.id);
      if (!profile) return [];
      const scores = (ratings || []).filter(rating => rating.rated_user_id === account.id).map(rating => rating.score);
      return [{
        account,
        profile,
        media: (media || []).filter(item => item.user_id === account.id),
        rating: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
        favorite: favoriteIds.has(account.id),
      }];
    });
    const randomSeed = Date.now() % 997;
    models.sort((a, b) => statusRank(a.account.status) - statusRank(b.account.status) || seededRank(`${randomSeed}:${a.account.id}`) - seededRank(`${randomSeed}:${b.account.id}`));
    setHosts(models);
    setLoading(false);
  }, [viewer]);

  useFocusEffect(useCallback(() => {
    void load();
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('Exit WetDreams?', 'Do you want to close the app?', [
        {text: 'Stay', style: 'cancel'},
        {text: 'Exit', onPress: () => BackHandler.exitApp()},
      ]);
      return true;
    });
    const channel = supabase.channel('native-discovery')
      .on('postgres_changes', {event: '*', schema: 'public', table: 'users'}, () => void load())
      .on('postgres_changes', {event: '*', schema: 'public', table: 'profile_media'}, () => void load())
      .subscribe();
    return () => { back.remove(); void supabase.removeChannel(channel); };
  }, [load]));

  const filtered = useMemo(() => hosts.filter(host => {
    const needle = search.trim().toLowerCase();
    const location = parseLocation(host.profile.location);
    const text = `${host.account.display_name} ${host.profile.location || ''} ${host.profile.tags.join(' ')}`.toLowerCase();
    return (!needle || text.includes(needle))
      && (!state || location.state === state)
      && (!city || location.city === city)
      && (!onlineOnly || host.account.status !== 'offline');
  }), [hosts, search, state, city, onlineOnly]);

  async function toggleFavorite(host: Host) {
    if (!viewer) return;
    const next = !host.favorite;
    setHosts(current => current.map(item => item.account.id === host.account.id ? {...item, favorite: next} : item));
    const result = next
      ? await supabase.from('favorites').insert({user_id: viewer.account.id, favorite_user_id: host.account.id})
      : await supabase.from('favorites').delete().eq('user_id', viewer.account.id).eq('favorite_user_id', host.account.id);
    if (result.error) {
      setHosts(current => current.map(item => item.account.id === host.account.id ? {...item, favorite: !next} : item));
    }
  }

  async function openChat(host: Host) {
    const {data: roomId, error} = await supabase.rpc('create_or_get_direct_room', {p_target_user: host.account.id});
    if (error || !roomId) return Alert.alert('Could not open chat', error?.message || 'Please try again.');
    navigation.navigate('ChatRoom', {roomId, otherUserId: host.account.id, title: host.account.display_name});
  }

  async function startCall(host: Host, type: 'audio' | 'video') {
    if (statusRank(host.account.status) === 1) return Alert.alert('Host is busy', 'Try again after the current call ends.');
    const {data: roomId, error: roomError} = await supabase.rpc('create_or_get_direct_room', {p_target_user: host.account.id});
    if (roomError || !roomId) return Alert.alert('Could not start call', roomError?.message || 'Please try again.');
    const {data: callId, error} = await supabase.rpc('start_call', {p_room_id: roomId, p_call_type: type});
    if (error || !callId) {
      if (error?.message.includes('INSUFFICIENT_BALANCE')) return Alert.alert('Add coins first', 'Open Wallet and choose a coin pack.');
      return Alert.alert('Could not start call', error?.message || 'Please try again.');
    }
    void authenticatedPost('/api/calls/notify', {callId}).catch(() => undefined);
    navigation.navigate('Call', {callId});
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        eyebrow="People worth meeting"
        title="Discover"
        coins={Number(viewer?.wallet.coins_balance || 0)}
        unreadNotifications={unreadNotifications}
        onNotifications={() => navigation.navigate('Notifications')}
      />
      <View style={styles.toolbar}>
        <View style={styles.search}><Search size={20} color={colors.muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Search people, cities, interests" placeholderTextColor={colors.muted} style={styles.searchInput} /></View>
        <Pressable onPress={() => setFiltersOpen(true)} style={styles.filterButton}><SlidersHorizontal size={22} color={colors.ink} /></Pressable>
      </View>
      <Text style={styles.count}>{filtered.length} {filtered.length === 1 ? 'person' : 'people'}</Text>
      <FlatList
        data={filtered}
        keyExtractor={item => item.account.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.coral} />}
        renderItem={({item}) => (
          <HostCard
            host={item}
            onProfile={() => navigation.navigate('HostProfile', {userId: item.account.id})}
            onFavorite={() => void toggleFavorite(item)}
            onMessage={() => void openChat(item)}
            onCall={type => void startCall(item, type)}
          />
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No verified hosts match these filters.</Text> : null}
      />
      <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setFiltersOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.sheetHeading}><Text style={styles.sheetTitle}>Filters</Text><Pressable onPress={() => setFiltersOpen(false)} style={styles.close}><X size={24} color={colors.ink} /></Pressable></View>
            <SelectField label="State" value={state} placeholder="All states" options={indianLocations.map(item => item.state)} onChange={value => {setState(value); setCity('');}} />
            <SelectField label="City" value={city} placeholder="All cities" options={getCitiesForState(state)} onChange={setCity} disabled={!state} />
            <Pressable onPress={() => setOnlineOnly(value => !value)} style={[styles.toggle, onlineOnly && styles.toggleActive]}><View style={[styles.toggleDot, onlineOnly && styles.toggleDotActive]} /><Text style={styles.toggleText}>Online or busy now</Text></Pressable>
            <View style={styles.sheetActions}><WetButton title="Reset" variant="outline" style={styles.flex} onPress={() => {setState(''); setCity(''); setOnlineOnly(false);}} /><WetButton title="Show results" style={styles.flex} onPress={() => setFiltersOpen(false)} /></View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function HostCard({host, onProfile, onFavorite, onMessage, onCall}: {host: Host; onProfile: () => void; onFavorite: () => void; onMessage: () => void; onCall: (type: 'audio' | 'video') => void}) {
  const media = host.media.find(item => item.is_primary) || host.media[0];
  const busy = statusRank(host.account.status) === 1;
  return (
    <View style={styles.card}>
      <Pressable onPress={onProfile} style={StyleSheet.absoluteFill} />
      {media ? <Image source={{uri: media.cloudinary_url}} style={styles.cardImage} resizeMode="cover" /> : <View style={[styles.cardImage, styles.fallback]}><Text style={styles.fallbackText}>{host.account.display_name.charAt(0)}</Text></View>}
      <View style={styles.scrim} pointerEvents="none" />
      <View style={styles.cardTop}>
        <View style={[styles.presence, host.account.status === 'online' && styles.online, busy && styles.busy]}><View style={styles.presenceDot} /><Text style={styles.presenceText}>{busy ? 'Busy' : host.account.status === 'online' ? 'Online' : 'Away'}</Text></View>
        <Pressable onPress={onFavorite} style={styles.heart}><Heart size={24} color={host.favorite ? colors.coral : colors.ink} fill={host.favorite ? colors.coral : 'transparent'} /></Pressable>
      </View>
      <View style={styles.cardBottom}>
        <View style={styles.nameRow}><Text numberOfLines={1} style={styles.hostName}>{host.account.display_name}{host.profile.age ? `, ${host.profile.age}` : ''}</Text>{host.account.is_verified ? <BadgeCheck size={20} color="#58E2C6" /> : null}</View>
        {host.profile.location ? <Text numberOfLines={1} style={styles.location}><MapPin size={16} color={colors.white} /> {host.profile.location}</Text> : null}
        {host.rating ? <View style={styles.rating}><Star size={15} color="#77530A" fill="#77530A" /><Text style={styles.ratingText}>{host.rating.toFixed(1)}</Text></View> : null}
        <View style={styles.actions}>
          <Pressable onPress={onMessage} style={[styles.action, styles.message]}><MessageCircle size={22} color={colors.white} /><Text style={styles.actionLabel}>Message</Text></Pressable>
          <Pressable disabled={busy} onPress={() => onCall('audio')} style={[styles.iconAction, busy && styles.disabled]}><Phone size={23} color={colors.white} /></Pressable>
          <Pressable disabled={busy} onPress={() => onCall('video')} style={[styles.iconAction, busy && styles.disabled]}><Video size={23} color={colors.white} /></Pressable>
        </View>
      </View>
    </View>
  );
}

function statusRank(status: string) { return status === 'online' ? 0 : status === 'busy' || status === 'in_call' ? 1 : 2; }
function seededRank(value: string) { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return (hash >>> 0) / 4294967295; }

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.canvas},
  toolbar: {flexDirection: 'row', gap: spacing.sm, padding: spacing.md, paddingBottom: spacing.sm},
  search: {height: 52, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface},
  searchInput: {flex: 1, fontSize: 16, color: colors.ink},
  filterButton: {width: 52, height: 52, alignItems: 'center', justifyContent: 'center'},
  count: {paddingHorizontal: spacing.md, paddingBottom: spacing.sm, color: colors.muted},
  list: {paddingHorizontal: spacing.md, paddingBottom: 112, gap: spacing.md},
  empty: {padding: spacing.xl, textAlign: 'center', color: colors.muted},
  card: {aspectRatio: 1, borderRadius: radii.md, backgroundColor: colors.black, overflow: 'hidden'},
  cardImage: {width: '100%', height: '100%'},
  fallback: {alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealSoft},
  fallbackText: {fontSize: 90, fontWeight: '900', color: colors.teal},
  scrim: {position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%', backgroundColor: 'rgba(0,0,0,0.52)'},
  cardTop: {position: 'absolute', left: spacing.sm, right: spacing.sm, top: spacing.sm, flexDirection: 'row', justifyContent: 'space-between'},
  presence: {height: 38, paddingHorizontal: spacing.md, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', borderRadius: radii.round, backgroundColor: 'rgba(25,28,26,0.78)'},
  online: {backgroundColor: 'rgba(16,111,75,0.9)'},
  busy: {backgroundColor: 'rgba(166,109,0,0.92)'},
  presenceDot: {width: 9, height: 9, borderRadius: 5, backgroundColor: colors.white},
  presenceText: {color: colors.white, fontWeight: '800'},
  heart: {width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center'},
  cardBottom: {position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md},
  nameRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  hostName: {flexShrink: 1, color: colors.white, fontSize: 24, fontWeight: '900'},
  location: {color: colors.white, fontSize: 15, marginTop: 2},
  rating: {alignSelf: 'flex-start', marginTop: spacing.xs, paddingHorizontal: spacing.sm, height: 31, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radii.round, backgroundColor: colors.mustardSoft},
  ratingText: {fontWeight: '900', color: '#77530A'},
  actions: {marginTop: spacing.sm, flexDirection: 'row', gap: spacing.xs},
  action: {height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radii.md},
  message: {flex: 1, backgroundColor: colors.coral},
  actionLabel: {color: colors.white, fontSize: 17, fontWeight: '900'},
  iconAction: {width: 54, height: 52, borderRadius: radii.md, backgroundColor: 'rgba(25,25,25,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center'},
  disabled: {opacity: 0.4},
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,18,16,0.42)'},
  sheet: {backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: spacing.lg, paddingBottom: 34, gap: spacing.md},
  sheetHeading: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  sheetTitle: {fontSize: 25, fontWeight: '900', color: colors.ink},
  close: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  toggle: {height: 52, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.canvas},
  toggleActive: {backgroundColor: colors.tealSoft},
  toggleDot: {width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.muted},
  toggleDotActive: {borderWidth: 6, borderColor: colors.teal},
  toggleText: {fontSize: 15, fontWeight: '800', color: colors.ink},
  sheetActions: {flexDirection: 'row', gap: spacing.sm},
  flex: {flex: 1},
});
