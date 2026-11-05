import { useSyncExternalStore } from 'react';

import {
  normalizeModifyPositionRequest,
  normalizePositiveSafeIntegerPathSegment,
  positionsApi,
  type ModifyPositionRequest,
} from '../../api/positions';
import {
  captureActiveBrokerSession,
  subscribeActiveBrokerSession,
} from '../../state/activeBrokerSession';
import { usePositionsState } from '../../state/positionsState';
import { beginProtectedPositionsMutation } from '../../state/positionsMutationBarrier';
import {
  fingerprintMarketDataHost,
  recordMarketDataEvent,
} from '../../market/marketDataTelemetry';
import { assertActiveExistingPositionSltpAllowed } from '../../api/sltpCapabilityGuard';
import {
  ModifyPositionCoordinatorCore,
  type ModifyPositionCoordinatorResult,
  type TicketMutationState,
} from './modifyPositionCoordinatorCore';
import {
  buildModifyPositionSessionKey,
  handleModifyPositionSessionEvent,
} from './modifyPositionSessionKey';

const MODIFY_POSITION_REQUEST_TIMEOUT_MS = 10_000;
// Live device reads normally complete in 1-2.4s and the observed slow healthy
// tail was just under 5s. Keep headroom without allowing reconciliation to
// hold the UI behind the 30-40s auth/request stalls reproduced on-device.
const MODIFY_POSITION_RECONCILIATION_TIMEOUT_MS = 6_000;

export const captureModifyPositionSessionKey = (): string | null => {
  const capture = captureActiveBrokerSession();
  return capture ? buildModifyPositionSessionKey(capture.session) : null;
};

export const isModifyPositionSessionKeyCurrent = (sessionKey: string): boolean =>
  captureModifyPositionSessionKey() === sessionKey;

const coordinator = new ModifyPositionCoordinatorCore({
  modify: (input, signal) => positionsApi.modifyPosition(
    input.ticket,
    input.request,
    {
      expectedSymbol: input.symbol,
      signal,
      timeoutMs: MODIFY_POSITION_REQUEST_TIMEOUT_MS,
      onResponseMetadata: (metadata) => {
        const capture = captureActiveBrokerSession();
        if (!capture || captureModifyPositionSessionKey() !== input.sessionKey) return;
        recordMarketDataEvent('modify_position', {
          phase: 'http_response',
          brokerId: capture.session.brokerId,
          apiHostFingerprint: fingerprintMarketDataHost(capture.session.apiBase),
          ticket: input.ticket,
          accountLogin: input.accountLogin,
          ...metadata,
        });
      },
    },
  ),
  readPositions: async (input, signal) => (
    await positionsApi.getPositionsForReconciliation(
      input.accountLogin,
      {
        signal,
        timeoutMs: MODIFY_POSITION_RECONCILIATION_TIMEOUT_MS,
      },
    )
  ) as unknown as ReadonlyArray<Record<string, unknown>>,
  commitPosition: (position, input) => {
    usePositionsState.getState().applyPositionReconciliation(
      input.ticket,
      position,
      String(input.accountLogin),
    );
  },
  captureConfirmed: (input) => {
    const position = usePositionsState.getState().positions.find(
      (candidate) => String(candidate.id) === String(input.ticket),
    );
    if (!position) return undefined;
    const priceSl = Number(position.sl);
    const priceTp = Number(position.tp);
    return Object.freeze({
      price_sl: Number.isFinite(priceSl) && priceSl > 0 ? priceSl : 0,
      price_tp: Number.isFinite(priceTp) && priceTp > 0 ? priceTp : 0,
    });
  },
  isSessionCurrent: (sessionKey) =>
    captureModifyPositionSessionKey() === sessionKey,
  beginProtectedMutation: beginProtectedPositionsMutation,
  mutationTimeoutMs: MODIFY_POSITION_REQUEST_TIMEOUT_MS,
  reconciliationTimeoutMs: MODIFY_POSITION_RECONCILIATION_TIMEOUT_MS,
  recordEvent: (phase, input, details) => {
    const capture = captureActiveBrokerSession();
    if (!capture || captureModifyPositionSessionKey() !== input.sessionKey) return;
    recordMarketDataEvent('modify_position', {
      phase,
      brokerId: capture.session.brokerId,
      apiHostFingerprint: fingerprintMarketDataHost(capture.session.apiBase),
      ticket: input.ticket,
      accountLogin: input.accountLogin,
      ...details,
    });
  },
});

subscribeActiveBrokerSession((event) => {
  // BrokerAPI rebinds an in-flight request to the exact refreshed credential
  // lease. Only a real broker/account transition may cancel reconciliation.
  handleModifyPositionSessionEvent(event.type, () => coordinator.resetSession());
});

export type SubmitModifyPositionInput = Readonly<{
  ticket: string | number;
  symbol: string;
  accountLogin: string | number;
  request: ModifyPositionRequest;
}>;

export const submitModifyPosition = (
  input: SubmitModifyPositionInput,
): Promise<ModifyPositionCoordinatorResult> => {
  // Do not create coordinator state or a reconciliation job for a capability
  // that is fail-closed for the selected broker runtime.
  assertActiveExistingPositionSltpAllowed();
  const capture = captureActiveBrokerSession();
  if (!capture) {
    throw new Error('The active broker session is unavailable.');
  }
  const ticket = normalizePositiveSafeIntegerPathSegment(input.ticket, 'Position ticket');
  const accountLogin = normalizePositiveSafeIntegerPathSegment(input.accountLogin, 'Account login');
  const symbol = input.symbol.trim();
  if (!symbol) {
    throw new TypeError('Modify Position requires the selected position symbol.');
  }
  if (accountLogin.path !== capture.session.accountLogin) {
    throw new Error('The selected position does not belong to the active broker session.');
  }

  const request = normalizeModifyPositionRequest(input.request);
  recordMarketDataEvent('modify_position', {
    phase: 'user_action',
    brokerId: capture.session.brokerId,
    apiHostFingerprint: fingerprintMarketDataHost(capture.session.apiBase),
    ticket: ticket.numeric,
    accountLogin: accountLogin.numeric,
  });
  return coordinator.submit(Object.freeze({
    ticket: ticket.numeric,
    symbol,
    accountLogin: accountLogin.numeric,
    sessionKey: buildModifyPositionSessionKey(capture.session),
    request,
  }));
};

export const notifyModifyPositionSocketHint = (
  tickets?: ReadonlyArray<string | number>,
  accountLogin?: string | number,
): void => {
  coordinator.notifyPositionsHint(tickets, accountLogin);
};

export const notifyModifyPositionSocketSubscription = (): void => {
  coordinator.notifySocketSubscription();
};

export const getModifyPositionTicketState = (
  ticket: string | number,
): TicketMutationState => coordinator.getTicketState(ticket);

export const subscribeModifyPositionTicket = (
  ticket: string | number,
  listener: () => void,
): (() => void) => coordinator.subscribe(ticket, listener);

export const useModifyPositionTicketState = (
  ticket: string | number | null | undefined,
): TicketMutationState => {
  const key = String(ticket ?? '');
  return useSyncExternalStore(
    (listener) => coordinator.subscribe(key, listener),
    () => coordinator.getTicketState(key),
    () => coordinator.getTicketState(key),
  );
};

export type {
  ModifyPositionCoordinatorResult,
  ModifyPositionCoordinatorResultStatus,
  ModifyPositionCoordinatorPhase,
  TicketMutationState,
} from './modifyPositionCoordinatorCore';
