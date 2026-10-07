# RTX5 Deployment Runbook

> Authoritative reference for build, release, OTA, and rollback operations.
> 
> **Owner**: DevOps  
> **Last Updated**: 2026-04-06  
> **App Version**: 1.0.0  
> **Expo SDK**: 54  
> **Runtime Version Policy**: `appVersion`

---

## Table of Contents

1. [Environment Matrix](#1-environment-matrix)
2. [Prerequisites](#2-prerequisites)
3. [Environment Variables](#3-environment-variables)
4. [Build Pipeline](#4-build-pipeline)
5. [OTA Update Strategy](#5-ota-update-strategy)
6. [Promotion Gates](#6-promotion-gates)
7. [Pre-Build Validation](#7-pre-build-validation)
8. [Platform Configuration](#8-platform-configuration)
9. [Store Submission](#9-store-submission)
10. [Monitoring & Observability](#10-monitoring--observability)
11. [CI/CD Pipeline Design](#11-cicd-pipeline-design)
12. [Command Reference](#12-command-reference)

---

## 1. Environment Matrix

| Property | Preview | Staging | Production |
|---|---|---|---|
| **EAS Profile** | `preview` | `staging` | `production` |
| **OTA Channel** | `preview` | `staging` | `production` |
| **Distribution** | Internal | Internal | App Store / Play Store |
| **Auto-Increment** | No | No | Yes |
| **Debug Tools** | Enabled | Disabled | Disabled |
| **Log Level** | `debug` | `warn` | `error` |
| **Cleartext HTTP** | Allowed | Allowed | **Blocked** |
| **Certificate Pinning** | Disabled | Disabled | **Enabled** |
| **Audience** | Dev team | Internal beta / QA | End users |
| **Risk Level** | Low | Medium | Critical |

---

## 2. Prerequisites

### 2.1 Required Tooling

| Tool | Minimum Version | Install |
|---|---|---|
| Node.js | 20.x | [nodejs.org](https://nodejs.org) |
| npm | 10.x | Bundled with Node.js |
| EAS CLI | 16.20.0 | `npm install -g eas-cli` |
| Expo CLI | Latest | `npm install -g expo-cli` |
| TypeScript | 5.9.x | Project dependency |

### 2.2 Account Access

| Account | Purpose | Required For |
|---|---|---|
| Expo (EAS) | Cloud builds, OTA updates | All environments |
| Apple Developer | iOS builds, TestFlight, App Store | Staging, Production |
| Google Play Console | Android builds, Play Store | Staging, Production |

### 2.3 Authentication

```bash
# Authenticate with EAS
eas login

# Verify project linkage
eas whoami
eas project:info
```

---

## 3. Environment Variables

### 3.1 Variable Registry

| Variable | Type | Description | Secret |
|---|---|---|---|
| `EXPO_PUBLIC_APP_ENV` | Build-time | Environment identifier (`development`/`preview`/`staging`/`production`) | No |
| `EXPO_PUBLIC_API_BASE_URL` | Build-time | REST API base URL | No |
| `EXPO_PUBLIC_QUOTES_WS_URL` | Build-time | Quotes WebSocket feed URL | No |
| `EXPO_PUBLIC_CANDLES_WS_URL` | Build-time | Candles WebSocket feed URL | No |
| `EXPO_PUBLIC_ACCOUNT_WS_URL` | Build-time | Account WebSocket feed URL | No |
| `EXPO_PUBLIC_WS_URL` | Build-time | Legacy multi-channel WebSocket URL | No |
| `EXPO_PUBLIC_ENABLE_DEBUG_TOOLS` | Build-time | Show debug overlays and devtools | No |
| `EXPO_PUBLIC_LOG_LEVEL` | Build-time | Minimum log level (`debug`/`info`/`warn`/`error`) | No |

### 3.2 Secret Management

> **Rule**: Secrets are **never** committed to source control.

| Method | Use Case |
|---|---|
| EAS Secrets (`eas secret:create`) | API keys, signing credentials, third-party tokens |
| `.env` files (gitignored) | Local development overrides |
| `deployment/env/.env.*` templates | Reference templates with placeholder values only |

### 3.3 Per-Environment Templates

Templates are located in `deployment/env/`. Copy the appropriate template to `rtx5-app/.env` before building:

```bash
# For local development
cp deployment/env/.env.development rtx5-app/.env

# For preview builds
cp deployment/env/.env.preview rtx5-app/.env
```

---

## 4. Build Pipeline

### 4.1 Build Configuration

All build profiles are defined in `rtx5-app/eas.json`:

```json
{
  "cli": {
    "version": ">= 16.20.0",
    "appVersionSource": "remote"
  },
  "build": {
    "preview": {
      "distribution": "internal",
      "channel": "preview"
    },
    "staging": {
      "distribution": "internal",
      "channel": "staging"
    },
    "production": {
      "channel": "production",
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

### 4.2 Build Commands

```bash
# ── Preview Build (internal dev testing) ──────────────────────────
cd rtx5-app && eas build --platform all --profile preview --non-interactive

# ── Staging Build (internal beta) ─────────────────────────────────
cd rtx5-app && eas build --platform all --profile staging --non-interactive

# ── Production Build (public release) ─────────────────────────────
cd rtx5-app && eas build --platform all --profile production --non-interactive

# ── Platform-specific builds ──────────────────────────────────────
cd rtx5-app && eas build --platform android --profile <profile> --non-interactive
cd rtx5-app && eas build --platform ios --profile <profile> --non-interactive
```

### 4.3 Build Lifecycle

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Source     │───▶│  Pre-Build  │───▶│  EAS Cloud  │───▶│   Artifact  │
│   Commit     │    │  Validation │    │   Build     │    │  Published  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                         │                                      │
                    TypeScript ✓                          Build URL
                    ESLint ✓                              QR Code
                    Tests ✓                               Install Link
                    Audit ✓
```

---

## 5. OTA Update Strategy

### 5.1 How OTA Works

EAS Update delivers JavaScript and asset changes **without** requiring a new binary build. Users receive updates silently on next app launch.

### 5.2 Runtime Version Gating

| Rule | Description |
|---|---|
| **Declaration** | Every binary build declares `runtimeVersion` via `app.json` (`"policy": "appVersion"`) |
| **Compatibility** | OTA bundles **must** target a matching runtime version |
| **Cross-promotion** | **Never** promote an OTA bundle across incompatible runtime groups |
| **Native changes** | New permissions, native modules, or SDK upgrades require a **new binary build** |

### 5.3 OTA Commands

```bash
# ── Publish to preview ────────────────────────────────────────────
cd rtx5-app && eas update --channel preview --message "fix: describe change"

# ── Promote to staging ────────────────────────────────────────────
cd rtx5-app && eas update --channel staging --message "rc: describe change"

# ── Release to production ─────────────────────────────────────────
cd rtx5-app && eas update --channel production --message "v1.x.x: describe change"
```

### 5.4 Store Policy Compliance

| Rule | Detail |
|---|---|
| ✅ Allowed via OTA | JavaScript logic, UI layouts, styles, assets, configuration |
| ❌ Requires new binary | New native modules, new OS permissions, Expo SDK upgrades |

---

## 6. Promotion Gates

### 6.1 Preview → Staging

| # | Gate | Owner | Blocking |
|---|---|---|---|
| 1 | `tsc --noEmit` passes with zero errors | Dev | ✅ |
| 2 | ESLint passes (errors = 0, warnings acceptable) | Dev | ✅ |
| 3 | Unit/integration test suite passes | QA | ✅ |
| 4 | `npm audit --audit-level=high` clean | DevOps | ✅ |
| 5 | Smoke test on iOS device | QA | ✅ |
| 6 | Smoke test on Android device | QA | ✅ |
| 7 | No critical crashes in preview telemetry | QA | ✅ |
| 8 | Feature flags validated | Product | ⚠️ |

### 6.2 Staging → Production

| # | Gate | Owner | Blocking |
|---|---|---|---|
| 1 | Full regression matrix passed | QA | ✅ |
| 2 | Crash-free sessions ≥ 99.5% during soak | QA | ✅ |
| 3 | Security controls verified ([SECURITY.md](../docs/guide/SECURITY.md)) | Security | ✅ |
| 4 | No open Sev-1 or Sev-2 defects | QA | ✅ |
| 5 | Performance benchmarks within baseline | QA | ✅ |
| 6 | Rollback procedure tested in staging | DevOps | ✅ |
| 7 | Release notes drafted | Product | ✅ |
| 8 | Legal/compliance sign-off (if applicable) | Legal | ⚠️ |

### 6.3 Promotion Flow Diagram

```
Feature Branch
    │
    ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Preview    │────▶│   Staging    │────▶│   Production    │
│  (dev/QA)    │     │  (beta soak) │     │  (public)       │
└─────────────┘     └──────────────┘     └─────────────────┘
     │ gates:            │ gates:              │ gates:
     │ • type-check      │ • regression        │ • store review
     │ • lint             │ • crash-free        │ • staged rollout
     │ • smoke test       │ • security          │
     │ • audit            │ • rollback test     │
```

---

## 7. Pre-Build Validation

Run the automated pre-build script before **every** build:

```powershell
# Automated gate (runs all checks sequentially, fails fast)
.\deployment\scripts\prebuild.ps1
```

### Manual Steps (if not using script)

```bash
# 1. TypeScript compilation
cd rtx5-app && npx tsc --noEmit

# 2. Linting
cd rtx5-app && npx eslint . --ext .ts,.tsx

# 3. Test suite
cd rtx5-app && npx jest --passWithNoTests --ci

# 4. Security audit
cd rtx5-app && npm audit --audit-level=high

# 5. Dependency freshness
cd rtx5-app && npm outdated

# 6. Clear Metro cache
cd rtx5-app && npx expo start --clear
```

---

## 8. Platform Configuration

### 8.1 iOS

| Setting | Value | Notes |
|---|---|---|
| `supportsTablet` | `true` | Universal binary |
| `NSAllowsArbitraryLoads` | `true` (dev) / `false` (prod) | Must restrict for App Store |
| `scheme` | `rtx5` | Deep linking |
| `userInterfaceStyle` | `dark` | Default dark mode |
| Beta distribution | TestFlight | staging/preview profiles |
| Production | App Store Connect | via `eas submit` |

### 8.2 Android

| Setting | Value | Notes |
|---|---|---|
| `edgeToEdgeEnabled` | `true` | Modern Android UI |
| `usesCleartextTraffic` | `true` (dev) / `false` (prod) | Must restrict for Play Store |
| `predictiveBackGestureEnabled` | `false` | Avoid navigation conflicts |
| Adaptive icon | Configured | `adaptive-icon.png` |
| Beta distribution | Internal testing track | staging/preview profiles |
| Production | Play Console | staged rollout recommended |

### 8.3 Production Hardening Checklist

| # | Action | Status |
|---|---|---|
| 1 | Set `NSAllowsArbitraryLoads: false` for iOS production | ⬜ |
| 2 | Set `usesCleartextTraffic: false` for Android production | ⬜ |
| 3 | Enable certificate pinning on production API endpoints | ⬜ |
| 4 | Remove all `console.log` statements or gate behind `__DEV__` | ⬜ |
| 5 | Verify no PII in crash reports or analytics | ⬜ |
| 6 | Validate biometric lock engages after inactivity | ⬜ |
| 7 | Test token refresh cycle under production-like conditions | ⬜ |

---

## 9. Store Submission

### 9.1 Submit to App Store / Play Store

```bash
# Submit latest production build to stores
cd rtx5-app && eas submit --platform ios
cd rtx5-app && eas submit --platform android

# Submit both platforms
cd rtx5-app && eas submit --platform all
```

### 9.2 Submission Checklist

| # | Item | Platform |
|---|---|---|
| 1 | App icon and splash screen finalized | Both |
| 2 | Privacy policy URL provided | Both |
| 3 | App description and screenshots uploaded | Both |
| 4 | Age rating questionnaire completed | Both |
| 5 | Export compliance declaration | iOS |
| 6 | Content rating questionnaire | Android |
| 7 | Data safety section completed | Android |
| 8 | App review notes (demo credentials if needed) | iOS |

---

## 10. Monitoring & Observability

### 10.1 Post-Deploy Verification

Execute within **30 minutes** of every production release:

| # | Check | Target | Tool |
|---|---|---|---|
| 1 | Crash-free rate | ≥ 99.5% | Sentry / EAS Insights |
| 2 | WebSocket connectivity | All 3 feeds online | App logs |
| 3 | OTA channel targeting | Correct version mapped | EAS Dashboard |
| 4 | Quotes live feed | Ticking within 5s | Manual spot-check |
| 5 | Chart data loading | History + live merge | Manual spot-check |
| 6 | Trade execution flow | Open → Modify → Close | Manual spot-check |
| 7 | Login/session restore | Token refresh cycle | Manual spot-check |
| 8 | API response times | p95 < 500ms | Server logs |

### 10.2 Health Indicators

| Indicator | Green | Yellow | Red |
|---|---|---|---|
| Crash-free rate | ≥ 99.5% | 98–99.5% | < 98% |
| API p95 latency | < 500ms | 500ms–2s | > 2s |
| WS reconnect rate | < 5/hr | 5–20/hr | > 20/hr |
| OTA adoption | > 80% in 24h | 50–80% in 24h | < 50% in 24h |

---

## 11. CI/CD Pipeline Design

### 11.1 Recommended Architecture

```
┌──────────┐    ┌────────────────────────────────────────────────┐
│  GitHub   │    │               GitHub Actions                   │
│  Push     │───▶│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────────┐ │
│  to main  │    │  │ tsc  │→│ lint │→│ test │→│  npm audit   │ │
└──────────┘    │  └──────┘ └──────┘ └──────┘ └──────┬───────┘ │
                │                                      │         │
                │                              ┌───────▼───────┐ │
                │                              │   EAS Build   │ │
                │                              │   (preview)   │ │
                │                              └───────┬───────┘ │
                │                                      │         │
                │                              ┌───────▼───────┐ │
                │                              │  Smoke Tests  │ │
                │                              │  (automated)  │ │
                │                              └───────┬───────┘ │
                │                                      │         │
                │                              ┌───────▼───────┐ │
                │                              │Manual Approve │ │
                │                              │→ staging/prod │ │
                │                              └───────────────┘ │
                └────────────────────────────────────────────────┘
```

### 11.2 GitHub Actions Integration

```yaml
# .github/workflows/build.yml (reference)
name: RTX5 Build Pipeline
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd rtx5-app && npm ci
      - run: cd rtx5-app && npx tsc --noEmit
      - run: cd rtx5-app && npx jest --passWithNoTests --ci
      - run: cd rtx5-app && npm audit --audit-level=high

  build-preview:
    needs: validate
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: expo/expo-github-action@v8
        with: { eas-version: latest, token: '${{ secrets.EXPO_TOKEN }}' }
      - run: cd rtx5-app && npm ci
      - run: cd rtx5-app && eas build -p all --profile preview --non-interactive
```

---

## 12. Command Reference

### Build Operations

| Action | Command |
|---|---|
| Build preview (all platforms) | `cd rtx5-app && eas build -p all --profile preview --non-interactive` |
| Build staging (all platforms) | `cd rtx5-app && eas build -p all --profile staging --non-interactive` |
| Build production (all platforms) | `cd rtx5-app && eas build -p all --profile production --non-interactive` |
| Build Android only | `cd rtx5-app && eas build -p android --profile <profile> --non-interactive` |
| Build iOS only | `cd rtx5-app && eas build -p ios --profile <profile> --non-interactive` |
| List recent builds | `cd rtx5-app && eas build:list` |

### OTA Operations

| Action | Command |
|---|---|
| Publish to preview | `cd rtx5-app && eas update --channel preview --message "<msg>"` |
| Publish to staging | `cd rtx5-app && eas update --channel staging --message "<msg>"` |
| Publish to production | `cd rtx5-app && eas update --channel production --message "<msg>"` |
| List update history | `cd rtx5-app && eas update:list` |
| Rollback (republish stable) | `cd rtx5-app && eas update --channel <ch> --message "rollback: <reason>"` |

### Store Submission

| Action | Command |
|---|---|
| Submit iOS to App Store | `cd rtx5-app && eas submit -p ios` |
| Submit Android to Play Store | `cd rtx5-app && eas submit -p android` |
| Submit both platforms | `cd rtx5-app && eas submit -p all` |

### Validation

| Action | Command |
|---|---|
| TypeScript check | `cd rtx5-app && npx tsc --noEmit` |
| Lint | `cd rtx5-app && npx eslint . --ext .ts,.tsx` |
| Tests | `cd rtx5-app && npx jest --passWithNoTests --ci` |
| Security audit | `cd rtx5-app && npm audit --audit-level=high` |
| Dependency check | `cd rtx5-app && npm outdated` |
| Clear Metro cache | `cd rtx5-app && npx expo start --clear` |
| Dev server | `cd rtx5-app && npm start` |

### EAS Account

| Action | Command |
|---|---|
| Login | `eas login` |
| Whoami | `eas whoami` |
| Project info | `eas project:info` |
| Create secret | `eas secret:create --name <KEY> --value <VAL> --scope project` |
| List secrets | `eas secret:list` |

---

## Related Documents

| Document | Path |
|---|---|
| OTA Release Guide | [`docs/guide/OTA_RELEASE.md`](../docs/guide/OTA_RELEASE.md) |
| Security Guide | [`docs/guide/SECURITY.md`](../docs/guide/SECURITY.md) |
| Test Strategy | [`docs/guide/TEST_STRATEGY.md`](../docs/guide/TEST_STRATEGY.md) |
| Architecture | [`docs/guide/ARCHITECTURE.md`](../docs/guide/ARCHITECTURE.md) |
| Phase 08 — Beta Release | [`docs/guide/PHASE_08_BETA_RELEASE.md`](../docs/guide/PHASE_08_BETA_RELEASE.md) |
| API Contracts | [`docs/guide/API_CONTRACTS.md`](../docs/guide/API_CONTRACTS.md) |
| Release Checklist | [`deployment/RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md) |
| Incident Response | [`deployment/INCIDENT_RESPONSE.md`](./INCIDENT_RESPONSE.md) |
