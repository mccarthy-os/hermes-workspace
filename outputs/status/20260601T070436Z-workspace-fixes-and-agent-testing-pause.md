# Workspace fixes and 12-agent testing pause

Timestamp: 2026-06-01T07:04:36Z

## Current state

We paused after fixing and locally committing Hermes Workspace fixes, restarting Workspace, and beginning validation of the 12 live swarm agents.

## Local Workspace fix checkpoint

Repository:

- `/home/ubuntu/hermes-workspace`

Branch:

- `amazing-transfers-local-swarm-fixes`

Local commit:

- `cbb32163 fix: stabilize local workspace auth and swarm runtime`

Backup before edits:

- `/home/ubuntu/hermes-backups/pre-workspace-local-fixes-20260601T061805Z`

Backup branch:

- `backup/pre-workspace-local-fixes-20260601T061805Z`

Git state at last confirmation:

- Clean after commit.
- Nothing pushed upstream.
- No PR opened.

## Fixes included in local commit

1. Session-continuity auth bug
   - File: `src/server/openai-compat-api.ts`
   - Workspace now only sends `X-Hermes-Session-Id` / `X-Claude-Session-Id` when a bearer token exists.

2. More accurate auth error message
   - File: `src/components/error-toast.tsx`
   - Added specific messaging for gateway/session-continuity/API token mismatch instead of only showing a generic API-key error.

3. Auth error tests
   - File: `src/components/error-toast.test.ts`

4. OpenAI compatibility test update
   - File: `src/server/openai-compat-api.test.ts`

5. Swarm roster parsing/fallback stability
   - Files: `src/server/swarm-roster.ts`, `src/server/swarm-roster.test.ts`
   - Supports top-level worker-array swarm rosters and preserves semantic wrapper metadata.

6. Swarm runtime handling
   - Files: `src/routes/api/swarm-runtime.ts`, `src/server/swarm-foundation.ts`, `src/screens/swarm2/swarm2-screen.tsx`
   - Added/fixed `lastRealSummary` / `lastRealResult` handling.

7. Swarm dispatch/lifecycle cleanup
   - Files: `src/routes/api/swarm-dispatch.ts`, `src/routes/api/swarm-lifecycle.ts`

8. Swarm UI compile fixes
   - Files: `src/screens/swarm/swarm-screen.tsx`, `src/screens/swarm2/swarm2-screen.tsx`

## Validation already completed

Targeted tests:

- Passed.
- 9 test files passed.
- 51 tests passed.

Filtered TypeScript check for edited files:

- Passed.
- No edited-file TypeScript errors after final fix.

Production build:

- `pnpm build` passed.

Workspace restart:

- `hermes-workspace.service` restarted successfully.
- Service reported active/running.

Local smoke checks:

- `http://127.0.0.1:3000/` returned HTTP 200.
- `http://127.0.0.1:8642/health` returned `{"status": "ok", "platform": "hermes-agent"}`.

Known caveat:

- Full repo-wide TypeScript/lint still have broad pre-existing unrelated issues.
- The edited-file filtered TypeScript check was clean.

## 12-agent status discovered

User confirmed the Workspace UI shows all 12 live agents.

Live tmux sessions seen:

1. `swarm-orchestrator`
2. `swarm-support`
3. `swarm-marketing`
4. `swarm-builder`
5. `swarm-inbox-triage`
6. `swarm-km-agent`
7. `swarm-maintainer`
8. `swarm-ops-watch`
9. `swarm-qa`
10. `swarm-researcher`
11. `swarm-reviewer`
12. `swarm-strategist`

Important finding:

Only 3 of the 12 currently have full configured role/capability/skill metadata in active `swarm.yaml`:

- `orchestrator`
- `support`
- `marketing`

The other 9 have live tmux sessions but do not currently have exact configured role/capability/skill entries in active `swarm.yaml`, and their profile `config.yaml` files were missing at inspection time. Their `SOUL.md` files appeared to be generic default Hermes text.

## Properly configured agents as of pause

### orchestrator

- Role: Swarm Orchestrator / Team Manager / Greenlight Gate
- Profile: `orchestrator`
- Wrapper: `orchestrator:plan`
- Mode: `plan`
- Core skill: `orchestrator-core`
- Toolsets: `todo`, `kanban`, `delegation`, `terminal`, `file`, `session_search`, `cronjob`, `skills`, `clarify`
- Capabilities: `orchestration`, `decomposition`, `routing`, `proof-contracts`, `greenlight-gate`, `team-coordination`

### support

- Role: Customer Resolution Engine
- Profile: `support`
- Wrapper: `support:task`
- Mode: `task`
- Core skills: `support-core`, `kanban-worker`
- Toolsets: `kanban`, `skills`, `memory`, `file`, `web`
- Capabilities: `triage`, `customer-communication`, `de-escalation`, `escalation-packaging`, `knowledge-base`

### marketing

- Role: Outbound Voice and Growth Engine
- Profile: `marketing`
- Wrapper: `marketing:task`
- Mode: `task`
- Core skills: `marketing-core`, `kanban-worker`
- Toolsets: `kanban`, `skills`, `memory`, `todo`, `file`, `web`
- Capabilities: `campaign-planning`, `content-creation`, `paid-media-setup`, `email-marketing`, `organic-social`, `performance-reporting`, `design-briefing`

## Live but not fully commissioned/configured yet

These appear live but incomplete:

- `builder`
- `inbox-triage`
- `km-agent`
- `maintainer`
- `ops-watch`
- `qa`
- `researcher`
- `reviewer`
- `strategist`

Likely next work is to properly commission these 9 agents by creating/verifying:

- `~/.hermes/profiles/<agent>/config.yaml`
- `~/.hermes/profiles/<agent>/SOUL.md`
- `~/.hermes/skills/<agent-core>/SKILL.md`
- `~/.local/bin/<agent>:task` or correct wrapper
- active roster entries in `/home/ubuntu/hermes-workspace/swarm.yaml`

## Next session / resume steps

1. Re-check service status:

   ```bash
   systemctl --user is-active hermes-workspace.service
   curl -sS -I --max-time 10 http://127.0.0.1:3000/ | head
   curl -sS --max-time 10 http://127.0.0.1:8642/health
   ```

2. Re-check live swarm sessions:

   ```bash
   tmux list-sessions | grep '^swarm-'
   ```

3. Continue testing in Workspace UI:

   - Open Workspace via Cloudflare Tunnel.
   - Confirm all 12 agents still show live.
   - Test Orchestrator, Support, and Marketing first because they are the properly configured agents.
   - Do not rely on the other 9 for business work until they are fully commissioned.

4. Decide whether to commission the remaining 9 agents next or first prepare an upstream report/PR for the Workspace fixes.

## User note

User lost scroll functionality in the Hermes terminal. Suggested tmux scroll mode:

- Press `Ctrl-b`, then `[`, then scroll/PageUp/PageDown.
- Press `q` to exit scroll mode.
- Optional permanent mouse mode:

  ```bash
  echo 'set -g mouse on' >> ~/.tmux.conf
  tmux source-file ~/.tmux.conf
  ```
