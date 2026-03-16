/**
 * @fileoverview File storage provider with atomic writes and file locking
 * @module epic/providers/file-storage-provider
 */

import fs from 'fs-extra';
import path from 'node:path';
import { StorageError, NotFoundError } from '../utils/errors.js';
import {
  getAiaDir,
  getEpicsDir,
  getCacheDir,
  getFigmaCacheDir,
  getAttachmentsDir,
  getIndexDir,
  getConfigPath,
  getStoryIndexPath,
} from '../utils/path-utils.js';
import { GENERAL_EPIC_ID } from '../utils/id-generator.js';

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
 * Uses a .lock file alongside the target file
 */
class FileLock {
  /**
   * @param {string} filePath - Path to the file to lock
   */
  constructor(filePath) {
    this.filePath = filePath;
    this.lockPath = `${filePath}.lock`;
    this.acquired = false;
  }

  /**
   * Acquires the lock
   * @param {number} [timeout=LOCK_TIMEOUT] - Timeout in milliseconds
   * @returns {Promise<void>}
   * @throws {StorageError} If lock cannot be acquired
   */
  async acquire(timeout = LOCK_TIMEOUT) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        // Try to create lock file exclusively
        await fs.writeFile(this.lockPath, String(process.pid), { flag: 'wx' });
        this.acquired = true;
        return;
      } catch (error) {
        if (error.code === 'EEXIST') {
          // Lock exists, check if it's stale
          try {
            const stat = await fs.stat(this.lockPath);
            const age = Date.now() - stat.mtimeMs;
            if (age > LOCK_TIMEOUT) {
              // Stale lock, remove it
              await fs.remove(this.lockPath);
              continue;
            }
          } catch {
            // Lock file disappeared, retry
            continue;
          }
          // Wait and retry
          await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_INTERVAL));
        } else if (error.code === 'ENOENT') {
          // Directory doesn't exist, create it
          await fs.ensureDir(path.dirname(this.lockPath));
        } else {
          throw new StorageError(`Failed to acquire lock: ${error.message}`);
        }
      }
    }

    throw new StorageError(`Lock timeout: Could not acquire lock for ${this.filePath}`);
  }

  /**
   * Releases the lock
   * @returns {Promise<void>}
   */
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
 * File-based storage provider for Epic & Product Management System
 */
export class FileStorageProvider {
  /**
   * @param {string} [baseDir=process.cwd()] - Base directory for storage
   */
  constructor(baseDir = process.cwd()) {
    this.baseDir = baseDir;
    this.aiaDir = getAiaDir(baseDir);
    this.epicsDir = getEpicsDir(baseDir);
    this.cacheDir = getCacheDir(baseDir);
    this.figmaCacheDir = getFigmaCacheDir(baseDir);
    this.attachmentsDir = getAttachmentsDir(baseDir);
    this.indexDir = getIndexDir(baseDir);
  }

  /**
   * Gets the .aia directory path
   * @returns {string}
   */
  getAiaDir() {
    return this.aiaDir;
  }

  /**
   * Ensures all required directories exist
   * @returns {Promise<void>}
   */
  async ensureDirectories() {
    const dirs = [
      this.aiaDir,
      this.epicsDir,
      this.cacheDir,
      this.figmaCacheDir,
      this.attachmentsDir,
      this.indexDir,
    ];

    for (const dir of dirs) {
      await fs.ensureDir(dir);
    }
  }

  /**
   * Reads a single Epic by ID
   * @param {string} epicId - Epic ID to read
   * @returns {Promise<import('../models/epic.js').Epic|null>} Epic or null if not found
   */
  async readEpic(epicId) {
    try {
      const files = await fs.readdir(this.epicsDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.epicsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const epic = JSON.parse(content);

        if (epic.id === epicId) {
          return epic;
        }
      }

      return null;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw new StorageError(`Failed to read epic: ${error.message}`);
    }
  }

  /**
   * Reads all Epics
   * @returns {Promise<Array<import('../models/epic.js').Epic>>} Array of all Epics
   */
  async readAllEpics() {
    try {
      await this.ensureDirectories();

      const files = await fs.readdir(this.epicsDir);
      const epics = [];
      const seenIds = new Set();

      // Read files in parallel for better performance
      const readPromises = files
        .filter((f) => f.endsWith('.json'))
        .map(async (file) => {
          const filePath = path.join(this.epicsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          return { file, epic: JSON.parse(content) };
        });

      const results = await Promise.all(readPromises);

      // Deduplicate by ID, preferring _general.json for the General Epic
      for (const { file, epic } of results) {
        if (seenIds.has(epic.id)) {
          // Duplicate found - if this is NOT the preferred file, skip it
          // For General Epic, prefer _general.json
          if (epic.id === GENERAL_EPIC_ID && file !== '_general.json') {
            // Delete the duplicate file
            try {
              await fs.unlink(path.join(this.epicsDir, file));
            } catch {
              // Ignore deletion errors
            }
          }
          continue;
        }
        seenIds.add(epic.id);
        epics.push(epic);
      }

      return epics;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw new StorageError(`Failed to read epics: ${error.message}`);
    }
  }

  /**
   * Writes an Epic to file with locking and atomic writes
   * @param {import('../models/epic.js').Epic} epic - Epic to write
   * @param {string} [filename] - Override filename
   * @returns {Promise<void>}
   */
  async writeEpic(epic, filename) {
    await this.ensureDirectories();

    // Always use _general.json for the General Epic to avoid duplicates
    const file = filename || (epic.id === GENERAL_EPIC_ID || epic.isGeneral ? '_general.json' : `${epic.id}.json`);
    const filePath = path.join(this.epicsDir, file);
    const tempPath = `${filePath}.tmp`;

    const lock = new FileLock(filePath);

    try {
      await lock.acquire();

      // Write to temp file first (pretty print for readable Git diffs)
      const content = JSON.stringify(epic, null, 2);
      await fs.writeFile(tempPath, content, 'utf-8');

      // Atomic rename
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temp file on error
      try {
        await fs.remove(tempPath);
      } catch {
        // Ignore cleanup errors
      }

      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(`Failed to write epic: ${error.message}`);
    } finally {
      await lock.release();
    }
  }

  /**
   * Deletes an Epic file
   * @param {string} epicId - Epic ID to delete
   * @returns {Promise<void>}
   */
  async deleteEpic(epicId) {
    try {
      const files = await fs.readdir(this.epicsDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.epicsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const epic = JSON.parse(content);

        if (epic.id === epicId) {
          const lock = new FileLock(filePath);
          try {
            await lock.acquire();
            await fs.unlink(filePath);
          } finally {
            await lock.release();
          }
          return;
        }
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return; // Already deleted
      }
      throw new StorageError(`Failed to delete epic: ${error.message}`);
    }
  }

  /**
   * Reads the config file
   * @returns {Promise<import('../models/config.js').Config|null>} Config or null if not found
   */
  async readConfig() {
    const configPath = getConfigPath(this.baseDir);

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw new StorageError(`Failed to read config: ${error.message}`);
    }
  }

  /**
   * Writes the config file
   * @param {import('../models/config.js').Config} config - Config to write
   * @returns {Promise<void>}
   */
  async writeConfig(config) {
    await this.ensureDirectories();

    const configPath = getConfigPath(this.baseDir);
    const content = JSON.stringify(config, null, 2);
    await fs.writeFile(configPath, content, 'utf-8');
  }

  /**
   * Reads Figma cache
   * @param {string} cacheKey - Cache key
   * @returns {Promise<Object|null>} Cached data or null if not found/expired
   */
  async readFigmaCache(cacheKey) {
    const cachePath = path.join(this.figmaCacheDir, `${cacheKey}.json`);

    try {
      const content = await fs.readFile(cachePath, 'utf-8');
      const cache = JSON.parse(content);

      // Check expiration
      if (new Date(cache.expiresAt) < new Date()) {
        return null; // Expired
      }

      return cache;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw new StorageError(`Failed to read Figma cache: ${error.message}`);
    }
  }

  /**
   * Writes Figma cache
   * @param {Object} cache - Cache data to write
   * @returns {Promise<void>}
   */
  async writeFigmaCache(cache) {
    await this.ensureDirectories();

    const cachePath = path.join(this.figmaCacheDir, `${cache.cacheKey}.json`);
    const content = JSON.stringify(cache, null, 2);
    await fs.writeFile(cachePath, content, 'utf-8');
  }

  /**
   * Deletes Figma cache
   * @param {string} cacheKey - Cache key to delete
   * @returns {Promise<void>}
   */
  async deleteFigmaCache(cacheKey) {
    const cachePath = path.join(this.figmaCacheDir, `${cacheKey}.json`);
    try {
      await fs.unlink(cachePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new StorageError(`Failed to delete Figma cache: ${error.message}`);
      }
    }
  }

  /**
   * Reads the story index
   * @returns {Promise<Object<string, string>>} Map of story ID to epic ID
   */
  async readStoryIndex() {
    const indexPath = getStoryIndexPath(this.baseDir);

    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {};
      }
      throw new StorageError(`Failed to read story index: ${error.message}`);
    }
  }

  /**
   * Writes the story index
   * @param {Object<string, string>} index - Map of story ID to epic ID
   * @returns {Promise<void>}
   */
  async writeStoryIndex(index) {
    await this.ensureDirectories();

    const indexPath = getStoryIndexPath(this.baseDir);
    const tempPath = `${indexPath}.tmp`;

    try {
      const content = JSON.stringify(index, null, 2);
      await fs.writeFile(tempPath, content, 'utf-8');
      await fs.rename(tempPath, indexPath);
    } catch (error) {
      try {
        await fs.remove(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw new StorageError(`Failed to write story index: ${error.message}`);
    }
  }

  /**
   * Saves an attachment
   * @param {string} storyId - Story ID
   * @param {string} filename - Attachment filename
   * @param {Buffer} data - Attachment data
   * @returns {Promise<string>} Saved filename
   */
  async saveAttachment(storyId, filename, data) {
    const dir = path.join(this.attachmentsDir, storyId);
    await fs.ensureDir(dir);

    // Sanitize filename
    const safeName = path.basename(filename);
    const filePath = path.join(dir, safeName);

    await fs.writeFile(filePath, data);
    return safeName;
  }

  /**
   * Reads an attachment
   * @param {string} storyId - Story ID
   * @param {string} filename - Attachment filename
   * @returns {Promise<Buffer>} Attachment data
   */
  async readAttachment(storyId, filename) {
    const safeName = path.basename(filename);
    const filePath = path.join(this.attachmentsDir, storyId, safeName);

    try {
      return await fs.readFile(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new NotFoundError(`Attachment not found: ${filename}`);
      }
      throw new StorageError(`Failed to read attachment: ${error.message}`);
    }
  }

  /**
   * Deletes an attachment
   * @param {string} storyId - Story ID
   * @param {string} filename - Attachment filename
   * @returns {Promise<void>}
   */
  async deleteAttachment(storyId, filename) {
    const safeName = path.basename(filename);
    const filePath = path.join(this.attachmentsDir, storyId, safeName);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new StorageError(`Failed to delete attachment: ${error.message}`);
      }
    }
  }

  /**
   * Checks if epic storage has been initialized
   * @returns {Promise<boolean>} True if initialized
   */
  async isInitialized() {
    try {
      const files = await fs.readdir(this.epicsDir);
      return files.some((f) => f.endsWith('.json'));
    } catch {
      return false;
    }
  }

  /**
   * Gets the General Epic
   * @returns {Promise<import('../models/epic.js').Epic|null>}
   */
  async getGeneralEpic() {
    return this.readEpic(GENERAL_EPIC_ID);
  }
}
