---
description: AI code review of all recently changed files — structured review with severity ratings from the QA agent
---

// turbo-all

# /review Workflow — Code Review Pipeline

Use this workflow to get a structured AI code review of any recent changes, staged files, or specific files you point it at.

## Steps

1. **Orchestrator: Identify files to review**
   - If specific files mentioned → review those
   - Otherwise → from the repository root, get recently changed files:
     `git diff --name-only HEAD~1`

2. **QA Agent: Deep code review**
   For each file, check:
   - **Type safety**: no `any`, all props typed, return types explicit
   - **Error handling**: all async code has try/catch, UI shows error states
   - **Performance**: no unnecessary re-renders, memoization where needed
   - **Security**: no hardcoded secrets, no exposed credentials
   - **Design system compliance**: theme tokens used, not raw hex/px values
   - **Accessibility**: TouchableOpacity has `accessibilityLabel`, images have `accessibilityRole`
   - **RTX5 rules**: no hardcoded user data, persistence rules followed (per AGENTS.md)

3. **QA Agent: Run automated checks**
   - PowerShell: `Push-Location .\rtx5-app; npx.cmd tsc --noEmit; Pop-Location`
   - PowerShell:
     `Push-Location .\rtx5-app; npx.cmd eslint [files] --ext .ts,.tsx; Pop-Location`

4. **QA Agent: Produce structured review report**
   Format:
   ```
   ## Code Review Report
   **Files reviewed:** N
   **Overall:** ✅ Approved | ⚠️ Approved with warnings | ❌ Changes requested

   ### [filename]
   - 🔴 CRITICAL: [issue] (line X)
   - 🟡 WARNING: [issue] (line X)
   - 🟢 SUGGESTION: [improvement]
   ```

5. **Orchestrator: Auto-fix where possible**
   - Apply all Prettier formatting fixes
   - Apply ESLint auto-fixable issues
   - Report what was auto-fixed vs what needs manual attention

## Example Usage
```
/review
```
Reviews last commit's changed files.

```
/review rtx5-app/app/settings/brokers.tsx
```
Reviews a specific file.
