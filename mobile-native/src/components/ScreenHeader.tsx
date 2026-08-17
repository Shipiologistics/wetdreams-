import type {ReactNode} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Bell, ChevronLeft} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {colors, spacing} from '../theme';

type Props = {
  title: string;
  eyebrow?: string;
  back?: boolean;
  coins?: number;
  unreadNotifications?: number;
  onNotifications?: () => void;
  action?: ReactNode;
};

export function ScreenHeader({
  title,
  eyebrow,
  back,
  coins,
  unreadNotifications = 0,
  onNotifications,
  action,
}: Props) {
  const navigation = useNavigation();
  return (
    <View style={styles.root}>
      <View style={styles.left}>
        {back ? (
          <Pressable accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={styles.iconButton}>
            <ChevronLeft size={28} color={colors.ink} />
          </Pressable>
        ) : null}
        <View style={styles.copy}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text numberOfLines={1} adjustsFontSizeToFit style={styles.title}>{title}</Text>
        </View>
      </View>
      <View style={styles.right}>
        {typeof coins === 'number' ? (
          <View style={styles.coins}>
            <Text style={styles.coinLabel}>Coins</Text>
            <Text style={styles.coinValue}>{Math.floor(coins)}</Text>
          </View>
        ) : null}
        {onNotifications ? (
          <Pressable accessibilityLabel="Notifications" onPress={onNotifications} style={styles.iconButton}>
            <Bell size={23} color={colors.ink} />
            {unreadNotifications > 0 ? <View style={styles.dot} /> : null}
          </Pressable>
        ) : null}
        {action}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 92,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  left: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  copy: {flex: 1},
  eyebrow: {color: colors.teal, fontSize: 11, fontWeight: '900', textTransform: 'uppercase'},
  title: {fontSize: 29, lineHeight: 34, fontWeight: '900', color: colors.ink},
  right: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginLeft: spacing.sm},
  coins: {minWidth: 48, paddingLeft: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.mustard},
  coinLabel: {fontSize: 11, color: colors.muted},
  coinValue: {fontSize: 20, lineHeight: 22, fontWeight: '900', color: colors.ink},
  iconButton: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  dot: {position: 'absolute', right: 8, top: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coral},
});
