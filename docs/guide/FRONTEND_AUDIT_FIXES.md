# Frontend audit corrections - 12 October 2026

These changes are local source fixes. They do not publish an OTA, change backend endpoints, or upgrade packages.

## Implemented

- Economic calendar: removed generated production events; initial data is verified cached feed data only. Loading, failure, retry and dated stale-cache states are explicit. Concurrent requests remain coalesced and response bodies remain timeout-protected.
- History: separate loading/error/empty states, unknown balance placeholder, visible incomplete-history notices, retry and date-range controls. The detailed closed P/L screen also exposes query errors and partial history.
- Deal client: validate records and finite numbers, accept documented numeric strings, model optional position tickets correctly, and return page-cap/repeated-page/legacy-fallback completeness metadata.
- Chart history: 30-second fallback polling, overlapping incremental reads, five-minute full reconciliation, ticket deduplication, and a bounded 50,000-row cache. Existing broker/session scoping and realtime invalidation remain intact.
- Help: the unconnected question action is explicitly unavailable before typing. No support API or successful submission is invented.
- OTA UI: coalesced reload calls, rejection/retry handling, shared theme tokens, all 15 supported languages, accessible progress, and deferral before installation begins.
- Chart boundary: local inline documents use about:blank, document navigation is restricted, bridge messages are bounded and validated, and existing per-chart context checks remain in place.
- Accessibility: volume stepper/preset labels and states, FAQ search label, and readable OHLC summaries for main and auxiliary chart headers.
- Persistence: nearby candle writes are batched; device writes remain serialized across session changes; failed writes release their signature guard for later retry.
- Structure: production calendar loading moved to src/api/economicCalendar.ts; live QuoteItem/PositionItem models moved to src/domain/tradingModels.ts. Compatibility exports preserve existing consumers. Web chart styles are separated and quote-header props are typed.
- Local development: restored all new helper modules referenced by imports, including src/query/chartDealRefresh.ts, and verified the Android Metro development bundle.

## Remaining limitations and recommendations

- Physical Android/iOS checks require devices. No Android device was connected over adb during verification.
- The question form needs a documented support submission contract before it can be enabled.
- Large native chart controllers still need further incremental decomposition. This change extracts shared boundaries and presentation responsibilities; it does not replace the complete chart implementation.
- Unreferenced component candidates were not deleted because some contain pre-existing local work. No package removal was performed.
- A frontend OTA cannot add missing native file-picker capabilities to older installed binaries; those require compatible Android/iOS binaries.

Regression coverage includes malformed deal payloads, partial pagination, chart refresh/merge bounds, navigation/message validation, batched write cancellation/failure, OTA reload coalescing, calendar request lifecycle, and OTA translation coverage. Final build/test evidence is stored in .codex-artifacts/frontend-audit-fixes-20261012.

## Final verification

- All 493 test files passed.
- TypeScript passed.
- Android and iOS localhost Metro development bundles returned HTTP 200.
- All new imported helper files are present in the app working tree.
- No OTA was published and no packages were installed or upgraded.
- Physical-device interaction checks remain pending.
