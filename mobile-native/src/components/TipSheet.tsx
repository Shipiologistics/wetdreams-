import {useEffect, useState} from 'react';
import {KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {Gift, X} from 'lucide-react-native';
import {colors, radii, spacing} from '../theme';
import {WetButton} from './WetButton';

type Props = {visible: boolean; balance: number; onClose: () => void; onSend: (amount: number) => Promise<boolean | void>};
const presets = [50, 100, 200];

export function TipSheet({visible, balance, onClose, onSend}: Props) {
  const [selected, setSelected] = useState(50);
  const [custom, setCustom] = useState('');
  const [sending, setSending] = useState(false);
  const amount = custom ? Number(custom) : selected;
  useEffect(() => { if (visible) { setSelected(50); setCustom(''); } }, [visible]);
  async function submit() {
    if (!Number.isInteger(amount) || amount < 1 || sending) return;
    setSending(true);
    const sent = await onSend(amount);
    setSending(false);
    if (sent !== false) onClose();
  }
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} /><View style={styles.sheet}><View style={styles.handle} /><View style={styles.heading}><View style={styles.headingCopy}><View style={styles.gift}><Gift size={23} color={colors.coral} /></View><View><Text style={styles.eyebrow}>SHOW APPRECIATION</Text><Text style={styles.title}>Send a tip</Text></View></View><Pressable accessibilityLabel="Close tips" onPress={onClose} style={styles.close}><X size={23} color={colors.ink} /></Pressable></View><Text style={styles.balance}>Available balance: {Math.floor(balance).toLocaleString('en-IN')} coins</Text><View style={styles.options}>{presets.map(value => <Pressable key={value} onPress={() => {setSelected(value); setCustom('');}} style={[styles.option, !custom && selected === value && styles.optionActive]}><Gift size={19} color={!custom && selected === value ? colors.coral : colors.muted} /><Text style={[styles.optionValue, !custom && selected === value && styles.optionValueActive]}>{value}</Text><Text style={styles.optionUnit}>coins</Text></Pressable>)}</View><View style={styles.customRow}><Text style={styles.customLabel}>Custom tip</Text><TextInput value={custom} onChangeText={value => setCustom(value.replace(/[^0-9]/g, '').slice(0, 7))} keyboardType="number-pad" placeholder="Any amount" placeholderTextColor={colors.muted} style={styles.input} /></View><WetButton title={amount > 0 ? `Tip ${amount} coins` : 'Enter an amount'} onPress={() => void submit()} disabled={!Number.isInteger(amount) || amount < 1 || amount > balance} loading={sending} icon={<Gift size={19} color={colors.white} />} /></View></KeyboardAvoidingView></Modal>;
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12,15,20,0.48)'},
  sheet: {paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: 34, gap: spacing.md, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, backgroundColor: colors.surface},
  handle: {width: 42, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: colors.line}, heading: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, headingCopy: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  gift: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coralSoft}, eyebrow: {fontSize: 10, fontWeight: '900', color: colors.coral}, title: {fontSize: 24, fontWeight: '900', color: colors.ink}, close: {width: 42, height: 42, alignItems: 'center', justifyContent: 'center'}, balance: {fontSize: 13, color: colors.muted},
  options: {flexDirection: 'row', gap: spacing.xs}, option: {flex: 1, minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.canvas}, optionActive: {borderColor: colors.coral, backgroundColor: colors.coralSoft}, optionValue: {fontSize: 22, fontWeight: '900', color: colors.ink}, optionValueActive: {color: colors.coral}, optionUnit: {fontSize: 11, color: colors.muted}, customRow: {gap: spacing.xs}, customLabel: {fontSize: 13, fontWeight: '800', color: colors.ink}, input: {height: 50, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.canvas, color: colors.ink, fontSize: 16, fontWeight: '700'},
});
