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
import { registerEpicCommand } from './commands/epic.js';
import { registerStoryCommand } from './commands/story.js';
import { registerQACommand } from './commands/qa.js';
import { registerRoadmapCommand } from './commands/roadmap.js';
import { registerPOCCommand } from './commands/poc.js';
import { registerSystemCommands } from './commands/system.js';
import { registerTaskCommand } from './commands/task.js';
import { registerMigrateCommand } from './commands/migrate.js';
import { registerQAGenCommand } from './commands/qa-gen.js';

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

  // Epic & Product Management commands
  registerEpicCommand(program);
  registerStoryCommand(program);
  registerQACommand(program);
  registerRoadmapCommand(program);
  registerPOCCommand(program);
  registerTaskCommand(program);
  registerSystemCommands(program);
  registerMigrateCommand(program);
  registerQAGenCommand(program);

  return program;
}
