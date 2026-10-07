import { GDark, GLight } from '../../../ui/theme/glass';
import { Ionicons } from '@expo/vector-icons';
import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { PreviewSourceCandle } from '../preview/chartPreviewShared';
import {
  resolveChartSymbolCategory,
  resolveChartSymbolFullName,
} from '../chartSymbolMetadata';
import { FastPressable as Pressable } from '../../../ui/components/FastPressable';

export const CHART_OHLC_HIGH_COLOR = GDark.trading.profit;
export const CHART_OHLC_LOW_COLOR = '#F23645';

export type ChartSymbolHeaderOverlayProps = Readonly<{
  symbol: string;
  candle: PreviewSourceCandle | null;
  displayDecimals: number;
  isDark: boolean;
  showTicker: boolean;
  showOHLC: boolean;
  compact?: boolean;
  onSymbolPress?: () => void;
  testID?: string;
}>;

export const ChartSymbolHeaderOverlay = memo(function ChartSymbolHeaderOverlay({
  symbol,
  candle,
  displayDecimals,
  isDark,
  showTicker,
  showOHLC,
  compact = false,
  onSymbolPress,
  testID = 'chart-symbol-header-overlay',
}: ChartSymbolHeaderOverlayProps) {
  const displaySymbol = symbol.replace(/\//g, '');
  const fullName = useMemo(() => resolveChartSymbolFullName(symbol), [symbol]);
  const category = useMemo(() => resolveChartSymbolCategory(symbol), [symbol]);
  const safeDisplayDecimals = Math.max(0, Math.min(10, Math.floor(displayDecimals)));
  const neutralColor = isDark ? '#FFFFFF' : '#0F172A';
  const mutedColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#334155' : '#CBD5E1';
  const formatValue = (value: number | null | undefined) => (
    Number.isFinite(value) ? Number(value).toFixed(safeDisplayDecimals) : '--'
  );
  const ohlcItems = [
    { label: 'O', value: formatValue(candle?.open), color: neutralColor },
    { label: 'H', value: formatValue(candle?.high), color: isDark ? CHART_OHLC_HIGH_COLOR : GLight.trading.profit },
    { label: 'L', value: formatValue(candle?.low), color: CHART_OHLC_LOW_COLOR },
    { label: 'C', value: formatValue(candle?.close), color: neutralColor },
  ];

  return (
    <Pressable
      style={[styles.root, compact && styles.rootCompact]}
      onPress={onSymbolPress}
      disabled={!onSymbolPress}
      accessibilityRole={onSymbolPress ? 'button' : undefined}
      accessibilityLabel={onSymbolPress ? `Select ${displaySymbol} symbol` : undefined}
      testID={testID}
      activateOnPressIn
      hitSlop={8}
    >
      {showTicker ? (
        <View style={styles.symbolTapTarget} testID={`${testID}-symbol`}>
          <View style={styles.symbolRow}>
            <Text
              style={[styles.symbolText, compact && styles.symbolTextCompact, { color: neutralColor }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {displaySymbol}
            </Text>
            {onSymbolPress ? <Ionicons name="chevron-down" size={10} color={neutralColor} /> : null}
            {!compact && category ? (
              <View style={[styles.categoryBadge, { borderColor }]}>
                <Text style={[styles.categoryText, { color: mutedColor }]} numberOfLines={1}>
                  {category}
                </Text>
              </View>
            ) : null}
          </View>
          {!compact ? (
            <Text style={[styles.fullNameText, { color: mutedColor }]} numberOfLines={1} adjustsFontSizeToFit>
              {fullName}
            </Text>
          ) : null}
        </View>
      ) : null}

      {showOHLC && !compact ? (
        <View style={styles.ohlcRow} testID={`${testID}-ohlc`}>
          {ohlcItems.map((item) => (
            <View key={item.label} style={styles.ohlcPair}>
              <Text style={styles.ohlcLabel}>{item.label}:</Text>
              <Text style={[styles.ohlcValue, { color: item.color }]}>{item.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: {
    minWidth: 0,
    paddingHorizontal: 7,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  rootCompact: {
    paddingVertical: 3,
  },
  symbolTapTarget: {
    minWidth: 0,
    alignSelf: 'flex-start',
  },
  symbolRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  symbolText: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '500',
  },
  symbolTextCompact: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
  },
  categoryBadge: {
    flexShrink: 0,
    marginLeft: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  categoryText: {
    fontSize: 8,
    fontWeight: '600',
  },
  fullNameText: {
    minWidth: 0,
    marginTop: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
  ohlcRow: {
    minWidth: 0,
    marginTop: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 4,
    rowGap: 1,
  },
  ohlcPair: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ohlcLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  ohlcValue: {
    marginLeft: 1,
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
