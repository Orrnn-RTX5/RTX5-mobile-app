import { useTheme } from '../../../ui/theme/useTheme';
import React, { useEffect, useState } from 'react';
import { Text, View, type StyleProp, type TextStyle } from 'react-native';
import {
  type TradeVolumeBounds,
} from '../../../utils/tradeVolume';
import {
  type ChartTimeRange,
} from '../timeRangePresets';
import {
  type FooterLotPickerMode,
} from '../chartTradeInteractionUtils';
import { useTranslation } from '../../../i18n/useTranslation';
import { formatBackendPrice } from '../../../utils/backendPrice';
import { formatBackendDailyChange } from '../../../utils/backendDailyChange';



type PriceHeaderProps = {
  styles: Record<string, StyleProp<TextStyle>>;
  displayDecimals?: number;
  priceSource?: 'bid' | 'ask';
  bid?: number;
  ask?: number;
  changePct?: number;
};

export const LivePriceHeader = React.memo(({ styles, displayDecimals, priceSource, bid, ask, changePct }: PriceHeaderProps) => {
  const T = useTheme();
  const { t } = useTranslation();
  const priceLabel = t('Price');

  const selectedQuote =
    priceSource === 'ask'
      ? (typeof ask === 'number' && Number.isFinite(ask) && ask > 0 ? ask : null)
      : (typeof bid === 'number' && Number.isFinite(bid) && bid > 0 ? bid : null);
  const currentPrice = selectedQuote;

  if (currentPrice === null) {
    return (
      <View style={styles.priceSection}>
        <Text style={[styles.livePriceText, { fontWeight: '700', opacity: 0.9 }]}>---</Text>
      </View>
    );
  }

  const hasDailyChange = typeof changePct === 'number' && Number.isFinite(changePct);
  const isUp = typeof changePct === 'number' && changePct >= 0;

  return (
    <View style={styles.priceSection}>
      <Text style={[styles.symbolText, { textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: -1, opacity: 0.9 }]}>
        {priceLabel}
      </Text>
      <Text style={styles.livePriceText} numberOfLines={1} adjustsFontSizeToFit>
        {formatBackendPrice(currentPrice)}
      </Text>
      <Text
        style={[styles.priceChangeText, { color: hasDailyChange ? (isUp ? T.trading.profit : '#F23645') : T.textMuted }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {formatBackendDailyChange(changePct)}
      </Text>
    </View>
  );
});

export const LiveQuotePairHeader = React.memo(({ bid, ask, changePct, styles, displayDecimals }: PriceHeaderProps) => {
  const T = useTheme();
  const tone = typeof changePct === 'number' && Number.isFinite(changePct)
    ? (changePct >= 0 ? T.trading.profit : '#F23645')
    : T.textMuted;
  const hasBid = typeof bid === 'number' && Number.isFinite(bid) && bid > 0;
  const hasAsk = typeof ask === 'number' && Number.isFinite(ask) && ask > 0;

  return (
    <View style={styles.quoteSection}>
      <View style={styles.quoteRow}>
        <Text
          style={[styles.quoteValueText, !hasBid && styles.quoteValuePlaceholder, hasBid && { color: tone }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {hasBid ? formatBackendPrice(bid) : '---'}
        </Text>
        <Text
          style={[styles.quoteValueText, !hasAsk && styles.quoteValuePlaceholder, hasAsk && { color: tone }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {hasAsk ? formatBackendPrice(ask) : '---'}
        </Text>
      </View>
    </View>
  );
});

export const LiveClock = React.memo(({ styles, active = true }: { styles: Record<string, StyleProp<TextStyle>>; active?: boolean }) => {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    if (!active) {
      return;
    }

    const updateClock = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');

      const offsetMinutes = now.getTimezoneOffset();
      const offsetHoursAbs = Math.floor(Math.abs(offsetMinutes) / 60);
      const offsetMinsAbs = Math.abs(offsetMinutes) % 60;
      const sign = offsetMinutes > 0 ? '-' : '+';
      // Edge case: exactly UTC is just UTC
      const offsetStr = offsetMinutes === 0 ? 'UTC' : `UTC${sign}${offsetHoursAbs}:${String(offsetMinsAbs).padStart(2, '0')}`;

      setTimeStr(`${hh}:${mm}:${ss} (${offsetStr})`);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <Text style={[styles.tvRangeAutoText, { transform: [{ translateX: -20 }] }]} numberOfLines={1} adjustsFontSizeToFit>
      {timeStr}
    </Text>
  );
});
