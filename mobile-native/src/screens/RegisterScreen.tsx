import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useMemo, useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {ChevronLeft, MapPin, UserRound} from 'lucide-react-native';
import {FormField} from '../components/FormField';
import {SelectField} from '../components/SelectField';
import {WetButton} from '../components/WetButton';
import {formatLocation, getCitiesForState, indianLocations} from '../lib/location-options';
import {supabase} from '../lib/supabase';
import {colors, radii, spacing} from '../theme';
import type {RootStackParamList} from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;
type Gender = 'male' | 'female' | '';

export function RegisterScreen({navigation}: Props) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const cities = useMemo(() => getCitiesForState(state), [state]);

  function valid(current = step) {
    if (current === 1) return name.trim().length >= 2 && !!gender;
    if (current === 2) return !!formatLocation(city, state) && Number(age) >= 18 && Number(age) <= 99;
    return /.+@.+\..+/.test(email.trim()) && password.length >= 8;
  }

  function next() {
    setSubmitted(true);
    if (!valid()) return;
    setSubmitted(false);
    setStep(value => Math.min(3, value + 1));
  }

  function back() {
    setSubmitted(false);
    if (step === 1) navigation.goBack();
    else setStep(value => value - 1);
  }

  async function register() {
    setSubmitted(true);
    if (!valid(3)) return;
    setLoading(true);
    const location = formatLocation(city, state);
    const result = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {data: {display_name: name.trim(), gender}},
    });
    if (result.error) {
      setLoading(false);
      Alert.alert('Could not create account', result.error.message);
      return;
    }

    if (!result.data.session) {
      await Promise.all([
        AsyncStorage.setItem('pending-registration-location', location),
        AsyncStorage.setItem('pending-registration-age', age),
      ]);
      setLoading(false);
      Alert.alert('Check your email', 'Open the verification email, then return here and sign in.', [
        {text: 'Go to sign in', onPress: () => navigation.popToTop()},
      ]);
      return;
    }

    await supabase
      .from('profiles')
      .update({location, age: Number(age)})
      .eq('user_id', result.data.session.user.id);
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.topbar}>
        <Pressable onPress={back} style={styles.back}><ChevronLeft size={28} color={colors.ink} /></Pressable>
        <View style={styles.progress}><View style={[styles.progressFill, {width: `${(step / 3) * 100}%`}]} /></View>
        <Text style={styles.step}>{step}/3</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 1 ? (
          <>
            <View style={styles.heading}><Text style={styles.aqua}>STEP ONE</Text><Text style={styles.title}>Create your profile</Text><Text style={styles.headingCopy}>Choose how you want to appear in the community.</Text></View>
            <View style={styles.genderRow}>
              {(['male', 'female'] as const).map(option => (
                <Pressable key={option} onPress={() => setGender(option)} style={[styles.gender, gender === option && styles.genderActive]}>
                  <Text style={[styles.genderLabel, gender === option && styles.genderLabelActive]}>{option === 'male' ? 'Male' : 'Female'}</Text>
                  <UserRound size={58} color={gender === option ? colors.teal : colors.muted} />
                </Pressable>
              ))}
            </View>
            {submitted && !gender ? <Text style={styles.error}>Gender is required.</Text> : null}
            <FormField label="Nickname" value={name} onChangeText={setName} placeholder="Your display name" maxLength={60} error={submitted && name.trim().length < 2 ? 'Nickname is required.' : undefined} />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <View style={styles.heading}><Text style={styles.aqua}>STEP TWO</Text><Text style={styles.title}>Where are you based?</Text><Text style={styles.headingCopy}>This keeps discovery useful and relevant.</Text></View>
            <SelectField label="State" value={state} placeholder="Select state" options={indianLocations.map(item => item.state)} onChange={value => {setState(value); setCity('');}} error={submitted && !state} />
            <SelectField label="City" value={city} placeholder="Select city" options={cities} onChange={setCity} disabled={!state} error={submitted && !city} />
            <FormField label="Age" value={age} onChangeText={setAge} placeholder="18+ only" keyboardType="number-pad" maxLength={2} error={submitted && (Number(age) < 18 || Number(age) > 99) ? 'Enter an age from 18 to 99.' : undefined} />
            <View style={styles.tip}><MapPin size={22} color={colors.teal} /><Text style={styles.tipText}>Your city helps people find relevant profiles nearby.</Text></View>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <View style={styles.heading}><Text style={styles.aqua}>FINAL STEP</Text><Text style={styles.title}>Secure your account</Text><Text style={styles.headingCopy}>Use any email you can access.</Text></View>
            <FormField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={submitted && !/.+@.+\..+/.test(email.trim()) ? 'Valid email is required.' : undefined} />
            <FormField label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry autoComplete="new-password" error={submitted && password.length < 8 ? 'Use at least 8 characters.' : undefined} />
            {gender === 'female' ? <Text style={styles.note}>After sign in, add a clear real profile photo for host verification. Fake images may lead to an account ban.</Text> : null}
          </>
        ) : null}

        <View style={styles.spacer} />
        <WetButton title={step === 3 ? 'Create account' : 'Continue'} onPress={step === 3 ? () => void register() : next} loading={loading} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.canvas},
  topbar: {height: 70, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  back: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  progress: {height: 5, flex: 1, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden'},
  progressFill: {height: '100%', backgroundColor: colors.teal},
  step: {fontSize: 13, fontWeight: '800', color: colors.muted},
  content: {flexGrow: 1, padding: spacing.lg, gap: spacing.md},
  heading: {marginVertical: spacing.sm},
  aqua: {fontSize: 10, fontWeight: '900', color: colors.teal},
  title: {fontSize: 27, fontWeight: '900', color: colors.ink},
  headingCopy: {marginTop: 4, fontSize: 13, color: colors.muted},
  genderRow: {flexDirection: 'row', gap: spacing.md},
  gender: {flex: 1, height: 126, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 2, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.surface},
  genderActive: {borderColor: colors.teal, backgroundColor: colors.tealSoft},
  genderLabel: {fontSize: 17, fontWeight: '900', color: colors.muted},
  genderLabelActive: {color: colors.teal},
  error: {fontSize: 12, fontWeight: '700', color: colors.danger},
  tip: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.tealSoft, borderRadius: radii.md},
  tipText: {flex: 1, color: colors.teal, lineHeight: 20},
  note: {padding: spacing.md, borderRadius: radii.md, color: colors.warning, backgroundColor: colors.mustardSoft, lineHeight: 20},
  spacer: {flex: 1, minHeight: spacing.xl},
});
