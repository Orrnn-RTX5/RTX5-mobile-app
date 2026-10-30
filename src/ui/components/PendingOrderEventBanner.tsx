import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePendingOrderNotifications, dismissPendingOrderNotification } from '../../state/pendingOrderNotifications';
import { useActiveBrokerQuerySession } from '../../query/authenticatedQueryScope';
import { useTheme } from '../theme/useTheme';
import { FastPressable } from './FastPressable';

export function PendingOrderEventBanner() {
  const notifications = usePendingOrderNotifications(state => state.notifications);
  const session = useActiveBrokerQuerySession();
  const insets = useSafeAreaInsets();
  const T = useTheme();
  const current = notifications.filter(row => row.namespace === session?.cacheNamespace);
  if (!current.length) return null;
  return <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, zIndex: 10000, elevation: 30, gap: 8 }}>
    {current.map(row => <FastPressable key={row.id} accessibilityRole="alert" accessibilityLabel={row.message}
      onPress={() => dismissPendingOrderNotification(row.id)} style={{ backgroundColor: T.glass2, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: T.accent }}>
      <Text style={{ color: T.text }}>{row.message}</Text>
    </FastPressable>)}
  </View>;
}
