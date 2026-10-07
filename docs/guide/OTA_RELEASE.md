# RTX5 OTA and Release Guide

> **Current production authority:** Before any OTA, read
> [`OTA_PRODUCTION_BASELINE.md`](OTA_PRODUCTION_BASELINE.md). The dated notes
> below are historical records. The current RTX5 runtime policy is
> `fingerprint`, and the current GitHub OTA workflow is manual
> (`workflow_dispatch`), not automatic on push.

## OTA Strategy
Use EAS Update with three channels:
1. `preview` - QA and developer validation.
2. `staging` - internal beta users and release candidates.
3. `production` - controlled public rollout.

## Runtime Version Gating
- Every binary build must declare a runtime version.
- OTA bundle must only target matching runtime versions.
- Never promote OTA bundle across incompatible runtime groups.

## Release Status Notes
- 2026-06-11: Aligned the root Expo scaffold `app.json` orientation with the active app config by changing it from portrait-only to `default` for portrait and landscape support. The active `rtx5-app/app.json` already used `orientation: default`, so it was not changed. Orientation/native config changes require a new native binary build and must not be shipped as an OTA-only update.
- 2026-06-10: Published iOS-only production OTA display-version test `1.1.6` for the OTA-enabled iOS build `1.1.5 (23)`. Update group `108e4391-be4c-46d2-8831-b67541fdf44c`, iOS update `019eb163-4bde-7625-ae4b-68880e4e568b`, runtime `f4184b3e04e9e7200364ce9ab4dfd4ec18950364`, message `iOS OTA display version 1.1.6`. This intentionally does not change the native `app.json` version; it is an OTA-visible app label check.
- 2026-06-10: Created the OTA-enabled iOS production build path after the no-OTA iOS fix was verified. Build `de72ff78-0417-4e21-b9ce-833171064e58` (`1.1.5`, build `23`, runtime `f4184b3e04e9e7200364ce9ab4dfd4ec18950364`, artifact `https://expo.dev/artifacts/eas/ttcD21JyMUABf5qHJjQm2N.ipa`) uses the normal `production` profile with Expo Updates enabled and was submitted to App Store Connect/TestFlight through EAS submission `1f9c0847-f858-4d3e-b1bc-fa38945cea0e`. Published matching iOS production OTA update group `a31a3f14-a33e-42a3-ac32-2ed3b8f05242` (`019eb14d-8cdd-75ce-b019-1f6539d539ed`) for the same runtime. TestFlight processing and iPhone OTA fetch/reopen validation remain pending.
- 2026-06-10: Created iOS no-OTA production build `ff562ad7-8be9-4bb6-b719-f488b31cb7db` (`1.1.5`, build `22`, runtime `e4742e46c961072f39776c78678b681b8c5d5b78`, artifact `https://expo.dev/artifacts/eas/xwK6henEyp59tCS3ZmDBdg.ipa`) from the fixed startup/reopen code path and submitted it to App Store Connect/TestFlight through EAS submission `fb97d303-0248-4b99-9952-d381db6a5f0e`. This build uses the `production-no-ota` profile so native Expo Updates are disabled and the embedded bundle is the source of truth. Apple processing and iPhone close/reopen validation remain pending.
- 2026-06-10: Android `1.1.5` no-OTA build `16` was proven not to be failing from EAS Update/OTA: device startup diagnostics logged `updates.isEnabled: false`, no channel/runtime/update ID, and `disabledByEnv: true`. The crash was a bundled JS startup defect in `QuotesWebSocketService`, where `url` resolved before `failedBrokerSocketUrls` was initialized. Fixed Android no-OTA build `e0d111e8-2976-4921-8c25-2d4b67c5f997` (`versionCode` 19, artifact `https://expo.dev/artifacts/eas/tLa64FJNE1g5bPHfcv14Dr.apk`) was installed over preserved device data and passed five open/home/reopen/force-stop/reopen cycles with no fatal logcat matches. iOS needs a fresh TestFlight build and the same reopen smoke before the platform gate is closed.
- 2026-06-10: Added a dynamic Expo config path for no-OTA production builds. Profiles that set `EXPO_PUBLIC_DISABLE_OTA_UPDATES=true` now compile with native Expo Updates disabled (`updates.enabled: false`) and the no-OTA EAS build scripts use `--clear-cache`; normal OTA-enabled profiles remain unchanged.
- 2026-06-03: Added GitHub Actions OTA automation. Pushes to `main`, `staging`, and `release` publish EAS Updates to `preview`, `staging`, and `production` respectively after dependency install, TypeScript, and Expo Doctor checks pass. Automatic OTA is blocked when native-sensitive files change. Native EAS builds were moved to manual GitHub workflow dispatch so normal JavaScript/UI pushes do not create separate Android/iOS binaries.
- 2026-06-03: Google Play Console rejected Android production AAB `application-721dff83-e80f-4c1b-8411-f89662c3b42e.aab` because the upload certificate does not match the app's registered upload key. Play expects SHA1 `FD:B1:C3:0D:67:E7:F1:BE:D0:58:B2:1B:78:73:1C:2F:F9:AA:EB:E7`; the EAS-signed AAB uses SHA1 `53:7A:77:27:81:07:62:3C:0C:A9:B2:76:4E:CB:F2:A7:0F:7E:07:14`. Earlier EAS production AABs `619457a1-cb5e-470a-91f7-63c11f96b94a` and `b6b1b052-ca41-4acb-808f-b2fb8e1e26ed` were checked and use the same rejected `53:7A...` certificate. Generated the current EAS public upload certificate at `.codex-tmp/play-upload-key-reset/rtx5-current-eas-upload-certificate.pem` for a Play Console upload-key reset if the original `FD:B1...` upload keystore is unavailable.
- 2026-06-03: Submitted iOS production build `ce6a24e1-cb82-4449-9ea8-b91691dbe3a1` (`1.0.0`, build `7`) to Apple App Store Connect/TestFlight using the existing EAS-hosted App Store Connect API key. EAS submission ID: `ef787048-dbce-4e3e-ae94-32ce63f47156`. Android Play submission was attempted for build `721dff83-e80f-4c1b-8411-f89662c3b42e` but is blocked because `rtx5-app/google-services.json` is missing; the configured file must be a Google Play service account JSON key.
- 2026-06-03: Created production EAS store builds for Android (`721dff83-e80f-4c1b-8411-f89662c3b42e`, AAB artifact `https://expo.dev/artifacts/eas/f6jp52UHD8tuyZZrG75SyE.aab`) and iOS (`ce6a24e1-cb82-4449-9ea8-b91691dbe3a1`, IPA artifact `https://expo.dev/artifacts/eas/rumRynbWti8iSAA7WgT9kc.ipa`). EAS remote app-version source auto-incremented Android `versionCode` from 5 to 6 and iOS `buildNumber` from 6 to 7. `npm run typecheck` passed before release evaluation. Production OTA publish was intentionally held because staging smoke validation, rollback validation, and mandatory security controls are not yet green.
- 2026-06-03: Created preview EAS builds for Android (`8b5e21ec-1462-43fa-8922-70572f5a69cb`) and iOS (`76cdd877-eeaf-4f85-9583-6ada486fad1b`) on `@chinese-hedger/rtx5-app`. Published preview OTA update group `f4c2885f-2cd6-46cb-b1dc-6bf64cf3bc04` for runtime version `1.0.0` on Android (`019e8d0c-b770-7c1b-8379-8045255f10a3`) and iOS (`019e8d0c-b770-7dd3-81bf-3e3a16769f3f`) with message `Preview OTA update 2026-06-03`. Device smoke validation is still pending before staging promotion.
- 2026-05-22: Relinked the Expo/EAS project to `@chinese-hedger/rtx5-app` with project ID `092a58db-dea9-469a-a383-f27300598812` and OTA URL `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812`. Created the `development`, `preview`, `staging`, and `production` update channels with same-name branches on the new project; no OTA bundles were published.
- 2026-05-21: Added an Android `production-apk` EAS profile for installable internal APK output on the `production` channel with the production EAS environment. Cloud build could not start because the Expo account has exhausted Android builds on the Free plan for this month; quota resets on 2026-06-01.
- 2026-05-06: Android production binary identifier is now `com.rtx5.app`. The `production` EAS profile still targets `channel: production` with Android `buildType: app-bundle`. EAS cloud build remains blocked locally until `eas-cli` is available in an authenticated/networked Expo environment; local Gradle AAB creation now reaches dependency resolution but cannot download required Maven artifacts under sandbox network restrictions.
- 2026-05-06: OTA publish scripts now route `preview`, `staging`, and `production` through `scripts/eas-update.js`, which forces `eas update --platform all` on the selected channel with CI/non-interactive fingerprint settings. Expo config is native-only (`ios`, `android`) with runtime version still gated by `appVersion`; web OTA output is intentionally excluded from the app config and EAS upload ignore list.
- 2026-05-05: Android production EAS build profile now targets Play Store output with `distribution: store`, production channel, and `android.buildType: app-bundle`. Runtime-version gating remains required for any OTA published to the production channel.
- 2026-05-05: Added native-only launch OTA check using `expo-updates` channel and runtime metadata. The app checks only on EAS channels (`preview`, `staging`, `production`) when `expo-updates` is enabled, then fetches and reloads a compatible update selected by EAS Update runtime gating.

## Promotion Criteria

### Preview -> Staging
- [ ] Smoke test on iOS and Android passed.
- [ ] No critical crashes in preview telemetry.
- [ ] Feature flags validated in preview.

### Staging -> Production
- [ ] Full regression matrix passed.
- [ ] Crash-free sessions meet release threshold.
- [ ] Security controls verified per `SECURITY.md`.

## Rollback Checklist
1. Identify failing OTA update ID and scope.
2. Disable risky feature via remote flag if available.
3. Republish last known stable update to affected channel.
4. Verify recovery on iOS and Android devices.
5. Document incident and root cause.

## Incident Response
- Severity levels:
1. Sev-1: trade action corruption or login outage.
2. Sev-2: major UX break with workaround.
3. Sev-3: cosmetic or low-frequency defects.

- Sev-1 and Sev-2 require immediate rollback decision within 30 minutes.

## Store Policy Guardrails
- OTA is used only for JS/assets/config updates allowed by store policy.
- Native capability changes require new binary release.

