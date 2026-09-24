import {useEffect, useState, type ReactNode} from 'react';
import {Alert, Linking, Modal, NativeModules, Platform, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {CheckCircle2, Coins, LoaderCircle, Smartphone, X} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors, radii, spacing} from '../theme';
import {WetButton} from './WetButton';
import {GooglePayIcon, PhonePeIcon} from './PaymentBrandIcons';
import {authenticatedGet, authenticatedPost} from '../lib/api';

export const coinPackages = [
  {price: 100, coins: 110, code: 'BONUS10', label: 'Starter'},
  {price: 250, coins: 285, code: 'PLUS35', label: 'Value'},
  {price: 500, coins: 580, code: 'BOOST80', label: 'Best deal'},
  {price: 750, coins: 850, code: 'SUPER100', label: 'Super saver'},
  {price: 1000, coins: 1200, code: 'MEGA200', label: 'Max bonus'},
] as const;

type UpiApp = 'phonepe' | 'gpay' | 'other';

const UpiLauncher = NativeModules.UpiLauncher as {open?: (uri: string) => Promise<void>} | undefined;

function createUpiAppLink(intentUri: string, app: UpiApp) {
  if (!intentUri.startsWith('upi://pay?')) throw new Error('The payment provider returned an invalid UPI link.');
  const query = intentUri.slice('upi://pay?'.length);
  if (!query) throw new Error('The payment provider returned an invalid UPI link.');
  if (app === 'phonepe') return `phonepe://pay?${query}`;
  if (app === 'gpay') return `gpay://upi/pay?${query}`;
  return intentUri;
}

async function openUpiApp(intentUri: string) {
  if (Platform.OS === 'android' && UpiLauncher?.open) {
    await UpiLauncher.open(intentUri);
    return;
  }
  await Linking.openURL(intentUri);
}

export function CoinTopupModal({
  visible,
  onClose,
  onComplete,
  welcomeCoins,
}: {
  visible: boolean;
  onClose: () => void;
  onComplete?: (coins: number) => void;
  welcomeCoins?: number;
}) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(0);
  const [paymentApp, setPaymentApp] = useState<UpiApp>('phonepe');
  const [loading, setLoading] = useState(false);
  const [payment, setPayment] = useState<{orderId: string; intentUri: string; coins: number} | null>(null);
  const [completed, setCompleted] = useState(false);
  const pack = coinPackages[selected];

  useEffect(() => {
    if (!visible || !payment || completed) return;
    let cancelled = false;
    let checks = 0;
    async function check() {
      checks += 1;
      try {
        const result = await authenticatedGet<{status: string; balance: number | null; coins: number}>(`/api/payments/pay100/status?orderId=${encodeURIComponent(payment!.orderId)}`);
        if (cancelled) return;
        if (result.status === 'success') {
          setCompleted(true);
          setLoading(false);
          onComplete?.(result.coins);
        } else if (result.status === 'failed') {
          setLoading(false);
          Alert.alert('Payment failed', 'No coins were added.');
        }
      } catch {
        // Temporary gateway status failures are retried while this sheet remains open.
      }
    }
    const first = setTimeout(() => void check(), 1800);
    const interval = setInterval(() => {
      if (checks >= 200) return clearInterval(interval);
      void check();
    }, 3000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [completed, onComplete, payment, visible]);

  async function startPayment() {
    setLoading(true);
    try {
      const result = await authenticatedPost<{orderId: string; intentUri: string; coins: number}>('/api/payments/pay100/create', {packageCode: pack.code});
      setPayment(result);
      setCompleted(false);
      await openUpiApp(createUpiAppLink(result.intentUri, paymentApp));
    } catch (error) {
      Alert.alert('Payment unavailable', error instanceof Error ? error.message : 'Could not start UPI payment.');
    } finally {
      setLoading(false);
    }
  }

  async function reopenPayment() {
    if (!payment) return;
    try {
      await openUpiApp(createUpiAppLink(payment.intentUri, paymentApp));
    } catch (error) {
      Alert.alert('UPI app unavailable', error instanceof Error ? error.message : 'Could not open the selected UPI app.');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, {paddingBottom: Math.max(insets.bottom + spacing.md, spacing.xl)}]} onPress={() => undefined}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>{welcomeCoins ? 'Welcome bonus added' : 'Secure UPI payment'}</Text>
              <Text style={styles.title}>{welcomeCoins ? 'Recharge now' : 'Add coins'}</Text>
            </View>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.close}><X size={25} color={colors.ink} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {welcomeCoins ? (
              <View style={styles.welcomeNote}>
                <Coins size={22} color={colors.teal} />
                <View style={styles.welcomeCopy}>
                  <Text style={styles.welcomeTitle}>{welcomeCoins} free coins are ready</Text>
                  <Text style={styles.welcomeText}>Your first recharge starts at ₹100.</Text>
                </View>
              </View>
            ) : null}
            <Text style={styles.note}>Choose a pack, pay in any UPI app, and coins are added automatically after confirmation.</Text>
            <View style={styles.packages}>
              {coinPackages.map((item, index) => (
                <Pressable key={item.price} onPress={() => setSelected(index)} style={[styles.pack, selected === index && styles.packSelected]}>
                  <View style={styles.packTop}><Coins size={22} color={selected === index ? colors.mustard : colors.ink} /><Text style={[styles.label, selected === index && styles.labelSelected]}>{item.label}</Text></View>
                  <Text style={styles.coins}>{item.coins.toLocaleString('en-IN')} coins</Text>
                  <View style={styles.priceRow}><Text style={styles.price}>₹{item.price.toLocaleString('en-IN')}</Text>{item.coins > item.price ? <Text style={styles.regular}>{item.price} coins</Text> : null}</View>
                  <Text style={styles.code}>{item.code}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.methodTitle}>Pay using</Text>
            <View style={styles.methods} accessibilityRole="radiogroup">
              <PaymentMethod selected={paymentApp === 'phonepe'} title="PhonePe" detail="Open PhonePe directly" icon={<PhonePeIcon />} onPress={() => setPaymentApp('phonepe')} />
              <PaymentMethod selected={paymentApp === 'gpay'} title="Google Pay" detail="Open Google Pay directly" icon={<GooglePayIcon />} onPress={() => setPaymentApp('gpay')} />
              <PaymentMethod selected={paymentApp === 'other'} title="Other UPI app" detail="Choose another installed app" icon={<Smartphone size={24} color="#1D2430" />} onPress={() => setPaymentApp('other')} />
            </View>
          </ScrollView>
          {completed ? (
            <View style={styles.success}><CheckCircle2 size={20} color={colors.success} /><Text style={styles.successText}>Payment confirmed. Coins added.</Text></View>
          ) : (
            <View style={styles.footer}>
              {payment ? <View style={styles.waitingRow}><LoaderCircle size={17} color={colors.muted} /><Text style={styles.waiting}>Waiting for payment confirmation...</Text></View> : null}
              <WetButton
                title={payment ? `Open ${paymentAppName(paymentApp)} again` : `Pay ₹${pack.price} now`}
                onPress={() => void (payment ? reopenPayment() : startPayment())}
                loading={loading}
                icon={<SelectedPaymentIcon app={paymentApp} />}
              />
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function paymentAppName(app: UpiApp) {
  if (app === 'phonepe') return 'PhonePe';
  if (app === 'gpay') return 'Google Pay';
  return 'UPI app';
}

function SelectedPaymentIcon({app}: {app: UpiApp}) {
  if (app === 'phonepe') return <PhonePeIcon size={20} />;
  if (app === 'gpay') return <GooglePayIcon size={20} />;
  return <Smartphone size={19} color={colors.white} />;
}

function PaymentMethod({
  selected,
  title,
  detail,
  icon,
  onPress,
}: {
  selected: boolean;
  title: string;
  detail: string;
  icon: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{checked: selected}} onPress={onPress} style={[styles.method, selected && styles.methodSelected]}>
      <View style={styles.brandMark}>{icon}</View>
      <View style={styles.methodCopy}><Text style={styles.methodName}>{title}</Text><Text style={styles.methodDetail}>{detail}</Text></View>
      <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,18,16,0.62)'},
  modal: {height: '92%', padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  eyebrow: {fontSize: 12, fontWeight: '900', color: colors.teal, textTransform: 'uppercase'},
  title: {fontSize: 30, fontWeight: '900', color: colors.ink},
  close: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  scrollContent: {gap: spacing.md, paddingBottom: spacing.sm},
  welcomeNote: {minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: 'rgba(64,215,204,0.38)', backgroundColor: colors.tealSoft},
  welcomeCopy: {flex: 1, gap: 2},
  welcomeTitle: {fontSize: 14, fontWeight: '900', color: colors.ink},
  welcomeText: {fontSize: 12, color: colors.muted},
  note: {fontSize: 14, lineHeight: 20, color: colors.muted},
  packages: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  pack: {width: '48%', minHeight: 158, padding: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.canvas, justifyContent: 'center', gap: spacing.xs},
  packSelected: {borderWidth: 2, borderColor: colors.mustard, backgroundColor: colors.canvas},
  packTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  label: {maxWidth: '70%', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', color: '#76530B', backgroundColor: colors.mustardSoft, paddingHorizontal: spacing.xs, paddingVertical: 4, borderRadius: radii.round},
  labelSelected: {color: colors.warning, backgroundColor: 'rgba(244,196,95,0.14)'},
  coins: {fontSize: 21, fontWeight: '900', color: colors.ink},
  priceRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  price: {fontSize: 18, fontWeight: '900', color: colors.ink},
  regular: {fontSize: 12, textDecorationLine: 'line-through', color: colors.muted},
  code: {alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.round, color: colors.teal, fontSize: 12, fontWeight: '900', backgroundColor: colors.tealSoft},
  methodTitle: {fontSize: 13, fontWeight: '900', color: colors.ink},
  methods: {gap: spacing.xs},
  method: {minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.canvas},
  methodSelected: {borderColor: colors.teal, backgroundColor: colors.tealSoft},
  brandMark: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white},
  methodCopy: {flex: 1, gap: 2},
  methodName: {fontSize: 14, fontWeight: '900', color: colors.ink},
  methodDetail: {fontSize: 11, color: colors.muted},
  radio: {width: 21, height: 21, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.line},
  radioSelected: {borderColor: colors.teal},
  radioDot: {width: 11, height: 11, borderRadius: 6, backgroundColor: colors.teal},
  footer: {gap: spacing.sm},
  waitingRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs},
  waiting: {textAlign: 'center', color: colors.muted, fontWeight: '800'},
  success: {minHeight: 52, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.tealSoft},
  successText: {color: colors.success, fontWeight: '900'},
});
