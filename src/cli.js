import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerFeatureCommand } from './commands/feature.js';
import { registerRunCommand } from './commands/run.js';
import { registerRepoCommand } from './commands/repo.js';
import { registerStatusCommand } from './commands/status.js';
import { registerResetCommand } from './commands/reset.js';
import { registerNextCommand } from './commands/next.js';
import { registerQuickCommand } from './commands/quick.js';

export function createCli() {
  const program = new Command();

  program
    .name('aia')
    .description('AI Architecture Assistant')
    .version('0.1.0');

  registerInitCommand(program);
  registerFeatureCommand(program);
  registerRunCommand(program);
  registerNextCommand(program);
  registerQuickCommand(program);
  registerRepoCommand(program);
  registerStatusCommand(program);
  registerResetCommand(program);

  return program;
}
