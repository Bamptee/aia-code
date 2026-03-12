# AIA - AI Architecture Assistant

CLI tool that orchestrates AI-assisted development workflows using a `.aia` folder convention.

AIA structures your feature development into steps (brief, spec, tech-spec, dev-plan, implement, etc.), builds rich prompts from project context and knowledge files, and delegates execution to AI CLI tools (Claude Code, Codex CLI, Gemini CLI) with weighted random model selection.

## Table of contents

- [Quick start](#quick-start)
- [Prerequisites](#prerequisites)
- [Commands](#commands)
- [Integrate into an existing project](#integrate-into-an-existing-project)
- [Web UI](#web-ui)
- [Feature workflow](#feature-workflow)
- [Prompt assembly](#prompt-assembly)
- [Project structure](#project-structure)
- [Dependencies](#dependencies)
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
