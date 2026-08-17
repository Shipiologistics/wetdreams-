import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useState} from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {LogIn, UserPlus} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {FormField} from '../components/FormField';
import {WetButton} from '../components/WetButton';
import {registerCurrentDevice} from '../lib/device';
import {supabase} from '../lib/supabase';
import {colors, radii, spacing} from '../theme';
import type {RootStackParamList} from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;

export function AuthScreen({navigation}: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function signIn() {
    setSubmitted(true);
    if (!email.trim() || password.length < 8) return;
    setLoading(true);
    const {data, error} = await supabase.auth.signInWithPassword({email: email.trim(), password});
    if (error || !data.session) {
      setLoading(false);
      Alert.alert('Could not sign in', error?.message || 'Please check your details.');
      return;
    }

    try {
      const device = await registerCurrentDevice();
      if (device.banned) throw new Error('This device has been blocked.');
      const pendingLocation = await AsyncStorage.getItem('pending-registration-location');
      const pendingAge = await AsyncStorage.getItem('pending-registration-age');
      if (pendingLocation) {
        await supabase
          .from('profiles')
          .update({location: pendingLocation, age: pendingAge ? Number(pendingAge) : null})
          .eq('user_id', data.session.user.id);
        await Promise.all([
          AsyncStorage.removeItem('pending-registration-location'),
          AsyncStorage.removeItem('pending-registration-age'),
        ]);
      }
    } catch (caught) {
      await supabase.auth.signOut();
      setLoading(false);
      Alert.alert('Sign in blocked', caught instanceof Error ? caught.message : 'Device check failed.');
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Image source={require('../assets/wetdreams-logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.name}>WetDreams</Text>
          <Text style={styles.tagline}>Private conversations. Real connections.</Text>
        </View>

        <View style={styles.panel}>
          <View>
            <Text style={styles.eyebrow}>Welcome back</Text>
            <Text style={styles.title}>Sign in</Text>
          </View>
          <FormField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={submitted && !email.trim() ? 'Email is required.' : undefined}
          />
          <FormField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry
            autoComplete="current-password"
            error={submitted && password.length < 8 ? 'Enter your password.' : undefined}
          />
          <WetButton title="Sign in" onPress={() => void signIn()} loading={loading} icon={<LogIn size={20} color={colors.white} />} />
          <View style={styles.divider}><View style={styles.line} /><Text style={styles.or}>New here?</Text><View style={styles.line} /></View>
          <WetButton title="Create account" variant="outline" onPress={() => navigation.navigate('Register')} icon={<UserPlus size={20} color={colors.ink} />} />
        </View>

        <Text style={styles.legal}>By continuing, you agree to the Terms and Privacy Policy.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.canvas},
  content: {flexGrow: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.lg},
  brand: {alignItems: 'center'},
  logo: {width: 92, height: 92},
  name: {fontSize: 31, fontWeight: '900', color: colors.ink},
  tagline: {marginTop: spacing.xs, fontSize: 15, color: colors.muted, textAlign: 'center'},
  panel: {backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: spacing.md},
  eyebrow: {fontSize: 12, fontWeight: '900', textTransform: 'uppercase', color: colors.teal},
  title: {fontSize: 30, fontWeight: '900', color: colors.ink},
  divider: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  line: {height: 1, flex: 1, backgroundColor: colors.line},
  or: {fontSize: 12, color: colors.muted},
  legal: {fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: 'center'},
});
