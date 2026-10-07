---
description: Build a full feature end-to-end — UI, API, state, and QA — with all agents running in parallel
---

// turbo-all

# /feature Workflow — Full Feature Pipeline

Use this workflow when the user describes a new feature. The orchestrator decomposes it and dispatches all relevant agents simultaneously.

## Steps

1. **Orchestrator: Analyze the feature request**
   - Read the user's feature description
   - Identify all impacted domains: UI, backend, state, tests
   - Decompose into per-agent sub-tasks
   - Assign scope (files to touch) to each agent

2. **Parallel Dispatch (run all at once)**
   - Launch `ui_agent` with UI sub-task
   - Launch `backend_agent` with API sub-task
   - Launch `db_agent` with state/type sub-task

3. **Wait: Collect impl agent results via MISSION_CONTROL**
   - Receive and validate all agent result messages
   - Check for inter-agent conflicts or dependencies
   - Resolve file ownership conflicts per MISSION_CONTROL routing rules

4. **QA Agent: Review all changed files**
   - Run TypeScript check: `cd rtx5-app && npx tsc --noEmit`
   - Run ESLint auto-fix: `cd rtx5-app && npx eslint . --ext .ts,.tsx --fix`
   - Run Prettier: `cd rtx5-app && npx prettier --write .`
   - Write tests for new components/services

5. **DevOps Agent: Validate build**
   - Clear cache and validate bundle: `cd rtx5-app && npx expo export --dev`
   - Check for Metro bundler errors or warnings
   - Report bundle size

6. **Orchestrator: Aggregate and report**
   - Merge all agent reports from MISSION_CONTROL
   - Format final report using the Report Format from ORCHESTRATOR.md
   - Surface any `next_steps` from any agent

## Example Usage
```
/feature add a dark mode toggle to the broker settings screen with persistence
```
Orchestrator dispatches:
- `ui_agent` → add toggle UI to `app/settings/brokers.tsx`
- `backend_agent` → add `PATCH /api/settings/display` endpoint
- `db_agent` → add `displayPreferences` slice to Zustand store
- `qa_agent` → review all three, write toggle test
- `devops_agent` → validate build
