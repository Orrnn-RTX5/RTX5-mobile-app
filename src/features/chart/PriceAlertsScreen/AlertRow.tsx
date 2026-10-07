import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PriceAlert } from '../../../api/alerts';
import { formatBrokerTime } from '../../../utils/brokerTime';
import type { ThemeColors } from '../../../ui/theme/glass';
import type { PriceAlertsStyles } from './styles';

function safeTime(ts: number): string {
  if (!ts) return '--';
  try { return formatBrokerTime(ts); } catch { return '--'; }
}

export type AlertRowProps = {
  alert: PriceAlert;
  onDelete: () => void;
  isDeleting: boolean;
  isLast: boolean;
  T: ThemeColors;
  isDark: boolean;
  styles: PriceAlertsStyles;
};

export function AlertRow({
  alert,
  onDelete,
  isDeleting,
  isLast,
  T,
  isDark,
  styles,
}: AlertRowProps) {
  const isAbove = alert.condition === 'above';
  // `cross` fires when price crosses the level in either direction.
  const isCross = alert.condition === 'cross';
  const conditionLabel = isAbove ? '▲ Above' : isCross ? '↕ Cross' : '▼ Below';
  const conditionColor = isAbove
    ? T.trading.buy.primary
    : isCross
      ? T.text
      : T.trading.sell.primary;

  return (
    <>
      <View style={styles.alertRow}>
        {/* Direction icon */}
        <View style={[
          styles.alertIcon,
          { backgroundColor: alert.triggered
            ? (isDark ? T.glass1 : '#F1F5F9')
            : isAbove
              ? T.upGlow
              : isCross
                ? (isDark ? T.glass1 : '#F1F5F9')
                : (isDark ? T.downGlow : 'rgba(239,68,68,0.12)'),
          },
        ]}>
          <Ionicons
            name={isAbove ? 'trending-up' : isCross ? 'swap-vertical' : 'trending-down'}
            size={18}
            color={alert.triggered ? T.textMuted : conditionColor}
          />
        </View>

        {/* Details */}
        <View style={styles.alertBody}>
          <View style={styles.alertTopRow}>
            <Text style={[styles.alertSymbol, { color: alert.triggered ? T.textMuted : T.text }]}>
              {alert.symbol}
            </Text>
            {alert.triggered && (
              <View style={styles.triggeredBadge}>
                <Text style={styles.triggeredBadgeText}>Triggered</Text>
              </View>
            )}
          </View>
          <Text style={[styles.alertCondition, {
            color: alert.triggered ? T.textMuted : conditionColor,
          }]}>
            {conditionLabel} {alert.price.toFixed(5)}
          </Text>
          {!!alert.message && (
            <Text style={[styles.alertMessage, { color: T.textMuted }]} numberOfLines={1}>
              {alert.message}
            </Text>
          )}
          <Text style={[styles.alertTime, { color: isDark ? T.textDimmed : '#CBD5E1' }]}>
            {safeTime(alert.created_at)}
          </Text>
        </View>

        {/* Delete */}
        <Pressable
          hitSlop={12}
          onPress={onDelete}
          disabled={isDeleting}
          style={[styles.deleteBtn, isDeleting && { opacity: 0.4 }]}
        >
          <Ionicons name="trash-outline" size={18} color={isDark ? T.textMuted : '#94A3B8'} />
        </Pressable>
      </View>
      {!isLast && <View style={styles.separator} />}
    </>
  );
}
