import chalk from 'chalk';
import { scanRepo } from '../services/repo-scan.js';

export function registerRepoCommand(program) {
  const repo = program
    .command('repo')
    .description('Repository intelligence tools');

  repo
    .command('scan')
    .description('Scan the codebase and generate .aia/repo-map.json')
    .action(async () => {
      try {
        const { map, total, outputPath } = await scanRepo();

        const categories = Object.keys(map);
        const matched = Object.values(map).reduce((s, f) => s + f.length, 0);

        console.log(chalk.green(`Scanned ${total} files, categorized ${matched} into ${categories.length} groups.`));
        for (const [cat, files] of Object.entries(map)) {
          console.log(chalk.cyan(`  ${cat}: ${files.length} files`));
        }
        console.log(chalk.gray(`Written to ${outputPath}`));
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    });
}
