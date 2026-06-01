# Amazing Transfers local fixes and update recovery

Last updated: 2026-06-01 UTC

This document records the local Hermes Workspace changes made while commissioning the Amazing Transfers swarm and explains how to protect/reapply them before or after a Hermes Workspace update.

## Why this exists

The VPS has two separate codebases:

- Hermes Agent: `/home/ubuntu/.hermes/hermes-agent`
- Hermes Workspace: `/home/ubuntu/hermes-workspace`

Most recent fixes were made in Hermes Workspace. A Hermes Agent update should not normally overwrite Workspace files, but a Hermes Workspace update, reset, reinstall, or forced checkout can overwrite or conflict with local changes.

## Current preservation strategy

1. Keep local runtime backups under `/home/ubuntu/hermes-backups/`.
2. Keep the weekly Hermes cron backup enabled.
3. Record source changes in Git on a branch pushed to GitHub.
4. After a Workspace update, reapply by pulling/cherry-picking the saved branch or diff.

## Backup cron

Hermes cron job:

- Name: `Weekly Hermes Backup`
- Schedule: `0 3 * * 0` -- every Sunday at 03:00 UTC
- Script: `backup-hermes.sh`
- Runtime script path: `/home/ubuntu/.hermes/scripts/backup-hermes.sh`
- Versioned copy in repo: `scripts/backup-hermes-local.sh`

The backup tarballs are sensitive because they include `.env`, `auth.json`, OAuth/session tokens, and profile configuration. Do not commit generated backup archives to GitHub.

## Backup coverage

The updated backup covers:

- Main Hermes config/state:
  - `~/.hermes/config.yaml`
  - `~/.hermes/.env`
  - `~/.hermes/auth.json`
  - `~/.hermes/state.db`
  - `~/.hermes/kanban.db`
  - `~/.hermes/response_store.db`
  - `~/.hermes/SOUL.md`
  - `~/.hermes/channel_directory.json`
  - `~/.hermes/gateway_state.json`
  - `~/.hermes/workspace-sessions.json` when present
- Persistent Hermes data:
  - `~/.hermes/memories`
  - `~/.hermes/skills`
  - `~/.hermes/cron`
  - `~/.hermes/plugins`
  - `~/.hermes/pairing`
  - `~/.hermes/hooks`
  - `~/.hermes/profiles`
  - `~/.hermes/scripts`
- User systemd Hermes services:
  - `~/.config/systemd/user/hermes-gateway.service`
  - `~/.config/systemd/user/hermes-workspace.service`
  - `~/.config/systemd/user/hermes-dashboard.service`
  - `~/.config/systemd/user/hermes-swarm-watchdog.service`
- Semantic swarm wrappers:
  - `~/.local/bin/orchestrator:plan`
  - `~/.local/bin/support:task`
  - `~/.local/bin/marketing:task`
- Full Workspace working tree:
  - `/home/ubuntu/hermes-workspace`
  - excludes heavy/generated paths such as `node_modules`, `dist`, `.git`, `.tanstack`, `.vinxi`, and cache/build outputs
- Draft worker agents:
  - `/home/ubuntu/draft-worker-agents`
- Shell convenience:
  - `~/.bashrc`

## Local Workspace fixes currently worth preserving

Main swarm/runtime fixes:

- `src/server/swarm-roster.ts`
  - Accepts both top-level array and `{ version, workers }` swarm.yaml shapes.
- `src/routes/api/swarm-tmux-start.ts`
  - Resolves Linux tmux paths such as `/usr/bin/tmux`.
  - Uses correct semantic wrappers from roster metadata.
- `src/routes/api/swarm-runtime.ts`
  - Uses robust tmux resolution and runtime reporting.
- `src/screens/swarm2/swarm2-screen.tsx`
  - Auto-starts missing tmux sessions before attaching.
- `src/routes/api/swarm-dispatch.ts`
  - Fixes wrapper fallback so semantic wrappers receive only the final prompt, not `chat -q ... --source swarm-dispatch`.
- `src/routes/api/-swarm-dispatch.test.ts`
  - Tests the fallback behavior.
- `src/server/swarm-chat-reader.ts`
  - Improves session selection so the UI reads the active/live worker session rather than stale one-shot CLI sessions.
- `src/server/swarm-lifecycle.ts`
  - Supports lifecycle/watchdog behavior used by the swarm runtime.
- `scripts/swarm-watchdog.py`
  - Keeps commissioned swarm tmux sessions live.
- `swarm.yaml`
  - Current Amazing Transfers worker roster/model labels.
- `AGENTS.md`
  - Shared semantic swarm operating rules and roster.

Other fix:

- `src/screens/playground/components/playground-hud.tsx`
  - Removed an extra closing JSX tag that blocked raw TypeScript parsing.

Documentation/reports:

- `commissioning-reports/`
- `docs/HERMES-SWARM-GUIDE.md`
- This file.

## Verification commands

Run after applying changes or after a Workspace update:

```bash
cd /home/ubuntu/hermes-workspace
pnpm vitest run src/routes/api/-swarm-dispatch.test.ts
pnpm run build
systemctl --user restart hermes-workspace.service
curl -s -o /dev/null -w 'workspace_http=%{http_code}\n' http://127.0.0.1:3000/
```

Known caveat:

- `pnpm exec tsc --noEmit --pretty false` is not currently clean repo-wide. It now gets past `playground-hud.tsx`, but exposes broader pre-existing typecheck debt across e2e, worker, playground, swarm, settings, and chat areas.

## Before running a Workspace update

```bash
cd /home/ubuntu/hermes-workspace

# 1. Save a patch snapshot
ts=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /home/ubuntu/hermes-backups/pre-workspace-update-$ts
git diff > /home/ubuntu/hermes-backups/pre-workspace-update-$ts/local.diff
git status --short > /home/ubuntu/hermes-backups/pre-workspace-update-$ts/git-status.txt

# 2. Run the full local backup
/home/ubuntu/.hermes/scripts/backup-hermes.sh

# 3. Ensure local changes are committed and pushed
git status --short
git branch --show-current
git log --oneline -5
```

## After a Workspace update

```bash
cd /home/ubuntu/hermes-workspace

# Fetch the saved branch from GitHub.
git fetch origin

# Inspect what changed upstream vs local branch before merging/cherry-picking.
git status
git branch -a

# Re-run verification after applying fixes.
pnpm vitest run src/routes/api/-swarm-dispatch.test.ts
pnpm run build
systemctl --user restart hermes-workspace.service
curl -s -o /dev/null -w 'workspace_http=%{http_code}\n' http://127.0.0.1:3000/
```

## Recovery if an update overwrites local changes

Use one of these, in order of preference:

1. Pull/cherry-pick the GitHub branch containing these local fixes.
2. Apply the saved patch from `/home/ubuntu/hermes-backups/pre-workspace-update-*/local.diff`.
3. Restore the affected files from the latest `/home/ubuntu/hermes-backups/hermes-full-*.tar.gz` archive.

Do not restore generated backup tarballs into Git. They contain secrets.
