/**
 * Slim back navigation row used by enterprise settings screens that hide the
 * default Stack header in favor of the in-screen hero heading.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../ui/theme/useTheme';
import { FastPressable } from '../../ui/components/FastPressable';
import { spacing } from '../../ui/theme/index';
import { safeRouterBack } from '../../utils/navigation';

/**
 * A reusable custom navigation bar component with a back button for settings screens.
 */
export function SettingsBackBar({ title }: { title?: string }) {
  const T = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const barHeight = 48;

  return (
    <View style={[styles.row, { height: insets.top + barHeight, paddingTop: insets.top }]}>
      <FastPressable
        onPress={() => safeRouterBack(router, '/(tabs)/settings')}
        activateOnPressIn
        activateOnTouchStart
        latencyLabel="settings.back"
        latencyBudgetMs={50}
        hitSlop={15}
        unstable_pressDelay={0}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="arrow-back" size={24} color={T.text} />
      </FastPressable>
      <View
        style={[styles.titleWrap, { top: insets.top, height: barHeight }]}
        pointerEvents="none"
      >
        {title ? (
          <Text style={[styles.title, { color: T.text }]} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 52,
    paddingRight: spacing.sm,
  },
  button: {
    width: 52,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '500',
    letterSpacing: 0,
  },
});
