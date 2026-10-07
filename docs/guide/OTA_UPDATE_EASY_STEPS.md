# OTA Update Easy Steps

This guide explains Expo OTA updates in simple steps and shows the RTX5 setup.

> Before any RTX5 production OTA, read the shared
> [`OTA_PRODUCTION_BASELINE.md`](OTA_PRODUCTION_BASELINE.md). It records the
> verified binary commits, runtime fingerprints, latest update IDs, and current
> publish blocker.

## What OTA Means

OTA means "over the air" update.

It lets you push new JavaScript code and app assets to installed iOS and Android apps without asking users to reinstall the app from the App Store or Play Store.

OTA can update:

- React Native screens and logic.
- Images, fonts, and other bundled assets.
- Small bug fixes and UI changes.

OTA cannot update:

- Native modules.
- App permissions.
- Android package name or iOS bundle ID.
- Native build settings.
- Any change that needs a new binary build.

If native code changes, make a new EAS build instead of only an OTA update.

## How To Enable OTA In Expo

1. Install `expo-updates`.

   ```bash
   npx expo install expo-updates
   ```

2. Configure EAS Update.

   ```bash
   node ./scripts/run-eas-cli.js update:configure
   ```

   This adds these important values to `app.json`:
   - `runtimeVersion`
   - `updates.url`
   - `extra.eas.projectId`

3. Set a runtime version.

   Recommended simple setup:

   ```json
   {
     "runtimeVersion": {
       "policy": "appVersion"
     }
   }
   ```

   This means app version `1.0.0` only receives OTA updates built for runtime `1.0.0`.

4. Add EAS build channels in `eas.json`.

   Example:

   ```json
   {
     "build": {
       "preview": {
         "channel": "preview",
         "distribution": "internal"
       },
       "staging": {
         "channel": "staging",
         "distribution": "internal"
       },
       "production": {
         "channel": "production"
       }
     }
   }
   ```

5. Build the app with EAS.

   OTA only works in installed native builds, not in Expo Go.

   ```bash
   npm run build:android
   npm run build:ios
   ```

6. Publish an OTA update to a channel.

   ```bash
   npm run update:preview -- --message "Fix preview bug"
   ```

7. Test the installed app.

   Close and reopen the installed app. If the update is compatible with the app runtime and channel, Expo downloads and applies it.

8. Promote safely.

   Use this order:

   ```text
   preview -> staging -> production
   ```

   Test on `preview` first, then `staging`, then publish or republish to `production`.

## RTX5 Current OTA Setup

The real app is inside:

```bash
cd rtx5-app
```

OTA is already configured here.

Confirmed setup:

- `expo-updates` is installed in `rtx5-app/package.json`.
- `rtx5-app/app.json` has `updates.enabled: true`.
- `rtx5-app/app.json` has the EAS update URL.
- `rtx5-app/app.json` uses `runtimeVersion.policy: fingerprint`.
- `rtx5-app/eas.json` has `preview`, `staging`, and `production` channels.
- The app calls `useOtaUpdateOnLaunch()` from the root layout.
- The OTA check only runs on native non-dev builds for `preview`, `staging`, and `production`.

## RTX5 OTA Commands

From `rtx5-app`, build a preview app:

```bash
npm run build:preview
```

Publish a preview OTA update:

```bash
npm run update:preview -- --message "Preview OTA update"
```

Publish a staging OTA update:

```bash
npm run update:staging -- --message "Staging OTA update"
```

Publish a production OTA update:

```bash
npm run update:prod -- --message "Production OTA update"
```

## Direct Expo Production OTA

Use this path when you want to publish from your local terminal instead of GitHub.

1. Open PowerShell anywhere inside the cloned repository, then enter the app
   folder without relying on a user-specific checkout path.

   ```powershell
   Set-Location (Join-Path (git rev-parse --show-toplevel) 'rtx5-app')
   ```

2. Confirm Expo login.

   ```powershell
   npx.cmd --yes eas-cli@21.4.0 whoami
   ```

   Confirm that the output is an Expo account authorized to access the project
   configured in `app.json`. Do not require one machine-specific account name.

3. Run release checks against the verified installed-binary commit.

   ```powershell
   $binaryCommit = "<verified-installed-binary-git-sha>"

   npm run typecheck
   npm test
   node .\scripts\ota\check-eas-env.js production
   node .\scripts\ota\check-ota-safety.js --base $binaryCommit
   node .\scripts\ota\print-update-context.js --channel production
   npx.cmd expo-updates runtimeversion:resolve --platform android
   npx.cmd expo-updates runtimeversion:resolve --platform ios
   npx.cmd expo-doctor
   ```

4. Publish only if the resolved runtimes exactly match the intended installed
   binaries.

   ```powershell
   $env:RTX5_OTA_BASE_REF = $binaryCommit
   npm run update:prod -- --message "production $(git rev-parse --short HEAD)"
   ```

Credentials needed for direct Expo OTA:

- If `whoami` shows the Expo account, no password is needed.
- If `whoami` says you are not logged in, run
  `npx.cmd --yes eas-cli@21.4.0 login` and authenticate with an Expo account
  authorized for the configured project.
- The manual GitHub workflow requires the repository secret `EXPO_TOKEN`.

## RTX5 GitHub Manual OTA

Pushing code does not publish an OTA. The current workflow uses
`workflow_dispatch` and must be started manually from GitHub Actions.

Important: this does not upload anything to Play Store or App Store. It publishes the JavaScript/assets bundle to EAS Update. Installed production apps then download the update from Expo when they open.

For production:

- Run the workflow from the approved `release` branch.
- Select channel `production`.
- Enter the verified installed-binary Git commit in the required `base-ref`
  input.
- Select `all` only when both resolved platform runtimes match their intended
  binaries.
- A normal push to `main`, `staging`, or `release` does not publish an OTA.

Before this works, add this GitHub repository secret:

```text
EXPO_TOKEN
```

Create the token from an Expo account authorized for the project configured in
`app.json`, then add it in GitHub:

```text
GitHub repository -> Settings -> Secrets and variables -> Actions -> New repository secret
```

The workflow validates before publishing:

- `npm ci`
- `npm run typecheck`
- `npm test`
- Required EAS environment names
- Native-impacting changes since `base-ref`
- Android/iOS runtime context

The workflow blocks OTA publication when native-sensitive files change,
including:

- `rtx5-app/app.json`
- `rtx5-app/eas.json`
- `rtx5-app/package.json`
- `rtx5-app/package-lock.json`
- `rtx5-app/android/**`
- `rtx5-app/ios/**`
- config plugin files such as `rtx5-app/with*.js`

If those files change, make a new EAS build instead of OTA.

## Safe Release Rule

Use OTA only for JavaScript and asset changes.

Use a new EAS build when you change:

- Native dependencies.
- `app.json` native config.
- Permissions.
- App icons or splash native behavior.
- Android or iOS native folders.
- Runtime version or app version.

## Quick Checklist

Before OTA:

- Run tests or typecheck for the changed area.
- Confirm the change does not need native code.
- Confirm the target channel is correct.
- Confirm the runtime version matches the installed build.

After OTA:

- Open the installed app.
- Confirm the fix appears.
- Check for crashes.
- If broken, roll back or republish the last stable update.

## References

- Expo EAS Update docs: https://docs.expo.dev/eas-update/how-it-works/
- Expo EAS Update with builds: https://docs.expo.dev/build/updates/
- Expo deployment guide: https://docs.expo.dev/eas-update/deployment/
