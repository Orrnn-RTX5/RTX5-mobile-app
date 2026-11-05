import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Chart Feature UI: TradingSignalDetailsModal
 * 
 * A modal that expands on "Trading Central" analytic signals, detailing
 * specific intraday resistance/support levels and their associated price pivot points.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsDarkTheme } from '../../state/themeMode';
import { useTheme } from '../../ui/theme/useTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
  symbol: string;
};

export function TradingSignalDetailsModal({ visible, onClose, symbol }: Props) {
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const styles = React.useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay} pointerEvents="box-none">
      {/* Tap-outside-to-dismiss */}
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      
      <View style={[styles.modalContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={T.text} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="always"
            canCancelContentTouches={Platform.OS === 'ios'}
            style={styles.container} 
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
        <Text style={styles.mainTitle}>Intraday: key resistance at 4895.</Text>

        <View style={styles.symbolHeader}>
          <View style={styles.symbolLeft}>
            <View style={styles.coinIconPlaceholder}>
              <Text style={{ fontSize: 18 }}>🪙</Text>
            </View>
            <View>
              <Text style={styles.symbolName}>{symbol}</Text>
              <Text style={styles.symbolDesc}>Gold vs US Dollar</Text>
            </View>
          </View>
          <View style={styles.symbolRight}>
            <Text style={styles.priceText}>4858.00</Text>
            <Text style={styles.changeText}>↓ 0.10%</Text>
          </View>
        </View>

        {/* Mock Chart Image */}
        <View style={[styles.chartContainer, { justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? '#1E1E1E' : '#F1F5F9' }]}>
          <Text style={{ color: T.textMuted, fontSize: 14 }}>[Chart Image Placeholder]</Text>
        </View>

        <View style={styles.timestampRow}>
          <View style={styles.intradayBadge}>
            <Ionicons name="arrow-down" size={14} color="#FFF" />
            <Text style={styles.intradayText}>Intraday</Text>
          </View>
          <Text style={styles.timeText}>Mar 19, 2026 8:42:00 AM</Text>
          <View style={styles.tcLogoPlaceholder}>
            <Text style={styles.tcLogoText}>TRADING {"\n"}CENTRAL</Text>
          </View>
        </View>

        <Text style={styles.synopsisText}>
          {symbol} may fall 53.00 - 83.00 USD
        </Text>

        <View style={styles.preferenceBox}>
          <Text style={styles.preferenceTitle}>Our preference</Text>
          <Text style={styles.preferenceDesc}>
            Short positions below 4895 with targets at 4805 & 4775 in extension.
          </Text>
        </View>

        <View style={styles.levelsList}>
          <LevelRow value="4975.00" label="Resistance" dots={3} color={T.up} />
          <LevelRow value="4940.00" label="Resistance" dots={2} color={T.up} />
          <LevelRow value="4895.00" label="Resistance" dots={1} color={T.up} />
          
          <View style={styles.currentPriceRow}>
            <Text style={[styles.levelValue, { color: T.text }]}>4858.00</Text>
            <Text style={[styles.levelLabel, { color: T.text }]}>Last</Text>
          </View>

          <LevelRow value="4895.00" label="Pivot" color="#3B82F6" />
          <LevelRow value="4805.00" label="Support" dots={1} color={T.down} />
          <LevelRow value="4775.00" label="Support" dots={2} color={T.down} />
          <LevelRow value="4740.00" label="Support" dots={3} color={T.down} />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
      </View>
    </View>
  );
}

function LevelRow({ value, label, dots, color }: { value: string; label: string; dots?: number; color: string }) {
  return (
    <View style={stylesShared.levelRow}>
      <Text style={[stylesShared.levelValue, { color }]}>{value}</Text>
      <View style={stylesShared.labelGroup}>
        <Text style={[stylesShared.levelLabel, { color }]}>{label}</Text>
        {dots && (
          <View style={stylesShared.dotsCont}>
            {Array.from({ length: dots }).map((_, i) => (
              <View key={i} style={[stylesShared.dot, { backgroundColor: color }]} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const stylesShared = StyleSheet.create({
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  levelValue: {
    width: 90,
    fontSize: 16,
    fontWeight: '700',
  },
  labelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  levelLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  dotsCont: {
    flexDirection: 'row',
    gap: 3,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});

function makeStyles(T: any, isDark: boolean) {
  return StyleSheet.create({
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 9999,
      elevation: 9999,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      height: '90%',
    },
    modalHeader: {
      alignItems: 'flex-end',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0',
    },
    closeBtn: {
      padding: 4,
    },
    container: {
      flex: 1,
    },
    content: {
      padding: 20,
    },
    mainTitle: {
      fontSize: 26,
      fontWeight: '700',
      color: T.text,
      marginBottom: 24,
      lineHeight: 32,
    },
    symbolHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    symbolLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    coinIconPlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? '#1E1E1E' : '#F1F5F9',
      justifyContent: 'center',
      alignItems: 'center',
    },
    symbolName: {
      fontSize: 20,
      fontWeight: '700',
      color: T.text,
    },
    symbolDesc: {
      fontSize: 14,
      color: T.textMuted,
      marginTop: 2,
    },
    symbolRight: {
      alignItems: 'flex-end',
    },
    priceText: {
      fontSize: 18,
      fontWeight: '600',
      color: T.text,
    },
    changeText: {
      fontSize: 14,
      color: T.down, // Hardcoded red to match mock, but should ideally be dynamic
      fontWeight: '500',
      marginTop: 2,
    },
    chartContainer: {
      width: '100%',
      aspectRatio: 1.5,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 16,
      backgroundColor: '#FFF', // Keeping white even in dark mode for image clarity
      borderWidth: 1,
      borderColor: isDark ? '#334155' : '#E2E8F0',
    },
    chartImage: {
      width: '100%',
      height: '100%',
    },
    timestampRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 24,
    },
    intradayBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: T.down,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
      gap: 4,
    },
    intradayText: {
      color: '#FFF',
      fontSize: 12,
      fontWeight: '600',
    },
    timeText: {
      fontSize: 14,
      color: T.textMuted,
    },
    tcLogoPlaceholder: {
      backgroundColor: T.trading.profit,
      borderRadius: 12,
      paddingHorizontal: 6,
      paddingVertical: 3,
      justifyContent: 'center',
      alignItems: 'center',
    },
    tcLogoText: {
      fontSize: 7,
      color: '#FFF',
      fontWeight: '600',
      textAlign: 'center',
      lineHeight: 8,
    },
    synopsisText: {
      fontSize: 17,
      color: T.textMuted,
      marginBottom: 16,
    },
    preferenceBox: {
      marginBottom: 24,
    },
    preferenceTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: T.text,
      marginBottom: 8,
    },
    preferenceDesc: {
      fontSize: 16,
      color: T.text,
      lineHeight: 24,
    },
    levelsList: {
      paddingTop: 8,
    },
    currentPriceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
    },
    levelValue: {
      width: 90,
      fontSize: 16,
      fontWeight: '700',
    },
    levelLabel: {
      fontSize: 16,
      fontWeight: '500',
    },
  });
}
