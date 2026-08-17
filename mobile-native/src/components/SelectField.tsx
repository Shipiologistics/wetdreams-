import {useState} from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {Check, ChevronDown, X} from 'lucide-react-native';
import {colors, radii, spacing} from '../theme';

type Props = {
  label: string;
  value: string;
  placeholder: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
};

export function SelectField({label, value, placeholder, options, onChange, disabled, error}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.select, error && styles.error, disabled && styles.disabled]}>
        <Text numberOfLines={1} style={[styles.value, !value && styles.placeholder]}>{value || placeholder}</Text>
        <ChevronDown size={20} color={colors.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.heading}>
              <Text style={styles.title}>{label}</Text>
              <Pressable accessibilityLabel="Close" onPress={() => setOpen(false)} style={styles.close}>
                <X size={24} color={colors.ink} />
              </Pressable>
            </View>
            <FlatList
              data={options}
              keyExtractor={item => item}
              initialNumToRender={18}
              renderItem={({item}) => (
                <Pressable
                  onPress={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                  style={styles.option}>
                  <Text style={styles.optionText}>{item}</Text>
                  {item === value ? <Check size={20} color={colors.teal} /> : null}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {gap: spacing.xs},
  label: {fontSize: 13, fontWeight: '800', color: colors.ink},
  select: {
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  error: {borderColor: colors.danger},
  disabled: {opacity: 0.45},
  value: {flex: 1, fontSize: 16, color: colors.ink},
  placeholder: {color: colors.muted},
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,18,16,0.42)'},
  sheet: {maxHeight: '76%', minHeight: '45%', borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: colors.surface, paddingBottom: spacing.lg},
  heading: {height: 64, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line},
  title: {fontSize: 20, fontWeight: '900', color: colors.ink},
  close: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  option: {minHeight: 52, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line},
  optionText: {fontSize: 16, color: colors.ink},
});
