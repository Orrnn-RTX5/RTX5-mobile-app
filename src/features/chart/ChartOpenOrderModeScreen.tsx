import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Chart Feature UI: ChartOpenOrderModeScreen
 *
 * Allows users to toggle their preferred order entry mode directly from the chart:
 * Regular, Risk Calculator, or One-Click trading.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserPreferences } from '../../state/userPreferences';
import { useTranslation } from '../../i18n/useTranslation';
import type { ThemeColors } from '../../ui/theme/glass';
import { useTheme } from '../../ui/theme/useTheme';
import { useIsDarkTheme } from '../../state/themeMode';
import { safeRouterBack } from '../../utils/navigation';

export type ChartOpenOrderModeScreenProps = Readonly<{
  hosted?: boolean;
  hostedActive?: boolean;
  onHostedBack?: () => void;
}>;

export function ChartOpenOrderModeScreen({
  hosted = false,
  hostedActive = false,
  onHostedBack,
}: ChartOpenOrderModeScreenProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const themeActive = !hosted || hostedActive;
  const T = useTheme({ active: themeActive });
  const isDark = useIsDarkTheme({ active: themeActive });
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const openOrderMode = useUserPreferences((s) => s.openOrderMode);
  const setOpenOrderMode = useUserPreferences((s) => s.setOpenOrderMode);

  const handleSelect = (mode: 'Regular' | 'Risk calculator' | 'One-click') => {
    setOpenOrderMode(mode);
  };

  const handleBack = () => {
    if (hosted && onHostedBack) {
      onHostedBack();
      return;
    }
    safeRouterBack(router, '/chart/settings');
  };

  const screenBg = T.bgRoot;

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      {/* Status bar spacer */}
      <View style={{ height: insets.top, backgroundColor: screenBg }} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: screenBg }]}>
        <Pressable
          onPress={handleBack}
          activateOnPressIn
          activateOnTouchStart
          unstable_pressDelay={0}
          hitSlop={16}
          style={styles.headerBtn}
        >
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: T.text }]} numberOfLines={1}>
          {t('Open order mode')}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'} style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Pressable style={styles.row} onPress={() => handleSelect('Regular')}>
            <Text style={styles.rowLabel}>{t('Regular')}</Text>
            {openOrderMode === 'Regular' && (
              <Ionicons name="checkmark" size={24} color={T.accent} />
            )}
          </Pressable>
          <View style={styles.separator} />

          <Pressable style={styles.row} onPress={() => handleSelect('Risk calculator')}>
            <Text style={styles.rowLabel}>{t('Risk calculator')}</Text>
            {openOrderMode === 'Risk calculator' && (
              <Ionicons name="checkmark" size={24} color={T.accent} />
            )}
          </Pressable>
          <View style={styles.separator} />

          <Pressable style={styles.row} onPress={() => handleSelect('One-click')}>
            <Text style={styles.rowLabel}>{t('One-click')}</Text>
            {openOrderMode === 'One-click' && (
              <Ionicons name="checkmark" size={24} color={T.accent} />
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? T.glass2 : '#FFFFFF';
  const cardBorder = isDark ? T.border : '#E2E8F0';
  const divider = isDark ? T.borderSubtle : '#E2E8F0';

  return StyleSheet.create({
    screen: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 48,
      paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: divider,
    },
    headerBtn: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, fontSize: 17, fontWeight: '500', textAlign: 'center', letterSpacing: 0.2 },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 40,
      paddingTop: 16,
    },
    card: {
      backgroundColor: cardBg,
      borderRadius: 12,
      marginHorizontal: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: cardBorder,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      minHeight: 52,
    },
    rowLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: T.text,
    },
    separator: {
      height: 1,
      backgroundColor: divider,
      marginLeft: 16,
    },
  });
}
