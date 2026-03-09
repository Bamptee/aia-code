# AIA - AI Architecture Assistant

CLI tool that orchestrates AI-assisted development workflows using a `.aia` folder convention.

AIA structures your feature development into steps (brief, spec, tech-spec, etc.), builds rich prompts from project context and knowledge files, and delegates execution to AI CLI tools (Claude Code, Codex CLI, Gemini CLI) with weighted random model selection.

## Quick start

```bash
npm install
node bin/aia.js init
```

## Prerequisites

AIA delegates to AI CLI tools. Install the ones you need:

| Provider | CLI | Install |
|----------|-----|---------|
| Anthropic | `claude` (Claude Code) | `npm install -g @anthropic-ai/claude-code` |
| OpenAI | `codex` (Codex CLI) | `npm install -g @openai/codex` |
| Google | `gemini` (Gemini CLI) | `npm install -g @anthropic-ai/gemini-cli` |

Each CLI manages its own authentication. Run `claude`, `codex`, or `gemini` once to log in before using AIA.

## Commands

| Command | Description |
|---------|-------------|
| `aia init` | Create `.aia/` folder structure and default config |
| `aia feature <name>` | Create a new feature workspace |
| `aia run <step> <feature>` | Execute a step for a feature using AI |
| `aia status <feature>` | Show the current status of a feature |
| `aia reset <step> <feature>` | Reset a step to pending so it can be re-run |
| `aia repo scan` | Scan codebase and generate `repo-map.json` |

## Integrate into an existing project

### 1. Install

```bash
cd your-project
npm install /path/to/aia-code
```

Or add it as a dev dependency in your `package.json`:

```json
{
  "devDependencies": {
    "aia": "file:../aia-code"
  }
}
```

### 2. Initialize

```bash
npx aia init
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
<!-- .aia/prompts/tech-spec.md -->
Write a technical specification.
Include: data models, API endpoints, architecture decisions, trade-offs.
```

Required templates (one per step you want to run):

```
.aia/prompts/brief.md
.aia/prompts/ba-spec.md
.aia/prompts/questions.md
.aia/prompts/tech-spec.md
.aia/prompts/challenge.md
.aia/prompts/dev-plan.md
.aia/prompts/review.md
```

### 6. Configure models

In `config.yaml`, assign models to steps with probability weights:

```yaml
models:
  brief:
    - model: claude-sonnet-4-6
      weight: 1

  questions:
    - model: claude-sonnet-4-6
      weight: 0.5
    - model: o3
      weight: 0.5

  tech-spec:
    - model: gpt-4.1
      weight: 0.6
    - model: gemini-2.5-pro
      weight: 0.4
```

Weights don't need to sum to 1 -- they are normalized at runtime.

Supported model prefixes and the CLI used:

| Prefix | CLI | Examples |
|--------|-----|----------|
| `claude-*` | `claude -p --model` | `claude-sonnet-4-6`, `claude-3-7-sonnet` |
| `gpt-*`, `o[0-9]*` | `codex exec` | `gpt-4.1`, `o3`, `o4-mini` |
| `gemini-*` | `gemini` | `gemini-2.5-pro`, `gemini-2.5-flash` |

### 7. Create a feature and run steps

```bash
npx aia feature session-replay
npx aia run brief session-replay
npx aia status session-replay
npx aia run tech-spec session-replay
```

Each run:
1. Loads context files + knowledge + prior step outputs
2. Selects a model based on weights
3. Sends the assembled prompt to the CLI tool via stdin
4. Streams the response to stdout in real-time
5. Saves the output to `.aia/features/<name>/<step>.md`
6. Updates `status.yaml` (marks step `done`, advances `current_step`)
7. Logs execution to `.aia/logs/execution.log`

To re-run a step:

```bash
npx aia reset tech-spec session-replay
npx aia run tech-spec session-replay
```

### 8. Scan your repo

```bash
npx aia repo scan
```

Generates `.aia/repo-map.json` -- a categorized index of your source files (services, models, routes, controllers, middleware, utils, config). Useful as additional context for prompts.

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
    status.js             # aia status <feature>
    reset.js              # aia reset <step> <feature>
    repo.js               # aia repo scan
  providers/
    registry.js           # Model name -> provider routing
    cli-runner.js         # Shared CLI spawn logic (stdout streaming, timeout, error handling)
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

## Feature workflow

Each feature follows a fixed pipeline:

```
brief -> ba-spec -> questions -> tech-spec -> challenge -> dev-plan -> review
```

`status.yaml` tracks progress:

```yaml
feature: session-replay
current_step: tech-spec
steps:
  brief: done
  ba-spec: done
  questions: pending
  tech-spec: pending
  challenge: pending
  dev-plan: pending
  review: pending
knowledge:
  - backend
```

## Prompt assembly

When you run a step, the prompt is built from four sections:

```
=== CONTEXT ===
(content of context files from config.yaml)

=== KNOWLEDGE ===
(all .md files from the knowledge categories)

=== FEATURE ===
(outputs of all prior steps for this feature)

=== TASK ===
(content of prompts/<step>.md)
```

The full prompt is piped to the CLI tool via stdin, so there are no argument length limits.

## Dependencies

Only four runtime dependencies:

- `commander` -- CLI framework
- `yaml` -- YAML parse/stringify
- `fs-extra` -- filesystem utilities
- `chalk` -- terminal colors

AI calls use `child_process.spawn` to delegate to installed CLI tools.
