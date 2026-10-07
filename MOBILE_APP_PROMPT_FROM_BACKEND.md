# Prompt for the RTX5 Mobile App — Backend Contract v3: Trivanta + Orrnn (2026-09-24)

> Received from the backend team on 2026-09-24. It answers [BACKEND_TEAM_PROMPT.md](BACKEND_TEAM_PROMPT.md).
> This copy was saved from a chat paste that was **cut off partway through Section 10**. Section 10 is the backend/ops item list. All mobile-side REQUIRED items are in the Section 8 checklist, which arrived complete.

**Who this is for:** the agent working on the RTX5 mobile app (`rtx5-app/`, Expo / React Native). This replaces the earlier "RTX5 Mobile App Integration Contract". It describes how the **current** broker backend behaves.

**Scope: two brokers only.** Do not add special cases for any other broker.

| Broker | `broker_id` (exact, case-sensitive) | Server | Display name (`/api/v2/broker/config`) |
|---|---|---|---|
| Trivanta Markets | `trivanta-markets` | `https://trivanta.orrnn.com` | `Trivanta Markets` |
| Orrnn | `Orrnn` (capital O) | `https://service.orrnn.com` | `Orrnn Global Demo Broker` |

**Source of truth:** backend `Broker-Backend-V2` commit `4d08484` (2026-09-23), plus read-only requests to both live servers on 2026-09-24. **(live)** means the behaviour was seen on both running servers; everything else was read from the code.

**Ground rules**

1. When this document says a field is **missing**, use the fallback given here. Do not fail closed.
2. **CHANGED** means different from what the app does today.
3. **BACKEND PENDING** means a backend or ops bug. The app must work around it now and not wait for a fix.
4. **There is no feed token anywhere.** Delete all feed-token code and env values.
5. Keep secrets out of code and logs.

---

## 1. Summary

- The quote feed (`wss://<host>/ws/feed`) needs **no token (live)**. Login does not return `feed_token` or `feed_auth_context`.
- The `Idempotency-Key` header is ignored. Send **`client_order_id` in the body** instead.
- Trade-socket messages are nested: `{channel, data:{type, data}}`. An SL/TP hit arrives as a `position_closed` event with `close_reason`.
- Several keys changed:
  - `used_margin` (not `margin_used`).
  - The tick `sequence` is a string.
  - Instruments have no `point`, `stops_level` or `swap_*`.
  - `/instruments/{symbol}` does not exist.
- The broker directory is now **`https://superadmin-prod.orrnn.com/api/v2` (CHANGED)**. It lists exactly `Orrnn` and `trivanta-markets`.
  - `fxtrustsuperbackned.orrnn.com` lists only Nexa, TEST and test rows.
  - `superbackend.orrnn.com` returns an HTML page.
- 🔴 **BLOCKER (ops):** the directory rows point at raw IPs with `ws://` and `http://` feed URLs. The app correctly rejects them. Ops must change the rows to the hostnames in Section 3.
- Orrnn `/ws/feed/status` reports `upstream_connected:false` and `status:"upstream_disconnected"` while ticks are flowing. Do not use these fields to decide whether the feed is down.
- Trivanta candle history stops about 9 hours in the past. Append live candles from the feed.

## 2. Environment

| Env var | Value | Note |
|---|---|---|
| `EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL` | `https://superadmin-prod.orrnn.com/api/v2` | CHANGED |
| `EXPO_PUBLIC_API_BASE_URL` | `https://superadmin-prod.orrnn.com/api/v2` | CHANGED. Platform register only; the register path is unverified. Both brokers report `registration_enabled:false`, so hide sign-up. |
| `EXPO_PUBLIC_CANDLE_HISTORY_PATH` / `_QUERY_STYLE` | `candles` / `timeframeLimit` | Correct as is |
| All `*_FEED_TOKEN` vars and `EXPO_PUBLIC_FEED_BROKER_ID` | **DELETE** | No feed tokens exist |
| `EXPO_PUBLIC_DEMO_*` / `EXPO_PUBLIC_ORRNN_DEMO_*` | unchanged | The demo manager is down (Cloudflare 530) and outside this release |

- Broker hosts come from the directory, not from env.
- Delete the old feed-token variables from both `.env` and `app.config.js`, together with the code that reads them.

## 3. Broker directory

`GET {EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL}/broker/servers` (no auth) returns a **bare JSON array** (Shape A).

**Live rows today (rejected by the app):**
- `server_url` is `https://51.195.188.172:443` (Orrnn) and `https://100.116.90.110:443` (Trivanta).
- `market_api_url` is `http://<ip>`.
- `feed_url`, `feed_ws_url` and `ws_url` are `ws://<ip>/ws/feed`, and `feed_status_url` is `http://<ip>/ws/feed/status`.
- There is no `feed_wss_url` and no `feed_status_https_url`.
- `logo_url` is `http://superadmin-prod.orrnn.com/api/v1/brokers/<id>/logo`.
- `services_domain` is `""`, and there is a `domains{...}` object.

**Why the rows are rejected. Keep these rules; do not loosen them:**
- The `server_url` is a raw IP (and the TLS certificate is issued for the hostname).
- The URLs use `ws://` and `http://`, and there is no `feed_wss_url`.
- `100.116.90.110` is a private Tailscale address.
- An `http://` `logo_url` must not be loaded. Show the default logo instead.

**BACKEND PENDING (ops, blocker). The rows should become:**

```json
[
  {"id":3,"broker_id":"trivanta-markets","broker_name":"Trivanta Markets","created_at":1789633122,"protocol":"https",
   "server":"trivanta.orrnn.com:443","server_ip":"<unchanged>","server_port":443,
   "server_url":"https://trivanta.orrnn.com","market_api_url":"https://trivanta.orrnn.com",
   "services_domain":"trivanta.orrnn.com","feed_wss_url":"wss://trivanta.orrnn.com/ws/feed",
   "feed_status_https_url":"https://trivanta.orrnn.com/ws/feed/status"},
  {"id":4,"broker_id":"Orrnn","broker_name":"ORRNN","created_at":1789643254,"protocol":"https",
   "server":"service.orrnn.com:443","server_ip":"<unchanged>","server_port":443,
   "server_url":"https://service.orrnn.com","market_api_url":"https://service.orrnn.com",
   "services_domain":"service.orrnn.com","feed_wss_url":"wss://service.orrnn.com/ws/feed",
   "feed_status_https_url":"https://service.orrnn.com/ws/feed/status"}
]
```

**App rules (CHANGED):**

**REQUIRED**
- Rows have no `enabled`, `active`, `status` or `license_active` key. Accept a row with no `enabled` key.
- If the directory response is not JSON, show "broker list unavailable". Do not cache an empty list.

**OPTIONAL**
- Reject hostnames ending in `.test`, `.example`, `.invalid` or `.localhost`.

**Other rules**
- Ignore the extra keys `market_api_url`, `feed_ws_url`, `feed_url`, `ws_url`, `wss_url`, `feed_status_url`, `domain_name`, `*_domain` and `domains`. When several of them are present they hold the same value, so there is no conflict.
- `trade_wss_url` is not sent. Derive it as `wss://{server_url host}/ws/v2`.
- Do not use `GET {server_url}/api/v2/broker/servers` as a directory.

**Health check (live):** `GET {server_url}/health` returns `200 {"status":"ok","time":1790241407}`.

**Broker config (public, live).** `GET {server_url}/api/v2/broker/config` returns:

```json
{"broker_name":"Trivanta Markets","server_name":"RTX5-Live","status":"active","default_leverage":100,"max_leverage":500,
 "registration_enabled":false,"demo_registration_enabled":false,"supported_currencies":["USD","EUR","GBP"],
 "logo_url":"/assets/logo.png","theme_color":"#1a73e8","support_email":"...","terms_url":"/terms","privacy_url":"/privacy"}
```

- Orrnn's `broker_name` is `"Orrnn Global Demo Broker"`.
- `logo_url` is relative to `server_url`.

## 4. Authentication

### 4.1 Login — `POST {server_url}/api/v2/auth/login`

**Request:** `{"username":"<account number or username>","password":"...","broker_id":"trivanta-markets" | "Orrnn"}`

- A numeric `login` is also accepted in place of `username`.
- **`broker_id` is case-sensitive (live).**
  - `"TRIVANTA-MARKETS"` returns `401 {"error":"INVALID_BROKER","message":"Broker 'TRIVANTA-MARKETS' not found"}`.
  - Leaving `broker_id` out returns `400 {"error":"INVALID_INPUT","message":"broker_id is required"}`.
- Investor (read-only) login: add `"login_type":"investor"`.
- Do not send a `user` key.

**Success (200). These are the complete keys (CHANGED):**

```json
{"access_token":"<jwt>","refresh_token":"rtx5_rt_<redacted>","token_type":"Bearer","expires_in":86400,"expires_at":1790327807,
 "user_id":42,"username":"<username>","role":"<role>","login_type":"master","account_login":200074,"broker_id":"trivanta-markets"}
```

| Key | App rule |
|---|---|
| `broker_id` | Must equal the selected broker (compared ignoring case) |
| `expires_at` | Epoch **seconds** |
| `account_login` | A JSON **number**. It can be `null`; then show "No trading account linked to this user" and stop. |
| `feed_token`, `feed_auth_context` | **Never sent.** Connect to the feed with no token and never block login because they are missing. REQUIRED |
| `account_name` | Not sent. Use `name` from `GET /account/{login}`. |
| `server` | Not sent. Use `server_name` from `/broker/config` (`"RTX5-Live"`), otherwise the directory `broker_name`. |
| `account_type` | Not sent. If `group` from `GET /account/{login}` contains `demo` (case-insensitive), the account is `demo`; otherwise `real`. |

**Errors (every gateway endpoint):** `{"error":"<CODE>","message":"<text>"}`. There is no `code` or `detail` key.

| Status | Error |
|---|---|
| 400 | `INVALID_INPUT` |
| 401 | `UNAUTHORIZED` ("Invalid credentials") |
| 401 | `INVALID_BROKER` |
| 401 | `BROKER_MISMATCH` |
| 401 | `BROKER_INACTIVE` |
| 401 | `LICENSE_EXPIRED` |
| 403 | `ACCOUNT_DISABLED` |
| 429 | `RATE_LIMITED` (`Retry-After: 60`) |

### 4.2 Refresh — `POST {server_url}/api/v2/auth/refresh`

**Request:** `{"refresh_token":"rtx5_rt_..."}`. No Bearer header.

**Tokens:**
- The refresh token **rotates on every call**, and the old one dies immediately.
- The access token lasts 24 h. The refresh token lasts 30 days.

**Response:** the same keys as login, plus `investor` (bool). Keep the `broker_id` and `account_login` identity checks.

**Errors:**
- `401 {"error":"INVALID_TOKEN","message":"Refresh token is invalid or expired"}` (live).
- Also `400 INVALID_INPUT`, `401 UNAUTHORIZED`, `401 BROKER_INACTIVE`, `401 LICENSE_EXPIRED`, `403 ACCOUNT_DISABLED`.
- Keep the rule that 400, 401 and 403 log the user out.

**Client rules:**
- **Single-flight is REQUIRED.** If two refreshes run in parallel, the second uses an already-rotated token, gets `401 INVALID_TOKEN`, and logs the user out.
- Raise the refresh timeout from 2.5 s to 8 s (recommended).

### 4.3 Other auth

- `GET /api/v2/auth/me` returns `{user_id, username, role, login_type, account_login?, broker_id?, investor?}`.
- `POST /api/v2/auth/change-password` takes `{current_password, new_password}`. A wrong current password returns `401 UNAUTHORIZED`.
- There is no logout endpoint; clearing the session on the device is correct. `DELETE /api/v2/auth/sessions` ends all sessions.
- **Investor sessions:** every non-GET call returns `403 INVESTOR_READ_ONLY`. Hide the trading buttons.
- **No token sent:** the response is `401 {"error":"UNAUTHORIZED","message":"Authentication required: provide Bearer token or X-API-Key"}` (live).
- **Do not send `X-Broker-ID`.** The server compares it case-sensitively, so it can cause `403 BROKER_MISMATCH`.

## 5. Market data

### 5.1 Quotes WebSocket — `wss://<host>/ws/feed` (live, CHANGED)

**Connecting**
- Connect to `feed_wss_url` with **no token**.
- `?broker_id=<id>` is optional; the server treats it only as a label.
- No `Origin` header is needed.
- Do not add `?batch=1`.
- There is no auth, no 401 and no special close codes. Remove the 4401/4403 auth-failure logic for this socket.
- An HTTP `503` means the server is restarting. Reconnect with backoff.

**Messages to send:**
- `{"type":"subscribe","symbols":["EURUSD","BTCUSD"]}`
- `{"type":"unsubscribe","symbols":["EURUSD"]}`

**Do not send:**
- `{"type":"ping"}` (CHANGED). The server replies `{"type":"error","code":"unsupported_request","message":"unsupported request type; supported: subscribe, unsubscribe, subscribe_candles, unsubscribe_candles","request":"ping"}` and keeps the socket open.
  - The server sends protocol-level pings every 30 s, and React Native answers them automatically.
- `{"action":"subscribe","channels":[...]}`. This form is not supported on `/ws/feed`.

**Frames, in order (live, Orrnn):**

1. **Ack:**

   ```json
   {"type":"subscribed","symbols":["EURUSD","BTCUSD","NOSUCHSYM"],"broker_id":"Orrnn","requested_symbols":["EURUSD","BTCUSD","NOSUCHSYM"],"wildcard":false,"resolved_symbol_count":3,"server_time":1790241466944,"snapshot_follows":true}
   ```

2. **Snapshot (NEW, REQUIRED to parse).** Without it, no price appears until the next tick.

   ```json
   {"type":"snapshot","broker_id":"Orrnn","requested_symbols":["EURUSD","BTCUSD","NOSUCHSYM"],"symbol_count":3,"quoted_symbol_count":2,
    "server_time_ms":1790241466944,"authority":"rtx5_hub",
    "symbols":[{"symbol":"EURUSD","broker_id":"Orrnn","bid":1.13736,"ask":1.13751,"spread":0.00015,"daily_open":1.13838,
                "quote_time_ms":1790241466611,"quote_time_unix":1790241466,"age_ms":333,"age_sec":0,"has_quote":true,"fresh":true,
                "stale":false,"tradable":true,"market_state":"live","state_reason":"quoting normally","source":"cserver",
                "expected_source":"cserver","source_mismatch":false,"sequence":"293894","authority":"rtx5_hub"}]}
   ```

   - An unknown symbol is listed with `has_quote:false` and no bid or ask. The socket stays open.
   - Show entries with `stale:true` greyed out.
   - `market_state` is one of `live`, `delayed`, `inactive`, `no_quote`, `source_mismatch`.

3. **Ticks** are bare objects with **no `type` key**:

   ```json
   {"symbol":"BTCUSD","broker_id":"Orrnn","bid":83385.56,"ask":83445.56,"spread":60,"daily_change_pct":-0.98,
    "daily_open":84305.69,"previous_close":84212.04,
    "session":{"high_bid":83720.82,"low_bid":83200.08,"high_ask":83764.75,"low_ask":83265.36},
    "time":1790241467,"timestamp":1790241467000,"time_ms":1790241467000,"timestamp_ms":1790241467000,
    "provider_timestamp":1790241467000,"hub_ingest_timestamp":1790241467000,"hub_publish_timestamp":1790241467000,
    "age_ms":0,"source_seq":"293935","sequence":"293935","authority":"rtx5_hub","expected_source":"cserver",
    "source_mismatch":false,"age_sec":0,"stale":false,"tradable":true,"source":"cserver"}
   ```

**Tick rules:**
- **`sequence` is a string (CHANGED).** Parse it to a number before the "went backwards" check. REQUIRED.
- Use `timestamp_ms` (milliseconds). `time` is in seconds.
- The daily high and low come from `session.high_bid` / `session.low_bid`. There is no top-level `high` or `low`.
- Treat `previous_close: 0` as unknown. It is currently 0 on Trivanta.
- `digits` is never sent. Take it from `/instruments`.
- `broker_id` is `trivanta-markets` or `Orrnn`. Compare it to the session ignoring case. REQUIRED.
- `ask < bid` can happen. Keep dropping those ticks.
- Expect about 7–8 frames per second for 2 active symbols.

**Watchdog (CHANGED, REQUIRED).** The server sends no heartbeat data frames. On quiet symbols, when the market is closed or at weekends, data stops about 2 s after the last tick.
- Detect a dead socket through `onclose` / `onerror`.
- After 8 s of silence, **mark prices stale but keep the socket open**.
- Reconnect because of silence only after **60 s** with no frame **and** `/market/status` showing the market open.

**Live candles on the same socket (recommended):**
- Subscribe: `{"type":"subscribe_candles","symbol":"EURUSD","tf":"1m"}`
- Ack: `{"type":"subscribed_candles","symbols":["EURUSD"],"tf":"1m"}`
- Frame: `{"type":"candle","symbol":"EURUSD","tf":"1m","open":..,"high":..,"low":..,"close":..,"time":<bucket start, unix s>,"volume":12,"closed":false}`
- Accepted `tf` values: `1m`/`M1`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`.
- Unsubscribe: `{"type":"unsubscribe_candles","symbol":"EURUSD","tf":"1m"}`

### 5.2 Feed status — `GET {feed_status_https_url}` (CHANGED)

- The response is about 20 KB. No query parameters are read.
- Keys: `broker_id, status, upstream_connected, upstream_mode, symbols_total, symbols_fresh, symbols_stale, symbols_tradable, last_upstream_tick_ms, providers[{id, connected}], symbol_status[], available_symbols[], server_time, ...`
- **`auth_accepted`, `market_available`, `degraded` and `health_policy` do not exist.**

**Live readings:**

| Server | `status` | `upstream_connected` | `upstream_mode` | Fresh symbols | `rtx_market_data` provider | Ticks flowing |
|---|---|---|---|---|---|---|
| Trivanta | `healthy` | `true` | `fix` | 59/61 | true | yes |
| Orrnn | `upstream_disconnected` | `false` | `none` | 57/62 | true | **yes** |

**New health rule (REQUIRED):**
- **Healthy:** `symbols_fresh > 0` **and** at least one `providers[].connected == true`.
- **Degraded:** `symbols_fresh == 0` while a provider is connected.
- **Down:** no provider connected **and** `symbols_fresh == 0`.
- Live ticks on the socket always win over this endpoint. Never stop the socket because of it.
- Call it only on demand (diagnostics, or after 60 s of silence), with a 10 s timeout.

BACKEND PENDING: fix Orrnn's `status` and `upstream_connected`.

### 5.3 REST market endpoints (`{server_url}/api/v2`, with or without Bearer)

**`GET /instruments` (live)** returns a **bare array**. `?favorites=true` is ignored.

```json
[{"symbol":"EURUSD","digits":5,"contract_size":100000,"tick_size":0.00001,"tick_value":1,"min_volume":0.01,"max_volume":500,
  "volume_step":0.01,"spread":15,"enabled":true,"calc_mode":"forex","margin_currency":"EUR","profit_currency":"USD",
  "currency_profit":"USD","created_at":1789659971}]
```

- **Symbols:**
  - Trivanta: `BTCUSD, EURJPY, EURUSD, GBPJPY, GBPUSD, USDJPY, XAGUSD, XAUUSD`.
  - Orrnn: the same, plus `US30` and `USOIL`.
  - No suffixes.
- **Missing fields (CHANGED). Derive them:**
  - `point` = `tick_size`, or `10^-digits` when `tick_size` is 0.
  - `stops_level` = 0.
  - `base_currency` = `margin_currency`.
  - Hide swaps.
- **`GET /instruments/{symbol}` returns 404 (CHANGED, REQUIRED).** Look the symbol up in the cached list instead.

**`GET /quotes?symbols=EURUSD,BTCUSD` (live)** returns a bare array of tick objects, with the same keys as feed ticks. Unknown and stale symbols are left out.

**`GET /candles/{symbol}?timeframe=M1&limit=2500[&from=<unix s>&to=<unix s>]` (live)** returns:

```json
{"symbol":"EURUSD","timeframe":"M1","candles":[{"time":1790241360,"open":1.1376,"high":1.137625,"low":1.137205,"close":1.137205,"volume":129,"tickCount":129,"isClosed":true}]}
```

- Candles come oldest-first today, but **always sort ascending by `time`**.
- `tickCount` and `isClosed` can be ignored.
- Timeframes `M1 M5 M15 M30 H1 H4 D1 W1 MN` all work. `1m` returns `400 {"error":"INVALID_TIMEFRAME"}`, so use the `M1` style on REST.
- The maximum `limit` is 5000.
- **BACKEND PENDING:**
  - Trivanta M1 history ends about 560 minutes ago.
  - Orrnn has only 34 M1 candles.
- **App rule (REQUIRED):** build the chart from REST history, then append and update from `/ws/feed` `subscribe_candles`. Show gaps as gaps; do not fill them with made-up candles.

**`GET /market/status` (live)** returns a bare array. `GET /market/status/{symbol}` returns a single object:

```json
{"symbol":"EURUSD","quote_open":true,"trade_open":true,"message":"open","server_time":1790241419}
{"symbol":"EURJPY","quote_open":false,"trade_open":false,"message":"schedule unavailable","server_time":1790241419}
```

- There is no `status`, `session_open` or `session_close` (CHANGED).
- Map the state as `trade_open ? "open" : "closed"`, and show `message` when the market is closed.

**Watchlist (per user):**

| Call | Request body | Response |
|---|---|---|
| `GET /watchlist` | — | `[{"symbol","sort_order","added_at"}]` |
| `POST /watchlist/{symbol}` | — | `200 {"symbol","status":"added"}`, **even if the symbol is already there** (CHANGED: no longer 400) |
| `DELETE /watchlist/{symbol}` | — | `{"symbol","status":"removed"}` |
| `PUT /watchlist` | bare array `[{"symbol","sort_order"}]` | `{"status":"replaced","count":n}` |

## 6. Trading (Bearer, `{server_url}/api/v2`)

### 6.0 Idempotency (CHANGED, REQUIRED)

- The `Idempotency-Key` header is **ignored**. Retries that rely on the header alone can create duplicate orders.
- Send **`client_order_id` in the body** for `POST /orders` and `POST /positions/{t}/close`.
  - Format: `^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$`.
  - `order-<uuidv4>` and `close-<ticket>-<uuidv4>` both fit.
  - Reuse the same id when retrying the same user action.
- The same id with a different body returns **`409 IDEMPOTENCY_CONFLICT`**. `IDEMPOTENCY_KEY_REUSED` does not exist.
- Keeping the header does no harm.
- Pending orders have no idempotency at all. **On a network error, do not auto-retry;** re-read the pending list instead.

### 6.1 Market order — `POST /orders`

**Request:**

```json
{"client_order_id":"order-6f1c2c1e-6c2a-4c4f-9f3e-2b8f1d9a0c11","account_login":200074,"symbol":"EURUSD",
 "side":"buy","type":"market","volume":"0.01","sl":"1.1300","tp":"1.1450","comment":"RTX5 Mobile"}
```

- `volume`, `sl` and `tp` can be strings or numbers.
- `sl`/`tp` of 0, `""` or `null` means "not set".
- `fill_mode` is ignored.
- `type` must be `"market"`.
- Optional: `trailing_stop` and `trailing_step` (integer points).

**HTTP timeout: at least 30 s (CHANGED, REQUIRED).** The server can wait up to 25 s for the fill.

**200 (filled):**

```json
{"order_ticket":1001,"position_ticket":2002,"symbol":"EURUSD","side":"buy","volume":0.01,"price":1.13745,"commission":0,"status":"filled","time":1790241500,"action":"opened"}
```

**202 (accepted, not yet final; NEW, REQUIRED):**

```json
{"type":"order_accepted","status":"accepted","success":true,"client_order_id":"order-...","accepted_at":1790241500123}
```

On a 202:
1. Poll `GET /order-commands/{client_order_id}?account_login={login}` every 500 ms for up to 30 s.
2. The poll returns `{type:"order_filled"|"order_rejected", data:<fill>, error:{code,message,retryable}}`.
3. If the order is still not final after 30 s, show "Confirmation Pending" and reconcile using `GET /positions/{login}`.

**Rejections (CHANGED):**
- A 200 never means "rejected". Rejections are 4xx or 5xx with `{"error","message"}`.
- The fast path can return a generic `ORDER_REJECTED`.
- If `account_login` is not the user's account, the response is `404 NOT_FOUND "Account not found"`.

**Error codes:**

| Status | Codes |
|---|---|
| 400 | `INVALID_INPUT`, `INVALID_CLIENT_ORDER_ID`, `INSUFFICIENT_MARGIN`, `ORDER_REJECTED` |
| 403 | `BROKER_REQUIRED`, `BROKER_NOT_FOUND`, `BROKER_INACTIVE`, `LICENSE_EXPIRED`, `SYMBOL_NOT_ALLOWED`, `TRADE_DISABLED`, `INVESTOR_READ_ONLY`, `ACCOUNT_UNAVAILABLE`, `BROKER_MISMATCH` |
| 404 | `NOT_FOUND`, `ORDER_COMMAND_NOT_FOUND` |
| 409 | `IDEMPOTENCY_CONFLICT`, `MARKET_CLOSED`, `STALE_QUOTE`, `POSITION_STATE_CHANGED`, `POSITION_ALREADY_CLOSED`, `ORDER_ALREADY_PROCESSED`, `ORDER_STATE_CHANGED`, `ORDER_COMMAND_REJECTED`, `MARKET_SESSION_CHANGED`, `ACCOUNT_IDENTITY_CHANGED` |
| 429 | `RATE_LIMITED` (`Retry-After: 60`); `ORDER_RATE_LIMITED` and `TOO_MANY_ORDERS` (no header, wait 2 s) |
| 500 | `INTERNAL_ERROR`, `DATABASE_ERROR` |
| 503 | `NO_FRESH_QUOTE`, `SOURCE_MISMATCH`, `SERVICE_UNAVAILABLE`, `DATABASE_UNAVAILABLE`, `COMMAND_ROUTING_UNAVAILABLE`, `COMMAND_COMMIT_UNCERTAIN`, `ENGINE_CLOSE_UNAVAILABLE`, `TRIGGER_CAPTURE_UNAVAILABLE`, `EXACT_CALCULATION_UNAVAILABLE`, `MARKET_SCHEDULE_UNAVAILABLE` |

- For unknown codes, show the `message`.
- EURJPY currently reports `trade_open:false`, so expect `MARKET_CLOSED` for it.

### 6.2 Positions

**`GET /positions/{login}`** returns a bare array of **all** open positions. `limit` and `offset` are ignored.

```json
{"ticket":2002,"account_login":200074,"symbol":"EURUSD","side":"buy","volume":0.01,"price_open":1.13745,"price_current":1.1376,
 "price_sl":1.13,"price_tp":null,"profit":0.15,"swap":0,"comment":"RTX5 Mobile","time_create":1790241500,"time_update":1790241560,
 "state_version":"3","margin":11.37,"contract_size":100000,"bid":1.1376,"ask":1.13771}
```

There is **no `commission` field (CHANGED)**. Treat it as 0.

**Close — `POST /positions/{ticket}/close`:**
- Full close body: `{"client_order_id":"close-2002-<uuid>"}`. A `mode` field is ignored.
- Partial close body: `{"client_order_id":"...","volume":0.01}`. **`volume` must be a JSON number (CHANGED).** `"0.01"` returns 400 `INVALID_INPUT`.
- 200 response:

  ```json
  {"client_order_id":"close-2002-...","ticket":2002,"symbol":"EURUSD","side":"buy","volume_closed":0.01,"volume_total":0.01,
   "price_open":1.13745,"price_close":1.1376,"profit":0.15,"swap":0,"partial":false,"status":"closed","time":1790241600,
   "order_ticket":"1003","deal_ticket":"5005","state_version":"4","command_id":"..."}
  ```

  - `status` is `"closed"` or `"partial_closed"`.
  - `order_ticket` and `deal_ticket` are **strings**.
- A 202 is possible. Handle it as in 6.1.
- **BACKEND PENDING:** accounts on the new engine get `503 ENGINE_CLOSE_UNAVAILABLE` for every close. Show "Closing is temporarily unavailable, please contact support", and do not retry in a loop.
- `409 POSITION_ALREADY_CLOSED`: refresh the list and treat the close as done.

**Modify SL/TP — `PUT /positions/{ticket}`:**
- Request: `{"price_sl":1.13,"price_tp":null}`. `sl`/`tp` are also accepted.
  - `null` or 0 clears the value.
  - A field that is left out stays unchanged.
- 200 response. It echoes only the fields that were sent:

  ```json
  {"ticket":2002,"symbol":"EURUSD","status":"modified","time":1790241700,"state_version":"5","sl":1.13,"price_sl":1.13,"tp":null,"price_tp":null}
  ```

- Errors: `400 INVALID_INPUT` (SL/TP on the wrong side), `409 POSITION_STATE_CHANGED`, `503 NO_FRESH_QUOTE`, `503 TRIGGER_CAPTURE_UNAVAILABLE`.

### 6.3 Pending orders (supported on the server; unlock in the UI after QA)

**Place — `POST /orders/pending`:**

```json
{"account_login":200074,"symbol":"EURUSD","type":"buy_limit","volume":"0.01","price":"1.1300","sl":"1.1250","tp":"1.1400","expiry":1790328000,"comment":"RTX5 Mobile"}
```

- `account_login` is required. `side` is not needed.
- `type` is one of `buy_limit`, `sell_limit`, `buy_stop`, `sell_stop`, `buy_stop_limit`, `sell_stop_limit`. The two stop-limit types also need `price_limit`.
- For "no SL/TP", leave the field out or send `null`. **Do not send 0.**
- 200 response: `{"ticket":3003,"account_login":200074,"symbol":"EURUSD","type":"buy_limit","volume":0.01,"price":1.13,"price_limit":null,"status":"pending","time_setup":1790241800,"time_expiry":1790328000,"state_version":"1","price_sl":1.125,"price_tp":1.14}`

**List — `GET /orders/pending/{login}`:** a bare array.
- Keys: `ticket, account_login, symbol, type, volume, price, status, time_setup, state_version, price_limit, trigger_phase`.
- Optional keys: `price_sl, price_tp, time_expiry, time_done, comment`.

**Modify — `PUT /orders/pending/{ticket}`:**
- Request: `{price?, price_limit?, sl?|null, tp?|null, expiry?|null}`.
- Response (CHANGED): `{ticket, status:"modified", state_version, price_limit}` plus the fields that were sent. **Re-fetch the list afterwards (REQUIRED).**

**Cancel — `DELETE /orders/pending/{ticket}`:**
- Response: `200 {"ticket":3003,"status":"cancelled","time":1790241900,"state_version":"2"}`.
- `409 ORDER_ALREADY_PROCESSED`: refresh the list.

### 6.4 History (CHANGED)

| Endpoint | Behaviour | App rule |
|---|---|---|
| `GET /account/deals?limit=1000&offset=N[&from&to]` | Account taken from the token. Maximum 1000 rows; offset paging works; `from`/`to` in unix seconds. | **Use this for deals (REQUIRED)** |
| `GET /account/orders?limit=1000&offset=N` | Paging works | Use for order history |
| `GET /positions/{login}/history?from&to[&symbol]` | Ignores `limit` and `offset`; maximum 500 rows. BACKEND PENDING: positions closed by the new close path may be missing. | Page by `from`/`to` time window. Fall back to `entry_out` deals (REQUIRED). |
| `GET /deals/{login}` | Ignores paging; maximum 500 rows; no `position_ticket` | Prefer `/account/deals` |
| `GET /orders/{login}` | No parameters; maximum 500 rows | Prefer `/account/orders` |

Deal row (note: no `position_ticket`):

```json
{"ticket":5005,"order_ticket":1003,"account_login":200074,"symbol":"EURUSD","action":"deal_sell","entry":"entry_out","volume":0.01,"price":1.1376,"profit":0.15,"commission":0,"swap":0,"fee":0,"time":1790241600,"comment":""}
```

### 6.5 Capabilities (server side)

- Supported on the server:
  - SL/TP on market orders.
  - SL/TP on open positions, triggered by the server.
  - SL/TP on pending orders.
  - Trailing stop (points).
  - Partial close with a numeric volume.
- Not available: close-by.
- **REQUIRED:** add `trivanta-markets` and `Orrnn` (matched ignoring case) to `src/config/brokerSltpCapabilities.ts`.
  - Turn ON: market-order SL/TP and position SL/TP modify.
  - Keep OFF until QA passes: pending SL/TP and trailing stop.

## 7. Account data and the trade WebSocket

### 7.1 REST

**`GET /account/{login}`** returns:

```json
{"login":200074,"name":"John Doe","group":"<group>","leverage":100,"currency":"USD","balance":10000,"credit":0,"status":"active",
 "created_at":1789659971,"updated_at":1790241500,"equity":10000.15,"used_margin":11.37,"free_margin":9988.78,"margin_level":87952.5,
 "floating_pnl":0.15,"total_swap":0}
```

- The key is `used_margin` (CHANGED).
- `open_positions` and `pending_orders` are not sent. Use the lengths of the positions and pending lists.
- There is no `account_type`. Derive it from `group`.
- `equity`, `used_margin`, `free_margin`, `margin_level` and `floating_pnl` are present only when the server calculation succeeds. Otherwise keep the last values and show them as stale.

**Other account endpoints:**

| Endpoint | Behaviour | App rule |
|---|---|---|
| `GET /accounts` | Returns **403 FORBIDDEN** for traders (CHANGED) | Do not call it (REQUIRED) |
| `GET /exposure` | Does not exist for traders | Remove the call (REQUIRED) |
| `GET /accounts/{login}/history?page=1&limit=50[&from&to&type]` | Transactions: `[{id, account_login, type, amount, time, balance_after, comment?}]`. Totals come in the `X-Total-Count`, `X-Page` and `X-Limit` headers. | Replaces `/api/account/transactions` (REQUIRED) |
| `GET /account/{login}/equity?from=<unix s>&to=<unix s>` | Equity history: `[{equity, balance, margin, free_margin, time}]`. Default range is the last 24 h; at most 1440 rows. | Replaces `/api/account/equity-history` (REQUIRED) |
| `/api/mt5/*` | Does not exist | Remove the calls (REQUIRED) |
| `POST /alerts` | Body `{symbol, condition:"above"\|"below"\|"cross", price, message?}`. Returns `201 {id, symbol, condition, price}`. | — |
| `GET /alerts` | Returns a bare array | — |
| `DELETE /alerts/{id}` | Returns `{id, status:"deleted"}` | — |
| `POST /devices` | Body `{token, platform:"ios"\|"android", device_name}`. Returns 201. | Push notifications are not sent yet (BACKEND PENDING) |

### 7.2 Trade WebSocket — `wss://<host>/ws/v2?token=<access_token>`

**Authentication and connection:**
- A bad token gets HTTP 401 before the socket opens; the app sees close code 1006 before open. There are no custom close codes.
- **The token is not re-checked after connecting (CHANGED, REQUIRED).** Close and reopen this socket with the new token after every refresh.
- The server pings every 30 s. The idle timeout is 75 s.

**Messages to send.** Send one `channel` per message:
- `{"action":"subscribe","channel":"positions.200074"}`
- `{"action":"subscribe","channel":"metrics.200074"}`
- `{"action":"ping"}`

**Replies:**
- Pong: `{"request_id":null,"action":"pong","success":true,"data":{"time":<ms>}}`
- Ack: `{"type":"subscribed","channel":"positions.200074"}`
- Error: `{"type":"error","channel":"...","message":"..."}`

**Channel changes:**
- **Drop `deals.<login>` (CHANGED).** Nothing is ever sent on it. Refresh history when a `position_closed` event arrives instead.
- Candle channels are `candles.EURUSD.M1`, not `.1m`. Using `subscribe_candles` on `/ws/feed` is preferred.

**Envelope (CHANGED, REQUIRED).** The event name is `data.type` and the payload is `data.data`:

```json
{"channel":"positions.200074","data":{"event_id":"...","client_order_id":"order-...","type":"position_opened",
  "data":{"ticket":2002,"account_login":200074,"broker_id":"trivanta-markets","symbol":"EURUSD","side":"buy","volume":0.01,
          "price_open":1.13745,"price_sl":1.13,"price_tp":null,"state_version":"1"}}}
```

**`positions.<login>` event types:**
- `position_opened`, `position_increased`, `position_decreased`, `position_reversed`
- `position_closed`, `position_partial_close`, `position_modified`
- `position_update` (`data.data` is an array)
- `swap_applied`, `margin_call`

**SL/TP hits (CHANGED, REQUIRED):**
- They arrive as `position_closed` with `data.data.close_reason` set to one of `"sl"`, `"tp"`, `"stop_out"`, `"netting_close"`, `"netting_reverse"`.
- The event also carries `price_close`, `profit`, `swap`, `deal_ticket` and `closed_at`.
- There is **no** `sl.triggered` / `tp.triggered` event.

**`metrics.<login>` (CHANGED keys).** A snapshot is sent on subscribe:

```json
{"channel":"metrics.200074","data":{"type":"metrics_update","publication_token":"...",
  "data":{"login":200074,"balance":10000,"credit":0,"equity":10000.15,"used_margin":11.37,"free_margin":9988.78,
          "margin_level":87952.5,"floating_pnl":0.15,"total_swap":0}}}
```

`margin_level: 0` means no margin is in use. Show it as "—".

## 8. Mobile changes checklist

### REQUIRED

**Broker directory** (`api/broker.ts`, `brokerRouting.ts`)
- [ ] Accept rows that have no `enabled` field.
- [ ] Point the directory env var at `https://superadmin-prod.orrnn.com/api/v2`.
- [ ] Keep rejecting rows that use raw IPs, `http://` or `ws://`.
- [ ] Show an error when the directory returns non-JSON.

**Login** (`api/auth.ts`, `authSession.ts`, `feedAuthContract.ts`)
- [ ] Stop requiring `feed_token` and `feed_auth_context`.
- [ ] Handle `account_login: null`.
- [ ] Derive account name, server name and account type as described in 4.1.

**Feed tokens**
- [ ] Delete all feed-token code and env values (`feedAuth.ts`, `.env`, `app.config.js`).

**Session**
- [ ] Make token refresh single-flight, with an 8 s timeout.
- [ ] Reconnect `/ws/v2` with the new token after each refresh.

**Quotes socket** (`QuotesWebSocketService.ts`)
- [ ] Connect without a token.
- [ ] Stop sending `{"type":"ping"}`.
- [ ] Parse `snapshot` messages.
- [ ] New watchdog: mark prices stale after 8 s of silence; reconnect only after 60 s of silence while the market is open.
- [ ] Remove the auth close-code logic.

**Tick normalizer** (`quoteTickNormalizer.ts`)
- [ ] Parse `sequence` from a string.
- [ ] Use `timestamp_ms`.
- [ ] Read high and low from `session.*`.
- [ ] Treat `previous_close: 0` as unknown.
- [ ] Compare `broker_id` case-insensitively.

**Feed health** (`market/feedHealthProbe.ts`)
- [ ] New rule based on `symbols_fresh` and `providers[].connected`.
- [ ] Ignore `upstream_connected` and `status`.
- [ ] Call it on demand only, with a 10 s timeout.

**Instruments**
- [ ] Derive `point`, `stops_level` and `base_currency`.
- [ ] Replace `/instruments/{symbol}` with a lookup in the cached list.

**Candles**
- [ ] Sort ascending.
- [ ] Use `M1`-style timeframes on REST.
- [ ] Append live candles from `/ws/feed` `subscribe_candles`.
- [ ] Draw gaps as gaps.

**Market status**
- [ ] Map `trade_open` / `quote_open` and show `message`.

**Orders** (`api/orders/*`, `tradeIdempotency.ts`)
- [ ] Send `client_order_id` in the body, reusing it on retry.
- [ ] Use a timeout of at least 30 s.
- [ ] Handle `202` by polling `/order-commands/{id}`.
- [ ] Handle `409 IDEMPOTENCY_CONFLICT`.

**Trading errors** (`tradingErrors.ts`)
- [ ] Add the codes from 6.1.
- [ ] Stop treating a 200 response as a possible rejection.

**Positions and pending orders**
- [ ] Partial close: send `volume` as a number.
- [ ] Positions: drop paging; treat a missing `commission` as 0.
- [ ] Pending: no auto-retry, re-fetch after modify, send `null` rather than 0 for "no SL/TP".

**History** (`api/deals.ts`)
- [ ] Use `/account/deals` with offset paging.
- [ ] Page `/positions/{login}/history` by time window.

**Account** (`api/account.ts`, `api/accounts.ts`)
- [ ] Read `used_margin`.
- [ ] Derive `open_positions` and `pending_orders`.
- [ ] Stop calling `GET /accounts` and `GET /exposure`.

**Wrong paths**
- [ ] `/api/account/transactions` → `/accounts/{login}/history`.
- [ ] `/api/account/equity-history` → `/account/{login}/equity`.
- [ ] Remove `/api/mt5/*`.

**Trade socket** (`BrokerRealtimeService.ts`)
- [ ] Read `data.type` / `data.data`.
- [ ] Detect SL/TP hits via `close_reason`.
- [ ] Use the new metrics keys.
- [ ] Drop `deals.<login>`.

**SL/TP capabilities** (`brokerSltpCapabilities.ts`)
- [ ] Add `trivanta-markets` and `Orrnn`, per 6.5.

**Sign-up**
- [ ] Hide it for both brokers (`registration_enabled:false`).

### OPTIONAL
- [ ] Keep sending the `Idempotency-Key` header.
- [ ] Show the broker logo from `/broker/config`.
- [ ] Unlock pending-order SL/TP and trailing stop after QA.

## 9. Verification (against both brokers; test accounts are shared separately)

Set `HOST=trivanta.orrnn.com BROKER=trivanta-markets`, or `HOST=service.orrnn.com BROKER=Orrnn`.

**0. Directory** (blocked until ops fixes the rows):

```bash
curl -s https://superadmin-prod.orrnn.com/api/v2/broker/servers
```

**1. Health and broker config:**

```bash
curl -s https://$HOST/health
curl -s https://$HOST/api/v2/broker/config
```

**2. Login:**

```bash
curl -s -X POST https://$HOST/api/v2/auth/login -H 'Content-Type: application/json' \
  -d "{\"username\":\"<login>\",\"password\":\"<password>\",\"broker_id\":\"$BROKER\"}"
```

**3. Refresh.** The refresh token in the response must be a new one:

```bash
curl -s -X POST https://$HOST/api/v2/auth/refresh -H 'Content-Type: application/json' -d '{"refresh_token":"<refresh_token>"}'
```

**4. Account, instruments, positions, candles:**

```bash
curl -s https://$HOST/api/v2/account/<login>   -H "Authorization: Bearer $TOKEN"
curl -s https://$HOST/api/v2/instruments
curl -s https://$HOST/api/v2/positions/<login> -H "Authorization: Bearer $TOKEN"
curl -s "https://$HOST/api/v2/candles/EURUSD?timeframe=M1&limit=100"
```

**5. Live feed (no token).** Expect `subscribed`, then `snapshot`, then ticks:

```bash
npx wscat -c "wss://$HOST/ws/feed?broker_id=$BROKER"
> {"type":"subscribe","symbols":["EURUSD","BTCUSD"]}
```

**6. Trade socket:**

```bash
npx wscat -c "wss://$HOST/ws/v2?token=$TOKEN"
> {"action":"subscribe","channel":"metrics.<login>"}
> {"action":"subscribe","channel":"positions.<login>"}
```

**7. Place, then close, 0.01 lot:**

```bash
curl -s -X POST https://$HOST/api/v2/orders -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"client_order_id":"order-test-0001","account_login":<login>,"symbol":"EURUSD","side":"buy","type":"market","volume":"0.01"}'
curl -s -X POST https://$HOST/api/v2/positions/<position_ticket>/close -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"client_order_id":"close-test-0001"}'
```

**8. History:**

```bash
curl -s "https://$HOST/api/v2/account/deals?limit=100&offset=0" -H "Authorization: Bearer $TOKEN"
```

**Status as of 2026-09-24:**
- Already confirmed live on both servers:
  - Steps 1 and 5.
  - Login without `broker_id` returns 400.
  - A wrong-case `broker_id` returns 401 `INVALID_BROKER`.
  - A bad refresh token returns 401 `INVALID_TOKEN`.
  - `/ws/v2` accepts the connection upgrade.
  - The instruments, quotes, candles and market-status response shapes.
- Steps 2–4 and 6–8 still need a test account.

## 10. Backend / ops items (the app must tolerate these)

1. 🔴 **Fix the `trivanta-markets` and `Orrnn` directory rows** on `superadmin-prod.orrnn.com`. They should use the https/wss hostnames from Section 3. This is the only blocker for the app. Also check `VITE_DEFAULT_MT5_SERVER=100.116.90.110` in the web terminal `.env.web`.
2. **Orrnn `/ws/feed/status`** reports `upstream_connected:false` and `status:"upstream_disconnected"` while quotes are flowing.
3. **Trivanta candle history** … *(the paste was cut off here)*
