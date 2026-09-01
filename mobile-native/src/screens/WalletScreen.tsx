import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NavigationProp} from '@react-navigation/native';
import {useCallback, useState} from 'react';
import {Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {ArrowDownLeft, ArrowUpRight, Bean, CalendarX2, Clock3, Gift, Plus, WalletCards, X} from 'lucide-react-native';
import {CoinTopupModal} from '../components/CoinTopupModal';
import {FormField} from '../components/FormField';
import {ScreenHeader} from '../components/ScreenHeader';
import {WetButton} from '../components/WetButton';
import {supabase} from '../lib/supabase';
import {useApp} from '../state/AppProvider';
import {colors, radii, spacing} from '../theme';
import type {Database} from '../types/database';
import type {RootStackParamList} from '../types/navigation';

type Transaction = Database['public']['Tables']['wallet_transactions']['Row'];
type Withdrawal = Database['public']['Tables']['withdrawal_requests']['Row'];

export function WalletScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const {viewer, unreadNotifications, refreshViewer} = useApp();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [beanValue, setBeanValue] = useState(0.6);
  const [topupOpen, setTopupOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [method, setMethod] = useState<'upi' | 'bank'>('upi');
  const [beans, setBeans] = useState('');
  const [upi, setUpi] = useState('');
  const [holder, setHolder] = useState('');
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [loading, setLoading] = useState(false);
  const isHost = viewer?.account.is_verified === true;
  const visibleTransactions = isHost ? transactions : transactions.filter(item => item.currency === 'coin');

  const load = useCallback(async () => {
    if (!viewer) return;
    const [{data: tx}, {data: wd}, {data: config}] = await Promise.all([
      supabase.from('wallet_transactions').select('*').eq('user_id', viewer.account.id).order('created_at', {ascending: false}).limit(100),
      supabase.from('withdrawal_requests').select('*').eq('user_id', viewer.account.id).order('created_at', {ascending: false}),
      supabase.from('platform_config').select('value').eq('key', 'bean_inr_value').maybeSingle(),
    ]);
    setTransactions(tx || []);
    setWithdrawals(wd || []);
    if (typeof config?.value === 'number') setBeanValue(config.value);
    await refreshViewer();
  }, [refreshViewer, viewer]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function withdraw() {
    const amount = Number(beans);
    if (!amount || amount > Number(viewer?.wallet.beans_balance || 0)) return Alert.alert('Invalid amount', 'Enter an amount within your bean balance.');
    if (method === 'upi' && !upi.includes('@')) return Alert.alert('UPI ID required', 'Enter a valid UPI ID.');
    if (method === 'bank' && (!holder.trim() || account.length < 6 || ifsc.length < 4)) return Alert.alert('Bank details required', 'Complete all bank account fields.');
    setLoading(true);
    const {error} = await supabase.rpc('request_withdrawal', {
      p_beans: amount,
      p_payout_method: method,
      p_upi_id: method === 'upi' ? upi.trim() : null,
      p_account_holder: method === 'bank' ? holder.trim() : null,
      p_bank_account: method === 'bank' ? account.trim() : null,
      p_ifsc: method === 'bank' ? ifsc.trim().toUpperCase() : null,
    });
    setLoading(false);
    if (error) return Alert.alert('Request failed', error.message);
    setWithdrawOpen(false);
    setBeans('');
    await load();
    Alert.alert('Withdrawal pending', 'Withdrawals are processed within 24 hours, except Sundays and government holidays.');
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Wallet" eyebrow={isHost ? 'Coins and earnings' : 'Coin balance'} unreadNotifications={unreadNotifications} onNotifications={() => navigation.navigate('Notifications')} />
      <FlatList
        data={visibleTransactions}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<>
          <View style={styles.walletHero}><View style={styles.heroHeading}><View style={styles.walletIcon}><WalletCards size={22} color={colors.white} /></View><Text style={styles.heroLabel}>AVAILABLE COINS</Text></View><Text style={styles.coinValue}>{Number(viewer?.wallet.coins_balance || 0).toLocaleString('en-IN')}</Text><Text style={styles.heroCopy}>Use coins for messages, calls and tips.</Text>{isHost ? <View style={styles.beanBalance}><View><Text style={styles.beanLabel}>CREATOR EARNINGS</Text><Text style={styles.beanValue}>{Number(viewer?.wallet.beans_balance || 0).toLocaleString('en-IN')} beans</Text></View><Text style={styles.beanRupees}>₹{(Number(viewer?.wallet.beans_balance || 0) * beanValue).toLocaleString('en-IN')}</Text></View> : null}</View>
          <View style={styles.walletActions}><Pressable onPress={() => setTopupOpen(true)} style={[styles.walletAction, styles.addAction]}><View style={styles.actionIcon}><Plus size={21} color={colors.coral} /></View><View><Text style={styles.actionTitle}>Add coins</Text><Text style={styles.actionCopy}>Recharge on WhatsApp</Text></View></Pressable>{isHost ? <Pressable disabled={Number(viewer?.wallet.beans_balance || 0) < 1} onPress={() => setWithdrawOpen(true)} style={[styles.walletAction, Number(viewer?.wallet.beans_balance || 0) < 1 && styles.actionDisabled]}><View style={[styles.actionIcon, styles.beanActionIcon]}><Bean size={21} color={colors.teal} /></View><View><Text style={styles.actionTitle}>Withdraw</Text><Text style={styles.actionCopy}>₹{beanValue} per bean</Text></View></Pressable> : null}</View>
          <Pressable onPress={() => setTopupOpen(true)} style={styles.offer}><View style={styles.offerIcon}><Gift size={21} color={colors.warning} /></View><View style={styles.offerCopy}><Text style={styles.offerTitle}>Recharge through WhatsApp</Text><Text style={styles.offerText}>Send a pack request. Admin credits coins after payment confirmation.</Text></View><Text style={styles.offerCta}>Open</Text></Pressable>
          {isHost ? <View style={styles.policy}><View style={styles.policyRow}><Clock3 size={18} color={colors.teal} /><Text style={styles.policyText}>Processed within 24 hours</Text></View><View style={styles.policyRow}><CalendarX2 size={18} color={colors.teal} /><Text style={styles.policyText}>No payouts on Sundays or government holidays</Text></View></View> : null}
          {isHost && withdrawals.length ? <View style={styles.section}><Text style={styles.sectionTitle}>Withdrawals</Text>{withdrawals.map(item => <View key={item.id} style={styles.withdrawal}><View><Text style={styles.withdrawalAmount}>{item.beans_requested} beans · ₹{item.inr_amount}</Text><Text style={styles.txTime}>{new Date(item.created_at).toLocaleDateString('en-IN')}</Text></View><Text style={[styles.status, completeStatus(item.status) && styles.complete]}>{completeStatus(item.status) ? 'Complete' : item.status}</Text></View>)}</View> : null}
          <Text style={styles.sectionTitle}>Activity</Text>
        </>}
        renderItem={({item}) => {
          const positive = Number(item.amount) > 0;
          return <View style={styles.tx}><View style={[styles.txIcon, positive ? styles.txPositive : styles.txNegative]}>{positive ? <ArrowDownLeft size={19} color={colors.success} /> : <ArrowUpRight size={19} color={colors.danger} />}</View><View style={styles.txCopy}><Text style={styles.txName}>{transactionLabel(item)}</Text><Text style={styles.txTime}>{new Date(item.created_at).toLocaleString('en-IN')}</Text></View><View><Text style={[styles.txAmount, positive ? styles.positive : styles.negative]}>{positive ? '+' : ''}{item.amount}</Text><Text style={styles.txCurrency}>{item.currency === 'coin' ? 'coins' : 'beans'}</Text></View></View>;
        }}
        ListEmptyComponent={<Text style={styles.empty}>Your wallet activity will appear here.</Text>}
      />
      <CoinTopupModal visible={topupOpen} onClose={() => setTopupOpen(false)} onComplete={() => void load()} />
      <Modal visible={isHost && withdrawOpen} transparent animationType="slide" onRequestClose={() => setWithdrawOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setWithdrawOpen(false)}><Pressable style={styles.modal} onPress={() => undefined}><ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <View style={styles.modalHeader}><View><Text style={styles.modalEyebrow}>Manual payout</Text><Text style={styles.modalTitle}>Withdraw beans</Text></View><Pressable onPress={() => setWithdrawOpen(false)} style={styles.close}><X size={25} color={colors.ink} /></Pressable></View>
          <FormField label="Beans" value={beans} onChangeText={setBeans} keyboardType="decimal-pad" placeholder={`Up to ${Number(viewer?.wallet.beans_balance || 0)}`} />
          <Text style={styles.fieldLabel}>Receive money by</Text><View style={styles.methodRow}>{(['upi', 'bank'] as const).map(value => <Pressable key={value} onPress={() => setMethod(value)} style={[styles.method, method === value && styles.methodActive]}><Text style={[styles.methodText, method === value && styles.methodTextActive]}>{value === 'upi' ? 'UPI' : 'Bank account'}</Text></Pressable>)}</View>
          {method === 'upi' ? <FormField label="UPI ID" value={upi} onChangeText={setUpi} autoCapitalize="none" placeholder="name@upi" /> : <><FormField label="Account holder" value={holder} onChangeText={setHolder} placeholder="Full name" /><FormField label="Bank account number" value={account} onChangeText={setAccount} keyboardType="number-pad" placeholder="Account number" /><FormField label="IFSC code" value={ifsc} onChangeText={setIfsc} autoCapitalize="characters" placeholder="IFSC" /></>}
          <Text style={styles.conversion}>You receive ₹{(Number(beans || 0) * beanValue).toLocaleString('en-IN')} for this request.</Text>
          <WetButton title="Submit request" onPress={() => void withdraw()} loading={loading} />
        </ScrollView></Pressable></Pressable>
      </Modal>
    </View>
  );
}

function completeStatus(status: string) { return status === 'paid' || status === 'approved'; }
function transactionLabel(transaction: Transaction) {
  if (transaction.type === 'topup' && transaction.payment_gateway_ref === 'signup_bonus') return 'Signup bonus';
  return ({topup: 'Coin top-up', chat_spend: 'Chat time', call_spend: 'Call time', tip_spend: 'Tip sent', tip_earn: 'Tip received', bean_credit: 'Creator earning', bean_withdrawal: 'Withdrawal request', refund: 'Refund'} as Record<string, string>)[transaction.type] || transaction.type.replaceAll('_', ' ');
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.canvas},
  content: {padding: spacing.md, paddingBottom: 112, gap: spacing.sm},
  walletHero: {minHeight: 220, padding: spacing.lg, borderRadius: radii.md, backgroundColor: colors.black}, heroHeading: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm}, walletIcon: {width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violet}, heroLabel: {fontSize: 10, fontWeight: '900', color: 'rgba(255,255,255,0.62)'}, coinValue: {marginTop: spacing.md, fontSize: 42, lineHeight: 48, fontWeight: '900', color: colors.white}, heroCopy: {fontSize: 13, color: 'rgba(255,255,255,0.64)'}, beanBalance: {marginTop: spacing.lg, paddingTop: spacing.md, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.22)'}, beanLabel: {fontSize: 9, fontWeight: '900', color: colors.teal}, beanValue: {fontSize: 18, fontWeight: '900', color: colors.white}, beanRupees: {fontSize: 14, fontWeight: '800', color: colors.mustardSoft}, walletActions: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs}, walletAction: {flex: 1, minHeight: 76, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface}, addAction: {borderColor: '#F2C9D0'}, actionIcon: {width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coralSoft}, beanActionIcon: {backgroundColor: colors.tealSoft}, actionTitle: {fontSize: 14, fontWeight: '900', color: colors.ink}, actionCopy: {fontSize: 10, color: colors.muted}, actionDisabled: {opacity: 0.42}, offer: {marginTop: spacing.sm, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.mustardSoft}, offerIcon: {width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface}, offerCopy: {flex: 1}, offerTitle: {fontSize: 14, fontWeight: '900', color: colors.ink}, offerText: {fontSize: 11, color: colors.muted}, offerCta: {fontSize: 12, fontWeight: '900', color: colors.warning},
  policy: {marginTop: spacing.sm, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: colors.surface},
  policyRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  policyText: {flex: 1, color: colors.ink, fontWeight: '700'},
  section: {marginTop: spacing.lg, gap: spacing.xs},
  sectionTitle: {marginTop: spacing.lg, marginBottom: spacing.xs, fontSize: 20, fontWeight: '900', color: colors.ink},
  withdrawal: {minHeight: 64, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radii.md},
  withdrawalAmount: {fontWeight: '900', color: colors.ink},
  status: {paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radii.round, overflow: 'hidden', textTransform: 'capitalize', backgroundColor: colors.mustardSoft, color: colors.warning, fontWeight: '900'},
  complete: {backgroundColor: colors.tealSoft, color: colors.success},
  tx: {minHeight: 69, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.md},
  txIcon: {width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center'},
  txPositive: {backgroundColor: '#E7F7EE'},
  txNegative: {backgroundColor: colors.coralSoft},
  txCopy: {flex: 1},
  txName: {fontWeight: '900', color: colors.ink, textTransform: 'capitalize'},
  txTime: {fontSize: 11, color: colors.muted},
  txAmount: {fontSize: 16, fontWeight: '900', textAlign: 'right'},
  positive: {color: colors.success}, negative: {color: colors.danger},
  txCurrency: {fontSize: 11, color: colors.muted, textAlign: 'right'},
  empty: {padding: spacing.lg, textAlign: 'center', color: colors.muted},
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,18,16,0.5)'},
  modal: {maxHeight: '92%', backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18},
  modalContent: {padding: spacing.lg, paddingBottom: 34, gap: spacing.md},
  modalHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  modalEyebrow: {fontSize: 12, fontWeight: '900', color: colors.teal, textTransform: 'uppercase'},
  modalTitle: {fontSize: 28, fontWeight: '900', color: colors.ink},
  close: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  fieldLabel: {fontSize: 13, fontWeight: '800', color: colors.ink},
  methodRow: {flexDirection: 'row', gap: spacing.sm},
  method: {flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radii.md},
  methodActive: {borderColor: colors.teal, backgroundColor: colors.tealSoft},
  methodText: {fontWeight: '800', color: colors.muted},
  methodTextActive: {color: colors.teal},
  conversion: {padding: spacing.md, backgroundColor: colors.mustardSoft, color: colors.warning, fontWeight: '800', borderRadius: radii.md},
});
