import path from 'node:path';
import fs from 'fs-extra';
import { AIA_DIR, FEATURE_STEPS } from '../constants.js';

const DEFAULT_PROMPTS = {
  init: `You are a product manager. Write an initial feature description.

Include:
- Problem statement: what pain point does this solve?
- Target users: who benefits from this feature?
- User stories: 3-5 key user stories in "As a [user], I want [goal], so that [benefit]" format
- Success metrics: how do we measure if this feature is successful?
- Scope: what is in scope and out of scope for v1?
- Open questions: list any unknowns that need clarification

Keep it concise and actionable. Use the project context and knowledge to align with existing architecture.`,

  brainstorming: `You are a senior architect reviewing the init.

Generate a list of critical questions that must be answered before implementation.

Organize by category:
- Architecture: system design, integration points, data flow
- Security: authentication, authorization, data protection
- Performance: expected load, latency requirements, caching strategy
- UX: user interaction details, error handling, edge cases
- Data: migration, storage, backup, retention policies
- Infrastructure: deployment, monitoring, scaling
- Dependencies: third-party services, API limits, licensing

For each question, explain why it matters and suggest a default answer if possible.`,

  'spec-func': `You are a business analyst. Write a detailed functional specification.

Include:
- Functional requirements: numbered list of what the system must do
- Non-functional requirements: performance, security, scalability expectations
- Business rules: validation rules, edge cases, constraints
- Data requirements: what data is needed, where it comes from, how it flows
- User workflows: step-by-step flows for each key user story
- Acceptance criteria: clear, testable criteria for each requirement
- Dependencies: external systems, APIs, or teams involved

Be specific and measurable. Every requirement should be testable.`,

  'spec-tech': `You are a senior software architect. Write a detailed technical specification.

Include:
- Architecture overview: how this feature fits into the existing system
- Data models: schemas, relationships, indexes, migrations
- API design: endpoints, request/response formats, status codes, authentication
- Service layer: business logic, validation, error handling
- Integration points: external APIs, message queues, webhooks
- Security considerations: input validation, authorization checks, rate limiting
- Performance considerations: caching strategy, query optimization, pagination
- Error handling: failure modes, retry strategies, fallback behavior
- Testing strategy: unit tests, integration tests, key scenarios to cover

Use the project's existing patterns from the knowledge files. Be specific with code-level details.`,

  'dev-plan': `You are a tech lead. Create a step-by-step implementation plan.

Break the work into ordered tasks that can be implemented sequentially:

For each task:
- Title: short description
- Files: which files to create or modify
- Details: what exactly to implement
- Dependencies: which previous tasks must be completed first
- Tests: what tests to write for this task

Guidelines:
- Order tasks so each one builds on the previous
- Start with data models and migrations
- Then services and business logic
- Then API routes and controllers
- Then UI components if applicable
- End with integration tests
- Each task should be small enough to review in isolation
- Include exact file paths based on the project structure`,

  implement: `You are a senior developer. Implement the feature following the dev-plan exactly.

Rules:
- Follow the project's existing code patterns and conventions
- Create all files specified in the dev-plan
- Write clean, production-ready code
- Include proper error handling and input validation
- Add JSDoc comments for public functions
- Follow the naming conventions from the knowledge files
- Write unit tests for business logic
- Write integration tests for API endpoints

Work through the dev-plan tasks in order. For each task, create or modify the specified files.
Do not skip any task. If a task depends on a previous one, make sure the dependency is implemented first.`,

  review: `You are a senior code reviewer. Review the implementation of this feature.

Evaluate:
- Correctness: does the code match the tech spec and dev plan?
- Code quality: readability, naming, structure, DRY principle
- Error handling: are all failure modes covered?
- Security: input validation, SQL injection, XSS, auth checks
- Performance: N+1 queries, missing indexes, unnecessary computations
- Tests: coverage, edge cases, meaningful assertions
- Documentation: are public APIs documented?

For each issue found:
- File and line reference
- Severity: critical / warning / suggestion
- Description of the problem
- Suggested fix with code example

End with a summary: ship / ship with fixes / needs rework.`,
};

export async function writeDefaultPrompts(root = process.cwd()) {
  const promptsDir = path.join(root, AIA_DIR, 'prompts');
  await fs.ensureDir(promptsDir);

  for (const step of FEATURE_STEPS) {
    const filePath = path.join(promptsDir, `${step}.md`);
    if (await fs.pathExists(filePath)) {
      continue;
    }
    const content = DEFAULT_PROMPTS[step] ?? '';
    if (content) {
      await fs.writeFile(filePath, content, 'utf-8');
    }
  }
}
