#!/usr/bin/env python3
"""Boot-time swarm tmux restore/watchdog.

Ensures every commissioned worker in swarm.yaml has a live tmux session named
swarm-<id>. Designed to run both as a one-shot boot restore and as a small
periodic watchdog under systemd --user.
"""

from __future__ import annotations

import argparse
import os
import re
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

try:
    import yaml
except Exception as exc:  # pragma: no cover - runtime guard
    print(f"ERROR: PyYAML is required: {exc}", file=sys.stderr)
    sys.exit(2)

HOME = Path.home()
DEFAULT_WORKSPACE = Path(os.environ.get("HERMES_WORKSPACE", HOME / "hermes-workspace"))
DEFAULT_SWARM_YAML = Path(os.environ.get("HERMES_SWARM_YAML", DEFAULT_WORKSPACE / "swarm.yaml"))
DEFAULT_PROFILES_DIR = Path(os.environ.get("HERMES_PROFILES_DIR", HOME / ".hermes" / "profiles"))
DEFAULT_LOCAL_BIN = Path(os.environ.get("HERMES_LOCAL_BIN", HOME / ".local" / "bin"))
DEFAULT_LOG_DIR = Path(os.environ.get("HERMES_SWARM_WATCHDOG_LOG_DIR", HOME / ".hermes" / "logs"))
WORKER_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


def resolve_swarm_model_label(label: Any) -> dict[str, str] | None:
    """Resolve a swarm.yaml model label into Hermes config provider/default.

    This intentionally mirrors src/server/swarm-model-resolver.ts so workers
    started by the boot watchdog use the same model-sync behavior as the
    Workspace UI's /api/swarm-tmux-start route. Unknown labels return None so a
    typo or custom model in swarm.yaml never wedges a worker.
    """
    if not isinstance(label, str):
        return None
    original = label.strip()
    normalized = re.sub(r"\s+", " ", original.lower())
    if not normalized or normalized == "worker":
        return None

    # Anthropic Claude family
    if re.match(r"^(opus\s*4\.7|claude\s*opus\s*4\.7)$", normalized):
        return {"provider": "anthropic-oauth", "default": "claude-opus-4-7"}
    if re.match(r"^(opus\s*4\.6|claude\s*opus\s*4\.6)$", normalized):
        return {"provider": "anthropic-oauth", "default": "claude-opus-4-6"}
    if re.match(r"^(opus\s*4\.5|claude\s*opus\s*4\.5)$", normalized):
        return {"provider": "anthropic-oauth", "default": "claude-opus-4-5"}
    if re.match(r"^(sonnet\s*4\.6|claude\s*sonnet\s*4\.6)$", normalized):
        return {"provider": "anthropic-oauth", "default": "claude-sonnet-4-6"}
    if re.match(r"^(sonnet\s*4\.5|claude\s*sonnet\s*4\.5)$", normalized):
        return {"provider": "anthropic", "default": "claude-sonnet-4-5"}

    # OpenAI Codex family
    if re.match(r"^(gpt[- ]?5\.5|codex\s*\(?gpt[- ]?5\.5\)?)$", normalized):
        return {"provider": "openai-codex", "default": "gpt-5.5"}
    if re.match(r"^(gpt[- ]?5\.4|codex\s*\(?gpt[- ]?5\.4\)?)$", normalized):
        return {"provider": "openai-codex", "default": "gpt-5.4"}
    if re.match(r"^gpt[- ]?5\.3[- ]codex(?:[- ]?spark)?$", normalized):
        return {"provider": "openai-codex", "default": "gpt-5.3-codex-spark"}

    # MiniMax
    if re.match(r"^(minimax(?:\s*m)?\s*2\.7|minimax m?2\.7)$", normalized):
        return {"provider": "minimax", "default": "MiniMax-M2.7"}
    if re.match(r"^minimax(?:\s*m)?\s*2\.7[- ]lightning$", normalized):
        return {"provider": "minimax", "default": "MiniMax-M2.7-Lightning"}

    # Local PC1 / PC2 labels include speed qualifiers; match by prefix.
    if re.match(r"^pc1[\s-]coder", normalized):
        return {"provider": "ollama-pc1", "default": "qwen3-coder-30b-fixed:latest"}
    if re.match(r"^pc1[\s-]planner", normalized):
        return {"provider": "ollama-pc1", "default": "pc1-planner:latest"}
    if re.match(r"^pc1[\s-]critic", normalized):
        return {"provider": "ollama-pc1", "default": "pc1-critic:latest"}
    if re.match(r"^pc1[\s-]score|^pc1[\s-]scorer", normalized):
        return {"provider": "ollama-pc1", "default": "pc1-scorer:latest"}
    if re.match(r"^pc1[\s-]quality", normalized):
        return {"provider": "ollama-pc1", "default": "hf.co/unsloth/Qwen3.5-27B-GGUF:Q4_K_M"}
    if re.match(r"^pc1[\s-]fast", normalized):
        return {"provider": "ollama-pc1", "default": "qwen3-14b-fixed:latest"}
    if re.match(r"^pc1[\s-]think", normalized):
        return {"provider": "ollama-pc1", "default": "deepseek-r1-32b-fixed:latest"}
    if re.match(r"^pc1[\s-]qwen30b", normalized):
        return {"provider": "ollama-pc1", "default": "qwen3-30b-a3b-fixed:latest"}

    # Provider-prefixed full id (already canonical). Pass through.
    slash_match = re.match(r"^([\w.-]+)/(.+)$", original)
    if slash_match:
        return {"provider": slash_match.group(1), "default": slash_match.group(2)}
    return None


def sync_swarm_profile_model(worker: dict[str, Any], profiles_dir: Path, dry_run: bool) -> None:
    """Best-effort sync of profile config.yaml model from swarm.yaml.

    Hermes reads the worker profile's config.yaml when the TUI starts. The
    wrapper/watchdog do not pass --model, so swarm.yaml's model value must be
    copied into model.provider/model.default before tmux launches Hermes.
    """
    worker_id = str(worker["id"]).strip()
    profile_id = str(worker.get("profile") or worker_id).strip()
    resolved = resolve_swarm_model_label(worker.get("model"))
    if not resolved:
        model_label = worker.get("model")
        if model_label:
            log(f"model sync skipped for {worker_id}: unrecognised model label {model_label!r}")
        return

    config_path = profiles_dir / profile_id / "config.yaml"
    if not config_path.exists():
        log(f"model sync skipped for {worker_id}: config.yaml missing at {config_path}")
        return

    try:
        raw = config_path.read_text(encoding="utf-8")
        parsed = yaml.safe_load(raw) or {}
    except Exception as exc:
        log(f"model sync skipped for {worker_id}: failed to read/parse {config_path}: {exc}")
        return
    if not isinstance(parsed, dict):
        log(f"model sync skipped for {worker_id}: config root is not an object")
        return

    current_model = parsed.get("model")
    if not isinstance(current_model, dict):
        current_model = {}
    previous_provider = current_model.get("provider") if isinstance(current_model.get("provider"), str) else ""
    previous_default = current_model.get("default") if isinstance(current_model.get("default"), str) else ""
    if previous_provider == resolved["provider"] and previous_default == resolved["default"]:
        log(f"model sync ok for {worker_id}: {resolved['provider']}/{resolved['default']}")
        return

    previous = f"{previous_provider}/{previous_default}" if previous_provider or previous_default else "unset"
    target = f"{resolved['provider']}/{resolved['default']}"
    if dry_run:
        log(f"dry-run would sync model for {worker_id}: {previous} -> {target}")
        return

    next_model = dict(current_model)
    next_model["provider"] = resolved["provider"]
    next_model["default"] = resolved["default"]
    parsed["model"] = next_model

    tmp_path = config_path.with_name(f"{config_path.name}.tmp-{os.getpid()}-{int(time.time() * 1000)}")
    try:
        tmp_path.write_text(yaml.safe_dump(parsed, sort_keys=False, allow_unicode=True), encoding="utf-8")
        tmp_path.replace(config_path)
        log(f"model synced for {worker_id}: {previous} -> {target}")
    except Exception as exc:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except Exception:
            pass
        log(f"model sync failed for {worker_id}: {exc}")


def log(message: str) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    print(f"[{ts}] {message}", flush=True)


def run(argv: list[str], *, timeout: int = 10) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, text=True, capture_output=True, timeout=timeout)


def resolve_hermes_bin() -> str:
    candidates = [
        os.environ.get("HERMES_CLI_BIN"),
        str(HOME / ".hermes" / "hermes-agent" / "venv" / "bin" / "hermes"),
        str(HOME / ".local" / "bin" / "hermes"),
        shutil.which("hermes"),
    ]
    for candidate in candidates:
        if candidate and ("/" not in candidate or os.access(candidate, os.X_OK)):
            return candidate
    return "hermes"


def load_workers(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"swarm.yaml not found: {path}")
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        workers = raw
    elif isinstance(raw, dict):
        workers = raw.get("workers", [])
    else:
        workers = []
    valid: list[dict[str, Any]] = []
    for item in workers:
        if not isinstance(item, dict):
            continue
        worker_id = str(item.get("id", "")).strip()
        if not worker_id or not WORKER_ID_RE.match(worker_id):
            log(f"skip invalid worker id: {worker_id!r}")
            continue
        disabled = item.get("disabled") is True or item.get("commissioned") is False
        if disabled:
            log(f"skip disabled/decommissioned worker: {worker_id}")
            continue
        valid.append(item)
    return valid


def tmux_has_session(tmux_bin: str, session: str) -> bool:
    return run([tmux_bin, "has-session", "-t", session], timeout=5).returncode == 0


def wrapper_cwd(worker: dict[str, Any], local_bin: Path, fallback: Path) -> Path:
    default_cwd = worker.get("defaultCwd")
    if isinstance(default_cwd, str) and default_cwd.strip():
        path = Path(default_cwd).expanduser()
        if path.exists():
            return path

    wrapper = str(worker.get("wrapper") or worker.get("id") or "").strip()
    if wrapper:
        wrapper_path = local_bin / wrapper
        if wrapper_path.exists():
            try:
                text = wrapper_path.read_text(encoding="utf-8", errors="ignore")
                match = re.search(r"cd\s+'([^']+)'", text)
                if match and Path(match.group(1)).exists():
                    return Path(match.group(1))
            except Exception:
                pass
    return fallback


def start_worker(
    tmux_bin: str,
    worker: dict[str, Any],
    profiles_dir: Path,
    local_bin: Path,
    workspace: Path,
    log_dir: Path,
    dry_run: bool,
) -> bool:
    worker_id = str(worker["id"]).strip()
    # Keep the worker profile's model config in sync with swarm.yaml on every
    # sweep, matching the Workspace UI route. Do this before the already-running
    # check so a roster model change is still written to config.yaml even if the
    # current tmux session keeps running until its next restart.
    sync_swarm_profile_model(worker, profiles_dir, dry_run)

    session = f"swarm-{worker_id}"
    if tmux_has_session(tmux_bin, session):
        log(f"ok already running: {session}")
        return False

    profile_id = str(worker.get("profile") or worker_id).strip()
    profile_path = profiles_dir / profile_id
    cwd = wrapper_cwd(worker, local_bin, workspace)
    hermes_bin = resolve_hermes_bin()
    log_dir.mkdir(parents=True, exist_ok=True)
    worker_log = log_dir / f"swarm-watchdog-{worker_id}.log"

    # Match the Workspace API behavior: a long-lived Hermes TUI in the worker's
    # profile. HERMES_HOME selects the profile; HERMES_CLI_BIN keeps wrappers and
    # children on the known-good installed binary.
    shell_command = (
        f"export HERMES_HOME={shlex.quote(str(profile_path))}; "
        f"export HERMES_CLI_BIN={shlex.quote(hermes_bin)}; "
        f"exec {shlex.quote(hermes_bin)} chat --tui >> {shlex.quote(str(worker_log))} 2>&1"
    )
    argv = [tmux_bin, "new-session", "-d", "-s", session, "-c", str(cwd), shell_command]

    if dry_run:
        log(f"dry-run would start {session}: {' '.join(shlex.quote(a) for a in argv)}")
        return False

    result = run(argv, timeout=10)
    if result.returncode == 0:
        log(f"started {session} profile={profile_id} cwd={cwd} log={worker_log}")
        return True
    log(f"ERROR failed to start {session}: {result.stderr.strip() or result.stdout.strip()}")
    return False


def sweep(args: argparse.Namespace) -> int:
    tmux_bin = os.environ.get("TMUX_BIN") or os.environ.get("HERMES_TMUX_BIN") or shutil.which("tmux")
    if not tmux_bin:
        log("ERROR: tmux not installed or not in PATH")
        return 2

    workers = load_workers(args.swarm_yaml)
    log(f"watchdog sweep: workers={len(workers)} swarm_yaml={args.swarm_yaml}")
    started = 0
    for worker in workers:
        if start_worker(
            tmux_bin,
            worker,
            args.profiles_dir,
            args.local_bin,
            args.workspace,
            args.log_dir,
            args.dry_run,
        ):
            started += 1
    log(f"watchdog sweep complete: started={started} checked={len(workers)}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Restore/watch swarm tmux sessions from swarm.yaml")
    parser.add_argument("--swarm-yaml", type=Path, default=DEFAULT_SWARM_YAML)
    parser.add_argument("--workspace", type=Path, default=DEFAULT_WORKSPACE)
    parser.add_argument("--profiles-dir", type=Path, default=DEFAULT_PROFILES_DIR)
    parser.add_argument("--local-bin", type=Path, default=DEFAULT_LOCAL_BIN)
    parser.add_argument("--log-dir", type=Path, default=DEFAULT_LOG_DIR)
    parser.add_argument("--interval", type=int, default=0, help="seconds between sweeps; 0 means one-shot")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    args.swarm_yaml = args.swarm_yaml.expanduser().resolve()
    args.workspace = args.workspace.expanduser().resolve()
    args.profiles_dir = args.profiles_dir.expanduser().resolve()
    args.local_bin = args.local_bin.expanduser().resolve()
    args.log_dir = args.log_dir.expanduser().resolve()

    if args.interval <= 0:
        return sweep(args)

    while True:
        try:
            sweep(args)
        except Exception as exc:
            log(f"ERROR sweep crashed: {exc}")
        time.sleep(args.interval)


if __name__ == "__main__":
    raise SystemExit(main())
