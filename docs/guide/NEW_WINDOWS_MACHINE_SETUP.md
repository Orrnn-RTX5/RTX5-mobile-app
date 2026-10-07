# RTX5 New Windows Machine Setup

This repository now has one tracked setup path for a second Windows laptop or
desktop. It reproduces the committed source, public configuration, dependency
tree, Node/npm versions, EAS CLI version, and OTA safety documentation.

It does not copy passwords, authenticated sessions, signing keys, EAS/GitHub
secrets, Android SDK binaries, caches, USB authorization, or a phone's state.
Those items are machine-specific and must not be stored in Git.

## Source of truth

- Application directory: `rtx5-app`
- Toolchain manifest: `WORKSPACE_TOOLCHAIN.json`
- Node selector: `.nvmrc`
- App dependency lock: `rtx5-app/package-lock.json`
- Test/release CLI lock: `tools/js-toolchain/package-lock.json`
- OTA baseline: `docs/guide/OTA_PRODUCTION_BASELINE.md`
- Current OTA summary: `OTA_UPDATE_INFORMATION.md`

The Expo files and package at the repository root are a legacy shell. Run all
application, Expo, npm, EAS, test, and OTA commands from `rtx5-app`.

## First setup on a new computer

Open PowerShell and install Git plus the exact Node line:

```powershell
winget install --id Git.Git --exact
winget install --id OpenJS.NodeJS.22 --version 22.23.1 --exact
```

If another major Node version is already installed, use a Node version manager
or remove that conflicting installation before installing Node 22.23.1. Reopen
PowerShell, then confirm:

```powershell
node --version
npm.cmd --version
```

Expected:

```text
v22.23.1
10.9.8
```

Clone the private repository using Git Credential Manager. Never put a GitHub
token in the clone URL:

```powershell
git clone https://github.com/YoForex005/RTX-5Mobile-App.git
Set-Location .\RTX-5Mobile-App
powershell -NoProfile -ExecutionPolicy Bypass -File .\SETUP_NEW_WINDOWS_MACHINE.ps1
```

The setup script:

1. refuses to pull over local changes;
2. uses `git pull --ff-only`;
3. applies Windows-local Git line-ending and long-path settings;
4. enforces the exact tracked Node/npm versions;
5. runs `npm ci` in both `tools/js-toolchain` and `rtx5-app`;
6. runs the TypeScript check;
7. runs the parity verifier; and
8. never starts a build or publishes an OTA.

For the full app test suite:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\SETUP_NEW_WINDOWS_MACHINE.ps1 -FullValidation
```

For future pulls on that machine, run the same setup command again. It is the
safe pull/install/verify entry point.

## Android and a physical phone

Install Android Studio first. The bootstrap checksum-verifies the tracked
command-line tools, Platform-Tools/ADB, Android platform, and Build-Tools
archives before installing them. For a USB-connected physical Android phone,
the emulator is optional:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\SETUP_NEW_WINDOWS_MACHINE.ps1 -ConfigureAndroid -CheckAndroidDevice
```

To also install and create the tracked default emulator profile:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\SETUP_NEW_WINDOWS_MACHINE.ps1 -ConfigureAndroid -WithAndroidEmulator
```

Every computer must be authorized separately on the phone:

1. enable Developer options and USB debugging;
2. connect the USB cable in data mode;
3. accept the RSA authorization prompt on the phone; and
4. run `adb devices`.

The parity verifier reports only the number of authorized devices. It never
prints a device serial.

`ACCESS_PHONE_LOCAL.ps1` and `phone-uinput-tap` are intentionally machine-only.
They contain device-specific behavior and are protected by the tracked
`.gitignore`. Normal ADB access does not depend on those files.

## Expo/EAS access

The release CLI is pinned to EAS CLI 21.4.0 through
`WORKSPACE_TOOLCHAIN.json`. Do not use `eas-cli@latest` for this release line.

The exact EAS dependency tree is committed in
`tools/js-toolchain/package-lock.json`. Authenticate separately on each
computer after running the root setup:

```powershell
Set-Location .\rtx5-app
node .\scripts\run-eas-cli.js login
Set-Location ..
powershell -NoProfile -ExecutionPolicy Bypass -File .\VERIFY_WORKSPACE_PARITY.ps1 -CheckDependencies -CheckEasLogin
```

Git cannot restore:

- the Expo/EAS authenticated account;
- GitHub Actions `EXPO_TOKEN`;
- remote EAS environment values;
- Apple or Google signing credentials; or
- the Play submission service-account file.

For Play submission, restore `rtx5-app/google-services.json` from the approved
secret store only when needed. Despite its historical filename, `eas.json`
uses it as `serviceAccountKeyPath`; it is ignored and must never be committed.

## Environment safety

`rtx5-app/.env` is currently tracked, so its public client configuration is
copied by Git. `rtx5-app/.env.example` contains names only and keeps the feed
credential blank.

A nonempty legacy `EXPO_PUBLIC_FEED_BROKER_TOKEN` is currently present in the
tracked public configuration. An `EXPO_PUBLIC_*` value is bundled into the
client and cannot be treated as a secret. Its broker migration, rotation, and
removal must be completed separately; do not copy it into documentation,
messages, templates, or logs.

Cloud builds and OTA updates use the selected remote EAS environment, not just
the local `.env`. Before any release, verify the remote names:

```powershell
Set-Location .\rtx5-app
npm.cmd run ota:check-env -- production
npm.cmd run ota:context -- --channel production
```

## Before any OTA

An identical Git commit is necessary but not sufficient for an OTA. The
installed Android and iOS binaries must also match the resolved runtime
fingerprints. Follow `docs/guide/OTA_PRODUCTION_BASELINE.md`; if either runtime
differs, do not publish.

The setup and parity scripts never publish an update. The GitHub OTA workflow
also remains manual-only.

## What will and will not match

Git plus the setup script reproduces:

- every committed source, Swagger, config, prompt, guide, and OTA baseline;
- the exact Git commit;
- Node 22.23.1 and npm 10.9.8 requirements;
- both lockfile dependency graphs through `npm ci`;
- the complete locked EAS CLI 21.4.0 and tsx 4.23.1 tool trees; and
- required project/runtime identifiers.

It intentionally recreates or restores separately:

- `node_modules`, `.expo`, generated `android`/`ios`, build output, and caches;
- Android Studio, SDK/JBR, ADB, emulator images, and USB drivers;
- passwords, tokens, certificates, service-account JSON, and signing keys;
- Expo/EAS, GitHub, Apple, and Google authenticated sessions;
- app SecureStore/login state; and
- local IDE, Claude, Netlify, phone-helper, PID, and device state.

Run the strict check at any time:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\VERIFY_WORKSPACE_PARITY.ps1 -CheckDependencies -CheckAndroid -CheckEasLogin
```

Add `-FailOnSecurityWarnings` before any release gate; it intentionally blocks
while the tracked public feed credential exception remains.

`PASS` means the requested source and machine checks align. `PASS WITH SECURITY
EXCEPTION` means parity passed but the known tracked public feed credential
still needs migration/rotation. `WARNING` identifies other nonblocking local
follow-up. `BLOCKED` means do not build or publish from that checkout.
