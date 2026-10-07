# Phase 00 - Foundation

## Objective
Establish the RTX5 frontend baseline so the app can build, run, and enforce quality gates from day one.

## In Scope
- Expo Dev Client setup (SDK 54 target).
- TypeScript strict mode.
- ESLint, Prettier, and commit hooks.
- CI pipeline for lint, typecheck, unit tests.
- Environment config strategy for dev/staging/prod.

## Out of Scope
- Feature screens.
- Backend implementation.
- Visual parity work.

## Exact Implementation Tasks
1. Initialize React Native project with Expo Dev Client.
2. Configure folder structure from `ARCHITECTURE.md`.
3. Add strict TypeScript and shared tsconfig.
4. Add lint/format scripts and CI checks.
5. Set up TanStack Query provider and Zustand base store.
6. Add Sentry/Crashlytics placeholders (disabled by default).
7. Add secure env loading and runtime channel configs.
8. Add baseline navigation shell with empty tabs.

## API Dependencies
- None mandatory for completion.
- Optional: health-check endpoint for environment smoke test.

## Acceptance Checklist
- [ ] App runs on iOS simulator and Android emulator.
- [ ] CI blocks merge on lint/type/test failures.
- [ ] Environment switching works without code edits.
- [ ] Base tab shell shows 5 tabs.

## Test Checklist
- [ ] Unit: app providers mount.
- [ ] Integration: navigation shell renders all tabs.
- [ ] Manual: launch in dev client on iOS and Android.

## Exit Criteria
- Stable baseline merged to mainline.
- Team can start feature phases without tooling blockers.

## Progress Notes
- 2026-04-21: Tightened the bottom-tab lifecycle so screens mount lazily on first visit, detach when hidden, and the heavy live-data tabs (`Quotes`, `Chart`, `Trade`) stop rendering their screen content while unfocused. This prevents hidden quote listeners, timers, and chart WebView work from accumulating in the background and stalling later tab navigation.

