# AIA - AI Architecture Assistant

CLI tool that orchestrates AI-assisted development workflows using a `.aia` folder convention.

AIA structures your feature development into steps (brief, spec, tech-spec, dev-plan, implement, etc.), builds rich prompts from project context and knowledge files, and delegates execution to AI CLI tools (Claude Code, Codex CLI, Gemini CLI) with weighted random model selection.

## Table of contents

- [Quick start](#quick-start)
- [Prerequisites](#prerequisites)
- [Commands](#commands)
- [Integrate into an existing project](#integrate-into-an-existing-project)
- [Web UI](#web-ui)
- [Epic & Product Management](#epic--product-management)
- [Feature workflow](#feature-workflow)
- [Prompt assembly](#prompt-assembly)
- [Project structure](#project-structure)
- [Dependencies](#dependencies)
- [AI Models Configuration](#ai-models-configuration)
- [Worktrunk Integration](#worktrunk-integration)

## Quick start

```bash
npm install -g @bamptee/aia-code
aia init
aia feature session-replay
aia next session-replay "Record and replay user sessions for debugging"
```

## Prerequisites

AIA delegates to AI CLI tools. Install the ones you need:

| Provider | CLI | Install |
|----------|-----|---------|
| Anthropic | `claude` (Claude Code) | `npm install -g @anthropic-ai/claude-code` |
| OpenAI | `codex` (Codex CLI) | `npm install -g @openai/codex` |
| Google | `gemini` (Gemini CLI) | `npm install -g @google/gemini-cli` |

Each CLI manages its own authentication. Run `claude`, `codex`, or `gemini` once to log in before using AIA.

## Commands

| Command | Description |
|---------|-------------|
| `aia init` | Create `.aia/` folder structure and default config |
| `aia feature <name>` | Create a new feature workspace |
| `aia run <step> <feature> [description]` | Execute a step for a feature |
| `aia next <feature> [description]` | Run the next pending step automatically |
| `aia status <feature>` | Show the current status of a feature |
| `aia reset <step> <feature>` | Reset a step to pending so it can be re-run |
| `aia iterate <step> <feature> <instructions>` | Re-run a step with additional instructions to refine the output |
| `aia quick <name> [description]` | Quick story/ticket: dev-plan → implement → review only |
| `aia repo scan` | Scan codebase and generate `repo-map.json` |
| `aia ui` | Launch the local web UI to manage features and config |

### Options for `run`, `next`, `quick`, and `iterate`

| Flag | Description |
|------|-------------|
| `-v, --verbose` | Show CLI logs in real-time (thinking, tool use, file reads) |
| `-a, --apply` | Let the AI edit and create files in the project (agent mode) |

The `implement` step forces `--apply` automatically.

## Integrate into an existing project

### 1. Install

```bash
npm install -g @bamptee/aia-code
```

Or as a dev dependency:

```bash
cd your-project
npm install --save-dev @bamptee/aia-code
```

### 2. Initialize

```bash
aia init
```

This creates:

```
your-project/
  .aia/
    config.yaml
    context/
    knowledge/
    prompts/
    features/
    logs/
```

### 3. Write context files

These files describe your project to the AI. They are injected into every prompt.

```markdown
<!-- .aia/context/project.md -->
# Project
E-commerce SaaS platform built with Node.js and MongoDB.
Stack: Express, React, Redis, PostgreSQL.
```

```markdown
<!-- .aia/context/architecture.md -->
# Architecture
Microservices communicating via RabbitMQ.
API gateway with JWT auth.
```

Reference them in `config.yaml`:

```yaml
context_files:
  - context/project.md
  - context/architecture.md
```

### 4. Write knowledge files

Knowledge files contain reusable technical guidelines, organized by category.

```
.aia/knowledge/
  backend/
    nodejs.md          # Node.js patterns and conventions
    mongo-patterns.md  # MongoDB query patterns
    api-design.md      # REST API guidelines
  frontend/
    react-patterns.md  # React component patterns
```

Set the default knowledge categories in `config.yaml`:

```yaml
knowledge_default:
  - backend
```

Each feature can override this via its `status.yaml` `knowledge` field.

### 5. Write prompt templates

One template per step, stored in `.aia/prompts/`:

```markdown
<!-- .aia/prompts/brief.md -->
Write a product brief for this feature.
Include: problem statement, target users, success metrics.
```

```markdown
<!-- .aia/prompts/implement.md -->
Implement the feature following the dev-plan.
Create all necessary files (controllers, services, models, routes, tests).
Follow the project conventions from the context and knowledge files.
```

Required templates (one per step you want to run):

```
.aia/prompts/brief.md
.aia/prompts/ba-spec.md
.aia/prompts/questions.md
.aia/prompts/tech-spec.md
.aia/prompts/challenge.md
.aia/prompts/dev-plan.md
.aia/prompts/implement.md
.aia/prompts/review.md
```

### 6. Configuration (user + project)

AIA uses two configuration files:

| File | Scope | Content |
|------|-------|---------|
| `~/.aia/config.yaml` | **User (global)** | user_name, communication_language |
| `.aia/config.yaml` | **Project** | projectName, document_output_language, models, knowledge_default, context_files |

When you run AIA, both configs are merged (user preferences + project config).

#### User config (`~/.aia/config.yaml`)

Your personal preferences, created automatically on first use:

```yaml
# ~/.aia/config.yaml
user_name: John Doe
communication_language: French
```

- **user_name**: Your name (shown to the AI for context)
- **communication_language**: Language for AI responses and questions

These are stored outside the project, so they're never committed to git.

#### Project config (`.aia/config.yaml`)

Shared project settings:

```yaml
# .aia/config.yaml
projectName: My Project
document_output_language: English
models:
  # ...
```

- **document_output_language**: Language for generated documents (specs, plans, etc.) - shared by the whole team

#### .gitignore recommendation

User preferences are stored in `~/.aia/config.yaml` (outside the project), so nothing extra is needed in `.gitignore`.

If you want to ignore local project overrides, add to your `.gitignore`:

```gitignore
# AIA - ignore local overrides
.aia/local.yaml
```

### 7. Configure models (project config)

In `config.yaml`, assign models to steps with probability weights:

```yaml
models:
  brief:
    - model: claude-default
      weight: 1

  questions:
    - model: claude-default
      weight: 0.5
    - model: openai-default
      weight: 0.5

  tech-spec:
    - model: gpt-4.1
      weight: 0.6
    - model: gemini-2.5-pro
      weight: 0.4

  implement:
    - model: claude-default
      weight: 1
```

Weights don't need to sum to 1 -- they are normalized at runtime.

#### Model aliases

Use aliases to delegate to the CLI's default model:

| Alias | CLI used |
|-------|----------|
| `claude-default` | `claude` (uses whatever model is configured in Claude Code) |
| `openai-default` | `codex` (uses whatever model is configured in Codex CLI) |
| `codex-default` | `codex` (same as above) |
| `gemini-default` | `gemini` (uses whatever model is configured in Gemini CLI) |

#### Specific models

| Prefix | CLI | Examples |
|--------|-----|----------|
| `claude-*` | `claude -p --model` | `claude-sonnet-4-6`, `claude-opus-4-6` |
| `gpt-*`, `o[0-9]*` | `codex exec` | `gpt-4.1`, `o3`, `o4-mini` |
| `gemini-*` | `gemini` | `gemini-2.5-pro`, `gemini-2.5-flash` |

### 8. Run the feature pipeline

#### Step by step

```bash
aia feature session-replay
aia run brief session-replay "Record and replay user sessions"
aia status session-replay
aia run ba-spec session-replay
aia run tech-spec session-replay
```

#### Initial specs (`init.md`)

When you create a feature, AIA generates an `init.md` file. Edit it to add your initial specs, requirements, and constraints -- this content is injected into **every step** as context:

```bash
aia feature session-replay
# Edit .aia/features/session-replay/init.md with your specs
aia next session-replay
```

```markdown
<!-- .aia/features/session-replay/init.md -->
# session-replay

## Description
Record and replay user sessions for debugging.

## Existing specs
- Capture DOM snapshots every 500ms
- Record network requests and console logs
- Max session duration: 30 minutes

## Constraints
- Must work with our existing React 18 + Express stack
- Storage budget: max 5MB per session
```

#### Using `next` (recommended)

`next` automatically picks the next pending step:

```bash
aia feature session-replay
aia next session-replay "Record and replay user sessions"   # -> brief
aia next session-replay                                      # -> ba-spec
aia next session-replay                                      # -> questions
aia next session-replay                                      # -> tech-spec
aia next session-replay                                      # -> challenge
aia next session-replay                                      # -> dev-plan
aia next session-replay                                      # -> implement (auto --apply)
aia next session-replay                                      # -> review
```

#### Description parameter

Pass a short description in quotes to give context to the AI. Especially useful for the `brief` step:

```bash
aia run brief session-replay "Record DOM + network requests, replay for debugging"
aia next session-replay "Capture DOM snapshots, max 30 min sessions"
```

#### Re-running a step

When you re-run a step, the previous output is fed back as context so the AI can improve it:

```bash
aia reset tech-spec session-replay
aia run tech-spec session-replay "Add WebSocket support and rate limiting"
```

#### Iterating on a step

Use `aia iterate` to refine a completed step with specific instructions. It resets the step, feeds back the previous output, and applies your instructions in a single command:

```bash
aia iterate tech-spec session-replay "Add error handling for WebSocket disconnections"
aia iterate brief session-replay "Focus more on mobile use cases"
aia iterate dev-plan session-replay "Split the implementation into smaller PRs" -v
```

You can iterate multiple times — each run builds on the previous output.

#### Quick mode (stories & tickets)

For small stories or tickets that don't need the full 8-step pipeline, use `aia quick`. It skips brief, ba-spec, questions, tech-spec, and challenge, and runs only **dev-plan → implement → review**:

```bash
# Create feature + run 3 steps in sequence
aia quick fix-login-bug "Fix the login timeout issue on mobile"

# Or create the feature first, edit init.md, then run
aia feature fix-login-bug
# Edit .aia/features/fix-login-bug/init.md with details
aia quick fix-login-bug
```

The `init.md` file serves as the sole input context for the dev-plan step. Verbose and apply flags work the same way:

```bash
aia quick add-rate-limit "Add rate limiting to the /api/upload endpoint" -v
```

### 9. Print mode vs Agent mode

By default, AIA runs in **print mode** -- the AI generates text (specs, plans, reviews) saved to `.md` files.

With `--apply`, AIA runs in **agent mode** -- the AI can edit and create files in your project, just like running `claude` or `codex` directly.

```bash
# Print mode (default) -- generates a document
aia run tech-spec session-replay

# Agent mode -- AI writes code in your project
aia run dev-plan session-replay --apply

# Verbose -- see thinking, tool calls, file operations in real-time
aia run dev-plan session-replay -av
```

The `implement` step always runs in agent mode automatically.

| Mode | Timeout | What the AI can do |
|------|---------|-------------------|
| Print (default) | 3 min idle | Generate text only |
| Agent (`--apply`) | 10 min idle | Edit files, run commands, create code |

Idle timeout resets every time the CLI produces output, so long-running steps that stream continuously won't time out.

### 10. Scan your repo

```bash
aia repo scan
```

Generates `.aia/repo-map.json` -- a categorized index of your source files (services, models, routes, controllers, middleware, utils, config). Useful as additional context for prompts.

## Web UI

Launch the local web interface to manage features visually:

```bash
aia ui
# Opens http://localhost:3000
```

### Dashboard

- View all features with their current step and progress
- Create new features
- Delete features
- Quick access to run next step

### Feature detail

- Execute steps with real-time log streaming (SSE)
- View step outputs (specs, plans, code)
- Reset steps to re-run them
- Edit `init.md` directly in the UI

### Integrated terminal

The UI includes a full terminal emulator (xterm.js + node-pty). Open a shell directly in your project directory without leaving the browser.

### Config editor

Edit your `.aia/config.yaml` directly in the UI with syntax highlighting and validation.

## Epic & Product Management

AIA includes a complete product management system for organizing work into Epics and Stories, with QA workflows and roadmap planning.

### Concepts

| Concept | Description |
|---------|-------------|
| **Epic** | Large initiative grouping multiple stories (e.g., "User Authentication", "Payment System") |
| **Story** | Individual work item (feature or bug) with a defined workflow |
| **Space** | Workflow phase: `experimentation` (idea validation) or `development` (implementation) |
| **QA** | Approval workflow for stories in testing status |
| **Roadmap** | Visual planning of Epics by time period (weekly, monthly, quarterly) |

### CLI Commands

```bash
# Epic management
aia epic list                           # List all epics
aia epic create "Epic Name"             # Create a new epic
aia epic show <epic-id>                 # Show epic details
aia epic update <epic-id> --status active   # Update epic status

# Story management
aia story list                          # List all stories
aia story create <epic-id> "Story Title" --type feature   # Create story
aia story show <story-id>               # Show story details
aia story promote <story-id>            # Move from experimentation to development
aia story move <story-id> <target-epic-id>  # Move to different epic

# QA workflow
aia qa queue                            # List stories in testing
aia qa approve <story-id>               # Approve story (moves to done)
aia qa reject <story-id> "Reason"       # Reject with reason (creates linked bug)

# Roadmap
aia roadmap show                        # Show roadmap
aia roadmap assign <epic-id> 2026-Q2    # Assign epic to period
aia roadmap stats                       # Show planning statistics

# System
aia system diagnose                     # Check system health
aia system migrate                      # Run data migrations
```

### Web UI

The Epic system is fully integrated into the Web UI with dedicated views:

#### Epic Dashboard (`#/epics`)

- View all Epics with status and progress
- Create new Epics
- Filter by status (Draft, Active, Done)
- View stories grouped by Epic

#### Epic Detail (`#/epics/:id`)

- Full Epic details with story list
- Create and manage stories
- Track progress across spaces (Experimentation/Development)
- Status management and archiving

#### Story Detail (`#/stories/:id`)

- Step completion tracking (Brief, BA Spec, Questions)
- Status flow visualization
- Promote from experimentation to development
- Move between Epics
- QA history

#### Roadmap (`#/roadmap`)

- Visual timeline with drag-and-drop
- Granularity toggle (Weekly, Monthly, Quarterly)
- Backlog section for unplanned Epics
- Progress indicators per period

#### QA Dashboard (`#/qa`)

- Testing queue with approval/rejection workflow
- One-click approve or reject with reason
- Automatic bug creation on rejection
- Activity statistics

### Story Workflow

Stories follow a structured workflow through spaces and statuses:

```
EXPERIMENTATION SPACE                DEVELOPMENT SPACE
┌─────────────────────────┐         ┌─────────────────────────────────────┐
│  draft → in_progress   │  ──→    │  ready_for_dev → in_progress →     │
│         ↓              │ promote │                    testing → done   │
│   (complete steps)     │         │                                     │
└─────────────────────────┘         └─────────────────────────────────────┘
```

**Experimentation Steps:**
1. **Brief** - Product brief describing the feature
2. **BA Spec** - Business analysis specification
3. **Questions** - Clarifying questions for requirements

To promote a story to development, all steps must be completed or explicitly skipped.

### QA Workflow

When a story reaches `testing` status:

1. **Approve** - Story moves to `done`
2. **Reject** - Story returns to `in_progress`, a linked bug is automatically created

The QA history is preserved on each story, showing all approval/rejection actions.

### Data Storage

Epic data is stored in `.aia/epics/` as JSON files:

```
.aia/
├── epics/
│   ├── general.json      # General epic for unassigned stories
│   ├── epic-abc123.json  # Epic with embedded stories
│   └── index.json        # Story-to-Epic lookup index
```

All data is Git-tracked for version control and collaboration.

### API Endpoints

The Epic system exposes a REST API:

```
# Epics
GET    /api/epics                    # List epics
POST   /api/epics                    # Create epic
GET    /api/epics/:id                # Get epic
PATCH  /api/epics/:id                # Update epic
DELETE /api/epics/:id                # Delete epic

# Stories
GET    /api/stories                  # List stories (with filters)
POST   /api/epics/:epicId/stories    # Create story in epic
GET    /api/stories/:id              # Get story
PATCH  /api/stories/:id              # Update story
DELETE /api/stories/:id              # Delete story
POST   /api/stories/:id/promote      # Promote to development
POST   /api/stories/:id/move         # Move to different epic
PATCH  /api/stories/:id/steps/:step  # Update step completion

# QA
GET    /api/qa/queue                 # Get testing queue
GET    /api/qa/stats                 # Get QA statistics
POST   /api/qa/:storyId/approve      # Approve story
POST   /api/qa/:storyId/reject       # Reject story

# Roadmap
GET    /api/roadmap                  # Get roadmap data
GET    /api/roadmap/stats            # Get roadmap statistics
POST   /api/roadmap/epics/:id/assign # Assign epic to period
POST   /api/roadmap/epics/:id/unassign # Remove period assignment

# System
GET    /api/epic-system/diagnose     # System diagnostics
POST   /api/epic-system/migrate      # Run migrations
```

## Feature workflow

Each feature follows a fixed pipeline of 8 steps:

```
brief -> ba-spec -> questions -> tech-spec -> challenge -> dev-plan -> implement -> review
```

| Step | Purpose | Mode |
|------|---------|------|
| `brief` | Product brief from a short description | print |
| `ba-spec` | Business analysis specification | print |
| `questions` | Questions to clarify requirements | print |
| `tech-spec` | Technical specification (models, APIs, architecture) | print |
| `challenge` | Challenge the spec, find gaps and risks | print |
| `dev-plan` | Step-by-step implementation plan | print |
| `implement` | Write the actual code | **agent (auto)** |
| `review` | Code review of the implementation | print |

`status.yaml` tracks progress:

```yaml
feature: session-replay
current_step: implement
steps:
  brief: done
  ba-spec: done
  questions: done
  tech-spec: done
  challenge: done
  dev-plan: done
  implement: pending
  review: pending
knowledge:
  - backend
```

## Prompt assembly

When you run a step, the prompt is built from up to 7 sections:

```
=== DESCRIPTION ===
(optional -- short description passed via CLI argument)

=== CONTEXT ===
(content of context files from config.yaml)

=== KNOWLEDGE ===
(all .md files from the knowledge categories)

=== INITIAL SPECS ===
(content of init.md -- your initial specs and requirements)

=== FEATURE ===
(outputs of all prior steps for this feature)

=== PREVIOUS OUTPUT ===
(if re-running -- previous version of this step, for the AI to improve)

=== TASK ===
(content of prompts/<step>.md)
```

The full prompt is piped to the CLI tool via stdin, so there are no argument length limits.

## Project structure

```
bin/
  aia.js                    # CLI entrypoint
src/
  cli.js                    # Commander program, registers commands
  constants.js              # Shared constants (dirs, steps, icons)
  models.js                 # Config loader + validation, weighted model selection
  logger.js                 # Execution log writer
  knowledge-loader.js       # Recursive markdown loader by category
  prompt-builder.js         # Assembles full prompt from all sources
  utils.js                  # Shared filesystem helpers
  commands/
    init.js                 # aia init
    feature.js              # aia feature <name>
    run.js                  # aia run <step> <feature>
    next.js                 # aia next <feature>
    iterate.js              # aia iterate <step> <feature> <instructions>
    quick.js                # aia quick <name> [description]
    status.js               # aia status <feature>
    reset.js                # aia reset <step> <feature>
    repo.js                 # aia repo scan
    ui.js                   # aia ui
  providers/
    registry.js             # Model name + aliases -> provider routing
    cli-runner.js           # Shared CLI spawn (streaming, idle timeout, verbose)
    openai.js               # codex exec
    anthropic.js            # claude -p
    gemini.js               # gemini
  services/
    scaffold.js             # .aia/ folder creation
    config.js               # Default config generation
    feature.js              # Feature workspace creation + validation
    status.js               # status.yaml read/write/reset
    runner.js               # Step execution orchestrator
    model-call.js           # Provider dispatch
    repo-scan.js            # Codebase scanner + categorizer
    agent-sessions.js       # Real-time agent session tracking (SSE)
    apps.js                 # Monorepo app/submodule detection
    worktrunk.js            # Worktrunk git worktree integration
  types/
    test-quick.js           # Type definitions and validators
  ui/
    server.js               # Express server for web UI
    router.js               # API route registration
    api/
      features.js           # Feature CRUD + step execution
      config.js             # Config read/write endpoints
      worktrunk.js          # Worktree management endpoints
      logs.js               # Log streaming
    public/
      index.html            # SPA entry point
      main.js               # App initialization
      components/
        dashboard.js        # Feature list + status overview
        feature-detail.js   # Step execution + outputs
        config-view.js      # Config editor
        terminal.js         # Integrated xterm terminal
        worktrunk-panel.js  # Worktree management UI
```

## Dependencies

Runtime dependencies:

| Package | Purpose |
|---------|---------|
| `commander` | CLI framework |
| `yaml` | YAML parse/stringify |
| `fs-extra` | Filesystem utilities |
| `chalk` | Terminal colors |
| `@iarna/toml` | TOML parsing (for `wt.toml`) |
| `ws` | WebSocket server (UI real-time updates) |
| `node-pty` | Pseudo-terminal (UI integrated terminal) |
| `xterm` + `xterm-addon-fit` | Terminal emulator (UI) |
| `busboy` | Multipart form parsing |

AI calls use `child_process.spawn` to delegate to installed CLI tools. No API keys needed -- each CLI manages its own authentication.

## AI Models Configuration

AIA supports granular model selection per step. You control which AI model runs at each stage of the workflow across all three supported providers.

### Supported providers

AIA delegates to AI CLI tools. Each provider has its own CLI binary:

| Provider | CLI tool | Model prefix | Auto-detect |
|----------|----------|-------------|-------------|
| Anthropic | `claude` (Claude Code) | `claude-*` | `claude-sonnet-4-6`, `claude-opus-4-6`, etc. |
| OpenAI | `codex` (Codex CLI) | `gpt-*`, `o*` | `gpt-4.1`, `o3`, `o4-mini`, etc. |
| Google | `gemini` (Gemini CLI) | `gemini-*` | `gemini-2.5-pro`, `gemini-2.5-flash`, etc. |

Any model ID matching these prefixes is automatically routed to the right CLI. You can use any model your CLI supports — AIA does not restrict model IDs.

### Declaring available models

In `.aia/config.yaml`, declare the models you have access to. Each user configures their own list based on their CLI access:

```yaml
available_models:
  # Anthropic — CLI: claude
  - id: claude-default
    label: "Auto (Claude CLI default)"
    provider: anthropic
  - id: claude-opus-4-6
    label: "Claude Opus 4.6"
    provider: anthropic
  - id: claude-sonnet-4-6
    label: "Claude Sonnet 4.6"
    provider: anthropic
  # OpenAI — CLI: codex
  - id: codex-default
    label: "Auto (Codex CLI default)"
    provider: openai
  # Add your Codex models here, e.g.:
  # - id: gpt-4.1
  #   label: "GPT-4.1"
  #   provider: openai
  # Google — CLI: gemini
  - id: gemini-default
    label: "Auto (Gemini CLI default)"
    provider: gemini
  - id: gemini-2.5-pro
    label: "Gemini 2.5 Pro"
    provider: gemini
  - id: gemini-2.5-flash
    label: "Gemini 2.5 Flash"
    provider: gemini
```

These models appear in the UI dropdown for each step, grouped by provider. You can also type any model ID directly using the "Custom..." option — the provider is auto-detected from the model name prefix.

> **Tip:** Run `claude --help`, `codex --help`, or `gemini --help` to see which models your CLI supports. Model IDs evolve frequently — check your provider's docs for the latest.

### Assigning models per step

Use the `models` section to configure which model runs by default for each step. You can mix providers:

```yaml
models:
  init:
    - model: claude-opus-4-6
      weight: 1
  brainstorming:
    - model: gemini-2.5-flash
      weight: 1
  spec-func:
    - model: claude-sonnet-4-6
      weight: 0.5
    - model: gemini-2.5-pro
      weight: 0.5
  implement:
    - model: claude-opus-4-6
      weight: 1
  review:
    - model: codex-default
      weight: 1
```

The `weight` field enables weighted random selection if you list multiple models per step (useful for A/B testing between providers). With a single model per step and `weight: 1`, selection is deterministic.

### Default aliases

| Alias | CLI | Meaning |
|-------|-----|---------|
| `claude-default` | `claude` | Uses whatever model your Claude Code CLI is configured to use (no `--model` flag) |
| `codex-default` | `codex` | Uses whatever model your Codex CLI is configured to use |
| `openai-default` | `codex` | Same as `codex-default` (alias for backward compatibility) |
| `gemini-default` | `gemini` | Uses whatever model your Gemini CLI is configured to use |

These "Auto" aliases are convenient but opaque — you won't know which model actually ran. For reproducibility, prefer explicit model IDs.

### Model fallback chain

When no model is explicitly selected in the UI, AIA resolves the model in this order:

1. **UI selection** — model selected by the user in the dropdown for this specific call
2. **Step config** — default model configured for the current step (`config.models[step][0]`)
3. **Init fallback** — model configured for the init step (`config.models.init[0]`)
4. **Ultimate fallback** — `claude-default` (Claude Code CLI default)

This chain is applied consistently across all endpoints (generate, iterate, chat, start-chat, recap).

### Effort level

The effort level (high/medium/low) depends on your CLI settings, not on AIA. Each CLI manages this independently:

- **Claude Code**: configured via `claude config` or `--effort` flag
- **Codex CLI**: configured via Codex settings
- **Gemini CLI**: configured via Gemini settings

AIA does not control this parameter. If your Claude Code is configured with high effort, all Claude calls from AIA will use high effort.

### Recommendations

The best model depends on your provider access and budget. Here are general guidelines by step type:

| Step type | Recommendation | Why |
|-----------|---------------|-----|
| `init`, `spec-func`, `spec-tech`, `dev-plan`, `implement` | Most capable model (e.g. Claude Opus, Gemini Pro) | Complex generation requiring deep reasoning |
| `brainstorming`, `review`, `chat` | Faster/cheaper model (e.g. Claude Sonnet, Gemini Flash) | Analysis and discussion, lower cost |

You can also mix providers per step — for example, use Claude for implementation and Gemini for review to get different perspectives.

## Worktrunk Integration

AIA integrates with [Worktrunk](https://github.com/bamptee/worktrunk) (`wt`) to create isolated development environments for each feature using git worktrees.

### Why Worktrunk?

- **Isolation**: Each feature gets its own directory and branch, no stashing needed
- **Services**: Run separate Docker containers per feature (database, cache, etc.)
- **Parallel work**: Work on multiple features simultaneously without conflicts
- **Clean state**: Delete the worktree when done, main branch stays untouched

### Installation

```bash
# Install Worktrunk CLI
cargo install worktrunk

# Verify installation
wt --version
```

### Quick Start

```bash
# In the AIA UI, click "Create Worktree" on any feature
# Or via CLI:
wt switch -c feature/my-feature
```

### Configuration

Create `wt.toml` at the root of your project:

```toml
# wt.toml - Worktrunk configuration

[worktree]
# Directory where worktrees are created (relative to repo root)
# Default: "../<repo-name>-wt"
base_path = "../my-project-wt"

# Branch prefix for feature worktrees
# AIA uses "feature/" by default
branch_prefix = "feature/"

[hooks]
# Hooks run automatically when creating/removing worktrees
# Available hooks: post_create, pre_remove, post_remove

# Run after worktree is created
post_create = [
    "cp .env.example .env",
    "docker-compose -f docker-compose.wt.yml up -d",
    "npm install",
]

# Run before worktree is removed
pre_remove = [
    "docker-compose -f docker-compose.wt.yml down -v",
]
```

### Docker Services per Feature

Create `docker-compose.wt.yml` for services that should run in each worktree:

```yaml
# docker-compose.wt.yml - Services for isolated development

version: '3.8'

# Use environment variable for unique container names
# WT_BRANCH is set by worktrunk (e.g., "feature-my-feature")
x-branch: &branch ${WT_BRANCH:-dev}

services:
  postgres:
    image: postgres:16-alpine
    container_name: ${WT_BRANCH:-dev}-postgres
    environment:
      POSTGRES_DB: myapp_dev
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports:
      - "${DB_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: ${WT_BRANCH:-dev}-redis
    ports:
      - "${REDIS_PORT:-6379}:6379"

  mailhog:
    image: mailhog/mailhog
    container_name: ${WT_BRANCH:-dev}-mailhog
    ports:
      - "${MAIL_UI_PORT:-8025}:8025"
      - "${MAIL_SMTP_PORT:-1025}:1025"

volumes:
  postgres_data:
    name: ${WT_BRANCH:-dev}-postgres-data
```

### Port Management

To avoid port conflicts between worktrees, use a `.env` file with dynamic ports:

```bash
# .env.example - Copy to .env in each worktree

# Each worktree should use different ports
# Tip: Use feature hash or manual assignment
DB_PORT=5432
REDIS_PORT=6379
MAIL_UI_PORT=8025
MAIL_SMTP_PORT=1025
```

Or use a hook to auto-assign ports:

```toml
# wt.toml
[hooks]
post_create = [
    # Generate random ports based on branch name hash
    '''
    HASH=$(echo "$WT_BRANCH" | md5sum | cut -c1-4)
    PORT_OFFSET=$((16#$HASH % 1000))
    cat > .env << EOF
    DB_PORT=$((5432 + PORT_OFFSET))
    REDIS_PORT=$((6379 + PORT_OFFSET))
    MAIL_UI_PORT=$((8025 + PORT_OFFSET))
    EOF
    ''',
    "docker-compose -f docker-compose.wt.yml up -d",
]
```

### Full Example Setup

Here's a complete setup for a Node.js project with PostgreSQL, Redis, and S3 (MinIO):

```
my-project/
├── wt.toml                    # Worktrunk config
├── docker-compose.wt.yml      # Services template
├── .env.example               # Environment template
├── scripts/
│   └── setup-worktree.sh      # Custom setup script
└── .aia/
    └── features/
        └── my-feature/
```

**wt.toml**:
```toml
[worktree]
base_path = "../my-project-wt"

[hooks]
post_create = [
    "bash scripts/setup-worktree.sh",
]

pre_remove = [
    "docker-compose -f docker-compose.wt.yml down -v --remove-orphans",
]
```

**scripts/setup-worktree.sh**:
```bash
#!/bin/bash
set -e

echo "🔧 Setting up worktree: $WT_BRANCH"

# Copy environment template
cp .env.example .env

# Generate unique ports based on branch
HASH=$(echo "$WT_BRANCH" | md5sum | cut -c1-4)
OFFSET=$((16#$HASH % 900 + 100))

sed -i "s/DB_PORT=.*/DB_PORT=$((5000 + OFFSET))/" .env
sed -i "s/REDIS_PORT=.*/REDIS_PORT=$((6000 + OFFSET))/" .env
sed -i "s/MINIO_PORT=.*/MINIO_PORT=$((9000 + OFFSET))/" .env
sed -i "s/APP_PORT=.*/APP_PORT=$((3000 + OFFSET))/" .env

echo "📦 Starting Docker services..."
docker-compose -f docker-compose.wt.yml up -d

echo "📚 Installing dependencies..."
npm install

echo "🗃️ Running migrations..."
npm run db:migrate

echo "✅ Worktree ready!"
echo "   App:      http://localhost:$((3000 + OFFSET))"
echo "   Database: localhost:$((5000 + OFFSET))"
```

**docker-compose.wt.yml**:
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: ${WT_BRANCH:-dev}-postgres
    environment:
      POSTGRES_DB: app_dev
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports:
      - "${DB_PORT:-5432}:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dev"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: ${WT_BRANCH:-dev}-redis
    ports:
      - "${REDIS_PORT:-6379}:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio
    container_name: ${WT_BRANCH:-dev}-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "${MINIO_PORT:-9000}:9000"
      - "${MINIO_CONSOLE_PORT:-9001}:9001"
    volumes:
      - minio_data:/data

volumes:
  pg_data:
    name: ${WT_BRANCH:-dev}-pg-data
  minio_data:
    name: ${WT_BRANCH:-dev}-minio-data
```

### Using Worktrunk in AIA UI

1. **Create a feature**: `aia feature my-feature` or via UI
2. **Open the feature** in the UI
3. **Click "Create Worktree"** in the Worktrunk panel
   - Runs `wt switch -c feature/my-feature`
   - Executes `post_create` hooks (Docker services, npm install, etc.)
4. **Open Terminal** to work in the worktree directory
5. **View Docker Containers** directly in the UI
   - Start/Stop individual containers
   - Open a shell inside any running container
6. **When done**: Click "Remove" to clean up
   - Runs `pre_remove` hooks (docker-compose down)
   - Removes the worktree directory

### Troubleshooting

**"Worktrunk not installed"**
```bash
cargo install worktrunk
# Make sure ~/.cargo/bin is in your PATH
```

**Containers not showing in UI**
- Containers must have names matching pattern: `feature-<name>-*`
- Check Docker is running: `docker ps`
- Click "Refresh Containers" in the UI

**Port conflicts**
- Each worktree needs unique ports
- Use the port auto-assignment hook above
- Or manually set ports in `.env` per worktree

**Worktree creation fails**
```bash
# Check git status - uncommitted changes can block
git status

# Manual worktree creation
wt switch -c feature/my-feature --force
```
