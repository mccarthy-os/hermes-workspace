# Marketing Agent Commissioning Gap Analysis

Reviewed: 2026-05-29T02:58Z
Worker: marketing / Marketing
Checklist source: commission-new-hermes-agent
Backup: /home/ubuntu/hermes-backups/commission-marketing-20260529T025511Z

## Summary

Status: PARTIALLY COMMISSIONED / NOT 100% COMPLETE

I copied and edited the Marketing agent from the provided draft into the runtime locations, using the working Orchestrator/Support pattern and the `commission-new-hermes-agent` checklist.

The official commission audit now passes for the 6-file runtime installation. Direct profile smoke test also passes. The remaining gaps are runtime/startup and owner/business decisions, not missing 6-file framework files.

## Runtime files installed or updated

- SOUL.md: `/home/ubuntu/.hermes/profiles/marketing/SOUL.md`
- Core skill, global: `/home/ubuntu/.hermes/skills/marketing-core/SKILL.md`
- Core skill, profile-local: `/home/ubuntu/.hermes/profiles/marketing/skills/marketing-core/SKILL.md`
- Profile config: `/home/ubuntu/.hermes/profiles/marketing/config.yaml`
- Wrapper: `/home/ubuntu/.local/bin/marketing:task`
- Swarm roster: `/home/ubuntu/hermes-workspace/swarm.yaml`
- Shared rules/roster: `/home/ubuntu/hermes-workspace/AGENTS.md`
- Profile-local mission skills:
  - `/home/ubuntu/.hermes/profiles/marketing/skills/campaign-brief/SKILL.md`
  - `/home/ubuntu/.hermes/profiles/marketing/skills/content-calendar/SKILL.md`
  - `/home/ubuntu/.hermes/profiles/marketing/skills/ad-launch/SKILL.md`
  - `/home/ubuntu/.hermes/profiles/marketing/skills/performance-review/SKILL.md`

## Fixes applied from the provided draft

1. Model/provider corrected
   - Draft used `openrouter` / `stepfun/step-3.5-flash`.
   - Runtime now uses profile provider `openai-codex` and model `gpt-5.5`.
   - `swarm.yaml` uses model label `GPT-5.5`.

2. Wrapper corrected
   - Draft wrapper used direct `hermes --profile marketing --skills marketing-core -q`.
   - Runtime wrapper now matches working Support/Orchestrator pattern:
     - `HERMES_BIN` fallback
     - `--profile marketing`
     - `--toolsets kanban`
     - `-z`
   - Wrapper is executable.

3. Core/profile skill availability corrected
   - Installed `marketing-core` globally and profile-locally.
   - Installed mission skills profile-locally as available/on-demand skills.
   - Did not preload mission skills in profile config or `swarm.yaml`; baseline preloads are only `marketing-core` and `kanban-worker`.

4. Zernio/Composio wording corrected
   - Kept them as planned future integrations.
   - Marked them inactive until MCP servers and credentials are configured.
   - Runtime `mcpServers: []` remains correct for now.

5. Unsupported Kanban args removed from runtime mission skills
   - Removed unsupported `due=` and `recurring=` examples from installed mission skills.
   - Future dates/recurrence should be placed in task body or handled by cron later.

6. Paid-spend wording tightened
   - Marketing starts at Level 1 / Shadow Mode.
   - Paid spend remains owner-gated unless a future owner-configured Level 3 threshold explicitly allows an exception.
   - With no threshold configured, all paid spend requires owner approval.

7. AGENTS.md row strengthened
   - Marketing gate is now listed as:
     - paid-spend / publish / external-send / new-channel-launch

## Checks run

### Official commission audit

Command:

```bash
python3 /home/ubuntu/.hermes/skills/hermes/commission-new-hermes-agent/scripts/commission_audit.py marketing --mode task --draft-dir /home/ubuntu/draft-worker-agents/Marketing
```

Result: PASS

Key pass items:

- Runtime SOUL exists and has required sections.
- Runtime core skill exists and has correct frontmatter.
- Runtime profile config exists and parses.
- Profile model is set.
- Profile includes kanban toolset.
- Profile skills include `marketing-core` and `kanban-worker`.
- Wrapper exists, is executable, and references profile `marketing`.
- `swarm.yaml` has exactly one Marketing entry.
- `swarm.yaml` tools match profile enabled_toolsets.
- `swarm.yaml` skills match profile skills.
- `AGENTS.md` contains Marketing and preserves Orchestrator/owner-gate language.
- Watchdog script and service exist; service is active.

Warning:

- Draft mission-skills present; copy/install only mission skills actually needed. I installed the four provided Marketing mission skills profile-locally as on-demand skills and did not preload them.

### Watchdog dry-run

Result: PASS / READY TO START

Watchdog sees 3 workers:

- orchestrator
- support
- marketing

Marketing model sync result:

- `model sync ok for marketing: openai-codex/gpt-5.5`

Watchdog dry-run would start:

- `swarm-marketing`

### Direct profile smoke test

Command:

```bash
HERMES_HOME=/home/ubuntu/.hermes/profiles/marketing \
HERMES_CLI_BIN=/home/ubuntu/.hermes/hermes-agent/venv/bin/hermes \
/home/ubuntu/.hermes/hermes-agent/venv/bin/hermes chat -q \
"Introduce yourself in one paragraph. State your worker id, role, what you own, what you do not own, and one greenlight rule you must obey. Do not use tools."
```

Result: PASS

Marketing correctly identified:

- its role as the outbound voice and growth engine
- its scope: content, paid media preparation, email marketing, organic social posting plans, campaign planning, calendars, performance reporting
- its non-scope: customer replies/inbound DMs, sales quotes/pricing, visual design production, finance, broad intelligence analysis
- its greenlight rule: never publish/send/activate/modify paid spend without owner approval

## Remaining gaps / owner decisions

### Gap 1 - Marketing tmux worker is not started yet

Current state:

- `swarm-marketing` tmux session was not running at the time of this report.
- Watchdog dry-run says it would start Marketing correctly.

Owner decision needed:

- Approve starting/restarting the watchdog so it launches the Marketing swarm session, or start Marketing manually through the Workspace/UI.

Why this is a gap:

- `commission-new-hermes-agent` says a worker is only 100% complete when `tmux` session `swarm-<worker-id>` can exist and stay live.

### Gap 2 - Kanban worker test not run yet

Current state:

- Direct profile smoke test passed.
- I did not create a Kanban smoke-test task yet.

Owner decision needed:

- Approve a harmless Marketing Kanban test card, for example:

```text
Commissioning smoke test for marketing: read your task, summarize your role, state what proof you would return for real marketing work, and complete this test. Do not contact external systems, publish, send email, activate ads, or spend money.
```

Why this is a gap:

- `commission-new-hermes-agent` requires a Kanban worker test before marking the worker 100% complete.

### Gap 3 - Orchestrator routing test not run yet

Current state:

- Orchestrator already has Marketing in the shared AGENTS.md roster.
- `swarm.yaml` now has a Marketing entry.
- I did not ask Orchestrator to route a test task to Marketing yet.

Owner decision needed:

- Approve a harmless Orchestrator routing test after Marketing is running.

Suggested test:

```text
Orchestrator commissioning smoke test: route a safe local-only test task to Marketing, explain why Marketing owns it, and preserve all greenlight gates. Do not perform external sends, publishing, ad activation, or business actions.
```

Why this is a gap:

- `commission-new-hermes-agent` requires Orchestrator to recognize and route to the new worker.

### Gap 4 - Business/brand config source is still not installed

Current state:

- Marketing correctly refuses to invent brand voice.
- Business config path/source is still not defined in runtime.

Owner decision needed:

- Decide where Amazing Transfers business config should live.

Recommended options:

1. Shared workspace file, e.g. `/home/ubuntu/hermes-workspace/business-config/amazing-transfers.yaml`
2. Profile-local file, e.g. `/home/ubuntu/.hermes/profiles/marketing/business-config.yaml`
3. Future CRM/store/MCP-backed config once Zernio/Composio are active

Recommended near-term choice:

- Use a shared workspace business config file so all agents read the same source of truth.

Why this is a gap:

- Marketing can pass structural commissioning, but real Amazing Transfers content should not be generated until brand voice, products, channels, claims, CTAs, and policy boundaries are available.

### Gap 5 - Zernio MCP and Composio are planned but not configured

Current state:

- `mcpServers: []`
- Runtime mission skills mark Zernio/Composio as planned future MCP integrations.

Owner decision needed later:

- Configure Zernio MCP tools.
- Configure Composio email/CRM/store tools.
- Add least-privilege credentials/scopes.
- Decide which actions remain draft-only vs allowed after owner approval.

Why this is a gap:

- Marketing can draft plans, briefs, calendars, and reports, but cannot truthfully claim to schedule/publish/send/update live systems until these MCP tools are installed and tested.

### Gap 6 - Permission level is not stored as a formal runtime value

Current state:

- SOUL says initial commissioning starts at Level 1 / Shadow Mode.
- No separate owner-controlled permission-level config file exists yet.

Owner decision needed:

- Decide whether permission level should be stored in shared business config or a Marketing profile-local policy file.

Recommended default:

- Keep Marketing at Level 1 / Shadow Mode until after real smoke tests and owner approval.

### Gap 7 - Output folder exists in instructions but may need creation/approval

Current state:

- Mission skills now instruct Marketing to write outputs under:
  `/home/ubuntu/hermes-workspace/outputs/marketing/`

Owner decision needed:

- Confirm this is the desired standard output location.

If approved, create:

```bash
mkdir -p /home/ubuntu/hermes-workspace/outputs/marketing
```

### Gap 8 - Mission skill preload strategy remains intentionally conservative

Current state:

- Installed mission skills profile-locally:
  - campaign-brief
  - content-calendar
  - ad-launch
  - performance-review
- Did not add them to `profile config skills:` or `swarm.yaml skills:`.

Owner decision needed:

- Confirm whether mission skills should stay on-demand or preload all four.

Recommended choice:

- Keep on-demand for now. Baseline preloads should stay `marketing-core` and `kanban-worker` to reduce prompt bloat and prevent paid-ad execution instructions from always being active.

## 100% complete checklist status

- Backup path created and reported: PASS
- All 6 framework files exist in runtime locations: PASS
- SOUL required sections present: PASS
- `marketing-core` skill loads and has correct frontmatter: PASS
- Profile config has correct model/toolsets/skills: PASS
- Wrapper executable and points to correct profile: PASS
- `swarm.yaml` has exactly one Marketing entry: PASS
- `AGENTS.md` roster/rules updated: PASS
- Watchdog dry-run passes and sees Marketing: PASS
- Watchdog service active: PASS
- `tmux` session `swarm-marketing` exists and stays live: NOT RUN / NEEDS OWNER APPROVAL TO START
- Direct Marketing smoke test: PASS
- Kanban worker test: NOT RUN / NEEDS OWNER APPROVAL
- Orchestrator routing test: NOT RUN / NEEDS OWNER APPROVAL

## Current commissioning result

Commissioning result: BLOCKED, not PASS

Reason:

The structural/file commissioning is complete and passes audit, but the full runtime commissioning is not complete until the owner approves startup plus Kanban and Orchestrator routing smoke tests.
