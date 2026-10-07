---
description: Zero-touch parallel build — all agents validate their domains simultaneously, then DevOps builds. Maximum speed, no prompts.
---

// turbo-all

# /turbo-build Workflow — Parallel Zero-Touch Build

The fastest path from current code to a validated build artifact. All agents validate simultaneously, then DevOps builds. No stops, no prompts.

## Steps

1. **PARALLEL — Launch all validation agents simultaneously**

   **UI Agent validates:**
   - Scan `app/` and `src/components/` for missing TypeScript types
   - Check all screens have error + loading states
   - Verify design system token usage (no raw colors)

   **Backend Agent validates:**
   - Check all routes have error handling
   - Verify FIX session config is correct
   - Confirm WebSocket heartbeat is configured

   **DB Agent validates:**
   - Check Zustand stores for type completeness
   - Verify AsyncStorage keys follow `@rtx5:` convention
   - Confirm no `any` types in shared interfaces

   **QA Agent runs automated suite:**
   - `cd rtx5-app && npx tsc --noEmit`
   - `cd rtx5-app && npx jest --passWithNoTests --ci`
   - `cd rtx5-app && npx eslint . --ext .ts,.tsx --fix`
   - `cd rtx5-app && npx prettier --write .`

2. **MISSION_CONTROL: Collect all parallel results**
   - Aggregate all agent reports
   - If any CRITICAL issues → flag and stop
   - If only warnings → continue

3. **DevOps Agent: Build**
   - Clear cache: `cd rtx5-app && npx expo start --clear` (then Ctrl+C after cache clear)
   - Android APK: `cd rtx5-app && eas build --platform android --profile preview --non-interactive`
   - Watch build logs for errors

4. **Orchestrator: Turbo Build Report**
   ```
   ## ⚡ Turbo Build Report
   **Status:** ✅ | ⚠️ | ❌
   **Duration:** [time]
   **Build ID:** [EAS ID]
   **Build URL:** [EAS URL]

   | Agent | Status | Issues |
   |-------|--------|--------|
   | ui_agent | ✅ | 0 |
   | backend_agent | ✅ | 0 |
   | db_agent | ✅ | 0 |
   | qa_agent | ⚠️ | 2 warnings |
   | devops_agent | ✅ | Build success |

   ### Auto-Fixed
   - Formatted 7 files with Prettier
   - Fixed 3 ESLint auto-fixable issues

   ### Warnings (non-blocking)
   - ...
   ```

## Example Usage
```
/turbo-build
```
Triggers immediately — all agents run in parallel, no prompts.
