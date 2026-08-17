import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NavigationProp} from '@react-navigation/native';
import {useCallback, useState} from 'react';
import {Alert, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import ImagePicker, {type Image as PickerImage} from 'react-native-image-crop-picker';
import {Camera, CircleDollarSign, Edit3, MapPin, Settings, X} from 'lucide-react-native';
import {FormField} from '../components/FormField';
import {ScreenHeader} from '../components/ScreenHeader';
import {WetButton} from '../components/WetButton';
import {uploadToCloudinary} from '../lib/cloudinary';
import {supabase} from '../lib/supabase';
import {useApp} from '../state/AppProvider';
import {colors, radii, spacing} from '../theme';
import type {Database} from '../types/database';
import type {RootStackParamList} from '../types/navigation';

type Media = Database['public']['Tables']['profile_media']['Row'];
type HostRequest = Database['public']['Tables']['host_requests']['Row'];

export function ProfileScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const {viewer, unreadNotifications, refreshViewer} = useApp();
  const [media, setMedia] = useState<Media[]>([]);
  const [hostRequest, setHostRequest] = useState<HostRequest | null>(null);
  const [uploading, setUploading] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [hostLoading, setHostLoading] = useState(false);

  const load = useCallback(async () => {
    if (!viewer) return;
    const [{data: mediaRows}, {data: request}] = await Promise.all([
      supabase.from('profile_media').select('*').eq('user_id', viewer.account.id).order('position'),
      supabase.from('host_requests').select('*').eq('user_id', viewer.account.id).order('created_at', {ascending: false}).limit(1).maybeSingle(),
    ]);
    setMedia(mediaRows || []);
    setHostRequest(request || null);
    await refreshViewer();
  }, [refreshViewer, viewer]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function addMedia() {
    if (!viewer || media.length >= 10) return Alert.alert('Gallery full', 'You can add up to 10 photos.');
    try {
      const selected = await ImagePicker.openPicker({mediaType: 'photo', multiple: true, maxFiles: Math.min(10 - media.length, 10), forceJpg: true});
      const files = Array.isArray(selected) ? selected : [selected];
      setUploading(true);
      for (let index = 0; index < files.length; index += 1) {
        const adjusted = await adjust(files[index].path);
        if (!adjusted) continue;
        const cloud = await uploadToCloudinary(adjusted);
        const {error} = await supabase.from('profile_media').insert({
          user_id: viewer.account.id,
          media_type: 'image',
          cloudinary_url: cloud.url,
          cloudinary_public_id: cloud.publicId,
          position: media.length + index,
          is_primary: media.length === 0 && index === 0,
        });
        if (error) throw error;
      }
      await load();
    } catch (error) {
      if (!String(error).includes('cancel')) Alert.alert('Upload failed', error instanceof Error ? error.message : 'Could not add photos.');
    } finally {
      setUploading(false);
    }
  }

  async function editMedia(item: Media) {
    try {
      const adjusted = await adjust(item.cloudinary_url);
      if (!adjusted) return;
      setUploading(true);
      const cloud = await uploadToCloudinary(adjusted);
      const {error} = await supabase.from('profile_media').update({cloudinary_url: cloud.url, cloudinary_public_id: cloud.publicId}).eq('id', item.id);
      if (error) throw error;
      await load();
    } catch (error) {
      if (!String(error).includes('cancel')) Alert.alert('Edit failed', error instanceof Error ? error.message : 'Could not edit this photo.');
    } finally {
      setUploading(false);
    }
  }

  async function adjust(path: string): Promise<PickerImage | null> {
    return ImagePicker.openCropper({
      path,
      width: 1080,
      height: 1080,
      mediaType: 'photo',
      forceJpg: true,
      avoidEmptySpaceAroundImage: true,
      enableRotationGesture: true,
      cropperRotateButtonsHidden: false,
      cropperToolbarTitle: 'Crop and rotate',
      cropperToolbarColor: colors.black,
      cropperToolbarWidgetColor: colors.white,
    });
  }

  async function makePrimary(item: Media) {
    if (!viewer || item.is_primary) return;
    await supabase.from('profile_media').update({is_primary: false}).eq('user_id', viewer.account.id);
    await supabase.from('profile_media').update({is_primary: true}).eq('id', item.id);
    await load();
  }

  async function remove(item: Media) {
    Alert.alert('Remove photo?', 'This removes it from your profile.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Remove', style: 'destructive', onPress: async () => { await supabase.from('profile_media').delete().eq('id', item.id); await load(); }},
    ]);
  }

  async function submitHostRequest() {
    if (phone.trim().length < 8) return Alert.alert('Phone required', 'Enter a number where our team can contact you.');
    setHostLoading(true);
    const {error} = await supabase.rpc('submit_host_request', {p_phone: phone.trim(), p_note: note.trim()});
    setHostLoading(false);
    if (error) return Alert.alert('Request failed', error.message);
    setHostOpen(false);
    await load();
    Alert.alert('Request sent', 'Your profile is pending admin review.');
  }

  const main = media.find(item => item.is_primary) || media[0];
  const showHostCta = viewer?.account.gender === 'female' && !viewer.account.is_verified;
  return (
    <View style={styles.root}>
      <ScreenHeader title="Profile" eyebrow="Your public card" unreadNotifications={unreadNotifications} onNotifications={() => navigation.navigate('Notifications')} action={<Pressable onPress={() => navigation.navigate('Settings')} style={styles.settings}><Settings size={23} color={colors.ink} /></Pressable>} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.gallery}>
          {main ? <Image source={{uri: main.cloudinary_url}} style={styles.hero} /> : <View style={[styles.hero, styles.fallback]}><Text style={styles.initial}>{viewer?.account.display_name.charAt(0)}</Text></View>}
          {main ? <Pressable onPress={() => void editMedia(main)} style={styles.edit}><Edit3 size={19} color={colors.ink} /></Pressable> : null}
          <Pressable onPress={() => void addMedia()} disabled={uploading} style={styles.add}><Camera size={20} color={colors.ink} /><Text style={styles.addText}>{uploading ? 'Working...' : 'Add media'}</Text></Pressable>
        </View>
        {media.length ? <FlatList horizontal data={media} keyExtractor={item => item.id} contentContainerStyle={styles.thumbnails} showsHorizontalScrollIndicator={false} renderItem={({item}) => <Pressable onPress={() => void makePrimary(item)} onLongPress={() => void remove(item)} style={[styles.thumbWrap, item.is_primary && styles.thumbPrimary]}><Image source={{uri: item.cloudinary_url}} style={styles.thumb} /></Pressable>} /> : null}
        <View style={styles.card}>
          <Text style={styles.username}>@{viewer?.account.username}</Text>
          <Text style={styles.name}>{viewer?.account.display_name}</Text>
          <View style={styles.pills}><Text style={styles.status}>{viewer?.account.status === 'online' ? 'Online' : 'Offline'}</Text>{viewer?.profile.location ? <Text style={styles.location}><MapPin size={15} color={colors.teal} /> {viewer.profile.location}</Text> : null}</View>
          <Text style={styles.bio}>{viewer?.profile.bio || 'Tell people what makes a conversation with you worth staying for.'}</Text>
          <WetButton title="Edit profile and account" variant="outline" onPress={() => navigation.navigate('Settings')} />
        </View>
        <View style={styles.stats}><View style={styles.statItem}><Text style={styles.statLabel}>Photos</Text><Text style={styles.statValue}>{media.length}/10</Text></View><View style={styles.statItem}><Text style={styles.statLabel}>Chat</Text><Text style={styles.statValue}>{viewer?.profile.chat_rate_coins || 0}/min</Text></View><View style={styles.statItem}><Text style={styles.statLabel}>Audio</Text><Text style={styles.statValue}>{viewer?.profile.audio_call_rate_coins || 0}/min</Text></View><View style={styles.statItem}><Text style={styles.statLabel}>Video</Text><Text style={styles.statValue}>{viewer?.profile.video_call_rate_coins || 0}/min</Text></View></View>
        {showHostCta ? <View style={styles.hostCta}><CircleDollarSign size={36} color={colors.mustard} /><View style={styles.hostCopy}><Text style={styles.hostTitle}>Become a host. Earn real cash.</Text><Text style={styles.hostText}>{hostRequest?.status === 'pending' ? 'Verification pending. We will contact you after review.' : 'Apply to be featured in Discover and earn beans from calls, chats and tips.'}</Text></View><WetButton title={hostRequest?.status === 'pending' ? 'Request pending' : 'Apply to become a host'} disabled={hostRequest?.status === 'pending'} onPress={() => setHostOpen(true)} /></View> : null}
      </ScrollView>
      <Modal visible={hostOpen} transparent animationType="slide" onRequestClose={() => setHostOpen(false)}><Pressable style={styles.backdrop} onPress={() => setHostOpen(false)}><Pressable style={styles.modal} onPress={() => undefined}><View style={styles.modalHeader}><View><Text style={styles.modalEyebrow}>Creator onboarding</Text><Text style={styles.modalTitle}>Become a host</Text></View><Pressable onPress={() => setHostOpen(false)} style={styles.settings}><X size={25} color={colors.ink} /></Pressable></View><FormField label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Your contact number" /><FormField label="Tell us about yourself" value={note} onChangeText={setNote} multiline placeholder="Languages, availability, experience" /><WetButton title="Submit for verification" onPress={() => void submitHostRequest()} loading={hostLoading} /></Pressable></Pressable></Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.canvas},
  settings: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  content: {padding: spacing.md, paddingBottom: 112, gap: spacing.md},
  gallery: {aspectRatio: 1, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.tealSoft},
  hero: {width: '100%', height: '100%'},
  fallback: {alignItems: 'center', justifyContent: 'center'},
  initial: {fontSize: 100, fontWeight: '900', color: colors.teal},
  edit: {position: 'absolute', right: spacing.sm, top: spacing.sm, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface},
  add: {position: 'absolute', left: spacing.sm, bottom: spacing.sm, height: 42, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radii.md, backgroundColor: colors.surface},
  addText: {fontWeight: '900', color: colors.ink},
  thumbnails: {gap: spacing.xs},
  thumbWrap: {width: 62, height: 62, borderRadius: radii.sm, padding: 2},
  thumbPrimary: {borderWidth: 2, borderColor: colors.teal},
  thumb: {width: '100%', height: '100%', borderRadius: radii.sm},
  card: {padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.surface},
  username: {fontSize: 14, fontWeight: '900', color: colors.teal},
  name: {fontSize: 31, fontWeight: '900', color: colors.ink},
  pills: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  status: {paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.round, overflow: 'hidden', color: colors.teal, backgroundColor: colors.tealSoft, fontWeight: '800'},
  location: {paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.round, overflow: 'hidden', color: colors.teal, backgroundColor: colors.tealSoft, fontWeight: '800'},
  bio: {fontSize: 16, lineHeight: 24, color: colors.muted},
  stats: {flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surface},
  statItem: {width: '50%', minHeight: 78, padding: spacing.md, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line},
  statLabel: {fontSize: 11, textTransform: 'uppercase', fontWeight: '800', color: colors.muted},
  statValue: {fontSize: 19, fontWeight: '900', color: colors.ink},
  hostCta: {padding: spacing.lg, gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.mustardSoft},
  hostCopy: {gap: 4},
  hostTitle: {fontSize: 20, fontWeight: '900', color: colors.ink},
  hostText: {lineHeight: 21, color: colors.muted},
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,18,16,0.5)'},
  modal: {padding: spacing.lg, paddingBottom: 34, gap: spacing.md, backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18},
  modalHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  modalEyebrow: {fontSize: 12, fontWeight: '900', textTransform: 'uppercase', color: colors.teal},
  modalTitle: {fontSize: 27, fontWeight: '900', color: colors.ink},
});
