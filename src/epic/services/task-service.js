/**
 * @fileoverview Task Service - CRUD operations and management for Tasks
 * @module epic/services/task-service
 */

import { ValidationError, NotFoundError, BusinessRuleError } from '../utils/errors.js';
import {
  validateTask,
  assertValid,
  isValidTaskStatus,
  TASK_STATUS,
} from '../models/validators.js';
import {
  createTask as createTaskModel,
  canExecuteTask,
  getNextPendingTask,
  touchTask,
  calculateTaskSummary,
  isValidTaskTransition,
} from '../models/task.js';

/**
 * Service for managing Tasks
 */
export class TaskService {
  /**
   * @param {import('../providers/task-storage-provider.js').TaskStorageProvider} taskStorage
   * @param {import('./story-service.js').StoryService} [storyService]
   */
  constructor(taskStorage, storyService = null) {
    this.taskStorage = taskStorage;
    this.storyService = storyService;
  }

  /**
   * Creates multiple tasks from definitions
   * @param {string} storyId - Story ID
   * @param {Array<Object>} taskDefinitions - Array of task definition objects
   * @returns {Promise<Array<import('../models/task.js').Task>>} Created tasks
   */
  async createTasks(storyId, taskDefinitions) {
    if (!Array.isArray(taskDefinitions) || taskDefinitions.length === 0) {
      throw new ValidationError('taskDefinitions must be a non-empty array');
    }

    // Validate story exists if storyService is available
    if (this.storyService) {
      const exists = await this.storyService.exists(storyId);
      if (!exists) {
        throw new NotFoundError(`Story ${storyId} not found`);
      }
    }

    const tasks = [];
    const taskIdMap = new Map(); // Map old temp IDs to new UUIDs for dependency resolution

    // First pass: create tasks with temporary dependency references
    for (let i = 0; i < taskDefinitions.length; i++) {
      const def = taskDefinitions[i];

      // Validate task data
      const taskData = {
        storyId,
        title: def.title,
        order: def.order ?? i,
        files: def.files || [],
        details: def.details || '',
        dependencies: [], // Will resolve in second pass
        tests: def.tests || [],
      };

      assertValid(taskData, validateTask);

      const task = createTaskModel(taskData);

      // Store mapping from index or temp ID to real ID
      const tempId = def.tempId || `task-${i}`;
      taskIdMap.set(tempId, task.id);
      taskIdMap.set(i, task.id);
      taskIdMap.set(String(i), task.id);

      tasks.push({ task, originalDeps: def.dependencies || [] });
    }

    // Second pass: resolve dependency references
    const resolvedTasks = tasks.map(({ task, originalDeps }) => {
      const resolvedDeps = originalDeps
        .map((dep) => {
          // If dep is already a UUID, keep it
          if (typeof dep === 'string' && dep.includes('-')) {
            return dep;
          }
          // Otherwise, resolve from temp mapping
          return taskIdMap.get(dep) || taskIdMap.get(String(dep));
        })
        .filter(Boolean);

      return {
        ...task,
        dependencies: resolvedDeps,
      };
    });

    // Save all tasks
    await this.taskStorage.saveTasks(storyId, resolvedTasks);

    return resolvedTasks;
  }

  /**
   * Gets all tasks for a story
   * @param {string} storyId - Story ID
   * @returns {Promise<Array<import('../models/task.js').Task>>} Array of tasks
   */
  async getTasksForStory(storyId) {
    return this.taskStorage.loadTasks(storyId);
  }

  /**
   * Gets a single task by ID
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @returns {Promise<import('../models/task.js').Task>} Task
   * @throws {NotFoundError} If task not found
   */
  async getTask(storyId, taskId) {
    const task = await this.taskStorage.getTask(storyId, taskId);
    if (!task) {
      throw new NotFoundError(`Task ${taskId} not found in story ${storyId}`);
    }
    return task;
  }

  /**
   * Updates task status with validation
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @param {string} status - New status
   * @param {Object} [result] - Optional result object (implementation or review)
   * @returns {Promise<import('../models/task.js').Task>} Updated task
   */
  async updateTaskStatus(storyId, taskId, status, result = null) {
    if (!isValidTaskStatus(status)) {
      throw new ValidationError(`Invalid status: ${status}. Must be one of: ${Object.values(TASK_STATUS).join(', ')}`);
    }

    const task = await this.getTask(storyId, taskId);

    // Validate status transition
    if (!isValidTaskTransition(task.status, status)) {
      throw new BusinessRuleError(
        `Invalid status transition from ${task.status} to ${status}`
      );
    }

    // Check dependencies for in_progress transition
    if (status === TASK_STATUS.IN_PROGRESS) {
      const allTasks = await this.getTasksForStory(storyId);
      const { canExecute, blockedBy } = canExecuteTask(task, allTasks);

      if (!canExecute && blockedBy.length > 0) {
        throw new BusinessRuleError(
          `Cannot start task: blocked by dependencies ${blockedBy.join(', ')}`
        );
      }
    }

    const updates = { status };

    // Add result if provided
    if (result) {
      if (status === TASK_STATUS.COMPLETED || status === TASK_STATUS.FAILED) {
        updates.implementationResult = result;
      }
    }

    return this.taskStorage.updateTask(storyId, taskId, updates);
  }

  /**
   * Gets the next pending task respecting dependencies
   * @param {string} storyId - Story ID
   * @returns {Promise<import('../models/task.js').Task|null>} Next task or null
   */
  async getNextPendingTask(storyId) {
    const tasks = await this.getTasksForStory(storyId);
    return getNextPendingTask(tasks);
  }

  /**
   * Checks if a task can be executed
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @returns {Promise<{canExecute: boolean, blockedBy: string[]}>} Execution status
   */
  async canExecuteTask(storyId, taskId) {
    const task = await this.getTask(storyId, taskId);
    const allTasks = await this.getTasksForStory(storyId);
    return canExecuteTask(task, allTasks);
  }

  /**
   * Resets a task to pending status
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @returns {Promise<import('../models/task.js').Task>} Reset task
   */
  async resetTask(storyId, taskId) {
    const task = await this.getTask(storyId, taskId);

    return this.taskStorage.updateTask(storyId, taskId, {
      status: TASK_STATUS.PENDING,
      implementationResult: null,
      reviewResult: null,
    });
  }

  /**
   * Skips a task
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @returns {Promise<import('../models/task.js').Task>} Skipped task
   */
  async skipTask(storyId, taskId) {
    const task = await this.getTask(storyId, taskId);

    if (task.status !== TASK_STATUS.PENDING) {
      throw new BusinessRuleError(`Can only skip pending tasks. Current status: ${task.status}`);
    }

    return this.taskStorage.updateTask(storyId, taskId, {
      status: TASK_STATUS.SKIPPED,
    });
  }

  /**
   * Reorders tasks
   * @param {string} storyId - Story ID
   * @param {Array<{taskId: string, order: number}>} newOrder - New order definitions
   * @returns {Promise<Array<import('../models/task.js').Task>>} Reordered tasks
   */
  async reorderTasks(storyId, newOrder) {
    const tasks = await this.getTasksForStory(storyId);
    const orderMap = new Map(newOrder.map((o) => [o.taskId, o.order]));

    const reorderedTasks = tasks.map((task) => {
      const newOrderValue = orderMap.get(task.id);
      if (newOrderValue !== undefined) {
        return { ...task, order: newOrderValue, updatedAt: new Date().toISOString() };
      }
      return task;
    });

    // Sort by new order
    reorderedTasks.sort((a, b) => a.order - b.order);

    await this.taskStorage.saveTasks(storyId, reorderedTasks);
    return reorderedTasks;
  }

  /**
   * Deletes a task
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @returns {Promise<void>}
   */
  async deleteTask(storyId, taskId) {
    // Remove this task from dependencies of other tasks
    const tasks = await this.getTasksForStory(storyId);
    const updatedTasks = tasks
      .filter((t) => t.id !== taskId)
      .map((t) => ({
        ...t,
        dependencies: t.dependencies.filter((d) => d !== taskId),
      }));

    await this.taskStorage.saveTasks(storyId, updatedTasks);
  }

  /**
   * Deletes all tasks for a story
   * @param {string} storyId - Story ID
   * @returns {Promise<void>}
   */
  async deleteAllTasks(storyId) {
    return this.taskStorage.deleteAllTasks(storyId);
  }

  /**
   * Gets task summary statistics
   * @param {string} storyId - Story ID
   * @returns {Promise<Object>} Task summary
   */
  async getTaskSummary(storyId) {
    const tasks = await this.getTasksForStory(storyId);
    return calculateTaskSummary(tasks);
  }

  /**
   * Updates a task's properties
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @param {Object} updates - Properties to update
   * @returns {Promise<import('../models/task.js').Task>} Updated task
   */
  async updateTask(storyId, taskId, updates) {
    // Validate allowed update fields
    const allowedFields = ['title', 'details', 'files', 'tests', 'dependencies', 'order'];
    const filteredUpdates = {};

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = value;
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      throw new ValidationError('No valid update fields provided');
    }

    return this.taskStorage.updateTask(storyId, taskId, filteredUpdates);
  }

  /**
   * Sets implementation result for a task
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @param {Object} result - Implementation result
   * @returns {Promise<import('../models/task.js').Task>} Updated task
   */
  async setImplementationResult(storyId, taskId, result) {
    return this.taskStorage.updateTask(storyId, taskId, {
      implementationResult: {
        ...result,
        completedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Sets review result for a task
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @param {Object} result - Review result
   * @returns {Promise<import('../models/task.js').Task>} Updated task
   */
  async setReviewResult(storyId, taskId, result) {
    return this.taskStorage.updateTask(storyId, taskId, {
      reviewResult: {
        ...result,
        reviewedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Checks if all tasks are completed
   * @param {string} storyId - Story ID
   * @returns {Promise<boolean>} True if all tasks are completed or skipped
   */
  async areAllTasksCompleted(storyId) {
    const tasks = await this.getTasksForStory(storyId);
    return tasks.every(
      (t) => t.status === TASK_STATUS.COMPLETED || t.status === TASK_STATUS.SKIPPED
    );
  }

  /**
   * Gets tasks with a specific status
   * @param {string} storyId - Story ID
   * @param {string} status - Status to filter by
   * @returns {Promise<Array<import('../models/task.js').Task>>} Filtered tasks
   */
  async getTasksByStatus(storyId, status) {
    const tasks = await this.getTasksForStory(storyId);
    return tasks.filter((t) => t.status === status);
  }
}
