/**
 * @fileoverview Path utilities for Epic & Product Management System
 * @module epic/utils/path-utils
 */

import path from 'node:path';
import { SecurityError } from './errors.js';

/**
 * Base directory name for Epic storage
 * @constant {string}
 */
export const AIA_EPIC_DIR = '.aia';

/**
 * Gets the .aia directory path for a project
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {string} Path to .aia directory
 */
export function getAiaDir(baseDir = process.cwd()) {
  return path.join(baseDir, AIA_EPIC_DIR);
}

/**
 * Gets the epics directory path
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {string} Path to epics directory
 */
export function getEpicsDir(baseDir = process.cwd()) {
  return path.join(getAiaDir(baseDir), 'epics');
}

/**
 * Gets the cache directory path
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {string} Path to cache directory
 */
export function getCacheDir(baseDir = process.cwd()) {
  return path.join(getAiaDir(baseDir), 'cache');
}

/**
 * Gets the Figma cache directory path
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {string} Path to Figma cache directory
 */
export function getFigmaCacheDir(baseDir = process.cwd()) {
  return path.join(getCacheDir(baseDir), 'figma');
}

/**
 * Gets the attachments directory path
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {string} Path to attachments directory
 */
export function getAttachmentsDir(baseDir = process.cwd()) {
  return path.join(getAiaDir(baseDir), 'attachments');
}

/**
 * Gets the POC directory path
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {string} Path to POC directory
 */
export function getPocDir(baseDir = process.cwd()) {
  return path.join(baseDir, 'poc');
}

/**
 * Gets the story index directory path
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {string} Path to index directory
 */
export function getIndexDir(baseDir = process.cwd()) {
  return path.join(getAiaDir(baseDir), 'index');
}

/**
 * Gets the config file path
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {string} Path to config.json
 */
export function getConfigPath(baseDir = process.cwd()) {
  return path.join(getAiaDir(baseDir), 'epic-config.json');
}

/**
 * Sanitizes a filename to prevent path traversal attacks
 * @param {string} filename - Filename to sanitize
 * @param {string} baseDir - Base directory the file should stay within
 * @returns {string} Safe filename (basename only)
 * @throws {SecurityError} If filename contains path traversal attempts
 */
export function sanitizePath(filename, baseDir) {
  if (!filename || typeof filename !== 'string') {
    throw new SecurityError('Invalid filename');
  }

  // Get just the basename to strip any directory components
  const safeName = path.basename(filename);

  // Verify no sneaky characters remain
  if (safeName.includes('..') || safeName.includes('\0')) {
    throw new SecurityError(`Invalid filename: ${filename}`);
  }

  // Verify the resolved path stays within baseDir
  const targetPath = path.resolve(baseDir, safeName);
  const resolvedBase = path.resolve(baseDir);

  if (!targetPath.startsWith(resolvedBase + path.sep) && targetPath !== resolvedBase) {
    throw new SecurityError(`Invalid filename: ${filename}`);
  }

  return safeName;
}

/**
 * Validates that a path is within an allowed directory
 * @param {string} targetPath - Path to validate
 * @param {string} allowedDir - Directory the path must be within
 * @returns {boolean} True if path is valid
 */
export function isPathWithinDir(targetPath, allowedDir) {
  const resolved = path.resolve(targetPath);
  const resolvedAllowed = path.resolve(allowedDir);
  return resolved.startsWith(resolvedAllowed + path.sep) || resolved === resolvedAllowed;
}

/**
 * Gets the Epic file path
 * @param {string} epicId - Epic ID
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {string} Path to Epic JSON file
 */
export function getEpicFilePath(epicId, baseDir = process.cwd()) {
  return path.join(getEpicsDir(baseDir), `${epicId}.json`);
}

/**
 * Gets the General Epic file path (prefixed with _ to sort first)
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {string} Path to General Epic JSON file
 */
export function getGeneralEpicFilePath(baseDir = process.cwd()) {
  return path.join(getEpicsDir(baseDir), '_general.json');
}

/**
 * Gets the story index file path
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {string} Path to stories index JSON file
 */
export function getStoryIndexPath(baseDir = process.cwd()) {
  return path.join(getIndexDir(baseDir), 'stories.json');
}
