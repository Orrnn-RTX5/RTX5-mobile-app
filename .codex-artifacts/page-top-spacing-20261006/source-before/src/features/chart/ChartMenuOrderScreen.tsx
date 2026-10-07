import { FastPressable as Pressable } from '../../ui/components/FastPressable';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui/components/Screen';
import { safeRouterBack } from '../../utils/navigation';
import { useIsDarkTheme } from '../../state/themeMode';
import { useTheme } from '../../ui/theme/useTheme';
import { useTranslation } from '../../i18n/useTranslation';
import { ThemeColors } from '../../ui/theme/glass';

export function ChartMenuOrderScreen() {
  const { t } = useTranslation();
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  return (
    <Screen style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => safeRouterBack(router, '/(tabs)/chart')}
            activateOnPressIn
            hitSlop={16}
            style={styles.headerBackBtn}
          >
            <Ionicons name="arrow-back" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>
          <View style={styles.headerTitleWrap} pointerEvents="none">
            <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
              {t('Order of menu items')}
            </Text>
          </View>
          <View style={styles.headerBackBtn} />
        </View>
      </View>
      <View style={styles.content} />
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    screen: {
      backgroundColor: T.bg,
      paddingHorizontal: 0,
    },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E3E8F0',
      backgroundColor: T.bg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerBackBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    headerTitle: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 17,
      fontWeight: '500',
      letterSpacing: 0.3,
    },
    content: {
      flex: 1,
    },
  });
}
