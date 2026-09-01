import {Image, StyleSheet, Text, View} from 'react-native';
import {colors, spacing} from '../theme';

export function BrandedLoader({label = 'Loading'}: {label?: string}) {
  return (
    <View style={styles.root}>
      <Image source={require('../assets/kizo-logo.png')} style={styles.logo} resizeMode="contain" />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas, gap: spacing.sm},
  logo: {width: 72, height: 72},
  label: {fontSize: 15, fontWeight: '700', color: colors.muted},
});
