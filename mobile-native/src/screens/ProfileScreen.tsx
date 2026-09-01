import {useFocusEffect, useNavigation, useRoute} from '@react-navigation/native';
import type {NavigationProp, RouteProp} from '@react-navigation/native';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import ImagePicker, {type Image as PickerImage} from 'react-native-image-crop-picker';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {BadgeCheck, Camera, Edit3, MapPin, Save, Settings, Sparkles} from 'lucide-react-native';
import {FormField} from '../components/FormField';
import {ScreenHeader} from '../components/ScreenHeader';
import {SelectField} from '../components/SelectField';
import {WetButton} from '../components/WetButton';
import {uploadToCloudinary} from '../lib/cloudinary';
import {formatLocation, getCitiesForState, indianLocations, parseLocation} from '../lib/location-options';
import {supabase} from '../lib/supabase';
import {useApp} from '../state/AppProvider';
import {colors, radii, spacing} from '../theme';
import type {Database} from '../types/database';
import type {MainTabParamList, RootStackParamList} from '../types/navigation';

type Media = Database['public']['Tables']['profile_media']['Row'];

export function ProfileScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<MainTabParamList, 'Profile'>>();
  const scrollRef = useRef<ScrollView>(null);
  const [ratesY, setRatesY] = useState<number | null>(null);
  const {viewer, unreadNotifications, refreshViewer} = useApp();
  const location = parseLocation(viewer?.profile.location);
  const [media, setMedia] = useState<Media[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(viewer?.account.display_name || '');
  const [age, setAge] = useState(viewer?.profile.age?.toString() || '');
  const [state, setState] = useState(location.state);
  const [city, setCity] = useState(location.city);
  const [bio, setBio] = useState(viewer?.profile.bio || '');
  const [languages, setLanguages] = useState(viewer?.profile.languages.join(', ') || '');
  const [tags, setTags] = useState(viewer?.profile.tags.join(', ') || '');
  const [chatRate, setChatRate] = useState(viewer?.profile.chat_rate_coins.toString() || '5');
  const [audioRate, setAudioRate] = useState(viewer?.profile.audio_call_rate_coins.toString() || '10');
  const [videoRate, setVideoRate] = useState(viewer?.profile.video_call_rate_coins.toString() || '25');
  const cities = useMemo(() => getCitiesForState(state), [state]);

  useEffect(() => {
    if (route.params?.focus !== 'rates' || ratesY === null) return;
    const timeout = setTimeout(() => {
      scrollRef.current?.scrollTo({y: Math.max(0, ratesY - spacing.sm), animated: true});
    }, 150);
    return () => clearTimeout(timeout);
  }, [ratesY, route.params?.focus]);
  const userId = viewer?.account.id;

  useEffect(() => {
    if (!viewer) return;
    const nextLocation = parseLocation(viewer.profile.location);
    setName(viewer.account.display_name); setAge(viewer.profile.age?.toString() || ''); setState(nextLocation.state); setCity(nextLocation.city);
    setBio(viewer.profile.bio || ''); setLanguages(viewer.profile.languages.join(', ')); setTags(viewer.profile.tags.join(', '));
    setChatRate(viewer.profile.chat_rate_coins.toString()); setAudioRate(viewer.profile.audio_call_rate_coins.toString()); setVideoRate(viewer.profile.video_call_rate_coins.toString());
  }, [viewer]);

  const load = useCallback(async () => {
    if (!userId) return;
    const {data: mediaRows} = await supabase.from('profile_media').select('*').eq('user_id', userId).order('position');
    setMedia(mediaRows || []); await refreshViewer();
  }, [refreshViewer, userId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function saveProfile() {
    if (!viewer) return;
    if (name.trim().length < 2) return Alert.alert('Name required', 'Enter at least 2 characters.');
    if (!formatLocation(city, state)) return Alert.alert('Location required', 'Select your state and city.');
    const nextAge = Number(age);
    if (nextAge < 18 || nextAge > 99) return Alert.alert('Age required', 'Enter an age from 18 to 99.');
    setSaving(true);
    const [{error: userError}, {error: profileError}] = await Promise.all([
      supabase.from('users').update({display_name: name.trim()}).eq('id', viewer.account.id),
      supabase.from('profiles').update({age: nextAge, location: formatLocation(city, state), bio: bio.trim(), languages: commaList(languages), tags: commaList(tags), chat_rate_coins: viewer.account.is_verified ? Math.max(0, Number(chatRate) || 0) : viewer.profile.chat_rate_coins, audio_call_rate_coins: viewer.account.is_verified ? Math.max(0, Number(audioRate) || 0) : viewer.profile.audio_call_rate_coins, video_call_rate_coins: viewer.account.is_verified ? Math.max(0, Number(videoRate) || 0) : viewer.profile.video_call_rate_coins}).eq('user_id', viewer.account.id),
    ]);
    setSaving(false);
    if (userError || profileError) return Alert.alert('Save failed', userError?.message || profileError?.message || 'Please try again.');
    await refreshViewer(); Alert.alert('Profile saved', 'Your public profile is up to date.');
  }

  async function adjust(path: string): Promise<PickerImage | null> {
    let temporaryPath: string | null = null;
    try {
      if (/^https?:\/\//i.test(path)) { const response = await ReactNativeBlobUtil.config({fileCache: true, appendExt: 'jpg'}).fetch('GET', path); temporaryPath = response.path(); }
      return await ImagePicker.openCropper({path: temporaryPath || path, width: 1080, height: 1080, mediaType: 'photo', forceJpg: true, avoidEmptySpaceAroundImage: true, enableRotationGesture: true, cropperRotateButtonsHidden: false, cropperToolbarTitle: 'Crop and rotate', cropperToolbarColor: colors.black, cropperToolbarWidgetColor: colors.white});
    } finally { if (temporaryPath) await ReactNativeBlobUtil.fs.unlink(temporaryPath).catch(() => undefined); }
  }

  async function addMedia() {
    if (!viewer || media.length >= 10) return Alert.alert('Gallery full', 'You can add up to 10 photos.');
    try {
      const picked = await ImagePicker.openPicker({mediaType: 'photo', multiple: true, maxFiles: Math.min(10 - media.length, 10), forceJpg: true});
      const files = Array.isArray(picked) ? picked : [picked]; setUploading(true);
      for (let index = 0; index < files.length; index += 1) { const adjusted = await adjust(files[index].path); if (!adjusted) continue; const cloud = await uploadToCloudinary(adjusted); const {error} = await supabase.from('profile_media').insert({user_id: viewer.account.id, media_type: 'image', cloudinary_url: cloud.url, cloudinary_public_id: cloud.publicId, position: media.length + index, is_primary: media.length === 0 && index === 0}); if (error) throw error; }
      await load();
    } catch (error) { if (!String(error).includes('cancel')) Alert.alert('Upload failed', error instanceof Error ? error.message : 'Could not add photos.'); } finally { setUploading(false); }
  }

  async function editMedia(item: Media) {
    try { const adjusted = await adjust(item.cloudinary_url); if (!adjusted) return; setUploading(true); const cloud = await uploadToCloudinary(adjusted); const {error} = await supabase.from('profile_media').update({cloudinary_url: cloud.url, cloudinary_public_id: cloud.publicId}).eq('id', item.id); if (error) throw error; await load(); }
    catch (error) { if (!String(error).includes('cancel')) Alert.alert('Edit failed', error instanceof Error ? error.message : 'Could not edit this photo.'); } finally { setUploading(false); }
  }
  async function makePrimary(item: Media) { if (!viewer || item.is_primary) return; await supabase.from('profile_media').update({is_primary: false}).eq('user_id', viewer.account.id); await supabase.from('profile_media').update({is_primary: true}).eq('id', item.id); await load(); }
  async function remove(item: Media) { Alert.alert('Remove photo?', 'This removes it from your profile.', [{text: 'Cancel', style: 'cancel'}, {text: 'Remove', style: 'destructive', onPress: async () => { await supabase.from('profile_media').delete().eq('id', item.id); await load(); }}]); }
  const main = media.find(item => item.is_primary) || media[0];
  return <View style={styles.root}>
    <ScreenHeader title="My profile" eyebrow="Your creator space" unreadNotifications={unreadNotifications} onNotifications={() => navigation.navigate('Notifications')} action={<Pressable accessibilityLabel="Account settings" onPress={() => navigation.navigate('Settings')} style={styles.settings}><Settings size={21} color={colors.ink} /></Pressable>} />
    <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.gallery}>{main ? <Image source={{uri: main.cloudinary_url}} style={styles.hero} /> : <View style={[styles.hero, styles.fallback]}><Text style={styles.initial}>{viewer?.account.display_name.charAt(0)}</Text></View>}<View style={styles.galleryTop}><View style={styles.photoCount}><Camera size={14} color={colors.white} /><Text style={styles.photoCountText}>{media.length}/10</Text></View>{main ? <Pressable accessibilityLabel="Edit main photo" onPress={() => void editMedia(main)} style={styles.edit}><Edit3 size={18} color={colors.ink} /></Pressable> : null}</View><Pressable onPress={() => void addMedia()} disabled={uploading} style={styles.add}><Camera size={18} color={colors.white} /><Text style={styles.addText}>{uploading ? 'Working...' : 'Add photos'}</Text></Pressable></View>
      {media.length ? <FlatList horizontal data={media} keyExtractor={item => item.id} contentContainerStyle={styles.thumbnails} showsHorizontalScrollIndicator={false} renderItem={({item}) => <Pressable onPress={() => void makePrimary(item)} onLongPress={() => void remove(item)} style={[styles.thumbWrap, item.is_primary && styles.thumbPrimary]}><Image source={{uri: item.cloudinary_url}} style={styles.thumb} /></Pressable>} /> : null}
      <View style={styles.identity}><View style={styles.nameRow}><Text style={styles.name}>{viewer?.account.display_name}</Text>{viewer?.account.is_verified ? <BadgeCheck size={21} color={colors.teal} /> : null}</View><Text style={styles.username}>@{viewer?.account.username}</Text><View style={styles.pills}><Text style={[styles.pill, viewer?.account.status === 'online' && styles.onlinePill]}>{viewer?.account.status === 'online' ? 'Available' : 'Away'}</Text>{viewer?.profile.location ? <Text style={styles.pill}><MapPin size={13} color={colors.teal} /> {viewer.profile.location}</Text> : null}</View><Text style={styles.bio}>{viewer?.profile.bio || 'Add a short introduction so people know what you enjoy talking about.'}</Text></View>
      <View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>PUBLIC PROFILE</Text><Text style={styles.sectionTitle}>What people see</Text></View><Sparkles size={22} color={colors.violet} /></View>
      <View style={styles.formSection}><FormField label="Display name" value={name} onChangeText={setName} maxLength={60} /><View style={styles.twoColumns}><View style={styles.fieldHalf}><FormField label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={2} /></View><View style={styles.fieldHalf}><SelectField label="State" value={state} placeholder="Select" options={indianLocations.map(item => item.state)} onChange={value => {setState(value); setCity('');}} /></View></View><SelectField label="City" value={city} placeholder="Select city" options={cities} onChange={setCity} disabled={!state} /><FormField label="About me" value={bio} onChangeText={setBio} multiline maxLength={500} placeholder="A short introduction" /><FormField label="Languages" value={languages} onChangeText={setLanguages} placeholder="Hindi, English" /><FormField label="Interests" value={tags} onChangeText={setTags} placeholder="Music, travel, movies" /></View>
      {viewer?.account.is_verified ? <View onLayout={event => setRatesY(event.nativeEvent.layout.y)} style={styles.rateTools}><View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>HOST TOOLS</Text><Text style={styles.sectionTitle}>Conversation rates</Text></View><Text style={styles.perMinute}>coins / min</Text></View><View style={styles.rateSection}><RateInput label="Chat" value={chatRate} onChange={setChatRate} /><RateInput label="Audio" value={audioRate} onChange={setAudioRate} /><RateInput label="Video" value={videoRate} onChange={setVideoRate} /></View></View> : null}
      <WetButton title="Save public profile" onPress={() => void saveProfile()} loading={saving} icon={<Save size={19} color={colors.white} />} />
    </ScrollView>
  </View>;
}

function RateInput({label, value, onChange}: {label: string; value: string; onChange: (value: string) => void}) { return <View style={styles.rateItem}><Text style={styles.rateLabel}>{label}</Text><FormField label="" value={value} onChangeText={onChange} keyboardType="number-pad" /></View>; }
function commaList(value: string) { return value.split(',').map(item => item.trim()).filter(Boolean).slice(0, 12); }

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.canvas}, settings: {width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas}, content: {padding: spacing.md, paddingBottom: 112, gap: spacing.md}, gallery: {aspectRatio: 1, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.tealSoft}, hero: {width: '100%', height: '100%'}, fallback: {alignItems: 'center', justifyContent: 'center'}, initial: {fontSize: 88, fontWeight: '900', color: colors.teal}, galleryTop: {position: 'absolute', top: spacing.sm, left: spacing.sm, right: spacing.sm, flexDirection: 'row', justifyContent: 'space-between'}, photoCount: {height: 34, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 17, backgroundColor: colors.overlay}, photoCountText: {fontSize: 12, fontWeight: '800', color: colors.white}, edit: {width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)'}, add: {position: 'absolute', left: spacing.sm, bottom: spacing.sm, height: 42, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radii.md, backgroundColor: colors.coral}, addText: {fontWeight: '900', color: colors.white}, thumbnails: {gap: spacing.xs}, thumbWrap: {width: 60, height: 60, borderRadius: radii.md, padding: 2, backgroundColor: colors.surface}, thumbPrimary: {borderWidth: 2, borderColor: colors.teal}, thumb: {width: '100%', height: '100%', borderRadius: radii.sm},
  identity: {paddingVertical: spacing.xs, gap: spacing.xs}, nameRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs}, name: {fontSize: 26, fontWeight: '900', color: colors.ink}, username: {fontSize: 13, fontWeight: '800', color: colors.teal}, pills: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs}, pill: {paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.round, overflow: 'hidden', color: colors.teal, backgroundColor: colors.tealSoft, fontSize: 12, fontWeight: '800'}, onlinePill: {color: colors.success}, bio: {fontSize: 15, lineHeight: 22, color: colors.muted}, rateTools: {gap: spacing.md},
  hostCta: {padding: spacing.md, gap: spacing.sm, borderRadius: radii.md, borderWidth: 1, borderColor: '#F1DCA7', backgroundColor: colors.mustardSoft}, hostIcon: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface}, hostCopy: {gap: 3}, hostTitle: {fontSize: 18, fontWeight: '900', color: colors.ink}, hostText: {lineHeight: 20, color: colors.muted}, sectionHeading: {marginTop: spacing.sm, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between'}, eyebrow: {fontSize: 10, fontWeight: '900', color: colors.teal}, sectionTitle: {fontSize: 21, fontWeight: '900', color: colors.ink}, formSection: {gap: spacing.md}, twoColumns: {flexDirection: 'row', gap: spacing.sm}, fieldHalf: {flex: 1}, perMinute: {fontSize: 12, fontWeight: '800', color: colors.muted}, rateSection: {flexDirection: 'row', gap: spacing.sm}, rateItem: {flex: 1, gap: 3}, rateLabel: {fontSize: 12, fontWeight: '800', color: colors.muted}, backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12,15,20,0.5)'}, modal: {padding: spacing.lg, paddingBottom: 34, gap: spacing.md, backgroundColor: colors.surface, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg}, modalHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, modalTitle: {fontSize: 25, fontWeight: '900', color: colors.ink},
});
