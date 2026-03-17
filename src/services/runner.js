import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { FEATURE_STEPS, APPLY_STEPS, STEP_STATUS } from '../constants.js';
import { resolveModel } from '../models.js';
import { buildPrompt, buildTaskPrompt } from '../prompt-builder.js';
import { callModel } from './model-call.js';
import { loadStatus, updateStepStatus, updatePhaseStatus, getPhaseByNumber, initializePhasesFromDevPlan, getStoryDirPath } from './status.js';
import { logExecution } from '../logger.js';
import { startSession, endSession, appendLog, claim, isClaimed, updateTokens, scheduleRetry } from './agent-sessions.js';
import { hasWorktree, getWorktreePath, getFeatureBranch } from './worktrunk.js';

/**
 * Runs implementation with task context for task-scoped execution
 * @param {Object} task - Task object with title, details, files, etc.
 * @param {Object} story - Parent story object
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Implementation result
 */
export async function runWithTaskContext(task, story, options = {}) {
  const {
    model: modelOverride,
    verbose = false,
    apply = true,
    root = process.cwd(),
    onData,
  } = options;

  const sessionId = `task-${task.id.slice(0, 8)}`;

  // Check if task is already claimed (prevent double-dispatch)
  if (isClaimed(sessionId)) {
    throw new Error(`Task "${sessionId}" already has an active session.`);
  }
  claim(sessionId);

  startSession(sessionId, 'task-implement', { root });

  const wrappedOnData = (data) => {
    appendLog(sessionId, data.text, data.type);
    if (onData) onData(data);
  };

  const cwd = root;

  try {
    const model = modelOverride || await resolveModel('implement', root);
    const prompt = await buildTaskPrompt(task, story, { root });

    const start = performance.now();
    const result = await callModel(model, prompt, { verbose, apply, onData: wrappedOnData, cwd });
    const duration = performance.now() - start;

    // Extract output and tokenUsage from result
    const output = result.output;
    const tokenUsage = result.tokenUsage;

    await logExecution({
      feature: `task-${task.id.slice(0, 8)}`,
      step: 'task-implement',
      model,
      duration,
      taskId: task.id,
      taskTitle: task.title,
      tokenUsage,
    }, root);

    // Parse output for modified files if possible
    const filesModified = extractModifiedFiles(output, task.files);

    // Update session with token usage
    if (tokenUsage) {
      updateTokens(sessionId, tokenUsage);
    }

    // End session successfully
    endSession(sessionId, { success: true });

    return {
      output,
      filesModified,
      tokenUsage,
      success: true,
      error: null,
      completedAt: new Date().toISOString(),
    };
  } catch (err) {
    // End session without releasing claim for potential retry
    endSession(sessionId, { success: false });

    return {
      output: '',
      filesModified: [],
      tokenUsage: null,
      success: false,
      error: err.message,
      completedAt: new Date().toISOString(),
    };
  }
}

/**
 * Extracts modified files from output or uses task's file list
 * @private
 */
function extractModifiedFiles(output, taskFiles) {
  // Try to find file modification markers in output
  const filePatterns = [
    /(?:Created|Modified|Updated|Wrote to|Writing to):\s*[`"]?([^\s`"]+)[`"]?/gi,
    /^[-+]{3}\s+(?:a|b)\/(.+)$/gm,
  ];

  const foundFiles = new Set();

  for (const pattern of filePatterns) {
    const matches = output.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        foundFiles.add(match[1]);
      }
    }
  }

  // If no files detected, use task's file list
  if (foundFiles.size === 0) {
    return taskFiles || [];
  }

  return Array.from(foundFiles);
}

export async function runStep(step, feature, { description, instructions, history, attachments, model: modelOverride, verbose = false, apply = false, phase = null, task = null, root = process.cwd(), onData, attempt = 1, isRetry = false } = {}) {
  if (!FEATURE_STEPS.includes(step)) {
    throw new Error(`Unknown step "${step}". Valid steps: ${FEATURE_STEPS.join(', ')}`);
  }

  // Check if story is already claimed (prevent double-dispatch)
  // Skip this check for retries as they reuse the existing claim
  if (isClaimed(feature) && !isRetry) {
    throw new Error(`Story "${feature}" already has an active session. Wait for it to complete or cancel it.`);
  }

  // Claim the story for this execution (only on first attempt, not retries)
  if (!isRetry) {
    claim(feature);
  }

  const status = await loadStatus(feature, root);

  // Phase mode: only for implement step
  let phaseData = null;
  if (phase !== null && step === 'implement') {
    // Initialize phases from dev-plan if not already done
    if (!status.phases || status.phases.length === 0) {
      await initializePhasesFromDevPlan(feature, root);
      // Reload status after initialization
      const updatedStatus = await loadStatus(feature, root);
      phaseData = getPhaseByNumber(updatedStatus, parseInt(phase, 10));
    } else {
      phaseData = getPhaseByNumber(status, parseInt(phase, 10));
    }

    if (!phaseData) {
      throw new Error(`Phase ${phase} not found for feature "${feature}". Check dev-plan.md for available tasks.`);
    }

    if (phaseData.status === 'done') {
      throw new Error(`Phase ${phase} already done for feature "${feature}".`);
    }

    console.log(chalk.cyan(`Running phase ${phase}: ${phaseData.title}`));
  }

  if (status.steps[step] === STEP_STATUS.DONE && phase === null) {
    throw new Error(
      `Step "${step}" already done for feature "${feature}". Use "aia reset ${step} ${feature}" to re-run.`,
    );
  }

  await updateStepStatus(feature, step, STEP_STATUS.IN_PROGRESS, root);

  // Update phase status if running in phase mode
  if (phaseData) {
    await updatePhaseStatus(feature, phaseData.id, 'in-progress', root);
  }

  const shouldApply = apply || APPLY_STEPS.has(step);

  // Start agent session for tracking (pass attempt and root for retries)
  startSession(feature, step, { attempt, root });

  // Workaround for Claude CLI bug in git worktrees:
  // Instead of running in worktree (which hangs), we stay in main repo
  // but pass the worktree path to the prompt so files are edited there
  const branch = getFeatureBranch(feature);
  const wtPath = hasWorktree(branch, root) ? getWorktreePath(branch, root) : null;
  const cwd = root; // Keep CWD as main repo for stability

  // Wrapper onData to buffer logs in session
  const wrappedOnData = (data) => {
    appendLog(feature, data.text, data.type);
    if (onData) onData(data);
  };

  // Resolve model outside try block so we can pass it to scheduleRetry on failure
  let model;
  try {
    model = modelOverride || await resolveModel(step, root);
    const { prompt, filesUsed } = await buildPrompt(feature, step, { description, instructions, history, attachments, phase: phaseData, root, wtPath });

    // Log files used for transparency
    if (filesUsed) {
      console.log(chalk.dim(`[Context] Prompt: ${filesUsed.promptTemplate} (${filesUsed.promptPhase}/${filesUsed.promptType})`));
      if (filesUsed.priorSteps?.length > 0) {
        console.log(chalk.dim(`[Context] Prior steps: ${filesUsed.priorSteps.map(f => f.file).join(', ')}`));
      }
      if (filesUsed.contextFiles?.length > 0) {
        console.log(chalk.dim(`[Context] Context files: ${filesUsed.contextFiles.join(', ')}`));
      }
    }

    const start = performance.now();
    const result = await callModel(model, prompt, { verbose, apply: shouldApply, onData: wrappedOnData, cwd });
    const duration = performance.now() - start;

    // Extract output and tokenUsage from result
    const output = result.output;
    const tokenUsage = result.tokenUsage;

    // Update session with token usage
    if (tokenUsage) {
      updateTokens(feature, tokenUsage);
    }

    // In phase mode, append to implement.md instead of overwriting
    const storyDir = await getStoryDirPath(feature, root);
    const outputPath = path.join(storyDir, `${step}.md`);
    if (phaseData) {
      const existingContent = await fs.pathExists(outputPath) ? await fs.readFile(outputPath, 'utf-8') : '';
      const phaseHeader = `\n\n## Phase ${phaseData.number}: ${phaseData.title}\n\n`;
      await fs.writeFile(outputPath, existingContent + phaseHeader + output, 'utf-8');
      await updatePhaseStatus(feature, phaseData.id, 'done', root);
      console.log(chalk.green(`Phase ${phaseData.number} completed for feature "${feature}".`));
    } else {
      await fs.writeFile(outputPath, output, 'utf-8');
      await updateStepStatus(feature, step, STEP_STATUS.DONE, root);
      console.log(chalk.green(`Step "${step}" completed for feature "${feature}".`));
    }

    await logExecution({ feature, step, model, duration, phase: phaseData?.number, tokenUsage }, root);

    // End session successfully - this releases the claim
    endSession(feature, { success: true });

    // Return output, filesUsed and tokenUsage for UI transparency
    return { output, filesUsed, tokenUsage };
  } catch (err) {
    await updateStepStatus(feature, step, STEP_STATUS.ERROR, root);
    if (phaseData) {
      await updatePhaseStatus(feature, phaseData.id, 'pending', root);
    }

    // Schedule retry BEFORE ending session so broadcast works
    // Pass the failed model so retry can use a fallback
    scheduleRetry(feature, step, err.message, root, model);

    // End session without releasing claim (retry will reuse it)
    endSession(feature, { success: false });

    throw err;
  }
}
