import {
  getSltpUnavailableMessage,
  isExistingPositionSltpEnabled,
  resolveBrokerSltpCapabilities,
  type BrokerSltpCapabilities,
} from '../config/brokerSltpCapabilities';
import { captureActiveBrokerSession } from '../state/activeBrokerSession';
import { StaleBrokerSessionError } from './brokerApi';
import { createTradingApiError } from './tradingErrors';

type ProtectionPayload = Readonly<Record<string, unknown>>;

const hasOwn = (value: ProtectionPayload, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const hasSubmittedStopValue = (
  payload: ProtectionPayload,
  keys: readonly string[],
): boolean => keys.some((key) => (
  hasOwn(payload, key) &&
  payload[key] !== undefined &&
  payload[key] !== null
));

const hasPositiveValue = (
  payload: ProtectionPayload,
  keys: readonly string[],
): boolean => keys.some((key) => {
  if (!hasOwn(payload, key)) return false;
  const value = Number(payload[key]);
  return Number.isFinite(value) && value > 0;
});

export const hasMarketOrderProtectionIntent = (
  payload: ProtectionPayload,
): boolean => (
  hasSubmittedStopValue(payload, ['sl', 'tp']) ||
  ['price_sl', 'price_tp'].some((key) => {
    if (!hasOwn(payload, key) || payload[key] === undefined || payload[key] === null) {
      return false;
    }
    const numeric = Number(payload[key]);
    // The market endpoint's legacy aliases historically use literal zero as
    // "unset". Canonical `sl`/`tp` zero remains a submitted (invalid) value.
    return !Number.isFinite(numeric) || numeric !== 0;
  })
);

export const hasPendingOrderProtectionIntent = (
  payload: ProtectionPayload,
): boolean => ['sl', 'tp', 'price_sl', 'price_tp'].some((key) => (
  hasOwn(payload, key) &&
  payload[key] !== undefined
));

export const hasTrailingStopIntent = (
  payload: ProtectionPayload,
): boolean => hasPositiveValue(payload, [
  'trailing_stop',
  'trailing_step',
  'trailingStop',
  'trailingStep',
]);

const unavailable = (brokerId: string | null | undefined) =>
  createTradingApiError(503, {
    error: 'SLTP_UNAVAILABLE',
    message: getSltpUnavailableMessage(brokerId),
  });

const getActiveCapabilities = (): Readonly<{
  brokerId: string;
  capabilities: BrokerSltpCapabilities;
}> => {
  const capture = captureActiveBrokerSession();
  if (!capture) throw new StaleBrokerSessionError();
  return Object.freeze({
    brokerId: capture.session.brokerId,
    capabilities: resolveBrokerSltpCapabilities(capture.session.brokerId),
  });
};

export function assertActiveExistingPositionSltpAllowed(): void {
  const active = getActiveCapabilities();
  if (!isExistingPositionSltpEnabled(active.capabilities)) {
    throw unavailable(active.brokerId);
  }
}

export function assertActiveMarketProtectionAllowed(
  payload: ProtectionPayload,
): void {
  const protectionIntent = hasMarketOrderProtectionIntent(payload);
  const trailingIntent = hasTrailingStopIntent(payload);
  if (!protectionIntent && !trailingIntent) return;

  const active = getActiveCapabilities();
  if (
    (protectionIntent && !active.capabilities.newMarketOrderProtection) ||
    (trailingIntent && !active.capabilities.trailingStop)
  ) {
    throw unavailable(active.brokerId);
  }
}

export function assertActivePendingProtectionAllowed(
  payload: ProtectionPayload,
): void {
  const protectionIntent = hasPendingOrderProtectionIntent(payload);
  const trailingIntent = hasTrailingStopIntent(payload);
  if (!protectionIntent && !trailingIntent) return;

  const active = getActiveCapabilities();
  if (
    (protectionIntent && !active.capabilities.pendingOrderProtection) ||
    (trailingIntent && !active.capabilities.trailingStop)
  ) {
    throw unavailable(active.brokerId);
  }
}
