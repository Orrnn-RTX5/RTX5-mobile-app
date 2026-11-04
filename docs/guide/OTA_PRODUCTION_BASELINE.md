# RTX5 Production OTA Baseline

> **CURRENT 2026-11-03: PRODUCTION STORE BUILDS & XPREM OTA `1.1.62` ARE LIVE FOR ANDROID (PLAY STORE `.aab` + INTERNAL `.apk`) AND IOS (APP STORE `.ipa`).**
>
> Built, published, and verified at the user's explicit request to ship `1.1.62` production builds for Google Play Store and Apple App Store while preserving locked XPrem OTA runtime compatibility across Android and iOS.
>
> **Android Play Store Production Build (`.aab`)**:
> - Version / Version Code: `1.1.62` / `42` (`--profile production`, distribution `STORE`)
> - EAS Build ID: `84e7a097-c743-428e-9f98-6c1625ce598b` (**FINISHED** in `658s`)
> - Build Dashboard: https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/builds/84e7a097-c743-428e-9f98-6c1625ce598b
> - Direct `.aab` Download: https://expo.dev/artifacts/eas/acdVe_wGlcAjDVDyMkYf7u1MnU3ODKQKUkP_SkCVYN0.aab
> - Android Internal `.apk` (same runtime): https://expo.dev/artifacts/eas/y3yY8bhNVsCkIthyDTspnDA1PM_VVNzyoGr_bNXICac.apk (Build `db4a69d2-6388-4a58-88fa-63e6d13879de`)
> - Locked Android Runtime Version: `797dea98b258410dcbd80a727586f6af607da932`
>
> **iOS App Store Production Build (`.ipa`)**:
> - Version / Build Number: `1.1.62` / `37` (`--profile production`, distribution `STORE`)
> - EAS Build ID: `7bdd5a75-485f-42c9-9dd1-0e60a6b62f07` (**FINISHED** in `401s`)
> - Build Dashboard: https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/builds/7bdd5a75-485f-42c9-9dd1-0e60a6b62f07
> - Direct `.ipa` Download: https://expo.dev/artifacts/eas/3dWnKszYsSVaMWvDPdai0ZBHZmHRxu8iQ_klQO6xCeQ.ipa
> - Locked iOS Runtime Version: `44d9c3b64f5b6fd221136b861e597bdbf62da208`
>
> **Live XPrem OTA `1.1.62` Release**:
> - XPrem Endpoint: `https://otadeploy.yopips.com/manifest`
> - XPrem App ID (`expo-app-id`): `b83d7191-d5ac-4b58-b850-8979759fe290`
> - XPrem Channel (`expo-channel-name`): `yoforex-rtx5` -> Branch: `rtx5-production`
> - Publish Group ID: `a20b75f5-2aad-4471-8db8-ecdb5a906d58`
> - Android Primary OTA (`797dea98b258410dcbd80a727586f6af607da932`): Update ID `17936906941762`, Manifest UUID `df426f2d-061f-49b9-637e-b8abb791aac0`, Created `2026-11-03T07:24:56.871Z`, Launch Asset `f9b27e3ed9b5ab4822ff4fa3b15e928e.hbc` (`HTTP 200` verified).
> - iOS Primary OTA (`44d9c3b64f5b6fd221136b861e597bdbf62da208`): Update ID `17936907575041`, Manifest UUID `9efc75c6-94c1-b8a1-893d-5e73aab63ed0`, Created `2026-11-03T07:25:58.647Z`, Launch Asset `b434e6b03a0526c985f77b4b688a2436.hbc` (`HTTP 200` verified).
> - Future OTA Command: Bump `APP_DISPLAY_VERSION` in `rtx5-app/src/config/appDisplayVersion.ts` (and its test), then run `npm run update:xprem -- -m "OTA <version>: <summary>"` from `rtx5-app`. Do not alter `updates.url`, `expo-app-id`, `expo-channel-name`, `fingerprint.config.js`, or native dependencies. [Full publication record and repeatable workflow](../../OTA_UPDATE_INFORMATION.md).

> **PREVIOUS 2026-10-30: PRODUCTION OTA `1.1.57`; SUPERSEDED BY `1.1.62` ABOVE.**
>
> Includes the `rtx-s3` pending-order cancel/modify single-identity (`client_order_id` = `Idempotency-Key`), decimal-string wire serialization, 35 s timeout, 202/401/409/503/network retry & reconciliation contract, `orders.{login}` `pending_updated` handling, investor read-only pending action hiding, full Login layout when opening New Order from the guest Quotes symbol ActionSheet, thin (`1px`) chart SL/TP lines, and compact chart SL/TP money delta labels without `USD` text. Retains 1.1.56 bulk actions, orange pending chart lines until confirmed execution, and compact chart controls.
>
> Android: runtime `30cba83220fc6c92180eed477863c3e3e3087ce6`, group `003c7d91-99d2-492f-9a31-f83c0193bf31`, update `01a18bcf-6eef-75eb-9c16-ae05596d1eab`, created `2026-10-30T07:56:29.807Z`. Served bundle SHA-256 `33cf41a6b29c8851d8db972b92e52508047d417a45840a3050dde5138e842630`. Compatible binary `cfe3b101-ab15-4e18-854b-ef808e96d708` (1.1.11/vc28).
>
> iOS: runtime `ef38da275b765380037fc377f5c596de31690b7d`, group `0c7303e3-da5d-47af-86d3-1bc6399e0a1d`, update `01a18bd0-4227-762c-b8fc-a032b7385d4a`, created `2026-10-30T07:57:23.879Z`. Served bundle SHA-256 `5e58c5b7d25b1f4a543e63fb86f1470b8c7b570228966e397d421c0b762772c2`. Compatible binary `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` (1.1.10/build30).
>
> 1449 inventoried files; 1446 exact main-source matches; three retained optional-native adaptations. 30 changed / 1 added / 0 removed files versus 1.1.56; native baseline unchanged. All 551 release test files, main changed-feature tests (22 files / 250 tests), both TypeScript checks and production exports passed. EAS, production manifests and CDN hashes match validated exports. Physical-device receipt/visual checks and current store distribution remain unconfirmed. Safety exit 2 contains only reviewed metadata/extra-URL exceptions.
>
> Worktree: `.codex-tmp/ota-release-1.1.57-20261030`; evidence: `.codex-tmp/ota-1.1.57-20261030-evidence`; source inventory SHA-256: `f70193c44af52eef3cd71364a75392643158f78e6358e8c4bcc898acdd25f325`. Natural fingerprints: `1e1ad87a1fafdfca676015eb142abdfb0188d811` / `5d2be9c332fb6660513531f40f6ffff3254d8048`. Continue only the reviewed compatible baseline; never force legacy runtimes onto raw main. [Full publication record and future flow](../../OTA_UPDATE_INFORMATION.md).

> **PREVIOUS 2026-10-29: PRODUCTION OTA `1.1.56`; SUPERSEDED BY `1.1.57` ABOVE.**
>
> Includes pending-order bulk review/deletion, refined Trade pending cards, an empty-Positions Bulk guard, centered back controls, accurate login errors and preservation of existing pending SL/TP. Retains orange pending chart lines until confirmed execution and compact chart controls. Physical Android login reproduction remains unconfirmed.
>
> Android: runtime `30cba83220fc6c92180eed477863c3e3e3087ce6`, group `782e0e25-3ef4-4491-9e93-723eecdaaac3`, update `01a1873b-2801-72af-baf8-26665d73b1de`, created `2026-10-29T10:36:03.457Z`. Compatible binary `cfe3b101-ab15-4e18-854b-ef808e96d708` (1.1.11/vc28).
>
> iOS: runtime `ef38da275b765380037fc377f5c596de31690b7d`, group `87251afb-8065-4a4e-aa48-3a8b485302a4`, update `01a1873c-1f75-7279-a080-25f3a4e07d4d`, created `2026-10-29T10:37:06.805Z`. Compatible binary `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` (1.1.10/build30).
>
> 1448 inventoried files; 1445 exact main-source matches; three retained optional-native adaptations. 18 changed / 5 added / 0 removed files versus 1.1.55; native baseline unchanged. All 550 release test files, main changed-feature tests, both TypeScript checks and production exports passed. EAS, production manifests and CDN hashes match validated exports. Physical-device receipt/visual checks and current store distribution remain unconfirmed. Safety exit 2 contains only reviewed metadata/extra-URL exceptions.
>
> Worktree: `.codex-tmp/ota-release-1.1.56-20261029`; evidence: `.codex-tmp/ota-1.1.56-20261029-evidence`; source inventory SHA-256: `4dfa8cb5ba9db03aa7aec736a56a059412a38a423dd68867a56b37f21a2de4fc`. Natural fingerprints: `1e1ad87a1fafdfca676015eb142abdfb0188d811` / `5d2be9c332fb6660513531f40f6ffff3254d8048`. Continue only the reviewed compatible baseline; never force legacy runtimes onto raw main. [Full publication record and future flow](../../OTA_UPDATE_INFORMATION.md).

> **PREVIOUS 2026-10-28: PRODUCTION OTA `1.1.55` PENDING-ORDER LIFECYCLE CORRECTION IS LIVE FOR ANDROID AND IOS.**
>
> Pending orders remain orange until broker-confirmed execution. Filled orders use regular market-position styling and the confirmed ticket/fill price; stale pending updates cannot restore them. Compact inline phone SL/TP controls are retained. Display version remains 1.1.55 at the user's request.
>
> Android: runtime `30cba83220fc6c92180eed477863c3e3e3087ce6`, group `db89529f-d459-471d-9f66-4d4a66649159`, update `01a1815a-7f46-7377-9dab-8df2b87139d4`, created `2026-10-28T07:12:34.118Z`. Compatible binary `cfe3b101-ab15-4e18-854b-ef808e96d708` (1.1.11/vc28).
>
> iOS: runtime `ef38da275b765380037fc377f5c596de31690b7d`, group `b87ea0e3-e68f-4ead-a7c8-96255afa9f6f`, update `01a1815b-61a6-785a-834e-f2490b38c9f1`, created `2026-10-28T07:13:32.070Z`. Compatible binary `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` (1.1.10/build30).
>
> 1443 inventoried files; 1440 exact local matches; three retained optional-native adaptations. 3 changed files versus the prior chart update; native baseline unchanged. 548 full release test files, main regressions in 12 files, both TypeScript checks, Chromium checks and production exports passed. Disassembled pending-entry functions use orange. EAS, production manifests and CDN hashes match validated exports. Physical-device checks and current store distribution remain unconfirmed. Safety exit 2 contains only reviewed metadata/extra-URL exceptions.
>
> Worktree: `.codex-tmp/ota-release-1.1.55-pending-lifecycle-20261028`; evidence: `.codex-tmp/ota-1.1.55-pending-lifecycle-20261028-evidence`; source inventory SHA-256: `9f43ef46f1e955eae99e59ab9e97eac5159e96a819afa1c8209afe4707f553ec`. Natural fingerprints: `1e1ad87a1fafdfca676015eb142abdfb0188d811` / `5d2be9c332fb6660513531f40f6ffff3254d8048`. Continue only the reviewed compatible baseline; never force legacy runtimes onto raw main. [Full publication record and future flow](../../OTA_UPDATE_INFORMATION.md).

> **PREVIOUS 2026-10-28: SAME-VERSION CHART FIX; SUPERSEDED BY THE PENDING-ORDER LIFECYCLE CORRECTION ABOVE.**
>
> Compact inline phone SL/TP controls replace the tall two-row panel. Placed pending Buy guides/labels/badges are blue; Sell guides/labels/badges are red. Pending rows stay on exact order prices. Display version remains 1.1.55 at the user's request.
>
> Android: runtime `30cba83220fc6c92180eed477863c3e3e3087ce6`, group `f0356628-f4c1-4f41-b055-d4ce2d4e74d0`, update `01a18125-8f50-71e4-a457-3b4c81266491`, created `2026-10-28T06:14:44.816Z`. Compatible binary `cfe3b101-ab15-4e18-854b-ef808e96d708` (1.1.11/vc28).
>
> iOS: runtime `ef38da275b765380037fc377f5c596de31690b7d`, group `82552ea4-7cce-45c3-be76-f678041f2d13`, update `01a18126-7276-731c-897b-00e13bedef97`, created `2026-10-28T06:15:42.966Z`. Compatible binary `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` (1.1.10/build30).
>
> 1443 inventoried files, 1440 exact local matches, three retained optional-native adaptations. 7 changed files versus initial 1.1.55; native baseline unchanged. 548 full release test files, main regressions in 11 files, both TypeScript checks and production exports passed. Real Chromium/minified-renderer layout checks passed; physical-device receipt/visual checks and current store distribution remain unconfirmed. Safety exit 2 matches only reviewed metadata/extra-URL exceptions. Live EAS, production manifests and CDN hashes match validated exports.
>
> Worktree: `.codex-tmp/ota-release-1.1.55-chart-fix-20261028`; evidence: `.codex-tmp/ota-1.1.55-chart-fix-20261028-evidence`; source inventory SHA-256: `1cb64a1cec364d1e1db89941759d5fb6e477b7317e09fdf9c3cdd350f250d1ac`. Natural fingerprints: `1e1ad87a1fafdfca676015eb142abdfb0188d811` / `5d2be9c332fb6660513531f40f6ffff3254d8048`. Continue only the reviewed compatible baseline; do not publish raw main with forced legacy runtimes. [Full release record and future flow](../../OTA_UPDATE_INFORMATION.md).

> **PREVIOUS 2026-10-27: INITIAL PRODUCTION OTA `1.1.55`; SUPERSEDED BY THE SAME-VERSION CHART FIX ABOVE.**
>
> Fresh current-source release: `.codex-tmp/ota-release-1.1.55-20261027`; 1443 inventoried files, 1440 exact local matches and three optional attachment/clipboard fallbacks. Native baseline is byte-identical to 1.1.54. Includes broker-login retention, decimal-price crash/drag/wheel fixes, portable expiration controls, backend Margin Level zero fallback and current application changes.
>
> Android: runtime `30cba83220fc6c92180eed477863c3e3e3087ce6`, group `988d2a5b-0206-46ba-9f35-c9180eb17d3a`, update `01a17d56-e3d4-7a4e-9ab4-7f24099f5950`, created `2026-10-27T12:30:08.852Z`. Compatible binary `cfe3b101-ab15-4e18-854b-ef808e96d708` (1.1.11/vc28).
>
> iOS: runtime `ef38da275b765380037fc377f5c596de31690b7d`, group `aba556ee-db26-489b-b03d-222d07fad68e`, update `01a17d57-f972-7881-a3ee-f0cb912de972`, created `2026-10-27T12:31:19.922Z`. Compatible binary `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` (1.1.10/build30).
>
> 548 full release test files and main regressions in 107 files passed; both TypeScript checks and production exports passed. Natural fingerprints remain `1e1ad87a1fafdfca676015eb142abdfb0188d811` / `5d2be9c332fb6660513531f40f6ffff3254d8048`. Safety exit 2 matches only reviewed owner/extra-URL changes, not a safety-script pass. Live EAS, production manifests and CDN hashes match validated exports. Physical-device receipt/visual checks and current store distribution remain unconfirmed.
>
> [Release identifiers, validation and next-release flow](../../OTA_UPDATE_INFORMATION.md). Evidence: `.codex-tmp/ota-1.1.55-20261027-evidence`; inventory SHA-256 `81e1870e49b49f8810e579256b0292704bbeec82beb307ae2e8a50808fe08714`. Do not publish raw main or blindly force legacy runtimes.

> **PREVIOUS 2026-10-14: PRODUCTION OTA `1.1.54`; SUPERSEDED BY `1.1.55`.**
>
> Current local source assembled in fresh worktree `.codex-tmp/ota-release-1.1.54`. 87 changed / 29 added / 0 removed files versus the live 1.1.53 shake publication; 1375 files inventoried, 1372 identical to local. Three optional attachment/clipboard adaptations retained. Includes current chart position controls, calendar, trading/history/UI and OTA prompt/reload changes; native dependencies/configuration/icons unchanged.
>
> Android: runtime `30cba83220fc6c92180eed477863c3e3e3087ce6`, group `5682837f-6abd-4906-b513-74d6854c6c67`, update `01a13aa1-f394-74a6-8961-7e1d186502cb`, created `2026-10-14T13:37:34.612Z`. Compatible binary `cfe3b101-ab15-4e18-854b-ef808e96d708` (1.1.11/vc28).
>
> iOS: runtime `ef38da275b765380037fc377f5c596de31690b7d`, group `144526b3-6a4c-4d79-964e-8a3c12371c1e`, update `01a13aa3-1499-7751-9235-72493db42406`, created `2026-10-14T13:38:48.601Z`. Compatible binary `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` (1.1.10/build30).
>
> 503 full release test files and 348 main regression tests in 42 files passed; both TypeScript checks and production exports passed. Nine stale UI test expectations corrected without product changes. Natural fingerprints remain `1e1ad87a1fafdfca676015eb142abdfb0188d811` / `5d2be9c332fb6660513531f40f6ffff3254d8048`; legacy targets resolved separately. Safety exit 2 matches only the reviewed owner metadata/extra API URL exception. Live EAS, production manifests and CDN hashes match validated exports. Physical-device receipt/visual checks and current store distribution remain unconfirmed.
>
> [Current release record and next-release flow](../../OTA_UPDATE_INFORMATION.md). Evidence: `.codex-tmp/ota-1.1.54-evidence`; inventory SHA-256 `8be6703292bb9c9af92ea6faa4a7eb93abd5f618056a33fdad9e689ee4fc2c99`. Historical records follow; do not publish raw main or blindly force legacy runtimes.


> **PREVIOUS 2026-10-12: PRODUCTION OTA `1.1.53` SAME-VERSION SHAKE FIX; SUPERSEDED BY 1.1.54.**
>
> Current local source assembled in fresh worktree `.codex-tmp/ota-release-1.1.53-shake`. 1 changed / 4 added / 0 removed versus the initial 1.1.53; 1346 files inventoried, three attachment/clipboard adaptations. Shake now uses existing Reanimated native accelerometer support; no dependency or native configuration changed.
>
> Android: runtime `30cba83220fc6c92180eed477863c3e3e3087ce6`, group `7cff7e10-cd9f-474b-b477-516baa7d0d91`, update `01a12f9b-8272-7270-b234-65ef8d900a54`, created `2026-10-12T10:14:43.058Z`. Compatible binary `cfe3b101-ab15-4e18-854b-ef808e96d708` (1.1.11/vc28).
>
> iOS: runtime `ef38da275b765380037fc377f5c596de31690b7d`, group `ec8b46f8-72dc-41e0-9e87-5988c7312f1a`, update `01a12f9c-ceeb-7908-a171-a49a0054e582`, created `2026-10-12T10:16:08.171Z`. Compatible binary `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` (1.1.10/build30).
>
> 492 full release test files and 47 main regression tests passed; both TypeScript checks and production exports passed. Natural fingerprints remain `1e1ad87a1fafdfca676015eb142abdfb0188d811` / `5d2be9c332fb6660513531f40f6ffff3254d8048`; target runtimes resolved separately. Safety exit 2 matches only the reviewed owner metadata/extra API URL exception. Live EAS, manifests and downloaded CDN hashes match validated exports containing the new shake code. Physical-device shake/receipt and current store distribution remain unconfirmed.
>
> [Current release record and repeatable flow](../../OTA_UPDATE_INFORMATION.md). Evidence: `.codex-tmp/ota-1.1.53-shake-evidence`; inventory SHA-256 `8b62fe5d091d8e75d2c24ef7816544d17f0a64a4ecf7e1cc835ec7caa74108d9`. Prepared local shake fix is now published. Historical records follow; do not publish raw main or blindly force legacy runtimes.

> **PREVIOUS INITIAL 2026-10-12: PRODUCTION OTA `1.1.53`; SUPERSEDED BY THE SAME-VERSION SHAKE PUBLICATION ABOVE.**
>
> Current local source assembled into fresh compatible worktree `.codex-tmp/ota-release-1.1.53` at `2975156c15199c21bb3a4c73af8bd35189aaa2bd` (dirty). 75 changed / 17 added / 0 removed files versus 1.1.52; 1342 inventoried, four optional-native adaptations. Includes price formatting, backend daily change and current mobile UI/session/history/bulk-close fixes.
>
> Android: runtime `30cba83220fc6c92180eed477863c3e3e3087ce6`, group `2d80c9a8-dd80-415b-a11c-841efbfe74c7`, update `01a12f6b-c8c6-7010-9929-359e1596c143`, created `2026-10-12T09:22:35.334Z`. Compatible EAS binary `cfe3b101-ab15-4e18-854b-ef808e96d708` (1.1.11/vc28), freshly verified.
>
> iOS: runtime `ef38da275b765380037fc377f5c596de31690b7d`, group `2105f73b-1355-4430-8197-9ba2dd85e59e`, update `01a12f6d-a2b6-7964-b0a6-019f0640c57a`, created `2026-10-12T09:24:36.662Z`. Compatible EAS binary `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` (1.1.10/build30), freshly verified.
>
> 490 full release test files and 372 main changed-feature tests passed; both TypeScript checks and production exports passed. Natural fingerprints remain `1e1ad87a1fafdfca676015eb142abdfb0188d811` / `5d2be9c332fb6660513531f40f6ffff3254d8048`. Safety exit 2 flags only the reviewed owner metadata/extra API URLs. Live EAS, production manifests and CDN bundles match the new IDs and validated local export hashes. Physical-device receipt and current store distribution remain unconfirmed.
>
> [Current release record and next-release procedure](../../OTA_UPDATE_INFORMATION.md). Evidence: `.codex-tmp/ota-1.1.53-evidence`; inventory SHA-256 `3044de621969edd7d3ea19519483cbf432e2a586c75ac8825d7675c32f7d40d2`. Historical records follow; do not publish raw main or blindly force legacy runtimes.

> **PREVIOUS 2026-10-08: PRODUCTION OTA `1.1.52`; SUPERSEDED BY `1.1.53`.**
>
> Current local source assembled into fresh compatible worktree `.codex-tmp/ota-release-1.1.52` at `2975156c15199c21bb3a4c73af8bd35189aaa2bd` (dirty). 10 changed / 2 added / 0 removed files versus 1.1.51; 1325 inventoried, four optional-native adaptations. Includes executable quote readiness, enabled-instrument trading-mode handling and chart feedback ownership fixes.
>
> Android: runtime `30cba83220fc6c92180eed477863c3e3e3087ce6`, group `034732a7-34d1-43f3-8a8e-a6a69fb01780`, update `01a11b12-9564-7b02-8396-429a96d54d4c`, created `2026-10-08T10:32:45.156Z`. Compatible EAS binary `cfe3b101-ab15-4e18-854b-ef808e96d708` (1.1.11/vc28), freshly verified.
>
> iOS: runtime `ef38da275b765380037fc377f5c596de31690b7d`, group `653f2e41-38f0-4c92-b0e6-9ada6be1f279`, update `01a11b13-cd3f-70e9-9ef6-b4d54239bb9d`, created `2026-10-08T10:34:04.991Z`. Compatible EAS binary `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` (1.1.10/build30), freshly verified.
>
> 480 full release test files passed; 19 main changed-feature tests passed; both TypeScript checks and production exports passed. Natural fingerprints remain `1e1ad87a1fafdfca676015eb142abdfb0188d811` / `5d2be9c332fb6660513531f40f6ffff3254d8048`. Safety exit 2 flags only the same reviewed owner metadata/extra API URLs. Live EAS, production manifests and CDN bundles match the new IDs and validated local export hashes. Physical devices and current store distribution remain unconfirmed.
>
> [Current release record and next-release procedure](../../OTA_UPDATE_INFORMATION.md). Evidence: `.codex-tmp/ota-1.1.52-evidence`; inventory SHA-256 `7cc8be5708262c0649a3ae4aa80a45ab3ce84ba4ed0159c5410b4178f593c56d`. Historical records follow. Do not publish raw main or blindly force legacy runtimes.

> **PREVIOUS 2026-10-07: PRODUCTION OTA `1.1.51`; SUPERSEDED BY `1.1.52`.**
>
> Current local application/source/tests/scripts/OTA assets assembled in fresh worktree `.codex-tmp/ota-release-1.1.51` at `2975156c15199c21bb3a4c73af8bd35189aaa2bd` (dirty). 54 changed / 17 added / 0 removed files versus `1.1.50`; 1323 inventoried, 1319 identical to local, four recorded native fallbacks. Includes broker-selection session preservation, demo investor-password/country-search fixes, app-wide performance improvements, and the existing guest/trading/chart/UI behavior. Native-only features require new binaries.
>
> Android: runtime `30cba83220fc6c92180eed477863c3e3e3087ce6`, group `1461001e-6d46-43bd-a345-173b9db3c988`, update `01a11685-17c0-7b0a-90cb-c424d815bd93`, created `2026-10-07T13:19:43.552Z`. Compatible EAS binary `cfe3b101-ab15-4e18-854b-ef808e96d708` (1.1.11/vc28), freshly verified.
>
> iOS: runtime `ef38da275b765380037fc377f5c596de31690b7d`, group `b9d8aadf-13b2-429a-a523-ea38c098b8f3`, update `01a11686-5374-7e91-a414-a31c1e7f9019`, created `2026-10-07T13:21:04.372Z`. Compatible EAS binary `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` (1.1.10/build30), freshly verified.
>
> 479 release test files passed; main 479-file performance regression and focused new-version test passed; both TypeScript checks passed; production environment and both exports passed. Natural fingerprints remain `1e1ad87a1fafdfca676015eb142abdfb0188d811` / `5d2be9c332fb6660513531f40f6ffff3254d8048`. Broad safety check returned exit 2 for only the same reviewed owner metadata/extra API URLs. Production manifests and downloaded CDN bundles match the new IDs, version, local exports and SHA-256 hashes. Physical-device receipt/visual checks and current store distribution remain unconfirmed; no Android device was connected.
>
> [Current release scope, identifiers, source parity and next-release procedure](../../OTA_UPDATE_INFORMATION.md). Evidence: `.codex-tmp/ota-1.1.51-evidence`; inventory SHA-256 `137f92075a176f0e0eee2ebac8f8b4296aed9e5c82e712e776b6df9b93c39731`. Records below are historical. Do not publish raw main or blindly force legacy runtimes.


> **PREVIOUS 2026-10-07: PRODUCTION OTA `1.1.50` WAS LIVE FOR ANDROID AND IOS; SUPERSEDED BY 1.1.51.**
>
> Current local application/source/tests/scripts/OTA assets assembled in fresh worktree `.codex-tmp/ota-release-1.1.50` at `2975156c15199c21bb3a4c73af8bd35189aaa2bd` (dirty). 212 changed / 125 added / 0 removed files versus `1.1.49`; 1306 inventoried, 1302 identical to local, four recorded native fallbacks. Includes guest/login/demo flow, broker/public market/session restoration, charts and interaction/UI changes. Native-only features require new binaries.
>
> Android: runtime `30cba83220fc6c92180eed477863c3e3e3087ce6`, group `98b59fdc-fd11-41ac-ba16-07d0ca418e99`, update `01a11577-e826-7f05-b852-ab72c17b7d5d`, created `2026-10-07T08:25:42.182Z`. Compatible EAS binary `cfe3b101-ab15-4e18-854b-ef808e96d708` (1.1.11/vc28), freshly verified.
>
> iOS: runtime `ef38da275b765380037fc377f5c596de31690b7d`, group `4c94e68f-a047-40c0-b62c-827d64ea55ef`, update `01a11578-f1d1-7fa7-acdc-0cb2b5625463`, created `2026-10-07T08:26:50.193Z`. Compatible EAS binary `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` (1.1.10/build30), freshly verified.
>
> 465 test files passed in main and release; both TypeScript checks passed; production environment and both exports passed. Natural fingerprints remain `1e1ad87a1fafdfca676015eb142abdfb0188d811` / `5d2be9c332fb6660513531f40f6ffff3254d8048`. Broad safety check returned exit 2 for only the same reviewed owner metadata/extra API URLs. Production manifests and downloaded CDN bundles match the new IDs, version, local exports and SHA-256 hashes. Physical-device receipt/visual checks and current store distribution remain unconfirmed; no Android device was connected.
>
> [Current release scope, identifiers, source parity and next-release procedure](../../OTA_UPDATE_INFORMATION.md). Evidence: `.codex-tmp/ota-1.1.50-evidence`; inventory SHA-256 `a14304053ebe467ac5fa748f014cb013b1b2151639e73aa42ed55f43b45966fa`. Records below are historical. Do not publish raw main or blindly force legacy runtimes.


> **PREVIOUS 2026-10-02: PRODUCTION OTA `1.1.49` WAS PUBLISHED FOR ANDROID AND IOS; SUPERSEDED BY `1.1.50`.**
>
> Fixed the stale-source issue in `1.1.48`. Current local app/source/tests/scripts/OTA assets are assembled in fresh worktree `.codex-tmp/ota-release-1.1.49` at `2975156c15199c21bb3a4c73af8bd35189aaa2bd` (dirty). Coverage: 142 changed / 46 added source files versus `1.1.48`; 1181 inventoried files, 1178 identical to local, three narrowly adapted for absent native capabilities. Main startup imports were guarded. Native icons/plugins/new modules still require new binaries; text bug reports and other current local UI/logic are included.
>
> Android: runtime `30cba83220fc6c92180eed477863c3e3e3087ce6`, group `07f67708-49f7-47f7-838f-92e6a8740470`, update `01a0fb4c-3e03-7195-85b1-894fb65bc0a9`, created `2026-10-02T06:27:52.963Z`. Compatible binary `cfe3b101-ab15-4e18-854b-ef808e96d708` (`1.1.11/vc28`), EAS reverified.
>
> iOS: runtime `ef38da275b765380037fc377f5c596de31690b7d`, group `07c0c58f-b90f-493d-9e1f-dd3067f78a03`, update `01a0fb4f-3e72-728a-bac4-f64ba6112f9d`, created `2026-10-02T06:31:09.682Z`. Compatible binary `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` (`1.1.10/build30`), EAS reverified.
>
> Validation: 403 main and 403 release test files pass; both TypeScript checks pass; production env passes; natural fingerprints remain `1e1ad87a1fafdfca676015eb142abdfb0188d811` / `5d2be9c332fb6660513531f40f6ffff3254d8048`. Only the same reviewed owner metadata and extra API URLs are flagged by the broad safety script. Doctor 17/18: patch advisory only. Both production manifests and downloaded CDN bundles verified for `1.1.49` and new feature code absent in `1.1.48`. Device receipt/visual validation and current store distribution remain unconfirmed; no devices connected after publication.
>
> [Current scope, identifiers, messages, dashboard/manifest links, source parity and repeatable assembly flow](../../OTA_UPDATE_INFORMATION.md). The records below are historical. Do not publish raw main or blindly force these legacy runtimes.

> **PREVIOUS 2026-10-02: PRODUCTION OTA `1.1.48` WAS PUBLISHED FOR ANDROID AND IOS.**
>
> This release changes only the OTA display version/test in the retained compatible `1.1.47` release source. It was published separately from `.codex-tmp/ota-release-1.1.43` at `2975156c15199c21bb3a4c73af8bd35189aaa2bd` (dirty worktree). Main's new bug-report native modules/plugins/icons were not included.
>
> Android: runtime `30cba83220fc6c92180eed477863c3e3e3087ce6`, group `db359ccc-1b11-4b91-9266-f8a891a25be1`, update `01a0fb25-a7e0-7a16-93fc-dd1cd71dd7f4`, created `2026-10-02T05:45:44.160Z`; compatible binary `cfe3b101-ab15-4e18-854b-ef808e96d708` (`1.1.11/vc28`, confirmed installed on the connected Android phone).
>
> iOS: runtime `ef38da275b765380037fc377f5c596de31690b7d`, group `2ed2d964-662b-4176-97be-feb4f57a60c5`, update `01a0fb27-0eb6-75f2-bf2b-65f7b8c4fc7d`, created `2026-10-02T05:47:16.022Z`; compatible binary `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` (`1.1.10/build30`, EAS verified). Physical iOS receipt and current store distribution remain unconfirmed.
>
> Validation: 384 release test files pass; release/main TypeScript pass; production env passes; both exports and served CDN bundles contain `1.1.48` and match manifest hashes. Natural fingerprints are unchanged: Android `1e1ad87a1fafdfca676015eb142abdfb0188d811`, iOS `5d2be9c332fb6660513531f40f6ffff3254d8048`. Broad safety-script flags remain exactly the already reviewed owner metadata and two `extra` API fallback URLs; the script's exit is not claimed as a pass. Expo Doctor: 17/18; only newer SDK patch advisory, baseline retained.
>
> [Current release IDs, messages, manifests, dashboards, scope, validation and flow](../../OTA_UPDATE_INFORMATION.md) supersede the historical snapshots below. This is a deliberately reviewed legacy-runtime continuation; do not publish raw main or automatically force these runtimes. The `1.1.45` record below was rolled back, and `1.1.47` was the live version verified immediately before this release.

> **HISTORICAL 2026-09-29: OTA `1.1.45` WAS PUBLISHED, THEN ROLLED BACK ON BOTH PLATFORMS.**
> It adds the chart-history live-feed fallback, the Journal diagnostics, and plot-clipped trade arrows. It uses the same runtimes and the same worktree; the IDs are in `OTA_UPDATE_INFORMATION.md`.
>
> **EARLIER 2026-09-29: PRODUCTION OTA `1.1.44` WAS PUBLISHED FOR ANDROID AND IOS.**
> It is `1.1.43` plus thin trade-history arrows, published on the same runtimes from the same worktree. The IDs are in `OTA_UPDATE_INFORMATION.md`.
>
> **EARLIER 2026-09-29: PRODUCTION OTA `1.1.43` WAS PUBLISHED FOR ANDROID AND IOS.**
> It uses the same runtimes, Android `30cba832...` and iOS `ef38da27...`. It was published from the isolated worktree `.codex-tmp/ota-release-1.1.43` at `2975156c`. The identifiers and validation are recorded in `OTA_UPDATE_INFORMATION.md`. The `1.1.42` sections below are historical.
>
> **PREVIOUS STATUS: PRODUCTION OTA `1.1.42` WAS LIVE FOR ANDROID AND IOS.
> DO NOT PUBLISH THE ASSESSED `main` SOURCE LINE DIRECTLY TO THE OLD RUNTIMES.**
>
> This tracked file is the shared production OTA baseline. It is a
> last-verified snapshot, not permission to publish. Always verify live EAS
> state, the installed binary source commit, and both resolved runtimes before
> an OTA.

Historical sections last verified: `2026-08-22` (Asia/Calcutta); historical release record verified `2026-10-02`. The current release verification is recorded at the top of this file.

## Authoritative Project Location & Locked XPrem Configuration (`1.1.62+`)

- Repository: `YoForex005/RTX-5Mobile-App`
- Production app working directory: `rtx5-app`
- Effective Expo config: `rtx5-app/app.config.js`
- Base Expo config loaded by it: `rtx5-app/app.json`
- Fingerprint lock config: `rtx5-app/fingerprint.config.js`
- EAS profiles: `rtx5-app/eas.json`
- XPrem OTA publisher script: `rtx5-app/scripts/xprem-update.js` (`npm run update:xprem`)
- Expo owner/project (for EAS native store builds): `yoforex-organisation/rtx5-app` (`092a58db-dea9-469a-a383-f27300598812`)
- **XPrem Update Manifest URL**: `https://otadeploy.yopips.com/manifest`
- **XPrem Upload URL**: `https://otadeploy.yopips.com/upload`
- **XPrem App ID (`expo-app-id`)**: `b83d7191-d5ac-4b58-b850-8979759fe290`
- **XPrem Channel (`expo-channel-name`)**: `yoforex-rtx5`
- **XPrem Branch**: `rtx5-production`
- **Runtime policy**: `fingerprint` (normalized via `rtx5-app/fingerprint.config.js`)

The repository-root `app.json` and `eas.json` are not the RTX5 production app
authority. Always change directory to `rtx5-app` before running Expo, EAS, or
XPrem commands.

## Next OTA: Reused Locked Values Versus New Values

Keep all XPrem OTA connection and runtime parameters strictly constant:
- Manifest endpoint: `https://otadeploy.yopips.com/manifest`
- Header `expo-app-id`: `b83d7191-d5ac-4b58-b850-8979759fe290`
- Header `expo-channel-name`: `yoforex-rtx5`
- XPrem target branch: `rtx5-production`

| Platform | Locked Runtime Version (`1.1.62` Store & Internal Binaries) |
| --- | --- |
| Android (`.aab` `84e7a097-c743-428e-9f98-6c1625ce598b` & `.apk` `db4a69d2-6388-4a58-88fa-63e6d13879de`) | `797dea98b258410dcbd80a727586f6af607da932` |
| iOS (`.ipa` `7bdd5a75-485f-42c9-9dd1-0e60a6b62f07`) | `44d9c3b64f5b6fd221136b861e597bdbf62da208` |

When publishing the next OTA update:
1. Bump `APP_DISPLAY_VERSION` in `rtx5-app/src/config/appDisplayVersion.ts` and `rtx5-app/src/config/appDisplayVersion.test.ts`.
2. Run `npm run update:xprem -- -m "OTA <version>: <description>"` inside `rtx5-app`.
3. Record the newly generated XPrem `publishGroupId`, `updateId`, `manifestId`, and timestamp in `OTA_UPDATE_INFORMATION.md` and this file.

---

### Historical Compatibility Decision (`1.1.42` — Archived)

| Item | Android | iOS |
| --- | --- | --- |
| Last verified `1.1.42` target runtime; installed/store confirmation required | `30cba83220fc6c92180eed477863c3e3e3087ce6` | `ef38da275b765380037fc377f5c596de31690b7d` |
| Assessed isolated release-source natural runtime (before explicit targeting, re-measured for `1.1.42`) | `cfd5f88a74b618f8a432c6ac2b26641bb07872a7` | `6ab0fec78db6b2b2f7b623ab4abb6f2a35f4c332` |
| Runtime match | **NO** | **NO** |

Product-source snapshot assessed and synced into the isolated release worktree
for the `1.1.42` OTA:

```text
76ca44f183a654b9885904bffd84c25cb4375248
```

This main snapshot includes the release-blocking fix commit
`76ca44f1` ("stale chart contract tests fixed and app display version bumped
for OTA 1.1.42"): 8 chart source-contract tests on main had drifted behind the
recent chart feature commits and failed on both main and the release source.
Each asserted invariant was verified intact in the current code before the
stale assertions were updated; no product code was changed for the fix.

Documentation-only commits may appear after that SHA. Always run
`git rev-parse HEAD` and resolve both runtimes again; do not infer
compatibility from the branch name or this snapshot.

Latest production OTA source commit:

```text
2975156c15199c21bb3a4c73af8bd35189aaa2bd
```

The assessed `main` source was not published directly. Its normally resolved
runtimes do not match the compatible installed binary runtimes. Production OTA
`1.1.42` (like `1.1.32` through `1.1.41` before it) was instead assembled in
the isolated release worktree based on the last OTA source commit above (the
linked git worktree at `.codex-tmp/ota-release-1.1.41`, detached at
`2975156c...`; do not delete it during cleanups). Current OTA-deliverable
application changes from the main-line snapshot at `76ca44f1...`
(`rtx5-app/app`, `rtx5-app/src`,
`rtx5-app/tests`, `rtx5-app/scripts`, plus non-native support files) were
synced in, while native-sensitive configuration, dependencies
(`package.json`/`package-lock.json`/`eas.json`), and icon assets remained on
that compatible baseline. Dependency sections of `package.json` and the full
lockfile package set (0 added, 0 removed, 0 version-changed packages) were
verified identical between main and the baseline before syncing. EAS therefore
records source commit `2975156...` with a dirty-worktree marker.

The Android and iOS updates were published separately and explicitly targeted
the same platform runtime values used by `1.1.31` through `1.1.41`
(`RTX5_FORCE_RUNTIME_VERSION` with `RTX5_ALLOW_FORCE_RUNTIME_VERSION=true`,
per platform, plus `CI=1` for the expo-cli export). The release contains 814
changed paths against `2975156...` inside `rtx5-app` (790 tracked
modifications plus 24 newly added source files). Its only native-sensitive
path is `app.json`, whose exact diff remains the owner metadata change from
`yoforex` to `yoforex-organisation` already used by live OTA `1.1.40`; the
project ID, update URL, runtimes, native settings, and dependencies remain
unchanged. The isolated source's natural fingerprint resolved to the exact
same hashes measured for the `1.1.41` release source (`cfd5f88a...` Android /
`6ab0fec7...` iOS), proving zero native-surface drift since `1.1.41`. This
exceptional, reviewed continuation of the prior runtime lines is not permission
to publish raw current `main` or another unreviewed source against those
runtimes.

The `1.1.42` publish initially failed with "Unable to resolve module
./../../../rtx5-app/node_modules/expo-router/entry.js" because the worktree's
`node_modules` had become a junction to the main repo's tree. The junction was
removed (`rmdir`, never `rd /s`) and replaced with a real `npm ci` from the
baseline lockfile; hermesc verified working (Hermes 0.12.0, HBC bytecode 96)
and both exports then succeeded.

Before shipping source from this line, either:

1. Create and validate new production binaries for its resolved native
   fingerprints; or
2. Isolate an OTA-safe source line whose resolved runtime still exactly matches
   the intended installed binary.

## Compatible Production Binary Baseline

These EAS build records prove runtime compatibility. They do not by themselves
prove which build is currently distributed by Google Play or the App Store;
verify the installed/store build before publishing.

### Android

| Field | Verified value |
| --- | --- |
| EAS build ID | `cfe3b101-ab15-4e18-854b-ef808e96d708` |
| App version | `1.1.11` |
| Version code | `28` |
| Build profile | `production` |
| Binary source commit | `63ddb9817984c4d71c5e265332e3f5e846267625` |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` |
| Created | `2026-06-19T06:20:00.709Z` |

The latest finished Android production build was later observed as build `32`
with runtime `56277bfea8d7fe467046bf696d33ea99553c2656`. It does not match the
Android `1.1.31` OTA runtime. Confirm the installed Google Play build rather
than assuming the highest EAS build number is the active store binary.

### iOS

| Field | Verified value |
| --- | --- |
| EAS build ID | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` |
| App version | `1.1.10` |
| Build number | `30` |
| Build profile | `production` |
| Binary source commit | `63ddb9817984c4d71c5e265332e3f5e846267625` |
| Runtime | `ef38da275b765380037fc377f5c596de31690b7d` |
| Created | `2026-06-19T06:57:53.486Z` |

## Last Verified Production OTA Snapshot

Production OTA `1.1.42` was published on `2026-08-22` to the same Android and
iOS runtime lines used by `1.1.31` through `1.1.41`. Re-evaluate runtime
compatibility for every later change.

### Android

| Field | Verified value |
| --- | --- |
| OTA-visible version | `1.1.42` |
| Compatible EAS build reference | `cfe3b101-ab15-4e18-854b-ef808e96d708` — installed/store confirmation required |
| Source commit | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| EAS source status | Dirty isolated release worktree (`2975156...*`) |
| Main-line product source snapshot synced in | `76ca44f183a654b9885904bffd84c25cb4375248` |
| OTA safety-comparison base | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Runtime | `30cba83220fc6c92180eed477863c3e3e3087ce6` |
| Update group | `f1932556-51e4-4e82-bb65-34f5113e2a7b` |
| Update ID | `01a02820-cef1-7d13-a3c0-08cb2bca0781` |
| Created | `2026-08-22T06:20:33.905Z` |
| Message | `Android production OTA 1.1.42 validated app updates runtime 30cba832` |
| Manifest | `https://u.expo.dev/update/01a02820-cef1-7d13-a3c0-08cb2bca0781` |
| Dashboard | `https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/f1932556-51e4-4e82-bb65-34f5113e2a7b` |

### iOS

| Field | Verified value |
| --- | --- |
| OTA-visible version | `1.1.42` |
| Compatible EAS build reference | `1b1bd2e3-da6c-4c8b-94c2-285b0329dce2` — installed/store confirmation required |
| Source commit | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| EAS source status | Dirty isolated release worktree (`2975156...*`) |
| Main-line product source snapshot synced in | `76ca44f183a654b9885904bffd84c25cb4375248` |
| OTA safety-comparison base | `2975156c15199c21bb3a4c73af8bd35189aaa2bd` |
| Runtime | `ef38da275b765380037fc377f5c596de31690b7d` |
| Update group | `34458613-1b82-4fad-9b2b-5826b2377130` |
| Update ID | `01a02823-ca49-7de1-834c-7d6c169beb28` |
| Created | `2026-08-22T06:23:49.321Z` |
| Message | `iOS production OTA 1.1.42 validated app updates runtime ef38da27` |
| Manifest | `https://u.expo.dev/update/01a02823-ca49-7de1-834c-7d6c169beb28` |
| Dashboard | `https://expo.dev/accounts/yoforex-organisation/projects/rtx5-app/updates/34458613-1b82-4fad-9b2b-5826b2377130` |

### Release validation recorded for `1.1.42`

- Release-blocking test fix first: 8 chart source-contract tests on main had
  drifted behind the recent chart feature commits and failed on both main and
  the release source. Every asserted invariant was verified intact in the
  current code (marker refs cleared via `clearOverlayMarkers`, 5s overlay
  re-push, CHART_READY overlay/live-price restore, pre-setData manual-range
  capture, session `cacheNamespace` propagation, pane-selection gating,
  retained-chart loading gates) before the stale assertions were updated in
  commit `76ca44f1`. No product code changed.
- Full tests on main and in the isolated release worktree: all 363 test files
  passed in each source (re-run after the version bump and again after the
  worktree `npm ci`).
- TypeScript typecheck: passed on main and in the release worktree.
- Production EAS environment validation (`check-eas-env.js production`): passed
  (all 12 required public variables present).
- Native-sensitive comparison against `2975156...`: 814 changed paths inside
  `rtx5-app`; only `app.json` is native-sensitive, and its exact diff is the
  owner metadata already live in `1.1.40`. Project ID, update URL, runtimes,
  native settings, and dependencies stayed unchanged.
- Dependency sections of `package.json` and the full lockfile package set (0
  added, 0 removed, 0 version-changed) verified identical between main and the
  release baseline before syncing; `eas.json` diff limited to the `cli.version`
  pin; the only asset diff is the binary-only `android-adaptive-foreground.png`
  icon, which was kept on the baseline.
- Isolated-source natural fingerprint re-resolved to the exact `1.1.41`
  release-source hashes (`cfd5f88a...` Android / `6ab0fec7...` iOS): zero
  native-surface drift since `1.1.41`.
- Compatible binary build records re-verified live: Android
  `cfe3b101...` (1.1.11, runtime `30cba832...`, source `63ddb981...`) and iOS
  `1b1bd2e3...` (1.1.10, runtime `ef38da27...`, source `63ddb981...`), both
  FINISHED production builds.
- Expo Doctor: 17/18 checks passed. Its only advisory was newer Expo SDK patch
  releases (`expo` 54.0.37, `expo-constants` 18.0.14, and `expo-updates`
  29.0.20); they were intentionally not adopted because this OTA preserves the
  exact dependency set of the compatible binary baseline.
- Worktree `node_modules` was a junction to the main repo tree and broke the
  first export ("Unable to resolve module
  ./../../../rtx5-app/node_modules/expo-router/entry.js"). Replaced with a
  real `npm ci` from the baseline lockfile; hermesc verified (Hermes 0.12.0,
  HBC bytecode 96); Android and iOS production exports then passed.
- Live `channel:view`/`update:list` and both `update:view` checks: passed
  before and after publishing.
- Physical-device delivery confirmation: Android confirmed on the connected
  test phone (`com.rtx5.app` 1.1.11/vc28, the compatible `30cba832...` build):
  the app's update prompt downloaded and installed the OTA on first launch and
  the About screen then showed `Version 1.1.42`. iOS physical confirmation
  still pending (no iOS device connected).

The previous `1.1.41` groups were Android
`ffe5adbd-82c6-4648-a2eb-a4b73bfbf486` and iOS
`629fb1e1-6550-467b-b69a-c5efa8e71867`.

## Start From Another Computer

```powershell
git clone https://github.com/YoForex005/RTX-5Mobile-App.git
cd RTX-5Mobile-App
git pull --ff-only origin main
git fetch --all --tags --prune
git status --short
git rev-parse HEAD
cd rtx5-app
```

Stop if the worktree is unexpectedly dirty or if the checked-out commit is not
the intended release source.

## Mandatory Fail-Closed Preflight

First verify the live production channel and updates:

```powershell
npx.cmd --yes eas-cli@21.4.0 whoami
npx.cmd --yes eas-cli@21.4.0 channel:view production --json --non-interactive
npx.cmd --yes eas-cli@21.4.0 update:list --branch production --limit 20 --json --non-interactive
```

Then verify environment, native-change safety, and runtime compatibility:

Do not confuse these two source references:

- **Target binary source commit:** the native source used to build the intended
  installed/store binary. It is evidence for the build and its runtime; confirm
  it independently for each platform.
- **OTA safety-comparison base:** the reviewed compatible source from which the
  proposed OTA changes are measured by `check-ota-safety.js --base`. For a
  normal direct release this may be the target binary source commit. For an
  isolated prior-runtime continuation it may be the previous audited OTA source.

For `1.1.32`, the reference target binary source was `63ddb981...`, while the
isolated release safety-comparison base was `2975156...`. A zero-change result
against the safety base does not by itself prove that an installed binary is
compatible; its exact runtime must still be confirmed.

```powershell
$targetBinarySourceCommit = "<verified-installed-binary-source-commit>"
$otaSafetyBase = "<approved-ota-compatible-source-commit>"

git status --short
npm run typecheck
npm test
node .\scripts\ota\check-eas-env.js production
node .\scripts\ota\check-ota-safety.js --base $otaSafetyBase
node .\scripts\ota\print-update-context.js --channel production
npx.cmd expo-updates runtimeversion:resolve --platform android
npx.cmd expo-updates runtimeversion:resolve --platform ios
npx.cmd expo-doctor
```

Publishing is blocked unless:

- The working tree and source commit are deliberate and recorded.
- The environment check passes.
- The target binary source/build and the OTA safety-comparison base are both
  deliberate, independently verified, and recorded.
- The safety check reports zero native-impacting changes from the approved OTA
  safety-comparison base, unless the only reported path is the separately
  reviewed ownership metadata already live on the same project/runtime line.
- On the normal path, the resolved Android and iOS runtimes exactly match the
  intended binaries.
- On an explicitly approved prior-runtime continuation, each platform is
  published separately only after its installed-binary runtime is proven and
  the isolated source preserves the reviewed compatible native baseline.
- The live channel/update history still matches this baseline.
- Provider credentials or other secrets are not printed or committed.

If Android and iOS use different binary source commits or only one platform's
runtime matches, validate and publish each platform separately. Never publish
`--platform all` merely because one platform matches.

## Publishing

GitHub workflow path — available only when an approved remote `release` branch
already exists:

1. Prepare and validate the exact release source.
2. Ensure the GitHub `release` branch points to that approved source.
3. Open GitHub Actions and run `RTX5 OTA Update` manually.
4. Select branch `release`.
5. Set `channel: production`.
6. Select only the validated platform, or `all` only when both match.
7. Enter the approved OTA safety-comparison base in the required `base-ref`
   input; do not assume it is the same as the target binary source commit.
8. Use a message containing the intended visible version and short source SHA.

Current direct path from `rtx5-app` when no approved `release` branch exists:

```powershell
$env:RTX5_OTA_BASE_REF="<approved-ota-safety-comparison-base>"
npm run update:prod -- --message "production <visible-version> $(git rev-parse --short HEAD)"
```

The `update:prod` wrapper owns `--platform all`. Use it only when both platform
runtime decisions are independently approved for the same release. When Android
and iOS require separate runtime targeting, run the same preflight first and use
separate reviewed, platform-scoped EAS update commands. Never try to override
the wrapper's protected `--platform` or runtime flags.

Do not set `RTX5_FORCE_RUNTIME_VERSION` on raw or unreviewed source merely to
bypass a runtime mismatch. The `1.1.40` release used explicit per-platform
runtime targeting only after isolating the prior compatible OTA source and
verifying zero native-impacting changes before the required owner-transfer
metadata update. Releases `1.1.41` and `1.1.42` then repeated the isolation
proof and confirmed that the same owner-only metadata was the entire
native-sensitive diff (with the `1.1.42` natural fingerprint also matching the
`1.1.41` release-source hashes exactly). Repeat that full proof before any
similar exception.

## Required Update After Every Production Publish

After EAS confirms the publish:

1. Re-run `channel:view production` and `update:list`.
2. Record each platform's source commit, runtime, group, update ID, timestamp,
   message, and target binary.
3. Record whether the publish source was clean or dirty.
4. Update this file only from verified live results.
5. Commit and push this file so every computer receives the new baseline.
6. Verify the installed physical Android and iOS builds receive the intended
   update.

Never store `EXPO_TOKEN`, passwords, feed tokens, `.env` values, signing keys,
or service-account JSON in this file.
