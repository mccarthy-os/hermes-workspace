#!/usr/bin/env bash
set -euo pipefail

# Weekly Hermes + Workspace backup -- kept in ~/hermes-backups/
# Retains the 4 most recent scheduled full backups.
#
# This backup is intentionally local and sensitive: it includes config,
# credentials, OAuth auth.json, workspace .env, profile configs, and state DBs.
# Do not commit or upload the generated tarballs to GitHub.

BACKUP_DIR="$HOME/hermes-backups"
DATE=$(date -u +%Y%m%d_%H%M%S)
MAX_BACKUPS=4
BACKUP_FILE="$BACKUP_DIR/hermes-full-$DATE.tar.gz"
MANIFEST_FILE="$(mktemp)"

mkdir -p "$BACKUP_DIR"
trap 'rm -f "$MANIFEST_FILE"' EXIT

cat > "$MANIFEST_FILE" <<MANIFEST
Hermes full local backup
Created UTC: $DATE
Host: $(hostname)

Sensitive contents included:
- ~/.hermes/.env
- ~/.hermes/auth.json
- ~/.hermes/workspace-sessions.json if present
- ~/hermes-workspace/.env if present

Coverage summary:
- Main Hermes config/state/skills/memories/cron/plugins/pairing
- All Hermes profiles under ~/.hermes/profiles
- Hermes helper scripts under ~/.hermes/scripts
- User systemd Hermes service files
- Semantic swarm wrappers under ~/.local/bin/*:plan and *:task
- Full Hermes Workspace working tree, excluding node_modules/dist/.git/cache outputs
- Draft worker agents, workspace inputs, workspace outputs, docs, scripts, and reports
MANIFEST

# Run from $HOME so stored paths are relative and restore-friendly.
cd "$HOME"

tar czf "$BACKUP_FILE" \
  --ignore-failed-read \
  --exclude='.hermes/hermes-agent' \
  --exclude='.hermes/cache' \
  --exclude='.hermes/pastes' \
  --exclude='.hermes/image_cache' \
  --exclude='.hermes/audio_cache' \
  --exclude='.hermes/sandboxes' \
  --exclude='.hermes/logs' \
  --exclude='.hermes/sessions' \
  --exclude='.hermes/node' \
  --exclude='hermes-workspace/node_modules' \
  --exclude='hermes-workspace/dist' \
  --exclude='hermes-workspace/dist-ssr' \
  --exclude='hermes-workspace/build' \
  --exclude='hermes-workspace/.git' \
  --exclude='hermes-workspace/.tanstack' \
  --exclude='hermes-workspace/.vinxi' \
  --exclude='hermes-workspace/.output' \
  --exclude='hermes-workspace/.nitro' \
  --exclude='hermes-workspace/.cache' \
  --exclude='hermes-workspace/tmp' \
  --exclude='hermes-workspace/data' \
  --transform='s#^tmp/.*backup-manifest[^/]*$#BACKUP-MANIFEST.txt#' \
  "$MANIFEST_FILE" \
  .hermes/config.yaml \
  .hermes/.env \
  .hermes/auth.json \
  .hermes/state.db \
  .hermes/kanban.db \
  .hermes/response_store.db \
  .hermes/SOUL.md \
  .hermes/channel_directory.json \
  .hermes/gateway_state.json \
  .hermes/workspace-sessions.json \
  .hermes/memories \
  .hermes/skills \
  .hermes/cron \
  .hermes/plugins \
  .hermes/pairing \
  .hermes/hooks \
  .hermes/profiles \
  .hermes/scripts \
  .config/systemd/user/hermes-gateway.service \
  .config/systemd/user/hermes-workspace.service \
  .config/systemd/user/hermes-dashboard.service \
  .config/systemd/user/hermes-swarm-watchdog.service \
  .local/bin/orchestrator:plan \
  .local/bin/support:task \
  .local/bin/marketing:task \
  hermes-workspace \
  draft-worker-agents \
  .bashrc

# Remove older scheduled full backups, keep newest $MAX_BACKUPS.
ls -tp "$BACKUP_DIR"/hermes-full-*.tar.gz 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -- 2>/dev/null

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
REMAINING=$(ls -1 "$BACKUP_DIR"/hermes-full-*.tar.gz 2>/dev/null | wc -l)

echo "Hermes backup complete: $BACKUP_FILE ($SIZE)"
echo "Backups retained in $BACKUP_DIR: $REMAINING"
