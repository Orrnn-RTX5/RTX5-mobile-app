---
description: Diagnose and fix a bug — identify root cause, dispatch the right agent, verify fix, and report
---

// turbo-all

# /bugfix Workflow — Bug Fix Pipeline

Use this workflow when the user reports a bug, crash, or unexpected behavior. The QA Agent triages first, then the owning agent fixes.

## Steps

1. **QA Agent: Triage and root cause analysis**
   - Read the bug description
   - Identify the impacted files and domain
   - Produce a triage report:
     - Root cause (hypothesis)
     - Files likely involved
     - Owning agent(s)
     - Reproduction steps

2. **Orchestrator: Route to owning agent**
   - Based on QA triage, dispatch fix sub-task to owning agent
   - If multiple domains affected, dispatch in parallel

3. **Owning Agent: Implement fix**
   - Read the QA triage report carefully
   - Make the minimal targeted change to fix the root cause
   - Do NOT refactor unrelated code in the same commit
   - Add a code comment explaining why the fix is necessary

4. **QA Agent: Verify fix**
   - Confirm the fix addresses the root cause
   - Run TypeScript check: `cd rtx5-app && npx tsc --noEmit`
   - Run tests: `cd rtx5-app && npx jest --passWithNoTests`
   - Run lint: `cd rtx5-app && npx eslint . --ext .ts,.tsx --fix`
   - Confirm no regressions in related areas

5. **DevOps Agent: Validate bundle is clean**
   - `cd rtx5-app && npx expo export --dev`
   - Confirm no new Metro errors

6. **Orchestrator: Report**
   - Root cause: what was wrong
   - Fix applied: what was changed and why
   - Verification: test results
   - Files changed: list

## Example Usage
```
/bugfix the broker connection status badge shows "connected" even when disconnected
```
Triage → `ui_agent` owns the badge component → fix conditional logic → QA re-verify
