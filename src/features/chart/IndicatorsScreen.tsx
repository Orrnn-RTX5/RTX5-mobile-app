import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Chart Feature UI: IndicatorsScreen
 *
 * Categorized list of technical indicators (Trend, Oscillators, Volumes, Bill Williams).
 * Opened from the radial menu's "indicators" icon. Slides in from the left.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui/components/Screen';
import { useIsDarkTheme } from '../../state/themeMode';
import { useTranslation } from '../../i18n/useTranslation';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { safeRouterBack } from '../../utils/navigation';
import { INDICATOR_ID_BY_NAME } from './indicatorRegistry';

type IndicatorSection = {
  title: string;
  items: string[];
};

const INDICATOR_SECTIONS: IndicatorSection[] = [
  {
    title: 'Trend',
    items: [
      'Average Directional Movement Index',
      'Bollinger Bands',
      'Envelopes',
      'Ichimoku Kinko Hyo',
      'Moving Average',
      'Parabolic SAR',
      'Standard Deviation',
      'ZigZag',
    ],
  },
  {
    title: 'Oscillators',
    items: [
      'Average True Range',
      'Bears Power',
      'Bulls Power',
      'Commodity Channel Index',
      'DeMarker',
      'Force Index',
      'MACD',
      'Momentum',
      'Moving Average of Oscillator',
      'Relative Strength Index',
      'Relative Vigor Index',
      'Stochastic Oscillator',
      "Williams' Percent Range",
    ],
  },
  {
    title: 'Volumes',
    items: [
      'Accumulation/Distribution',
      'Market Profile',
      'Money Flow Index',
      'On Balance Volume',
      'Volumes',
    ],
  },
  {
    title: 'Bill Williams',
    items: [
      'Accelerator Oscillator',
      'Alligator',
      'Awesome Oscillator',
      'Fractals',
      'Gator Oscillator',
      'Market Facilitation Index',
    ],
  },
];

export function IndicatorsScreen() {
  const { t } = useTranslation();
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const handleSelectIndicator = (name: string) => {
    const id = INDICATOR_ID_BY_NAME[name];
    if (!id) return;
    router.push({ pathname: '/chart/indicator-config', params: { id } });
  };

  return (
    <Screen style={s.screen}>
      <View style={[s.header, { paddingTop: Math.max(insets.top, 0) + 8 }]}>
        <Pressable
          onPress={() => safeRouterBack(router, '/(tabs)/chart')}
          activateOnPressIn
          hitSlop={16}
          style={s.headerBackBtn}
        >
          <Ionicons name="arrow-back" size={24} color={T.text} />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{t('Indicators')}</Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {INDICATOR_SECTIONS.map((section) => (
          <View key={section.title} style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>{t(section.title).toUpperCase()}</Text>
            </View>
            <View style={s.sectionDivider} />
            {section.items.map((item, idx) => (
              <Pressable
                key={item}
                onPress={() => handleSelectIndicator(item)}
                style={({ pressed }) => [
                  s.itemRow,
                  idx !== 0 && s.itemDivider,
                  pressed && s.itemRowPressed,
                ]}
              >
                <Text style={s.itemText}>{t(item)}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: T.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 16,
      backgroundColor: T.bg,
    },
    headerBackBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      color: T.text,
      fontSize: 20,
      fontWeight: '500',
      marginLeft: 8,
    },
    scrollContent: {
      paddingBottom: 40,
    },
    section: {
      marginTop: 8,
    },
    sectionHeaderRow: {
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 10,
    },
    sectionTitle: {
      color: T.text,
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 0.4,
    },
    sectionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)',
      marginHorizontal: 20,
    },
    itemRow: {
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    itemRowPressed: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    },
    itemDivider: {
      borderTopWidth: 0,
    },
    itemText: {
      color: T.text,
      fontSize: 15,
      fontWeight: '400',
    },
  });
}
