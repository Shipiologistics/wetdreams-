import {useEffect, useState} from 'react';
import {Alert, Image, Modal, StyleSheet, Text, View} from 'react-native';
import ImagePicker, {type Image as PickerImage} from 'react-native-image-crop-picker';
import {Camera, RotateCw} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {uploadToCloudinary} from '../lib/cloudinary';
import {supabase} from '../lib/supabase';
import {useApp} from '../state/AppProvider';
import {colors, radii, spacing} from '../theme';
import {WetButton} from './WetButton';

export function ProfileImageGate() {
  const {viewer, refreshViewer} = useApp();
  const insets = useSafeAreaInsets();
  const [needsImage, setNeedsImage] = useState(false);
  const [image, setImage] = useState<PickerImage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!viewer || viewer.account.gender !== 'female') {
      setNeedsImage(false);
      return;
    }
    supabase
      .from('profile_media')
      .select('id', {head: true, count: 'exact'})
      .eq('user_id', viewer.account.id)
      .eq('media_type', 'image')
      .then(({count}) => setNeedsImage((count || 0) === 0));
  }, [viewer]);

  async function choose() {
    try {
      const selected = await ImagePicker.openPicker({
        mediaType: 'photo',
        cropping: true,
        width: 1080,
        height: 1080,
        forceJpg: true,
        avoidEmptySpaceAroundImage: true,
        enableRotationGesture: true,
        cropperRotateButtonsHidden: false,
        cropperToolbarTitle: 'Crop and rotate',
        cropperToolbarColor: colors.black,
        cropperToolbarWidgetColor: colors.white,
      });
      setImage(selected);
    } catch (error) {
      if (!String(error).includes('cancel')) Alert.alert('Photo error', 'Could not open your photos.');
    }
  }

  async function upload() {
    if (!viewer || !image) return;
    setLoading(true);
    try {
      const cloud = await uploadToCloudinary(image);
      const {error} = await supabase.from('profile_media').insert({
        user_id: viewer.account.id,
        media_type: 'image',
        cloudinary_url: cloud.url,
        cloudinary_public_id: cloud.publicId,
        position: 0,
        is_primary: true,
      });
      if (error) throw error;
      setNeedsImage(false);
      await refreshViewer();
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={needsImage} animationType="slide" presentationStyle="fullScreen">
      <View style={[styles.root, {paddingBottom: Math.max(insets.bottom + spacing.md, spacing.xl)}]}>
        <View style={styles.heading}><Text style={styles.aqua}>Please upload</Text><Text style={styles.title}>Your real photo</Text></View>
        <View style={styles.preview}>
          {image ? <Image source={{uri: image.path}} style={styles.image} /> : <Camera size={72} color={colors.teal} />}
        </View>
        <View style={styles.tip}>
          <Text style={styles.tipTitle}>Use a clear photo of yourself</Text>
          <Text style={styles.tipText}>Do not use fake, stolen, blurred, or unrelated images. Fake profiles may be banned.</Text>
        </View>
        <View style={styles.spacer} />
        <WetButton title={image ? 'Adjust photo' : 'Choose photo'} variant="outline" onPress={() => void choose()} icon={<RotateCw size={20} color={colors.ink} />} />
        <WetButton title="Complete profile" onPress={() => void upload()} disabled={!image} loading={loading} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.surface, padding: spacing.lg, paddingTop: spacing.xxl, gap: spacing.md},
  heading: {alignItems: 'center'},
  aqua: {fontSize: 25, fontWeight: '900', color: colors.teal},
  title: {fontSize: 35, fontWeight: '900', color: colors.ink},
  preview: {width: 240, height: 240, alignSelf: 'center', marginVertical: spacing.lg, borderRadius: 120, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden'},
  image: {width: '100%', height: '100%'},
  tip: {padding: spacing.lg, backgroundColor: colors.canvas, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, gap: spacing.xs},
  tipTitle: {fontSize: 16, fontWeight: '900', color: colors.ink},
  tipText: {fontSize: 14, lineHeight: 21, color: colors.muted},
  spacer: {flex: 1},
});
