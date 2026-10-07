# RTX5 API Contracts (Single Source of Truth)

## Purpose
This file is the canonical frontend contract reference for RTX5 integration with the existing backend. All phase docs and implementation must conform to these types and policies.

## Contract Versioning Policy
- REST contract source: versioned OpenAPI document from backend.
- WebSocket contract source: versioned event schema document.
- Frontend compatibility rule:
1. Backward-compatible additions allowed without app break.
2. Breaking field changes require version bump and coordinated release.
- Generated client updates must happen in a dedicated PR with changelog notes.

## Canonical Public Interfaces
```ts
export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO datetime
  deviceId: string;
  scopes: string[];
};

export type TradingAccountType = "demo" | "contest" | "real";

export type AuthTokenResponse = {
  access_token?: string;
  token?: string; // accepted legacy alias
  refresh_token?: string;
  refreshToken?: string;
  expires_in?: number;
  expires_at?: number;
  account_login?: number | string;
  accountLogin?: number | string;
  account_name?: string;
  accountName?: string;
  username?: string;
  broker_id?: string;
  brokerId?: string;
  server?: string;
  broker_server?: string;
  brokerServer?: string;
  account_type?: TradingAccountType | "demo account" | "contest account" | "real account" | string;
  accountType?: TradingAccountType | "demo account" | "contest account" | "real account" | string;
  is_demo?: boolean;
  isDemo?: boolean;
  is_contest?: boolean;
  isContest?: boolean;
  group?: string;
  user?: {
    account_login?: number | string;
    id?: number | string;
    account_type?: string;
    accountType?: string;
    group?: string;
  };
  account?: {
    account_type?: string;
    accountType?: string;
    group?: string;
  };
};

export type AccountSnapshot = {
  accountId: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  currency: string;
  serverTime: string; // ISO datetime
};

export type QuoteTick = {
  symbol: string;
  bid: number;
  ask: number;
  spread?: number;
  volume?: number;
  digits?: number;
  dailyChangePct?: number;
  timestamp: string; // ISO datetime
};

export type Candle = {
  symbol: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ts: string; // ISO datetime
};

export type Position = {
  positionId: string;
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  openPrice: number;
  markPrice: number;
  pnl: number;
  swap: number;
  openedAt: string; // ISO datetime
};

export type OrderTicketInput = {
  symbol: string;
  orderType:
    | "market_buy"
    | "market_sell"
    | "buy_limit"
    | "sell_limit"
    | "buy_stop"
    | "sell_stop"
    | "buy_stop_limit"
    | "sell_stop_limit";
  volume: number;
  price?: number;
  stopLimitPrice?: number;
  sl?: number;
  tp?: number;
  expirationType: "gtc" | "today" | "specified" | "specified_day";
  expirationAt?: string; // ISO datetime
  fillPolicy: "fok" | "ioc" | "return";
};

export type OrderSubmissionResult = {
  order_ticket: number;
  position_ticket: number;
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  price: number;
  commission: number;
  status: string;
  action: string;
  time: number; // Unix timestamp
};

export type HistoryFilter = {
  from: string; // ISO date
  to: string; // ISO date
  symbol?: string;
  kind: "positions" | "orders" | "deals";
  sortBy:
    | "default"
    | "symbol"
    | "ticket"
    | "type"
    | "volume"
    | "openTime"
    | "closeTime"
    | "profit";
  sortDir: "asc" | "desc";
};

export type FeatureFlags = {
  oneClickTradingEnabled: boolean;
  bulkCloseEnabled: boolean;
  tradeFromChartEnabled: boolean;
  maintenanceMode: boolean;
  killSwitchTradeSubmit: boolean;
};

export type OrrnnDemoStatus = {
  service: "orrnn-demo";
  status: "ok" | string;
  broker: "active" | string;
  demo_groups_available: number;
  total_demo_accounts: number;
  database: "connected" | string;
};

export type OrrnnDemoAccountRequest = {
  group: string; // selected from GET /api/v1/public/demo-groups
  email: string;
  master_pass: string;
  investor_pass: string;
  first_name: string;
  last_name?: string; // optional; blank values are omitted before POST
  phone?: string;
  country?: string;
  currency?: string;
  leverage?: number;
  initial_balance?: number; // visible in the demo form; defaults from typed config
  origin_broker?: string; // white-label analytics source
  comment?: string;
};

export type OrrnnDemoAccount = {
  login: number;
  broker_id?: "orrnn" | string;
  group?: string; // current live response may return `Group`
  currency?: string; // current live response may return `Currency`
  leverage?: number; // current live response may return `Leverage`
  balance: number;
  api_key?: string; // documented by API; current live response may omit it
  created_at?: number; // current live response may return `Registration`
};
```

## REST DTO Mapping
| Endpoint | Method | Response DTO | Domain Type |
|---|---|---|---|
| `/v1/session` | POST | SessionDTO | `AuthSession` |
| `/api/v2/auth/login` | POST | AuthTokenResponseDTO | `AuthTokenResponse`; frontend uses one login screen and maps backend account metadata to `demo`, `contest`, or `real` |
| `/v1/account/snapshot` | GET | AccountSnapshotDTO | `AccountSnapshot` |
| `/v1/quotes` | GET | QuoteListDTO | `QuoteTick[]` |
| `/v1/candles` | GET | CandleListDTO | `Candle[]` |
| `/v1/positions` | GET | PositionListDTO | `Position[]` |
| `/v1/orders` | POST | OrderSubmissionDTO | `OrderSubmissionResult` |
| `/v1/history` | GET | HistoryDTO | `HistoryFilter` driven view models |
| `/v1/flags/mobile` | GET | FeatureFlagsDTO | `FeatureFlags` |
| `/api/v1/public/demo-status` | GET | OrrnnDemoStatusDTO | `OrrnnDemoStatus` used to gate demo-account creation UI |
| `/api/v1/public/demo-groups` | GET | OrrnnDemoGroupsDTO | Demo group source for `OrrnnDemoAccountRequest.group` |
| `/api/v1/public/demo-account` | POST | OrrnnDemoAccountDTO | Creates Orrnn demo account; app uses returned `api_key` when present or falls back to V2 login with the created login/master password |

### Auth Login Routing
- Domain-backed broker directory entries use direct broker auth at `{server_url}/api/v2/auth/login`.
- Broker directory entries may publish domain aliases through `server_url`, `market_api_url`, `server_domain`, `services_domain`, `domain_name`, `domains.server`, `domains.services`, or websocket/feed URLs. The frontend resolves those domain fields before considering the legacy `server` value.
- Raw `server_ip` values must not be used as direct HTTPS origins or gateway login server addresses. If a gateway proxy payload is needed, `server` must be the broker domain host or `host:port`, not the IP address.
- `EXPO_PUBLIC_AUTH_PROXY_API_BASE_URL` may override the shared gateway origin for proxy auth. When unset, the frontend uses `https://backend.orrnn.com/api/v2`.

## Temporary Chart History Integration Note
- Chart history is currently hydrated from `GET /api/v2/candles/{symbol}?timeframe={tf}&limit=2500`, matching the frontend chart's rolling 2500-candle buffer so M1 history includes previous-date candles when the backend provides them.
- Chart history pagination uses Unix timestamp seconds for `from` and `to`, matching the candle `time` values returned by the backend. The frontend must not send millisecond bounds, because that asks the backend for a far-future window and returns no older history during left-scroll.
- If no authenticated session exists, or the authenticated candle request fails, the chart falls back to the public backend candle contract (`GET /api/v1/candles/{symbol}` or `GET /api/v1/candles?symbol={symbol}`) so market candles remain available before login without fabricating data.
- Candle history requests use the selected backend timeframe token only. Timeframe aggregation, session calendars, and historical gap policy belong to the backend, not to frontend fallback aliases.
- Returned candle arrays are normalized client-side only for rendering safety: invalid OHLC rows are rejected, valid rows are sorted ascending, duplicate backend timestamps are merged into one candle, and OHLC bounds must already satisfy `high >= max(open, close)` and `low <= min(open, close)`. Backend candle timestamps are preserved; the frontend does not rebucket REST history by timeframe.
- Backend candle completion metadata (`closed`, `isClosed`, `complete`, `final`, and equivalent boolean/0/1/open/current values) is preserved through normalization so REST history can distinguish closed candles from the in-progress current candle before live websocket OHLC is merged.
- Shared and persisted candle caches apply the same backend-authoritative rule: cache hydration may reject structurally invalid or too-thin seeds, but it must not reject otherwise valid backend candles because an intraday timestamp gap is present.
- Live websocket candle updates continue after the REST bootstrap and are merged onto the normalized cache by timeframe bucket; repeated backend snapshots inside the same bucket keep the first open, preserve high/low wick extremes, move close to the latest accepted live candle, and update the active candle instead of appending per tick.
- Chart renderers receive backend candle timestamps directly. The frontend no longer creates synthetic chart-time indices or filler bars; any visible history/live gap must come from backend candle timestamps, not frontend spacing logic.
- Unknown backend timeframe tokens are not allowed to route into `M1`; live/history ingestion and cache keys require a supported timeframe or a valid request/subscription fallback.
- The frontend keeps the normalized REST snapshot and validates the initial history-to-live handoff against the first websocket candle, not the device clock alone, to tolerate backend feeds whose candle timeline lags local UTC but remains internally consistent.

## WebSocket Event Contracts
| Event | Payload | Handling |
|---|---|---|
| `quote.tick` | `QuoteTick` | Merge into quote cache by symbol and timestamp |
| `position.update` | `Position` | Upsert active position cache and recompute summary stats |
| `order.status` | `OrderSubmissionResult` | Update order state and trigger trade/history invalidations |
| `account.snapshot` | `AccountSnapshot` | Replace account header values in trade screen |
| `system.flag` | partial `FeatureFlags` | Apply kill switch and disable affected UI actions |

## WebSocket Transport Notes
- The V2 authenticated account stream is opened via `/ws/v2?token={JWT}` and subscribed by channel, not by REST-style event name.
- Live backend account metrics currently arrive on `metrics.{LOGIN}`. Older docs and some fallback payloads still refer to `account.{LOGIN}` or `account.snapshot`, so the frontend must accept both while treating the payload as the same authoritative account-metrics contract.
- `positions.{LOGIN}` may send either full open-position snapshots or partial per-ticket updates. The frontend must merge partial updates into existing local positions instead of zeroing omitted fields.
- The live candle `/ws/v2` channel contract uses backend interval tokens, not canonical app timeframe labels: subscribe to `candles.{SYMBOL}.1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`, `1w`, or `1M`. Probing showed `candles.EURUSD.M1` is acknowledged but only returns `candle_history`, while `candles.EURUSD.1m` streams live `{ data: { type: "candle", symbol, tf, open, high, low, close, time, volume, closed } }` updates. Frontend code must map app timeframes (`M1`, `H1`, `MN`) to these WS tokens when subscribing and normalize incoming `tf` values back to canonical app timeframes.
- The public market feed used by the chart is `ws://69.197.178.27/ws/feed` and the verified subscribe contract is `{ "type": "subscribe", "symbols": ["EURUSD", "XAUUSD"] }`. The same feed emits quote payloads with `bid`/`ask`/`time` plus session metrics such as `session.high_bid` and `session.low_bid`; when candle envelopes are available they are shaped like `{ "type": "update", "symbol": "XAUUSD", "candle": { ... } }`. Quote ticks are not standalone candle data: the frontend may use the current `bid` only to extend a safe active REST/backend candle bucket, while session high/low metrics must never become candle OHLC wick values. Backend REST history plus backend live OHLC remains authoritative, and the frontend must not fabricate missing backend gap candles.
- The live market feed may acknowledge broker-suffixed subscriptions such as `GBPUSDm` or `GBPUSD.c`, but verified runtime payloads still arrive under the canonical base symbol (for example `GBPUSD`). Frontend consumers must normalize both requested symbols and incoming payload symbols before matching, otherwise history can load while live candle updates are silently dropped.
- Quote-row spread is a display value derived from the accepted `ask - bid` price difference using the broker/backend display precision (`digits` or equivalent metadata). Any raw `spread` field is advisory only. Quote-row `volume` is optional backend tick/session volume, must be non-negative, and is not synthesized by the frontend when the feed omits it.

## Error Shapes
```ts
export type ApiError = {
  code: string;
  message: string;
  retryable: boolean;
  traceId?: string;
  details?: Record<string, unknown>;
};
```

## Retry Rules
- Retryable HTTP status: 408, 429, 500, 502, 503, 504.
- Query retry policy: max 3 attempts with exponential backoff.
- Order submission retries are disabled by default; user must explicitly retry.
- WebSocket reconnect uses capped exponential backoff with jitter.

## Validation Rules for Ticket Input
- `price` required for all pending order types.
- `stopLimitPrice` required for stop-limit orders.
- `expirationAt` required only when expiration type is `specified`.
- `volume` must match symbol lot step constraints from symbol metadata.
- `POST /api/v2/orders` is market execution only and requires `login`, `symbol`, `side`, and `volume`.
- `POST /api/v2/orders/pending` is the pending limit/stop path and requires `login`, `symbol`, `side`, `volume`, `type`, and `price`; current backend support is limited to `buy_limit`, `sell_limit`, `buy_stop`, and `sell_stop`.

## Change Control
- Any change to the above types requires:
1. Update in this file.
2. Update in affected phase docs.
3. Contract test update in CI.

