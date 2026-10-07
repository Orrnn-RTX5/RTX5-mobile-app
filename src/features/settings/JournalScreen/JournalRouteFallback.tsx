import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../../../ui/components/Screen';
import { useTheme } from '../../../ui/theme/useTheme';
import { makeJournalStyles } from './styles';

export function JournalRouteFallback() {
  const T = useTheme();
  const styles = useMemo(() => makeJournalStyles(T), [T]);
  const insets = useSafeAreaInsets();
  const actionColor = T.trading.buy.primary;

  return (
    <Screen style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.backButton}>
          <Ionicons name="reader-outline" size={22} color={T.text} />
        </View>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Journal</Text>
          <Text style={styles.headerSub}>Today activity log</Text>
        </View>
        <View style={styles.statusPill}>
          <View style={[styles.statusDot, styles.statusDotMuted]} />
          <Text style={styles.statusPillText}>Ready</Text>
        </View>
      </View>

      <View style={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View>
              <Text style={styles.summaryTitle}>Session Summary</Text>
              <Text style={styles.summarySub}>Recent activity</Text>
            </View>
            <View style={styles.summaryStatus}>
              <Ionicons name="flash-outline" size={14} color={actionColor} />
              <Text style={styles.summaryStatusText}>Fast</Text>
            </View>
          </View>
        </View>
      </View>
    </Screen>
  );
}
