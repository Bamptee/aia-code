/**
 * @fileoverview Task storage provider for file-based task persistence
 * @module epic/providers/task-storage-provider
 */

import fs from 'fs-extra';
import path from 'node:path';
import { StorageError, NotFoundError } from '../utils/errors.js';
import { getAiaDir } from '../utils/path-utils.js';

/**
 * Lock timeout in milliseconds
 * @private
 */
const LOCK_TIMEOUT = 10000;

/**
 * Lock retry interval in milliseconds
 * @private
 */
const LOCK_RETRY_INTERVAL = 50;

/**
 * Simple file lock implementation
 * @private
 */
class FileLock {
  constructor(filePath) {
    this.filePath = filePath;
    this.lockPath = `${filePath}.lock`;
    this.acquired = false;
  }

  async acquire(timeout = LOCK_TIMEOUT) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        await fs.writeFile(this.lockPath, String(process.pid), { flag: 'wx' });
        this.acquired = true;
        return;
      } catch (error) {
        if (error.code === 'EEXIST') {
          try {
            const stat = await fs.stat(this.lockPath);
            const age = Date.now() - stat.mtimeMs;
            if (age > LOCK_TIMEOUT) {
              await fs.remove(this.lockPath);
              continue;
            }
          } catch {
            continue;
          }
          await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_INTERVAL));
        } else if (error.code === 'ENOENT') {
          await fs.ensureDir(path.dirname(this.lockPath));
        } else {
          throw new StorageError(`Failed to acquire lock: ${error.message}`);
        }
      }
    }

    throw new StorageError(`Lock timeout: Could not acquire lock for ${this.filePath}`);
  }

  async release() {
    if (this.acquired) {
      try {
        await fs.remove(this.lockPath);
      } catch {
        // Ignore errors during release
      }
      this.acquired = false;
    }
  }
}

/**
 * Gets the tasks directory path for a story
 * @param {string} baseDir - Base directory
 * @param {string} storyId - Story ID
 * @returns {string} Path to tasks directory
 */
function getTasksDir(baseDir, storyId) {
  return path.join(getAiaDir(baseDir), 'stories', storyId);
}

/**
 * Gets the tasks file path for a story
 * @param {string} baseDir - Base directory
 * @param {string} storyId - Story ID
 * @returns {string} Path to tasks.json file
 */
function getTasksFilePath(baseDir, storyId) {
  return path.join(getTasksDir(baseDir, storyId), 'tasks.json');
}

/**
 * File-based storage provider for Tasks
 */
export class TaskStorageProvider {
  /**
   * @param {string} [baseDir=process.cwd()] - Base directory for storage
   */
  constructor(baseDir = process.cwd()) {
    this.baseDir = baseDir;
  }

  /**
   * Ensures the tasks directory exists for a story
   * @param {string} storyId - Story ID
   * @returns {Promise<void>}
   */
  async ensureTasksDir(storyId) {
    await fs.ensureDir(getTasksDir(this.baseDir, storyId));
  }

  /**
   * Saves tasks for a story
   * @param {string} storyId - Story ID
   * @param {Array<import('../models/task.js').Task>} tasks - Tasks to save
   * @returns {Promise<void>}
   */
  async saveTasks(storyId, tasks) {
    await this.ensureTasksDir(storyId);

    const filePath = getTasksFilePath(this.baseDir, storyId);
    const tempPath = `${filePath}.tmp`;
    const lock = new FileLock(filePath);

    try {
      await lock.acquire();

      const data = {
        storyId,
        tasks,
        updatedAt: new Date().toISOString(),
      };

      const content = JSON.stringify(data, null, 2);
      await fs.writeFile(tempPath, content, 'utf-8');
      await fs.rename(tempPath, filePath);
    } catch (error) {
      try {
        await fs.remove(tempPath);
      } catch {
        // Ignore cleanup errors
      }

      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(`Failed to save tasks: ${error.message}`);
    } finally {
      await lock.release();
    }
  }

  /**
   * Loads all tasks for a story
   * @param {string} storyId - Story ID
   * @returns {Promise<Array<import('../models/task.js').Task>>} Array of tasks
   */
  async loadTasks(storyId) {
    const filePath = getTasksFilePath(this.baseDir, storyId);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      return data.tasks || [];
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw new StorageError(`Failed to load tasks: ${error.message}`);
    }
  }

  /**
   * Gets a single task by ID
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @returns {Promise<import('../models/task.js').Task|null>} Task or null if not found
   */
  async getTask(storyId, taskId) {
    const tasks = await this.loadTasks(storyId);
    return tasks.find((t) => t.id === taskId) || null;
  }

  /**
   * Updates a task
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @param {Object} updates - Properties to update
   * @returns {Promise<import('../models/task.js').Task>} Updated task
   * @throws {NotFoundError} If task not found
   */
  async updateTask(storyId, taskId, updates) {
    const tasks = await this.loadTasks(storyId);
    const taskIndex = tasks.findIndex((t) => t.id === taskId);

    if (taskIndex === -1) {
      throw new NotFoundError(`Task ${taskId} not found in story ${storyId}`);
    }

    const updatedTask = {
      ...tasks[taskIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    tasks[taskIndex] = updatedTask;
    await this.saveTasks(storyId, tasks);

    return updatedTask;
  }

  /**
   * Deletes a task
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @returns {Promise<void>}
   */
  async deleteTask(storyId, taskId) {
    const tasks = await this.loadTasks(storyId);
    const filteredTasks = tasks.filter((t) => t.id !== taskId);

    if (filteredTasks.length === tasks.length) {
      return; // Task didn't exist, no-op
    }

    await this.saveTasks(storyId, filteredTasks);
  }

  /**
   * Deletes all tasks for a story
   * @param {string} storyId - Story ID
   * @returns {Promise<void>}
   */
  async deleteAllTasks(storyId) {
    const filePath = getTasksFilePath(this.baseDir, storyId);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new StorageError(`Failed to delete tasks: ${error.message}`);
      }
    }
  }

  /**
   * Checks if a story has tasks
   * @param {string} storyId - Story ID
   * @returns {Promise<boolean>} True if story has tasks
   */
  async hasTasks(storyId) {
    const tasks = await this.loadTasks(storyId);
    return tasks.length > 0;
  }

  /**
   * Gets task count for a story
   * @param {string} storyId - Story ID
   * @returns {Promise<number>} Number of tasks
   */
  async getTaskCount(storyId) {
    const tasks = await this.loadTasks(storyId);
    return tasks.length;
  }
}
