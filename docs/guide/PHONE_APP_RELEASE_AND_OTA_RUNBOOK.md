# Phone App Release and OTA Runbook

Use this file when you want to update the RTX5 mobile app in the future.

Before any production OTA, read
[`OTA_PRODUCTION_BASELINE.md`](OTA_PRODUCTION_BASELINE.md). It is the shared
runtime, binary-commit, and update-ID baseline used across computers.

## Current Setup

- Real app folder: `rtx5-app`
- Expo project owner and slug: see `owner` and `slug` in `rtx5-app/app.json`
- OTA system: Expo EAS Update through `expo-updates`
- Runtime version policy: `fingerprint`
- Current native config version: see `rtx5-app/app.json`
- Current OTA display version: see `rtx5-app/src/config/appDisplayVersion.ts`
- Update URL: `https://u.expo.dev/092a58db-dea9-469a-a383-f27300598812`
- OTA channels:
  - `preview`
  - `staging`
  - `production`
- GitHub production OTA branch: `release`
- GitHub secret required for OTA: `EXPO_TOKEN`
- Required EAS environment names for every OTA channel:
  - `EXPO_PUBLIC_APP_ENV`
  - `EXPO_PUBLIC_API_BASE_URL`
  - `EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL`
  - `EXPO_PUBLIC_DEMO_API_BASE_URL`
  - `EXPO_PUBLIC_TERMS_URL`
  - `EXPO_PUBLIC_PRIVACY_POLICY_URL`
  - `EXPO_PUBLIC_CANDLE_HISTORY_PATH`
  - `EXPO_PUBLIC_CANDLE_HISTORY_QUERY_STYLE`
  - `EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES`

## What Is Already Done

- OTA is enabled in `rtx5-app/app.json`.
- `expo-updates` is installed.
- `rtx5-app/eas.json` has `preview`, `staging`, and `production` channels.
- GitHub workflow `RTX5 OTA Update` is present in `.github/workflows/eas-update.yml`.
- The workflow expects a GitHub secret named `EXPO_TOKEN`; verify it before
  each run without printing its value.
- Production runs require the `release` branch. Verify that the remote branch
  exists and points to the approved OTA-safe commit before starting a run.
- The workflow requires the installed-binary source commit as `base-ref`.

## Important Rule

OTA does not upload a new app to Play Store or App Store.

OTA publishes JavaScript and bundled asset changes to Expo. Users who already installed the compatible app build receive the update when they open or restart the app.

With `runtimeVersion.policy: fingerprint`, a normal OTA must publish to the fingerprint that Expo resolves from the current source. Do not use `RTX5_FORCE_RUNTIME_VERSION` to push new source into an older binary. That bypasses the safety gate. Use it only for an explicitly approved rollback to a known compatible update.

If the current resolved fingerprint differs from the installed binary fingerprint, either the installed binary is old or the current source has native/config/dependency changes. Compare against the binary commit first. If native-impacting files changed, make a new binary build.

## When OTA Is Allowed

Use OTA for:

- Screen/UI changes.
- TypeScript/JavaScript logic changes.
- Bug fixes in React Native code.
- Bundled image/asset changes that do not require native config changes.

Do not use OTA for:

- `app.json` native config changes.
- `eas.json` changes.
- `package.json` or `package-lock.json` dependency changes.
- Android/iOS native folder changes.
- Native permissions.
- App icon/splash/native asset config changes.
- Runtime version or app version changes.

If any of those native-sensitive files change, create a new production build and submit it to the stores.

## Future Production OTA Using GitHub

Follow these steps when the change is OTA-safe.

1. Open PowerShell in the project root.

   ```powershell
   $repoRoot = git rev-parse --show-toplevel
   Set-Location $repoRoot
   ```

2. Verify that the remote `release` branch exists and then switch to it.

   ```powershell
   git fetch origin --prune
   git ls-remote --heads origin refs/heads/release
   git switch release
   ```

   Stop if `refs/heads/release` is absent. Do not create it from current `main`
   merely to make the workflow run; first select the approved OTA-safe source
   described in `OTA_PRODUCTION_BASELINE.md`.

3. Check changed files.

   ```powershell
   git status --short
   ```

4. Do not commit random screenshots or temporary files.

   Avoid files like:

   ```text
   assets/image copy*.png
   .codex-tmp/**
   ```

5. Run checks before pushing.

   ```powershell
   Set-Location (Join-Path $repoRoot 'rtx5-app')
   npm run typecheck
   node .\scripts\ota\check-eas-env.js production
   node .\scripts\ota\check-ota-safety.js --base <installed-binary-git-sha>
   node .\scripts\ota\print-update-context.js --channel production
   npx.cmd expo-doctor
   ```

6. Go back to repo root.

   ```powershell
   Set-Location $repoRoot
   ```

7. Add only the files you intentionally changed.

   Example:

   ```powershell
   git add <exact-file-path-1> <exact-file-path-2>
   ```

8. Commit the change.

   ```powershell
   git commit -m "Production OTA update"
   ```

9. Push to `release`.

   ```powershell
   git push origin release
   ```

10. Open GitHub Actions.

    ```text
    https://github.com/YoForex005/RTX-5Mobile-App/actions
    ```

11. Click `RTX5 OTA Update`, then click `Run workflow`.

12. Select branch `release`, channel `production`, the validated platform, and
    enter the verified installed-binary commit in `base-ref`.

13. Start the workflow and confirm the run is green/success.

If the run succeeds, the production OTA has been published.

## Manual GitHub OTA

Use this if you want to manually start OTA from the GitHub website.

1. Open:

   ```text
   https://github.com/YoForex005/RTX-5Mobile-App/actions
   ```

2. Click `RTX5 OTA Update`.

3. Click `Run workflow`.

4. Select:

   ```text
   Branch: release
   EAS Update channel: production
   Platform: all
   Base ref: <verified-installed-binary-git-sha>
   ```

5. Enter message:

   ```text
   Production OTA update
   ```

6. Click the green `Run workflow` button.

7. Wait for success.

## Direct Expo OTA Fallback

Use this if GitHub is not working and you want to publish from this computer.

1. Open PowerShell anywhere inside the cloned repository.

   ```powershell
   Set-Location (Join-Path (git rev-parse --show-toplevel) 'rtx5-app')
   ```

2. Confirm Expo login.

   ```powershell
   npx.cmd --yes eas-cli@21.4.0 whoami
   ```

3. Run checks.

   ```powershell
   npm run typecheck
   npx.cmd expo-doctor
   ```

4. Publish production OTA.

   ```powershell
   $env:RTX5_OTA_BASE_REF="<installed-binary-git-sha>"
   npm run update:prod -- --message "production $(git rev-parse --short HEAD)"
   ```

   The wrapper uses `--environment production`, checks required EAS env names, prints Android/iOS runtime context, and blocks production OTA if native-impacting files changed since the installed binary commit.

   Preview and staging must have their own EAS environment variables before they can be used for production-parity testing. If `node .\scripts\ota\check-eas-env.js preview` fails, do not trust preview OTA behavior.

## Production Store Build

Use this when OTA is not enough.

1. Open PowerShell anywhere inside the cloned repository.

   ```powershell
   Set-Location (Join-Path (git rev-parse --show-toplevel) 'rtx5-app')
   ```

2. Run checks.

   ```powershell
   npm run typecheck
   npx.cmd expo-doctor
   ```

3. Build Android and iOS production binaries.

   ```powershell
   npx.cmd --yes eas-cli@21.4.0 build --platform all --profile production
   ```

4. Android output is an `.aab` for Play Store.

5. iOS output is an `.ipa` for App Store Connect/TestFlight.

## Android Play Store Notes

Current Android package:

```text
com.rtx5.app
```

Current EAS upload key SHA1:

```text
53:7A:77:27:81:07:62:3C:0C:A9:B2:76:4E:CB:F2:A7:0F:7E:07:14
```

Google Play previously expected old upload key SHA1:

```text
FD:B1:C3:0D:67:E7:F1:BE:D0:58:B2:1B:78:73:1C:2F:F9:AA:EB:E7
```

Upload-key reset request has been submitted in Google Play Console.

After Google approves it, the Play Console upload key certificate should change to the EAS key:

```text
53:7A:77:27:81:07:62:3C:0C:A9:B2:76:4E:CB:F2:A7:0F:7E:07:14
```

Only after that, upload the Android `.aab` again.

## Credentials Needed

Do not write secret values in code or docs.

Credentials used:

- Expo/GitHub OTA:
  - GitHub repository secret named `EXPO_TOKEN`
- Android Play Store submission:
  - Google Play service account JSON, if using automatic EAS submit
  - Manual Play Console upload does not need this file
- iOS App Store submission:
  - Existing EAS/App Store Connect credentials are already configured

## Verify OTA On Phone

After OTA success:

1. Open the installed production app.
2. Wait 5-10 seconds.
3. Fully close the app.
4. Open it again.
5. Confirm the change appears.

Expo usually downloads the OTA on one launch and applies it on the next reload/restart.

## If OTA Fails

1. Open GitHub Actions.
2. Open failed `RTX5 OTA Update` run.
3. Read the failed step.
4. Common causes:
   - Missing or wrong `EXPO_TOKEN`.
   - TypeScript error.
   - Expo Doctor error.
   - Native-sensitive files changed.
5. Fix the issue, commit, and push again.

## Branch Meaning

- `main` publishes preview OTA.
- `staging` publishes staging OTA.
- `release` publishes production OTA.

For production phone app updates, use:

```text
release
```
