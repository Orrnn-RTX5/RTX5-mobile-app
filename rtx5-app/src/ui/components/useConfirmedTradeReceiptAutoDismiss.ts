import { useEffect, useRef } from 'react';

import {
  resolveConfirmedTradeReceipt,
  type TradeFeedbackPresentationInput,
} from './tradeFeedbackPresentation';

export const CONFIRMED_TRADE_RECEIPT_VISIBLE_MS = 5_000;

type TimedTradeFeedbackState = TradeFeedbackPresentationInput & {
  executedAt?: string;
};

const resolveConfirmedTradeReceiptKey = (
  state: TimedTradeFeedbackState,
): string | null => {
  const receipt = resolveConfirmedTradeReceipt(state);
  if (!receipt) return null;

  return [
    String(state.ticket).trim(),
    receipt.side,
    String(state.executedAt ?? ''),
  ].join(':');
};

/**
 * Automatically closes only broker-confirmed execution receipts. Rejections
 * and confirmation-pending warnings stay visible until the trader dismisses
 * them, while pressing Done still closes a confirmed receipt immediately.
 */
export const useConfirmedTradeReceiptAutoDismiss = (
  state: TimedTradeFeedbackState,
  onClose: () => void,
): void => {
  const receiptKey = resolveConfirmedTradeReceiptKey(state);
  const activeReceiptKeyRef = useRef(receiptKey);
  activeReceiptKeyRef.current = receiptKey;

  useEffect(() => {
    if (!receiptKey) return undefined;

    const timer = setTimeout(() => {
      // A previous receipt's timer must never dismiss a newer fill.
      if (activeReceiptKeyRef.current === receiptKey) {
        onClose();
      }
    }, CONFIRMED_TRADE_RECEIPT_VISIBLE_MS);

    return () => clearTimeout(timer);
  }, [onClose, receiptKey]);
};
