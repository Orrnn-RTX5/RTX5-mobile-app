import { classifyTradingError } from '../../api/tradingErrors';
import { resolveBrokerExecutionEvidence } from '../../api/orders/executionEvidence';
import type {
  ChartTradeQueueEvent,
  ChartTradeQueueFeedback,
  ChartTradeReceiptStackController,
} from '../chart/components/chartTradeReceiptStackController';

/** Each request owns one immutable receipt, even when responses arrive out of order. */
export function createMarketTradeReceiptCallbacks(
  controller: ChartTradeReceiptStackController,
  event: ChartTradeQueueEvent,
  isCurrent: () => boolean,
) {
  let settled = false;
  controller.applyEvent({ ...event, status: 'pending' });
  const finish = (
    status: ChartTradeQueueEvent['status'],
    feedback?: ChartTradeQueueFeedback,
  ) => {
    if (settled) return;
    settled = true;
    if (!controller.getSnapshot().some(row => row.queueId === event.queueId)) return;
    controller.applyEvent({ ...event, status: isCurrent() ? status : 'cancelled', feedback });
  };
  const onError = (error: unknown) => {
    const feedback = classifyTradingError(error, { action: 'place-order' });
    const definitivelyRejected = feedback.status !== 202
      && (feedback.kind === 'backend-rejection' || feedback.kind === 'rate-limit');
    finish(definitivelyRejected ? 'failed' : 'unconfirmed', {
      visible: true, type: 'error', title: feedback.title, message: feedback.message,
      side: event.side, symbol: event.symbol, volume: event.volume,
    });
  };
  return {
    onSuccess(data: any) {
      if (['rejected', 'failed', 'error'].includes(String(data?.status ?? '').trim().toLowerCase())) {
        onError({ status: 400, data: { message: data?.comment || `Server returned status: ${data?.status}` } });
        return;
      }
      const evidence = resolveBrokerExecutionEvidence(data);
      finish(evidence.confirmed ? 'confirmed' : 'unconfirmed', {
        visible: true, type: 'success', executionConfirmed: evidence.confirmed,
        title: evidence.confirmed ? 'Order Executed' : 'Order Submitted — Confirmation Pending',
        side: event.side, symbol: event.symbol, volume: event.volume,
        ...(evidence.ticket !== undefined ? { ticket: String(evidence.ticket) } : {}),
        ...(evidence.executionPrice !== undefined ? { price: evidence.executionPrice } : {}),
      });
    },
    onError,
    onSettled() { finish('cancelled'); },
  };
}
