import path from 'node:path';
import fs from 'fs-extra';
import { AIA_DIR } from './constants.js';

const LOG_FILE = 'execution.log';

function formatEntry({ feature, step, model, duration }) {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, '');
  const durationSec = (duration / 1000).toFixed(1);

  return [
    timestamp,
    `feature=${feature}`,
    `step=${step}`,
    `model=${model}`,
    `duration=${durationSec}s`,
    '',
  ].join('\n');
}

export async function logExecution(entry, root = process.cwd()) {
  const logDir = path.join(root, AIA_DIR, 'logs');
  await fs.ensureDir(logDir);

  const logPath = path.join(logDir, LOG_FILE);
  const line = formatEntry(entry);
  await fs.appendFile(logPath, line + '\n', 'utf-8');
}
