import { getStoryDir, createFeature, validateFeatureName } from './feature.js';
import { runStep } from './runner.js';
import { runBuild } from './orchestrator.js';
import { updateStepStatus } from './status.js';
import { SQUAD_PRE_STEPS, SQUAD_POST_STEPS, DEFAULT_MAX_PARALLEL, STEP_STATUS } from '../constants.js';

/**
 * Run the full squad pipeline for a story/feature.
 *
 * Sequence: spec-tech -> dev-plan (sequential, reuse the normal engine) ->
 * build (parallel sub-agents via the orchestrator) -> optional review.
 * Shared by the CLI command and the web UI so behaviour stays identical.
 *
 * @param {string} name - Story slug
 * @param {Object} [options]
 * @param {string}  [options.description] - Passed to the first step (spec-tech)
 * @param {number}  [options.maxParallel]
 * @param {boolean} [options.review=true]
 * @param {boolean} [options.verbose=false]
 * @param {string}  [options.root]
 * @param {Function}[options.onData]  - Log chunks: { type, text, taskId? }
 * @param {Function}[options.onEvent] - Lifecycle events: { kind, ... }
 * @returns {Promise<{report: Object, created: boolean}>}
 */
export async function runSquad(name, {
  description,
  maxParallel = DEFAULT_MAX_PARALLEL,
  review = true,
  verbose = false,
  root = process.cwd(),
  onData,
  onEvent,
} = {}) {
  validateFeatureName(name);

  const existing = await getStoryDir(name, root);
  const created = !existing;
  if (created) {
    await createFeature(name, root);
  }

  const emit = (kind, payload = {}) => {
    if (onEvent) {
      try { onEvent({ kind, ...payload }); } catch { /* ignore */ }
    }
  };

  // 1) Sequential spec + plan — reuse the normal pipeline unchanged.
  for (const step of SQUAD_PRE_STEPS) {
    emit('step', { step, phase: 'start' });
    await runStep(step, name, {
      description: step === SQUAD_PRE_STEPS[0] ? description : undefined,
      verbose,
      root,
      onData,
    });
    emit('step', { step, phase: 'done' });
  }

  // 2) Parallel build via the orchestrator.
  emit('build', { phase: 'start' });
  const report = await runBuild(name, {
    maxParallel,
    verbose,
    root,
    onData,
    onTask: (ev) => emit('task', ev),
  });
  emit('build', { phase: 'done', report });

  // The build IS the implementation: when every task landed, reflect it in
  // status.yaml so the UI step cards and completion state stay coherent.
  if (report.failed === 0) {
    try {
      await updateStepStatus(name, 'implement', STEP_STATUS.DONE, root);
    } catch { /* non-fatal — build.md remains the source of truth */ }
  }

  // 3) Optional review — reuse the normal review step.
  if (review) {
    for (const step of SQUAD_POST_STEPS) {
      emit('step', { step, phase: 'start' });
      await runStep(step, name, { verbose, root, onData });
      emit('step', { step, phase: 'done' });
    }
  }

  emit('verdict', {
    verdict: report.verdict,
    ok: report.ok,
    failed: report.failed,
    tasks: report.tasks,
    reportPath: report.reportPath,
  });

  return { report, created };
}
