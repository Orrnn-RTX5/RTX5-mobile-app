# RTX5 OTA Update Information

> **Current live production OTA: `1.1.50` for Android and iOS.**
>
> Published and production manifests/CDN bundles verified `2026-10-07` (Asia/Calcutta).
>
> Released following the user's explicit request for the next Android and iOS OTA, including the current codebase. This record does not authorize another release.

## Current Production OTA - `1.1.50`

| Field | Android | iOS |
| --- | --- | --- |
| OTA-visible version | `1.1.50` | `1.1.50` |
| State | **LIVE; production manifest and CDN bundle verified** | **LIVE; production manifest and CDN bundle verified** |
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
