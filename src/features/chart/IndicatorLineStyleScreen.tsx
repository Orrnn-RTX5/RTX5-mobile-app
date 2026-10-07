import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Chart Feature UI: IndicatorLineStyleScreen
 *
 * MT5-style line editor — pick color from palette, line style, and width.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui/components/Screen';
import { useIsDarkTheme } from '../../state/themeMode';
import { useTranslation } from '../../i18n/useTranslation';
import { useTheme } from '../../ui/theme/useTheme';
import { safeRouterBack } from '../../utils/navigation';
import {
  Card,
  LinePreview,
  MT5_COLOR_PALETTE,
  Row,
  SectionHeader,
  Separator,
} from './components/IndicatorConfigPrimitives';
import { useIndicatorEditState } from './indicatorEditState';
import { LINE_STYLE_OPTIONS, LineStyle } from './indicatorRegistry';

const WIDTHS = [1, 2, 3, 4, 5];

export function IndicatorLineStyleScreen() {
  const { lineKey } = useLocalSearchParams<{ lineKey: string }>();
  const { t } = useTranslation();
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();

  const line = useIndicatorEditState((s) =>
    s.styleLines.find((l) => l.key === lineKey),
  );
  const updateLine = useIndicatorEditState((s) => s.updateLine);

  const bgColor = T.bg;
  const styles = useMemo(() => makeStyles(bgColor, isDark, T.text), [bgColor, isDark, T.text]);

  if (!line || !lineKey) {
    return (
      <Screen style={styles.screen}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 8 }]}>
          <Pressable
            onPress={() => safeRouterBack(router, '/chart/indicators')}
            activateOnPressIn
            hitSlop={16}
            style={styles.headerBackBtn}
          >
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>
          <View style={styles.headerTitleWrap} pointerEvents="none">
            <Text style={styles.headerTitle}>{t('Line')}</Text>
          </View>
          <View style={styles.headerBackBtn} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 8 }]}>
        <Pressable
          onPress={() => safeRouterBack(router, '/chart/indicators')}
          activateOnPressIn
          hitSlop={16}
          style={styles.headerBackBtn}
        >
          <Ionicons name="arrow-back" size={24} color={T.text} />
        </Pressable>
        <View style={styles.headerTitleWrap} pointerEvents="none">
          <Text style={styles.headerTitle} numberOfLines={1}>{t(line.name)}</Text>
        </View>
        <View style={styles.headerBackBtn} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <SectionHeader title={t('Preview')} isDark={isDark} />
        <Card isDark={isDark}>
          <View style={styles.previewRow}>
            <LinePreview
              color={line.color}
              style={line.style}
              width={line.width}
              previewWidth={180}
            />
          </View>
        </Card>

        <SectionHeader title={t('Color')} isDark={isDark} />
        <Card isDark={isDark}>
          <View style={styles.colorGrid}>
            {MT5_COLOR_PALETTE.map((c) => {
              const selected = c.toLowerCase() === line.color.toLowerCase();
              return (
                <Pressable
                  key={c}
                  onPress={() => updateLine(lineKey, { color: c })}
                  style={[
                    styles.colorCell,
                    { backgroundColor: c },
                    selected && styles.colorCellSelected,
                  ]}
                >
                  {selected && (
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color={isLight(c) ? '#000' : '#FFF'}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        </Card>

        <SectionHeader title={t('Style')} isDark={isDark} />
        <Card isDark={isDark}>
          {LINE_STYLE_OPTIONS.map((opt, idx) => (
            <View key={opt.value}>
              <Row
                label={t(opt.label)}
                rightNode={
                  <>
                    <LinePreview color={line.color} style={opt.value as LineStyle} width={line.width} />
                    {line.style === opt.value && (
                      <Ionicons name="checkmark" size={18} color={T.trading.buy.primary} />
                    )}
                  </>
                }
                onPress={() => updateLine(lineKey, { style: opt.value as LineStyle })}
                T={T}
                isDark={isDark}
                showChevron={false}
              />
              {idx < LINE_STYLE_OPTIONS.length - 1 && <Separator isDark={isDark} />}
            </View>
          ))}
        </Card>

        <SectionHeader title={t('Width')} isDark={isDark} />
        <Card isDark={isDark}>
          {WIDTHS.map((w, idx) => (
            <View key={w}>
              <Row
                label={`${w} pt`}
                rightNode={
                  <>
                    <LinePreview color={line.color} style={line.style} width={w} />
                    {line.width === w && (
                      <Ionicons name="checkmark" size={18} color={T.trading.buy.primary} />
                    )}
                  </>
                }
                onPress={() => updateLine(lineKey, { width: w })}
                T={T}
                isDark={isDark}
                showChevron={false}
              />
              {idx < WIDTHS.length - 1 && <Separator isDark={isDark} />}
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function isLight(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 186;
}

function makeStyles(bgColor: string, isDark: boolean, textColor: string) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: bgColor,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E3E8F0',
      backgroundColor: bgColor,
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
    },
    headerTitle: {
      color: textColor,
      fontSize: 17,
      fontWeight: '500',
      letterSpacing: 0.3,
    },
    previewRow: {
      alignItems: 'center',
      paddingVertical: 18,
    },
    colorGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      padding: 12,
    },
    colorCell: {
      width: 40,
      height: 40,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorCellSelected: {
      borderWidth: 2,
      borderColor: '#3B82F6',
    },
  });
}
