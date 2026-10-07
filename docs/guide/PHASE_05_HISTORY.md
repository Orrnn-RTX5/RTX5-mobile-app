# Phase 05 - History Module

## Objective
Deliver history parity for Positions, Orders, and Deals with sorting, filtering, and report entry.

## In Scope
- Segmented history tabs.
- Date range filtering (today, week, month, custom).
- Sorting menu fields and direction.
- Footer totals and summary values.
- Trade report entry action.

## Out of Scope
- Full report generation backend logic.

## Exact Implementation Tasks
1. Build segmented tab container for history kinds.
2. Implement history filters screen and date presets.
3. Implement sorting sheet and apply logic.
4. Render list rows per history kind with proper fields.
5. Implement totals footer and empty states.
6. Add report action entry and navigation hook.

## API Dependencies
- `GET /v1/history`
- Optional report metadata endpoint.

## Acceptance Checklist
- [ ] Positions/Orders/Deals views match screenshot behavior.
- [ ] Filter and sort state persist across tab switches.
- [ ] Totals footer values update correctly with filters.

## Test Checklist
- [ ] Unit: history filter and sort mapping.
- [ ] Integration: tab switch with active filters.
- [ ] E2E: open filters, choose range, verify resulting rows.
- [x] Unit: closed-trade date filtering accepts close-time aliases and ISO/seconds timestamp payloads.
- [x] Typecheck: History Net P/L drill-in renders per-closed-trade P/L rows from the closed-position history payload.
- [x] Typecheck: History Positions Trade Records render closed trades from closed-position payload aliases with an explicit `closed` row badge.
- [x] Unit: History deal query cache is scoped by active login and merges session deals with login-scoped fallback deals for demo parity.
- [x] Unit: History and Journal win-rate percentages use winning trades divided by decisive closed trades, excluding break-even rows from the denominator.

## Exit Criteria
- History flows are parity-complete and validated in E2E suite.

## Progress Notes
- 2026-06-18: Fixed History and Journal win-rate calculations to share one tested rule: net-positive trades count as wins, net-negative trades count as losses, and break-even closed trades are shown as trades but excluded from the win-rate denominator.
- 2026-05-15: Fixed demo-account closed trades missing from History Trade Records by making the History deals query active-login aware. The app now fetches session `/account/deals` and login-scoped `/deals/{login}` together, keeps account endpoint data authoritative on duplicates, and uses the login fallback so demo accounts rebuild closed positions the same way real accounts do.
- 2026-05-05: Updated the closed-position history API adapter to page through the closed-trade endpoint until all available records are loaded, with duplicate-page protection for backends that ignore `offset`. The History Positions screen and Net P/L drill-in now receive the full closed-trade history payload instead of only the first page, and the background refresh interval was relaxed so all-page history polling does not run every few seconds.
- 2026-05-05: Hardened the History Positions `Trade Records` list so closed trades render from common backend payload shapes (`closed_positions`, `closedTrades`, `records`, `rows`) and common MT5 close-field aliases. Closed position rows now show a visible `closed` badge plus close-price and realized P/L details in the main History list.
- 2026-05-05: Added a `Closed Trade P/L` section to the History Net P/L drill-in. Tapping the Net P/L metric now opens a detail screen that includes each closed trade's symbol, side, volume, ticket, open-to-close price, close time, and net closed P/L instead of only showing aggregate summary cards.
- 2026-04-17: Switched the History Positions view and the History Net P/L drill-in from live open-position data to closed-position history data so the History tab only reports closed trades for the selected range.
- 2026-04-17: The History tab account summary now keeps `Balance` always visible while the remaining summary fields are controlled by a persisted show/hide toggle. The expanded section also includes `Symbol` using the current History filter scope (`All symbols` today), and the chosen visibility state is restored from local device storage.
- 2026-04-20: Moved the History Net P/L detail screen off the shared stack header and onto a fixed safe-area header, and hid the `history/filter?view=net-pnl` route header so the centered title no longer drifts after navigation-shell changes.
- 2026-04-20: Fixed History range application for closed-position-based P/L. The History Positions view and Net P/L drill-in now derive an effective date window from the saved range label plus explicit timestamps, so the default `Last 6 months` state no longer behaves like all history until the user manually reopens the filter. The deals query now uses the same effective-range fallback.
- 2026-04-20: Adjusted the History account summary header layout so `Balance` and the show/hide chevron sit together on the left while the live balance amount renders on the right side of the row instead of underneath the label, and increased the right-side currency label size for clearer balance display.
- 2026-04-20: Fixed Trade Records row IDs so the visible card label no longer reuses the internal `hp/hd/ho` row key. History rows now resolve a dynamic ticket label from real API fields (`ticket`, `position_ticket`, `order_ticket`, `id`) and fall back to a stable record identity when a ticket is missing, preventing `hpundefined` from appearing in the UI.
- 2026-04-22: Expanded the History account-summary collapse toggle from the `Balance` label to the full top balance row, so tapping anywhere across that highlighted row now hides or restores the lower summary details while keeping the balance visible.
- 2026-04-25: Refined the History balance summary toggle so the full `Balance` row still controls hide/show, including taps on the label or USD value, but the text no longer has a pressed-opacity trigger effect.

