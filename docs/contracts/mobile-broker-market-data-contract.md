# Mobile broker market-data contract

Last verified: 2026-07-18 (Asia/Calcutta)

This file records contracts observed by the mobile implementation. `CONFIRMED` means the live response is sufficient for the stated mobile behavior. `OPEN` means mobile must fail closed for the missing portion; it is not permission to derive or guess a value.

| # | Contract item | Status | Source / evidence | Mobile action if missing |
|---|---|---|---|---|
| 1 | Canonical `BROKER_DIRECTORY_BASE_URL` (HTTPS, release-configured, single) | CONFIRMED | The tracked mobile environment selects `https://superbackend.orrnn.com/api/v1`, and a live `GET /broker/servers` succeeded. Mobile reads only `EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL`; there is no alternate directory host or derived fallback. | Block directory-dependent selection when release configuration is absent or non-TLS. Never try alternate directory hosts. |
| 2 | Directory schema version (rich vs opaque) | OPEN / RELEASE BLOCKER | Live v1 and v2 `GET /broker/servers` both returned HTTP 200 with the same raw 11-record array. Records look rich but the response has no `schema_version`, and records have no `config_version` or positive enabled/active/license approvals. | Quarantine unversioned rows as identity-only display data: keep only validated ID/name text, render them disabled, and discard every route/status/domain/logo field. Only the explicitly supported versioned rich envelope can authorize selection or routing; opaque mode still requires a signed broker-bound handoff/proxy. |
| 3 | Direct endpoint validation rules | CONFIRMED | V2 product contract plus live rich-looking fields: exact HTTPS API/status URLs, exact WSS feed URL, and endpoint hosts matching the approved `services_domain`; live directory also contains cleartext/raw-IP fixtures that demonstrate the reject path is required. | Reject private/reserved/raw-IP, HTTP/WS, host mismatch, inactive/disabled, and incomplete records. Never upgrade schemes or synthesize a host/path. |
| 4 | ORRNN Broker Demo ID, preview symbol, auth mode, and health gate | OPEN | A live raw directory record exists for `broker_id=orrnn-demo`, but its advertised status endpoint was unreachable in the latest bounded probe and no approved pre-login symbol, credential mode, or health threshold was returned. | Keep pre-login market preview disabled. Do not substitute the older `orrnn` or `testorrnn` identities. |
| 5 | Post-login endpoint-set ownership (API, feed WSS, trade WSS, status) | OPEN | Raw records expose API origin, feed WSS, and feed status fields. No approved schema assigns explicit trade-WebSocket endpoint semantics/version in the live directory response. | Commit only validated fields. Do not derive a universal trade socket; keep that capability disabled when a login/handoff does not provide it. |
| 6 | Feed credential mechanism and refresh | OPEN | Live MyProp and GTA status responses report `feed_auth_required: true`. MyProp query-token behavior is already supported as a broker-specific documented exception, but no universal credential/refresh contract is present in directory records. | A missing approved feed credential yields `disabled_unconfigured`/`auth_failed`; never use an environment token or a previous broker token. |
| 7 | Feed-status schema, thresholds, and action-block policy | OPEN | Live successful status responses confirm upstream/provider connectivity plus per-symbol freshness/tradability fields, but omit `auth_accepted` and do not publish an approved universal threshold policy. | Combine server health with local tick aging. Default to blocking price-dependent actions while preserving clearly stale read-only data. |
| 8 | Subscribe/ACK/tick/batch shapes and identity fields | OPEN | MyProp's verified shape is `{type:'subscribe', symbols:[...]}` with raw/batch tick normalization already covered. Universal broker/account/epoch identity fields and ACK semantics are not guaranteed by the directory. | Use strict parsers, bind every socket to the captured mobile session identity, and reject explicit identity mismatches, duplicates, backward time, and lower sequence. |
| 9 | Devices and stream profile for 100-symbol local p95 <= 33 ms | OPEN | No approved iOS/Android device matrix or representative stream-rate fixture was supplied. | Keep instrumentation enabled and report measurements; do not claim the SLO until device evidence is attached. |

## Live observations

- Directory v1 and v2: HTTP 200, 11 records, raw arrays, no schema/config version and no positive enabled/active/license approvals.
- `myprop-trade`: TLS status reachable; upstream connected; 11 of 341 returned symbols were fresh/tradable in this point-in-time probe; `auth_accepted` absent.
- `gta_broker`: TLS status reachable; upstream/provider connected; 14 of 350 returned symbols were fresh/tradable in this point-in-time probe; `auth_accepted` absent.
- `achiever-financials`: TLS status reachable; upstream/provider disconnected; 0 of 331 returned symbols were fresh/tradable; `auth_accepted` absent.
- `orrnn-demo` and `testorrnn`: advertised TLS status probes were unreachable in the latest bounded check. The advertised `orrnn` status path returned 404. Demo preview therefore remains disabled.
- Multiple directory fixtures used cleartext `http/ws` and reserved raw IP addresses. They are directory data, not usable mobile endpoints.

## Broker-list diagnosis

The mobile request succeeds, but the current response is an unversioned raw array. Treating those records as selectable would authorize endpoints without explicit activation, licensing, version, or endpoint-provenance approvals. Mobile therefore separates identity display from routing authority: it may show sanitized broker names from the configured public directory, but those rows remain disabled, never trigger health probes or navigation, and cannot enter login/session routing. The retained Brokers launch cover is removed as soon as the full route mounts, so loading, error, empty, and identity-only states cannot remain hidden behind a blank shell.

Backend must publish either:

1. A `broker-directory.rich.v1` envelope with `schema_version`, `brokers`, and all required per-record approvals/config version, or
2. An approved signed broker-bound handoff/proxy contract for opaque records.

## Explicit backend / ops blockers

1. Publish and require a versioned directory schema or signed broker-bound handoff.
2. Provide an explicit trade-WebSocket endpoint (or a signed capability declaring that no trade socket is used) in the selected broker handoff.
3. Define per-broker feed credential mode, refresh behavior, and whether query-token authentication is permitted.
4. Sign off feed-health thresholds and scheduled-market-closed semantics.
5. Provide the ORRNN Demo preview symbol/auth/bootstrap policy and a healthy status contract.
6. Rotate/revoke `EXPO_PUBLIC_FEED_BROKER_TOKEN`; the exposed value must not be reused after repository cleanup.
7. Supply the iOS/Android performance-device and representative 100-symbol stream profile.

## Mobile implementation activity

This section distinguishes implemented fail-closed behavior from release acceptance. It is not a release-ready claim.

| Work item | Mobile status | Evidence / remaining work |
|---|---|---|
| P0-1 cross-broker credential/routing | FIXED IN CODE | Candidate selection no longer rebinds an authenticated route. Successful login/switch uses one atomic coordinator; latest-attempt, starting-epoch, cancellation, focus/unmount, and delayed-bootstrap provenance guards prevent late A/B responses from committing. |
| P0-2 tokens in AsyncStorage | FIXED IN CODE | Persisted preferences contain identity only; access, refresh, and feed credentials are migrated to and replaced in secure storage. Legacy preference token fields are scrubbed and secure-storage failures fail closed. |
| P0-3 exposed/sticky feed token | CODE FIXED; OPS BLOCKED | The tracked `EXPO_PUBLIC_FEED_BROKER_TOKEN` value is empty, new sessions replace the complete credential bundle, and a missing approved feed credential disables connection. Rotation/revocation must still be performed by ops outside this repository. |
| P0-4 fabricated/executable fallback prices | FIXED IN CODE | Authenticated mock merging and high-frequency REST live polling were removed. Candle/snapshot values are non-executable; order, chart, close, modify, and bulk actions re-check current live quote integrity at press/execution time. |
| Immutable session and epoch isolation | IMPLEMENTED | REST JSON commits, queued React quote commits, quote/candle writes, instrument metadata, positions, retained close tickets, order-symbol resolution, and persisted caches are bound to active provenance. Cache namespaces include a restart-unique nonce so cold-start epoch reuse cannot hydrate an older session. |
| Fail-closed routing | IMPLEMENTED; LIVE CONTRACT BLOCKED | Mobile accepts exact HTTPS/WSS URLs only from the approved versioned rich schema and revalidates persisted provenance. It does not synthesize domains, paths, ports, schemes, or opaque routes. The current live unversioned directory supplies sanitized, disabled identity rows only; none of its endpoint fields can authorize selection, health probes, login, or session routing. |
| Feed transport and lifecycle | IMPLEMENTED | Demand/refcount ownership remains in the quote feed. Strict bid+ask/source time, identity/order drops, quote-driven candles, stale server-candle protection, exact configured history routes, auth-close recovery, capped full-jitter reconnect, stable reset, bounded health retry, and background/foreground reconciliation are covered. |
| Exact symbol and execution integrity | IMPLEMENTED | Broker suffixes remain distinct across subscriptions, caches, instruments, positions, candles, and order candidates. The UI shows `Order Executed` only with both broker ticket and fill price; incomplete accepted responses remain confirmation-pending. |
| Health and outage behavior | IMPLEMENTED; POLICY BLOCKED | Broker-scoped banners and action guards use server plus local health. Retained rows are visibly `STALE`/`DELAYED` and non-executable; directory-card results refresh and expire. Without approved thresholds/auth metadata, mobile remains fail-closed. |
| Security and observability | IMPLEMENTED; OPS BLOCKED | Central redaction covers tokens, query values, auth/cookie headers, prefixed credential headers, console output, startup diagnostics, Sentry, telemetry, and support snapshots. Bounded events cover directory, bootstrap, epochs/host fingerprints, auth/refresh, socket/ACK/reconnect, health, drops, and blocked actions. External secret rotation is still required. |
| Performance instrumentation | IMPLEMENTED; MEASUREMENT BLOCKED | Bounded session-scoped source-to-receipt, receipt-to-cache, cache-to-row, and end-to-end aggregates expose p50/p95/p99, plus reconnect duration, live socket count, and list-commit counts. No device/SLO result is claimed without the agreed 100-symbol profile. |

## Automated verification

- `npm run typecheck`: passed.
- `npm test`: all 243 discovered TypeScript test files passed in 11 batches.
- `npm run test:interaction`: 160/160 passed.
- `npm run test:stability`: 273/273 passed.
- `git diff --check`: passed with no whitespace errors (Windows line-ending notices only).

These are compiler and automated contract results, not substitutes for the missing physical iOS/Android and representative 100-symbol performance evidence.

## Verification not yet supplied

- Ops rotation/revocation record for secret name `EXPO_PUBLIC_FEED_BROKER_TOKEN`.
- A backend response matching the versioned rich directory or a signed broker-bound handoff/proxy contract.
- Universal feed-auth refresh, status thresholds, trade-WebSocket capability, and demo-preview policy.
- Representative 100+ symbol device metrics with platform, device, build, network class, rates, and percentiles.
- Physical/simulator iOS and Android verification notes.
