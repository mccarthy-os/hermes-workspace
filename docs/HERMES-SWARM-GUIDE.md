# Hermes Swarm Workers — Complete Beginner's Guide

> **Plain English guide to what swarm workers are, how they work, and how to create your own.**
> Written for someone who's never touched any of this before.

---

## Table of Contents

1. [The Big Picture — What Is a Swarm?](#1-the-big-picture--what-is-a-swarm)
2. [Default Agent vs Swarm Workers](#2-default-agent-vs-swarm-workers)
3. [The 6 Files That Make Up a Worker](#3-the-6-files-that-make-up-a-worker)
4. [Step-by-Step: Create Your First Worker](#4-step-by-step-create-your-first-worker)
5. [How Workers Actually Get Launched](#5-how-workers-actually-get-launched)
6. [How the Orchestrator Routes Tasks](#6-how-the-orchestrator-routes-tasks)
7. [What's Working Now vs What's Missing](#7-whats-working-now-vs-whats-missing)
8. [Troubleshooting](#8-troubleshooting)
9. [Quick Reference — All Workers at a Glance](#9-quick-reference--all-workers-at-a-glance)

---

## 1. The Big Picture — What Is a Swarm?

Imagine you run a small workshop. You're the **boss** (the "default agent" — this Hermes session right now). You can do any job yourself: answer questions, write code, fix things, research stuff.

But as the workshop gets busier, you want to **hire specialists** so you don't have to do everything yourself:

- A **Builder** who only writes code
- A **Reviewer** who only checks code for bugs
- A **QA Tester** who only tests things
- A **Researcher** who only looks things up
- An **Ops person** who only makes sure the servers are running

Each specialist is a **swarm worker**. They're separate Hermes agents — separate programs with their own personality, their own tools, their own knowledge. They don't chat with you directly. They sit in the background, waiting for tasks.

The **swarm** is the whole team together. The **Orchestrator** is the foreman who hands out tasks and reports back to you.

---

## 2. Default Agent vs Swarm Workers

| | **Default Agent (you)** | **Swarm Workers (Builder, Reviewer, etc.)** |
|---|---|---|
| **Who talks to?** | You directly — this conversation right here | Nobody. They talk to each other and the kanban board |
| **Can do what?** | Anything you ask — general purpose | Only their specialty (e.g. Builder only codes) |
| **Has memory?** | Yes — remembers you, your preferences, past conversations | Each worker has its OWN separate memory |
| **Has skills?** | Has all skills available | Only the skills listed in swarm.yaml |
| **Has a profile?** | Yes — `default` (active profile) | Would have their own profile under `profiles/` |
| **Does it exist right now?** | ✅ Yes — this is me! | ❌ Not yet — only designed on paper |

**Key point:** The workers are **not clones of me**. They're brand new, separate Hermes programs with their own job descriptions.

---

## 3. The 6 Files That Make Up a Worker

Each worker needs **6 things** to exist. Here they are, from most important to least:

### File #1: The Core Skill (most important)

> **Location:** `~/.hermes/skills/<worker-id>-core/SKILL.md`
> **Plain English:** This is the worker's **job description and training manual** rolled into one.

This file tells the worker:
- **Who they are** ("You are a meticulous software engineer")
- **What their job is** ("Your job is to write clean, tested code")
- **How to do their job** ("Always write tests first. Never push without review.")
- **What NOT to do** ("Never deploy. Never touch production configs.")
- **Personality** ("Be concise. Don't over-explain. Focus on the code.")

Without this file, the worker has no idea what it's supposed to do. It's the single most important piece.

**Real example of what a core skill looks like:**

```markdown
---
name: builder-core
description: "Core role definition for the Builder worker"
---

# Builder — Scoped Implementation Agent

You are the Builder, a focused software engineer.

## Your Mission
Ship working code with tests, clean diffs, and clear evidence.

## Rules
1. Always write tests first (TDD — Test Driven Development)
2. Keep diffs small — one feature or fix per PR
3. Never merge your own code — always flag for review
4. Verify the build compiles before submitting
5. If something is unclear, check GBrain or ask the Orchestrator

## Personality
- You are pragmatic, not perfectionist
- You explain your reasoning in 2-3 sentences max
- You flag risks early rather than hiding them
```

### File #2: The Profile

> **Location:** `~/.hermes/profiles/<worker-id>/config.yaml`
> **Plain English:** The worker's **ID card and uniform**.

This is a YAML config file that says:
- What **model** the worker uses (e.g. GPT-5.5, Claude, etc.)
- What **tools** it can use (terminal, file, browser, etc.)
- What **skills** to preload (the core skill + any helper skills)
- What **API keys** it uses (or uses the same ones as default)

Example:
```yaml
model:
  default: gpt-5.5
  provider: openrouter

agent:
  max_iterations: 50

enabled_toolsets:
  - terminal
  - file
  - browser
  - web
  - todo
  - session_search
  - skills
  - delegation

skills:
  - builder-core
  - test-driven-development
  - systematic-debugging
  - github-pr-workflow

terminal:
  cwd: /home/ubuntu/hermes-workspace
```

### File #3: The SOUL.md (personality)

> **Location:** `~/.hermes/profiles/<worker-id>/SOUL.md`
> **Plain English:** The worker's **voice and attitude**.

While the core skill defines WHAT the worker does, SOUL.md defines HOW it TALKS. It's all personality:

```markdown
# Builder SOUL

You are a calm, focused engineer who values clean code.
You speak plainly — no fluff, no buzzwords.
When you're unsure, you say so directly.
You never get frustrated, you just debug.
```

Without a SOUL.md, the worker uses the default Hermes personality (which is fine — SOUL is optional flair).

### File #4: The Wrapper Script

> **Location:** `~/.local/bin/<alias>`
> **Plain English:** The **launch button** for the worker.

This is a tiny shell script that lets you launch the worker from the command line. For example, `~/.local/bin/builder:task` would contain:

```bash
#!/bin/bash
exec hermes --profile builder --skills builder-core -q "$@"
```

This means typing `builder:task "write a login page"` launches Hermes with the Builder profile, loads the builder-core skill, and runs the query.

**How wrappers are named:**
- Orchestrator → `orchestrator:plan`
- Builder → `builder:task`
- Reviewer → `reviewer:gate`
- QA → `qa:smoke`
- Ops Watch → `ops:health`

The format is `<worker-id>:<mode>`. The mode tells you when to use it (e.g. `:task` for doing work, `:plan` for planning, `:health` for health checks).

### File #5: The swarm.yaml Entry

> **Location:** `/home/ubuntu/hermes-workspace/swarm.yaml`
> **Plain English:** The **team org chart**.

This is the file the Workspace Swarm page reads to show you the team. Each worker gets an entry like:

```yaml
- id: builder
  name: Builder
  role: Scoped Implementation Agent
  mission: Ship scoped code with tests
  profile: builder            # must match the profile folder name
  tools:
    - terminal
    - file
    - browser
    - web
  skills:
    - builder-core
    - test-driven-development
    - ...
  wrapper: builder:task       # must match the wrapper script name
```

This file is **already done** for all 10 workers. You can see them in the Swarm page right now.

### File #6: AGENTS.md (team rules)

> **Location:** Usually in the project folder (e.g. `/home/ubuntu/hermes-workspace/AGENTS.md`)
> **Plain English:** The **team handbook** that every worker reads.

This file defines how the team operates together. It's loaded automatically when a worker runs inside the workspace folder:

```
- Builder implements; Reviewer gates; QA verifies
- Keep swarm.yaml, profiles, core skills, and wrappers in sync
- Orchestrator enforces greenlight approval for dangerous actions
```

**This file already exists** and is shared by all workers.

---

## 4. Step-by-Step: Create Your First Worker

Let's say you want to create a **Builder** worker. Here's exactly what you'd do:

### Step 1 — Create the profile folder

```bash
mkdir -p ~/.hermes/profiles/builder
```

### Step 2 — Write the profile config.yaml

```bash
hermes config --profile builder ... set model.default gpt-5.5
```

Or just create `~/.hermes/profiles/builder/config.yaml` by hand with the settings you want.

### Step 3 — Write the core skill

Create `~/.hermes/skills/builder-core/SKILL.md` with the worker's job description (see the example in section 3 above).

### Step 4 — Write the SOUL.md (optional)

Create `~/.hermes/profiles/builder/SOUL.md` with the worker's personality.

### Step 5 — Create the wrapper script

Create `~/.local/bin/builder:task`:

```bash
#!/bin/bash
exec hermes --profile builder --skills builder-core -q "$@"
```

Then make it executable:
```bash
chmod +x ~/.local/bin/builder:task
```

### Step 6 — Update swarm.yaml (or add your new worker)

Edit `/home/ubuntu/hermes-workspace/swarm.yaml` and add your worker to the list.

### Step 7 — Launch it

```bash
# One-shot task: "build a login page"
builder:task "Create a login page with email and password fields"

# Or launch interactively:
hermes --profile builder --skills builder-core
```

**That's it.** Now you have a working Builder worker.

---

## 5. How Workers Actually Get Launched

There are **3 ways** workers start working:

### Way 1 — You launch them manually
You type `builder:task "fix the login bug"` in the terminal. It starts, does the job, outputs the result, and exits. Simple.

### Way 2 — The kanban dispatcher launches them
You create a task on the kanban board (via `/kanban create`). The board has a dispatcher that watches for new tasks. When it sees a task assigned to "builder", it automatically spawns the Builder worker, gives it the task, and waits for the result.

This is how the **swarm runs automatically** — like a conveyor belt. Tasks appear on the board, the right worker picks them up, does the work, and marks them done.

### Way 3 — The Orchestrator delegates
You tell the Orchestrator "build me a search feature". The Orchestrator breaks this into:
1. Researcher: research search libraries
2. Builder: implement the feature
3. Reviewer: review the code
4. QA: test it works

It creates kanban tasks for each, the dispatcher spawns each worker in sequence, and the Orchestrator reports back to you when everything is done.

---

## 6. How the Orchestrator Routes Tasks

The Orchestrator is just another worker — a special one that's the **foreman**. Its job is:

1. **Receive a mission** from you
2. **Decompose** it into smaller tasks (e.g. "build login page" → "design DB schema" + "write API" + "build frontend" + "test")
3. **Route** each task to the right worker on the kanban board
4. **Track progress** — check if tasks are done, blocked, or failed
5. **Report back** with a summary when everything is complete

The Orchestrator doesn't code, test, or research. It just **manages** and **routes**.

---

## 7. What's Working Now vs What's Missing

| Piece | Status | What's needed |
|---|---|---|
| **swarm.yaml** (org chart) | ✅ Done | Nothing — visible in Swarm page |
| **AGENTS.md** (team rules) | ✅ Done | Nothing — loaded automatically |
| **Kanban database** | ✅ Done | `kanban.db` exists and ready |
| **Kanban plugin** (built into Hermes) | ✅ Done | Works out of the box |
| **Default profile (you)** | ✅ Done | This conversation |
| **Profiles** (orchestrator, builder, etc.) | ❌ Don't exist | Need `mkdir ~/.hermes/profiles/<id>/` + `config.yaml` |
| **Core skills** (builder-core, etc.) | ❌ Don't exist | Need `~/.hermes/skills/<id>-core/SKILL.md` written |
| **Wrapper scripts** (builder:task, etc.) | ❌ Don't exist | Need shell scripts created in `~/.local/bin/` |
| **Worker actually running** | ❌ Not yet | Need all of the above first |

---

## 8. Troubleshooting

### Problem: I can see workers in the Swarm page but they don't do anything
**Fix:** That's normal. The Swarm page shows the org chart (swarm.yaml). Workers don't actually run until you create their profiles and core skills. See section 4.

### Problem: `builder:task` command not found
**Fix:** The wrapper script doesn't exist yet. You need to create `~/.local/bin/builder:task` and make it executable.

### Problem: I created a profile but `hermes --profile builder` gives an error
**Fix:** Check that `~/.hermes/profiles/builder/` exists and has a `config.yaml` file inside it.

### Problem: The kanban board shows tasks but nobody picks them up
**Fix:** The kanban dispatcher needs to be running. You can enable it with:
```bash
hermes config set kanban.dispatch_in_gateway true
```
Then restart the gateway:
```bash
hermes gateway restart
```

### Problem: A worker doesn't have the tools I expected
**Fix:** Edit the worker's `config.yaml` and add/remove tools in the `enabled_toolsets` section, or update `swarm.yaml`. Both need to match.

### Problem: The worker ignores its core skill
**Fix:** Make sure the skill name in `swarm.yaml` matches the actual skill folder name. Skills live in `~/.hermes/skills/<name>/SKILL.md`. Run `hermes skills list` to check it's installed.

### Problem: How do I see what a worker is doing?
**Fix:** Workers don't chat with you directly. Check the kanban board (`/kanban list`) for task status, or check `~/.hermes/logs/agent.log` for their output.

### Problem: I changed swarm.yaml but the Swarm page didn't update
**Fix:** The Swarm page reads the file when it loads. Refresh your browser. If it still shows old data, check the file syntax — YAML is picky about indentation.

---

## 9. Quick Reference — All Workers at a Glance

| Worker | Job | What they do | Profile folder | Core skill | Wrapper |
|---|---|---|---|---|---|
| **orchestrator** | Foreman | Break missions into tasks, route to workers, get your approval | `profiles/orchestrator/` | `orchestrator-core` | `orchestrator:plan` |
| **km-agent** | Librarian | Keep knowledge organized and up to date | `profiles/km-agent/` | `km-agent-core` | `km:health` |
| **builder** | Craftsman | Write code, fix bugs, ship features | `profiles/builder/` | `builder-core` | `builder:task` |
| **reviewer** | Inspector | Check code for bugs and security holes | `profiles/reviewer/` | `reviewer-core` | `reviewer:gate` |
| **qa** | Tester | Click around, run tests, write bug reports | `profiles/qa/` | `qa-core` | `qa:smoke` |
| **researcher** | Researcher | Look things up, read articles, summarize | `profiles/researcher/` | `researcher-core` | `researcher:quick` |
| **ops-watch** | Sysadmin | Check servers are running, restart if down | `profiles/ops-watch/` | `ops-watch-core` | `ops:health` |
| **maintainer** | Maintenance | Update dependencies, keep code fresh | `profiles/maintainer/` | `maintainer-core` | `maintainer:check` |
| **strategist** | Advisor | Help plan big decisions, weigh options | `profiles/strategist/` | `strategist-core` | `strategist:review` |
| **inbox-triage** | Assistant | Sort incoming stuff — keep, discard, or route | `profiles/inbox-triage/` | `inbox-triage-core` | `inbox:triage` |

---

## Summary — The Mental Model

Think of it like a **restaurant kitchen**:

| Concept | Kitchen analogy |
|---|---|
| **You (default agent)** | The head chef who can cook anything |
| **A worker profile** | A station (grill, salad, pastry) with its own setup |
| **Core skill** | The recipe book for that station |
| **SOUL.md** | The station chef's attitude (calm, intense, chatty) |
| **Wrapper script** | The bell that summons the station chef |
| **swarm.yaml** | The menu board showing what each station does |
| **AGENTS.md** | The kitchen rule book (don't leave raw meat out) |
| **Kanban board** | The ticket rail where orders hang |
| **Orchestrator** | The sous chef who reads the order, rips tickets, calls "order fire" |
| **Kanban dispatcher** | The automatic system that pulls tickets off the rail |

**Right now you have:** a menu board (swarm.yaml), kitchen rules (AGENTS.md), and a ticket rail (kanban). You need to set up the actual stations (profiles), write the recipes (core skills), and hang the bells (wrappers) before any food gets cooked.

---

> **Document created:** May 26, 2026 — by Hermes default agent
> **Next read this if:** You want to understand the swarm workers, create a new one, or fix one that's not working.
