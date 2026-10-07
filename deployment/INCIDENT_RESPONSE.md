# RTX5 Incident Response Playbook

> Standard operating procedures for production incidents affecting the RTX5 mobile trading application.

---

## Severity Classification

| Level | Definition | Examples | Response Time | Rollback Decision |
|---|---|---|---|---|
| **Sev-1** | Trade action corruption, login outage, or data loss | Failed order execution, incorrect P&L, auth loop, fund display errors | **15 minutes** | Within **30 minutes** |
| **Sev-2** | Major UX degradation with workaround available | Chart not loading, WebSocket disconnects, position list stale | **1 hour** | Within **2 hours** |
| **Sev-3** | Minor UX defect or cosmetic issue | Alignment bugs, wrong icon, theme glitch | **Next business day** | Next scheduled release |
| **Sev-4** | Enhancement request or low-frequency edge case | Feature polish, rare device-specific layout | **Backlog** | N/A |

---

## Incident Response Flow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Detect     │───▶│   Triage     │───▶│   Mitigate   │───▶│   Resolve    │
│              │    │              │    │              │    │              │
│ • Monitoring │    │ • Classify   │    │ • Feature    │    │ • Root cause │
│ • User report│    │   severity   │    │   flag off   │    │ • Fix & test │
│ • Crash data │    │ • Assign     │    │ • OTA        │    │ • Deploy fix │
│              │    │   owner      │    │   rollback   │    │ • Close      │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                              │
                                    ┌─────────▼─────────┐
                                    │    Post-Mortem     │
                                    │                    │
                                    │ • Timeline         │
                                    │ • Root cause       │
                                    │ • Action items     │
                                    └────────────────────┘
```

---

## Rollback Procedures

### OTA Rollback (JavaScript / Assets)

Use when a bad OTA update causes issues. This is the **fastest** rollback path.

```bash
# 1. Identify the bad update
cd rtx5-app && eas update:list

# 2. Republish the last known stable commit
git checkout <stable-commit>
cd rtx5-app && eas update --channel production --message "rollback: revert <bad-update-id>"

# 3. Verify on device
#    - Force-close and reopen the app
#    - Confirm the stable version is active
#    - Monitor crash dashboard for recovery
```

**Timeline**: Rollback published within **5 minutes**. User adoption within **1–4 hours** (on next app launch).

### Binary Rollback (Native)

Use when the binary itself is broken (native crash, missing native module, wrong SDK).

| Platform | Procedure | Timeline |
|---|---|---|
| **iOS** | Upload hotfix build to App Store Connect. Request expedited review. Consider removing current build if critical. | 24–48 hours (Apple review) |
| **Android** | Upload hotfix build to Play Console. Use staged rollout to limit blast radius. Halt current rollout immediately. | 2–6 hours (Play review) |

### Feature Flag Disable

If the issue is isolated to a specific feature:

1. Toggle the feature flag **off** in the remote configuration
2. Users receive the change on next app foreground
3. No rebuild or OTA required

---

## Escalation Matrix

| Severity | First Responder | Escalation (if unresolved in SLA) | Executive Notification |
|---|---|---|---|
| **Sev-1** | On-call engineer | Engineering Lead → CTO | Immediately |
| **Sev-2** | Assigned developer | Engineering Lead | After 4 hours |
| **Sev-3** | Assigned developer | QA Lead | N/A |
| **Sev-4** | Backlog triage | N/A | N/A |

---

## Communication Templates

### Sev-1 Internal Alert

```
🚨 SEV-1 INCIDENT — RTX5 Mobile
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Impact:     [describe user impact]
Detection:  [how it was detected]  
Start Time: [UTC timestamp]
Status:     INVESTIGATING / MITIGATING / RESOLVED
Owner:      [name]
Channel:    [production / staging]
Build:      [version / build number]

Next update in 15 minutes.
```

### Sev-1 Resolution

```
✅ SEV-1 RESOLVED — RTX5 Mobile
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Impact:     [describe user impact]
Duration:   [start → end, total minutes]
Root Cause: [brief description]
Fix:        [OTA rollback / hotfix / feature flag]
Post-mortem scheduled: [date]
```

---

## Post-Mortem Template

### Incident Summary

| Field | Value |
|---|---|
| **Incident ID** | INC-XXXX |
| **Severity** | Sev-X |
| **Duration** | XX minutes |
| **Impact** | [number of affected users / sessions] |
| **Root Cause** | |
| **Fix Applied** | |

### Timeline

| Time (UTC) | Event |
|---|---|
| HH:MM | Incident detected via [monitoring / user report] |
| HH:MM | On-call engineer paged |
| HH:MM | Root cause identified |
| HH:MM | Mitigation applied (rollback / flag / hotfix) |
| HH:MM | Incident resolved, monitoring confirms recovery |

### Root Cause Analysis

_Describe the technical root cause in detail._

### Contributing Factors

- [ ] Missing test coverage
- [ ] Insufficient staging soak
- [ ] Configuration error
- [ ] Dependency issue
- [ ] Race condition
- [ ] Other: ___

### Action Items

| # | Action | Owner | Due Date | Status |
|---|---|---|---|---|
| 1 | | | | ⬜ |
| 2 | | | | ⬜ |
| 3 | | | | ⬜ |

### Lessons Learned

_What will we change to prevent recurrence?_
