import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Chart Feature UI: ChartColorsScreen
 * 
 * Provides an interface for customizing the colors of diverse chart components.
 * Designed with a premium, dynamic interface for professional traders.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Modal } from 'react-native';
import { ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui/components/Screen';
import { useTheme } from '../../ui/theme/useTheme';
import { useIsDarkTheme } from '../../state/themeMode';
import { resolveChartColorsForTheme, useUserPreferences } from '../../state/userPreferences';
import { useTranslation } from '../../i18n/useTranslation';
import { ThemeColors } from '../../ui/theme/glass';
import { OVERLAY_MODAL_PROPS } from '../../ui/overlayModalProps';
import type { ChartColorsConfig } from '../../state/userPreferences';

type ColorRow = { label: string; keyId: keyof ChartColorsConfig };

const SECTIONS: { title: string; items: ColorRow[] }[] = [
  {
    title: 'CANDLES',
    items: [
      { label: 'Uptrend', keyId: 'candlesUptrend' },
      { label: 'Downtrend', keyId: 'candlesDowntrend' },
    ],
  },
  {
    title: 'HOLLOW CANDLES',
    items: [
      { label: 'Body', keyId: 'hollowBody' },
    ],
  },
  {
    title: 'BARS',
    items: [
      { label: 'Uptrend', keyId: 'barsUptrend' },
      { label: 'Downtrend', keyId: 'barsDowntrend' },
    ],
  },
  {
    title: 'LINE',
    items: [
      { label: 'Body', keyId: 'lineBody' },
    ],
  },
];

export function ChartColorsScreen() {
  const { t } = useTranslation();
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  const chartColors = useUserPreferences((s) => s.chartColors);
  const router = require('expo-router').useRouter();
  
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const [activeKey, setActiveKey] = useState<keyof ChartColorsConfig | null>(null);
  const chartColorScheme = useUserPreferences((s) => s.chartColorScheme);
  const setChartColor = useUserPreferences((s) => s.setChartColor);
  const resolvedChartColors = useMemo(
    () => resolveChartColorsForTheme(chartColors, chartColorScheme, isDark),
    [chartColorScheme, chartColors, isDark],
  );

  const PRESET_COLORS = [
    '#2962FF', '#EF5350', '#26A69A', '#F59E0B', '#8B5CF6', 
    '#EC4899', '#14B8A6', '#1E293B', '#F8FAFC', '#FFFFFF', '#000000',
    'transparent'
  ];

  const resolveHexLabel = (value: string | undefined) =>
    value && value !== 'transparent' ? value.toUpperCase() : t('Transparent').toUpperCase();

  const handleSelectColor = (color: string) => {
    if (!activeKey) return;
    // Entering Custom from a preset scheme: freeze the theme-resolved palette
    // first so the other structural colors keep looking exactly as rendered
    // (see ChartPropertiesScreen.commitChartColor).
    if (chartColorScheme !== 'custom') {
      (Object.keys(resolvedChartColors) as Array<keyof ChartColorsConfig>).forEach((paletteKey) => {
        const paletteValue = resolvedChartColors[paletteKey];
        if (paletteKey !== activeKey && typeof paletteValue === 'string') {
          setChartColor(paletteKey, paletteValue);
        }
      });
    }
    setChartColor(activeKey, color);
    setActiveKey(null);
  };


  return (
    <Screen style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'} style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {SECTIONS.map((section, sIdx) => (
          <View key={section.title} style={{ marginTop: sIdx === 0 ? 8 : 24 }}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeader}>{t(section.title)}</Text>
            </View>
            <View style={[styles.sectionCard, styles.cardShadow]}>
              {section.items.map((item, idx) => (
                <View key={item.label}>
                  <Pressable onPress={() => setActiveKey(item.keyId)}
                    style={({ pressed }) => [
                      styles.colorRow,
                      pressed && { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }
                    ]}
                  >
                    {/* Left: Label */}
                    <View style={styles.rowLeft}>
                      <Text style={styles.rowLabel}>{t(item.label)}</Text>
                    </View>

                    {/* Right: Hex Code & Color Swatch */}
                    <View style={styles.rowRight}>
                      <Text style={styles.hexText}>{resolveHexLabel(chartColors[item.keyId])}</Text>
                      <View style={styles.colorSwatchWrap}>
                        <View style={[styles.colorSwatch, { backgroundColor: chartColors[item.keyId] }]} />
                        <View style={styles.colorSwatchHighlight} />
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={T.textMuted} style={{ marginLeft: 6 }} />
                    </View>
                  </Pressable>
                  {idx < section.items.length - 1 && <View style={styles.separator} />}
                </View>
              ))}
            </View>
          </View>
        ))}
        <View style={{ height: 60 }} />
      </ScrollView>
    
      
      
      <Modal
        transparent
        visible={!!activeKey}
        animationType="none"
        {...OVERLAY_MODAL_PROPS}
        // See ChartPropertiesScreen: the first translucent-nav modal of an
        // Android process lays out under the opaque nav bar. Non-translucent
        // keeps every open at identical geometry.
        navigationBarTranslucent={false}
        statusBarTranslucent={false}
        onRequestClose={() => setActiveKey(null)}
      >
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => setActiveKey(null)}>
          <Pressable style={{ backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? Math.max(48, 24 + insets.bottom) : 48 }} onPress={(e) => e.stopPropagation()}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: isDark ? '#FFFFFF' : '#000000', marginBottom: 16, textAlign: 'center' }}>{t('Select Color')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              {PRESET_COLORS.map(c => (
                <Pressable
                  key={c}
                  onPress={() => handleSelectColor(c)}
                  style={{
                    width: 42, height: 42, borderRadius: 21, backgroundColor: c,
                    borderWidth: c === 'transparent' ? 1 : 2,
                    borderColor: c === 'transparent' ? (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)') : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'),
                    alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden'
                  }}
                >
                  {c === 'transparent' && <View style={{ width: 60, height: 2, backgroundColor: '#EF5350', transform: [{ rotate: '45deg' }] }} />}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    </Screen>

  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    screen: {
      backgroundColor: T.bg,
      paddingHorizontal: 0,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 48,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 22,
      paddingBottom: 10,
      gap: 8,
    },
    sectionHeader: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? 'rgba(255,255,255,0.4)' : '#64748B',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    sectionCard: {
      backgroundColor: isDark ? 'rgba(30, 41, 59, 0.4)' : '#FFFFFF',
      marginHorizontal: 16,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : '#E2E8F0',
    },
    cardShadow: {
      ...Platform.select({
        ios: {
          shadowColor: isDark ? '#000' : '#475569',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.3 : 0.06,
          shadowRadius: 16,
        },
        android: {
          elevation: isDark ? 0 : 4,
        },
        web: {
          boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 8px 24px rgba(71, 85, 105, 0.05)',
        }
      })
    },
    colorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      minHeight: 56,
    },
    rowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    rowLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: isDark ? '#F8FAFC' : '#0F172A',
      letterSpacing: 0.3,
    },
    rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    hexText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? 'rgba(255,255,255,0.3)' : '#94A3B8',
      fontVariant: ['tabular-nums'],
    },
    colorSwatchWrap: {
      width: 32,
      height: 32,
      borderRadius: 10,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
      position: 'relative',
    },
    colorSwatch: {
      ...StyleSheet.absoluteFillObject,
    },
    colorSwatchHighlight: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderTopWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.3)',
      borderRadius: 8,
    },
    separator: {
      height: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F1F5F9',
      marginLeft: 60,
    },
  });
}
