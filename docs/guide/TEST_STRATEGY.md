# RTX5 Test Strategy

## Test Pyramid
1. Unit tests for utilities, mappers, validation logic.
2. Integration tests for feature hooks, navigation, and state interactions.
3. E2E tests with Detox (core regressions) and Maestro (fast cross-platform smoke).
4. Manual exploratory checks for release-critical trading scenarios.

## Test Matrix
| Layer | Tooling | Focus | Blocking |
|---|---|---|---|
| Unit | Jest | Contracts, mappers, formatters, validators | Yes |
| Integration | React Native Testing Library | Screen composition and state flows | Yes |
| E2E Core | Detox | Deterministic end-to-end critical journeys | Yes |
| E2E Smoke | Maestro | Fast scenario checks across device matrix | Yes |
| Manual | QA checklist | Visual parity and edge-case exploration | Yes for beta promotion |

## Critical Regression Suite
- Auth/session restore and lock/unlock.
- Quotes live updates, search, edit mode, swipe and context actions.
- Chart timeframe switch, objects manager, settings action sheet.
- Trade positions, one-click consent, order ticket for market and pending types.
- History filters, sorting, and totals.
- Settings navigation to visible settings destinations such as accounts, brokers, economic calendar, journal, support, help, and about.
- OTA update apply and rollback validation.

## Release Blocking Thresholds
- Unit/integration pass rate: 100% on protected branch.
- Detox core suite: 100% pass on release candidate.
- Maestro smoke suite: 100% pass on supported beta device matrix.
- Crash-free sessions in staging soak: >= 99.5%.
- No open P0/P1 defects at promotion decision.

## Test Data and Environment Rules
- Use synthetic/non-production credentials for automated suites.
- Use deterministic fixtures for quote and candle replay tests.
- Keep a stable staging backend snapshot for release candidate tests.

## Reporting
- CI posts test summary artifacts per commit.
- Release candidate requires attached test evidence links in PR description.

