import {
  feedHealthCanSafelyRetry,
  type FeedHealthReasonCategory,
  type FeedHealthState,
  type FeedHealthStatus,
} from './feedHealthState';

export type FeedHealthBannerTone = 'warning' | 'critical';

export type FeedHealthBannerModel = Readonly<{
  visible: boolean;
  tone: FeedHealthBannerTone;
  title: 'Prices Delayed' | 'Market Data Unavailable';
  brokerLabel: string;
  reasonLabel: string;
  lastSuccessAt?: number;
  canRetry: boolean;
}>;

export type CompactFeedStatusLabel = 'LIVE' | 'Connecting...' | 'Reconnecting...' | 'Delayed' | 'Unavailable';

const TERMINAL_FEED_STATUSES = new Set<FeedHealthStatus>([
  'disabled_unconfigured',
  'auth_failed',
  'provider_down',
  'market_unavailable',
]);

/**
 * Compact status used where full feed-health banners are intentionally hidden.
 * Terminal broker/auth states win over a retained tick from an older state so
 * the UI never describes an unavailable feed as LIVE or endlessly connecting.
 */
export const resolveCompactFeedStatusLabel = (
  status: FeedHealthStatus,
  hasFreshTick: boolean,
): CompactFeedStatusLabel => {
  if (TERMINAL_FEED_STATUSES.has(status)) {
    return 'Unavailable';
  }
  if (status === 'reconnecting') {
    return 'Reconnecting...';
  }
  if (status === 'stale_or_degraded') {
    return 'Delayed';
  }
  // A proven connection can be quiet while the header's narrower tick sample
  // is warming. It has not returned to an initial connection attempt.
  if (status === 'healthy' && !hasFreshTick) {
    return 'Delayed';
  }
  return hasFreshTick ? 'LIVE' : 'Connecting...';
};

const reasonLabels: Record<FeedHealthReasonCategory, string> = {
  session_unconfigured: 'Broker feed is not configured',
  credentials_unavailable: 'Feed credentials are unavailable',
  health_policy_unconfigured: 'Feed health policy is awaiting approval',
  awaiting_server_health: 'Waiting for broker feed health',
  awaiting_live_tick: 'Waiting for a live market tick',
  live_ticks: 'Live prices are streaming',
  server_status_incomplete: 'Broker health response is incomplete',
  server_status_stale: 'Broker health status is outdated',
  local_tick_stale: 'Live prices have stopped updating',
  server_degraded: 'Broker feed reports degraded data',
  transport_interrupted: 'Live connection was interrupted',
  authentication: 'Broker rejected feed authentication',
  provider_connectivity: 'Broker market-data provider is offline',
  market_service: 'Broker market-data service is unavailable',
  scheduled_market_closed: 'Market is closed on schedule',
};

const cleanBrokerLabel = (brokerName: string): string => {
  const value = String(brokerName ?? '').trim();
  if (!value) return 'Selected broker';
  return value
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const buildFeedHealthBannerModel = (
  state: FeedHealthState,
  brokerName: string,
): FeedHealthBannerModel => {
  const unavailable =
    state.status === 'disabled_unconfigured' ||
    state.status === 'auth_failed' ||
    state.status === 'provider_down' ||
    state.status === 'market_unavailable';

  // Feed health still drives trade action guards and STALE row state, but the
  // amber/red "Prices Delayed / Market Data Unavailable" banners are removed
  // from Quotes, Chart, Trade, Symbol Details, and any other surface that uses
  // this model. Operators diagnose via Status/Speed and per-row STALE instead.
  return Object.freeze({
    visible: false,
    tone: unavailable ? 'critical' : 'warning',
    title: unavailable ? 'Market Data Unavailable' : 'Prices Delayed',
    brokerLabel: cleanBrokerLabel(brokerName),
    reasonLabel: reasonLabels[state.reasonCategory],
    ...(state.lastSuccessAt ? { lastSuccessAt: state.lastSuccessAt } : {}),
    canRetry: feedHealthCanSafelyRetry(state),
  });
};
