import { useTheme } from '../../../ui/theme/useTheme';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
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



export const LivePriceHeader = React.memo(({ styles, displayDecimals, priceSource, bid, ask, changePct = 0 }: any) => {
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

  const numericChangePct = typeof changePct === 'number' && Number.isFinite(changePct) ? changePct : 0;
  const change = currentPrice * (numericChangePct / 100);
  const isUp = numericChangePct >= 0;

  return (
    <View style={styles.priceSection}>
      <Text style={[styles.symbolText, { textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: -1, opacity: 0.9 }]}>
        {priceLabel}
      </Text>
      <Text style={styles.livePriceText} numberOfLines={1} adjustsFontSizeToFit>
        {currentPrice.toFixed(displayDecimals)}
      </Text>
      <Text
        style={[styles.priceChangeText, { color: isUp ? T.trading.profit : '#F23645' }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {change > 0 ? '+' : ''}
        {(change || 0).toFixed(displayDecimals)} ({numericChangePct > 0 ? '+' : ''}
        {(numericChangePct || 0).toFixed(2)}%)
      </Text>
    </View>
  );
});

export const LiveQuotePairHeader = React.memo(({ bid, ask, changePct, styles, displayDecimals }: any) => {
  const T = useTheme();
  const tone = typeof changePct === 'number' && changePct >= 0 ? T.trading.profit : '#F23645';
  const hasBid = Number.isFinite(bid) && bid > 0;
  const hasAsk = Number.isFinite(ask) && ask > 0;

  return (
    <View style={styles.quoteSection}>
      <View style={styles.quoteRow}>
        <Text
          style={[styles.quoteValueText, !hasBid && styles.quoteValuePlaceholder, hasBid && { color: tone }]}
          numberOfLines={1}
        >
          {hasBid ? bid.toFixed(displayDecimals) : '---'}
        </Text>
        <Text
          style={[styles.quoteValueText, !hasAsk && styles.quoteValuePlaceholder, hasAsk && { color: tone }]}
          numberOfLines={1}
        >
          {hasAsk ? ask.toFixed(displayDecimals) : '---'}
        </Text>
      </View>
    </View>
  );
});

export const LiveClock = React.memo(({ styles, active = true }: any) => {
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
