<p align="center">
  <strong>RTX5 — Deployment Operations Center</strong><br/>
  <sub>Build • Ship • Monitor • Rollback</sub>
</p>

---

## Directory Structure

```
deployment/
├── README.md                    ← You are here
├── DEPLOYMENT.md                ← Master deployment runbook
├── RELEASE_CHECKLIST.md         ← Pre-release sign-off document
├── INCIDENT_RESPONSE.md         ← Severity classification & response playbook
├── env/
│   ├── .env.development         ← Local development overrides
│   ├── .env.preview             ← Preview channel (dev/QA)
│   ├── .env.staging             ← Staging channel (internal beta)
│   └── .env.production          ← Production channel (public release)
└── scripts/
    ├── prebuild.ps1             ← Automated pre-build validation gate
    └── promote.ps1              ← Channel promotion with safety checks
```

---

## Quick Reference

### Build Commands

| Environment | Command |
|---|---|
| Preview | `cd rtx5-app && eas build -p all --profile preview --non-interactive` |
| Staging | `cd rtx5-app && eas build -p all --profile staging --non-interactive` |
| Production | `cd rtx5-app && eas build -p all --profile production --non-interactive` |

### OTA Update Commands

| Channel | Command |
|---|---|
| Preview | `cd rtx5-app && eas update --channel preview --message "fix: description"` |
| Staging | `cd rtx5-app && eas update --channel staging --message "rc: description"` |
| Production | `cd rtx5-app && eas update --channel production --message "v1.x.x: description"` |

### Pre-Build Gate

```powershell
.\deployment\scripts\prebuild.ps1
```

### Promote Between Channels

```powershell
.\deployment\scripts\promote.ps1 -From preview -To staging
```

---

## Key Documents

| Document | Purpose |
|---|---|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Full deployment runbook — environments, build pipeline, OTA strategy |
| [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) | Pre-release sign-off with approval gates |
| [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) | Severity classification, rollback procedures, escalation |
| [SECURITY.md](../docs/guide/SECURITY.md) | Security controls and release gates |
| [OTA_RELEASE.md](../docs/guide/OTA_RELEASE.md) | OTA channel strategy and runtime gating |
| [TEST_STRATEGY.md](../docs/guide/TEST_STRATEGY.md) | Test pyramid and blocking thresholds |

---

## Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────────┐
│                        RTX5 Build Pipeline                       │
├──────────┬───────────┬──────────────┬──────────────┬─────────────┤
│  Source  │ Pre-Build │   EAS Build  │  OTA Update  │  App Store  │
│  Code    │   Gate    │  (Binary)    │  (JS Bundle) │  Submission │
├──────────┼───────────┼──────────────┼──────────────┼─────────────┤
│ Feature  │ tsc       │ preview      │ preview ch   │             │
│ Branch   │ eslint    │ staging      │ staging ch   │             │
│ → main   │ jest      │ production   │ production   │ eas submit  │
│          │ npm audit │              │              │             │
└──────────┴───────────┴──────────────┴──────────────┴─────────────┘
```

**Promotion flow**: `preview` → `staging` → `production` with gate checks at each transition.
