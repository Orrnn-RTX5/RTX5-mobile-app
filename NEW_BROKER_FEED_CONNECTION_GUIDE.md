# New Broker Connection Guide — Live Market Data (Feed Auth)

> Written 2026-08-07 after fixing the Achiever "no live data" blackout.
> Use this checklist every time a NEW broker is added, so live data works
> on the first try. GTA is the reference broker that works end-to-end.

---

## 1. What happened with Achiever (the lesson)

1. Achiever login worked, REST worked, but live quotes never came.
2. Logcat showed: `[Quotes WS] Broker feed is disabled until its authentication contract is configured.`
   → the app never even tried the WebSocket (fail-closed).
3. Root cause: the backend login response sends `feed_auth_context` with **5 keys**
   (extra `account_login_query_param`). The app's Achiever-only strict parser
   required **exactly 4 keys** and rejected the whole contract.
   GTA worked because GTA uses the generic lenient parser that ignores extra keys.
4. Fix (frontend, `rtx5-app/src/api/feedAuthContract.ts`): Achiever's parser now
   **ignores unknown/extra keys** — same tolerance as GTA. All other strict checks
   kept (feed_token required, feed_token ≠ access_token, broker_id/account_login
   echo, exact param names/values).
5. Tests updated: `rtx5-app/src/api/feedAuthContract.test.ts` now pins the REAL
   backend shape (with `account_login_query_param`) as ACCEPTED, so this can
   never regress silently.

**Rule for the future: never disable a broker's feed because of an UNKNOWN extra
key. Only missing/invalid REQUIRED fields may fail-close.**

---

## 2. Checklist to connect a NEW broker

### A. Broker directory record (superbackend `/api/v2/broker/servers`)
- [ ] `broker_id` — stable, lowercase (this exact string is the app's identity key)
- [ ] `enabled: true`, `active: true`
- [ ] `server_url` — `https://` only → app derives REST base `{server_url}/api/v2`
- [ ] `feed_wss_url` — `wss://` only (usually `wss://<host>/ws/feed`)
- [ ] `feed_status_https_url` — `https://<host>/ws/feed/status`
- [ ] `trade_wss_url` — optional; if absent app auto-derives `wss://<host>/ws/v2`
- [ ] All URLs strict `https://`/`wss://` — plain http/ws is REJECTED by the app

### B. Login response (`POST {server_url}/api/v2/auth/login`)
Must contain (root level):
```json
{
  "access_token": "<jwt>",
  "refresh_token": "<token>",
  "expires_in": 86400,
  "broker_id": "<same broker_id as directory>",
  "account_login": "<echo of requested login>",
  "feed_token": "<non-blank, DIFFERENT from access_token>",
  "feed_auth_context": {
    "mode": "query",
    "credential": "feed_token",
    "token_query_param": "token",
    "broker_id_query_param": "broker_id"
  }
}
```
- Extra keys inside `feed_auth_context` are tolerated (ignored) since 2026-08-07.
- If the feed needs no auth: `feed_auth_context: { "mode": "none", "auth_required": false }`.
- No `feed_auth_context` at all → app falls back to env token
  (`EXPO_PUBLIC_<BROKER>_FEED_TOKEN`) if configured — avoid relying on this.

### C. Market WebSocket (the app connects automatically after login)
- URL: `wss://<host>/ws/feed?token=<feed_token>&broker_id=<broker_id>`
- App subscribes: `{"type":"subscribe","symbols":["EURUSD","XAUUSD"]}`
- Ticks must contain: `symbol` + finite `bid` + `ask`, with **ask >= bid**
  (the app silently DROPS crossed/incomplete ticks)
- Socket must not die on unknown-symbol subscribe
- A socket that connects but stays silent gets marked unavailable by the app watchdog

### D. REST endpoints (JWT bearer auth, used as fallback + volume source)
- [ ] `GET /api/v2/instruments` — full catalog `{ "instruments": [{ "symbol": ... }] }`
- [ ] `GET /api/v2/quotes?symbols=A,B` — 200 with bid/ask (feed-down fallback + volume)
- [ ] `GET /api/v2/candles/{symbol}?timeframe=M1&limit=N` — history for every symbol

### E. App-side registration (only if broker needs trading features)
- `rtx5-app/src/config/brokerSltpCapabilities.ts` — add broker_id to
  `CANONICAL_SLTP_BROKER_IDS` + capabilities map + `canonicalBrokerId()` + message
- `rtx5-app/src/api/feedAuth.ts` — optional env-token alias in
  `resolveBrokerSpecificConfiguredFeedToken()` (emergency fallback only)
- No other app change needed — directory + login contract drive everything else

---

## 3. Debug playbook when a broker shows no live data

1. `adb logcat -d ReactNativeJS:I *:S | grep -iE "feed|socket|quote"`
   - `Broker feed is disabled until its authentication contract is configured`
     → login response violates section B (check feed_token + feed_auth_context)
   - WS connect attempts + errors → server/proxy problem (502 = nginx upgrade config)
   - Connects but no ticks → feed publisher dead for those symbols
2. `curl https://<host>/ws/feed/status` (public) — shows upstream_connected,
   symbols_total/streaming/fresh/stale, feed_auth_required
3. REST check with a real JWT:
   `curl -H "Authorization: Bearer <jwt>" https://<host>/api/v2/quotes?symbols=EURUSD`
4. Compare against GTA (`services.growtradingacademy.com`) — the known-good reference.

---

## 4. Key app files (where this logic lives)

| Concern | File |
|---|---|
| Login feed contract parsing | `rtx5-app/src/api/feedAuthContract.ts` |
| Env feed tokens per broker | `rtx5-app/src/api/feedAuth.ts` |
| Directory record validation / endpoint derivation | `rtx5-app/src/api/brokerRouting.ts` |
| Session commit / fail-closed binding | `rtx5-app/src/services/brokerSessionCoordinator.ts` |
| Quotes socket (both `/ws/feed` + `/ws/v2` protocols) | `rtx5-app/src/api/ws/quotesSocket/QuotesWebSocketService.ts` |
| Tick shape validation (bid/ask, ask>=bid) | `rtx5-app/src/api/ws/quoteTickNormalizer.ts` |
| Contract tests (update in lockstep!) | `rtx5-app/src/api/feedAuthContract.test.ts`, `feedAuth.test.ts` |
