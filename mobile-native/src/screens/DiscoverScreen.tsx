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
  const available = useMemo(() => filtered.filter(host => host.account.status === 'online').slice(0, 12), [filtered]);

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
        eyebrow="Find your people"
        title="Discover"
        coins={Number(viewer?.wallet.coins_balance || 0)}
        unreadNotifications={unreadNotifications}
        onNotifications={() => navigation.navigate('Notifications')}
      />
      <FlatList
        data={filtered}
        numColumns={2}
        keyExtractor={item => item.account.id}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.columns}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.coral} />}
        ListHeaderComponent={<View style={styles.listHeader}>{available.length ? <View style={styles.availableSection}><View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Available now</Text><Text style={styles.sectionMeta}>{available.length} online</Text></View><FlatList horizontal data={available} keyExtractor={item => `available-${item.account.id}`} contentContainerStyle={styles.availableList} showsHorizontalScrollIndicator={false} renderItem={({item}) => <AvailableHost host={item} onPress={() => navigation.navigate('HostProfile', {userId: item.account.id})} />}/></View> : null}<View style={styles.toolbar}><View style={styles.search}><Search size={19} color={colors.muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Search name, city or interest" placeholderTextColor={colors.muted} style={styles.searchInput} /></View><Pressable accessibilityLabel="Open filters" onPress={() => setFiltersOpen(true)} style={[styles.filterButton, (state || city || onlineOnly) && styles.filterActive]}><SlidersHorizontal size={21} color={(state || city || onlineOnly) ? colors.white : colors.ink} /></Pressable></View><View style={styles.resultsHeading}><Text style={styles.sectionTitle}>Recommended for you</Text><Text style={styles.sectionMeta}>{filtered.length} profiles</Text></View></View>}
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
      <View style={styles.imageWrap}>
        <Pressable onPress={onProfile} style={StyleSheet.absoluteFill}>{media ? <Image source={{uri: media.cloudinary_url}} style={styles.cardImage} resizeMode="cover" /> : <View style={[styles.cardImage, styles.fallback]}><Text style={styles.fallbackText}>{host.account.display_name.charAt(0)}</Text></View>}</Pressable>
        <View style={styles.cardTop} pointerEvents="box-none"><View style={[styles.presence, host.account.status === 'online' && styles.online, busy && styles.busy]}><View style={styles.presenceDot} /><Text style={styles.presenceText}>{busy ? 'On a call' : host.account.status === 'online' ? 'Available' : 'Away'}</Text></View><Pressable onPress={onFavorite} style={styles.heart}><Heart size={19} color={host.favorite ? colors.coral : colors.ink} fill={host.favorite ? colors.coral : 'transparent'} /></Pressable></View>
        <View style={styles.imageRating}>{host.rating ? <><Star size={13} color="#F8D777" fill="#F8D777" /><Text style={styles.ratingText}>{host.rating.toFixed(1)}</Text></> : <Text style={styles.newText}>New</Text>}</View>
      </View>
      <View style={styles.cardBottom}>
        <Pressable onPress={onProfile}><View style={styles.nameRow}><Text numberOfLines={1} style={styles.hostName}>{host.account.display_name}{host.profile.age ? `, ${host.profile.age}` : ''}</Text>{host.account.is_verified ? <BadgeCheck size={16} color={colors.teal} /> : null}</View>{host.profile.location ? <Text numberOfLines={1} style={styles.location}><MapPin size={13} color={colors.muted} /> {host.profile.location}</Text> : null}</Pressable>
        <View style={styles.actions}>
          <Pressable accessibilityLabel="Message" onPress={onMessage} style={[styles.iconAction, styles.message]}><MessageCircle size={18} color={colors.white} /></Pressable><Pressable accessibilityLabel="Audio call" disabled={busy} onPress={() => onCall('audio')} style={[styles.iconAction, busy && styles.disabled]}><Phone size={17} color={colors.ink} /></Pressable><Pressable accessibilityLabel="Video call" disabled={busy} onPress={() => onCall('video')} style={[styles.iconAction, busy && styles.disabled]}><Video size={17} color={colors.ink} /></Pressable>
        </View>
      </View>
    </View>
  );
}

function AvailableHost({host, onPress}: {host: Host; onPress: () => void}) { const media = host.media.find(item => item.is_primary) || host.media[0]; return <Pressable onPress={onPress} style={styles.availableHost}><View style={styles.avatarRing}>{media ? <Image source={{uri: media.cloudinary_url}} style={styles.availableAvatar} /> : <View style={[styles.availableAvatar, styles.fallback]}><Text style={styles.availableInitial}>{host.account.display_name.charAt(0)}</Text></View>}<View style={styles.onlineDot} /></View><Text numberOfLines={1} style={styles.availableName}>{host.account.display_name.split(' ')[0]}</Text></Pressable>; }

function statusRank(status: string) { return status === 'online' ? 0 : status === 'busy' || status === 'in_call' ? 1 : 2; }
function seededRank(value: string) { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return (hash >>> 0) / 4294967295; }

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.canvas},
  list: {paddingHorizontal: spacing.md, paddingBottom: 112}, columns: {gap: spacing.sm, marginBottom: spacing.sm}, listHeader: {marginHorizontal: -spacing.md, marginBottom: spacing.sm}, availableSection: {paddingTop: spacing.md, gap: spacing.sm}, sectionHeading: {paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, resultsHeading: {paddingHorizontal: spacing.md, paddingTop: spacing.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, sectionTitle: {fontSize: 17, fontWeight: '900', color: colors.ink}, sectionMeta: {fontSize: 12, color: colors.muted}, availableList: {paddingHorizontal: spacing.md, gap: spacing.sm}, availableHost: {width: 62, alignItems: 'center', gap: 5}, avatarRing: {width: 58, height: 58, padding: 2, borderRadius: 29, borderWidth: 2, borderColor: colors.teal}, availableAvatar: {width: '100%', height: '100%', borderRadius: 27}, availableInitial: {fontWeight: '900', color: colors.teal}, onlineDot: {position: 'absolute', right: 0, bottom: 1, width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.success}, availableName: {width: 62, textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.ink},
  toolbar: {flexDirection: 'row', gap: spacing.xs, padding: spacing.md, paddingBottom: spacing.sm}, search: {height: 48, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface}, searchInput: {flex: 1, fontSize: 14, color: colors.ink}, filterButton: {width: 48, height: 48, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface}, filterActive: {borderColor: colors.coral, backgroundColor: colors.coral},
  empty: {padding: spacing.xl, textAlign: 'center', color: colors.muted},
  card: {flex: 1, maxWidth: '48.5%', minWidth: 0, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: 'hidden'}, imageWrap: {width: '100%', aspectRatio: 1, backgroundColor: colors.tealSoft},
  cardImage: {width: '100%', height: '100%'},
  fallback: {alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealSoft},
  fallbackText: {fontSize: 52, fontWeight: '900', color: colors.teal}, cardTop: {position: 'absolute', left: spacing.xs, right: spacing.xs, top: spacing.xs, flexDirection: 'row', justifyContent: 'space-between'}, presence: {height: 27, paddingHorizontal: spacing.xs, flexDirection: 'row', gap: 5, alignItems: 'center', borderRadius: radii.round, backgroundColor: 'rgba(25,28,32,0.72)'}, online: {backgroundColor: 'rgba(17,126,88,0.88)'}, busy: {backgroundColor: 'rgba(166,109,0,0.88)'}, presenceDot: {width: 7, height: 7, borderRadius: 4, backgroundColor: colors.white}, presenceText: {color: colors.white, fontSize: 10, fontWeight: '800'}, heart: {width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(17,22,29,0.84)', alignItems: 'center', justifyContent: 'center'}, imageRating: {position: 'absolute', left: spacing.xs, bottom: spacing.xs, height: 30, minWidth: 42, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: radii.round, backgroundColor: colors.mustardSoft, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)'}, cardBottom: {padding: spacing.sm, gap: spacing.xs},
  nameRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  hostName: {flexShrink: 1, color: colors.ink, fontSize: 15, fontWeight: '900'}, location: {color: colors.muted, fontSize: 11, marginTop: 3}, ratingText: {fontSize: 11, fontWeight: '900', color: '#F8D777'}, newText: {fontSize: 10, fontWeight: '900', color: colors.warning}, actions: {flexDirection: 'row', gap: 6}, message: {flex: 1, borderColor: colors.coral, backgroundColor: colors.coral}, iconAction: {height: 34, minWidth: 34, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center'},
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
