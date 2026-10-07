**Comparison Target**

- Source visual truth: `../artifacts/area-chart-audit/02-tradingview-live-5-days.png` (1878 x 949 px, positive compressed history) and `../artifacts/area-chart-audit/tradingview-initial.png` (799 x 839 px, negative interval).
- Final Android evidence: `../artifacts/area-chart-audit/05-post-cold-area-history.png` (positive AUDJPY), `../artifacts/area-chart-audit/15-second-cold-red-live-line.png` (negative XAUUSD with aligned live guide/badge), and `../artifacts/area-chart-audit/14-second-cold-current.png` (Quotes direction), all 1080 x 2340 px.
- Combined comparison inputs inspected after rendering: `../artifacts/area-chart-audit/10-comparison-green-history.png` (1100 x 2232 px) and `../artifacts/area-chart-audit/19-final-red-comparison-full-axis.png` (1100 x 2352 px).
- Viewport: connected Android phone at physical 1080 x 2340 px and density 440. TradingView is a desktop reference, so the audit compares contour density, direction color, gradient behavior, and live-series visuals rather than unrelated desktop/mobile chrome.
- Normalization: source and implementation chart regions were cropped without altering their contours, scaled with bicubic interpolation while preserving each crop's aspect ratio, labeled, and stacked in one comparison image.
- State: light theme, M1 Area, positive AUDJPY and negative XAUUSD. The final cold-reload Quotes capture shows AUDJPY at +0.13% and XAUUSD at -0.77%.

**Findings**

- No actionable P0/P1/P2 mismatch remains for the requested Area behavior.
- Area now expands according to the selected candle timeframe. M1 requests a bounded 500 genuine closes instead of stretching the initial 120-bar window; coarser timeframes use progressively smaller bounded targets. No interpolation, jitter, smoothing, or fabricated price points are used.
- The denser Area-only viewport compresses those closes at subpixel logical spacing, producing the finer irregular contour visible in the TradingView reference. Other chart types retain their existing spacing/history behavior.
- Positive and negative Area states use the selected performance direction consistently. In the final negative XAUUSD capture, the stroke, fill, horizontal live guide, and right-axis price/countdown badge are all red.
- The vertical inspector remains visible and price-snapped in Area. Evidence includes the final live-edge selection at 09:34 and the earlier moved selection at 03:12 after history expansion.
- [P3] Exact peaks, troughs, fill coverage, and time span differ because the captures use different instruments, source intervals, and phone/desktop aspect ratios. This is genuine data/state variation rather than a rendering defect.

**Required Fidelity Surfaces**

- Fonts and typography: existing RTX5 chart header, axes, live badge, and inspector typography remain legible and internally consistent.
- Spacing and layout rhythm: toolbar, price-axis reservation, trade footer, navigation, and live-edge gap are preserved. Only Area receives deeper history and denser compression.
- Colors and visual tokens: positive remains green; negative remains red. Area live guide and custom right-axis badge now follow the same performance color as the Area stroke/fill.
- Image quality and assets: the 1 CSS px straight close-to-close outline is crisp at device density. No raster assets or approximate graphics were added.
- Copy and content: unchanged. Inspector and live badges continue to show exact prices and timestamps/countdown values.

**Full-View Evidence**

- `../artifacts/area-chart-audit/05-post-cold-area-history.png`: expanded positive AUDJPY M1 Area after a full empty-cache bundle.
- `../artifacts/area-chart-audit/15-second-cold-red-live-line.png`: final expanded negative XAUUSD M1 Area with red live guide and red price/countdown badge.
- `../artifacts/area-chart-audit/14-second-cold-current.png`: final Quotes percentages used to verify the direction states.
- `../artifacts/area-chart-audit/12-xau-area-latest.png`: moved inspector on an older XAUUSD candle after the expanded history arrived.

**Comparison History**

1. The initial implementation showed about 120 M1 closes over roughly two hours, producing coarse triangular movements when stretched across the tall phone plot.
2. Area-only history targets and subpixel spacing were added across the full chart and divided previews. M1 now displays about 500 real closes (roughly eight hours in the captured market), while viewport restoration preserves deliberate user pan/zoom.
3. The first empty-cache Android reload bundled 3295 modules and proved the expanded green/red contours. Its combined comparison exposed one remaining mismatch: a red Area still had a green live-price guide and badge.
4. The Area live-price color path was aligned with the resolved performance direction. A second empty-cache reload bundled all 3295 modules in 100491 ms, logged `root.mounted`, and the final XAUUSD screenshot/comparison were recaptured.

**Verification**

- TypeScript: `npm run typecheck` passed.
- Focused Area/history/preview suites: 25/25 passed after the final color correction.
- Focused WebView bridge contracts: 4/4 passed, including Area rendering, recent viewport, viewport preservation, and live-price color behavior.
- Comprehensive focused chart/candle suite: 164/164 passed. The only failure in the broader pre-existing bridge file remains an unrelated stale loading-overlay source assertion.

**Implementation Checklist**

- [x] Load more genuine candles according to the selected timeframe without adding a date-range selector.
- [x] Never synthesize, smooth, interpolate, or jitter Area data.
- [x] Apply deeper history and dense compression only to Area.
- [x] Preserve explicit user pan/zoom when older candles prepend.
- [x] Keep positive and negative geometry identical apart from direction color.
- [x] Keep Area stroke, live guide, and right-axis badge color aligned.
- [x] Keep the movable price inspector functional.
- [x] Verify Quotes direction, green Area, red Area, and a full empty-cache Android reload.

**Follow-up Polish**

- None required for this request.

final result: passed


---

**Demo Account screenshot implementation ? 2026-10-06**

**Comparison Target**

- Source visual truth: the two Demo Account screenshots attached to the user's request, both 1080 x 2400 physical pixels. The same legacy top layout was also captured locally at `../.codex-artifacts/logout-shrink-20261006/updated.png`; it is used on the left of the combined comparison. The original chat attachments have no local image path.
- Rendered implementation: `../.codex-artifacts/demo-layout-20261006/top-final.png` and `bottom-v2.png`.
- Full-view combined comparison: `../.codex-artifacts/demo-layout-20261006/top-comparison.png` (legacy left, current right).
- Focused header/field comparison: `../.codex-artifacts/demo-layout-20261006/fields-comparison.png`.
- Viewport: connected realme RMX3521, Android 14, Expo Go; 1080 x 2400 physical pixels, density 480 (3x), equivalent 360 x 800 dp including system bars. Both comparison inputs retain their original dimensions and density. No browser frame or synthetic device chrome was added.
- State: portrait, dark theme, selected Orrnn broker, empty Demo Account form; top and scrolled-to-bottom captures. Screenshot content differs intentionally where the new registration contract does not expose legacy policy defaults.

**Findings and Comparison History**

1. [P1, fixed] The first native capture (`open.png`) contained a second status-bar-height gap above the header. The root auth modal now extends under native system bars and the screen applies its safe area once. `top-v3.png` and `top-final.png` confirm the reference header/body alignment.
2. [P2, fixed] Initial footer spacing left an additional 12 dp below Register (`bottom-v1.png`). Idle padding was reduced from 24 dp to 12 dp plus the bottom inset. `bottom-v2.png` places Phone, Group, terms, and Register at the same vertical positions as the second source screenshot.
3. All requested rows are present: first name, optional last name, email, phone, master password/strength, currency/leverage, initial balance, origin broker, group, terms, and Register.
4. Expected contract differences: Phone reads ?Not required?; currency, leverage, and balance display ?--? because the new API assigns those values and does not publish a demo-group policy here. Origin broker uses the exact selected broker ID. Group reads ?Assigned automatically.? These rows are read-only and are excluded from the registration payload. Legacy USD/10000/origin defaults are not represented as actual server policy.
5. Expected flow difference: the first valid Register tap reveals required password confirmation. Only the later confirmed action can invoke registration. An error-only Login recovery link remains available without adding a footer to the pristine reference layout.
6. Keyboard interaction check exposed a newly mounted confirmation field below the keyboard (`confirmation-keyboard.png`). The screen now retries focused-field scrolling after keyboard layout and field layout, and ignores missing coordinates. Code review found no focus-remount issue in the final callbacks. The final uninterrupted physical keyboard recheck remains unverified: phone focus and scroll state changed between captures, and an async request to leave the phone untouched was unanswered at report time. This is a residual interaction-validation gap, not evidence that the final keyboard fix passed on-device.

**Required Fidelity Surfaces**

- Fonts and typography: existing native font family, 17 dp centered header, 14 dp labels, 16 dp editable values, and optional-label weight match the reference in the combined and focused captures. Long values retain single-line truncation in policy rows.
- Spacing and layout rhythm: 24 dp horizontal form spacing, 48 dp fields, 8 dp corners, 11 dp row gaps, paired Currency/Leverage, and the 54 dp action match the source. The two-column section collapses for narrow windows or large text. Large-text/landscape device checks were not performed.
- Colors and visual tokens: existing dark background, raised field surfaces, gray borders/icons, and blue gradient/links are retained. The reference button was disabled by its legacy group state; the current button is brighter when signup is available, an expected state difference.
- Image quality and asset fidelity: the same existing Ionicons vector family is used. No generated images, substitutes, dependencies, or native configuration were introduced.
- Copy and content: all requested field labels and ?Register a demo account? are present. Server-owned and unsupported values use the explicit states described above. Confirmation is shown only when requested.

**Verification**

- `npm run typecheck`: passed after final source edits.
- Focused authentication, flow, trading gate, keyboard-source, and responsive suites: 37/37 passed. The keyboard-source suite covers existing legacy source contracts; it is not an automated native UI test of the new confirmation step.
- Physical Android: top and bottom layout, typing, password strength, scrolling, and the first Register action exercised. No account creation or trade was submitted.
- iOS, landscape, large-text, legal-link destinations, backend signup, and final uninterrupted keyboard retry were not validated in this task.
- Code review confirmed strict registration payload and duplicate-submit/authoritative confirmation validation remain in the shared coordinator. Recovery Login and external-error precedence were retained after review.

**Implementation Checklist**

- [x] Show every screenshot row in the active Demo Account screen.
- [x] Match reference header, field geometry, pairing, terms, and action layout on Android.
- [x] Keep the current broker-scoped registration contract and confirmation validation.
- [x] Preserve existing local changes and capture a task-only diff.
- [x] Pass TypeScript and focused regression checks.
- [ ] Repeat the final keyboard-confirmation interaction on an uninterrupted device.

The visual result below applies to the requested empty top/bottom screenshot layouts. It does not certify the outstanding interaction/device checks.

final result: passed
