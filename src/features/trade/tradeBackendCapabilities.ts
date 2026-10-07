import {
  isPendingChartOrderType,
  type ChartOrderType,
} from '../chart/chartTradeOrderUtils';
import { captureActiveBrokerSession } from '../../state/activeBrokerSession';
import {
  getSltpUnavailableMessage,
  isExistingPositionSltpEnabled,
  resolveBrokerSltpCapabilities as resolveConfiguredBrokerSltpCapabilities,
  SLTP_UNAVAILABLE_TITLE,
  type BrokerSltpCapabilities,
} from '../../config/brokerSltpCapabilities';

export type { BrokerSltpCapabilities } from '../../config/brokerSltpCapabilities';
export {
  BROKER_SLTP_CAPABILITIES,
  CANONICAL_SLTP_BROKER_IDS,
  MARKET_AND_POSITION_SLTP_CAPABILITIES,
  NO_BROKER_SLTP_CAPABILITIES,
  canonicalBrokerId,
  getSltpUnavailableMessage,
  isExistingPositionSltpEnabled,
} from '../../config/brokerSltpCapabilities';

export type TradeBackendCapabilities = Readonly<{
  pendingOrders: boolean;
  sltp: BrokerSltpCapabilities;
}>;

export type TradeBackendCapabilityEnvironment = Readonly<{
  EXPO_PUBLIC_PENDING_ORDERS_API_READY?: string;
  /**
   * Retained only so an older build environment remains type-compatible.
   * Runtime SL/TP activation from a public environment variable is
   * intentionally unsupported and this value is ignored.
   */
  EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES?: string;
}>;

const isExplicitlyEnabled = (value: string | undefined): boolean =>
  value?.trim().toLowerCase() === 'true';

export const resolveBrokerSltpCapabilities = (
  _environment: TradeBackendCapabilityEnvironment,
  brokerId: string | undefined | null,
): BrokerSltpCapabilities => resolveConfiguredBrokerSltpCapabilities(brokerId);

export const resolveTradeBackendCapabilities = (
  environment: TradeBackendCapabilityEnvironment,
  brokerId?: string | null,
): TradeBackendCapabilities => Object.freeze({
  pendingOrders: isExplicitlyEnabled(environment.EXPO_PUBLIC_PENDING_ORDERS_API_READY),
  sltp: resolveBrokerSltpCapabilities(environment, brokerId),
});

const ACTIVE_CAPABILITY_ENVIRONMENT: TradeBackendCapabilityEnvironment = Object.freeze({
  EXPO_PUBLIC_PENDING_ORDERS_API_READY:
    process.env.EXPO_PUBLIC_PENDING_ORDERS_API_READY,
});

export const getActiveTradeBackendCapabilities = (): TradeBackendCapabilities =>
  resolveTradeBackendCapabilities(
    ACTIVE_CAPABILITY_ENVIRONMENT,
    captureActiveBrokerSession()?.session.brokerId,
  );

export const isPendingOrderTypeBackendLocked = (
  orderType: ChartOrderType,
  _capabilities: TradeBackendCapabilities = getActiveTradeBackendCapabilities(),
): boolean => isPendingChartOrderType(orderType);

export const isExistingPositionModifyBackendLocked = (
  capabilities: TradeBackendCapabilities = getActiveTradeBackendCapabilities(),
): boolean => !isExistingPositionSltpEnabled(capabilities.sltp);

export const isNewMarketOrderProtectionBackendLocked = (
  capabilities: TradeBackendCapabilities = getActiveTradeBackendCapabilities(),
): boolean => !capabilities.sltp.newMarketOrderProtection;

export const isPendingOrderProtectionBackendLocked = (
  capabilities: TradeBackendCapabilities = getActiveTradeBackendCapabilities(),
): boolean => !capabilities.sltp.pendingOrderProtection;

export const isDynamicSltpConstraintsBackendLocked = (
  capabilities: TradeBackendCapabilities = getActiveTradeBackendCapabilities(),
): boolean => !capabilities.sltp.dynamicConstraints;

export const isTrailingStopBackendLocked = (
  capabilities: TradeBackendCapabilities = getActiveTradeBackendCapabilities(),
): boolean => !capabilities.sltp.trailingStop;

export const isVenueBrokerConfirmationBackendLocked = (
  capabilities: TradeBackendCapabilities = getActiveTradeBackendCapabilities(),
): boolean => !capabilities.sltp.venueBrokerConfirmation;

/** @deprecated Venue confirmation is independent from RTX5 persistence. */
export const isBrokerConfirmedModifyBackendLocked = (
  capabilities: TradeBackendCapabilities = getActiveTradeBackendCapabilities(),
): boolean => isVenueBrokerConfirmationBackendLocked(capabilities);

export const isRevisionedModifyBackendLocked = (
  capabilities: TradeBackendCapabilities = getActiveTradeBackendCapabilities(),
): boolean => !capabilities.sltp.revisionIdempotencySafety;

export const getActiveSltpUnavailableMessage = (): string =>
  getSltpUnavailableMessage(
    captureActiveBrokerSession()?.session.brokerId,
  );

/** @deprecated Prefer SLTP_UNAVAILABLE_TITLE. */
export const SLTP_COMING_SOON_TITLE = SLTP_UNAVAILABLE_TITLE;
/** @deprecated Prefer getActiveSltpUnavailableMessage(). */
export const SLTP_COMING_SOON_MESSAGE =
  getSltpUnavailableMessage(null);
