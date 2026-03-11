import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
import { registerInitCommand } from './commands/init.js';
import { registerFeatureCommand } from './commands/feature.js';
import { registerRunCommand } from './commands/run.js';
import { registerRepoCommand } from './commands/repo.js';
import { registerStatusCommand } from './commands/status.js';
import { registerResetCommand } from './commands/reset.js';
import { registerNextCommand } from './commands/next.js';
import { registerQuickCommand } from './commands/quick.js';
import { registerIterateCommand } from './commands/iterate.js';
import { registerUiCommand } from './commands/ui.js';

export function createCli() {
  const program = new Command();

  program
    .name('aia')
    .description('AI Architecture Assistant')
    .version(pkg.version);

  registerInitCommand(program);
  registerFeatureCommand(program);
  registerRunCommand(program);
  registerNextCommand(program);
  registerQuickCommand(program);
  registerRepoCommand(program);
  registerStatusCommand(program);
  registerResetCommand(program);
  registerIterateCommand(program);
  registerUiCommand(program);

  return program;
}
