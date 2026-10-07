/**
 * Types for the Market Order Execution API (V2).
 *
 * Field names reflect the actual server response (verified against live data),
 * which differs from the Swagger schema in several places.
 */
import type { TradeSide } from '../../domain/tradeSide';

/**
 * A single historical order record returned by GET /api/v2/account/orders.
 *
 * `type`   — execution type: "market" | "limit" | "stop" | etc.
 * `side`   — direction: "buy" | "sell"
 * `status` — lifecycle state: "filled" | "canceled" | "rejected" | "partial" | etc.
 * `magic`  — EA identifier (0 for manual orders)
 */
export interface AccountOrder {
  ticket: number;
  account_login: number;
  symbol: string;
  type: string;
  side: TradeSide;
  volume: number;
  price: number;
  status: string;
  comment: string;
  /** Unix timestamp (seconds) of order creation */
  time_create: number;
  magic: number;
}

/**
 * A single order record returned by GET /api/v2/orders/{login}.
 *
 * Field names reflect the actual server response (verified against live data),
 * which differs from the Swagger schema in several places:
 *   price_open  (not "price")
 *   time_setup  — order creation time (not "time_create")
 *   time_done   — order completion time (fill, cancel, close)
 *
 * `status` — "filled" (open) | "closed" | "canceled" | "rejected"
 * `type`   — "market" | "limit" | "stop" | etc.
 * `side`   — "buy" | "sell"
 */
export interface LoginOrder {
  ticket: number;
  account_login: number;
  symbol: string;
  type: string;
  side: TradeSide;
  volume: number;
  /** Execution price — sent as `price_open` in the real response (not `price`) */
  price_open: number;
  status: string;
  comment: string;
  /** Unix timestamp (seconds) when the order was submitted */
  time_setup: number;
  /** Unix timestamp (seconds) when the order was filled, closed, or canceled */
  time_done: number;
  /** Optional stop-loss price (0 or absent means no SL) */
  price_sl?: number;
  /** Optional take-profit price (0 or absent means no TP) */
  price_tp?: number;
  /** Optional stop-limit execution price for buy/sell stop-limit pending orders */
  stopLimitPrice?: number | null;
  stop_limit_price?: number | null;
  price_stop_limit?: number | null;
}

/**
 * Payload for POST /api/v2/orders — place a market order.
 *
 * The `account_login` field is the MT5 account login (integer), NOT a string ID.
 * The `volume` field is in standard lots (e.g. 0.01 = micro lot).
 */
export interface PlaceOrderPayload {
  account_login: number | string;
  broker_id?: string;
  symbol: string;
  side: TradeSide;
  volume: number;
  /** Canonical market-order protection input. Null/omission means unset. */
  sl?: number | string | null;
  /** Canonical market-order protection input. Null/omission means unset. */
  tp?: number | string | null;
  /** Local compatibility aliases; the wire builder translates to `sl`/`tp`. */
  price_sl?: number;
  price_tp?: number;
  fill_mode?: 'return' | 'fok';
  comment?: string;
  trailing_stop?: number;
  trailing_step?: number;
  /** @deprecated Local legacy input only. It is never sent to the strict trader gateway. */
  magic?: number;
}

export type PendingOrderType =
  | 'buy_limit'
  | 'sell_limit'
  | 'buy_stop'
  | 'sell_stop'
  | 'buy_stop_limit'
  | 'sell_stop_limit';

/**
 * Payload for POST /api/v2/orders/pending.
 *
 * The pending endpoint uses `price` for the trigger price. `price_open` is
 * accepted as a local legacy alias so older screen code can be migrated safely.
 */
export interface PlacePendingOrderPayload extends PlaceOrderPayload {
  type: PendingOrderType | string;
  price?: number | string;
  price_open?: number | string;
  stopLimitPrice?: number;
  stop_limit_price?: number;
  /** Canonical pending-order protection inputs. */
  sl?: number | string | null;
  tp?: number | string | null;
  expiry?: number | null;
  fill_mode?: 'return' | 'fok';
  /** @deprecated Local compatibility input; the wire uses `expiry`. */
  expiration?: number;
}

/**
 * Response from POST /api/v2/orders on successful execution.
 *
 * Matches the gateway handler's canonical ExecutionResult. The OpenAPI
 * Position schema is stale for this endpoint: market execution identity is
 * `order_ticket` plus `position_ticket`, and the fill is `price`.
 */
export interface PlaceOrderResponse {
  order_ticket: number;
  position_ticket: number;
  price: number;
  status: string;
  time: number;
  action: string;
  ticket?: number;
  account_login?: number;
  symbol: string;
  side: TradeSide;
  volume: number;
  price_open?: number;
  price_current?: number;
  price_sl?: number | null;
  price_tp?: number | null;
  profit?: number;
  open_time?: number;
  comment?: string;
  magic?: number;
  commission?: number;
  requested_volume?: number;
  closed_volume?: number;
  opened_volume?: number;
  rejected_volume?: number;
  message?: string;
}

export interface PlacePendingOrderResponse {
  ticket?: number;
  order_ticket?: number;
  position_ticket?: number;
  account_login?: number;
  symbol: string;
  type?: PendingOrderType | string;
  side: TradeSide;
  volume: number;
  price?: number;
  price_open?: number;
  stopLimitPrice?: number | null;
  stop_limit_price?: number | null;
  price_stop_limit?: number | null;
  price_sl?: number | null;
  price_tp?: number | null;
  status?: string;
  comment?: string;
  time_create?: number;
  magic?: number;
  message?: string;
}

/** Standard error response from the orders endpoint. */
export interface OrderErrorResponse {
  error: string;
  message: string;
}
