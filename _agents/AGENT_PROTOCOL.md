---
name: AgentProtocol
description: Standard inter-agent communication protocol. Defines the exact message format for task dispatch, result reporting, error escalation, and agent-to-agent requests. All agents must conform to this protocol.
---

# 📋 AGENT PROTOCOL — Inter-Agent Communication Standard

## Overview
This document defines the **standard message format** used by every agent in the RTX5 multi-agent system. All agents — Orchestrator, sub-agents, and MISSION CONTROL — must use these formats for all communication.

---

## 1. Task Dispatch Message (Orchestrator → Agent)

```json
{
  "dispatch_id": "uuid-v4",
  "from": "orchestrator",
  "to": "ui_agent",
  "priority": "high|normal|low",
  "task": {
    "title": "Short task title",
    "description": "Detailed description of exactly what to do",
    "scope": ["rtx5-app/app/settings/brokers.tsx"],
    "constraints": [
      "Do not modify shared types",
      "Follow DESIGN_SYSTEM.md"
    ],
    "context": {
      "related_files": ["rtx5-app/src/theme/colors.ts"],
      "user_intent": "Original user request verbatim"
    }
  },
  "auto_pilot": true
}
```

> `auto_pilot: true` means the agent executes without ANY permission prompts.

---

## 2. Agent Result Message (Agent → MISSION_CONTROL)

```json
{
  "dispatch_id": "uuid-v4",
  "from": "ui_agent",
  "to": "mission_control",
  "status": "success",
  "files_changed": [
    "rtx5-app/app/settings/brokers.tsx",
    "rtx5-app/src/components/BrokerCard.tsx"
  ],
  "summary": "Added dark mode toggle to broker settings screen, created BrokerCard component",
  "issues": [],
  "next_steps": ["backend_agent needs to persist toggle state to AsyncStorage"]
}
```

---

## 3. Agent-to-Agent Request (Agent → Agent, via MISSION_CONTROL)

When one agent needs to communicate with another (e.g., UI agent needs a new API endpoint):

```json
{
  "type": "inter_agent_request",
  "from": "ui_agent",
  "to": "backend_agent",
  "request": "Need endpoint GET /api/brokers/toggle to persist dark mode preference",
  "blocking": false
}
```

> Set `"blocking": false` whenever possible to maintain parallelism.

---

## 4. Error Escalation Message (Agent → Orchestrator)

Only used for issues that cannot be auto-resolved:

```json
{
  "type": "escalation",
  "from": "devops_agent",
  "to": "orchestrator",
  "severity": "critical|warning|info",
  "reason": "EAS build requires new Apple certificate — cannot auto-generate",
  "action_required": "User must upload certificate to EAS dashboard",
  "resume_on": "Certificate uploaded"
}
```

**Escalation triggers** (the ONLY things that break zero-permission operation):
- Irreversible deletion of production data
- External secret / API key rotation
- App Store / Play Store submission requiring human 2FA
- Payment gateway credential changes

---

## 5. Agent Health Ping (MISSION_CONTROL → Agent)

```json
{
  "type": "health_ping",
  "from": "mission_control",
  "to": "backend_agent",
  "dispatch_id": "uuid-v4"
}
```

Agent must respond within 30 seconds or MISSION_CONTROL marks it as timed out.

---

## Agent IDs

| Agent ID | Full Name | Domain |
|----------|-----------|--------|
| `orchestrator` | Orchestrator | Planning & coordination |
| `mission_control` | Mission Control | Routing & aggregation |
| `ui_agent` | UI Agent | React Native / Expo UI |
| `backend_agent` | Backend Agent | Node.js / FIX API |
| `db_agent` | DB Agent | State / Data / Schema |
| `qa_agent` | QA Agent | Testing & review |
| `devops_agent` | DevOps Agent | Build & deploy |
