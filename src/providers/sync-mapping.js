/**
 * @fileoverview Mapping manager for sync provider associations (slug ↔ taskId)
 * @module providers/sync-mapping
 */

import fs from 'fs-extra';
import path from 'node:path';
import { AIA_DIR } from '../constants.js';

function mappingPath(providerName, root) {
  return path.join(root, AIA_DIR, 'integrations', providerName, 'mapping.json');
}

// Simple in-process lock to serialize read-modify-write on the same file
const _locks = new Map();
async function withLock(key, fn) {
  while (_locks.get(key)) {
    await _locks.get(key);
  }
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  _locks.set(key, promise);
  try {
    return await fn();
  } finally {
    _locks.delete(key);
    resolve();
  }
}

export async function loadMapping(providerName, root = process.cwd()) {
  const filePath = mappingPath(providerName, root);
  if (!(await fs.pathExists(filePath))) {
    return {};
  }
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw) || {};
}

export async function saveMapping(providerName, mapping, root = process.cwd()) {
  const filePath = mappingPath(providerName, root);
  await fs.ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(mapping, null, 2), 'utf-8');
  await fs.rename(tempPath, filePath);
}

export async function getMapping(providerName, slug, root = process.cwd()) {
  const mapping = await loadMapping(providerName, root);
  return mapping[slug] || null;
}

export async function setMapping(providerName, slug, data, root = process.cwd()) {
  const key = mappingPath(providerName, root);
  return withLock(key, async () => {
    const mapping = await loadMapping(providerName, root);
    mapping[slug] = { ...mapping[slug], ...data };
    await saveMapping(providerName, mapping, root);
  });
}

export async function removeMapping(providerName, slug, root = process.cwd()) {
  const key = mappingPath(providerName, root);
  return withLock(key, async () => {
    const mapping = await loadMapping(providerName, root);
    delete mapping[slug];
    await saveMapping(providerName, mapping, root);
  });
}

export async function findByExternalId(providerName, externalId, root = process.cwd()) {
  const mapping = await loadMapping(providerName, root);
  for (const [slug, entry] of Object.entries(mapping)) {
    if (entry.taskId === externalId) {
      return slug;
    }
  }
  return null;
}
