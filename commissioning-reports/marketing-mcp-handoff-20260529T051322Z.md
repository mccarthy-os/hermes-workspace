# Marketing Agent MCP Setup Handoff

Timestamp: 2026-05-29T05:13:22Z
Workspace: /home/ubuntu/hermes-workspace
Worker: marketing / Marketing

## Current state

Marketing commissioning is structurally complete and runtime smoke tests have passed.

Resolved Marketing commissioning items:
- 6-file Marketing runtime installation: PASS
- Official commission audit: PASS earlier
- Direct Marketing profile smoke test: PASS
- Watchdog / swarm-marketing session: running earlier after restart
- Marketing Kanban worker smoke test: PASS
  - Task: t_1b1d784e
  - Name: Commissioning smoke test: Marketing worker proof
  - Status: done
- Orchestrator routing test to Marketing: PASS
  - Task: t_dbdbe369
  - Name: Campaign brief: Marketing commissioning smoke test
  - Status: done
- Marketing output folder created:
  - /home/ubuntu/hermes-workspace/outputs/marketing
- Business input folder created:
  - /home/ubuntu/hermes-workspace/inputs/business

Business docs are not added yet. User plans to place Amazing Transfers docs under:
- /home/ubuntu/hermes-workspace/inputs/business

## User request at wrap-up

User wants to continue next session with adding Zernio MCP / Composio so Marketing can run marketing tests.

## MCP findings from this session

Hermes MCP behavior:
- Real MCP config key is `mcp_servers:` in the profile config.yaml.
- Existing `mcpServers: []` is swarm/roster metadata only, not enough to load MCP tools.
- MCP tools are discovered at agent startup, so Marketing must be restarted after config changes.
- Hermes supports `${ENV_VAR}` interpolation inside `mcp_servers:` config values.
- Secrets should go in profile `.env`, not directly in config.yaml.

Current environment check:
- `hermes mcp list` showed no MCP servers configured.
- Node/npm/npx are installed.
- uvx is installed.
- Python package `mcp` is missing from the Hermes venv, so native MCP support is currently disabled until installed.

Required dependency:
- Install Python MCP SDK into Hermes venv:
  - /home/ubuntu/.hermes/hermes-agent/venv/bin/pip install mcp

Potential package choices found:
- Zernio MCP package:
  - npm package: zernio-mcp
  - launch: npx -y zernio-mcp
  - env required: ZERNIO_API_KEY
  - docs say it exposes posts, analytics, inbox, ads, contacts, WhatsApp Business, etc.
- Composio MCP package options:
  - package: composio-mcp-server
    - launch: npx -y composio-mcp-server
    - env required: COMPOSIO_API_KEY
    - optional/narrowing env: COMPOSIO_APPS=gmail,linear,etc.
  - package: @composio/rube-mcp / Rube remote option also exists, but for VPS/Marketing profile the local stdio package is the simpler first setup.

Recommended first Composio scope:
- COMPOSIO_APPS=gmail
- Start narrow for testing, then expand later.

Zernio status:
- Need ZERNIO_API_KEY before live Zernio tests.
- If unavailable, configure Composio first and leave Zernio pending/disabled.

## Recommended safe config shape

Marketing profile env file:
- /home/ubuntu/.hermes/profiles/marketing/.env

Suggested entries:

```text
COMPOSIO_API_KEY=<paste key directly in file; do not paste in chat if avoiding transcript exposure>
COMPOSIO_APPS=gmail
ZERNIO_API_KEY=<optional, when available>
```

Marketing profile config:
- /home/ubuntu/.hermes/profiles/marketing/config.yaml

Suggested active Composio config:

```yaml
mcp_servers:
  composio:
    command: "npx"
    args: ["-y", "composio-mcp-server"]
    env:
      COMPOSIO_API_KEY: "${COMPOSIO_API_KEY}"
      COMPOSIO_APPS: "${COMPOSIO_APPS}"
    timeout: 120
    connect_timeout: 60
```

Suggested Zernio config after key is available:

```yaml
mcp_servers:
  zernio:
    command: "npx"
    args: ["-y", "zernio-mcp"]
    env:
      ZERNIO_API_KEY: "${ZERNIO_API_KEY}"
    timeout: 120
    connect_timeout: 60
```

If both are active, combine under one `mcp_servers:` map.

Swarm roster metadata should also be updated after enabling:
- /home/ubuntu/hermes-workspace/swarm.yaml
- Marketing `mcpServers:` should become something like:
  - composio
  - zernio
or only the enabled servers.

## Safety gates to preserve

Even after MCP tools are connected, Marketing remains Level 1 / Shadow Mode unless owner changes it.

Do not allow Marketing to perform these without explicit owner approval:
- publish social posts
- send email
- send DMs/messages
- activate ads
- change paid spend
- create/modify external customer records in live systems
- destructive actions
- credential changes

Recommended first tests:
- Composio: list/discover Gmail tools and draft-only email test. No send.
- Zernio: list connected accounts or analytics-only read. No publish/post/ad changes.

## Next-session action plan

1. Load skills:
   - hermes-agent
   - native-mcp
   - commission-new-hermes-agent

2. Ask/confirm these owner choices if not already clear:
   - OK to install Python `mcp` package into Hermes venv?
   - Composio apps to enable first. Recommended: gmail only.
   - Whether Zernio API key is available now.
   - OK to restart Marketing/watchdog after config?

3. Make a backup before edits:
   - /home/ubuntu/.hermes/profiles/marketing/config.yaml
   - /home/ubuntu/hermes-workspace/swarm.yaml
   - /home/ubuntu/hermes-workspace/AGENTS.md if editing shared docs
   - /home/ubuntu/.hermes/profiles/marketing/.env if it already exists

4. Install MCP SDK:
   - /home/ubuntu/.hermes/hermes-agent/venv/bin/pip install mcp

5. Add profile-local `.env` placeholders or real values if user enters them directly.

6. Patch Marketing config with `mcp_servers:` using env interpolation.

7. Patch swarm.yaml Marketing `mcpServers:` metadata.

8. Restart Marketing/watchdog so MCP tools are discovered.

9. Verify:
   - `hermes mcp list` under Marketing profile or equivalent startup logs
   - check Marketing profile direct smoke test sees MCP tools
   - run a safe Kanban test asking Marketing to verify tool availability without external sends/publishes/spend

## Current remaining Marketing gaps

- Business docs still need to be added under:
  - /home/ubuntu/hermes-workspace/inputs/business
- Zernio/Composio not configured yet; this is the next target.
- Formal runtime permission-level config is not created yet.
- Mission skills remain on-demand; recommendation is to keep them on-demand for now.
- Final commissioning report should be updated after MCP setup/testing.
