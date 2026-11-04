# RTX5 OTA Update Information

> **Current live production store builds & XPrem OTA: `1.1.62` for Android (Play Store `.aab` + Internal `.apk`) and iOS (App Store `.ipa`).**
>
> Built, published, and verified on 2026-11-03 (Asia/Calcutta) at the user's explicit request to produce `1.1.62` Play Store and App Store production builds and synchronize XPrem OTA `1.1.62` across all active Android and iOS runtimes.

## Current Production Store Builds & XPrem OTA - `1.1.62`

### 1. Native Production Store Builds (`1.1.62` — SDK 55 / React Native 0.83.4 / React 19.2.0)

| Field | Android Play Store (`.aab`) | iOS App Store (`.ipa`) | Android Internal (`.apk` — Same Runtime) |
| --- | --- | --- | --- |
| App Version (`app.json` & `package.json`) | `1.1.62` | `1.1.62` | `1.1.30` (OTA displays `1.1.62`) |
| Store Version Code / Build Number | `versionCode: 42` | `buildNumber: 37` | `versionCode: 40` |
| EAS Profile / Distribution | `production` / `STORE` | `production` / `STORE` | `preview` / `INTERNAL` |
| Build Status | **FINISHED** (`658s`) | **FINISHED** (`401s`) | **FINISHED** |
| EAS Build ID | `84e7a097-c743-428e-9f98-6c1625ce598b` | `7bdd5a75-485f-42c9-9dd1-0e60a6b62f07` | `db4a69d2-6388-4a58-88fa-63e6d13879de` |
| Native Runtime Version (`fingerprint`) | `797dea98b258410dcbd80a727586f6af607da932` | `44d9c3b64f5b6fd221136b861e597bdbf62da208` | `797dea98b258410dcbd80a727586f6af607da932` |
| Embedded Channel (`expo-channel-name`) | `yoforex-rtx5` | `yoforex-rtx5` | `yoforex-rtx5` |
| Embedded XPrem App ID (`expo-app-id`) | `b83d7191-d5ac-4b58-b850-8979759fe290` | `b83d7191-d5ac-4b58-b850-8979759fe290` | `b83d7191-d5ac-4b58-b850-8979759fe290` |
| Embedded XPrem Manifest URL | `https://otadeploy.yopips.com/manifest` | `https://otadeploy.yopips.com/manifest` | `https://otadeploy.yopips.com/manifest` |
| Build Dashboard URL | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/builds/84e7a097-c743-428e-9f98-6c1625ce598b | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/builds/7bdd5a75-485f-42c9-9dd1-0e60a6b62f07 | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/builds/db4a69d2-6388-4a58-88fa-63e6d13879de |
| **Direct Artifact Download Link** | https://expo.dev/artifacts/eas/acdVe_wGlcAjDVDyMkYf7u1MnU3ODKQKUkP_SkCVYN0.aab | https://expo.dev/artifacts/eas/3dWnKszYsSVaMWvDPdai0ZBHZmHRxu8iQ_klQO6xCeQ.ipa | https://expo.dev/artifacts/eas/y3yY8bhNVsCkIthyDTspnDA1PM_VVNzyoGr_bNXICac.apk |

---

### 2. Live XPrem OTA Release (`1.1.62`)

| Field | Android | iOS |
| --- | --- | --- |
| Display Version (`APP_DISPLAY_VERSION`) | `1.1.62` | `1.1.62` |
| State | **LIVE on XPrem; manifest & Hermes launch bundle pre-warmed and verified (`HTTP 200`)** | **LIVE on XPrem; manifest & Hermes launch bundle pre-warmed and verified (`HTTP 200`)** |
| Primary Runtime Version | `797dea98b258410dcbd80a727586f6af607da932` | `44d9c3b64f5b6fd221136b861e597bdbf62da208` |
| XPrem Publish Group ID | `a20b75f5-2aad-4471-8db8-ecdb5a906d58` | `a20b75f5-2aad-4471-8db8-ecdb5a906d58` |
| Primary XPrem Update ID | `17936906941762` | `17936907575041` |
| Primary Manifest UUID | `df426f2d-061f-49b9-637e-b8abb791aac0` | `9efc75c6-94c1-b8a1-893d-5e73aab63ed0` |
| Created (UTC) | `2026-11-03T07:24:56.871Z` | `2026-11-03T07:25:58.647Z` |
| XPrem Branch | `rtx5-production` | `rtx5-production` |
| XPrem Channel | `yoforex-rtx5` | `yoforex-rtx5` |
| XPrem App ID | `b83d7191-d5ac-4b58-b850-8979759fe290` | `b83d7191-d5ac-4b58-b850-8979759fe290` |
| XPrem Manifest Endpoint | `https://otadeploy.yopips.com/manifest` | `https://otadeploy.yopips.com/manifest` |
| Launch Bundle Asset Key | `f9b27e3ed9b5ab4822ff4fa3b15e928e.hbc` | `b434e6b03a0526c985f77b4b688a2436.hbc` |
| Launch Asset URL | `https://otadeploy.yopips.com/assets?asset=_expo%2Fstatic%2Fjs%2Fandroid%2Fentry-f9b27e3ed9b5ab4822ff4fa3b15e928e.hbc&branch=rtx5-production&platform=android&runtimeVersion=797dea98b258410dcbd80a727586f6af607da932&updateId=17936906941762` | `https://otadeploy.yopips.com/assets?asset=_expo%2Fstatic%2Fjs%2Fios%2Fentry-b434e6b03a0526c985f77b4b688a2436.hbc&branch=rtx5-production&platform=ios&runtimeVersion=44d9c3b64f5b6fd221136b861e597bdbf62da208&updateId=17936907575041` |
| Secondary Synced Runtimes (`xprem-update.js`) | `cc903d8dc47e8df129812dd4608268e10335b862` (`17936907076342`), `a73d7c98409dfdde2b3c4a928e18104ff752c41b` (`17936907199652`), `dce371b08eed6964ed758cc37b7ec24c7b70dedb` (`17936907371162`) | `aaa2ca37dba037ef63f009b328ab7ffc95c11534` (`17936907835051`), `e3b53daadb327e45d3b4aa2cfeffe86eefac0199` (`17936907974761`), `b5adacfda3f2f15f55a442781d49105b33727269` (`17936908105071`) |

---

### 3. Locked Parameters That MUST Stay Constant for Smooth Future OTA Updates

To guarantee that future XPrem OTA updates arrive seamlessly on both the Play Store (`.aab`), App Store (`.ipa`), and Internal (`.apk`) `1.1.62` builds without runtime drift or header mismatch, **never modify** the following parameters unless intentionally shipping new native store binaries:

1. **XPrem `updates` Configuration in `rtx5-app/app.json` and `rtx5-app/app.config.js`**:
   - `updates.url`: `https://otadeploy.yopips.com/manifest`
   - `updates.requestHeaders["expo-app-id"]`: `b83d7191-d5ac-4b58-b850-8979759fe290`
   - `updates.requestHeaders["expo-channel-name"]`: `yoforex-rtx5`
   - `updates.checkAutomatically`: `"ON_LOAD"`
   - `updates.fallbackToCacheTimeout`: `15000`
2. **Channel & Branch Mapping in `rtx5-app/eas.json` and `rtx5-app/scripts/xprem-update.js`**:
   - EAS build profiles (`development`, `preview`, `production-apk`, `production`): `"channel": "yoforex-rtx5"`
   - XPrem branch (`DEFAULT_BRANCH` in `rtx5-app/scripts/xprem-update.js`): `"rtx5-production"`
3. **Runtime Version Lock (`rtx5-app/fingerprint.config.js`)**:
   - `runtimeVersion.policy`: `"fingerprint"`
   - `rtx5-app/fingerprint.config.js` includes both `sourceSkips` and a `fileHookTransform` that normalizes `expoConfig.version` (`"1.1.30"`), `expoConfig.ios.buildNumber` (`"1"`), and `expoConfig.android.versionCode` during `@expo/fingerprint` hashing.
   - Because of this lock, changing `version`, `ios.buildNumber`, or `android.versionCode` in `rtx5-app/app.json` **never alters** the resolved native runtime versions:
     - **Android Locked Runtime**: `797dea98b258410dcbd80a727586f6af607da932`
     - **iOS Locked Runtime**: `44d9c3b64f5b6fd221136b861e597bdbf62da208`
4. **Native Dependencies & Plugins**:
   - Do not add, remove, or upgrade native packages in `rtx5-app/package.json` or plugins in `rtx5-app/app.json` when publishing an OTA-only update, as native dependency changes alter the fingerprint runtime hash.
5. **Android Play Store `.aab` Fast-Build Optimization (`rtx5-app/scripts/patch-expo-start.js`)**:
   - During EAS Linux `PREBUILD`, `postinstall` automatically tunes `android/gradle.properties` (`reactNativeArchitectures=arm64-v8a`, `org.gradle.parallel=false`, `org.gradle.workers.max=2`, `org.gradle.jvmargs=-Xmx2560m -XX:MaxMetaspaceSize=512m -XX:+UseG1GC -XX:+UseStringDeduplication -Dfile.encoding=UTF-8`, `kotlin.daemon.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=384m`, `android.enableMinifyInReleaseBuilds=false`, `android.enableShrinkResourcesInReleaseBuilds=false`) so Play Store `.aab` builds complete in ~10 minutes without Gradle/R8/CMake OOM stalls and without changing `runtimeVersion`.

---

### 4. Repeatable Step-by-Step Workflow for Future XPrem OTA Updates (e.g. `1.1.63`, `1.1.64`, ...)

Whenever you want to push a new JS/UI OTA update to phones running the `1.1.62` Play Store (`.aab`), App Store (`.ipa`), or Internal (`.apk`) build:

1. **Make your JS / TS / UI code changes** inside `rtx5-app/src/` or `rtx5-app/app/`.
2. **Bump the OTA display version** in:
   - `rtx5-app/src/config/appDisplayVersion.ts`:
     ```ts
     export const APP_DISPLAY_VERSION = APP_DISPLAY_VERSION_OVERRIDE || '1.1.63';
     ```
   - `rtx5-app/src/config/appDisplayVersion.test.ts`:
     Update the expected version string to `'1.1.63'`.
3. **Verify TypeScript, unit tests, and locked runtime hashes**:
   ```bash
   cd rtx5-app
   npx tsc --noEmit
   npx jest src/config/appDisplayVersion.test.ts --runInBand
   npx eas-cli@latest update:runtime-version:resolve --platform android --environment production
   npx eas-cli@latest update:runtime-version:resolve --platform ios --environment production
   ```
   Confirm that Android resolves to `797dea98b258410dcbd80a727586f6af607da932` and iOS resolves to `44d9c3b64f5b6fd221136b861e597bdbf62da208`.
4. **Publish and pre-warm the XPrem OTA update in one command**:
   ```bash
   cd rtx5-app
   npm run update:xprem -- -m "OTA 1.1.63: <short description of changes>"
   ```
   *(Or `node ./scripts/xprem-update.js -m "OTA 1.1.63: <short description>"`)*
   - This script automatically:
     1. Resolves the Android (`797dea98b258410dcbd80a727586f6af607da932`) and iOS (`44d9c3b64f5b6fd221136b861e597bdbf62da208`) fingerprint runtimes.
     2. Exports production Hermes bytecode bundles (`npx expo export --output-dir dist`).
     3. Uploads the bundles and assets to XPrem (`https://otadeploy.yopips.com/upload`) on branch `rtx5-production` (channel `yoforex-rtx5`) with a shared `publishGroupId` for both primary and secondary active runtimes.
     4. Pre-warms XPrem's manifest and `.hbc` bundle cache and verifies `HTTP 200` delivery for both Android and iOS so phones receive the OTA on the very first launch without timeout.
5. **Update this documentation file (`OTA_UPDATE_INFORMATION.md`) and `docs/guide/OTA_PRODUCTION_BASELINE.md`** with the new display version, XPrem update IDs, manifest UUIDs, and timestamp.

---

### 5. Included Highlights in `1.1.62`

- **SDK 55 & Stable Package Baseline**: Upgraded and verified across Expo SDK 55 (`expo@55.0.15`), React Native `0.83.4`, React `19.2.0`, `@shopify/react-native-skia@2.5.5`, `react-native-reanimated@4.2.1`, and `react-native-screens@4.23.0`.
- **Chart Screen Buy Button Green Styling (`ChartTradeButtonsFeature.tsx`)**:
  - Updated the Chart screen Buy button background to green (`#22C55E`) while keeping the previous blue color (`colors.accent` / `#1D6FF2`) commented out in `rtx5-app/src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx` as requested.
- **Android + iOS Dual-Hook OTA Delivery (`useAppUpdates.ts` + `app/_layout.tsx`)**:
  - Added `fallbackToCacheTimeout: 15000` in `app.json` / `app.config.js` combined with XPrem `.hbc` cache pre-warming in `scripts/xprem-update.js` and foreground JS check/fetch/reload in `useAppUpdates.ts`, ensuring both Android and iOS download and apply XPrem OTA updates reliably on launch and foreground resume.
- **Version & Fingerprint Lock (`fingerprint.config.js`)**:
  - Normalized `version`, `ios.buildNumber`, and `android.versionCode` inside `rtx5-app/fingerprint.config.js` (`fileHookTransform`) so store version bumps (`1.1.30` -> `1.1.62` and future store versions) never break OTA runtime compatibility.
- **Play Store `.aab` Build Optimization (`scripts/patch-expo-start.js`)**:
  - Eliminated EAS Linux container memory exhaustion during `:app:bundleRelease` so Android Play Store `.aab` builds finish cleanly in ~10m 58s.

---

## Archived 1.1.57 and Earlier Records

The records below are historical and superseded by the verified `1.1.62` production store builds and XPrem OTA release above.

> **Historical production OTA: `1.1.57` for Android and iOS.**
>
> Published and verified on 2026-10-30 (Asia/Calcutta) at the user's explicit request to update `1.1.56` to the next version (`1.1.57`). This record does not authorize future releases.

## Previous Production OTA - `1.1.57`

| Field | Android | iOS |
| --- | --- | --- |
| Display version | `1.1.57` | `1.1.57` |
| State | **LIVE; EAS, production manifest and CDN verified** | **LIVE; EAS, production manifest and CDN verified** |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `003c7d91-99d2-492f-9a31-f83c0193bf31` | `0c7303e3-da5d-47af-86d3-1bc6399e0a1d` |
| Update ID | `01a18bcf-6eef-75eb-9c16-ae05596d1eab` | `01a18bd0-4227-762c-b8fc-a032b7385d4a` |
| Created (UTC) | `2026-10-30T07:56:29.807Z` | `2026-10-30T07:57:23.879Z` |
| Dashboard | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/003c7d91-99d2-492f-9a31-f83c0193bf31 | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/0c7303e3-da5d-47af-86d3-1bc6399e0a1d |
| Manifest | https://u.expo.dev/update/01a18bcf-6eef-75eb-9c16-ae05596d1eab | https://u.expo.dev/update/01a18bd0-4227-762c-b8fc-a032b7385d4a |
| Served bundle SHA-256 | `33cf41a6b29c8851d8db972b92e52508047d417a45840a3050dde5138e842630` | `5e58c5b7d25b1f4a543e63fb86f1470b8c7b570228966e397d421c0b762772c2` |
| Compatible native binary | `cfe3b101-ab15-4e18-854b-ef808e96d708` (1.1.11/vc28) | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` (1.1.10/build30) |
| Physical-device receipt/visual check | Unconfirmed | Unconfirmed |

Project: `yoforex-organisation/rtx5-app`; project ID `092a58db-dea9-469a-a383-f27300598812`. Channel, branch and environment: `production`. Update endpoint: `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812`. Native configuration version remains `1.1.30`; OTA-visible display version is `1.1.57`.

## Included Changes

- **Pending Order Cancel & Modify Identity, Wire & Retry Contract (`rtx-s3`):**
  - Resolves `409 IDEMPOTENCY_CONFLICT` ("Pending command identities differ") on `DELETE /api/v2/orders/pending/{ticket}` and `PUT /api/v2/orders/pending/{ticket}` by generating one UUID v4 per user action (`resolvePendingMutationClientOrderId`) and sending that exact same identity in `body.client_order_id` and `Idempotency-Key` (enforced in both `pendingOrders.ts` and `brokerApi.ts`).
  - Appends `?account_login={login}` on both `PUT` and `DELETE /orders/pending/{ticket}`, sets a 35 s client timeout (>= 30 s), allows one `401` token refresh replay with the same `client_order_id`, handles `202 Accepted` by waiting 1.5 s and re-fetching the pending list without throwing an error, retries `503` temporary server conditions (`1 s, 2 s, 4 s`, max 3) with the same `client_order_id`, re-fetches the pending list before retrying network/timeout failures, and treats `409 LP_COMMAND_UNSUPPORTED` on cancel as done when the re-fetched list shows the order is gone.
  - Serializes `price`, `price_limit`, `sl`, and `tp` as canonical decimal strings on `PUT /orders/pending/{ticket}` (`null` clears `sl`/`tp`), restricts wire `time_in_force` to `"DAY"` (`GTC` clears `expiry: null`), supports optional `expected_version`, and rejects disallowed fields (`volume`, `symbol`, `side`, `comment`, `trailing_stop`, `trailing_step`, `magic`) with `400 INVALID_INPUT`.
  - Normalizes `*_decimal` fields (`price_decimal`, `price_limit_decimal`, `sl_decimal`, `tp_decimal`, `volume_decimal`), handles `pending_updated` WebSocket events on `orders.{login}` (and invalidates `pendingOrders` on any `orders.{login}` frame without clearing existing orders on failure), maps `NOT_FOUND` / `ORDER_ALREADY_PROCESSED` / `LP_COMMAND_UNSUPPORTED` on cancel to `"Order is no longer pending."`, maps `TRIGGER_CAPTURE_UNAVAILABLE` to `"Protection temporarily unavailable. Please try again shortly."`, and hides Save/Delete buttons on `PendingOrderScreen` for investor read-only sessions.
- **Guest Quotes ActionSheet -> New Order Login Layout:**
  - Opening New Order from the Quotes Symbol ActionSheet while logged out now sets `variant: "login"` on the guest auth flow state and uses `activateOnPressIn` on the ActionSheet row so `GuestFlowHost` mounts the full `LoginAccountScreen` layout instead of the compact/shrunk broker sheet variant.
- **Chart SL/TP Line Width & Money Delta Labels:**
  - Reduces chart SL/TP price line thickness from `lineWidth: 2` to `lineWidth: 1` across live and preview overlays, and strips only the `USD` currency code from chart SL/TP projected money delta readouts (e.g. `+$12.34` / `-$12.34`).
- Retains 1.1.56 pending order bulk actions, refined Trade cards, centered SVG back controls, login error classification, orange pending chart guides until confirmed fill, and compact inline phone SL/TP controls.

## Compatibility and Validation

- Fresh compatible worktree: `.codex-tmp/ota-release-1.1.57-20261030`, based on `2975156c15199c21bb3a4c73af8bd35189aaa2bd`. Compared with live 1.1.56: **30 changed / 1 added / 0 removed files**. **1449 inventoried files; 1446 exact main-source matches**. Three retained attachment/clipboard adaptations support the legacy binaries; text reporting and the existing Reanimated shake sensor remain available.
- Native dependencies, full lockfile, configuration, plugins and icons remain byte-identical to the reviewed 1.1.56 baseline. No new native module was introduced. Dependencies were materialized in a real independent directory: 47780 files, 47780 NTFS hardlinks and 0 hash-verified copy fallbacks.
- Full release validation passed all **551 test files**, changed-feature main checks in **22 files** (250 tests), main and release TypeScript checks, and production Android/iOS Hermes exports (bytecode v96).
- Production channel mapping, compatible build records, required production environment names/values, previous 1.1.56 manifests and CDN bundles were freshly checked. Natural fingerprints remain Android `1e1ad87a1fafdfca676015eb142abdfb0188d811` and iOS `5d2be9c332fb6660513531f40f6ffff3254d8048`. Target runtimes were resolved separately for the reviewed legacy continuation; raw main was not assigned those runtimes.
- Native safety exit **2** flags only the retained owner metadata and extra API URL differences. Exact native diffs match the reviewed baseline; this is **not** a safety-script pass.
- Exported Hermes bytecode v96 contains `1.1.57`, the new pending-order error/wire markers and retained features. Unsupported optional-native loader markers and the former tall phone SL/TP branch are absent. Disassembled pending-entry builders still use orange (`#F59E0B`). Source hashes were rechecked after export and before publication.
- Platforms were published separately. Live EAS records, production manifest IDs and downloaded CDN hashes match the validated exports. Physical-device installation/visual checks and current store distribution remain unconfirmed. No development server was started.
- Evidence: `.codex-tmp/ota-1.1.57-20261030-evidence`; source inventory SHA-256 `f70193c44af52eef3cd71364a75392643158f78e6358e8c4bcc898acdd25f325`. Previous publication records are preserved below. No future release was scheduled.

## Repeatable Flow for a Future OTA

1. Obtain an explicit release request and freshly verify both live versions. Retain a version only when requested.
2. Create a fresh compatible worktree from the retained baseline in `C:/Users/S S LAPTOP BAZAAR/.codex/repo-backups/RTX-5Mobile-App-20261007-141018`. Assemble current source with `rtx5-app/scripts/ota/assemble-compatible-release.js`; inventory hashes/adaptations and compare with this publication. Preserve native dependencies/configuration/icons and verify startup/toolchain support separately.
3. Validate full release tests, changed-feature main tests, both TypeScript checks, production environment, native diffs, natural fingerprints and per-platform targets. Export with production environment; verify compiled behavior/feature markers and recheck source hashes.
4. Publish normally when fingerprints match binaries. Legacy continuation is limited to the reviewed compatible baseline; new native features require new binaries.
5. Publish each platform with `--channel production --environment production --platform <android|ios> --input-dir <validated-export> --skip-bundler --non-interactive --json` when runtimes differ. Do not override the `update:prod` wrapper's owned `--platform all` flag.
6. Verify live EAS, production manifests and CDN hashes, test available devices and update this file plus [the production baseline](docs/guide/OTA_PRODUCTION_BASELINE.md).

## Archived 1.1.56 and Earlier Records

The records below are historical and superseded by the verified 1.1.57 release above.

> **Historical production OTA: `1.1.56` for Android and iOS.**
>
> Published and verified on 2026-10-29 (Asia/Calcutta) at the user's explicit request to update 1.1.55 to 1.1.56. This record does not authorize future releases.

## Previous Production OTA - `1.1.56`

| Field | Android | iOS |
| --- | --- | --- |
| Display version | `1.1.56` | `1.1.56` |
| State | **LIVE; EAS, production manifest and CDN verified** | **LIVE; EAS, production manifest and CDN verified** |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `782e0e25-3ef4-4491-9e93-723eecdaaac3` | `87251afb-8065-4a4e-aa48-3a8b485302a4` |
| Update ID | `01a1873b-2801-72af-baf8-26665d73b1de` | `01a1873c-1f75-7279-a080-25f3a4e07d4d` |
| Created (UTC) | `2026-10-29T10:36:03.457Z` | `2026-10-29T10:37:06.805Z` |
| Dashboard | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/782e0e25-3ef4-4491-9e93-723eecdaaac3 | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/87251afb-8065-4a4e-aa48-3a8b485302a4 |
| Manifest | https://u.expo.dev/update/01a1873b-2801-72af-baf8-26665d73b1de | https://u.expo.dev/update/01a1873c-1f75-7279-a080-25f3a4e07d4d |
| Served bundle SHA-256 | `06ee3745083b8d79f68dd09cd6b1bbd6987ae0b5e73a6e576c08d06c70f86ae6` | `8118b94cf202aa86da7e580759d9297918bfe5eafc1e6f97e10357840868d8c8` |
| Compatible native binary | `cfe3b101-ab15-4e18-854b-ef808e96d708` (1.1.11/vc28) | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` (1.1.10/build30) |
| Physical-device receipt/visual check | Unconfirmed | Unconfirmed |

Project: `yoforex-organisation/rtx5-app`; project ID `092a58db-dea9-469a-a383-f27300598812`. Channel, branch and environment: `production`. Update endpoint: `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812`. Native configuration version remains `1.1.30`; OTA-visible display version is `1.1.56`.

## Included Changes

- Pending Orders has a Positions-style Bulk menu with Delete All, Delete All Buy and Delete All Sell Pending Orders. A review screen scopes each batch to the selected account; requests are sequential, duplicate batches are blocked, and leaving or switching accounts stops unsent requests.
- Pending Orders uses individual cards, an orange pending badge, Buy/Sell type colors, aligned order and current-side prices, and grouped SL/TP/expiration details. The Positions Bulk button is disabled and dimmed when no open positions exist.
- Saving a pending-order edit preserves the broker's existing SL/TP values. Missing protection stays blank, and users can explicitly clear a level. Regression fixtures cover both platforms.
- Pending Order and Demo Account back controls use centered SVG arrows and retain guarded Back behavior. Pending header navigation and late Save/Delete completions do not pop another screen.
- Login distinguishes connection failures, timeouts, invalid server responses and backend rejections. Backend messages are retained with credential strings redacted; cancelled requests cannot become successful sessions. The reported physical Android Expo Go login failure remains unconfirmed without the device's exact error/logs; this release does not claim that failure has been reproduced or resolved.
- Retains orange pending chart guides until a broker-confirmed fill, normal executed Buy/Sell position styling, compact inline phone SL/TP controls, decimal-price crash protection, price drag/scroll, broker selection retention, exact backend prices and Margin Level zero fallback.

## Compatibility and Validation

- Fresh compatible worktree: `.codex-tmp/ota-release-1.1.56-20261029`, based on `2975156c15199c21bb3a4c73af8bd35189aaa2bd`. Compared with live 1.1.55: **18 changed / 5 added / 0 removed files**. **1448 inventoried files; 1445 exact main-source matches**. Three retained attachment/clipboard adaptations support the legacy binaries; text reporting and the existing Reanimated shake sensor remain available.
- Native dependencies, full lockfile, configuration, plugins and icons remain byte-identical to the reviewed 1.1.55 baseline. No new native module was introduced. Dependencies were materialized in a real independent directory: 47780 files, 47780 NTFS hardlinks and 0 hash-verified copy fallbacks. No fresh npm-ci success is claimed.
- Main audit passed **3,565 automated tests across 550 files**, TypeScript, both development bundles and 72 literal route targets. Version-bump/changed-feature main checks in **18 files** and main TypeScript were rerun. The compatible release's complete **550-file suite**, TypeScript and production Android/iOS Hermes exports passed.
- Production channel mapping, compatible build records, required production environment names/values, previous manifests and CDN bundles were freshly checked. Natural fingerprints remain Android `1e1ad87a1fafdfca676015eb142abdfb0188d811` and iOS `5d2be9c332fb6660513531f40f6ffff3254d8048`. Target runtimes were resolved separately for the reviewed legacy continuation; raw main was not assigned those runtimes.
- Native safety exit **2** flags only the retained owner metadata and extra API URL differences. Exact native diffs match the reviewed baseline; this is **not** a safety-script pass.
- Exported Hermes bytecode v96 contains 1.1.56, the new bulk labels, connection/timeout messages and retained features. Unsupported optional-native loader markers and the former tall phone SL/TP branch are absent. Disassembled pending-entry builders still use orange. Source hashes were rechecked after export and before publication.
- Platforms were published separately. Live EAS records, production manifest IDs and downloaded CDN hashes match the validated exports. Physical-device installation/visual checks and current store distribution remain unconfirmed. No development server was started.
- Evidence: `.codex-tmp/ota-1.1.56-20261029-evidence`; source inventory SHA-256 `4dfa8cb5ba9db03aa7aec736a56a059412a38a423dd68867a56b37f21a2de4fc`. Previous publication records are preserved below. No future release was scheduled.

## Repeatable Flow for a Future OTA

1. Obtain an explicit release request and freshly verify both live versions. Retain a version only when requested.
2. Create a fresh compatible worktree from the retained baseline in `C:/Users/S S LAPTOP BAZAAR/.codex/repo-backups/RTX-5Mobile-App-20261007-141018`. Assemble current source with `rtx5-app/scripts/ota/assemble-compatible-release.js`; inventory hashes/adaptations and compare with this publication. Preserve native dependencies/configuration/icons and verify startup/toolchain support separately.
3. Validate full release tests, changed-feature main tests, both TypeScript checks, production environment, native diffs, natural fingerprints and per-platform targets. Export with production environment; verify compiled behavior/feature markers and recheck source hashes.
4. Publish normally when fingerprints match binaries. Legacy continuation is limited to the reviewed compatible baseline; new native features require new binaries.
5. Publish each platform with `--channel production --environment production --platform <android|ios> --input-dir <validated-export> --skip-bundler --non-interactive --json` when runtimes differ. Do not override the `update:prod` wrapper's owned `--platform all` flag.
6. Verify live EAS, production manifests and CDN hashes, test available devices and update this file plus [the production baseline](docs/guide/OTA_PRODUCTION_BASELINE.md).

## Archived 1.1.55 and Earlier Records

The records below are historical and superseded by the verified 1.1.56 release above.

> **Historical production OTA: `1.1.55` for Android and iOS - same-version pending-order lifecycle correction.**
>
> Published and verified on 2026-10-28 (Asia/Calcutta) at the user's explicit request to retain version 1.1.55. New update IDs deliver the correction below. This record does not authorize future releases.

## Previous Production OTA - `1.1.55` Pending-Order Lifecycle Correction

| Field | Android | iOS |
| --- | --- | --- |
| Display version | `1.1.55` | `1.1.55` |
| State | **LIVE; EAS, production manifest and CDN verified** | **LIVE; EAS, production manifest and CDN verified** |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `db89529f-d459-471d-9f66-4d4a66649159` | `b87ea0e3-e68f-4ead-a7c8-96255afa9f6f` |
| Update ID | `01a1815a-7f46-7377-9dab-8df2b87139d4` | `01a1815b-61a6-785a-834e-f2490b38c9f1` |
| Created (UTC) | `2026-10-28T07:12:34.118Z` | `2026-10-28T07:13:32.070Z` |
| Dashboard | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/db89529f-d459-471d-9f66-4d4a66649159 | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/b87ea0e3-e68f-4ead-a7c8-96255afa9f6f |
| Manifest | https://u.expo.dev/update/01a1815a-7f46-7377-9dab-8df2b87139d4 | https://u.expo.dev/update/01a1815b-61a6-785a-834e-f2490b38c9f1 |
| Served bundle SHA-256 | `96e4e5cc8b3e5e75da40a418cd07a44496ccae0a8a60dcfabf301484c94e8db4` | `4e68118a28636fa6bb916b6f5efbcfe7ce255b7ec389c6b9995795d9f2397cbe` |
| Compatible native binary | `cfe3b101-ab15-4e18-854b-ef808e96d708` (1.1.11/vc28) | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` (1.1.10/build30) |
| Physical-device receipt/visual check | Unconfirmed | Unconfirmed |

Project: `yoforex-organisation/rtx5-app`; project ID `092a58db-dea9-469a-a383-f27300598812`. Channel, branch and environment: `production`. Endpoint: `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812`. Native configuration version remains `1.1.30`; display version remains `1.1.55`.

## Changes and Compatibility

- All pending Buy/Sell order entry lines, compact labels and right-axis price badges remain orange (`#F59E0B`). A quote crossing the trigger price or a stop-limit trigger-phase notification does not prematurely recolor the pending order.
- A broker-confirmed fill removes the matching pending order and refreshes positions. The confirmed position uses the regular market-order overlay, actual position ticket and fill price, with normal Buy/Sell styling. Late pending snapshots/callbacks cannot resurrect the filled pending order; unrelated pending orders remain orange.
- Retains compact inline phone SL/TP controls, exact price anchoring, scoped order actions, price drag/scroll, login broker selection, duplicate-request protection, decimal-price crash correction, backend Margin Level with zero fallback and the other retained application fixes.
- Fresh compatible worktree: `.codex-tmp/ota-release-1.1.55-pending-lifecycle-20261028`, based on `2975156c15199c21bb3a4c73af8bd35189aaa2bd`. Versus the previous same-version chart update: **3 changed / 0 added / 0 removed files**. **1443 inventoried files; 1440 exact local matches**. The same three optional attachment/clipboard adaptations remain; text reports and the existing Reanimated shake sensor are retained.
- Native dependencies, full lockfile, configuration, plugins and icons remain byte-identical to the reviewed chart-fix baseline. No new native module was introduced. Optional native features absent from the legacy binaries still require newer binaries.

## Validation and Delivery Evidence

- **548 full compatible-release test files passed**, run serially. Main changed-feature/regression checks in **12 files passed**. Six pending-type lifecycle fixtures exercise placed/triggered/fill events, stale REST/callback suppression, normal position-overlay equivalence and unaffected peer orders. Main and release TypeScript passed.
- Real Chromium checks used the minified production renderer at 180/280/720px plot widths and font scales up to 2x. These checks do not establish iOS WebKit behavior or physical-device receipt.
- Compatible dependencies were materialized in a real independent directory from the previously verified installation: 47780 files, 47780 NTFS hardlinks, 0 hash-verified copy fallbacks. Package/full lockfile hashes matched. No fresh npm-ci success is claimed. Startup/toolchain support was synchronized and hashed; EAS CLI remains 21.4.0.
- Live production mapping, compatible native build records, production environment names, previous manifests and downloaded previous CDN bundles were freshly checked. Natural fingerprints remain Android `1e1ad87a1fafdfca676015eb142abdfb0188d811`, iOS `5d2be9c332fb6660513531f40f6ffff3254d8048`. They differ from the installed legacy runtime strings; only the reviewed compatible baseline was continued, with separate target-runtime resolution. Never force old runtimes onto raw main.
- Native safety script exit **2** flags only the previously reviewed owner metadata and extra API URL differences. Exact diffs matched the retained exception; this is **not** a safety-script pass.
- Production Android/iOS Hermes exports passed with one worker and bytecode v96. Disassembled pending-entry builder functions assign orange to the pending label and omit the previous blue pending constant; source tests verify the entry line, label and axis badge share orange. Hermes folds the fixed entry color into a static object buffer, so the initial instruction-pattern checker was corrected and rerun without changing source or exports; its initial failure is retained. Retained feature markers, production API configuration, absence of the old tall phone-panel branch and absence of unsupported optional-native loaders were checked. Both bundle hashes differ from the previous 1.1.55 publication.
- Source hashes were rechecked after export and before publication. Platforms were published separately; live EAS groups, production manifest IDs and downloaded CDN hashes match validated exports. Physical-device installation/visual checks and current store distribution remain unconfirmed. No development server was started.
- Evidence: `.codex-tmp/ota-1.1.55-pending-lifecycle-20261028-evidence`; source inventory SHA-256 `9f43ef46f1e955eae99e59ab9e97eac5159e96a819afa1c8209afe4707f553ec`. Prior publication records remain below. No future release was scheduled.

## Repeatable Flow for a Future OTA

1. Obtain an explicit release request and freshly verify both live versions. Retain a version only when requested.
2. Create a fresh compatible worktree from the retained baseline in `C:/Users/S S LAPTOP BAZAAR/.codex/repo-backups/RTX-5Mobile-App-20261007-141018`. Assemble current source with `rtx5-app/scripts/ota/assemble-compatible-release.js`; inventory source hashes/adaptations and compare against this publication. Preserve native dependencies/configuration/icons and verify startup/toolchain support separately.
3. Validate full release tests, main changed-feature tests, both TypeScript checks, production environment, native diffs, natural fingerprints and per-platform targets. Export with production environment; verify compiled behavior/feature markers and recheck source hashes.
4. Publish normally when fingerprints match binaries. Legacy continuation is limited to the reviewed compatible baseline; new native features require new binaries.
5. Publish each platform with `--channel production --environment production --platform <android|ios> --input-dir <validated-export> --skip-bundler --non-interactive --json` when runtimes differ. Do not override the `update:prod` wrapper's owned `--platform all` flag.
6. Verify live EAS, production manifests and CDN hashes, test available devices and update this file plus [the production baseline](docs/guide/OTA_PRODUCTION_BASELINE.md).

## Archived 1.1.55 Chart Update and Earlier Records

All current-state labels below are historical and superseded by the verified pending-order lifecycle correction above.

> **Historical production OTA: `1.1.55` for Android and iOS — same-version chart fix.**
>
> Published and verified on 2026-10-28 (Asia/Calcutta) following the user's explicit request to retain the current version. New update IDs deliver the chart fixes; the display version remains 1.1.55. This record does not authorize a future release.

## Previous Production OTA - `1.1.55` Same-Version Chart Fix

| Field | Android | iOS |
| --- | --- | --- |
| Display version | `1.1.55` | `1.1.55` |
| State | **LIVE; EAS, production manifest and CDN verified** | **LIVE; EAS, production manifest and CDN verified** |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `f0356628-f4c1-4f41-b055-d4ce2d4e74d0` | `82552ea4-7cce-45c3-be76-f678041f2d13` |
| Update ID | `01a18125-8f50-71e4-a457-3b4c81266491` | `01a18126-7276-731c-897b-00e13bedef97` |
| Created (UTC) | `2026-10-28T06:14:44.816Z` | `2026-10-28T06:15:42.966Z` |
| Dashboard | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/f0356628-f4c1-4f41-b055-d4ce2d4e74d0 | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/82552ea4-7cce-45c3-be76-f678041f2d13 |
| Manifest | https://u.expo.dev/update/01a18125-8f50-71e4-a457-3b4c81266491 | https://u.expo.dev/update/01a18126-7276-731c-897b-00e13bedef97 |
| Served bundle SHA-256 | `fc6de14bad3667e828126778c5f5de7ab82054a4c6a3a8bca454525a5a7d0e31` | `ad300238407f6a1897ee509d4d248eb2036511abc62349cd1c4297ebcd7a207a` |
| Compatible native binary | `cfe3b101-ab15-4e18-854b-ef808e96d708` (1.1.11/vc28) | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` (1.1.10/build30) |
| Physical-device receipt/visual check | Unconfirmed | Unconfirmed |

Project: `yoforex-organisation/rtx5-app`; project ID `092a58db-dea9-469a-a383-f27300598812`. Channel, branch and environment: `production`. Endpoint: `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812`. Native Expo configuration version remains `1.1.30`; `src/config/appDisplayVersion.ts` remains `1.1.55`.

## Changes and Compatibility

- Replaces the phone-width SL/TP renderer's 96px two-row panels with a compact inline strip. TP/SL, details and close remain usable; transparent touch targets retain 48px height, scaled for larger text. Price anchoring, gesture safeguards, disabled capabilities and scoped ticket actions are retained. The previous OTA and local app used identical renderer source; the narrower phone plot triggered the panel branch.
- Placed pending Buy orders now use blue and Sell orders use the trading theme's red for the label, dashed guide and right-axis price badge. Compact labels include the actual lot volume. Labels and badges stay at the exact pending price during pan/zoom; taps open the existing scoped order editor.
- Fresh worktree `.codex-tmp/ota-release-1.1.55-chart-fix-20261028` at `2975156c15199c21bb3a4c73af8bd35189aaa2bd`, assembled from current local source. Versus the initial 1.1.55 release: **7 changed / 0 added / 0 removed files**. **1443 files inventoried; 1440 exact main-source matches**. The same three optional attachment/clipboard adaptations remain; text reports and the existing Reanimated shake sensor are retained.
- Native dependencies, full lockfile, app configuration, plugins and five icons are byte-identical to the initial 1.1.55 baseline. Optional attachment/clipboard capabilities absent from these legacy binaries remain unavailable. No new native module was introduced.

## Validation and Delivery Evidence

- **548 compatible-release test files passed** across the complete suite and a targeted recovery: the initial full run passed 547 files and found one stale source-format assertion; the corrected contract file was rerun in full and passed. Initial and recovery logs are retained. Main changed-feature/regression tests in **11 files passed**. Main and release TypeScript passed after the assertion correction. Real Chromium layout/action checks used the minified production renderer at 180/280/720px plot widths and font scales up to 2x. Browser checks do not establish physical-device receipt or iOS WebKit behavior.
- Real compatible dependencies were materialized as an independent directory from the prior verified lockfile installation: 47780 files, 47780 NTFS hardlinks, 0 hash-verified copy fallbacks. Package and full lockfile hashes matched. No fresh npm-ci success is claimed. Repository startup/toolchain support was synchronized and hashed; EAS CLI remains 21.4.0.
- Live production mapping, both compatible build records, required production environment names, previous manifests and downloaded CDN bundles were freshly checked. Native fingerprints remain Android `1e1ad87a1fafdfca676015eb142abdfb0188d811`, iOS `5d2be9c332fb6660513531f40f6ffff3254d8048`. They differ from the installed legacy runtime strings; only the reviewed compatible source baseline was continued, with separate target-runtime resolution. Never force old runtimes onto raw main.
- Native safety script exit **2** flags only the previously reviewed owner metadata and extra API URL differences. Exact native diffs matched; this is **not** a safety-script pass.
- Production Android/iOS Hermes exports passed with one worker and bytecode v96. New compact-layout and pending-label markers are present and absent from freshly downloaded previous bundles; the old narrow-phone panel branch is absent. Placed pending-order side colors, retained features and unsupported native loader markers were checked. Both new bundle hashes differ despite retaining display version 1.1.55.
- Source hashes were rechecked after export and before publication. Platforms were published separately. Live EAS groups, production manifest IDs and downloaded CDN hashes match validated exports. Physical-device installation, visual checks and current store distribution remain unconfirmed. No development server was started.
- Evidence: `.codex-tmp/ota-1.1.55-chart-fix-20261028-evidence`; source inventory SHA-256 `1cb64a1cec364d1e1db89941759d5fb6e477b7317e09fdf9c3cdd350f250d1ac`. Previous production IDs are retained below. No future release was scheduled.

## Repeatable Flow for a Future OTA

1. Obtain an explicit release request; freshly verify both live versions. Retain a display version only when the user requests it.
2. Create a fresh compatible worktree from the retained baseline in `C:/Users/S S LAPTOP BAZAAR/.codex/repo-backups/RTX-5Mobile-App-20261007-141018`. Assemble current source using `rtx5-app/scripts/ota/assemble-compatible-release.js`; inventory hashes and adaptations and compare with this publication. Preserve native dependencies/configuration/icons and verify startup/toolchain support separately.
3. Validate source parity, full release tests, changed-feature main tests, both TypeScript checks, production environment, native diffs, natural fingerprints and per-platform targets. Export with production environment, verify feature/native-loader markers and recheck source hashes.
4. Publish normally when fingerprints match binaries. Legacy continuation is limited to the reviewed compatible baseline; new native features require new binaries.
5. When platform runtimes differ, publish separately with `--channel production --environment production --platform <android|ios> --input-dir <validated-export> --skip-bundler --non-interactive --json`. Do not override the `update:prod` wrapper's owned `--platform all` flag.
6. Verify live EAS, production manifests and CDN hashes, test available devices and update this file plus [the production baseline](docs/guide/OTA_PRODUCTION_BASELINE.md).

## Archived Initial 1.1.55 and Earlier Records

The records below preserve publication-time evidence. Their current-state labels are superseded by this same-version publication's new IDs.

> **Historical production OTA: `1.1.55` for Android and iOS.**
>
> Published for the user's explicit next-version request and verified on 2026-10-27 (Asia/Calcutta). Live EAS records, production manifests and downloaded CDN launch bundles were checked after publication. This record does not authorize a future release.

## Previous Initial Production OTA - `1.1.55`

| Field | Android | iOS |
| --- | --- | --- |
| OTA-visible version | `1.1.55` | `1.1.55` |
| State | **LIVE; EAS, production manifest and CDN bundle verified** | **LIVE; EAS, production manifest and CDN bundle verified** |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `988d2a5b-0206-46ba-9f35-c9180eb17d3a` | `aba556ee-db26-489b-b03d-222d07fad68e` |
| Update ID | `01a17d56-e3d4-7a4e-9ab4-7f24099f5950` | `01a17d57-f972-7881-a3ee-f0cb912de972` |
| Created (UTC) | `2026-10-27T12:30:08.852Z` | `2026-10-27T12:31:19.922Z` |
| Compatible native binary | `cfe3b101-ab15-4e18-854b-ef808e96d708` / 1.1.11, vc28 | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` / 1.1.10, build30 |
| Manifest | https://u.expo.dev/update/01a17d56-e3d4-7a4e-9ab4-7f24099f5950 | https://u.expo.dev/update/01a17d57-f972-7881-a3ee-f0cb912de972 |
| Dashboard | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/988d2a5b-0206-46ba-9f35-c9180eb17d3a | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/aba556ee-db26-489b-b03d-222d07fad68e |
| Served bundle SHA-256 | `ac0ec2a5684f61183b3511c700b5e94545a954ad10fa0485c1863c7584da9664` | `d72dad9df03b22059c70d79f8274712fbfbebfad40bc222053ce28e88949bcc2` |
| Physical-device confirmation | Pending; no production device tested | Pending; no production device tested |

Project: `yoforex-organisation/rtx5-app`; EAS project `092a58db-dea9-469a-a383-f27300598812`. Channel, branch and environment: `production`. Update endpoint: `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812`. Native Expo configuration version remains `1.1.30`; `src/config/appDisplayVersion.ts` is `1.1.55`.

## Included Source and Compatibility

- Fresh compatible worktree: `.codex-tmp/ota-release-1.1.55-20261027`, based on `2975156c15199c21bb3a4c73af8bd35189aaa2bd`. Current main source: 4b6d761cc1b99b4a8cb04f7e57e750e745e098c8 plus current dirty local changes.
- Versus live 1.1.54: **189 changed / 73 added / 5 removed files**. **1443 inventoried files; 1440 identical to current main.** The same three optional attachment/clipboard adaptations remain in `bugReportAttachments.ts`, `bugReportFilePicker.ts` and `BugReportScreen.tsx`.
- Includes retained Login broker selection, pending request deduplication, decimal-price accessibility crash correction, price drag/scroll controls, backend Margin Level with zero fallback, and current chart/trade/history/session/UI changes.
- Pending-order expiration now uses the existing JavaScript calendar and validated local-time input. The absent native datetimepicker is not imported into the OTA. Keyboard-tap policy mismatches were corrected. Stale source/interaction assertions were updated after checking the retained broker picker, ActionSheet revision updates, History account gate, orders subscription, exact stop-handle ownership and scoped fling interruption. Initial failure logs are preserved; the complete release suite was rerun after the corrections.
- Native dependencies and lockfile, app configuration, native plugins and five icon assets are byte-identical to the reviewed 1.1.54 native baseline. Optional new native attachment/clipboard features still require newer binaries. Text reports and the existing Reanimated shake sensor remain available.

## Validation and Delivery Evidence

- **548 full compatible-release test files passed**, run serially. Main changed-feature/regression tests in **107 files passed**. Main and release TypeScript passed. Real release dependencies use the verified 1.1.54 installation and identical lockfile, materialized with NTFS hardlinks and hash-verified copy fallbacks. The slow fresh `npm ci` attempt was stopped and preserved separately; it is not reported as successful.
- Production channel/branch, both compatible native build records and all 12 required public environment variables were freshly checked. Both previous 1.1.54 manifests and CDN launch hashes were verified before preparation.
- Natural fingerprints: Android `1e1ad87a1fafdfca676015eb142abdfb0188d811`, iOS `5d2be9c332fb6660513531f40f6ffff3254d8048`. These match the compatible source baseline and differ from the installed legacy runtime strings. Publication continued only these reviewed per-platform legacy lines; do not force old runtimes onto raw main.
- The broad safety script returned exit **2**, flagging only the previously reviewed owner metadata and two extra API fallback URL changes. Exact native diffs matched the reviewed exception; this is **not** a safety-script pass.
- Production-environment Android/iOS Hermes exports passed with one bundler worker and bytecode v96. Both bundles contain 1.1.55, production API configuration and the current price/expiration feature markers. Unsupported optional-native/date-picker loader markers were checked.
- Local/release source hashes were reverified after export and before publication. Platforms were published separately. Live EAS groups, production manifest IDs and downloaded CDN SHA-256 hashes match the validated exports.
- Physical-device installation/visual checks and current store distribution remain unconfirmed. No local development server was started for the release.
- Evidence: `.codex-tmp/ota-1.1.55-20261027-evidence`. Source inventory SHA-256: `81e1870e49b49f8810e579256b0292704bbeec82beb307ae2e8a50808fe08714`. No future release was scheduled.

## Repeatable Flow for the Next OTA

1. Obtain an explicit release request and freshly verify the live versions before choosing the next version.
2. Create a fresh worktree from the retained compatible baseline in `C:/Users/S S LAPTOP BAZAAR/.codex/repo-backups/RTX-5Mobile-App-20261007-141018`. Assemble current local source with `rtx5-app/scripts/ota/assemble-compatible-release.js`; record hashes/adaptations and compare against the currently published inventory. Preserve native dependencies/configuration/icons and synchronize repository startup/toolchain support separately.
3. Validate source parity, full release tests, main changed-feature tests, both TypeScript checks, production environment, exact native diffs and both natural fingerprints. Export with production environment, verify version/feature/native-loader markers and recheck source hashes.
4. Publish normally when fingerprints match intended binaries. Legacy continuation is limited to the separately reviewed compatible source baseline. New native features require new binaries.
5. Publish separately with `--channel production --environment production --platform <android|ios> --input-dir ota-export-<version> --skip-bundler --non-interactive --json` when platform runtimes differ. The `update:prod` wrapper owns `--platform all` and must not be overridden.
6. Verify EAS groups, production manifests and CDN hashes; test devices when available. Update this file and [the production baseline](docs/guide/OTA_PRODUCTION_BASELINE.md) with actual results.

## Archived 1.1.54 and Earlier Records

Historical current-state labels below are superseded by the verified 1.1.55 record above.

> **Historical production OTA: `1.1.54` for Android and iOS.**
>
> Published following the user's explicit next-version request and verified on 2026-10-14 (Asia/Calcutta). Production manifests and downloaded CDN bundles select the new updates and match validated exports. This record does not authorize another release.

## Previous Production OTA - `1.1.54`

| Field | Android | iOS |
| --- | --- | --- |
| OTA-visible version | `1.1.54` | `1.1.54` |
| State | **LIVE; production manifest and CDN bundle verified** | **LIVE; production manifest and CDN bundle verified** |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `5682837f-6abd-4906-b513-74d6854c6c67` | `144526b3-6a4c-4d79-964e-8a3c12371c1e` |
| Update ID | `01a13aa1-f394-74a6-8961-7e1d186502cb` | `01a13aa3-1499-7751-9235-72493db42406` |
| Created (UTC) | `2026-10-14T13:37:34.612Z` | `2026-10-14T13:38:48.601Z` |
| Message | Android production OTA 1.1.54 current local application, chart position controls, calendar and trading UI fixes; reviewed legacy native compatibility | iOS production OTA 1.1.54 current local application, chart position controls, calendar and trading UI fixes; reviewed legacy native compatibility |
| EAS source commit/status | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` (dirty fresh compatible worktree) | Same |
| Main source snapshot | 4b6d761cc1b99b4a8cb04f7e57e750e745e098c8 plus current dirty local changes | Same |
| Compatible native binary | `cfe3b101-ab15-4e18-854b-ef808e96d708` / 1.1.11, vc28 | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` / 1.1.10, build30 |
| Manifest | https://u.expo.dev/update/01a13aa1-f394-74a6-8961-7e1d186502cb | https://u.expo.dev/update/01a13aa3-1499-7751-9235-72493db42406 |
| Dashboard | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/5682837f-6abd-4906-b513-74d6854c6c67 | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/144526b3-6a4c-4d79-964e-8a3c12371c1e |
| Served bundle SHA-256 | `9fe310ee2b39016e045e1f6bc71dac8cccb45fea6c5850c49c0894ae79a9c875` | `a6f846770fad848267959a4bd1bef212a8091daabdc6e4a705e8ff82cea6be34` |
| Physical-device confirmation | Pending; ADB reported no connected device | Pending; no iOS device tested |

Project: `yoforex-organisation/rtx5-app`; EAS project `092a58db-dea9-469a-a383-f27300598812`. Channel, branch and environment: `production`. Update endpoint: `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812`. Effective configuration: `rtx5-app/app.config.js`, based on `app.json`. Native Expo version remains `1.1.30`; OTA display version in `src/config/appDisplayVersion.ts` is `1.1.54`.

## Included Source and Compatibility

- Fresh release worktree: `.codex-tmp/ota-release-1.1.54`, assembled from the current local application, source, tests, scripts and OTA assets. Versus the live 1.1.53 shake publication: **87 changed / 29 added / 0 removed files**.
- **1375 files inventoried; 1372 match local source exactly.** The same three optional-native adaptations remain: `bugReportAttachments.ts`, `bugReportFilePicker.ts` and `BugReportScreen.tsx`. Text reports and the existing Reanimated shake sensor remain available.
- Includes current chart position controls and trade actions, entry/SL/TP reconciliation and broker price precision, chart retention/timeframe fixes, calendar/filter interactions, certification dialog, trade summary/history/UI changes and OTA prompt/reload localization.
- Native dependencies, full lockfile, app configuration, plugins and five native icons match the published 1.1.53 shake baseline byte for byte. Native-only attachment/clipboard capabilities require newer binaries.
- Nine stale UI/order test expectations were corrected after verifying current behavior: Buy/Sell color preservation, deterministic sort tie-breaking, exact-price entry lines with separately arranged controls, broker badge precision, the balance header's intentional elevation, explicit unavailable account currency in auxiliary panes, session-guarded complete broker-fill insertion, and the two new chart position action sheets. No product behavior was changed to fix these assertions; the initial failure logs are retained.

## Validation and Delivery Evidence

- **503 full compatible-release test files passed** with serial execution. **348 changed-feature/regression tests in 42 files passed** on main. Main and release TypeScript passed.
- Fresh real release dependencies installed with npm ci from the compatible lockfile. Repository startup/toolchain support synchronized and hashed separately. EAS CLI 21.4.0; Node v26.9.0.
- Production channel/branch, both compatible build records and all 12 required public environment variables freshly verified. Previous production manifests and CDN bundle hashes checked before preparation.
- Natural fingerprints remain Android `1e1ad87a1fafdfca676015eb142abdfb0188d811` and iOS `5d2be9c332fb6660513531f40f6ffff3254d8048`. They differ from installed runtime strings. Publication continues only the reviewed compatible legacy native baseline after separate per-platform target resolution; do not force these runtimes onto raw main.
- Safety script returned exit **2**, flagging only the existing owner metadata and two extra API fallback URLs. Exact native diff matches the previously reviewed exception; this is not a safety-script pass.
- Both production-environment Hermes exports passed using real dependencies and one worker. Hermes bytecode v96. Both bundles contain 1.1.54, production API configuration, retained shake/price/execution features and new chart position-control markers absent from downloaded 1.1.53 bundles. Unsupported optional-native loader markers checked.
- Source hashes reverified after export and immediately before publication. Platforms published separately; live EAS records and production manifests select the new IDs. Downloaded CDN bundles match manifest hashes and validated local exports.
- Physical-device receipt, visual smoke checks and current store distribution remain unconfirmed. ADB reported no connected Android device; no iOS device tested.
- Evidence: `.codex-tmp/ota-1.1.54-evidence`. Inventory SHA-256: `8be6703292bb9c9af92ea6faa4a7eb93abd5f618056a33fdad9e689ee4fc2c99`. No future release was scheduled.

## Repeatable Flow for the Next OTA

1. Obtain an explicit release request; verify latest live Android/iOS versions before choosing the version.
2. Create a fresh worktree at the retained compatible baseline in its owning repository, `C:/Users/S S LAPTOP BAZAAR/.codex/repo-backups/RTX-5Mobile-App-20261007-141018`. Assemble current local source with `rtx5-app/scripts/ota/assemble-compatible-release.js`; record source hashes/adaptations and compare against the latest published inventory. Preserve native dependencies/configuration/icons and synchronize startup/toolchain support separately.
3. Validate source parity, full release tests, main changed-feature tests, both TypeScript checks, production environment, native diffs and both natural fingerprints. Export with production environment; verify version/feature markers and recheck hashes before publication.
4. Publish normally when fingerprints match intended binaries. Legacy continuation is limited to this reviewed compatible native baseline. New native features require new binaries.
5. Publish separately with `--channel production --environment production --platform <android|ios> --input-dir ota-export-<version> --skip-bundler --non-interactive --json` when platform runtimes differ. The `update:prod` wrapper owns `--platform all` and must not be overridden.
6. Verify live EAS IDs, production manifests and CDN hashes, test devices when available, then update this file and [the production baseline](docs/guide/OTA_PRODUCTION_BASELINE.md) with actual results.

## Archived 1.1.53 and Earlier Records

The records below preserve publication-time evidence. Current-state labels in those historical records are superseded by the 1.1.54 release above.


> **Historical production OTA: `1.1.53` for Android and iOS, including the shake-to-report fix.**
>
> Same-version publication requested by the user and verified on 2026-10-12 (Asia/Calcutta). New update IDs deliver current local source; the display version remains `1.1.53`. This record does not authorize another release.

## Previous Production OTA - `1.1.53` Same-Version Shake Fix

| Field | Android | iOS |
| --- | --- | --- |
| OTA-visible version | `1.1.53` | `1.1.53` |
| State | **LIVE; production manifest and CDN bundle verified** | **LIVE; production manifest and CDN bundle verified** |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `7cff7e10-cd9f-474b-b477-516baa7d0d91` | `ec8b46f8-72dc-41e0-9e87-5988c7312f1a` |
| Update ID | `01a12f9b-8272-7270-b234-65ef8d900a54` | `01a12f9c-ceeb-7908-a171-a49a0054e582` |
| Created (UTC) | `2026-10-12T10:14:43.058Z` | `2026-10-12T10:16:08.171Z` |
| Message | Android production OTA 1.1.53 same-version shake-to-report fix using existing native sensor support; current local application; reviewed legacy native compatibility | iOS production OTA 1.1.53 same-version shake-to-report fix using existing native sensor support; current local application; reviewed legacy native compatibility |
| EAS source commit/status | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` (dirty fresh compatible worktree) | Same |
| Main source snapshot | 4b6d761cc1b99b4a8cb04f7e57e750e745e098c8 plus current dirty local changes | Same |
| Compatible native binary | `cfe3b101-ab15-4e18-854b-ef808e96d708` / 1.1.11, vc28 | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` / 1.1.10, build30 |
| Manifest | https://u.expo.dev/update/01a12f9b-8272-7270-b234-65ef8d900a54 | https://u.expo.dev/update/01a12f9c-ceeb-7908-a171-a49a0054e582 |
| Dashboard | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/7cff7e10-cd9f-474b-b477-516baa7d0d91 | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/ec8b46f8-72dc-41e0-9e87-5988c7312f1a |
| Served bundle SHA-256 | `f4d3e4433c0bdde3c717009621e712659b1ae0018a72a40a32ee48df967ad4d1` | `29d239316fb6f8259e103bf9c2f5fb9e6ce2e215e5a47ecfc79ddda54e872e93` |
| Physical-device confirmation | Pending; ADB reported no connected device | Pending; no iOS device tested |

Project: `yoforex-organisation/rtx5-app`; EAS project `092a58db-dea9-469a-a383-f27300598812`. Channel, branch and environment: `production`. Update endpoint: `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812`. Effective configuration: `rtx5-app/app.config.js`, based on `app.json`. Native Expo version remains `1.1.30`; display version remains `src/config/appDisplayVersion.ts` = `1.1.53`.

## Included Source and Shake Fix

- Fresh release worktree: `.codex-tmp/ota-release-1.1.53-shake`. Current local app, src, tests, scripts and OTA assets assembled and hashed. Versus the initial published `1.1.53`: **1 changed / 4 added / 0 removed files**, all in shake-to-report.
- **1346 inventoried files; 1343 match local source exactly.** Three retained optional-native adaptations: bugReportAttachments.ts, bugReportFilePicker.ts and BugReportScreen.tsx. Every shake file is identical to local source; ShakeToReportBugHost.tsx is no longer mapped to an unavailable native fallback.
- The initial `1.1.53` OTA disabled shake because expo-sensors is absent from legacy binaries. This publication uses `useAnimatedSensor(SensorType.ACCELEROMETER)` from the existing Reanimated native module. No native module, dependency, permission, plugin or configuration was added. Samples are converted from m/s² to g for the existing detector. Cooldown, popup UI, route exclusions and foreground lifecycle remain unchanged; old queued readings are discarded after subscription changes.
- Existing value-based prices, backend-only daily percentages, chart/UI/history/session/bulk-close fixes remain included. Native attachment/clipboard capabilities still need newer binaries; text bug reports remain available.
- Native dependencies, lockfile, configuration, plugins and five native icons match the initial `1.1.53` baseline byte for byte. The published snapshot and static-validation-only worktree were not used for export or publication.

## Validation and Delivery Evidence

- **492 full compatible-release test files passed** using the existing assertions with serial execution. **47 shake/worklet and bug-report regression tests in 9 files passed** on main. Main and release TypeScript passed.
- Fresh real release dependencies installed using npm ci from the compatible lockfile; startup/toolchain support synchronized and verified. EAS CLI remains 21.4.0; Node v26.9.0.
- Production channel/branch, both compatible build records and all 12 required public environment variables freshly verified. Initial `1.1.53` production manifests and downloaded CDN hashes verified before preparation.
- Natural fingerprints remain Android `1e1ad87a1fafdfca676015eb142abdfb0188d811` and iOS `5d2be9c332fb6660513531f40f6ffff3254d8048`. These differ from the installed runtime strings. Publication continues only the explicitly reviewed compatible legacy runtime lines after per-platform target resolution; never force those runtimes onto raw main.
- Safety script returned exit **2**, flagging the existing owner metadata and two extra API fallback URLs. Exact diffs match the previously reviewed exception; this is not a safety-script pass.
- Both production-environment Hermes exports passed using real installed dependencies and one worker. Hermes bytecode v96. Bundles contain `1.1.53`, production API configuration, retained features, ReanimatedShakeMotionSensor and createReanimatedShakeSensorBridge. Both new shake markers are absent from the freshly downloaded initial `1.1.53` bundles; exported hashes differ. Unsupported optional-native loader markers checked.
- Source hashes reverified after export and immediately before publication. Platforms published separately; live EAS records and production manifests select the new IDs. Downloaded CDN bundles match manifest hashes and validated local exports.
- Physical shake checks, device receipt and current store distribution remain unconfirmed. ADB reported no connected Android device; no iOS device tested.
- Evidence: `.codex-tmp/ota-1.1.53-shake-evidence`. Inventory SHA-256: `8b62fe5d091d8e75d2c24ef7816544d17f0a64a4ecf7e1cc835ec7caa74108d9`. Prior local fix evidence remains `.codex-tmp/shake-ota-fix-20261012`; the formerly prepared/unpublished fix is now included in this release. No future scheduled release was created.

## Repeatable Flow for the Next OTA

1. Obtain an explicit release request; verify latest live Android/iOS versions before choosing the version; retain the current display version only when explicitly requested.
2. Create a fresh worktree from the retained compatible baseline's owning Git repository at `C:/Users/S S LAPTOP BAZAAR/.codex/repo-backups/RTX-5Mobile-App-20261007-141018`. Assemble current local source using `rtx5-app/scripts/ota/assemble-compatible-release.js`; record hashes and adaptations; compare against the published inventory. Preserve native dependency/configuration/icon baseline and synchronize startup/toolchain support separately.
3. Validate source parity, full release tests, main changed-feature tests, both TypeScript checks, production environment, native diffs and both natural fingerprints. Export with production environment; verify new version and changed feature code; recheck hashes before publication.
4. Publish normally when fingerprints match intended binaries. Legacy continuation is limited to this reviewed compatible baseline. New native features require new binaries.
5. Publish separately with `--channel production --environment production --platform <android|ios> --input-dir ota-export-<version> --skip-bundler --non-interactive --json` when platform runtime lines differ. The `update:prod` wrapper owns `--platform all` and must not be overridden.
6. Verify live EAS IDs, production manifests and CDN hashes, test physical devices when available, then update this file and [the production baseline](docs/guide/OTA_PRODUCTION_BASELINE.md) with actual results.


## Archived Initial `1.1.53` Publication

The initial `1.1.53` publication below is superseded by the new update IDs above. Its display version is the same, but its shake-to-report fallback was disabled. The former pending local fix section is resolved by this publication.

## Previous Initial Production OTA - `1.1.53`

| Field | Android | iOS |
| --- | --- | --- |
| OTA-visible version | `1.1.53` | `1.1.53` |
| State | Previously live; superseded by the same-version shake publication | Previously live; superseded by the same-version shake publication |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `2d80c9a8-dd80-415b-a11c-841efbfe74c7` | `2105f73b-1355-4430-8197-9ba2dd85e59e` |
| Update ID | `01a12f6b-c8c6-7010-9929-359e1596c143` | `01a12f6d-a2b6-7964-b0a6-019f0640c57a` |
| Created (UTC) | `2026-10-12T09:22:35.334Z` | `2026-10-12T09:24:36.662Z` |
| Message | Android production OTA 1.1.53 current local application, value-based price formatting, backend daily change and mobile UI fixes; reviewed legacy native compatibility | iOS production OTA 1.1.53 current local application, value-based price formatting, backend daily change and mobile UI fixes; reviewed legacy native compatibility |
| EAS source commit/status | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` (dirty fresh compatible worktree) | Same release source |
| Main source snapshot | 4b6d761cc1b99b4a8cb04f7e57e750e745e098c8 plus current dirty local changes | Same |
| Compatible native binary | `cfe3b101-ab15-4e18-854b-ef808e96d708` / 1.1.11, vc28 | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` / 1.1.10, build30 |
| Manifest | https://u.expo.dev/update/01a12f6b-c8c6-7010-9929-359e1596c143 | https://u.expo.dev/update/01a12f6d-a2b6-7964-b0a6-019f0640c57a |
| Dashboard | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/2d80c9a8-dd80-415b-a11c-841efbfe74c7 | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/2105f73b-1355-4430-8197-9ba2dd85e59e |
| Served bundle SHA-256 | `23d4e113d7f3929eabacdc926742955595f8e3ec1406ae603dd7d468e0046ad4` | `775b37947477077abffd421c34e5ea89f782aaea95a202eb3648771171539758` |
| Physical-device confirmation | Pending; ADB reported no connected Android devices | Pending; no iOS device tested |

Project: `yoforex-organisation/rtx5-app`; EAS project `092a58db-dea9-469a-a383-f27300598812`. Channel, branch and environment: `production`. Update endpoint: `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812`. Effective release config: `rtx5-app/app.config.js`, based on `app.json`. Native Expo version remains `1.1.30`; OTA-visible version is `src/config/appDisplayVersion.ts`.

## Included Source and Compatibility for `1.1.53`

- Fresh compatible worktree: `.codex-tmp/ota-release-1.1.53`, assembled from current local `app`, `src`, `tests`, `scripts` and OTA assets. Compared with the published `1.1.52` inventory: **75 changed / 17 added / 0 removed files**.
- **1342 files inventoried and verified; 1338 match local source exactly.** The same four optional-native adaptations remain: `bugReportAttachments.ts`, `bugReportFilePicker.ts`, `BugReportScreen.tsx` and `shakeToReport/ShakeToReportBugHost.tsx`.
- Includes value-based price readouts (one integer digit: four decimals; two or more integer digits: two decimals), native/WebView chart labels, backend-only daily change percentages with `--` for missing data, and current chart, calculator/input, history-filter, account/session recovery, bulk-close, logout-dialog and sidebar broker-logo fixes. Raw trading values and broker order precision retain their validation rules.
- App native dependencies, lockfile, configuration, plugins and native icons match the reviewed `1.1.52` baseline byte for byte. Local native-only attachment/clipboard/shake capabilities and icons require new binaries; text bug reports remain available in this legacy OTA line.

## Validation and Delivery Evidence for `1.1.53`

- **490 full compatible-release test files passed**, executed serially through the existing suite without changing assertions. Main changed-feature checks: **372 tests in 30 files passed**. Main and release TypeScript passed. Fresh release dependencies installed from the compatible lockfile; repository startup/toolchain support synchronized and hashed separately. EAS CLI remains pinned to 21.4.0; validation used v26.9.0.
- Production channel/branch, both compatible native build records and all 12 required production environment variables freshly verified. Previous `1.1.52` production manifests and CDN bundle hashes verified before preparation.
- Natural fingerprints remain Android `1e1ad87a1fafdfca676015eb142abdfb0188d811` and iOS `5d2be9c332fb6660513531f40f6ffff3254d8048`, identical to the compatible baseline. These differ from installed binary runtime strings. Publication continues only the reviewed legacy runtime lines after exact target resolution; do not force old runtimes onto raw main.
- Broad safety script returned exit **2**, flagging only the existing `app.json` owner metadata and `app.config.js` extra API fallback URLs. Exact diffs reviewed; no new native-surface changes. This exception is not a safety-script pass.
- Production-environment Android and iOS Hermes exports passed with one bundler worker. Both bundles contain `1.1.53`, production API configuration, retained features and price/daily-change feature code absent from freshly downloaded `1.1.52` bundles. Hermes bytecode remains v96; unsupported native loader markers checked.
- Source hashes reverified after export and immediately before publication. Platforms published separately. Live EAS records and production manifests select the new IDs; downloaded CDN launch bundles match manifest hashes and the validated local exports.
- Physical-device receipt, visual smoke checks and current store distribution remain unconfirmed. No Android device connected; no iOS device tested.
- Evidence: `.codex-tmp/ota-1.1.53-evidence`. Inventory `source-parity.json` SHA-256: `3044de621969edd7d3ea19519483cbf432e2a586c75ac8825d7675c32f7d40d2`. Source delta, compatibility decision, tests, TypeScript, environment, native diffs, fingerprints, exports, publish records, manifests and served bundles retained there.


## Archived `1.1.52` and Earlier Records

The following preserves publication-time evidence; the `1.1.53` record above supersedes current-state labels.

> **Historical production OTA: `1.1.52`; superseded by `1.1.53`.**
>
> Published and production manifests/CDN bundles verified `2026-10-08` (Asia/Calcutta).
>
> Released following the user's explicit request for the next Android and iOS OTA, including the current local application source. This record does not authorize another release.

## Previous Production OTA - `1.1.52`

| Field | Android | iOS |
| --- | --- | --- |
| OTA-visible version | `1.1.52` | `1.1.52` |
| State | **LIVE; production manifest and CDN bundle verified** | **LIVE; production manifest and CDN bundle verified** |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `034732a7-34d1-43f3-8a8e-a6a69fb01780` | `653f2e41-38f0-4c92-b0e6-9ada6be1f279` |
| Update ID | `01a11b12-9564-7b02-8396-429a96d54d4c` | `01a11b13-cd3f-70e9-9ef6-b4d54239bb9d` |
| Created (UTC) | `2026-10-08T10:32:45.156Z` | `2026-10-08T10:34:04.991Z` |
| Message | Android production OTA 1.1.52 current local application, guest market and chart updates; reviewed legacy native compatibility | iOS production OTA 1.1.52 current local application, guest market and chart updates; reviewed legacy native compatibility |
| EAS source commit/status | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` (dirty fresh compatible worktree) | Same release source |
| Main source snapshot | 4b6d761cc1b99b4a8cb04f7e57e750e745e098c8 plus current dirty local changes | Same |
| Compatible native binary | `cfe3b101-ab15-4e18-854b-ef808e96d708` / 1.1.11, vc28 | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` / 1.1.10, build30 |
| Manifest | https://u.expo.dev/update/01a11b12-9564-7b02-8396-429a96d54d4c | https://u.expo.dev/update/01a11b13-cd3f-70e9-9ef6-b4d54239bb9d |
| Dashboard | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/034732a7-34d1-43f3-8a8e-a6a69fb01780 | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/653f2e41-38f0-4c92-b0e6-9ada6be1f279 |
| Served bundle SHA-256 | `eb53165331f1add3d20c937f0458b8e35a741fa943e79acd6e29ee4716cd42ca` | `2bf4c7bb4433b71a12fbfd4e20215ff3d6b5e34981a4ccd60cb58bca8c3e1ed5` |
| Physical-device confirmation | Pending; ADB reported no connected Android devices | Pending; no iOS device tested |

Project: `yoforex-organisation/rtx5-app`; EAS project `092a58db-dea9-469a-a383-f27300598812`. Channel, branch and environment: `production`. Update endpoint: `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812`. Effective release config: `rtx5-app/app.config.js`, based on `app.json`. Native Expo version remains `1.1.30`; OTA-visible version is `src/config/appDisplayVersion.ts`.

## Included Source and Compatibility for `1.1.52`

- Fresh compatible worktree: `.codex-tmp/ota-release-1.1.52`, assembled from current local `app`, `src`, `tests`, `scripts` and OTA assets. Compared with the actual published `1.1.51` inventory: **10 changed / 2 added / 0 removed files**.
- **1325 files inventoried and verified; 1321 match local source exactly.** The same four files have recorded optional-native fallbacks: `bugReportAttachments.ts`, `bugReportFilePicker.ts`, `BugReportScreen.tsx` and `shakeToReport/ShakeToReportBugHost.tsx`.
- Includes session-scoped live executable quotes for order readiness and post-margin rechecks, contract-v3 enabled-instrument trading authorization when trade_mode is omitted, normalized trading modes with side restrictions, and chart trade feedback that clears on blur and cannot appear over other tabs. Existing application behavior and earlier guest/demo/broker/performance changes remain included.
- Native dependencies, lockfile, configuration, plugins and native icons match the previously reviewed `1.1.51` baseline byte for byte. Current local native-only changes and attachment/clipboard/shake modules require new native binaries. Text bug reports remain available in this legacy OTA line.

## Validation and Delivery Evidence for `1.1.52`

- **480 full compatible-release test files passed**, executed serially through the existing suite without changing assertions. Main TypeScript and release TypeScript passed. All **19 tests in 5 changed-feature main test files passed**. An initial concurrent main full-suite attempt was deliberately interrupted because of low machine memory; its partial log is retained and is not counted as a pass. The complete compatible-release suite provides the full-source regression result.
- Fresh release dependencies installed from the compatible lockfile. Current repository startup/toolchain support was synchronized and verified separately. EAS CLI remains pinned to 21.4.0; validation used Node v26.9.0.
- EAS authentication, production channel/branch, both compatible native build records and all 12 required production environment variables freshly verified. Both previous `1.1.51` production manifests and served bundle hashes were verified before preparation.
- Natural fingerprints remain Android `1e1ad87a1fafdfca676015eb142abdfb0188d811` and iOS `5d2be9c332fb6660513531f40f6ffff3254d8048`, identical to the measured compatible baseline. These differ from installed binary runtime strings. Publication uses the documented, reviewed continuation of these exact platform runtime lines after target resolution; this is not permission to force old runtimes onto raw main.
- Broad safety script returned exit **2**, flagging only the same `app.json` ownership metadata and `app.config.js` extra API fallback URLs. Exact diffs were reviewed; no new native-surface change was introduced. This exception is not recorded as a safety-script pass.
- Production-environment Hermes exports passed for Android and iOS with one bundler worker to limit memory use. Both bundles contain `1.1.52`, production API configuration, retained features and the new executable-quote code absent from previous served bundles. Hermes bytecode remains v96; unsupported optional native loaders were checked.
- Local and release source hashes were reverified before publishing. Platforms were published separately. Live EAS records and production manifests select the new IDs above; downloaded CDN launch bundles match their manifest hashes and the validated local exports.
- Physical-device receipt, visual smoke checks and current store distribution remain unconfirmed. ADB reported no connected Android devices; no iOS device was tested.
- Evidence: `.codex-tmp/ota-1.1.52-evidence`. Inventory `source-parity.json` SHA-256: `7cc8be5708262c0649a3ae4aa80a45ab3ce84ba4ed0159c5410b4178f593c56d`. Source delta, compatibility decision, test/typecheck/environment logs, fingerprints, exports, publish responses, live EAS records, manifests and served bundles are preserved there.

## Repeatable Flow for the Next OTA

1. Obtain an explicit release request and verify latest live Android/iOS versions before choosing the next version.
2. Create a fresh worktree from the retained compatible baseline's owning Git repository at `C:/Users/S S LAPTOP BAZAAR/.codex/repo-backups/RTX-5Mobile-App-20261007-141018`. The retained release worktree's `.git` file points to that repository. Use the current `rtx5-app/scripts/ota/assemble-compatible-release.js` to synchronize actual local source, record hashes and native adaptations, and compare against this published inventory. Preserve native dependency/configuration/icon baseline; synchronize repository startup/toolchain support separately.
3. Validate exact source parity, full release tests, main changed-feature tests, both TypeScript checks, production environment, native diffs and both natural fingerprints. Export with production environment and verify the new version, changed feature code and bundle hashes. Recheck source hashes before publication.
4. Publish normally when native fingerprints match the intended binaries. The legacy continuation here is limited to this reviewed compatible baseline. New native features require new binaries.
5. Publish separately with `--channel production --environment production --platform <android|ios> --input-dir ota-export-<version> --skip-bundler --non-interactive --json` when platform runtime lines differ. The `update:prod` wrapper owns `--platform all` and must not be overridden.
6. Verify new live EAS groups/update IDs, production manifests and CDN hashes, test physical devices when available, then update this file and [the production baseline](docs/guide/OTA_PRODUCTION_BASELINE.md) with actual results.

## Archived `1.1.51` and Earlier Records

The following preserves publication-time evidence. The `1.1.52` record above supersedes current-state labels in this archive.

> **Historical production OTA: `1.1.51`; superseded by `1.1.52`.**
>
> Published and production manifests/CDN bundles verified `2026-10-07` (Asia/Calcutta).
>
> Released following the user's explicit request for the next Android and iOS OTA, including the current codebase. This record does not authorize another release.

## Previous Production OTA - `1.1.51`

| Field | Android | iOS |
| --- | --- | --- |
| OTA-visible version | `1.1.51` | `1.1.51` |
| State | **LIVE; production manifest and CDN bundle verified** | **LIVE; production manifest and CDN bundle verified** |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `1461001e-6d46-43bd-a345-173b9db3c988` | `b9d8aadf-13b2-429a-a523-ea38c098b8f3` |
| Update ID | `01a11685-17c0-7b0a-90cb-c424d815bd93` | `01a11686-5374-7e91-a414-a31c1e7f9019` |
| Created (UTC) | `2026-10-07T13:19:43.552Z` | `2026-10-07T13:21:04.372Z` |
| Message | Android production OTA 1.1.51 broker selection session preservation, demo investor password and country search fixes, app performance optimizations; reviewed legacy native compatibility | iOS production OTA 1.1.51 broker selection session preservation, demo investor password and country search fixes, app performance optimizations; reviewed legacy native compatibility |
| EAS source commit/status | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` (dirty fresh release worktree) | Same release source |
| Safety-comparison base | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` | Same |
| Main application source snapshot | `4b6d761cc1b9` plus current uncommitted broker/demo/performance changes and OTA display-version change; SHA-256 inventory below | Same |
| Compatible native binary | `cfe3b101-ab15-4e18-854b-ef808e96d708` / 1.1.11, vc28 | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` / 1.1.10, build30 |
| Manifest | https://u.expo.dev/update/01a11685-17c0-7b0a-90cb-c424d815bd93 | https://u.expo.dev/update/01a11686-5374-7e91-a414-a31c1e7f9019 |
| Dashboard | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/1461001e-6d46-43bd-a345-173b9db3c988 | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/b9d8aadf-13b2-429a-a523-ea38c098b8f3 |
| Physical-device confirmation | Pending; ADB reported no connected devices | Pending; no iOS device tested |

Project: `yoforex-organisation/rtx5-app`; EAS project `092a58db-dea9-469a-a383-f27300598812`. Channel, branch and environment: `production`. Update endpoint: `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812`. Effective release config: `rtx5-app/app.config.js`, based on `app.json`. Native Expo version remains `1.1.30`; OTA-visible version is `src/config/appDisplayVersion.ts`.

## Included Source and Compatibility for `1.1.51`

- Fresh worktree: `.codex-tmp/ota-release-1.1.51`, assembled from current local `app`, `src`, `tests`, `scripts` and OTA assets. Compared with the actual `1.1.50` release inventory: **54 changed / 17 added / 0 removed files**.
- **1323 files inventoried and verified; 1319 match local source exactly.** Four files have recorded optional-native fallbacks: `bugReportAttachments.ts`, `bugReportFilePicker.ts`, `BugReportScreen.tsx`, and `shakeToReport/ShakeToReportBugHost.tsx`.
- Includes the Manage Accounts > plus > Brokers session-preservation/navigation fix; demo country-name/ISO/calling-code search; editable Investor Password before one Master Password with validation/show-hide and investor_pass submission; position merging/render identity, storage backpressure, shared instrument/calendar requests, indexed market routing, quote cache cleanup, feed-health timers, bounded Journal caching, and hidden/background screen optimizations. Existing guest/login/trading/chart/UI and text bug-report behavior remains included. Backend acceptance of the submitted investor_pass contract has not been exercised through a real account creation and is documented in BACKEND_TEAM_PROMPT.md. Guest authentication can return an approved order draft; it does not replay a trade mutation.
- The new file-picker type import also maps to the fallback contract. The shared fallback defines the picker option/result types, including cancellation, so legacy release TypeScript passes without installing the new native picker. Main native builds continue using the actual package.
- The native dependency/lockfile/config/build/icon baseline matches `1.1.50` byte for byte. Local native-only icons, plugins, permissions and new attachment/clipboard/shake capabilities require new binaries and are not delivered by this OTA. Unsupported attachment pickers explain the required installed-app update; text reports remain available; shake remains inactive.

## Validation and Delivery Evidence for `1.1.51`

- Full compatible-release suite: **479 test files passed** with file concurrency set to one through the existing runner; TypeScript passed in main and release. The main performance-fix suite passed all 479 test files immediately before this release; the subsequent display-version-only change also passed its focused test and a fresh main TypeScript check. Fresh release dependencies installed from the compatible lockfile. Logs are retained; no test assertions were removed or relaxed.
- Repository startup support (root package scripts, START.bat and workspace toolchain metadata) synchronized for the current startup tests; hashes are recorded in repository-support-parity.json. App-level native dependencies/configuration remain on the compatible baseline. Validation ran with local Node 26.9.0/npm 11.19.1; EAS CLI remained workspace-pinned 21.4.0.
- EAS authentication, live production channel/branch, both compatible native build records and all 12 required production environment variables reverified. Before publication, both `1.1.50` production manifests and CDN bundles were freshly downloaded and hash checked.
- Natural fingerprints: Android `1e1ad87a1fafdfca676015eb142abdfb0188d811`; iOS `5d2be9c332fb6660513531f40f6ffff3254d8048`. Both equal the previous measured compatible baseline. These differ from the installed binary runtime strings: publication uses the reviewed continuation of those platform runtime lines, after checking each effective target. This is not permission to force legacy runtimes onto raw main.
- Broad safety script returned exit **2**, flagging only `app.json` and `app.config.js`. Exact diffs are the previously reviewed owner metadata and two `extra` API fallback URLs. No new native-surface change was found; this exception is not recorded as a safety-script pass.
- Production-environment Android and iOS Hermes exports passed. Both bundles contain `1.1.51`, the production API URL, retained bug-report functionality and four representative demo/search/performance feature markers absent from the freshly served `1.1.50` bundles. Hermes bytecode remains v96. Optional native loader compatibility was checked.
- Source hashes reverified after export and before publishing. Platforms published separately; live EAS groups and production manifests select the new IDs above. Both CDN launch bundles downloaded, contain `1.1.51`, and match their manifest SHA-256 hashes and validated local export hashes.
- Physical-device receipt and visual smoke checks remain pending. ADB reported no connected Android device; no iOS device was tested. Current store-distributed binaries were not independently verified.
- Evidence: `.codex-tmp/ota-1.1.51-evidence`. Inventory `source-parity.json` SHA-256: `137f92075a176f0e0eee2ebac8f8b4296aed9e5c82e712e776b6df9b93c39731`. Source delta: `changes-from-1.1.50.json`; bundle checks: `bundle-validation.json`; full test/typecheck, config diff, fingerprint, export, publish, live EAS, manifest and served bundle records are preserved there.

## Repeatable Flow for the Next OTA

1. Obtain an explicit release request, verify the latest live platform releases, and choose the next version. This snapshot is not authorization for a future release.
2. Use a fresh compatible-baseline worktree from the retained release worktree's owning Git repository when the active clone lacks baseline commit 2975156c. The existing release .git points to the preserved repository under .codex/repo-backups/RTX-5Mobile-App-20261007-141018. Assemble current source with the current `rtx5-app/scripts/ota/assemble-compatible-release.js`. Also synchronize the current workspace toolchain metadata and repository startup support needed by source tests (root package scripts and START.bat), preserving native dependency sections. Review every source adaptation/native exclusion and the delta against the prior published inventory; do not change only a stale worktree's version label.
3. Validate exact source parity, full tests, TypeScript, production environment, native-sensitive diffs and both natural fingerprints. Export with the production environment. Check the new version and representative changed code absent from previous live bundles, then recheck all source hashes.
4. Publish normally when native fingerprint runtimes match. Legacy continuation is limited to this reviewed native baseline and its verified compatible binaries. New native capabilities require new binaries.
5. When platform runtime lines differ, use platform-scoped EAS commands separately. The `update:prod` wrapper owns `--platform all` and must not be overridden. For this release the input directory was `ota-export-1.1.51` with `--channel production --environment production --platform <android|ios> --skip-bundler --non-interactive --json`.
6. Record new EAS identifiers and verify live manifests/CDN hashes and physical devices when available. Update this file and [the production baseline](docs/guide/OTA_PRODUCTION_BASELINE.md) with actual outcomes.

## Archived `1.1.50` and Earlier Records

The following preserves publication-time evidence. The `1.1.51` record above supersedes all current-state labels in this archive.

## Previous Production OTA - `1.1.50`

| Field | Android | iOS |
| --- | --- | --- |
| OTA-visible version | `1.1.50` | `1.1.50` |
| State | **Historical; superseded by 1.1.51; manifest/CDN verified at publication** | **Historical; superseded by 1.1.51; manifest/CDN verified at publication** |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `98b59fdc-fd11-41ac-ba16-07d0ca418e99` | `4c94e68f-a047-40c0-b62c-827d64ea55ef` |
| Update ID | `01a11577-e826-7f05-b852-ab72c17b7d5d` | `01a11578-f1d1-7fa7-acdc-0cb2b5625463` |
| Created (UTC) | `2026-10-07T08:25:42.182Z` | `2026-10-07T08:26:50.193Z` |
| Message | Android production OTA 1.1.50 current guest login and demo flow, broker session restore, chart and UI updates; reviewed legacy native compatibility | iOS production OTA 1.1.50 current guest login and demo flow, broker session restore, chart and UI updates; reviewed legacy native compatibility |
| EAS source commit/status | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` (dirty fresh release worktree) | Same release source |
| Safety-comparison base | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` | Same |
| Main application source snapshot | `ed91c67e` plus OTA version/fallback type changes; SHA-256 inventory below | Same |
| Compatible native binary | `cfe3b101-ab15-4e18-854b-ef808e96d708` / 1.1.11, vc28 | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` / 1.1.10, build30 |
| Manifest | https://u.expo.dev/update/01a11577-e826-7f05-b852-ab72c17b7d5d | https://u.expo.dev/update/01a11578-f1d1-7fa7-acdc-0cb2b5625463 |
| Dashboard | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/98b59fdc-fd11-41ac-ba16-07d0ca418e99 | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/4c94e68f-a047-40c0-b62c-827d64ea55ef |
| Physical-device confirmation | Pending; ADB reported no connected devices | Pending; no iOS device tested |

Project: `yoforex-organisation/rtx5-app`; EAS project `092a58db-dea9-469a-a383-f27300598812`. Channel, branch and environment: `production`. Update endpoint: `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812`. Effective release config: `rtx5-app/app.config.js`, based on `app.json`. Native Expo version remains `1.1.30`; OTA-visible version is `src/config/appDisplayVersion.ts`.

## Included Source and Compatibility for `1.1.50`

- Fresh worktree: `.codex-tmp/ota-release-1.1.50`, assembled from current local `app`, `src`, `tests`, `scripts` and OTA assets. Compared with the actual `1.1.49` release inventory: **212 changed / 125 added / 0 removed files**.
- **1306 files inventoried and verified; 1302 match local source exactly.** Four files have recorded optional-native fallbacks: `bugReportAttachments.ts`, `bugReportFilePicker.ts`, `BugReportScreen.tsx`, and `shakeToReport/ShakeToReportBugHost.tsx`.
- Includes current guest browsing, shared login/demo authentication modal, broker selection, public market routing and snapshots, account/session restore and persistence, chart changes, theme/colors, sidebar/tab/modal interaction updates and text bug reports. Guest authentication can return an approved order draft; it does not replay a trade mutation.
- The new file-picker type import also maps to the fallback contract. The shared fallback defines the picker option/result types, including cancellation, so legacy release TypeScript passes without installing the new native picker. Main native builds continue using the actual package.
- The native dependency/lockfile/config/build/icon baseline matches `1.1.49` byte for byte. Local native-only icons, plugins, permissions and new attachment/clipboard/shake capabilities require new binaries and are not delivered by this OTA. Unsupported attachment pickers explain the required installed-app update; text reports remain available; shake remains inactive.

## Validation and Delivery Evidence for `1.1.50`

- Full main and release suites: **465 test files passed in each**; TypeScript passed in both. Fresh release dependencies installed from the compatible lockfile. The first concurrent release run hit two wall-clock recovery assertions while export/fingerprints were running; both affected files passed in isolation (6 tests), and the complete final release suite passed with test files executed serially. Initial failure logs are retained; no assertions were removed or relaxed.
- Repository startup support (root package scripts, START.bat and workspace toolchain metadata) synchronized for the current startup tests; hashes are recorded in repository-support-parity.json. App-level native dependencies/configuration remain on the compatible baseline. Validation ran with local Node 26.9.0/npm 11.19.1; EAS CLI remained workspace-pinned 21.4.0.
- EAS authentication, live production channel/branch, both compatible native build records and all 12 required production environment variables reverified. Before publication, both `1.1.49` production manifests and CDN bundles were freshly downloaded and hash checked.
- Natural fingerprints: Android `1e1ad87a1fafdfca676015eb142abdfb0188d811`; iOS `5d2be9c332fb6660513531f40f6ffff3254d8048`. Both equal the previous measured compatible baseline. These differ from the installed binary runtime strings: publication uses the reviewed continuation of those platform runtime lines, after checking each effective target. This is not permission to force legacy runtimes onto raw main.
- Broad safety script returned exit **2**, flagging only `app.json` and `app.config.js`. Exact diffs are the previously reviewed owner metadata and two `extra` API fallback URLs. No new native-surface change was found; this exception is not recorded as a safety-script pass.
- Production-environment Android and iOS Hermes exports passed. Both bundles contain `1.1.50`, the production API URL, retained bug-report functionality and three representative guest/session feature markers absent from the freshly served `1.1.49` bundles. Hermes bytecode remains v96. Optional native loader compatibility was checked.
- Source hashes reverified after export and before publishing. Platforms published separately; live EAS groups and production manifests select the new IDs above. Both CDN launch bundles downloaded, contain `1.1.50`, and match their manifest SHA-256 hashes and validated local export hashes.
- Physical-device receipt and visual smoke checks remain pending. ADB reported no connected Android device; no iOS device was tested. Current store-distributed binaries were not independently verified.
- Evidence: `.codex-tmp/ota-1.1.50-evidence`. Inventory `source-parity.json` SHA-256: `a14304053ebe467ac5fa748f014cb013b1b2151639e73aa42ed55f43b45966fa`. Source delta: `changes-from-1.1.49.json`; bundle checks: `bundle-validation.json`; full test/typecheck, config diff, fingerprint, export, publish, live EAS, manifest and served bundle records are preserved there.

## Repeatable Flow for the Next OTA

1. Obtain an explicit release request, verify the latest live platform releases, and choose the next version. This snapshot is not authorization for a future release.
2. Use a fresh compatible-baseline worktree and the current `rtx5-app/scripts/ota/assemble-compatible-release.js`. Also synchronize the current workspace toolchain metadata and repository startup support needed by source tests (root package scripts and START.bat), preserving native dependency sections. Review every source adaptation/native exclusion and the delta against the prior published inventory; do not change only a stale worktree's version label.
3. Validate exact source parity, full tests, TypeScript, production environment, native-sensitive diffs and both natural fingerprints. Export with the production environment. Check the new version and representative changed code absent from previous live bundles, then recheck all source hashes.
4. Publish normally when native fingerprint runtimes match. Legacy continuation is limited to this reviewed native baseline and its verified compatible binaries. New native capabilities require new binaries.
5. When platform runtime lines differ, use platform-scoped EAS commands separately. The `update:prod` wrapper owns `--platform all` and must not be overridden. For this release the input directory was `ota-export-1.1.50` with `--channel production --environment production --platform <android|ios> --skip-bundler --non-interactive --json`.
6. Record new EAS identifiers and verify live manifests/CDN hashes and physical devices when available. Update this file and [the production baseline](docs/guide/OTA_PRODUCTION_BASELINE.md) with actual outcomes.

## Archived `1.1.49` and Earlier Records

The following preserves publication-time evidence. The `1.1.50` record above supersedes all current-state labels in this archive.

## Why Local Changes Were Missing in `1.1.48`

The previous release used the old `.codex-tmp/ota-release-1.1.43` application source and changed only its version label. Current local screens, logic and assets were not synced before export. This was a source-selection problem, not a phone cache problem.

The correction is a fresh release worktree at `.codex-tmp/ota-release-1.1.49`, with the current local `app`, `src`, `tests`, `scripts` and OTA assets synchronized before validation/export. Files deleted locally are also removed from release source. The reviewed native dependency/config/icon baseline is retained for existing binaries.

The reusable [release assembler](rtx5-app/scripts/ota/assemble-compatible-release.js) now records local/release SHA-256 values for every copied file and lists each deliberate native compatibility adaptation. Verify this inventory before publishing; do not bump only a stale worktree's display version again.

## Previous Production OTA - `1.1.49`

| Field | Android | iOS |
| --- | --- | --- |
| OTA-visible version | `1.1.49` | `1.1.49` |
| State | **Historical; superseded by 1.1.50; manifest/bundle verified at publication** | **Historical; superseded by 1.1.50; manifest/bundle verified at publication** |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `07f67708-49f7-47f7-838f-92e6a8740470` | `07c0c58f-b90f-493d-9e1f-dd3067f78a03` |
| Update ID | `01a0fb4c-3e03-7195-85b1-894fb65bc0a9` | `01a0fb4f-3e72-728a-bac4-f64ba6112f9d` |
| Created (UTC) | `2026-10-02T06:27:52.963Z` | `2026-10-02T06:31:09.682Z` |
| Message | `Android production OTA 1.1.49 current local screens, trading and broker logic, journal and text bug reports; legacy native compatibility runtime 30cba832` | `iOS production OTA 1.1.49 current local screens, trading and broker logic, journal and text bug reports; legacy native compatibility runtime ef38da27` |
| EAS source commit/status | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` (dirty isolated worktree) | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` (same release source) |
| Safety-comparison base | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Compatible native binary | `cfe3b101-ab15-4e18-854b-ef808e96d708` / 1.1.11, vc28 | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` / 1.1.10, build30 |
| Manifest | https://u.expo.dev/update/01a0fb4c-3e03-7195-85b1-894fb65bc0a9 | https://u.expo.dev/update/01a0fb4f-3e72-728a-bac4-f64ba6112f9d |
| Dashboard | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/07f67708-49f7-47f7-838f-92e6a8740470 | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/07c0c58f-b90f-493d-9e1f-dd3067f78a03 |
| Physical-device confirmation | Pending; no phone connected after publication | Pending; no iOS device connected |

Project: `yoforex-organisation/rtx5-app`, EAS project `092a58db-dea9-469a-a383-f27300598812`. Channel, branch and environment: `production`. Update endpoint: `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812`. The effective config is `rtx5-app/app.config.js`, based on `app.json`. Native Expo app version remains `1.1.30` in the release config; OTA display version is `src/config/appDisplayVersion.ts`.

## Local Change Coverage and Compatibility

- Compared with the exact `1.1.48` published-source inventory: **142 changed and 46 added application/test/support source files** (0 removed in this comparison).
- **1181 files copied and verified**. **1178 match local source exactly**. This includes current Trade/Quotes/Settings/Journal screens, chart controls, broker routing and trading/account logic, and the new text bug-report flow.
- Exactly **three source files** have limited legacy-native adaptations: `src/features/settings/bugReportAttachments.ts`, `src/features/settings/BugReportScreen.tsx`, `src/features/settings/shakeToReport/ShakeToReportBugHost.tsx`. Optional picker, file-processing, clipboard and sensor imports resolve to a safe fallback for old binaries. Text-only reports and all other copied application code remain available.
- Main source was also fixed: clipboard/pickers/file-system/image-manipulator imports are lazy and guarded at user action time; localization context uses existing Hermes Intl instead of importing a new native localization module at startup. Normal new native builds retain the real native feature packages.
- **Native-only local changes are not delivered by this OTA:** launcher icons, native plugins/permissions, shake sensor and attachment/clipboard modules. The old binaries cannot gain these native capabilities from JavaScript. Full native feature support requires new Android/iOS binaries. In this OTA, unsupported pickers fail gracefully, shake remains inactive, and clipboard copy uses the existing fallback message. No new native dependency is invoked at startup.
- Two existing chart source-contract tests were updated to the actual local controls: fullscreen is in More, and SL/TP routes through the existing press handler. Viewport-recovery, backend-lock, draft-only and no-trade-mutation assertions are retained.

## Validation and Delivery Evidence

- Full tests: **403 test files passed in main and release source**. TypeScript passed in both. Focused fallback/version/chart checks: **47 tests passed**.
- Live project/channel/branch and both compatible EAS native build records were reverified. Production environment check passed all 12 required variables.
- Natural fingerprints equal the previously reviewed native baseline: Android `1e1ad87a1fafdfca676015eb142abdfb0188d811`, iOS `5d2be9c332fb6660513531f40f6ffff3254d8048`. Dependencies, lockfile, native icons, plugins and build configuration stay on that baseline. The broad safety script still flags only `app.json` and `app.config.js`: exact diffs are the previously reviewed owner metadata and two `extra` API fallback URLs. This reviewed exception is not a claim that the script returned a pass.
- Expo Doctor: **17/18 checks passed**; only newer SDK patch advisories. Existing compatible SDK dependency versions were retained.
- Android and iOS production-environment Hermes exports passed. Both bundles contain `1.1.49`, the production API URL and new `/bug-reports/options` feature code absent from the served `1.1.48` bundles. Unsupported native module imports are absent; bytecode version is 96.
- Local and release source hashes were checked against the assembly inventory immediately before publication. All **1181** files matched their recorded hashes; no stale or changed source was exported.
- Published separately to the existing reviewed platform runtime lines, after checking the effective target runtime for each. These are conditional legacy-runtime continuations; do not force old runtimes onto raw main or an unreviewed native surface.
- Live EAS group records and production manifests select the new IDs above. Downloaded CDN launch bundles contain the new feature marker and `1.1.49`; their SHA-256 hashes match the manifests. Physical delivery/visual review is pending, because no Android or iOS device was connected after publication. Current store-distributed binaries were not independently verified.
- Evidence: `.codex-tmp/ota-1.1.49-evidence`. The `source-parity.json` inventory SHA-256 is `0d25bab3957eb2448defda018e68fcab86c727c67e9920479cee5818b32473fc`; `changes-from-1.1.48.json` records the source delta, and `bundle-validation.json` records the exported bundle checks. Logs and live EAS/manifest records are preserved there.

## Correct Release Flow for the Next OTA

1. Confirm user-requested version/scope and live platform runtimes. Use a reviewed compatible native baseline, or new binaries if native changes must ship.
2. From `rtx5-app`, run `node scripts/ota/assemble-compatible-release.js --destination <fresh-baseline-worktree/rtx5-app> --evidence <repository/.codex-tmp/release-evidence/source-parity.json>`. Review every adaptation and native exclusion. Do not reuse an unsynced release source.
3. Validate that every application/source/asset file matches the local inventory except the explicitly recorded native fallbacks. Run full tests, TypeScript, production env checks, native diff review, both natural fingerprints and production-environment export.
4. Check the exported bundles for the requested version **and representative new feature code absent from the prior live bundles**. Verify all source hashes again after export.
5. Publish Android and iOS separately when runtime lines differ; record the new IDs. Validate production manifests, CDN bundle hashes and physical-device receipt. Update this file and the [production baseline](docs/guide/OTA_PRODUCTION_BASELINE.md).

## Archived `1.1.48` and Earlier Records

The following describes previous publication-time state and source coverage. The current `1.1.49` record above supersedes its version-only source decision and current-state labels.

## Previous Production Release - OTA `1.1.48`

This is a **display-version release of the existing compatible production source** retained in `.codex-tmp/ota-release-1.1.43`, whose display version was `1.1.47`. Only `src/config/appDisplayVersion.ts` and its existing test were changed in that release source. It keeps the previous broker-history backfill and startup fixes. The main workspace display-version source/test also now say `1.1.48`.

The latest main workspace was **not synced into this OTA**. It contains new bug-report/shake/attachment native modules, config plugins, and launcher-icon changes. Those require fresh compatible Android/iOS binaries; this OTA does not deliver those features. No native app version, build number, dependency, icon, permission, or plugin was changed in the release worktree.

| Field | Android | iOS |
| --- | --- | --- |
| OTA-visible version | `1.1.48` | `1.1.48` |
| Publication state | **LIVE; production manifest and downloaded bundle verified** | **LIVE; production manifest and downloaded bundle verified** |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `db359ccc-1b11-4b91-9266-f8a891a25be1` | `2ed2d964-662b-4176-97be-feb4f57a60c5` |
| Update ID | `01a0fb25-a7e0-7a16-93fc-dd1cd71dd7f4` | `01a0fb27-0eb6-75f2-bf2b-65f7b8c4fc7d` |
| Created (UTC) | `2026-10-02T05:45:44.160Z` | `2026-10-02T05:47:16.022Z` |
| Message | `Android production OTA 1.1.48 compatible production source display-version update runtime 30cba832` | `iOS production OTA 1.1.48 compatible production source display-version update runtime ef38da27` |
| EAS source commit | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Source state | Dirty isolated release worktree; version-only change for this release | Same source |
| OTA safety-comparison base | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Compatible binary build reference | `cfe3b101-ab15-4e18-854b-ef808e96d708` | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` |
| Binary version/build | `1.1.11 / versionCode 28` | `1.1.10 / build 30` |
| Binary source commit (EAS verified) | `63ddb9817984c4d71c5e265332e3f5e846267625` | `63ddb9817984c4d71c5e265332e3f5e846267625` |
| Manifest | https://u.expo.dev/update/01a0fb25-a7e0-7a16-93fc-dd1cd71dd7f4 | https://u.expo.dev/update/01a0fb27-0eb6-75f2-bf2b-65f7b8c4fc7d |
| Dashboard | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/db359ccc-1b11-4b91-9266-f8a891a25be1 | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/2ed2d964-662b-4176-97be-feb4f57a60c5 |
| Physical-device confirmation | Compatible connected phone showed OTA download/install progress and reopened; final About version confirmation pending | Pending; no iOS device connected |

The iOS EAS build proves runtime compatibility; current App Store distribution and physical-device receipt were not independently confirmed. This release targets the same iOS runtime confirmed live for `1.1.47`, not every historical iOS binary.

## Validation for `1.1.48`

- Production account/project and active `production` channel were verified live. The channel points to the `production` branch. The EAS environment is `production`.
- All 12 required production public environment variables passed the repository check. Both bundles contain `https://superadmin-prod.orrnn.com/api/v2` and the `1.1.48` display version.
- All **384 release test files passed**. Release and main-workspace TypeScript checks passed. The main display-version test also passed.
- Natural native fingerprints before and after the version bump are identical: Android `1e1ad87a1fafdfca676015eb142abdfb0188d811`, iOS `5d2be9c332fb6660513531f40f6ffff3254d8048`. These are the same locally measured native fingerprints recorded for the prior compatible release line.
- The broad OTA safety script reports `app.json` and `app.config.js`. Its exit is **not recorded as a pass**: exact diffs were reviewed and remain the already published owner metadata (`yoforex` to `yoforex-organisation`) and two `extra` API fallback URLs (`superbackend` to `superadmin-prod`). There is no new native-surface change for this release. Dependencies, lockfile, `eas.json`, native icons and config plugins remain on the reviewed compatible baseline.
- Expo Doctor passed **17/18** checks. The only advisory is newer SDK patch versions: Expo `54.0.37`, constants `18.0.14`, updates `29.0.20`. Existing compatible versions `54.0.36 / 18.0.13 / 29.0.19` were retained; no dependency upgrade was shipped.
- A production-environment export generated both Hermes bytecode-v96 bundles. No new clipboard/image-picker/document-picker/sensor native module is referenced in either bundle.
- Android and iOS were published separately, using the previously reviewed continuation of their platform runtime lines. Explicit target runtime resolution was checked before each publish. The local natural fingerprints differ from the installed-binary runtime values; **do not treat forced targeting as a general shortcut**.
- Live EAS update records and the two newest production groups match the IDs above. Production manifest requests with platform, runtime and channel headers select the new updates. Both CDN launch bundles downloaded, contain `1.1.48`, and match their manifest SHA-256 hashes. Asset headers from the protocol's extensions part are required; see the [Expo Updates protocol](https://docs.expo.dev/technical-specs/expo-updates-1/).
- Android phone: installed `com.rtx5.app` `1.1.11/versionCode 28` verified through ADB. Its OTA dialog reached 99% installation, and the app reopened with trading screens rendered. No AndroidRuntime fatal error was returned by the smoke-check log query. Final About-screen version confirmation was not completed: the phone became locked during that check. Do not treat this as confirmation of the displayed version. No iOS physical-device check was possible.
- Exact release-source file hashes are saved locally in `.codex-tmp/ota-1.1.48-evidence/release-source-sha256.json`; that inventory's SHA-256 is `438ea18aec615cdc68911c55d6eaea55378d1e6377b39dccbacf73f9b54e26c9`. Validation logs, EAS records, manifests and phone screenshots are in the same evidence directory. The inventory covers `app`, `src`, `tests` and `scripts`.

## Production Configuration and Update Flow

| Setting | Production value |
| --- | --- |
| Expo owner/project | `yoforex-organisation/rtx5-app` |
| EAS project ID | `092a58db-dea9-469a-a383-f27300598812` |
| Update URL | `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812` |
| Channel / branch / environment | `production / production / production` |
| Channel ID | `019e4e07-2048-7da5-b4e7-e6d115eac5f2` |
| Branch ID | `019e4e07-1eb3-7000-bd63-d79591ead50e` |
| Effective config | `app.config.js` based on `app.json` |
| Normal runtime policy | `fingerprint` |
| Native update setting | Enabled; `checkAutomatically: NEVER`; app launch hook performs the update check |
| Display version | `src/config/appDisplayVersion.ts`; may be overridden by `EXPO_PUBLIC_APP_DISPLAY_VERSION` |
| Native Expo app version in release config | `1.1.30`; unchanged by this OTA |
| EAS CLI | Workspace-pinned `21.4.0` through `scripts/run-eas-cli.js` |

The installed production app checks for an update through `useOtaUpdateOnLaunch()`. Expo selects the newest update matching its channel, platform and native runtime. The app downloads that update and its assets, then reloads to apply it. The OTA-visible display version is independent of the installed native binary version.

For every future OTA:

1. Obtain an explicit user release request and confirm the requested version/scope. Verify live production state rather than copying this snapshot.
2. Verify intended installed/store binaries and their runtimes. Preserve an OTA-compatible native dependency/config baseline. Native module, plugin, permission, icon or native build changes require new binaries.
3. Change the display-version source and test, then validate the exact release source: TypeScript, full tests, production environment, native-sensitive diff review, both natural fingerprints and export. Do not sync raw main into this legacy runtime line.
4. Normally publish only when fingerprint runtimes match the binaries. The legacy continuation used here is limited to the deliberately reviewed compatible source. Never force an old runtime onto unreviewed source.
5. Publish Android and iOS separately when runtimes differ. The `update:prod` wrapper owns `--platform all` and must not be overridden. This release used platform-scoped `eas update --channel production --environment production --platform <android|ios> --input-dir ota-export-1.1.48 --skip-bundler --non-interactive --json` commands after the checks above.
6. Verify new EAS groups, update IDs, timestamps, production manifests, bundle hashes and physical-device receipt. Update this file and the production baseline only with actual results. Every publish gets new IDs.

## Previous Production OTA - `1.1.47`

Live EAS and both served bundles were freshly verified before publishing `1.1.48`. Published 2026-09-29; it backfills stale broker candle history from the live feed so XAUUSD history reaches the live edge.

| Field | Android | iOS |
| --- | --- | --- |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `975d1828-2898-4e51-81f6-8b35316315b6` | `dd321050-d417-4858-8e74-c1831f8728d1` |
| Update ID | `01a0ecaa-c06a-725d-a0fd-25c5d226a4b6` | `01a0ecae-34d5-7935-a896-511c7808aa44` |
| Created (UTC) | `2026-09-29T10:16:48.490Z` | `2026-09-29T10:20:34.901Z` |
| Dashboard | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/975d1828-2898-4e51-81f6-8b35316315b6 | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/dd321050-d417-4858-8e74-c1831f8728d1 |

## Reconciled Release History - `1.1.46` and `1.1.45`

The previous document incorrectly still identified `1.1.45` as current. Live EAS history shows that release was rolled back on both platforms because it failed to launch:

- Android rollback to `1.1.44`: group `c9be65ee-c285-4478-9b8f-945c94a691ed`.
- iOS rollback to `1.1.44`: group `fd7433da-1f83-479a-ad05-ff4a1941b20b`.
- Android `1.1.46`: group `fc639d10-b8a0-498d-95d2-a93f0ba3867a`; message records removal of root-layout module-scope diagnostics to fix the `1.1.45` launch crash.
- Both platforms were then updated to `1.1.47`, and now `1.1.48`. There is no independently verified iOS `1.1.46` publication in the reviewed history.

The following older records describe their publication-time state. They are historical evidence, not current production destinations or authorization to republish.

## Historical Production OTA - `1.1.45` (rolled back)

Published 2026-09-29. It is `1.1.44` plus the following:
1. **Chart-history fallback, matching the web terminal:** when the broker's v2 `/candles` request fails or returns no bars on an initial load, the app reads `{broker service root}/api/v1/candles?symbol&tf&limit`. This is the same broker's live-feed candle service, and it holds about the last day of bars.
2. **Journal diagnostics (Settings > Journal, Network):** the app records chart-history fallbacks and failures, and any chart that still has no history after 10 s.
3. **Clipped trade-history drawing:** arrows and connectors are clipped to the plot area, so they no longer draw over the right price scale while scrolling.

| Field | Android | iOS |
| --- | --- | --- |
| OTA-visible version at publication | `1.1.45` | `1.1.45` |
| Publication state | **Published at that time; superseded** | **Published at that time; superseded** |
| Runtime (forced, same line as 1.1.31-1.1.44) | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `9c4dc796-0413-4f0a-bc80-d1ad5630adae` | `d62f08ce-1c3d-4171-9967-ae2d337d7313` |
| Update ID | `01a0ec0b-6360-7f4e-9e3c-8aa987658da8` | `01a0ec0d-9732-70c6-a77d-75392778e0da` |
| Created | `2026-09-29T07:22:44.448Z` | `2026-09-29T07:25:08.786Z` |
| Message | `Android production OTA 1.1.45 XAUUSD history feed fallback, chart history journal, arrows clipped at price scale runtime 30cba832` | `iOS production OTA 1.1.45 XAUUSD history feed fallback, chart history journal, arrows clipped at price scale runtime ef38da27` |
| EAS source commit | `2975156c...*` (worktree `.codex-tmp/ota-release-1.1.43`, re-synced) | same |
| Dashboard | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/9c4dc796-0413-4f0a-bc80-d1ad5630adae | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/d62f08ce-1c3d-4171-9967-ae2d337d7313 |

Validation for `1.1.45`:
- **Native fingerprint:** unchanged, Android `1e1ad87a...` and iOS `5d2be9c3...`.
- **Safety script:** it flags only `app.json` and `app.config.js`, the same metadata-only changes as before.
- **Tests:** all 384 test files pass and `tsc` is clean in both main and the release tree.
- **Local export:** the bundles contain the version, the `superadmin-prod` URLs, `/api/v1/candles`, the Journal diagnostics, and the plot-clip layer (UTF-16 in the WebView HTML).
- **Physical-device confirmation:** still pending.

## Previous Production OTA - `1.1.44`

Published 2026-09-29. This is `1.1.43` plus thin trade-history arrows, drawn as a DOM SVG stem with an open head. The arrow's tip sits exactly on the deal price at the deal's candle; it replaces the library's filled series-marker arrows.

| Field | Android | iOS |
| --- | --- | --- |
| OTA-visible version at publication | `1.1.44` | `1.1.44` |
| Publication state | **Published at that time; superseded** | **Published at that time; superseded** |
| Runtime (forced, same line as 1.1.31-1.1.43) | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `3917a645-43ca-4c36-a335-7a6bf6257933` | `680f04ea-5504-4d02-b4fc-1202dd363390` |
| Update ID | `01a0ebe1-ee48-7118-b179-ae4d3f0acf3a` | `01a0ebe4-26c1-7a25-9d64-1ca23d5a04b1` |
| Created | `2026-09-29T06:37:27.496Z` | `2026-09-29T06:39:53.025Z` |
| Message | `Android production OTA 1.1.44 thin trade history arrows at exact deal price runtime 30cba832` | `iOS production OTA 1.1.44 thin trade history arrows at exact deal price runtime ef38da27` |
| EAS source commit | `2975156c...*` (same isolated worktree `.codex-tmp/ota-release-1.1.43`, re-synced) | same |
| Dashboard | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/3917a645-43ca-4c36-a335-7a6bf6257933 | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/680f04ea-5504-4d02-b4fc-1202dd363390 |

Validation for `1.1.44`:
- **Source:** synced from main. It differs from `1.1.43` only in `ChartWebViewHtml.ts`, its contract test and the display version.
- **Native fingerprint:** unchanged, Android `1e1ad87a...` and iOS `5d2be9c3...`.
- **Safety script:** it flags only `app.json` (owner) and `app.config.js` (the `extra` URLs), the same as `1.1.43`.
- **Tests:** all 383 test files pass and `tsc` is clean in both main and the release tree.
- **Local export:** both bundles contain the new arrow code. Hermes stores the WebView HTML as UTF-16, so search for it with a UTF-16 search.
- **Physical-device delivery confirmation:** still pending.

## Previous Production OTA - `1.1.43`

Published 2026-09-29. It contains contract v3 (Trivanta and Orrnn only, no feed tokens) and these fixes:
- the broker server "unavailable" label
- chart history load time
- symbol switch time

| Field | Android | iOS |
| --- | --- | --- |
| OTA-visible version at publication | `1.1.43` | `1.1.43` |
| Publication state | **Published at that time; superseded** | **Published at that time; superseded** |
| Runtime (forced, same line as 1.1.31-1.1.42) | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `1672f744-3c91-45cb-90c4-c7f5585b3de2` | `ea339e2a-e018-48c2-8486-659c4356fcbf` |
| Update ID | `01a0eba8-c175-76f6-84b5-08135300ce67` | `01a0ebab-6152-7189-94d5-1e90ba7e2da4` |
| Created | `2026-09-29T05:35:00.469Z` | `2026-09-29T05:37:52.466Z` |
| Message | `Android production OTA 1.1.43 broker status, chart load and symbol switch fixes runtime 30cba832` | `iOS production OTA 1.1.43 broker status, chart load and symbol switch fixes runtime ef38da27` |
| EAS source commit | `2975156c...*` (dirty isolated worktree `.codex-tmp/ota-release-1.1.43`) | same |
| OTA safety-comparison base | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` | same |
| Dashboard | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/1672f744-3c91-45cb-90c4-c7f5585b3de2 | https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/ea339e2a-e018-48c2-8486-659c4356fcbf |

Release source and validation for `1.1.43`:
- **Main line:** it was on Expo SDK 57 and was downgraded to the SDK 54 dependency set of the installed binaries before this release. The SDK 57 tree is backed up at `refs/backup/sdk57-contract-v3`.
- **Sync:** `app`, `src`, `tests`, `scripts`, `.env`, `.env.example` and `app.config.js` were synced into a fresh worktree at `2975156c`. The worktree ran `npm ci` from the baseline lockfile, and `app.json` carries only the owner change.
- **Native fingerprint:** unchanged by the sync. Measured on this machine it is Android `1e1ad87a...` and iOS `5d2be9c3...`. The documented `cfd5f88a/6ab0fec7` values are not reproducible here, because `2975156c` has no `.gitattributes` and the fingerprint hashes CRLF and LF checkouts differently.
- **Safety script:** it flags `app.json` (owner) and `app.config.js`. The `app.config.js` diff is only the two `extra` fallback URLs, `superbackend` changed to `superadmin-prod`. The fingerprint skips the extra section, so the change is fingerprint-neutral.
- **Tests:** all 383 test files pass and `tsc` is clean in the release tree. A local `expo export` of both platforms bundles `superadmin-prod`, contains no `superbackend` and no `ExpoClipboard`, and shows version `1.1.43`.
- **EAS production env:** `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL` were changed from `superbackend.orrnn.com`, which now serves an HTML admin page, to `https://superadmin-prod.orrnn.com/api/v2`.
- **Physical-device delivery confirmation:** still pending on both platforms.

## Previous Production OTA - `1.1.42`

This was the live OTA until `1.1.43`. These identifiers are recorded so
the next agent can understand the existing Android and iOS release; they are not
instructions to publish it again.

| Field | Android | iOS |
| --- | --- | --- |
| OTA-visible version at publication | `1.1.42` | `1.1.42` |
| Publication state | **Historical; superseded** | **Historical; superseded** |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `f1932556-51e4-4e82-bb65-34f5113e2a7b` | `34458613-1b82-4fad-9b2b-5826b2377130` |
| Update ID | `01a02820-cef1-7d13-a3c0-08cb2bca0781` | `01a02823-ca49-7de1-834c-7d6c169beb28` |
| EAS source commit | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Source status | Dirty isolated release worktree (`2975156...*`) | Dirty isolated release worktree (`2975156...*`) |
| OTA safety-comparison base used | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Main-line product source snapshot synced into the release worktree | `76ca44f183a654b9885904bffd84c25cb4375248` | `76ca44f183a654b9885904bffd84c25cb4375248` |
| Channel / branch / environment | `production` / `production` / `production` | `production` / `production` / `production` |
| Created | `2026-08-22T06:20:33.905Z` | `2026-08-22T06:23:49.321Z` |

The isolated release worktree lives at `.codex-tmp/ota-release-1.1.41` (linked
git worktree, detached at `2975156c...`, kept dirty with main's app code).
Do not delete it during repo cleanups; if lost, rebuild per the baseline guide.

The isolated source contains 814 changed paths against `2975156c...` inside
`rtx5-app` (790 tracked modifications plus 24 newly added app/test source
files, including `design-qa.md` and `poll2.png`). The only native-sensitive
path is `app.json`, and its exact diff remains the ownership metadata change
`yoforex` to `yoforex-organisation` already used by live OTA `1.1.40`. The
project ID, update URL, platform runtimes, native settings, and dependencies
remain unchanged; main's `package.json` dependency sections and the full
lockfile package set were re-verified identical to the baseline before syncing
(0 added, 0 removed, 0 version-changed packages).
