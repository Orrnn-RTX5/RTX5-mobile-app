# RTX5 Release Checklist

> Complete this checklist before promoting any build to production.  
> Each section must be signed off by the designated owner.

---

## Release Information

| Field | Value |
|---|---|
| **Version** | v___.___.___ |
| **Build Number** | |
| **EAS Build ID** | |
| **Release Date** | |
| **Release Manager** | |
| **Branch/Commit** | |

---

## 1. Code Quality Gate

| # | Check | Status | Signed By |
|---|---|---|---|
| 1.1 | TypeScript `tsc --noEmit` passes with zero errors | ⬜ | |
| 1.2 | ESLint passes with zero errors | ⬜ | |
| 1.3 | No `console.log` in production paths (gated behind `__DEV__`) | ⬜ | |
| 1.4 | No `as any` type bypasses in critical flows (auth, trade, positions) | ⬜ | |
| 1.5 | No hardcoded URLs or API keys in source code | ⬜ | |
| 1.6 | All imports resolve (no dead/missing modules) | ⬜ | |

---

## 2. Testing Gate

| # | Check | Status | Signed By |
|---|---|---|---|
| 2.1 | Unit test suite passes (100%) | ⬜ | |
| 2.2 | Integration test suite passes (100%) | ⬜ | |
| 2.3 | E2E core regression suite passes (Detox) | ⬜ | |
| 2.4 | E2E smoke suite passes (Maestro) | ⬜ | |
| 2.5 | Manual QA sign-off on critical trading flows | ⬜ | |
| 2.6 | Screen parity verified against reference screenshots | ⬜ | |

---

## 3. Security Gate

| # | Check | Status | Signed By |
|---|---|---|---|
| 3.1 | `npm audit --audit-level=high` returns zero vulnerabilities | ⬜ | |
| 3.2 | Tokens stored exclusively in secure storage (keychain/keystore) | ⬜ | |
| 3.3 | Biometric lock engages after configured idle interval | ⬜ | |
| 3.4 | Certificate pinning active for production API hosts | ⬜ | |
| 3.5 | Device integrity checks operational (root/jailbreak detection) | ⬜ | |
| 3.6 | Session refresh cycle validated (token rotation) | ⬜ | |
| 3.7 | No PII in logs, crash reports, or analytics payloads | ⬜ | |
| 3.8 | `NSAllowsArbitraryLoads: false` for iOS production | ⬜ | |
| 3.9 | `usesCleartextTraffic: false` for Android production | ⬜ | |

---

## 4. Performance Gate

| # | Check | Status | Signed By |
|---|---|---|---|
| 4.1 | App cold start < 3 seconds on target devices | ⬜ | |
| 4.2 | Quotes feed ticking within 5 seconds of app launch | ⬜ | |
| 4.3 | Chart loads history + live merge in < 2 seconds | ⬜ | |
| 4.4 | No visible frame drops during chart scrolling | ⬜ | |
| 4.5 | Memory footprint within acceptable range (< 200MB idle) | ⬜ | |
| 4.6 | Bundle size is within expected range | ⬜ | |

---

## 5. OTA & Deployment Gate

| # | Check | Status | Signed By |
|---|---|---|---|
| 5.1 | `runtimeVersion` in `app.json` matches build expectations | ⬜ | |
| 5.2 | OTA channel targeting verified in EAS Dashboard | ⬜ | |
| 5.3 | Rollback procedure tested at least once in staging | ⬜ | |
| 5.4 | Staging soak period completed (minimum 48 hours) | ⬜ | |
| 5.5 | Crash-free sessions ≥ 99.5% during soak period | ⬜ | |

---

## 6. Release Artifacts

| # | Artifact | Location | Status |
|---|---|---|---|
| 6.1 | Signed iOS binary (.ipa) | EAS Dashboard | ⬜ |
| 6.2 | Signed Android binary (.aab) | EAS Dashboard | ⬜ |
| 6.3 | Release notes | [link] | ⬜ |
| 6.4 | Test evidence (CI artifacts) | [link] | ⬜ |
| 6.5 | Changelog | [link] | ⬜ |

---

## 7. Final Approval

| Role | Name | Approved | Date |
|---|---|---|---|
| Engineering Lead | | ⬜ | |
| QA Lead | | ⬜ | |
| Security | | ⬜ | |
| Product Owner | | ⬜ | |

---

## Post-Release

- [ ] Monitor crash-free rate for 4 hours post-release
- [ ] Verify OTA adoption rate > 80% within 24 hours
- [ ] Spot-check critical trading flows on production
- [ ] Close out release tracking ticket
- [ ] Archive test evidence and release notes
