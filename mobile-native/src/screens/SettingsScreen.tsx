import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useEffect, useMemo, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {Bell, ChevronRight, FileText, LogOut, ShieldCheck} from 'lucide-react-native';
import {FormField} from '../components/FormField';
import {ScreenHeader} from '../components/ScreenHeader';
import {SelectField} from '../components/SelectField';
import {WetButton} from '../components/WetButton';
import {formatLocation, getCitiesForState, indianLocations, parseLocation} from '../lib/location-options';
import {supabase} from '../lib/supabase';
import {useApp} from '../state/AppProvider';
import {colors, radii, spacing} from '../theme';
import type {RootStackParamList} from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({navigation}: Props) {
  const {viewer, unreadNotifications, refreshViewer, signOut} = useApp();
  const location = parseLocation(viewer?.profile.location);
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
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const cities = useMemo(() => getCitiesForState(state), [state]);

  useEffect(() => {
    if (!viewer) return;
    setName(viewer.account.display_name);
    setBio(viewer.profile.bio);
  }, [viewer]);

  async function save() {
    if (!viewer) return;
    if (name.trim().length < 2) return Alert.alert('Name required', 'Enter at least 2 characters.');
    if (!formatLocation(city, state)) return Alert.alert('Location required', 'Select your state and city.');
    setSaving(true);
    const [{error: userError}, {error: profileError}] = await Promise.all([
      supabase.from('users').update({display_name: name.trim()}).eq('id', viewer.account.id),
      supabase.from('profiles').update({
        age: Number(age) || null,
        location: formatLocation(city, state),
        bio: bio.trim(),
        languages: list(languages),
        tags: list(tags),
        chat_rate_coins: Math.max(0, Number(chatRate) || 0),
        audio_call_rate_coins: Math.max(0, Number(audioRate) || 0),
        video_call_rate_coins: Math.max(0, Number(videoRate) || 0),
      }).eq('user_id', viewer.account.id),
    ]);
    setSaving(false);
    if (userError || profileError) return Alert.alert('Save failed', userError?.message || profileError?.message || 'Please try again.');
    await refreshViewer();
    Alert.alert('Saved', 'Your profile is updated.');
  }

  async function changePassword() {
    if (password.length < 8) return Alert.alert('Password too short', 'Use at least 8 characters.');
    const {error} = await supabase.auth.updateUser({password});
    if (error) return Alert.alert('Password not changed', error.message);
    setPassword('');
    Alert.alert('Password changed', 'Use your new password next time you sign in.');
  }

  async function confirmSignOut() {
    Alert.alert('Sign out?', 'You will stop appearing online on this device.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Sign out', style: 'destructive', onPress: () => void signOut()},
    ]);
  }

  return (
    <View style={styles.root}>
      <ScreenHeader back title="Settings" eyebrow="Account and privacy" unreadNotifications={unreadNotifications} onNotifications={() => navigation.navigate('Notifications')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Section title="Public profile">
          <FormField label="Display name" value={name} onChangeText={setName} maxLength={60} />
          <FormField label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={2} />
          <SelectField label="State" value={state} placeholder="Select state" options={indianLocations.map(item => item.state)} onChange={value => {setState(value); setCity('');}} />
          <SelectField label="City" value={city} placeholder="Select city" options={cities} onChange={setCity} disabled={!state} />
          <FormField label="Bio" value={bio} onChangeText={setBio} multiline maxLength={500} placeholder="A short introduction" />
          <FormField label="Languages" value={languages} onChangeText={setLanguages} placeholder="Hindi, English" />
          <FormField label="Interests" value={tags} onChangeText={setTags} placeholder="Music, travel, books" />
        </Section>
        {viewer?.account.gender === 'female' ? <Section title="Per-minute rates"><FormField label="Chat coins/min" value={chatRate} onChangeText={setChatRate} keyboardType="number-pad" /><FormField label="Audio call coins/min" value={audioRate} onChangeText={setAudioRate} keyboardType="number-pad" /><FormField label="Video call coins/min" value={videoRate} onChangeText={setVideoRate} keyboardType="number-pad" /></Section> : null}
        <WetButton title="Save profile" onPress={() => void save()} loading={saving} />
        <Section title="Security"><FormField label="New password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" /><WetButton title="Change password" variant="dark" onPress={() => void changePassword()} disabled={!password} /></Section>
        <Section title="Notifications"><SettingsRow icon={<Bell size={21} color={colors.teal} />} label="Notification inbox" onPress={() => navigation.navigate('Notifications')} /></Section>
        <Section title="Policies">
          <SettingsRow icon={<ShieldCheck size={21} color={colors.teal} />} label="Safety and community rules" onPress={() => navigation.navigate('Policies', {page: 'safety'})} />
          <SettingsRow icon={<FileText size={21} color={colors.teal} />} label="Privacy policy" onPress={() => navigation.navigate('Policies', {page: 'privacy'})} />
          <SettingsRow icon={<FileText size={21} color={colors.teal} />} label="Terms of service" onPress={() => navigation.navigate('Policies', {page: 'terms'})} />
          <SettingsRow icon={<FileText size={21} color={colors.teal} />} label="Host payout policy" onPress={() => navigation.navigate('Policies', {page: 'host-policy'})} />
          <SettingsRow icon={<FileText size={21} color={colors.teal} />} label="Refund policy" onPress={() => navigation.navigate('Policies', {page: 'refund-policy'})} />
        </Section>
        <WetButton title="Sign out" variant="outline" onPress={() => void confirmSignOut()} icon={<LogOut size={20} color={colors.danger} />} />
      </ScrollView>
    </View>
  );
}

function Section({title, children}: {title: string; children: React.ReactNode}) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>; }
function SettingsRow({icon, label, onPress}: {icon: React.ReactNode; label: string; onPress: () => void}) { return <Pressable onPress={onPress} style={styles.row}>{icon}<Text style={styles.rowLabel}>{label}</Text><ChevronRight size={20} color={colors.muted} /></Pressable>; }
function list(value: string) { return value.split(',').map(item => item.trim()).filter(Boolean).slice(0, 12); }

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.canvas},
  content: {padding: spacing.md, paddingBottom: 40, gap: spacing.md},
  section: {padding: spacing.md, gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md},
  sectionTitle: {fontSize: 18, fontWeight: '900', color: colors.ink},
  row: {minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line},
  rowLabel: {flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink},
});
