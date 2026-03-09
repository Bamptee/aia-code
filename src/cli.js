import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerFeatureCommand } from './commands/feature.js';
import { registerRunCommand } from './commands/run.js';
import { registerRepoCommand } from './commands/repo.js';

export function createCli() {
  const program = new Command();

  program
    .name('aia')
    .description('AI Architecture Assistant')
    .version('0.1.0');

  registerInitCommand(program);
  registerFeatureCommand(program);
  registerRunCommand(program);
  registerRepoCommand(program);

  return program;
}
