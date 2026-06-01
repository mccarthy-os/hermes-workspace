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
| **sales** | `sales:task` | Quoting, follow-up, deal closing | external sends |
| **marketing** | `marketing:task` | All outbound marketing -- content, campaigns, email/social drafts, paid-media setup, and performance reporting | paid-spend / publish / external-send / new-channel-launch |
| **finance** | `finance:task` | Bookkeeping, invoicing, reconciliation, financial reporting | **payment + bank action (permanent)** |
| **operations** | `operations:task` | Inventory, supplier coordination, materials | **reorder + purchase order (permanent)** |
| **design** | `design:task` | Visual and creative asset creation | -- |
| **intelligence** | `intelligence:task` | Data analysis, reporting, trend detection, alerts; does not dispatch | -- |
| **production** | `production:task` | Production workflow management and dispatch coordination | -- |

A worker's toolsets, skills, and integrations are defined when that worker is built and configured
per business at install. For physical-fulfilment businesses, `production` directs a human team
(make, finish, QC, pack, ship); for service businesses that becomes a service-delivery team; for
pure-digital businesses it does not exist.

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
