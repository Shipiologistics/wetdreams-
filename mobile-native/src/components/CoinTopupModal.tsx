import {useEffect, useState} from 'react';
import {Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {CheckCircle2, Coins, Smartphone, X} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors, radii, spacing} from '../theme';
import {WetButton} from './WetButton';
import {authenticatedGet, authenticatedPost} from '../lib/api';

export const coinPackages = [
  {price: 50, coins: 45, code: 'START45', label: 'Starter'},
  {price: 100, coins: 110, code: 'BONUS10', label: 'Popular'},
  {price: 250, coins: 285, code: 'PLUS35', label: 'Value'},
  {price: 500, coins: 580, code: 'BOOST80', label: 'Best deal'},
  {price: 1000, coins: 1200, code: 'MEGA200', label: 'Max bonus'},
] as const;

export function CoinTopupModal({visible, onClose, onComplete}: {visible: boolean; onClose: () => void; onComplete?: (coins: number) => void}) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(3);
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
        // A temporary status error is retried while the payment sheet stays open.
      }
    }
    const first = setTimeout(() => void check(), 1800);
    const interval = setInterval(() => {
      if (checks >= 200) return clearInterval(interval);
      void check();
    }, 3000);
    return () => { cancelled = true; clearTimeout(first); clearInterval(interval); };
  }, [completed, onComplete, payment, visible]);

  async function startPayment() {
    setLoading(true);
    try {
      const result = await authenticatedPost<{orderId: string; intentUri: string; coins: number}>('/api/payments/pay100/create', {packageCode: pack.code});
      setPayment(result);
      setCompleted(false);
      await Linking.openURL(result.intentUri);
    } catch (error) {
      setLoading(false);
      Alert.alert('Payment unavailable', error instanceof Error ? error.message : 'Could not start UPI payment.');
      return;
    } finally {
      if (!payment) setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, {paddingBottom: Math.max(insets.bottom + spacing.md, spacing.xl)}]} onPress={() => undefined}>
          <View style={styles.header}><View><Text style={styles.eyebrow}>Secure UPI payment</Text><Text style={styles.title}>Add coins</Text></View><Pressable onPress={onClose} style={styles.close}><X size={25} color={colors.ink} /></Pressable></View>
          <Text style={styles.note}>Choose a pack, pay in any UPI app, and coins are added automatically after confirmation.</Text>
          <ScrollView contentContainerStyle={styles.packages} showsVerticalScrollIndicator={false}>
            {coinPackages.map((item, index) => (
              <Pressable key={item.price} onPress={() => setSelected(index)} style={[styles.pack, selected === index && styles.packSelected]}>
                <View style={styles.packTop}><Coins size={22} color={selected === index ? colors.mustard : colors.ink} /><Text style={[styles.label, selected === index && styles.labelSelected]}>{item.label}</Text></View>
                <Text style={styles.coins}>{item.coins.toLocaleString('en-IN')} coins</Text>
                <View style={styles.priceRow}><Text style={styles.price}>₹{item.price.toLocaleString('en-IN')}</Text>{item.coins > item.price ? <Text style={styles.regular}>{item.price} coins</Text> : null}</View>
                <Text style={styles.code}>{item.code}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {completed ? <View style={styles.success}><CheckCircle2 size={20} color={colors.success} /><Text style={styles.successText}>Payment confirmed. Coins added.</Text></View> : payment ? <>
            <Text style={styles.waiting}>Waiting for Pay100 confirmation…</Text>
            <WetButton title="Open UPI app again" onPress={() => void Linking.openURL(payment.intentUri)} icon={<Smartphone size={19} color={colors.white} />} />
          </> : <WetButton title={`Pay ₹${pack.price} with UPI`} onPress={() => void startPayment()} loading={loading} icon={<Smartphone size={19} color={colors.white} />} />}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,18,16,0.5)'},
  modal: {maxHeight: '90%', padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  eyebrow: {fontSize: 12, fontWeight: '900', color: colors.teal, textTransform: 'uppercase'},
  title: {fontSize: 30, fontWeight: '900', color: colors.ink},
  close: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  note: {fontSize: 14, lineHeight: 20, color: colors.muted},
  packages: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.sm},
  pack: {width: '48%', minHeight: 158, padding: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.canvas, justifyContent: 'center', gap: spacing.xs},
  packSelected: {borderWidth: 2, borderColor: colors.mustard, backgroundColor: colors.canvas},
  packTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  label: {fontSize: 11, fontWeight: '900', textTransform: 'uppercase', color: '#76530B', backgroundColor: colors.mustardSoft, paddingHorizontal: spacing.xs, paddingVertical: 4, borderRadius: radii.round},
  labelSelected: {color: colors.warning, backgroundColor: 'rgba(244,196,95,0.14)'},
  coins: {fontSize: 21, fontWeight: '900', color: colors.ink},
  priceRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  price: {fontSize: 18, fontWeight: '900', color: colors.ink},
  regular: {fontSize: 12, textDecorationLine: 'line-through', color: colors.muted},
  code: {alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.round, color: colors.teal, fontSize: 12, fontWeight: '900', backgroundColor: colors.tealSoft},
  waiting: {padding: spacing.sm, textAlign: 'center', color: colors.muted, fontWeight: '800'},
  success: {minHeight: 52, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.tealSoft},
  successText: {color: colors.success, fontWeight: '900'},
});
