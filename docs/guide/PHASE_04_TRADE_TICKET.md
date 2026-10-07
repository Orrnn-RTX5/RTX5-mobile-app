# Phase 04 - Trade and Order Ticket

## Objective
Replicate Trade tab and order ticket flows, including bulk operations and one-click trading consent.

## In Scope
- Trade header summary metrics.
- Positions list with live PnL updates.
- Position context actions (close, modify, trade, chart, bulk ops).
- Bulk operation menus.
- One-click terms modal and acceptance state.
- Market and pending order ticket variants.

## Out of Scope
- Backend matching engine behavior.
- Risk engine policies beyond UI validation.

## Exact Implementation Tasks
1. Build account summary card linked to `AccountSnapshot`.
2. Build positions list with grouped and sortable rows.
3. Implement long-press action sheet on positions.
4. Implement bulk operations sheet variants.
5. Implement one-click terms modal and persisted consent.
6. Build order ticket form states for all supported order types.
7. Implement SL/TP, expiration, fill policy, and lot-step controls.
8. Wire submission flow and user-facing error/success states.

## API Dependencies
- `GET /v1/account/snapshot`
- `GET /v1/positions`
- `POST /v1/orders`
- WebSocket events: `position.update`, `order.status`, `account.snapshot`

## Acceptance Checklist
- [ ] Trade tab metrics and list parity complete.
- [ ] All order type screens from parity map are implemented.
- [ ] One-click consent gate blocks order shortcut until accepted.
- [x] Bulk operations menu options are displayed per scope.

## Test Checklist
- [ ] Unit: order ticket validation rules.
- [x] Unit: chart/order-ticket/web market trade buttons keep visible BUY/SELL labels, price source, handler side, and order payload side aligned.
- [x] Unit: order execution graph keeps uniform spacing between all horizontal dotted guides.
- [x] Unit: order execution graph keeps right-side price labels close to the grid edge.
- [x] Unit: order execution graph renders a right-side price label for the lowest dotted guide.
- [x] Unit: order execution graph renders generated bid/ask traces with rounded pencil-style stroke treatment.
- [x] Unit: order-ticket buy/sell controls keep the busy visual state on only the pressed side during submission.
- [x] Unit: order-ticket success feedback uses the compact chart-style done strip while rejected orders keep the detailed error modal.
- [x] Unit: live position price metrics ignore quotes without a recent receive/tick timestamp, while accepting recently received bid/ask updates even when backend feed time is old.
- [x] Unit: account metrics accept live websocket alias fields and position mapping normalizes broker symbols plus common live-update aliases.
- [x] Unit: position mapping preserves a stable symbol and ticket when partial close-screen updates carry `undefined` symbol sentinels or alternate ticket aliases.
- [x] Unit: Trade-tab position merging keeps other symbols visible when a scoped live update arrives and rejects symbol-less placeholder rows.
- [x] Unit: Trade-tab position state deduplicates colliding order/position ticket rows before rendering.
- [x] Unit: close-position and close-by actions optimistically remove rows immediately, suppress in-flight snapshot re-adds, and roll back on broker rejection.
- [x] Unit: Trade summary keeps Balance as settled cash while deriving live Equity from floating P/L in the expanded Equity row.
- [x] Unit: Trade account metrics merge partial websocket fields with stored account data and keep Equity, Free Margin, and Margin Level formula-derived from the freshest floating P/L.
- [x] Unit: open-position net P/L and account floating P/L include swap and commission exactly once during live tick recalculation.
- [x] Unit: market order symbol candidates prefer cached broker symbols without brute-forcing hardcoded suffix POST attempts.
- [x] Unit/device: shared Android ActionSheet geometry keeps the Trade bulk operations sheet at one settled position when opened.
- [x] Unit/typecheck: Trade Bulk opens through the shared Quotes-style ActionSheet path and limits menu actions to the approved broad close scopes without hardcoded symbol rows.
- [ ] Integration: trade summary updates on position events.
- [ ] E2E: open position menu, perform action, submit pending order.

## Exit Criteria
- Trading UI flows are functionally complete with no blocking defects.

## Progress Notes
- 2026-06-18: Audited swap handling across open positions, row live P/L, and account floating/equity. Position mapping already treats backend `profit` as price profit and stores net row P/L as `profit + swap + commission`; the account-level tick recalculation now preserves swap/commission for the ticked symbol instead of dropping them, and the legacy positions query mapper now retains `commission` alongside `swap` so later live recalculation cannot miscalibrate net P/L.
- 2026-06-18: Audited Balance, Equity, Margin, Free Margin, and Margin Level calculation paths. Trade now merges live websocket account fields per metric instead of switching the whole summary to live data after one field arrives, prevents tick-derived Equity from using the zero balance default before settled Balance hydrates, accepts common bootstrap aliases (`used_margin`, `free_margin`, `floating_pnl`), and derives Equity/Free Margin/Margin Level from the freshest floating P/L plus broker Margin.
- 2026-06-18: Clarified the Trade summary account-value display. Balance remains the broker-settled cash balance and no longer has to carry live open-position P/L; Floating P/L remains the collapsed header value, while the expanded Equity row derives Equity/Free Margin from Balance + Credit + current Floating P/L when the account stream sends floating P/L ahead of a fresh equity field.
- 2026-06-18: Fixed slow close-position feedback. The Close Position and Close By submit paths now optimistically remove affected positions from the Trade store and return to Trade immediately, while the broker close request runs in the background. Pending-close tickets are suppressed from websocket/REST snapshots for 60 seconds to prevent flicker, then finalized on success or restored with an error alert on broker rejection.
- 2026-06-09: Replaced the order-ticket success execution popup with the same compact symbol/side/volume/done confirmation strip used by chart one-click trading. Market and pending order successes now avoid the large modal; broker/API rejections still use the detailed error modal.
- 2026-05-29: Simplified the Trade Bulk operations ActionSheet to the approved close scopes only: close all, profitable, losing, and buy positions. The sheet no longer offers sell-side or runtime symbol-specific close rows such as BTCUSD or USDJPY, and the shortened menu now uses content-height instant ActionSheet sizing so removed rows do not leave extra blank space.
- 2026-05-26: Rechecked the buy/sell submission flow against the live V2 contract. Market BUY/SELL remains on `POST /api/v2/orders`, while order-ticket pending limit/stop submissions now use `POST /api/v2/orders/pending` with the required `price` field instead of sending pending fields through the market-order wrapper where they were dropped.
- 2026-05-26: Aligned the Trade Bulk launcher with the Quotes symbol tap sheet behavior. The Bulk button now opens the shared adaptive instant ActionSheet through the immediate action path, position-menu handoff schedules the next sheet after the current sheet closes, and symbol-scoped bulk rows are generated from current positions instead of a hardcoded symbol.
- 2026-05-25: Rechecked the Trade Bulk Operations dropdown with before/after ADB screenshots. The shared adaptive ActionSheet floor now prevents the short bulk action list from shrinking to content and dropping low on Android; the observed sheet top moved from y=887 before the fix to y=650 after the fix while keeping the action list and Cancel row stable.
- 2026-05-23: Shared Android ActionSheet geometry now waits out the transient Modal/status-bar frame before painting, so Trade bulk and position action sheets no longer appear and then drop. ADB video verified Bulk Operations stays fixed at y=929 across all visible recorded frames.
- 2026-05-20: Fixed duplicate React key warnings after market execution when the backend returns the same timestamp-style value for `order_ticket` and `position_ticket`. Optimistic order inserts now go through the position upsert path, the positions store deduplicates ticket collisions, trade/bulk/close-by render helpers consume deduped position arrays, and focused unit tests cover the `1774502954924` duplicate-ticket shape.
- 2026-05-15: Reduced buy/sell response latency in the market order path by removing the cold `/instruments` preflight from the first order POST, caching the last accepted broker symbol per broker/base symbol, and replacing the previous hardcoded suffix POST loop with a single API-catalog fallback only after the server reports a market-data/symbol miss. Added a focused unit test for the candidate order and no-brute-force behavior.
- 2026-05-05: Updated the shared live order execution graph so the final dotted guide uses the same vertical interval as the rest of the price grid, tightened the horizontal gap between right-side price labels and grid lines, added the missing right-side value for the lowest dotted guide, and softened generated bid/ask traces with a rounded pencil-style stroke treatment. This applies to the market order ticket and to the shared graph reused by chart trade SL/TP order tabs.
- 2026-05-05: Fixed market buy/sell visual feedback so tapping one side no longer makes the opposite side look tapped. The order ticket now keeps duplicate-submission locks in place while only the pressed price/action side receives busy opacity and accessibility busy state.
- 2026-05-05: Updated the trade success feedback so BUY and SELL executions were visually distinct in the execution modal. This was later superseded by the compact done strip for order-ticket success feedback.
- 2026-05-05: Hardened the close-position screen against partial live position updates that briefly contain `undefined` symbol sentinels or alternate ticket keys. The screen now keeps the last valid selected position visible, rejects invalid close tickets before submit, and reads the current account token at press time so the Close Position CTA can execute after delayed account hydration.
- 2026-05-05: Fixed Trade-tab position flicker by treating live WebSocket position arrays as merge-only unless they are explicitly marked as full snapshots. Scoped current-symbol updates no longer replace the full open-position list, and symbol-less/placeholder live updates are filtered before they can render as `UNKNOWN`.
- 2026-05-05: Tightened Trade-row touch handling so normal vertical scrolling and row taps are no longer captured by the horizontal swipe-action gesture. Swipe actions now require stronger horizontal intent; destructive actions stay on normal press release while Modify Position and the expanded `SL / TP` shortcut open immediately on touch-down.
- 2026-03-24: Fixed trade-flow account resolution so open positions, close, and modify actions no longer depend on `liveAccountState.login` being hydrated before the Trade tab loads.
- 2026-03-24: Hardened the order/position flow to refresh using the resolved MT5 login after buy, sell, close, and modify actions, matching the live `/api/v2/orders` and `/api/v2/positions/{login}` contract.
- 2026-04-09: Normalized legacy mock-era symbol aliases such as `BTCUSDm` and `XAUUSDm` to the live backend symbols (`BTCUSD`, `XAUUSD`) across order submission, instrument metadata, and symbol-driven quote/detail flows after live verification showed the trading engine only accepts the unsuffixed symbols for active YoForex accounts.
- 2026-04-09: Centralized trader-tab error classification so order placement, close, close-by, modify, one-click shortcuts, and Trade-tab position refresh now surface whether the failure came from frontend state, API contract/routing, session expiry, rate limiting, or backend/server availability instead of falling back to generic execution errors.
- 2026-04-11: Fixed the V2 account websocket path so the app subscribes with the resolved MT5 login on `metrics.{LOGIN}` and `positions.{LOGIN}`, even when booting from legacy persisted sessions whose `accountDetails.id` still held a non-MT5 user id.
- 2026-04-11: Stopped the Trade header and position rows from overriding authoritative websocket account metrics and live position P/L with local quote-based recalculations; the UI now renders the server-provided balance, equity, margin, free margin, margin level, floating P/L, and per-position net P/L.
- 2026-04-11: Hardened websocket position upserts so partial `positions.{LOGIN}` payloads merge into the existing local position instead of wiping symbol, volume, open price, or net P/L fields when the backend only pushes ticket-level profit updates.
- 2026-04-17: Added a persisted shared `tradeVolume` preference and made the order-ticket and chart quick-trade lot controls directly editable while still respecting instrument min/max/step metadata.
- 2026-04-17: Replaced the bulk-operation header with a constrained fit-to-width title so long bulk mode labels stay centered on smaller phones instead of overflowing.
- 2026-04-20: Moved the bulk-operation detail screen off the shared stack header and onto a fixed safe-area header with balanced left/right slots so the dynamic bulk titles stay centered reliably instead of drifting back after later navigation-shell changes.
- 2026-04-20: Reworked the modify-position SL/TP flow into an MT5-style transparent bottom sheet with a draggable handle and continuous adjustable height, keeping the Trade screen visible behind it while allowing users to pull the sheet up or down and leave it at the height they want.
- 2026-04-20: Switched the modify-position sheet drag from JS-thread height resizing to a fixed-height transform-driven gesture path, which keeps the SL/TP bottom sheet movement noticeably smoother during pull-up and pull-down interactions.
- 2026-04-20: The Trade tab now shows the active account currency alongside floating P/L in the summary header and alongside each position row's right-side P/L value, so the live profit/loss numbers no longer appear as bare amounts without currency context.
- 2026-04-20: The Trade tab's floating P/L header now renders on one line with the label on the left and the live value on the right, and both that header value and each position row's right-side P/L now clamp to exactly two digits after the decimal while still showing the active account currency.
- 2026-04-21: Fixed the Trade tab floating P/L header so, once the current account's open-position snapshot has synced, it derives the aggregate floating value from the locally authoritative open-position list; closing a trade or close-by now updates the header instantly instead of waiting for the next account-metrics websocket tick.
- 2026-04-21: Rebased Trade-tab live P/L rendering on the quote-tick stream so the floating header and each position row's top-right P/L now move immediately with the same bid/ask ticks that update the row's open-to-current price arrow; closing a trade still removes its contribution instantly because the aggregate is recalculated from the remaining open positions.
- 2026-04-21: Hardened the Trade summary live-metrics path to subscribe to both `metrics.{LOGIN}` and `account.{LOGIN}`, unwrap wrapped account metric payloads, and derive equity/free margin/margin level from the freshest floating P/L when quote ticks arrive ahead of the account-summary stream.
- 2026-04-21: Reduced Trade-row quote latency by preconnecting the quotes websocket right after login and moving quote-cache flushes off the timer queue onto a microtask, which removes the extra frontend delay between receiving a bid/ask tick and repainting the open-to-current arrow price.
- 2026-04-21: Isolated the Trade summary's all-symbol quote subscription inside the header component so the parent Trade screen no longer reruns on every quote tick; only the header aggregate and the affected position rows now repaint during live price movement.
- 2026-04-21: Switched each Trade row from the shared quote-store selector path to a direct single-symbol quote-tick listener, so the open-to-current arrow price and per-row floating P/L update immediately from the websocket tick without waiting on the global quote-cache projection step.
- 2026-04-21: Reworked the Trade-row single-symbol quote hook again after regression analysis showed the direct per-row websocket tick-listener path could accumulate too much JS work across many open positions and eventually stall live updates/navigation. Rows now use a store-backed single-symbol selector while keeping the faster websocket preconnect/microtask quote path intact.
- 2026-04-22: Removed the Trade tab's manual pull-to-refresh affordance because open-position state already hydrates on entry and then stays current through the positions store plus live account/order websocket updates. This avoids an extra manual refresh path on the main trading screen while preserving live updates.
- 2026-04-22: Kept the Trade tab route mounted while `/trade/*` child screens such as `/trade/bulk` are pushed. The earlier blur-unmount wrapper could collapse the live tab shell during the same navigation transition and produce the visibly shrunken bulk-screen presentation.
- 2026-04-22: Hardened `Close Position`, `Close By`, and the `Close By` request CTA with immediate guarded press handling. Those trade-closing actions now lock on first touch so duplicate taps cannot submit twice, and they react without waiting for slower repeat-press windows.
- 2026-04-22: Reworked the Trade-row swipe action icons onto guarded `Pressable` controls with immediate touch-down activation, larger hit areas, and pressed-state feedback. The row-level `Close Position` and `Close By` icon buttons now use the same faster single-trigger touch pattern as the dedicated close screens instead of the older gesture-handler touchable path.
- 2026-04-22: Fixed the order-ticket `BUY` / `SELL` market-order buttons so they no longer rely only on React's async `pendingSide` render state to block re-entry. The ticket still applies an immediate in-memory tap lock on first completed press, but the submit actions now fire on normal press release instead of touch-down so the CTA no longer feels like it shrinks and triggers before the gesture finishes.
- 2026-04-22: Replaced the order-ticket order-type dropdown with a full horizontal rail from `Market Execution` through `Sell Stop Limit` and added one shared live SVG graph that stays the same across every order-type tab. The graph now streams live bid/ask data consistently across the full tab set while keeping direct submission limited to market execution on this ticket.
- 2026-04-22: Added a dedicated persisted collapse state for the Trade tab summary card and expanded the toggle target to the full `Floating P/L` header row. Tapping that row now hides or restores the lower account metrics while keeping the live floating P/L value visible at all times.
- 2026-04-25: Refined the Trade tab summary toggle so the full `Floating P/L` row still controls hide/show, including taps directly on the label or USD value, but the text no longer has its own nested press target or pressed-opacity trigger effect.
- 2026-04-22: Tightened the order-ticket order-type rail spacing by reducing both inter-pill gaps and pill-side padding, so the `Market Execution` through `Sell Stop Limit` tab strip reads more compactly without changing the selection or centering behavior.
- 2026-04-22: Tightened that order-type rail spacing again by trimming the remaining horizontal gap and tab-side padding, so more of the `Market Execution` to `Sell Stop Limit` strip fits on screen at once.
- 2026-04-22: Reworked the pending order-ticket preview graph into an interactive trigger-price control. Pending tabs now show a dotted draggable trigger line over the live bid/ask graph, dragging that line updates the pending trigger price preview, and stop-limit tabs keep their companion stop-limit preview price aligned from the same trigger move.
- 2026-04-27: Chart and order-ticket market trade execution now use a shared typed `buy`/`sell` side contract, explicit button-to-payload mapping, symbol-remounted chart trade rows, and `[TRADE-BUTTON-PRESS]` / `[TRADE-PAYLOAD]` / `[TRADE-RESPONSE]` diagnostics so first BUY actions after symbol changes cannot be inverted into SELL.
- 2026-04-28: Re-hardened market trade side mapping after device review. Chart quick-trade buttons now use a local tap lock around the pressed typed side, web chart SELL/BUY prices were corrected to Bid/Ask respectively, and the order-ticket price/execution buttons are rendered from typed side descriptors so the visible label, handler side, loading state, route side, and API payload cannot invert.
- 2026-04-28: Hardened chart quick-trade touch routing so hidden footer/sheet trade rows cannot receive touches, and all mounted chart trade rows share one tap lock. A BUY tap now blocks any overlapping SELL responder from firing during sheet/footer transitions, and the opposite path is blocked the same way.
- 2026-04-28: Tightened the order-ticket market submit guard so the pressed side is recorded before diagnostics and submit work begins. If a BUY tap is already active, any overlapping SELL responder now exits as an ignored locked press and cannot enter the order payload path.
- 2026-04-28: Added a chart-symbol freshness guard to quick-trade buttons. After switching symbols, any stale button instance from the previous symbol is disabled and ignored with `reason: stale-symbol`, so the first EURUSD trade after leaving BTCUSD cannot be submitted by an old BTCUSD responder.
- 2026-05-01: Live position metrics, chart price helpers, and one-symbol quote listeners now distinguish backend feed time from frontend receive time. Recently received bid/ask messages can update trade pricing, while quotes with no recent receive/tick timestamp still fall back to the position snapshot.
- 2026-05-01: The account WebSocket router now accepts wrapped account/position payloads (`data`, `payload`, nested `position`, and snapshot arrays), common metric aliases, broker-suffixed position symbols, and close-like lifecycle events. Trade summary metrics and per-symbol position rows can update from the live stream without waiting for a manual REST refresh.
