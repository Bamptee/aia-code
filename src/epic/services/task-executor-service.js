/**
 * @fileoverview Task Executor Service - Execute individual or batch tasks
 * @module epic/services/task-executor-service
 */

import { BusinessRuleError, NotFoundError } from '../utils/errors.js';
import { TASK_STATUS, createImplementationResult } from '../models/task.js';

/**
 * Execution state tracking
 * @typedef {Object} ExecutionState
 * @property {string|null} currentTaskId - Currently executing task ID
 * @property {boolean} isPaused - Whether execution is paused
 * @property {Array<Object>} executionLog - Array of execution events
 * @property {string} startedAt - ISO timestamp of execution start
 * @property {string|null} completedAt - ISO timestamp of completion
 */

/**
 * In-memory execution state storage
 * @private
 */
const executionStates = new Map();

/**
 * Service for executing tasks
 */
export class TaskExecutorService {
  /**
   * @param {import('./task-service.js').TaskService} taskService
   * @param {Object} [options] - Execution options
   * @param {Function} [options.runner] - Runner function for actual execution
   * @param {Function} [options.onProgress] - Progress callback
   */
  constructor(taskService, options = {}) {
    this.taskService = taskService;
    this.runner = options.runner || null;
    this.onProgress = options.onProgress || null;
  }

  /**
   * Executes a single task
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @param {Object} [options] - Execution options
   * @param {boolean} [options.force=false] - Ignore dependency checks
   * @param {Object} [options.context] - Additional execution context
   * @returns {Promise<import('../models/task.js').Task>} Executed task
   */
  async executeTask(storyId, taskId, options = {}) {
    const task = await this.taskService.getTask(storyId, taskId);

    // Check if already completed
    if (task.status === TASK_STATUS.COMPLETED) {
      throw new BusinessRuleError('Task already completed');
    }

    // Check dependencies unless forced
    if (!options.force) {
      const { canExecute, blockedBy } = await this.taskService.canExecuteTask(storyId, taskId);
      if (!canExecute && blockedBy.length > 0) {
        throw new BusinessRuleError(
          `Task blocked by dependencies: ${blockedBy.join(', ')}`
        );
      }
    }

    // Update execution state
    const state = this._getOrCreateState(storyId);
    state.currentTaskId = taskId;
    state.executionLog.push({
      type: 'task_started',
      taskId,
      timestamp: new Date().toISOString(),
    });

    // Update task status to in_progress
    await this.taskService.updateTaskStatus(storyId, taskId, TASK_STATUS.IN_PROGRESS);

    try {
      // Execute the task
      const result = await this._runTask(storyId, task, options.context || {});

      // Update task with result
      const completedTask = await this.taskService.updateTaskStatus(
        storyId,
        taskId,
        result.success ? TASK_STATUS.COMPLETED : TASK_STATUS.FAILED,
        result
      );

      state.executionLog.push({
        type: result.success ? 'task_completed' : 'task_failed',
        taskId,
        timestamp: new Date().toISOString(),
        filesModified: result.filesModified,
        error: result.error,
      });

      state.currentTaskId = null;

      // Notify progress
      if (this.onProgress) {
        this.onProgress({
          type: 'task_done',
          storyId,
          taskId,
          success: result.success,
        });
      }

      return completedTask;
    } catch (error) {
      // Mark as failed on execution error
      const failedTask = await this.taskService.updateTaskStatus(
        storyId,
        taskId,
        TASK_STATUS.FAILED,
        createImplementationResult({
          output: '',
          success: false,
          error: error.message,
        })
      );

      state.executionLog.push({
        type: 'task_error',
        taskId,
        timestamp: new Date().toISOString(),
        error: error.message,
      });

      state.currentTaskId = null;
      throw error;
    }
  }

  /**
   * Executes all pending tasks sequentially
   * @param {string} storyId - Story ID
   * @param {Object} [options] - Execution options
   * @param {boolean} [options.stopOnError=true] - Stop on first error
   * @param {Object} [options.context] - Additional context
   * @returns {Promise<Object>} Execution summary
   */
  async executeAllTasks(storyId, options = {}) {
    const { stopOnError = true, context = {} } = options;

    const state = this._getOrCreateState(storyId);
    state.isPaused = false;
    state.startedAt = new Date().toISOString();

    const summary = {
      total: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      tasks: [],
    };

    let nextTask = await this.taskService.getNextPendingTask(storyId);

    while (nextTask && !state.isPaused) {
      summary.total++;

      try {
        const completedTask = await this.executeTask(storyId, nextTask.id, { context });
        summary.completed++;
        summary.tasks.push({
          id: nextTask.id,
          title: nextTask.title,
          status: 'completed',
        });
      } catch (error) {
        summary.failed++;
        summary.tasks.push({
          id: nextTask.id,
          title: nextTask.title,
          status: 'failed',
          error: error.message,
        });

        if (stopOnError) {
          break;
        }
      }

      // Get next task
      nextTask = await this.taskService.getNextPendingTask(storyId);
    }

    state.completedAt = new Date().toISOString();

    // Check for skipped tasks (those that couldn't run due to failed dependencies)
    const remainingTasks = await this.taskService.getTasksByStatus(storyId, TASK_STATUS.PENDING);
    summary.skipped = remainingTasks.length;

    return summary;
  }

  /**
   * Executes the next available task
   * @param {string} storyId - Story ID
   * @param {Object} [context] - Execution context
   * @returns {Promise<import('../models/task.js').Task|null>} Executed task or null if none available
   */
  async executeNextTask(storyId, context = {}) {
    const nextTask = await this.taskService.getNextPendingTask(storyId);

    if (!nextTask) {
      return null;
    }

    return this.executeTask(storyId, nextTask.id, { context });
  }

  /**
   * Pauses execution after current task completes
   * @param {string} storyId - Story ID
   */
  pauseExecution(storyId) {
    const state = this._getOrCreateState(storyId);
    state.isPaused = true;
    state.executionLog.push({
      type: 'execution_paused',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Resumes execution
   * @param {string} storyId - Story ID
   * @param {Object} [options] - Execution options
   * @returns {Promise<Object>} Execution summary
   */
  async resumeExecution(storyId, options = {}) {
    const state = this._getOrCreateState(storyId);
    state.isPaused = false;
    state.executionLog.push({
      type: 'execution_resumed',
      timestamp: new Date().toISOString(),
    });

    return this.executeAllTasks(storyId, options);
  }

  /**
   * Gets execution status for a story
   * @param {string} storyId - Story ID
   * @returns {Object} Execution status
   */
  getExecutionStatus(storyId) {
    const state = executionStates.get(storyId);

    if (!state) {
      return {
        status: 'idle',
        currentTaskId: null,
        isPaused: false,
        executionLog: [],
      };
    }

    let status = 'idle';
    if (state.currentTaskId) {
      status = 'running';
    } else if (state.isPaused) {
      status = 'paused';
    } else if (state.completedAt) {
      status = 'completed';
    }

    return {
      status,
      currentTaskId: state.currentTaskId,
      isPaused: state.isPaused,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      executionLog: state.executionLog,
    };
  }

  /**
   * Clears execution state for a story
   * @param {string} storyId - Story ID
   */
  clearExecutionState(storyId) {
    executionStates.delete(storyId);
  }

  /**
   * Gets or creates execution state for a story
   * @private
   * @param {string} storyId - Story ID
   * @returns {ExecutionState} Execution state
   */
  _getOrCreateState(storyId) {
    if (!executionStates.has(storyId)) {
      executionStates.set(storyId, {
        currentTaskId: null,
        isPaused: false,
        executionLog: [],
        startedAt: null,
        completedAt: null,
      });
    }
    return executionStates.get(storyId);
  }

  /**
   * Runs a task using the configured runner
   * @private
   * @param {string} storyId - Story ID
   * @param {Object} task - Task to run
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Implementation result
   */
  async _runTask(storyId, task, context) {
    if (this.runner) {
      // Use the provided runner function
      return this.runner(task, context);
    }

    // Default implementation - returns a placeholder result
    // This will be replaced by actual runner integration
    return createImplementationResult({
      output: `Task "${task.title}" executed (placeholder).\nFiles: ${task.files.join(', ')}\nDetails: ${task.details}`,
      filesModified: task.files,
      success: true,
    });
  }

  /**
   * Sets the runner function for task execution
   * @param {Function} runner - Runner function (task, context) => Promise<result>
   */
  setRunner(runner) {
    this.runner = runner;
  }

  /**
   * Retries a failed task
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @param {Object} [options] - Execution options
   * @returns {Promise<import('../models/task.js').Task>} Retried task
   */
  async retryTask(storyId, taskId, options = {}) {
    const task = await this.taskService.getTask(storyId, taskId);

    if (task.status !== TASK_STATUS.FAILED) {
      throw new BusinessRuleError('Can only retry failed tasks');
    }

    // Reset to pending first
    await this.taskService.resetTask(storyId, taskId);

    // Execute again
    return this.executeTask(storyId, taskId, options);
  }

  /**
   * Gets estimated progress for a story
   * @param {string} storyId - Story ID
   * @returns {Promise<Object>} Progress information
   */
  async getProgress(storyId) {
    const summary = await this.taskService.getTaskSummary(storyId);
    const executionStatus = this.getExecutionStatus(storyId);

    const completed = summary.completed + summary.skipped;
    const percentage = summary.total > 0 ? Math.round((completed / summary.total) * 100) : 0;

    return {
      ...summary,
      percentage,
      isRunning: executionStatus.status === 'running',
      currentTaskId: executionStatus.currentTaskId,
    };
  }
}
