import {useState} from 'react';
import {Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {Coins, X} from 'lucide-react-native';
import {supabase} from '../lib/supabase';
import {useApp} from '../state/AppProvider';
import {colors, radii, spacing} from '../theme';
import {WetButton} from './WetButton';

export const coinPackages = [
  {price: 50, coins: 45, code: 'START45', label: 'Starter'},
  {price: 100, coins: 110, code: 'BONUS10', label: 'Popular'},
  {price: 250, coins: 285, code: 'PLUS35', label: 'Value'},
  {price: 500, coins: 580, code: 'BOOST80', label: 'Best deal'},
  {price: 1000, coins: 1200, code: 'MEGA200', label: 'Max bonus'},
] as const;

export function CoinTopupModal({visible, onClose, onComplete}: {visible: boolean; onClose: () => void; onComplete?: (coins: number) => void}) {
  const {refreshViewer} = useApp();
  const [selected, setSelected] = useState(3);
  const [loading, setLoading] = useState(false);
  const pack = coinPackages[selected];

  async function pay() {
    setLoading(true);
    const {data: intent, error: intentError} = await supabase.rpc('create_payment_intent', {p_coins: pack.coins, p_amount_inr: pack.price});
    if (intentError || !intent) {
      setLoading(false);
      return Alert.alert('Could not start payment', intentError?.message || 'Please try again.');
    }
    const {error} = await supabase.rpc('complete_dummy_payment', {p_intent_id: intent});
    setLoading(false);
    if (error) return Alert.alert('Payment failed', error.message);
    await refreshViewer();
    onComplete?.(pack.coins);
    onClose();
    Alert.alert('Coins added', `${pack.coins} coins are now in your wallet.`);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modal} onPress={() => undefined}>
          <View style={styles.header}><View><Text style={styles.eyebrow}>Offers applied</Text><Text style={styles.title}>Add coins</Text></View><Pressable onPress={onClose} style={styles.close}><X size={25} color={colors.ink} /></Pressable></View>
          <Text style={styles.note}>Lowest recharge: ₹50 gets 45 coins. Bigger packs include bonus coins.</Text>
          <ScrollView contentContainerStyle={styles.packages} showsVerticalScrollIndicator={false}>
            {coinPackages.map((item, index) => (
              <Pressable key={item.price} onPress={() => setSelected(index)} style={[styles.pack, selected === index && styles.packSelected]}>
                <View style={styles.packTop}><Coins size={22} color={colors.ink} /><Text style={styles.label}>{item.label}</Text></View>
                <Text style={styles.coins}>{item.coins.toLocaleString('en-IN')} coins</Text>
                <View style={styles.priceRow}><Text style={styles.price}>₹{item.price.toLocaleString('en-IN')}</Text>{item.coins > item.price ? <Text style={styles.regular}>{item.price} coins</Text> : null}</View>
                <Text style={styles.code}>{item.code}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <WetButton title={`Pay ₹${pack.price}`} onPress={() => void pay()} loading={loading} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,18,16,0.5)'},
  modal: {maxHeight: '90%', padding: spacing.lg, paddingBottom: 34, gap: spacing.md, backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  eyebrow: {fontSize: 12, fontWeight: '900', color: colors.teal, textTransform: 'uppercase'},
  title: {fontSize: 30, fontWeight: '900', color: colors.ink},
  close: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  note: {fontSize: 14, lineHeight: 20, color: colors.muted},
  packages: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.sm},
  pack: {width: '48%', minHeight: 158, padding: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.canvas, justifyContent: 'center', gap: spacing.xs},
  packSelected: {borderWidth: 2, borderColor: colors.mustard, backgroundColor: '#FFF9E8'},
  packTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  label: {fontSize: 11, fontWeight: '900', textTransform: 'uppercase', color: '#76530B', backgroundColor: colors.mustardSoft, paddingHorizontal: spacing.xs, paddingVertical: 4, borderRadius: radii.round},
  coins: {fontSize: 21, fontWeight: '900', color: colors.ink},
  priceRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  price: {fontSize: 18, fontWeight: '900', color: colors.ink},
  regular: {fontSize: 12, textDecorationLine: 'line-through', color: colors.muted},
  code: {alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.round, color: colors.teal, fontSize: 12, fontWeight: '900', backgroundColor: colors.tealSoft},
});
