# Phase 08 - Beta Release and OTA Rollout

## Objective
Execute controlled beta distribution and staged OTA promotion with rollback readiness.

## In Scope
- Build and distribute iOS TestFlight and Android internal builds.
- Validate OTA channels and runtime gating.
- Run full regression and release checklists.
- Promote from preview to staging to production channel.

## Out of Scope
- Public store wide release marketing operations.

## Exact Implementation Tasks
1. Cut release candidate branch and freeze feature merges.
2. Build signed binaries for iOS and Android beta channels.
3. Run full test matrix and defect triage.
4. Publish OTA bundle to preview and run smoke tests.
5. Promote OTA to staging after acceptance.
6. Monitor crash/error/performance telemetry for soak period.
7. Promote to production channel if gates pass.
8. Document release notes and known limitations.

## API Dependencies
- Production-like staging backend environment.
- Feature flag controls for rollout toggles.

## Acceptance Checklist
- [ ] iOS and Android beta builds installed and validated.
- [ ] OTA promotion process executed without runtime mismatch.
- [ ] Monitoring dashboards show no regression spikes.
- [ ] Rollback procedure tested at least once in staging.

## Test Checklist
- [ ] Full Detox suite pass.
- [ ] Maestro smoke suite pass on both platforms.
- [ ] Manual high-risk journey sign-off.
- [x] Android no-OTA device smoke: installed fixed `1.1.5` build `19` over the crashing build with preserved local data and passed five open/home/reopen/force-stop/reopen cycles with no fatal logcat matches.

## Exit Criteria
- Beta release is declared stable with rollback readiness confirmed.

## Progress Notes
- 2026-06-10: Published the iOS OTA display-version test for build `1.1.5 (23)`. The app-visible version marker is now `1.1.6` via OTA group `108e4391-be4c-46d2-8831-b67541fdf44c`, iOS update `019eb163-4bde-7625-ae4b-68880e4e568b`, runtime `f4184b3e04e9e7200364ce9ab4dfd4ec18950364`. Native `app.json` remains `1.1.5` because this is an OTA compatibility test, not a new TestFlight binary version.
- 2026-06-10: Submitted OTA-enabled iOS TestFlight candidate `de72ff78-0417-4e21-b9ce-833171064e58` (`1.1.5`, build `23`, runtime `f4184b3e04e9e7200364ce9ab4dfd4ec18950364`) through EAS submission `1f9c0847-f858-4d3e-b1bc-fa38945cea0e`. Direct IPA: `https://expo.dev/artifacts/eas/ttcD21JyMUABf5qHJjQm2N.ipa`. Published matching production iOS OTA update group `a31a3f14-a33e-42a3-ac32-2ed3b8f05242` (`019eb14d-8cdd-75ce-b019-1f6539d539ed`) for runtime `f4184b3e04e9e7200364ce9ab4dfd4ec18950364`. Apple processing and manual iPhone OTA fetch/reopen smoke are pending.
- 2026-06-10: Submitted fixed iOS no-OTA TestFlight candidate `ff562ad7-8be9-4bb6-b719-f488b31cb7db` (`1.1.5`, build `22`, runtime `e4742e46c961072f39776c78678b681b8c5d5b78`) to App Store Connect through EAS submission `fb97d303-0248-4b99-9952-d381db6a5f0e`. Direct IPA: `https://expo.dev/artifacts/eas/xwK6henEyp59tCS3ZmDBdg.ipa`. Apple processing and manual iPhone close/reopen smoke are still pending before the iOS beta validation item can be checked.
- 2026-06-10: Built Android internal no-OTA APK `e0d111e8-2976-4921-8c25-2d4b67c5f997` (`1.1.5`, versionCode `19`, production channel, runtime `7fbdceaf861e84c582a844d56655a3cecd894d77`) after eliminating OTA as the Android crash cause and fixing the bundled JS startup defect. Direct artifact: `https://expo.dev/artifacts/eas/tLa64FJNE1g5bPHfcv14Dr.apk`. Android preserved-data reopen smoke passed; iOS TestFlight rebuild/reopen validation remains pending before the combined beta acceptance item can be checked.
- 2026-06-03: Play Console manual upload of Android production AAB `application-721dff83-e80f-4c1b-8411-f89662c3b42e.aab` failed with upload-key mismatch. Registered Play upload key SHA1 is `FD:B1:C3:0D:67:E7:F1:BE:D0:58:B2:1B:78:73:1C:2F:F9:AA:EB:E7`, while the current EAS Android build key SHA1 is `53:7A:77:27:81:07:62:3C:0C:A9:B2:76:4E:CB:F2:A7:0F:7E:07:14`. If the original upload keystore is not available, use `.codex-tmp/play-upload-key-reset/rtx5-current-eas-upload-certificate.pem` to request an upload-key reset in Play Console before uploading another AAB.
- 2026-06-03: iOS production build `ce6a24e1-cb82-4449-9ea8-b91691dbe3a1` was submitted to App Store Connect/TestFlight through EAS submission `ef787048-dbce-4e3e-ae94-32ce63f47156` using the existing EAS-hosted App Store Connect API key. Android submission remains blocked until a Google Play service account JSON key is placed at `rtx5-app/google-services.json` or `eas.json` is updated to point to the provided key file.
- 2026-06-03: Ran production EAS store builds for Android (`721dff83-e80f-4c1b-8411-f89662c3b42e`) and iOS (`ce6a24e1-cb82-4449-9ea8-b91691dbe3a1`) using existing EAS remote signing credentials; no Apple or Google submit credentials were required because no store submission was attempted. Android `versionCode` advanced to 6 and iOS `buildNumber` advanced to 7 through the remote app-version source. Production OTA publish was not executed because staging smoke validation, rollback validation, and `SECURITY.md` mandatory controls remain incomplete.
- 2026-06-03: Ran preview EAS builds for Android (`8b5e21ec-1462-43fa-8922-70572f5a69cb`) and iOS (`76cdd877-eeaf-4f85-9583-6ada486fad1b`), then published preview OTA update group `f4c2885f-2cd6-46cb-b1dc-6bf64cf3bc04` for runtime version `1.0.0` on both platforms. `npm run typecheck` passed before publish. Acceptance remains pending until the installed builds are smoke tested on devices and rollback validation is exercised.
- 2026-05-22: Expo/EAS ownership was moved to `@chinese-hedger/rtx5-app`, and `rtx5-app/app.json` now points `owner`, `expo-updates.username`, `extra.eas.projectId`, and `updates.url` at the new project. The `development`, `preview`, `staging`, and `production` channels and matching branches exist on the new EAS project; release acceptance remains pending until beta builds, smoke tests, and rollback validation are completed.
- 2026-05-21: Added a production-channel Android APK profile (`production-apk`) for internal install links while keeping the store `production` profile as AAB output. EAS cloud APK creation is blocked by the account's exhausted Android Free plan quota until 2026-06-01 or a plan upgrade.
- 2026-05-06: Updated the Android production application ID to `com.rtx5.app` and added an Android-only production EAS build script for AAB output. EAS cloud build could not start in the sandbox because `eas-cli` is not installed and npm registry access is blocked. A local Gradle AAB attempt reached Android dependency resolution, then stopped because Maven access to required artifacts such as React Native, Hermes, and Fresco is blocked; owner next action is to run the production Android EAS build from an authenticated/networked Expo environment.
- 2026-05-06: Added guarded channel publish scripts for `preview`, `staging`, and `production` EAS Updates. The wrapper keeps channel selection explicit, publishes only native platforms, and leaves runtime-version compatibility enforced by EAS Update/app-version gating.
- 2026-05-05: Integrated the root OTA launch check for EAS Update channels and verified Expo config plus strict TypeScript. Production Android remains configured for AAB output through the `production` EAS profile.

