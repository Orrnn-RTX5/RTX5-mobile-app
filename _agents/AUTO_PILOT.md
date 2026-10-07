---
name: AutoPilot
description: Zero-permission autonomous operation rules for the entire agent team. Defines exactly which actions are pre-approved for auto-execution and which rare cases require human escalation. Enables the system to run fully autonomously like a real engineering team.
---

# ✈️ AUTO PILOT — Zero-Permission Autonomous Operation

## Philosophy
> _"Move fast. Ask nothing. Build everything. Only stop for the irreversible."_

The RTX5 multi-agent system is designed to operate like a senior engineering team with full autonomy. Agents do not ask for permission. They make decisions, execute, and report results. The user reviews outcomes, not approvals.

---

## ✅ Pre-Approved Actions (Auto-Run, No Prompt)

These actions are **always allowed** without asking:

### File System
- Create new files and directories
- Edit existing source code files (`.tsx`, `.ts`, `.js`, `.json`, `.css`, etc.)
- Delete **generated** files (`.js` in `dist/`, `.expo/`, `__pycache__/`)
- Rename files within the project
- Move files between directories

### Package Management
- `npm install [package]` — adding new prod/dev dependencies
- `npm uninstall [package]` — removing unused packages
- `npx [tool]` — running npx tools
- `pod install` — iOS CocoaPods updates

### Development
- Start / stop / restart dev servers
- Run linters and auto-fix (`eslint --fix`, `prettier --write`)
- Run test suites (`jest`, `detox`)
- Generate types (`tsc --noEmit`)
- Create/update environment variables in `.env.local` (non-secret)

### Build & Expo
- `expo start`, `expo start --clear`
- `eas build --platform android --profile preview`
- `eas build --platform ios --profile preview`
- `expo export`
- Bundle analysis and optimization

### Git
- `git add`, `git commit` (with descriptive messages)
- `git checkout -b [feature-branch]`
- `git push origin [feature-branch]`

### Code Generation
- Creating new React Native screens and components
- Adding Redux/Zustand slices and selectors
- Generating API service files
- Creating type definitions and interfaces
- Writing test files

---

## 🚨 Escalation Required (Only These Cases)

These actions **must pause and notify the user**:

| Action | Why |
|--------|-----|
| Delete non-generated user data or production database records | Irreversible |
| `git push --force` to `main` or `production` branch | Irreversible history rewrite |
| Rotate or change API keys / secrets in production `.env` | Security risk |
| Submit to App Store / Play Store | Requires human 2FA |
| Charge a payment gateway or modify billing logic | Financial risk |
| Access credentials not in the project repo | Security boundary |

---

## ⚙️ Workflow Turbo Mode

All workflow files in `_agents/workflows/` carry the `// turbo-all` annotation. This means:

> Every `run_command` step in every workflow executes **automatically** with `SafeToAutoRun: true`.

No command dialog. No confirmation. Just execution.

---

## 🔄 Decision Framework

When an agent encounters an ambiguous situation:

```
Is the action REVERSIBLE?
  YES → Execute autonomously, note in report
  NO  → Is it in the escalation list above?
    YES → Escalate to Orchestrator → Notify user
    NO  → Apply the "senior engineer judgment" rule:
          Would a senior engineer do this without asking? YES → Execute.
```

---

## 📊 Reporting Standard

Even though agents don't ask permission, they **always report everything** they did. The final Orchestrator report includes every file touched, every command run, and every decision made — with reasoning. Full transparency, zero gatekeeping.

---

## Agent Autonomy Levels

| Agent | Autonomy Level | Notes |
|-------|---------------|-------|
| `orchestrator` | 🟢 Full | Plans and dispatches everything |
| `ui_agent` | 🟢 Full | Owns all UI files |
| `backend_agent` | 🟢 Full | Owns all server files |
| `db_agent` | 🟢 Full | Owns state and schema |
| `qa_agent` | 🟢 Full | Can auto-fix lint/test issues |
| `devops_agent` | 🟡 High | Escalates only for prod deploys & secrets |
