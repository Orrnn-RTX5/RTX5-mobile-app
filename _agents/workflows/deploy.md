---
description: Full deploy pipeline — QA sweep across all domains, then EAS build, then report
---

// turbo-all

# /deploy Workflow — Full Deploy Pipeline

Use this workflow to prepare and trigger a full application build. Runs a complete QA sweep first, then triggers the EAS build.

## Steps

1. **QA Agent: Full codebase sweep**
   - Run TypeScript check on entire codebase: `cd rtx5-app && npx tsc --noEmit`
   - Run ESLint on entire codebase: `cd rtx5-app && npx eslint . --ext .ts,.tsx`
   - Run all tests: `cd rtx5-app && npx jest --passWithNoTests --ci`
   - Report all issues found (block if any CRITICAL severity)

2. **Orchestrator: Gate check**
   - If QA reports any `critical` issues → STOP, report to user, do NOT build
   - If QA reports only warnings → continue with warnings logged

3. **DevOps Agent: Pre-build validation**
   - Check for outdated critical dependencies: `cd rtx5-app && npm outdated`
   - Run security audit: `cd rtx5-app && npm audit --audit-level=high`
   - Validate app.json and eas.json are correct
   - Clear Metro cache

4. **DevOps Agent: EAS Build**
   - Android preview build: `cd rtx5-app && eas build --platform android --profile preview --non-interactive`
   - Log build ID and EAS dashboard URL

5. **DevOps Agent: Post-build**
   - Confirm build succeeded
   - Report bundle size if available
   - Note EAS build URL for user to download

6. **Orchestrator: Deploy Report**
   - QA gate results
   - Build status (success/failed)
   - EAS build ID and URL
   - Any warnings to monitor post-deploy

## Example Usage
```
/deploy
```
Runs full QA → Android preview build → reports build link
