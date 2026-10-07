# Prompt for the Backend Team / Backend Agents — RTX5 Mobile App Integration Contract

> **Who this is for:** the backend team and any backend AI agent working on the broker servers, the broker directory (superbackend), the demo manager, and the market-data feed.
> **Written:** 2026-09-24, from a read of the mobile code in `rtx5-app/` (Expo / React Native, OTA 1.1.42 baseline + uncommitted Nexa onboarding changes).
> **Why:** the backend flow has changed. The mobile app is strict and **fails closed**: if a field, URL, path, or message shape is different from what is written below, the app silently blocks login, live quotes, or trading instead of guessing. Please read this whole document, compare it with the **current** backend, and then answer using the format in **Section 11** so the mobile team can update the app in one pass.

---

## 0. Your task (read first)

1. Read Sections 1–9. They describe **exactly** what the mobile app sends and what it accepts today.
2. For every item, check the current backend and mark it one of:
   - ✅ **MATCHES**: the backend already behaves this way.
   - 🔧 **BACKEND WILL FIX**: the backend will change to match the app (give an ETA).
   - 📱 **MOBILE MUST CHANGE**: the backend flow has changed on purpose and the app must follow. Give the **new exact contract**: URL, method, headers, request JSON, response JSON, error JSON, status codes, and real example payloads.
3. Answer the open questions in **Section 10**.
4. Produce a **"Prompt for the Mobile App"** as described in **Section 11**. The mobile team/agent will use that prompt directly to fix login, market data, trade placement, and everything else. It must be concrete: real field names, real example responses (with secrets redacted), and one real test account per broker.

Do **not** answer with generic statements such as "use standard JWT" or "same as before". The app matches on exact field names and exact paths.

---

## 1. System overview (as the app sees it)

```
                ┌────────────────────────────────────────────────┐
                │ Broker Directory (superbackend)                │
 App start ───► │ GET {DIRECTORY_BASE}/broker/servers            │  (no auth)
                └────────────────────────────────────────────────┘
                              │ user picks a broker row
                              ▼
                GET {server_url}/health        (pre-login probe, any non-2xx blocks login)
                              ▼
                POST {server_url}/api/v2/auth/login
                              │ access_token, refresh_token, feed_token, feed_auth_context
                              ▼
   ┌──────────────────────────┼───────────────────────────────────────────────┐
   │ REST  {server_url}/api/v2/...   Authorization: Bearer <access_token>     │
   │ Quotes WS   {feed_wss_url}?token=<feed_token>&broker_id=<broker_id>      │
   │ Feed status {feed_status_https_url}?token=..&broker_id=..                │
   │ Trade WS    {trade_wss_url or wss://<host>/ws/v2}?token=<access_token>   │
   └──────────────────────────────────────────────────────────────────────────┘
```

**Key rules:**

- The **broker directory is the only source of routing**. The app never builds broker hostnames from templates.
- After login, **every** REST call goes to that broker's own `server_url` + `/api/v2`. The platform backend is **never** used as a fallback for authenticated calls.
- Only `Authorization: Bearer` identifies the user on REST. **The app sends no `x-broker-id` / `x-account-id` headers.** The backend must get the broker and account from the JWT.
- There is **no logout endpoint**. Logout only clears data on the device.

---

## 2. Mobile environment setup (`rtx5-app/.env`, `app.config.js`)

| Variable | Current value | Used for |
|---|---|---|
| `EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL` | `https://fxtrustsuperbackned.orrnn.com/api/v2` (**changed** from `https://superbackend.orrnn.com/api/v2`, uncommitted; note the "backned" spelling) | `GET {base}/broker/servers` |
| `EXPO_PUBLIC_API_BASE_URL` | `https://superbackend.orrnn.com/api/v2` | Platform only: `POST /auth/register`. Also a **forbidden** origin for broker `server_url`. |
| `EXPO_PUBLIC_AUTH_PROXY_API_BASE_URL` | unset | Only adds another forbidden shared origin |
| `EXPO_PUBLIC_DEMO_API_BASE_URL` | `https://demomanager.orrnn.com/api/v1` | Public demo-account creation |
| `EXPO_PUBLIC_ORRNN_DEMO_BROKER_ID` | `orrnn-demo` | Expected demo `broker_id` |
| `EXPO_PUBLIC_ORRNN_DEMO_INITIAL_BALANCE` | `10000` | Demo `initial_balance` |
| `EXPO_PUBLIC_ORRNN_DEMO_ORIGIN_BROKER` | `orrnn-demo-mobile` | Demo `origin_broker` |
| `EXPO_PUBLIC_FEED_BROKER_TOKEN` | set (a legacy public token that ships inside the app) | Emergency feed-token fallback. Used **only** when the broker id matches the lock below. |
| `EXPO_PUBLIC_FEED_BROKER_ID` | `nexa` (**changed** from `myprop-trade`) | Broker lock for the generic token above |
| `EXPO_PUBLIC_NEXA_FEED_TOKEN` / `_GTA_FEED_TOKEN` / `_MYPROP_FEED_TOKEN` | Nexa: empty | Per-broker env feed-token fallback. Never used for `achiever-financials`. |
| `EXPO_PUBLIC_CANDLE_HISTORY_PATH` / `_QUERY_STYLE` | `candles` / `timeframeLimit` | `GET /api/v2/candles/{symbol}?timeframe=M1&limit=N` |
| `EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES` | `'{}'` | **Ignored at runtime.** SL/TP capabilities are hard-coded per broker (Section 8). |

**Hard-coded in the app (not env):** the logged-out public market uses `https://demobackend.orrnn.com` (`/api/v1/candles/symbols`, `/api/v1/candles`, `wss://demobackend.orrnn.com/ws/feed`, `/ws/feed/status`).

**Security note for the backend/ops team:** because env feed tokens ship inside the app bundle, they are public. The target design is that **every broker returns a per-session `feed_token` in the login response**, and env tokens are removed. Please rotate the token currently in `EXPO_PUBLIC_FEED_BROKER_TOKEN`.

**Brokers currently known to the app:**

| broker_id | Server |
|---|---|
| `gta_broker` | `https://services.growtradingacademy.com` (reference broker that works end-to-end) |
| `myprop-trade` | `https://services.myprop.trade` |
| `achiever-financials` | (strict contract, Section 4.4) |
| `orrnn-demo` | `https://demobackend.orrnn.com` |
| `Nexa` | `https://nexa.orrnn.com` (being onboarded now; live quotes are broken, Section 9.1) |

---

## 3. Broker directory — `GET {DIRECTORY_BASE}/broker/servers`

- **Request:** no auth, `accept: application/json`, 10 s timeout.
- **Retries:** the app retries twice, but not on 401/403/404/422.

### 3.1 Shape A — bare JSON array ("raw v2"). This is the live path used today.

**Required fields in each row:**

| Field | Type / rule |
|---|---|
| `id` | number |
| `created_at` | number |
| `server` | string |
| `server_ip` | string |
| `protocol` | must equal `"https"` |
| `server_url` | see URL rules below |
| `feed_wss_url` | `wss://` URL |
| `feed_status_https_url` | `https://` URL |
| `broker_name` | string |
| `server_port` | number |
| `broker_id` | string |

**Optional fields:**

- `trade_wss_url` / `trade_ws_url`. If absent, the app derives `wss://{server_url host}/ws/v2`. If present but invalid, the row is rejected.
- `logo_url`, `region`, `domains`.

**Aliases the app accepts:**

- Feed WS URL: `feed_wss_url`, `feed_ws_url`, `feed_url`, `wss_url`, `ws_url`. If two of these give **different** valid URLs, the row is rejected as a conflict.
- Status URL: `feed_status_https_url`, `feed_status_url`.

**Rows are rejected or skipped when:**

- `enabled === false`. (Uncommitted change: a row with **no** `enabled` key is now accepted.)
- `active` is present and not `true`.
- `status` is one of `disabled`, `inactive`, `suspended`, `revoked`, `deleted`.
- `license_active === false` or `licensed === false`.

**URL rules (strict):**

- Only `https://` / `wss://`. Plain `http` / `ws` is rejected.
- Public hostname only: no raw IPs, `localhost`, `.local`, `.internal`, or 203.0.113.x.
- No userinfo, query string, or `#` fragment.
- **All endpoints must be on the same host:port as `server_url`.**
- `server_url` must not be on the platform or directory origin.
- REST base is `{server_url}/api/v2` when `server_url` has no path. An existing `/api/vN` path is kept as-is.

**Duplicates and sort order:** duplicate `broker_id`s (case-insensitive) are de-duplicated. "MetaQuotes Ltd." is pinned first, then rows are sorted by name.

### 3.2 Shape B — `{ "schema_version": "broker-directory.rich.v1", "brokers": [...] }`

This shape is supported but stricter:

- `enabled`, `active`, and `license_active`/`licensed` must all be `true`.
- `config_version` is required.
- `services_domain` is required, and every endpoint host must equal it.
- The REST base comes from `market_api_url`.

### 3.3 Shape C — `{ "value": [...] }` without `schema_version`

Treated as **display-only**. These brokers can never be logged into.

### 3.4 Pre-login health check

`GET {server_url}/health` with a 3 s timeout, retried once. **Any non-2xx blocks login.**

---

## 4. Authentication

### 4.1 Login — `POST {server_url}/api/v2/auth/login`

- **Headers:** `Content-Type: application/json`, `accept: application/json`. No Authorization header.
- **Timeout:** 8 s.

**Request body:**

```json
// normal brokers
{ "username": "<typed login>", "password": "...", "broker_id": "<selected broker_id>" }

// orrnn-demo only: numeric login, not username
{ "login": 200074, "password": "...", "broker_id": "orrnn-demo" }
```

**Response the app accepts:**

```json
{
  "access_token": "<jwt>",               // or "token"  (REQUIRED)
  "refresh_token": "<token>",            // or "refreshToken"
  "expires_in": 86400,                   // or "expires_at" (epoch s or ms); default 86400
  "broker_id": "<same as selected>",     // or "brokerId"; MUST equal the selected broker (case-insensitive) or login FAILS
  "account_login": "200074",             // or accountLogin, user.account_login, user.id, username, user.username
  "account_name": "John",                // or accountName, name, user.name ...
  "server": "Nexa-Live",                 // or broker_server / brokerServer
  "account_type": "demo|real|contest",   // or accountType/type/kind/mode, is_demo, is_contest, group
  "feed_token": "<non-blank, DIFFERENT from access_token>",
  "feed_auth_context": {
    "mode": "query",
    "credential": "feed_token",          // or "access_token" (non-Achiever brokers)
    "token_query_param": "token",
    "broker_id_query_param": "broker_id",
    "account_login_query_param": "login" // optional
  }
}
```

**Where the app looks for the feed token:**

- Keys, in order: `feed_broker_token`, `broker_feed_token`, `feed_token`, `ws_feed_token`, `market_data_feed_token`, `market_data_token`, `quote_feed_token`, then the camelCase version of each.
- Locations: the root first, then inside `feed`, `feed_auth`, `feedAuth`, `market_data`, `marketData`, `quote_feed`, `quoteFeed`.

**Rules for `feed_auth_context`:**

- `feed_auth` is accepted as an alias (except for Achiever).
- Extra keys are ignored.
- For a broker whose feed needs no auth, send `{ "mode": "none", "auth_required": false }`.
- `credential: "feed_token"` with no feed token present **disables the feed**.

**Feed-token priority in the app:**

1. `feed_token` from the login response.
2. The feed token already stored for the session.
3. The env token (Section 2).

This means that **if login returns a wrong `feed_token`, an env token cannot override it.**

**Errors:** the message is read from `message`, then `detail`, `error.message`, `error.detail`, `error` (string). The HTTP status is used as-is.

### 4.2 Refresh — `POST {apiBase}/auth/refresh`

- **Headers:** no Bearer.
- **Body:** `{"refresh_token": "..."}`.
- **Timeout:** 2.5 s.

**When the app refreshes:**

- When the token expires in less than 60 s.
- On any REST 401: the app refreshes once, then replays the request once. It does **not** replay `PUT /positions/{t}`, `PUT /orders/pending/{t}`, or `DELETE /orders/pending/{t}`.

**The response must contain:**

- `access_token` / `token`.
- **a rotated `refresh_token` / `refreshToken`. This is mandatory; otherwise the session is invalidated.**
- `expires_at`/`expiresAt` or `expires_in`.

**Identity and feed rules:**

- If `broker_id` or `account_login` is present, it must match the session, or the session is invalidated.
- A `feed_token` or `feed_auth_context` in the refresh response replaces the stored one. For non-Achiever brokers, if none is returned, the old feed token is kept.

**Errors:** refresh 400/401/403 logs the user out.

### 4.3 Other auth endpoints

| Call | Base | Details |
|---|---|---|
| `GET /auth/me` | broker apiBase | Called at app bootstrap |
| `POST /auth/change-password` | broker apiBase | `{current_password, new_password}` |
| `POST /auth/register` | platform base | `{email, password, name, broker_id, group, leverage, currency}` |

**Account switching** has no endpoint. The app does a full new `/auth/login` with the saved credentials, and the returned `account_login` must equal the saved login.

### 4.4 `achiever-financials` (strict contract)

- The response must have `broker_id === "achiever-financials"` exactly.
- `account_login` must equal the typed login.
- `access_token` and `refresh_token` must be non-blank, and `expires_in` must be > 0.
- `feed_token` must be non-blank and must not equal `access_token`.
- `feed_auth_context` must be exactly `{mode:"query", credential:"feed_token", token_query_param:"token", broker_id_query_param:"broker_id"}`. Extra keys are ignored.
- On refresh, a **new** `feed_token` is required. Reusing the same one disables the feed.
- Env tokens are never used for this broker.

### 4.5 Public demo account (demo manager, no auth)

| Call | Details |
|---|---|
| `GET /public/demo-status` | Healthy only if `service=="orrnn-demo"`, `broker_id=="orrnn-demo"`, `status=="ok"`, `broker=="active"`, `database=="connected"`, and `demo_groups_available>0`. |
| `GET /public/demo-groups` | Returns `{groups:[{name,description,currency,leverage}], count}` |
| `POST /public/demo-account` | Body: `{group, email, master_pass, first_name, last_name?, phone?, initial_balance, origin_broker}`. **Only HTTP 200 counts as success (201 = error).** Response must be `{login:<int>, broker_id:"orrnn-demo", group:"orrnn-demo/demo-std"}`. |

After creation, the app logs in via `POST https://demobackend.orrnn.com/api/v2/auth/login` with `{login, password, broker_id}`. For that to work, the `orrnn-demo` row must be present and valid in the directory.

---

## 5. Market data

### 5.1 Quotes WebSocket

**URL:** `{feed_wss_url}?token=<feed_token>&broker_id=<broker_id>[&<account_login_query_param>=<login>]`

- The parameter names come from `feed_auth_context`.
- With `mode:"none"`, the app connects to the bare URL.
- The `broker_id` value is sent **exactly as stored in the directory**. For Nexa this is `Nexa` with a capital N. **The feed server should compare `broker_id` case-insensitively.**

**Authentication:**

- Authentication is **only** by query string. There is no header, no first auth message, and no auth ack.
- The app starts subscribing as soon as the socket opens.

**How the app detects an auth failure:**

- WebSocket close codes `1008`, `4001`, `4401`, `4403`.
- An HTTP 401/403 on the upgrade (seen by the app as a pre-open close 1006 with "401/403/unauthorized/forbidden" in the reason).
- **The app does not read a JSON error body.** A reason such as `broker_token_mismatch` is never seen by the app. Please **reject the upgrade with HTTP 401/403 or close with 4401/4403**, and include a readable reason string.
- After an auth failure, the app refreshes the JWT once and **will not reconnect with the same URL** until it receives a new credential.

**Messages the app sends (only the differences in the symbol set; the full set on reconnect):**

```json
{"type":"subscribe","symbols":["EURUSD","XAUUSD"]}
{"type":"unsubscribe","symbols":["EURUSD"]}
{"type":"ping"}                       // every 15 s, no pong required
```

- Symbols are upper-cased, but broker suffixes keep their case (`EURUSD.c`, `EURUSDm`).
- **The socket must not close when a client subscribes to an unknown symbol.**
- A subscribe ack is optional: `{"type":"subscribed","symbols":[...]}`. A received tick also counts as confirmation.
- If the URL path is not `/ws/feed`, the app uses the channel protocol instead: `{"action":"subscribe","channels":["ticks.EURUSD"]}`.

**Tick format the app accepts:**

```json
{"symbol":"EURUSD","bid":1.08501,"ask":1.08512,"timestamp_ms":1760000000123,"seq":123}
```

- A message can be a single tick, an array, or wrapped in `data`/`ticks`/`quotes`/`prices`/`items`/`payload`/`message`.
- **Accepted field aliases:**
  - symbol: `symbol`/`s`/`instrument`, or taken from a `ticks.X` channel
  - bid: `bid`/`b`/`bid_price`
  - ask: `ask`/`a`/`ask_price`
  - time: `timestamp_ms`/`time`/`ts`/`t`; seconds, ms, µs, and ns are all accepted
  - sequence: `sequence`/`seq`
  - optional: `high`, `low`, `open`, `change_pct`, `spread`, `volume`, `digits`
- **Ticks are silently dropped** if:
  - `bid` or `ask` is missing, not finite, or ≤ 0.
  - `ask < bid`.
  - the time goes backward, the `seq` is lower, or the `tick_id` repeats.
  - an explicit `broker_id` or `account_login` does not match the session.
- **Watchdog:** if nothing is received for **8 s**, the app tears down the socket and reconnects. Please send ticks or a heartbeat at least every ~5 s, even when the market is quiet.
- **Reconnect:** full-jitter backoff, `rand * min(5000, 750*2^n)` ms, then a 10 s cooldown after 20 attempts. The socket closes when the app goes to the background.

### 5.2 Feed status — `GET {feed_status_https_url}?token=..&broker_id=..` (3 s timeout)

**Fields the app reads:**

- `auth_accepted`, `upstream_connected`, `market_available`
- `scheduled_market_closed` / `market_schedule:"closed"`
- `providers[{id,connected}]`, `symbol_status[{fresh,stale,tradable}]`, `stale`, `degraded`
- `health_policy{local_tick_stale_after_ms, server_status_stale_after_ms}`

**Health rules:**

- **To be shown as healthy**, the response must include `auth_accepted:true`, `upstream_connected:true`, and `market_available:true`.
- If `auth_accepted` is omitted, the feed is only ever "degraded". **The live servers currently omit it; please add it.**
- `auth_accepted:false`, `upstream_connected:false`, or `market_available:false` hard-stops the socket.

**Response size:** the Nexa status response is about 200 KB and times out on slow phone networks. Please keep this response small, or add a `?summary=1` mode.

### 5.3 REST market endpoints (Bearer, under `{server_url}/api/v2`)

| Endpoint | Expected response |
|---|---|
| `GET /instruments` | `{ "instruments": [ {symbol, digits, point, tick_size, tick_value, contract_size, min_volume, max_volume, volume_step, stops_level, base_currency, profit_currency, swap_long, swap_short, ...} ] }` (a bare array is also accepted) |
| `GET /instruments?favorites=true` | Same shape as `/instruments` (used at bootstrap) |
| `GET /instruments/{symbol}` | A single record (may be wrapped in `instrument`/`data`/`result`) |
| `GET /quotes?symbols=A,B` | An array of `{symbol,bid,ask,volume,...}`. Used as a fallback when the feed is down, and as the volume source. |
| `GET /candles/{symbol}?timeframe=M1&limit=N[&from=<unix s>&to=<unix s>]` | `{symbol, timeframe, candles:[{time,open,high,low,close,volume}]}`. Timeframes: `M1 M5 M15 M30 H1 H4 D1 W1 MN`. The default limit is **2500**, so please support at least that. |
| `GET /market/status` and `GET /market/status/{symbol}` | `{symbol, status:"open"\|"closed"\|"pre_market"\|"after_hours", trade_open, quote_open, session_open, session_close, server_time, message}` |
| `GET /watchlist`, `POST /watchlist/{symbol}`, `DELETE /watchlist/{symbol}`, `PUT /watchlist` | `GET` returns `[{symbol, added_at, sort_order}]`. `POST` returns 400 if the symbol already exists. `PUT` takes a body of `[{symbol, sort_order}]`. |

---

## 6. Trading (Bearer, under `{server_url}/api/v2`)

**Idempotency-Key header** (format `<prefix><uuidv4>`):

| Endpoint | Key prefix |
|---|---|
| `POST /orders` | `order-` |
| `POST /orders/pending` | `pending-` |
| `POST /positions/{t}/close` | `close-{t}-` |
| `PUT /orders/pending/{t}` | `pending-modify-{t}-` |
| `DELETE /orders/pending/{t}` | `pending-cancel-{t}-` |

`PUT /positions/{t}` (SL/TP modify) has **no** key.

**Please confirm** that the backend honours these keys: the same key must return the same result, and the backend should return `IDEMPOTENCY_KEY_REUSED` when the same key is sent with a different body.

### 6.1 Market order — `POST /orders`

**Request:**

```json
{
  "account_login": 200074,        // integer, must equal the JWT account
  "symbol": "EURUSD",
  "side": "buy",                  // "buy" | "sell"
  "volume": "0.01",               // DECIMAL STRING, <=8 fraction digits
  "type": "market",
  "sl": "1.0800",                 // optional decimal string
  "tp": "1.1000",                 // optional decimal string
  "fill_mode": "return",          // optional: "return" | "fok"
  "comment": "..."                // optional
}
```

- **Not sent:** `broker_id`, `magic`, client order id. The backend must take the broker from the JWT.
- **Success** requires **HTTP 200 exactly** (the body may be wrapped in `data`/`result`):

  ```json
  { "order_ticket": 1, "position_ticket": 2, "price": 1.08512, "status": "filled", "action": "opened",
    "symbol": "EURUSD", "side": "buy", "volume": 0.01, "time": 1760000000 }
  ```

- "**Order Executed**" is shown only when `position_ticket` (or `ticket`) > 0, `price` (or `price_open`) > 0, and the status is not `rejected`/`failed`/`error`. Otherwise the app shows "Confirmation Pending".
- **Rejected trades:** HTTP 200 with `status:"rejected"` is also treated as a reject, and the message is taken from `comment`/`message`.
- `action` values the app understands: `opened`, `closed`, `increased`, `decreased`, `reversed`.

**Symbol retry.** On a 400/404 whose message contains `market data`, `no quote`, `symbol not found`, `unknown symbol`, `not available`, or `zero market price`, the app retries with another symbol spelling taken from `/instruments`.

**Fill confirmation.** After the order, the app polls `GET /positions/{login}` up to 10 times, 400 ms apart, until the new position appears. **The position must appear in REST within about 4 s.**

### 6.2 Positions

**List: `GET /positions/{login}?limit=50&offset=0`** (polled every 5 s)

- Must return a **bare array**.
- Row fields: `ticket, account_login, symbol, side, volume, price_open, price_current, price_sl, price_tp, profit, swap, commission, comment, time_create, time_update`.

**Reconciliation read: `GET /positions/{login}`** (no query parameters)

- Used after orders and after SL/TP modifies.
- Must return a bare array.

**Close: `POST /positions/{ticket}/close`**

- Body: `{"mode":"full"}`. A partial close sends `{"volume":"0.01"}`; the code exists, but no screen uses it yet.
- Any 2xx is success.
- Response fields: `ticket, price_close, profit, volume_closed, status, time, ...`

**Modify SL/TP: `PUT /positions/{ticket}`**

- Body: `{"price_sl": 1.08 | null, "price_tp": 1.10 | null}` (numbers; `null` clears).
- Success requires **HTTP 200** with exactly:

  ```json
  {"ticket": <same>, "symbol": "EURUSD", "status": "modified", "time": 1760000000, "price_sl": 1.08, "price_tp": 1.10}
  ```

- SL and TP must be echoed exactly as sent. A value sent as `0` or `null` must be echoed as `null`.

### 6.3 Pending orders (**currently locked in the UI** until the backend confirms)

**Place: `POST /orders/pending`**

- Body: `{account_login, symbol, volume:"0.01", type:"buy_limit|sell_limit|buy_stop|sell_stop", price:"1.0850", sl?, tp?, expiry?:<unix s>|null, fill_mode?, comment?}`.
- **`side` is not sent.**

**List: `GET /orders/pending/{login}`**

- Must return a bare array.
- Required per row: `ticket`, `account_login`, `symbol`, `type`, `status`, `time_setup`.

**Modify: `PUT /orders/pending/{ticket}`**

- Body: `{price?, sl?|null, tp?|null, expiry?|null}`.
- Response: the full pending row.

**Cancel: `DELETE /orders/pending/{ticket}`**

- Sent with no body.
- Response must be exactly `{"ticket":<same>,"status":"cancelled","time":<int>}`.

### 6.4 History and orders

| Endpoint | Notes |
|---|---|
| `GET /positions/{login}/history?limit=1000&offset=N` | Closed positions, paged by offset |
| `GET /deals/{login}?limit=1000&offset=0[&from&to]` | Deal row: `ticket, order_ticket, position_ticket, symbol, action:"deal_buy/deal_sell", entry:"entry_in/entry_out", volume, price, profit, swap, commission, fee, time` |
| `GET /account/deals?limit=500&offset=0[&from&to]` | Same row format as `/deals/{login}` |
| `GET /orders/{login}?limit=500` | Order history |
| `GET /account/orders?limit=500&offset=0` | Order history |

### 6.5 Trading error format

The app reads error responses in this form:

```json
{ "error": "INSUFFICIENT_MARGIN", "message": "Not enough free margin" }
```

- The code is read from `error`, then `code`, then `error_code`.
- The message is read from `detail`, then `message`, then `comment`.

**Codes the app understands:**

`UNAUTHORIZED, INVALID_INPUT, INVALID_SIDE, INVALID_IDEMPOTENCY_KEY, IDEMPOTENCY_KEY_REQUIRED, IDEMPOTENCY_KEY_REUSED, BROKER_REQUIRED, BROKER_NOT_FOUND, BROKER_INACTIVE, LICENSE_EXPIRED, INSUFFICIENT_MARGIN, TRADE_DISABLED, SYMBOL_NOT_ALLOWED, TRADE_ROUTE_NOT_CONFIGURED, NO_FRESH_QUOTE, STALE_QUOTE, SOURCE_MISMATCH, MISSING_FX_RATE, CALCULATION_SCHEMA_NOT_READY, INVALID_SL_TP, INCOMPLETE_*, NOT_FOUND, RATE_LIMITED, DATABASE_ERROR`

**Status handling:**

- 401 means the session expired.
- 429 is honoured with `Retry-After` in seconds.
- 502 and above means the server is unavailable.

---

## 7. Account data and the trade/account WebSocket

### 7.1 REST

**Account summary: `GET /account/{login}`** (polled every 30 s)

- Fields: `login, name, currency, leverage, balance, credit, equity, margin_used, free_margin, margin_level, floating_pnl, open_positions, pending_orders, group, account_type`.
- Numeric strings are accepted.

**Account list: `GET /accounts`** — must return a **bare array** of the same account shape.

**Other:**

- `GET /exposure`
- `GET /alerts`, `POST /alerts` (expects 201), `DELETE /alerts/{id}`

### 7.2 Trade WebSocket

**URL:** `{trade_wss_url or wss://<host>/ws/v2}?token=<access_token>`

**Messages the app sends:**

```json
{"action":"subscribe","channel":"positions.<login>"}
{"action":"subscribe","channel":"metrics.<login>"}
{"action":"subscribe","channel":"deals.<login>"}
{"action":"subscribe","channel":"candles.EURUSD.1m"}      // chart live candles
{"action":"ping"}                                         // every 15 s
```

**Messages the app accepts:**

- The envelope is `{channel|topic, type|event|action, data|payload|result, broker_id?, account_login?}`.
- **Messages are dropped** if `broker_id` or `account_login`, or the login suffix in the channel name, does not match the session.
- **`positions.*`** messages are hints only; they trigger REST refreshes. Terminal events are `closed`, `sl.triggered`, and `tp.triggered` (with `data.ticket`).
- **`metrics.*`** messages carry `balance`, `equity`, `margin_used`, `margin_free`/`free_margin`, `margin_level`, and `floating`/`profit`.
- **`deals.*`** messages trigger a history refresh.
- **Auth-failure close codes:** 1008, 4001, 4401, 4403.

---

## 8. Broker-specific configuration in the app

SL/TP capabilities are **hard-coded** in `rtx5-app/src/config/brokerSltpCapabilities.ts` for these brokers: `achiever-financials`, `orrnn-demo`, `gta_broker` (alias `grow-trading-academy`), `myprop-trade`, and `nexa` (uncommitted).

| Capability | Status | Backend must confirm |
|---|---|---|
| SL/TP on a new market order | ON | Stored and triggered server-side |
| Modify SL/TP on an open position | ON | Stored and triggered server-side |
| SL/TP on pending orders | OFF (blocked in app) | Supported? |
| Trailing stop | OFF (blocked in app) | Supported? |

**Any `broker_id` not in this list has no SL/TP.** If you add a new broker, give the mobile team its exact `broker_id` string.

---

## 9. Known problems right now (backend action needed)

### 9.1 🔴 Nexa has no live quotes (blocker)

**What works:**

- Login and REST.
- The feed server itself is healthy (`/ws/feed/status`: upstream connected, symbols fresh, `feed_auth_required:true`).

**What fails:**

- The WS upgrade `wss://nexa.orrnn.com/ws/feed?token=…&broker_id=Nexa` returns **HTTP 401 `{"error":"broker service unauthorized","reason":"broker_token_mismatch"}`**.
- It fails with the login-issued `feed_token` (10 chars), with the env token, with a bogus token, and with both `nexa` and `Nexa`.

**Root cause:** the `feed_token` issued by Nexa's `/auth/login` is not the token the Nexa feed server is configured to accept. This must be fixed in the backend; the app cannot override the login token.

**Required fix:** align the feed server's token validation with the login-issued `feed_token`. The token should be per-session, or at least valid for this broker. Also compare `broker_id` case-insensitively.

**Please also confirm:**

- Nexa's login response includes `feed_auth_context` (Section 4.1).
- Nexa's directory row passes Section 3.1, including `protocol`, `server_port`, and a decision on whether to include `enabled`.

### 9.2 Feed status response is too large

The Nexa `/ws/feed/status` response is about 200 KB and times out on phones. The app then keeps showing "Connecting…". Please add a compact mode and include `auth_accepted`.

### 9.3 Paths the app currently calls that are probably wrong

Please confirm the real paths:

| Current app call | Resolves to |
|---|---|
| `/api/account/transactions?type=&limit=50` | `/api/v2/api/account/transactions` |
| `/api/account/equity-history?period=30d&interval=1d` | `/api/v2/api/account/equity-history` |
| `/api/mt5/status`, `/api/mt5/groups`, `/api/mt5/account/create` | `/api/v2/api/mt5/...` |

### 9.4 Other items

- Positions are fetched with `limit=50`. What is the server's maximum, and should the app page through positions?
- Is there a Close-By endpoint? Partial close?
- The directory host moved to `fxtrustsuperbackned.orrnn.com`. Is this the final production host? Will `superbackend.orrnn.com` keep working for older app builds already in the field?

---

## 10. Questions the backend must answer

1. Does every endpoint in Sections 3–7 still exist at **the same path and method**? List every path that changed, was added, or was removed.
2. Login: does the response still use `access_token`, `refresh_token`, `expires_in`, `broker_id`, `account_login`, `feed_token`, and `feed_auth_context` at the **root**? Paste a real (redacted) response **for each broker**.
3. Is the body still `username` + `password` + `broker_id`, with `login` for orrnn-demo? Has this changed for any broker?
4. Refresh: is the refresh token rotated on every call? What is the access-token lifetime?
5. Feed: for each broker, give the exact WS URL, auth params, and whether the token is per-session. Explain how a 401 is signalled (HTTP status or close code).
6. Does every broker's feed send a tick or heartbeat at least every 5 s?
7. Trading: is `volume` accepted as a decimal string? Does `/orders` return HTTP 200 with `position_ticket` and `price`? Are `Idempotency-Key` headers honoured?
8. Does `PUT /positions/{ticket}` return the exact echo shape in Section 6.2?
9. Are pending orders, SL/TP on pending orders, and trailing stops ready? For which brokers?
10. Does the trade WS `/ws/v2` still use `{"action":"subscribe","channel":"positions.<login>"}` / `metrics.<login>` / `deals.<login>` / `candles.<SYM>.<tf>`?
11. What is the directory's final schema: raw array (Shape A) or `broker-directory.rich.v1` (Shape B)? Paste one real row per broker.
12. Give one working test account per broker (sent through a secure channel, not in this file).

---

## 11. What to send back: a "Prompt for the Mobile App"

Create a file named **`MOBILE_APP_PROMPT_FROM_BACKEND.md`** and give it to the mobile team. It will be passed directly to the mobile AI agent. Use this structure:

```markdown
# Prompt for the RTX5 Mobile App — Backend Contract v<N> (<date>)

## 1. Summary of backend changes
- Bullet list: what changed, why, which brokers are affected.

## 2. Environment values the app must use
| Env var | New value | Note |
(directory base URL, demo base URL, any new vars; mark env feed tokens as REMOVE if the login now always returns feed_token)

## 3. Broker directory
- Final URL + one real JSON row per broker (Nexa, GTA, MyProp, Achiever, orrnn-demo).

## 4. Auth
- Login: URL, request JSON, one REAL response per broker (tokens redacted, keys unchanged).
- Refresh: request/response. Token lifetimes. Error JSON + status codes.

## 5. Market data
- Feed WS URL + query params per broker, subscribe/tick/heartbeat examples, how auth failure is signalled.
- Feed status example response.
- instruments / quotes / candles / market-status: URL + example response.

## 6. Trading
- For each: market order, positions list, close, modify SL/TP, pending place/list/modify/cancel, history, deals:
  URL, method, request JSON, success JSON, error JSON (with codes), status codes.
- Idempotency behaviour.
- Capabilities per broker (SL/TP on market, on position, on pending, trailing).

## 7. Account + trade WebSocket
- Account endpoints + example responses; trade WS channels + example messages.

## 8. Mobile changes required (checklist)
- [ ] file/area → exact change (e.g. "feedAuth: Nexa login now returns feed_token X in `feed.token`", "transactions path is /account/transactions").
- Mark each as REQUIRED or OPTIONAL.

## 9. Verification steps
- Test account per broker, and the curl / wscat commands that prove login, the live feed, placing and closing an order, and history.
```

**Rules for that prompt:**

- Use **real** field names and **real** example JSON copied from the running servers. Redact token values, but keep the keys.
- Mark every difference from this document explicitly as **CHANGED** and show both the old and the new version.
- Say what the app should do when a field is missing. The app fails closed by default.
- Keep secrets (passwords, feed tokens) out of the file. Share test credentials separately.

---

### Appendix: where this logic lives in the mobile app (for cross-checking)

| Concern | File (`rtx5-app/src/...`) |
|---|---|
| Directory parsing and URL validation | `api/broker.ts`, `api/brokerRouting.ts` |
| Login screen and response parsing | `../app/login.tsx`, `api/auth.ts`, `api/authSession.ts` |
| Session, refresh, headers, 401 replay | `api/brokerApi.ts`, `services/brokerSessionCoordinator.ts` |
| Feed token and feed auth context | `api/feedAuth.ts`, `api/feedAuthContract.ts` |
| Quotes WebSocket | `api/ws/quotesSocket/QuotesWebSocketService.ts`, `api/ws/quoteTickNormalizer.ts`, `market/feedHealthProbe.ts` |
| Candles | `domain/candles/api/*`, `domain/candles/ws/*` |
| Orders | `api/orders/*`, `api/tradeIdempotency.ts`, `api/tradingErrors.ts` |
| Positions and history | `api/positions/*`, `api/deals.ts` |
| Account and trade WebSocket | `api/account.ts`, `api/accounts.ts`, `api/ws/BrokerRealtimeService.ts` |
| SL/TP capabilities | `config/brokerSltpCapabilities.ts`, `api/sltpCapabilityGuard.ts` |
| Demo account | `api/publicDemo.ts`, `../app/register.tsx` |
