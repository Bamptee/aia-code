import path from 'node:path';
import fs from 'fs-extra';
import { AIA_DIR, AIA_FOLDERS } from '../constants.js';

export async function createAiaStructure(root = process.cwd()) {
  for (const folder of AIA_FOLDERS) {
    await fs.ensureDir(path.join(root, AIA_DIR, folder));
  }
}
