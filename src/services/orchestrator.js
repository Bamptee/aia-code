/**
 * @fileoverview Squad build orchestrator.
 *
 * Fans out the tasks of a dev-plan to parallel sub-agents. Each sub-agent is a
 * standalone `claude` (or other CLI) process routed to a model sized to the task
 * (its "tier"), scoped to its own files, and run respecting task dependencies and
 * a concurrency cap. This reuses the existing model-call / CLI layer unchanged —
 * `build` is intentionally NOT a FEATURE_STEP, so the status schema, the normal
 * sequential pipeline and the web UI are untouched.
 *
 * @module services/orchestrator
 */
import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { DEFAULT_MAX_PARALLEL, DEFAULT_TIER } from '../constants.js';
import { parseDevPlan, validateTasks } from './dev-plan-parser.js';
import { resolveModelForTier, loadConfig } from '../models.js';
import { callModel } from './model-call.js';
import { getStoryDirPath } from './status.js';
import { logExecution } from '../logger.js';

async function safeLoadConfig(root) {
  try {
    return await loadConfig(root);
  } catch {
    return {};
  }
}

/**
 * Build the prompt for a single build sub-agent.
 * @private
 */
function buildSubagentPrompt({ task, feature, storyDir, outputLang }) {
  const fileScope = task.files && task.files.length
    ? task.files.join(', ')
    : '(none declared — infer the minimal set from the details and stay strictly minimal)';
  const deps = task.dependencies && task.dependencies.length
    ? `${task.dependencies.join(', ')} (already implemented by sibling agents — READ their files if needed, do NOT modify them)`
    : 'none';

  return `## ROLE
You are a specialized BUILD SUB-AGENT inside a multi-agent squad implementing ONE task of a
larger feature. Other sub-agents are implementing sibling tasks IN PARALLEL right now. Stay
strictly within your task to avoid conflicts.

## TASK ${task.number}: ${task.title}
${task.details || '(see dev-plan.md for details)'}

## FILE SCOPE — edit ONLY these files (create them if missing)
${fileScope}

## DEPENDENCIES
${deps}

## TESTS
${task.tests || 'Add or adjust tests for this task, following the project conventions.'}

## SHARED CONTEXT
Feature: ${feature}
Before editing, read these files for the full picture (they already exist):
- ${path.join(storyDir, 'init.md')}
- ${path.join(storyDir, 'spec-tech.md')}
- ${path.join(storyDir, 'dev-plan.md')}
Also read the surrounding code and match the project's conventions (naming, imports, error
handling, style) exactly.

## CONTRACT / RULES
- Implement ONLY this task. Do NOT implement sibling tasks or touch their files.
- Edit ONLY files listed in FILE SCOPE. Never refactor unrelated code.
- Do NOT change shared interfaces other tasks depend on unless this task's details require it.
- Keep the change minimal, production-ready, and consistent with the codebase.
- Prose/notes language: ${outputLang}.

## WHEN DONE
Finish your response with one line exactly:
FILES: <comma-separated list of files you created or modified>`;
}

/**
 * Run a single task as a sub-agent (one CLI process, apply mode).
 * Never throws — failures are captured in the returned result.
 * @private
 */
async function runOneTask(task, { feature, storyDir, outputLang, verbose, root, onData, onTask }) {
  const tier = task.tier || DEFAULT_TIER;
  const model = await resolveModelForTier(tier, root);
  const label = `#${task.number} ${task.title} [${tier} → ${model}]`;

  if (onTask) onTask({ phase: 'start', task, tier, model });
  console.log(chalk.gray(`[squad] ▶ ${label}`));

  const prompt = buildSubagentPrompt({ task, feature, storyDir, outputLang });
  const taggedOnData = onData ? (d) => onData({ ...d, taskId: task.id }) : undefined;

  const start = performance.now();
  try {
    const result = await callModel(model, prompt, { verbose, apply: true, onData: taggedOnData, cwd: root });
    const duration = performance.now() - start;

    await logExecution({
      feature,
      step: `build:${task.id}`,
      model,
      duration,
      taskId: task.id,
      taskTitle: task.title,
      tokenUsage: result.tokenUsage,
    }, root);

    console.log(chalk.green(`[squad] ✔ ${label} (${(duration / 1000).toFixed(0)}s)`));
    if (onTask) onTask({ phase: 'done', task, tier, model });

    return {
      taskId: task.id,
      number: task.number,
      title: task.title,
      tier,
      model,
      success: true,
      output: result.output || '',
      fileOperations: result.fileOperations || [],
      tokenUsage: result.tokenUsage || null,
      files: task.files || [],
      duration,
    };
  } catch (err) {
    const duration = performance.now() - start;
    console.error(chalk.red(`[squad] ✘ ${label} — ${err.message}`));
    if (onTask) onTask({ phase: 'error', task, tier, model, error: err.message });
    return {
      taskId: task.id,
      number: task.number,
      title: task.title,
      tier,
      model,
      success: false,
      error: err.message,
      files: task.files || [],
      duration,
    };
  }
}

/**
 * Write build.md report and verify each task's declared files exist on disk.
 * @private
 */
async function writeBuildSummary(feature, storyDir, tasks, results, root) {
  const header = [`# Build report — ${feature}`, '', '_Generated by the squad orchestrator._', ''];
  const body = [];
  let ok = 0;
  let failed = 0;
  const missing = [];

  for (const t of tasks) {
    const r = results.get(t.id);
    const icon = r?.success ? '✅' : '❌';
    body.push(`## ${icon} Task ${t.number}: ${t.title}`);
    body.push(`- Tier / model: ${r?.tier || '-'} → ${r?.model || '-'}`);
    body.push(`- Duration: ${r ? (r.duration / 1000).toFixed(0) + 's' : '-'}`);
    body.push(`- Declared files: ${(t.files && t.files.length) ? t.files.join(', ') : '(none)'}`);

    if (r?.success) {
      ok++;
    } else {
      failed++;
      if (r?.error) body.push(`- Error: ${r.error}`);
    }

    const notFound = [];
    for (const f of (t.files || [])) {
      const abs = path.isAbsolute(f) ? f : path.join(root, f);
      // eslint-disable-next-line no-await-in-loop
      if (!(await fs.pathExists(abs))) notFound.push(f);
    }
    if (notFound.length) {
      missing.push({ task: t.number, files: notFound });
      body.push(`- ⚠️ Declared files not found on disk: ${notFound.join(', ')}`);
    }
    body.push('');
  }

  const verdict = (failed === 0 && missing.length === 0)
    ? 'SHIP'
    : (failed > 0 ? 'NEEDS REWORK' : 'SHIP WITH FIXES');

  const summaryLine = `Result: ${ok} ok / ${failed} failed — verdict: **${verdict}**`;
  const content = [...header, summaryLine, '', ...body].join('\n');

  const outPath = path.join(storyDir, 'build.md');
  await fs.writeFile(outPath, content, 'utf-8');
  console.log(chalk.bold(`\n[squad] Build report → ${outPath}  (${ok} ok, ${failed} failed, verdict ${verdict})`));

  return { feature, tasks: tasks.length, ok, failed, missing, verdict, reportPath: outPath };
}

/**
 * Orchestrate the parallel build of a feature from its dev-plan.
 *
 * @param {string} feature - Story slug
 * @param {Object} [options]
 * @param {number}  [options.maxParallel] - Max sub-agents running concurrently
 * @param {boolean} [options.verbose]
 * @param {string}  [options.root]
 * @param {Function}[options.onData] - Per-log chunk (tagged with taskId)
 * @param {Function}[options.onTask] - Task lifecycle events (start/done/error)
 * @returns {Promise<{feature:string,tasks:number,ok:number,failed:number,missing:Array,verdict:string,reportPath:string}>}
 */
export async function runBuild(feature, {
  maxParallel = DEFAULT_MAX_PARALLEL,
  verbose = false,
  root = process.cwd(),
  onData,
  onTask,
} = {}) {
  const storyDir = await getStoryDirPath(feature, root);
  const devPlanPath = path.join(storyDir, 'dev-plan.md');

  if (!(await fs.pathExists(devPlanPath))) {
    throw new Error(`No dev-plan.md found for "${feature}". Run spec-tech + dev-plan first (e.g. via 'aia squad').`);
  }

  const markdown = await fs.readFile(devPlanPath, 'utf-8');
  const tasks = parseDevPlan(markdown);

  if (!tasks.length) {
    throw new Error(`Could not parse any tasks from dev-plan.md for "${feature}". Check the dev-plan format (## Task N: ...).`);
  }

  const { valid, issues } = validateTasks(tasks);
  if (!valid) {
    console.warn(chalk.yellow(`[squad] dev-plan warnings: ${issues.join('; ')}`));
  }

  const config = await safeLoadConfig(root);
  const outputLang = config.document_output_language || 'English';

  console.log(chalk.bold(`\n[squad] Building "${feature}" — ${tasks.length} task(s), up to ${maxParallel} in parallel.\n`));

  const results = new Map();
  const completed = new Set();
  const failedIds = new Set();
  const remaining = [...tasks];
  let wave = 0;

  while (remaining.length > 0) {
    // Skip tasks whose dependencies failed — running them would build on broken code.
    for (let i = remaining.length - 1; i >= 0; i--) {
      const t = remaining[i];
      const failedDeps = (t.dependencies || []).filter(d => failedIds.has(d));
      if (failedDeps.length > 0) {
        const skipResult = {
          taskId: t.id,
          number: t.number,
          title: t.title,
          tier: t.tier || DEFAULT_TIER,
          model: null,
          success: false,
          error: `Skipped — dependency failed: ${failedDeps.join(', ')}`,
          files: t.files || [],
          duration: 0,
        };
        results.set(t.id, skipResult);
        completed.add(t.id);
        failedIds.add(t.id);
        remaining.splice(i, 1);
        console.warn(chalk.yellow(`[squad] ⤼ #${t.number} ${t.title} — skipped (dependency failed: ${failedDeps.join(', ')})`));
        if (onTask) onTask({ phase: 'error', task: t, tier: skipResult.tier, model: null, error: skipResult.error });
      }
    }
    if (remaining.length === 0) break;

    // Tasks whose dependencies are all completed
    let ready = remaining.filter(t => (t.dependencies || []).every(d => completed.has(d)));

    if (ready.length === 0) {
      // Dependency deadlock (circular / unknown dep) — don't stall, take the first.
      console.warn(chalk.yellow('[squad] Unresolved dependencies — running remaining tasks in listed order.'));
      ready = [remaining[0]];
    }

    // Build a batch: skip tasks explicitly flagged Parallelizable: no (run those alone).
    let batch = ready.filter(t => t.parallelizable !== false).slice(0, Math.max(1, maxParallel));
    if (batch.length === 0) {
      batch = [ready[0]]; // only non-parallelizable tasks ready -> run one at a time
    }

    wave++;
    console.log(chalk.cyan(`[squad] Wave ${wave}: ${batch.map(t => `#${t.number} ${t.title}`).join('  |  ')}`));

    // eslint-disable-next-line no-await-in-loop
    const settled = await Promise.all(
      batch.map(t => runOneTask(t, { feature, storyDir, outputLang, verbose, root, onData, onTask })),
    );

    for (const r of settled) {
      results.set(r.taskId, r);
      completed.add(r.taskId);
      if (!r.success) failedIds.add(r.taskId);
      const idx = remaining.findIndex(t => t.id === r.taskId);
      if (idx !== -1) remaining.splice(idx, 1);
    }
  }

  return writeBuildSummary(feature, storyDir, tasks, results, root);
}
