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
