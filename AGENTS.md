<!-- File 6 of 6 -- Install at: <hermes-workspace>/AGENTS.md (shared by the whole swarm) -->

# AGENTS.md -- Standard Agent Swarm

This workspace uses **semantic Hermes swarm workers**, not numbered lanes. The source of truth
for routing is `swarm.yaml`; each worker also has a profile under `~/.hermes/profiles/<id>/`, a
core role skill `<id>-core`, and a wrapper in `~/.local/bin/`.

**Operating rule:** the **Orchestrator** decomposes, routes, and enforces greenlight, and is also
the **Team Manager** that runs the weekly rhythm; the functional agents do the work;
**Intelligence** reports and recommends but does not dispatch. Coordination is the Kanban board --
"done" means a `kanban_complete(summary, proof)` row, not a verbal claim. *If the Orchestrator is
writing copy, buying ads, or drafting a quote, the spec failed -- that is a worker's job.*

**Standard, brand-neutral setup.** These agents ship generic. On a new install, the first action
is a **business interview** that establishes the business name, brand voice, products, pricing
rules, policies, and the per-agent integrations. Agents read business config from that interview;
it is never hardcoded here.

## Roster

| Worker | Wrapper | Owns (one line) | Gate |
|---|---|---|---|
| **orchestrator** | `orchestrator:plan` | Decompose, route, run the board and weekly rhythm, hold the greenlight | enforces merge / publish / destructive / external-send / credential-change |
| **support** | `support:task` | All inbound customer conversations across every channel | external sends |
| **marketing** | `marketing:task` | All outbound marketing -- content, campaigns, email/social drafts, paid-media setup, and performance reporting | paid-spend / publish / external-send / new-channel-launch |
| **builder** | `builder:task` | Scoped code changes and implementation work | merge / destructive / external-send / credential-change |
| **inbox-triage** | `inbox-triage:task` | Inbound message classification and internal routing | external-send / escalation-to-human / credential-change |
| **km-agent** | `km-agent:task` | Internal knowledge base updates and source-backed reusable notes | publish / external-send / credential-change |
| **maintainer** | `maintainer:task` | Routine maintenance and small safe patches | merge / destructive / credential-change / service-restart |
| **ops-watch** | `ops-watch:task` | Health checks, log review, and incident summaries | service-restart / destructive / credential-change / external-send |
| **qa** | `qa:task` | Testing, reproduction, and verification proof | destructive / external-send / credential-change |
| **researcher** | `researcher:task` | Source-backed research and summaries | external-send / publish / credential-change |
| **reviewer** | `reviewer:task` | Code review and approval recommendations | merge / destructive / external-send / credential-change |
| **strategist** | `strategist:task` | Strategic analysis, options, and recommendation briefs | publish / external-send / paid-spend / credential-change |
| **intelligence** | `intelligence:task` | Cross-channel synthesis, dashboards, anomaly alerts, competitor/industry research, and recommendation memos; does not dispatch | external-send / publish / credential-change / cross-worker-dispatch |

A worker's toolsets, skills, and integrations are defined in `swarm.yaml`, the profile config, and the worker core skill. Orchestrator remains the single Team Manager/router; functional workers do their specialist work through Kanban and preserve owner gates.
## Permanent owner gates

- **Money never moves autonomously.** Finance can draft, categorize, and reconcile, but payment
  and bank actions are a permanent owner greenlight at all levels.
- **Purchase orders are owner-placed.** Operations can threshold, draft supplier emails, and
  forecast, but reorder and purchase-order placement are a permanent owner greenlight at all levels.
- Publishing, paid-ad spend, external sends, merges, destructive actions, and credential changes
  are greenlight-gated. The Orchestrator routes to the gated agent knowing the gate exists; it
  never approves or bypasses another agent's gate.

## Build order

1. **orchestrator** -- the brain; also the Team Manager. Build first.
2. **support** -- narrowest scope, first real test of the pattern.
3. then **sales -> marketing -> finance -> operations -> design -> intelligence -> production**.
