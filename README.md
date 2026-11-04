# RTX5-flow — RTX-5 Mobile Application (`rtx5-app`)

**RTX-5** is an institutional-grade, cross-platform mobile financial trading terminal built with **React Native 0.81.5**, **Expo SDK 54**, and **strict TypeScript 5.9.2**. It interfaces with multi-broker trading gateways (`Broker-Backend-V2`, `/api/v2`) and real-time market/trading WebSocket feeds (`/ws/feed` and `/ws/v2`).

---

## 📚 Complete Architecture Documentation (`docs/architecture/`)

A comprehensive, source-code-verified architectural audit of the repository is available in [`docs/architecture/`](docs/architecture/):

1. [**01 — Project Overview & Feature Audit Classification**](docs/architecture/01-project-overview.md) — Executive summary, repository boundary analysis, and feature verification matrix.
2. [**02 — Technology Stack & System Architecture**](docs/architecture/02-system-architecture.md) — Complete dependency inventory, system architecture Mermaid diagram, and transport failure contracts.
3. [**03 — Frontend Architecture & User Interaction Flows**](docs/architecture/03-frontend-architecture.md) — Directory structure, cold-start bootstrap, Retained Route Hosts, Zustand/TanStack state stores, and Buy/Sell/Close/Modify interaction traces.
4. [**04 — Backend Architecture (External Services & Contract Audit)**](docs/architecture/04-backend-architecture.md) — Core Gateway (`:8090`) service topology, request lifecycle diagram, rate limits, and known live backend operational quirks.
5. [**05 — Database Design & Client Persistence Architecture**](docs/architecture/05-database-design.md) — Expo SecureStore & AsyncStorage schemas, domain ER diagram, and Order -> Deal -> Position -> History lifecycle relationships.
6. [**06 — Complete REST API Documentation**](docs/architecture/06-api-documentation.md) — Exhaustive endpoint tables for Discovery, Auth, Market Data, Trading, Pending Orders, and Account History.
7. [**07 — Real-Time Data Flow & WebSocket Architecture**](docs/architecture/07-realtime-data-flow.md) — `/ws/feed` & `/ws/v2` wire protocols, 16ms `requestAnimationFrame` tick batching, silence watchdogs, and sequence diagrams.
8. [**08 — Trading Engine & Order Management Audit**](docs/architecture/08-trading-engine.md) — Frontend vs. Backend authority boundaries, `client_order_id` idempotency, `202 Accepted` command polling, and sequence diagrams.
9. [**09 — External Integrations & Security Audit**](docs/architecture/09-security-audit.md) — External service inventory, severity-ranked security findings (`SEC-01` to `SEC-05`), and verified client security controls.
10. [**10 — Performance, Latency Contracts & Scalability Plan**](docs/architecture/10-performance-and-scalability.md) — Client frame-rate optimizations, 100 / 1,000 / 10,000 concurrent user scaling plan, and SLI/SLO latency metrics.
11. [**11 — Deployment, DevOps & CI/CD Architecture**](docs/architecture/11-deployment-and-devops.md) — EAS Build profiles, GitHub Actions OTA workflow (`.github/workflows/eas-update.yml`), fingerprint safety checks, and local setup.
12. [**12 — Failure Handling, Recovery & Testing Strategy**](docs/architecture/12-testing-and-recovery.md) — 10-scenario failure recovery matrix and audit of the 200+ unit, integration, WebView, and AST source-contract tests.
13. [**13 — Technical Debt & Improvement Roadmap**](docs/architecture/13-technical-debt-and-roadmap.md) — Prioritized technical debt (`TD-01` to `TD-08`) and Phased Roadmap (Phases A–D).
14. [**14 — Developer Onboarding & Learning Guide**](docs/architecture/14-developer-onboarding.md) — Plain-English overview, glossary, top 10 files to study first, and end-to-end trade lifecycle walkthrough.
15. [**15 — System Design & Technical Interview Guide**](docs/architecture/15-system-design-interview-guide.md) — Top 20 system design and engineering interview questions with evidence-based answers from the codebase.

---

## 🚀 Quick Start

```powershell
# 1. Enter the mobile application directory
cd rtx5-app

# 2. Install dependencies (automatically runs postinstall patches & bundles Lightweight Charts)
npm install

# 3. Run strict TypeScript typecheck
npm run typecheck

# 4. Run the full automated test suite
npm test

# 5. Start the Expo development server
npm start
```
