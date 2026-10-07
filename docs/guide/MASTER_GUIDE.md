# RTX5 Master Guide

## Goal
Deliver RTX5 as a frontend-only trading app clone (near pixel parity to reference screenshots) for iOS and Android phones/tablets, with strong OTA, testing, and security controls.

## Scope Boundary
- In scope: Mobile frontend architecture, screens, state, UI parity, OTA, testing, observability, security hardening.
- Out of scope: Backend service implementation, broker engine implementation, backend infrastructure changes.

## Locked Non-Negotiables
- Do not rebuild backend.
- Use Expo Dev Client + React Native + TypeScript strict mode.
- Use TanStack Query for server state and Zustand for UI/session state.
- Use RHF + Zod for forms.
- Use custom Skia chart engine with no third-party chart logo visible.
- Use EAS Update channels: preview -> staging -> production.

## Roadmap and Ownership
| Phase | Objective | Primary Owner | Dependencies | Definition of Done |
|---|---|---|---|---|
| 00 | Foundation and tooling baseline | Mobile Platform | None | Project boots, CI runs, lint/type/test baseline green |
| 01 | Design system and navigation shell | Frontend UI | Phase 00 | Dark theme tokens, tab shell, phone/tablet base layouts complete |
| 02 | Quotes parity | Market Data UI | Phase 01 + contracts | Quotes list/table/search/edit/details parity complete |
| 03 | Chart engine parity | Chart Team | Phase 01 + market data stream | Candles, timeframe, objects, indicators menu, settings/actions parity |
| 04 | Trade and order ticket parity | Trading UI | Phases 02-03 + order APIs | Positions, actions, bulk ops, ticket variants, one-click consent complete |
| 05 | History parity | Trading UI | Phase 04 + history APIs | Positions/orders/deals tabs, sort/filter/report entry parity |
| 06 | Settings/news/account parity | App Shell | Phase 01 + account/news APIs | Settings, mailbox, news, brokers, account screens parity |
| 07 | Hardening | Platform + Security | Phases 00-06 | Security controls, observability, feature flags, perf budgets validated |
| 08 | Beta release | Release Manager | Phases 00-07 | Staged OTA and beta rollout gates passed |

## Milestone Timeline (target)
- Weeks 1-2: Phases 00-01
- Weeks 3-4: Phase 02
- Weeks 5-7: Phase 03
- Weeks 8-9: Phase 04
- Week 10: Phase 05
- Week 11: Phase 06
- Week 12: Phase 07
- Weeks 13-14: Phase 08

## Dependencies
- Stable OpenAPI spec and WebSocket event schema from backend team.
- Test environment credentials and feature-flag endpoints.
- Distribution accounts for TestFlight and Google Play internal testing.

## Risk Register
| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| Skia chart complexity delays parity | High | Medium | Build chart in vertical slices; lock MVP subset early; maintain strict backlog for non-critical indicators |
| API contract drift | High | Medium | Generate typed clients from versioned OpenAPI; contract tests in CI |
| OTA runtime mismatch | High | Low | Runtime version pinning and staged channel promotion checklist |
| Security non-compliance | High | Medium | Enforce security checklist gates in Phase 07 before public beta |
| Tablet UX fragmentation | Medium | Medium | Shared responsive primitives and mandatory tablet acceptance tests per phase |
| Performance drops under high tick rates | High | Medium | FPS and memory budgets in CI smoke/perf checks; optimize list virtualization |

## Governance
- Any decision that changes locked stack or non-negotiables must update this file and `AGENTS.md` in the same PR.
- Every feature PR must reference one phase file and one acceptance checklist item.
- No phase closes without updated test evidence in `TEST_STRATEGY.md` criteria.

## Definition of Overall Completion
- All phase exit criteria met.
- Screenshot parity map has no unresolved rows.
- Release gates in OTA and security documents are satisfied.

