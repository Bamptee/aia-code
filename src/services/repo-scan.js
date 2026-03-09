import path from 'node:path';
import fs from 'fs-extra';
import { AIA_DIR, SCAN_IGNORE, SCAN_CATEGORIES } from '../constants.js';

const CODE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs',
  '.ts', '.mts', '.cts',
  '.jsx', '.tsx',
  '.json',
]);

async function walk(dir, root) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (SCAN_IGNORE.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walk(fullPath, root));
    } else if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.relative(root, fullPath));
    }
  }

  return files;
}

function categorize(files) {
  const map = {};

  for (const file of files) {
    for (const [category, pattern] of Object.entries(SCAN_CATEGORIES)) {
      if (pattern.test(file)) {
        (map[category] ??= []).push(file);
        break;
      }
    }
  }

  for (const key of Object.keys(map)) {
    map[key].sort();
  }

  return map;
}

export async function scanRepo(root = process.cwd()) {
  const files = (await walk(root, root)).sort();
  const map = categorize(files);

  const outputPath = path.join(root, AIA_DIR, 'repo-map.json');
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeJson(outputPath, map, { spaces: 2 });

  return { map, total: files.length, outputPath };
}
