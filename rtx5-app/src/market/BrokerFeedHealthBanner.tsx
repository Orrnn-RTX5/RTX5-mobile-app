import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { FastPressable } from '../ui/components/FastPressable';
import { useTranslation } from '../i18n/useTranslation';
import { useTheme } from '../ui/theme/useTheme';
import { quotesWsService } from '../api/ws/quotesSocket';
import {
  captureActiveBrokerSession,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionCurrent,
} from '../state/activeBrokerSession';
import { buildFeedHealthBannerModel } from './feedHealthPresentation';
import {
  getFeedHealthRenderSnapshot,
  requestFeedHealthRetry,
  subscribeFeedHealth,
} from './feedHealthRuntime';
import { feedHealthStateMatchesIdentity } from './feedHealthState';

type BrokerFeedHealthBannerProps = Readonly<{
  brokerName?: string;
  compact?: boolean;
  latencyLabel: string;
  style?: StyleProp<ViewStyle>;
}>;

export function BrokerFeedHealthBanner({
  brokerName,
  compact = false,
  latencyLabel,
  style,
}: BrokerFeedHealthBannerProps) {
  const { t } = useTranslation();
  const T = useTheme();
  const state = useSyncExternalStore(
    subscribeFeedHealth,
    getFeedHealthRenderSnapshot,
    getFeedHealthRenderSnapshot,
  );
  const capture = captureActiveBrokerSession();
  const identity = capture ? getActiveBrokerSessionIdentity(capture.session) : null;
  const model = useMemo(() => {
    if (!identity || !feedHealthStateMatchesIdentity(state, identity)) return null;
    return buildFeedHealthBannerModel(state, brokerName || identity.brokerId);
  }, [brokerName, identity, state]);

  const retry = useCallback(() => {
    if (
      !identity ||
      !isActiveBrokerSessionCurrent(identity) ||
      !requestFeedHealthRetry(identity)
    ) {
      return;
    }
    quotesWsService.connect();
  }, [identity]);

  if (!model?.visible) return null;

  const critical = model.tone === 'critical';
  const accent = critical ? '#EF4444' : '#F59E0B';
  const lastSuccess = model.lastSuccessAt
    ? new Date(model.lastSuccessAt).toLocaleString()
    : t('No successful live update yet');

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.banner,
        compact && styles.compactBanner,
        {
          backgroundColor: critical ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.10)',
          borderColor: accent,
        },
        style,
      ]}
    >
      <Ionicons
        name={critical ? 'cloud-offline-outline' : 'time-outline'}
        size={compact ? 17 : 19}
        color={accent}
      />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: T.text }]}>
          {t(model.title)} · {model.brokerLabel}
        </Text>
        <Text style={[styles.reason, { color: T.textSub }]}>{t(model.reasonLabel)}</Text>
        <Text style={[styles.lastSuccess, { color: T.textMuted }]}>
          {t('Last success')}: {lastSuccess}
        </Text>
      </View>
      {model.canRetry ? (
        <FastPressable
          accessibilityRole="button"
          accessibilityLabel={t('Retry market data')}
          activateOnPressIn
          latencyLabel={latencyLabel}
          onPress={retry}
          style={[styles.retry, { borderColor: accent }]}
        >
          <Text style={[styles.retryText, { color: accent }]}>{t('Retry')}</Text>
        </FastPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 76,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  compactBanner: { minHeight: 68, paddingVertical: 8 },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 12, fontWeight: '700' },
  reason: { marginTop: 2, fontSize: 11, fontWeight: '500' },
  lastSuccess: { marginTop: 2, fontSize: 10 },
  retry: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  retryText: { fontSize: 11, fontWeight: '700' },
});
