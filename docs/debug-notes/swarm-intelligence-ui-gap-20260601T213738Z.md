# Swarm Intelligence UI gap investigation — paused handoff

Timestamp: 2026-06-01T21:37:38Z

## User report
On the Swarm page, under the Main Agent area:

1. The ACTIVE SWARM section shows only Marketing, Support, and Orchestrator, all saying Working.
2. Intelligence does not appear there.
3. In the Outputs / Reports -> Worker reports section, with Inbox selected on the Main Agent, cards appear for the same 3 agents only.
4. Intelligence does not appear as a report card, even though it had been assigned a task and should show a card/listing like the others.
5. The Worker reports dropdown labeled "All workers" includes Marketing, Support, and Orchestrator, but not Intelligence.

## Active task list at pause
- [in_progress] inspect-ui-source: Inspect Swarm page source/routes to find where Active Swarm, Worker Reports, and All workers dropdown get their worker list
- [pending] compare-runtime-data: Compare UI data sources against swarm.yaml/AGENTS/Kanban tasks for Intelligence
- [pending] diagnose-fix: Identify root cause, apply safe fix if obvious, and verify UI/API includes Intelligence

## Files inspected
- /home/ubuntu/hermes-workspace/src/screens/swarm2/swarm2-screen.tsx
- /home/ubuntu/hermes-workspace/src/screens/swarm2/swarm2-reports-view.tsx
- /home/ubuntu/hermes-workspace/src/hooks/use-crew-status.ts
- /home/ubuntu/hermes-workspace/src/routes/api/swarm-roster.ts
- /home/ubuntu/hermes-workspace/src/routes/api/swarm-runtime.ts
- /home/ubuntu/hermes-workspace/src/routes/api/crew-status.ts
- /home/ubuntu/hermes-workspace/src/server/auth-middleware.ts

## What I found so far

### Swarm2Screen data sources
`Swarm2Screen` fetches several APIs:

- `/api/crew-status` via `useCrewStatus()`
- `/api/swarm-runtime` via `fetchRuntime()`
- `/api/swarm-roster` via `fetchRoster()`
- `/api/swarm-missions?limit=50` via `fetchMissions()`

Important code locations:

- `src/screens/swarm2/swarm2-screen.tsx:980+`
  - `const { crew, lastUpdated } = useCrewStatus()`
  - runtimeQuery -> `/api/swarm-runtime`
  - rosterQuery -> `/api/swarm-roster`
  - missionsQuery -> `/api/swarm-missions?limit=50`

- `src/screens/swarm2/swarm2-screen.tsx:1136+`
  - `runtimeByWorker` maps entries from `/api/swarm-runtime` by `workerId`.
  - `members` starts with `sortSwarmMembers(crew, roomIds)` and then merges runtime/roster metadata.
  - It also adds `extras` from `rosterQuery.data` where a roster worker is not already in `crew`.

### Active Swarm likely source
The Active Swarm panel appears to be built from `members`, which depends primarily on:

- `/api/crew-status` output (`crew`)
- merged with `/api/swarm-roster` and `/api/swarm-runtime`

Need to continue by finding exactly which child component renders ACTIVE SWARM, but the input is almost certainly `members` from `Swarm2Screen`.

### Worker Reports and dropdown source
`Swarm2ReportsView` receives:

- `missions={missionsQuery.data ?? []}`
- `runtimes={runtimeQuery.data?.entries ?? []}`

Important code locations:

- `src/screens/swarm2/swarm2-reports-view.tsx:199+`
  - `buildSwarm2ReportRows({ missions, runtimes })`
  - Builds rows from mission assignments first.
  - Then adds runtime rows only when `hasRuntimeOutput` is true.

- `src/screens/swarm2/swarm2-reports-view.tsx:252+`
  Runtime rows are skipped unless the runtime has one of:
  - `lastSummary`
  - `lastResult`
  - `blockedReason`
  - `lastRealSummary`
  - `lastRealResult`
  - artifacts
  - previews

- `src/screens/swarm2/swarm2-reports-view.tsx:525+`
  - `rows = buildSwarm2ReportRows({ missions, runtimes })`

- `src/screens/swarm2/swarm2-reports-view.tsx:527+`
  - The "All workers" dropdown options are computed from rows only:
    `const workers = useMemo(() => [...new Set(rows.map((row) => row.workerId))].sort(), [rows])`

This is a likely explanation for why Intelligence is missing from the dropdown: if Intelligence has no report row, it cannot appear in that dropdown, even if it exists as a live worker.

### Crew-status API behavior
`src/routes/api/crew-status.ts` builds the crew list by scanning profile directories:

- `buildCrewDefinitions()` at lines 58-81
- It reads `/home/ubuntu/.hermes/profiles/*` dynamically.
- It returns workspace plus every profile directory/symlink.
- It only enriches roster metadata for profile IDs matching `^swarm\d+$`:
  `buildCrewDefinitionFromRoster(profile, /^swarm\d+$/i.test(profile) ? roster.get(profile) : null)`

This matters because the live agent profile is named `intelligence`, not `swarmN`. It should still be included as a profile, but it will not get roster metadata from `swarm.yaml` through this specific code path unless that logic has changed or the roster uses numeric swarm IDs.

### Swarm-runtime and swarm-roster APIs
`src/routes/api/swarm-runtime.ts` uses `listSwarmWorkerIds()` from `src/server/swarm-foundation`.
`src/routes/api/swarm-roster.ts` also uses `listSwarmWorkerIds()` and `readSwarmRoster(ids)`.

Need to inspect `src/server/swarm-foundation.ts` and `src/server/swarm-roster.ts` next, especially `listSwarmWorkerIds()` and whether it returns `intelligence` or only the first 3 legacy workers.

### Auth/API direct curl status
I tried direct localhost curl checks without a browser session cookie:

- `http://127.0.0.1:3000/api/swarm-roster` -> 401 Unauthorized
- `http://127.0.0.1:3000/api/swarm-runtime` -> 401 Unauthorized
- `http://127.0.0.1:3000/api/crew-status` -> 401 Unauthorized
- `http://127.0.0.1:3000/api/swarm-missions?limit=50` -> 401 Unauthorized

This does NOT mean the APIs are broken in the browser. It just means direct curl lacked the `claude-auth` session cookie. `auth-middleware.ts` confirms API auth requires a valid session token when workspace password protection is enabled.

## Working hypothesis
There may be two separate UI/data-source issues:

1. Active Swarm missing Intelligence:
   - Likely due to the worker source being filtered or built from legacy roster/worker IDs, or because `listSwarmWorkerIds()` / roster data does not include `intelligence` in the shape expected by the Swarm2 UI.
   - Need to inspect `swarm-foundation.ts`, `swarm-roster.ts`, and live `swarm.yaml`.

2. Worker Reports/dropdown missing Intelligence:
   - Confirmed from source: dropdown is generated from `rows`, not from all workers.
   - `rows` only includes workers that have mission assignment rows or runtime output rows.
   - A worker with an assigned Kanban task but no Swarm mission assignment/checkpoint/runtime summary may not appear.
   - If Intelligence was assigned via Hermes Kanban rather than Swarm Missions, the Reports UI may not be reading that Kanban task source at all.

## Next steps to resume
1. Inspect:
   - `/home/ubuntu/hermes-workspace/src/server/swarm-foundation.ts`
   - `/home/ubuntu/hermes-workspace/src/server/swarm-roster.ts`
   - `/home/ubuntu/hermes-workspace/swarm.yaml`
2. Check live profile exists:
   - `/home/ubuntu/.hermes/profiles/intelligence`
3. Check whether `/home/ubuntu/.hermes/profiles/intelligence/runtime.json` exists and whether it has `lastSummary`, `lastResult`, `currentTask`, `lastOutputAt`, etc.
4. Check if Intelligence task exists in Kanban DB but not in `/api/swarm-missions` source.
5. If direct API verification is needed, use the browser session or extract a valid cookie from `~/.hermes/workspace-sessions.json` if appropriate; do not print the token.
6. Likely fixes to consider after confirming:
   - Ensure `listSwarmWorkerIds()` includes `intelligence` from `swarm.yaml`.
   - Update crew-status roster enrichment to work for non-`swarmN` profile IDs, not just `^swarm\d+$`.
   - Update Worker Reports dropdown to include all runtime/roster workers, not only workers with rows.
   - Consider adding in-progress runtime rows for workers with assigned/current tasks even if no summary/result exists.
   - If Kanban tasks are separate from Swarm Missions, add/bridge Kanban assigned-task source into reports or make sure Swarm task assignment writes mission/runtime metadata.

## No changes made yet
No source code was changed before pausing. This is only an investigation handoff.
