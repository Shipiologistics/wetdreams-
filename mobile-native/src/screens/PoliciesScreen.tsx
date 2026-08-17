import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Linking, ScrollView, StyleSheet, Text, View} from 'react-native';
import {ScreenHeader} from '../components/ScreenHeader';
import {WetButton} from '../components/WetButton';
import {config} from '../config';
import {colors, radii, spacing} from '../theme';
import type {RootStackParamList} from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Policies'>;

const policies = {
  privacy: {title: 'Privacy policy', sections: [['Your information', 'We collect account, profile, device, chat, call, transaction and safety information needed to operate WetDreams.'], ['Your controls', 'You can edit your profile, block or report users, change your password, and contact support about your account data.'], ['Retention', 'Direct chat messages expire after 24 hours. Profile media remains until removed. Safety and financial records may be retained as required.']]},
  terms: {title: 'Terms of service', sections: [['Adults only', 'WetDreams is only for people aged 18 or older.'], ['Acceptable use', 'No impersonation, exploitation, threats, fraud, illegal content, or attempts to bypass safety and payment controls.'], ['Accounts and balances', 'Keep login details secure. Coins and beans are platform balances governed by the current rates and payout rules.']]},
  safety: {title: 'Safety rules', sections: [['Stay private', 'Do not share passwords, OTPs, bank PINs, home addresses, or identity documents in chat.'], ['Consent matters', 'End any interaction that becomes uncomfortable. Block and report controls are available from direct chats.'], ['Real profiles', 'Hosts must use their own clear profile images. Fake or stolen images can result in suspension.']]},
  'host-policy': {title: 'Host payout policy', sections: [['Verification', 'Only approved host profiles appear in Discover and can earn creator beans. Additional payout verification may be required.'], ['Withdrawals', 'Withdrawal requests remain pending until an admin marks them complete. Processing normally takes up to 24 hours, excluding Sundays and government holidays.'], ['Payout details', 'Hosts must provide a valid UPI ID or bank account holder, account number and IFSC code.']]},
  'refund-policy': {title: 'Refund policy', sections: [['Digital balances', 'Coin purchases are normally final once credited and used.'], ['Service problems', 'Contact support with transaction and call details if a verified technical failure caused an incorrect charge.'], ['Abuse', 'Refunds are not available for policy violations, fraudulent activity, or completed voluntary tips.']]},
} as const;

export function PoliciesScreen({route}: Props) {
  const policy = policies[route.params.page];
  return <View style={styles.root}><ScreenHeader back title={policy.title} eyebrow="WetDreams policies" /><ScrollView contentContainerStyle={styles.content}>{policy.sections.map(([title, body]) => <View key={title} style={styles.section}><Text style={styles.title}>{title}</Text><Text style={styles.body}>{body}</Text></View>)}<WetButton title="Read full policy on wetdreams.vercel.app" variant="outline" onPress={() => void Linking.openURL(`${config.appUrl}/${route.params.page}`)} /></ScrollView></View>;
}

const styles = StyleSheet.create({root: {flex: 1, backgroundColor: colors.canvas}, content: {padding: spacing.md, gap: spacing.md, paddingBottom: 40}, section: {padding: spacing.lg, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: spacing.xs}, title: {fontSize: 19, fontWeight: '900', color: colors.ink}, body: {fontSize: 15, lineHeight: 23, color: colors.muted}});
