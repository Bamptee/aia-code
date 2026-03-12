# AIA - AI Architecture Assistant

CLI tool that orchestrates AI-assisted development workflows using a `.aia` folder convention.

AIA structures your feature development into steps (brief, spec, tech-spec, dev-plan, implement, etc.), builds rich prompts from project context and knowledge files, and delegates execution to AI CLI tools (Claude Code, Codex CLI, Gemini CLI) with weighted random model selection.

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
  aia.js                  # CLI entrypoint
src/
  cli.js                  # Commander program, registers commands
  constants.js            # Shared constants (dirs, steps, scan config)
  models.js               # Config loader + validation, weighted model selection
  logger.js               # Execution log writer
  knowledge-loader.js     # Recursive markdown loader by category
  prompt-builder.js       # Assembles full prompt from all sources
  utils.js                # Shared filesystem helpers
  commands/
    init.js               # aia init
    feature.js            # aia feature <name>
    run.js                # aia run <step> <feature>
    next.js               # aia next <feature>
    iterate.js            # aia iterate <step> <feature> <instructions>
    quick.js              # aia quick <name> [description]
    status.js             # aia status <feature>
    reset.js              # aia reset <step> <feature>
    repo.js               # aia repo scan
  providers/
    registry.js           # Model name + aliases -> provider routing
    cli-runner.js         # Shared CLI spawn (streaming, idle timeout, verbose)
    openai.js             # codex exec
    anthropic.js          # claude -p
    gemini.js             # gemini
  services/
    scaffold.js           # .aia/ folder creation
    config.js             # Default config generation
    feature.js            # Feature workspace creation + validation
    status.js             # status.yaml read/write/reset
    runner.js             # Step execution orchestrator
    model-call.js         # Provider dispatch
    repo-scan.js          # Codebase scanner + categorizer
```

## Dependencies

Only four runtime dependencies:

- `commander` -- CLI framework
- `yaml` -- YAML parse/stringify
- `fs-extra` -- filesystem utilities
- `chalk` -- terminal colors

AI calls use `child_process.spawn` to delegate to installed CLI tools. No API keys needed -- each CLI manages its own authentication.
