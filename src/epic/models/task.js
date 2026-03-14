/**
 * @fileoverview Task model definition and factory functions
 * @module epic/models/task
 */

import { generateUUID } from '../utils/id-generator.js';

/**
 * Task status enum values
 * @readonly
 * @enum {string}
 */
export const TASK_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
});

/**
 * @typedef {Object} TaskImplementationResult
 * @property {string} output - Implementation output/logs
 * @property {string[]} filesModified - Array of modified file paths
 * @property {string} completedAt - ISO 8601 timestamp
 * @property {boolean} success - Whether implementation succeeded
 * @property {string|null} error - Error message if failed
 */

/**
 * @typedef {Object} TaskReviewResult
 * @property {'approved'|'changes_requested'|'pending'} status - Review status
 * @property {string|null} feedback - Review feedback/comments
 * @property {string[]} issues - Array of issues found
 * @property {string} reviewedAt - ISO 8601 timestamp
 */

/**
 * @typedef {Object} Task
 * @property {string} id - UUID v4
 * @property {string} storyId - Reference to parent story
 * @property {string} title - Short task description
 * @property {string} status - Current status (pending, in_progress, completed, failed, skipped)
 * @property {number} order - Execution order (integer)
 * @property {string[]} files - Array of files to create/modify
 * @property {string} details - Implementation details
 * @property {string[]} dependencies - Array of task IDs that must complete first
 * @property {string[]} tests - Array of test descriptions
 * @property {TaskImplementationResult|null} implementationResult - Implementation output/logs
 * @property {TaskReviewResult|null} reviewResult - Review feedback
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {string} updatedAt - ISO 8601 timestamp
 */

/**
 * Creates a new Task object
 * @param {Object} data - Task data
 * @param {string} data.storyId - Parent story ID (required)
 * @param {string} data.title - Task title (required)
 * @param {number} [data.order=0] - Execution order
 * @param {string[]} [data.files=[]] - Files to create/modify
 * @param {string} [data.details=''] - Implementation details
 * @param {string[]} [data.dependencies=[]] - Task IDs that must complete first
 * @param {string[]} [data.tests=[]] - Test descriptions
 * @returns {Task} New Task object
 */
export function createTask(data) {
  const now = new Date().toISOString();

  return {
    id: generateUUID(),
    storyId: data.storyId,
    title: data.title.trim(),
    status: TASK_STATUS.PENDING,
    order: data.order ?? 0,
    files: data.files || [],
    details: data.details?.trim() || '',
    dependencies: data.dependencies || [],
    tests: data.tests || [],
    implementationResult: null,
    reviewResult: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates an implementation result object
 * @param {Object} data - Result data
 * @param {string} data.output - Implementation output
 * @param {string[]} [data.filesModified=[]] - Modified files
 * @param {boolean} [data.success=true] - Whether it succeeded
 * @param {string|null} [data.error=null] - Error message if failed
 * @returns {TaskImplementationResult} Implementation result
 */
export function createImplementationResult(data) {
  return {
    output: data.output || '',
    filesModified: data.filesModified || [],
    completedAt: new Date().toISOString(),
    success: data.success ?? true,
    error: data.error || null,
  };
}

/**
 * Creates a review result object
 * @param {Object} data - Review data
 * @param {'approved'|'changes_requested'|'pending'} data.status - Review status
 * @param {string|null} [data.feedback=null] - Review feedback
 * @param {string[]} [data.issues=[]] - Issues found
 * @returns {TaskReviewResult} Review result
 */
export function createReviewResult(data) {
  return {
    status: data.status,
    feedback: data.feedback || null,
    issues: data.issues || [],
    reviewedAt: new Date().toISOString(),
  };
}

/**
 * Checks if a task can be executed based on dependencies
 * @param {Task} task - Task to check
 * @param {Task[]} allTasks - All tasks for dependency checking
 * @returns {{canExecute: boolean, blockedBy: string[]}} Result
 */
export function canExecuteTask(task, allTasks) {
  if (task.status === TASK_STATUS.COMPLETED || task.status === TASK_STATUS.SKIPPED) {
    return { canExecute: false, blockedBy: [] };
  }

  if (task.status === TASK_STATUS.IN_PROGRESS) {
    return { canExecute: false, blockedBy: [] };
  }

  const blockedBy = [];

  for (const depId of task.dependencies) {
    const depTask = allTasks.find((t) => t.id === depId);
    if (depTask && depTask.status !== TASK_STATUS.COMPLETED && depTask.status !== TASK_STATUS.SKIPPED) {
      blockedBy.push(depId);
    }
  }

  return {
    canExecute: blockedBy.length === 0,
    blockedBy,
  };
}

/**
 * Gets the next pending task respecting dependencies
 * @param {Task[]} tasks - Array of tasks
 * @returns {Task|null} Next executable task or null
 */
export function getNextPendingTask(tasks) {
  // Sort by order
  const sorted = [...tasks].sort((a, b) => a.order - b.order);

  for (const task of sorted) {
    if (task.status === TASK_STATUS.PENDING) {
      const { canExecute } = canExecuteTask(task, tasks);
      if (canExecute) {
        return task;
      }
    }
  }

  return null;
}

/**
 * Updates task timestamp
 * @param {Task} task - Task to update
 * @returns {Task} Updated Task with new timestamp
 */
export function touchTask(task) {
  return {
    ...task,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Calculates task summary statistics
 * @param {Task[]} tasks - Array of tasks
 * @returns {{total: number, pending: number, inProgress: number, completed: number, failed: number, skipped: number}} Summary
 */
export function calculateTaskSummary(tasks) {
  const summary = {
    total: tasks.length,
    pending: 0,
    inProgress: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const task of tasks) {
    switch (task.status) {
      case TASK_STATUS.PENDING:
        summary.pending++;
        break;
      case TASK_STATUS.IN_PROGRESS:
        summary.inProgress++;
        break;
      case TASK_STATUS.COMPLETED:
        summary.completed++;
        break;
      case TASK_STATUS.FAILED:
        summary.failed++;
        break;
      case TASK_STATUS.SKIPPED:
        summary.skipped++;
        break;
    }
  }

  return summary;
}

/**
 * Validates task status transition
 * @param {string} fromStatus - Current status
 * @param {string} toStatus - Target status
 * @returns {boolean} True if transition is valid
 */
export function isValidTaskTransition(fromStatus, toStatus) {
  const validTransitions = {
    [TASK_STATUS.PENDING]: [TASK_STATUS.IN_PROGRESS, TASK_STATUS.SKIPPED],
    [TASK_STATUS.IN_PROGRESS]: [TASK_STATUS.COMPLETED, TASK_STATUS.FAILED, TASK_STATUS.PENDING],
    [TASK_STATUS.COMPLETED]: [TASK_STATUS.PENDING], // Allow reset
    [TASK_STATUS.FAILED]: [TASK_STATUS.PENDING, TASK_STATUS.IN_PROGRESS], // Allow retry
    [TASK_STATUS.SKIPPED]: [TASK_STATUS.PENDING], // Allow unskip
  };

  const allowed = validTransitions[fromStatus];
  return allowed ? allowed.includes(toStatus) : false;
}
