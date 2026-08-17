import {StyleSheet, Text, TextInput, type TextInputProps, View} from 'react-native';
import {colors, radii, spacing} from '../theme';

type Props = TextInputProps & {label: string; error?: string};

export function FormField({label, error, ...props}: Props) {
  return (
    <View style={styles.root}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        {...props}
        style={[styles.input, props.multiline && styles.multiline, error && styles.errorInput, props.style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {gap: spacing.xs},
  label: {fontSize: 13, fontWeight: '800', color: colors.ink},
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 16,
  },
  multiline: {minHeight: 104, paddingTop: spacing.md, textAlignVertical: 'top'},
  errorInput: {borderColor: colors.danger},
  error: {fontSize: 12, fontWeight: '700', color: colors.danger},
});
