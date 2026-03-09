# AIA - AI Architecture Assistant

CLI tool that orchestrates AI-assisted development workflows using a `.aia` folder convention.

AIA structures your feature development into steps (brief, spec, tech-spec, etc.), builds rich prompts from project context and knowledge files, and sends them to configurable AI models (OpenAI, Anthropic, Gemini) with weighted random selection.

## Quick start

```bash
npm install
cp .env.example .env   # add your API keys
node bin/aia.js init
```

## Commands

| Command | Description |
|---------|-------------|
| `aia init` | Create `.aia/` folder structure and default config |
| `aia feature <name>` | Create a new feature workspace |
| `aia run <step> <feature>` | Execute a step for a feature using AI |
| `aia repo scan` | Scan codebase and generate `repo-map.json` |

## Integrate into an existing project

### 1. Install

Copy or symlink the `aia-code` folder into your project, or install globally:

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

### 3. Configure API keys

Create a `.env` at your project root:

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AI...
```

Add `.env` to your `.gitignore`.

### 4. Write context files

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

### 5. Write knowledge files

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

### 6. Write prompt templates

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

### 7. Configure models

In `config.yaml`, assign models to steps with probability weights:

```yaml
models:
  brief:
    - model: claude-3-7-sonnet
      weight: 1

  questions:
    - model: claude-3-7-sonnet
      weight: 0.5
    - model: gpt-4.1
      weight: 0.5

  tech-spec:
    - model: gpt-4.1
      weight: 0.6
    - model: gemini-1.5-pro
      weight: 0.4
```

Weights don't need to sum to 1 -- they are normalized at runtime.

Supported model prefixes:

| Prefix | Provider |
|--------|----------|
| `gpt-*`, `o*` | OpenAI |
| `claude-*` | Anthropic |
| `gemini-*` | Gemini |

### 8. Create a feature and run steps

```bash
npx aia feature session-replay
npx aia run brief session-replay
npx aia run tech-spec session-replay
```

Each run:
1. Loads context files + knowledge + prior step outputs
2. Selects a model based on weights
3. Streams the response from the AI
4. Saves the output to `.aia/features/<name>/<step>.md`
5. Updates `status.yaml` (marks step `done`, advances `current_step`)
6. Logs execution to `.aia/logs/execution.log`

### 9. Scan your repo

```bash
npx aia repo scan
```

Generates `.aia/repo-map.json` -- a categorized index of your source files (services, models, routes, controllers, middleware, utils, config). Useful as additional context for prompts.

## Project structure

```
bin/
  aia.js                  # CLI entrypoint, loads dotenv
src/
  cli.js                  # Commander program, registers commands
  constants.js            # Shared constants (dirs, steps, scan config)
  models.js               # Config loader, weighted model selection
  logger.js               # Execution log writer
  knowledge-loader.js     # Recursive markdown loader by category
  prompt-builder.js       # Assembles full prompt from all sources
  commands/
    init.js               # aia init
    feature.js            # aia feature <name>
    run.js                # aia run <step> <feature>
    repo.js               # aia repo scan
  providers/
    registry.js           # Model name -> provider routing
    openai.js             # OpenAI streaming provider
    anthropic.js          # Anthropic streaming provider
    gemini.js             # Gemini streaming provider
  services/
    scaffold.js           # .aia/ folder creation
    config.js             # Default config generation
    feature.js            # Feature workspace creation + validation
    status.js             # status.yaml read/write
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

## Dependencies

Only five runtime dependencies:

- `commander` -- CLI framework
- `yaml` -- YAML parse/stringify
- `dotenv` -- .env loading
- `fs-extra` -- filesystem utilities
- `chalk` -- terminal colors

API calls use Node.js built-in `fetch`.
