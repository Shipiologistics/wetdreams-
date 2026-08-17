import type {ReactNode} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {colors, radii, spacing} from '../theme';

type Props = {
  title: string;
  onPress: () => void;
  icon?: ReactNode;
  variant?: 'primary' | 'dark' | 'outline' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function WetButton({
  title,
  onPress,
  icon,
  variant = 'primary',
  disabled,
  loading,
  style,
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || loading}
      onPress={onPress}
      style={({pressed}) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}>
      {loading ? <ActivityIndicator color={variant === 'outline' || variant === 'ghost' ? colors.ink : colors.white} /> : icon}
      <Text style={[styles.label, (variant === 'outline' || variant === 'ghost') && styles.darkLabel]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
  },
  primary: {backgroundColor: colors.coral},
  dark: {backgroundColor: colors.black},
  danger: {backgroundColor: colors.danger},
  outline: {backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line},
  ghost: {backgroundColor: 'transparent'},
  label: {color: colors.white, fontSize: 16, fontWeight: '800'},
  darkLabel: {color: colors.ink},
  pressed: {opacity: 0.82, transform: [{scale: 0.98}]},
  disabled: {opacity: 0.45},
});
