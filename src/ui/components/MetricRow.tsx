/**
 * Reusable React Native UI component: MetricRow.
 */

import { StyleSheet, Text, View } from 'react-native';
import { spacing } from '../theme/index';
import { useTheme } from '../theme/useTheme';
import { useIsDarkTheme } from '../../state/themeMode';

type Props = {
  label: string;
  value: string;
  compact?: boolean;
  withDivider?: boolean;
  white?: boolean;
};

export function MetricRow({ label, value, compact = false, withDivider = false, white = false }: Props) {
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const labelColor = white && isDark ? '#FFFFFF' : T.textMuted;
  const valueColor = white && isDark ? '#FFFFFF' : T.text;

  return (
    <View style={[styles.row, compact && styles.rowCompact, withDivider && { borderBottomWidth: 1, borderBottomColor: T.borderMedium }]}>
      <Text style={[styles.label, { color: labelColor }, compact && styles.labelCompact]}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }, compact && styles.valueCompact]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowCompact: {
    paddingVertical: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
  },
  labelCompact: {
    fontSize: 12, // Standard subtext
    fontWeight: '500',
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  valueCompact: {
    fontSize: 13, // Values slightly larger than 12
    fontWeight: '600', // Standard value weight
    letterSpacing: 0,
  },
});
