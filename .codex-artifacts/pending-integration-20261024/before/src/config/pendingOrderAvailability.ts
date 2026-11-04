// Pending orders currently support editing chart/ticket drafts only. Enable
// placement here only when the backend integration is connected and verified.
// A stale public environment flag must not turn a preview into an order.
export const PENDING_ORDER_PREVIEW_AVAILABLE = true;
export const PENDING_ORDER_PLACEMENT_AVAILABLE = false;

export const PENDING_ORDER_PREVIEW_MESSAGE =
  'Preview only. Order placement is not available yet.';
