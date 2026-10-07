/**
 * Reusable React Native UI component: SectionHeader.
 */

import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { spacing } from '../theme/index';

type SectionHeaderProps = {
  title: string;
  rightLabel?: string;
};

export function SectionHeader({ title, rightLabel = '•••' }: SectionHeaderProps) {
  const T = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: T.glass1, borderColor: T.border }]}>
      <Text style={[styles.title, { color: T.text }]}>{title}</Text>
      <Text style={[styles.dots, { color: T.textMuted }]}>{rightLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  dots: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
});
