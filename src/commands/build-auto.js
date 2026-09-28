import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { checkBmadInstall, printReport } from '../services/bmad-check.js';

/** @typedef {'draft' | 'ready-for-dev' | 'in-progress' | 'in-review' | 'done' | 'blocked'} SpecStatus */

export const EXIT = Object.freeze({ done: 0, error: 1, blocked: 2, readyForDev: 3, install: 4 });

/**
 * @typedef {object} BuildAutoOptions
 * @property {string} [folder]
 * @property {string} [id]
 * @property {boolean} [planOnly]
 * @property {boolean} worktree
 * @property {boolean} autocommit true par défaut ; --no-autocommit laisse les changements indexés pour relecture humaine
 * @property {string | false} [setup] undefined : détecté d'après le lockfile ; false (--no-setup) : aucun setup
 * @property {boolean} [cleanup]
 * @property {boolean} [force]
 * @property {boolean} [json]
 */

/**
 * @typedef {object} BuildAutoResult
 * @property {SpecStatus | 'unknown'} status
 * @property {string} [spec]
 * @property {string} worktree
 * @property {string} branch
 * @property {string} [baselineRevision]
 * @property {string} [commits]
 * @property {boolean} followupReviewRecommended
 * @property {Array<{ summary: string, evidence?: string, location?: string, severity?: string }>} deferred
 * @property {string} [blockingCondition]
 * @property {number} claudeExitCode
 * @property {number} [commitCount] nombre de commits produits par le run
 * @property {string[]} [safetyNetCommit] fichiers laissés non commités par le LLM et rattrapés par le filet de sécurité
 * @property {boolean} [staged] --no-autocommit : changements indexés, aucun commit sur la branche
 */

// ─── helpers ────────────────────────────────────────────────────────────────

const err = (s) => process.stderr.write(`${s}\n`);

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} : ${(r.stderr ?? '').trim()}`);
  return r.stdout.trim();
}

function buildPrompt(input, o) {
  const target = o.folder ? `spec folder: ${o.folder}\nstory id: ${o.id}` : input;
  const halt = o.planOnly
    ? '\n\nHalt after planning once the spec passes the READY FOR DEVELOPMENT gate.'
    : '';
  return `/bmad-build-auto ${target}${halt}`;
}

/** Commande d'installation déduite du lockfile : l'outil ne présuppose aucun gestionnaire de paquets. */
function detectSetup(cwd) {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm install --frozen-lockfile --prefer-offline';
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn install --frozen-lockfile --prefer-offline';
  if (existsSync(join(cwd, 'package-lock.json'))) return 'npm ci --prefer-offline';
  return '';
}

/** Worktree HORS du repo : évite que pnpm, tsserver ou WebStorm l'indexent. */
function createWorktree(root, label) {
  const name = `${label.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'run'}-${Date.now()}`;
  const path = join(dirname(root), `${basename(root)}-worktrees`, name);
  const branch = `bmad-auto/${name}`;
  mkdirSync(dirname(path), { recursive: true });
  git(['worktree', 'add', '-b', branch, path, 'HEAD'], root);
  return { path, branch };
}

/**
 * Le worktree part de HEAD : tout ce qui est gitignoré (config.user.toml, skills
 * non versionnés, settings.local.json...) manque. On copie sans écraser.
 */
function syncUntracked(root, wt, extra = []) {
  for (const rel of ['_bmad', '.claude/skills', '.claude/settings.local.json', ...extra]) {
    const src = join(root, rel);
    if (existsSync(src)) cpSync(src, join(wt, rel), { recursive: true, force: false, errorOnExist: false });
  }
}

function runClaude(prompt, cwd, onEvent) {
  return new Promise((res, rej) => {
    const p = spawn('claude', ['-p', prompt, '--output-format', 'stream-json', '--verbose'], {
      cwd,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    p.stdout.setEncoding('utf8');
    let buf = '';
    p.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) onEvent(line);
      }
    });
    p.on('error', rej);
    p.on('close', (code) => res(code ?? 1));
  });
}

/** Affichage humain minimal du flux stream-json. */
function printEvent(line) {
  try {
    const ev = JSON.parse(line);
    if (ev.type === 'assistant') {
      for (const block of ev.message?.content ?? []) {
        if (block.type === 'text' && block.text.trim()) err(`│ ${block.text.trim().split('\n')[0]}`);
        if (block.type === 'tool_use') err(`│ → ${block.name}`);
      }
    } else if (ev.type === 'result') {
      err(`│ fin du run (${Math.round((ev.duration_ms ?? 0) / 1000)} s)`);
    }
  } catch {
    /* ligne non JSON : ignorée */
  }
}

function artifactsDirs(wt) {
  const dirs = new Set([join(wt, '_bmad-output', 'implementation-artifacts')]);
  for (const f of ['_bmad/config.toml', '_bmad/config.user.toml', '_bmad/custom/config.toml', '_bmad/bmm/config.yaml']) {
    try {
      const m = readFileSync(join(wt, f), 'utf8').match(/implementation_artifacts\s*[:=]\s*["']?([^"'\n]+)/);
      if (m) dirs.add(join(wt, m[1].replace('{project-root}/', '').trim()));
    } catch {
      /* fichier absent */
    }
  }
  return [...dirs];
}

const listMd = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => join(dir, f)) : [];

function newest(files, since) {
  return files
    .map((f) => [f, statSync(f).mtimeMs])
    .filter(([, t]) => t >= since)
    .sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Ordre de recherche : dispatch dossier+ID, spec passée en entrée, puis spec/résultat récents. */
function findSpec(wt, specInput, o, since) {
  if (o.folder) {
    return newest(listMd(join(wt, o.folder, 'stories')).filter((f) => basename(f).startsWith(`${o.id}-`)), 0);
  }
  if (specInput && existsSync(join(wt, specInput))) return join(wt, specInput);
  const candidates = artifactsDirs(wt)
    .flatMap(listMd)
    .filter((f) => /^(spec-|bmad-build-auto-result-)/.test(basename(f)));
  return newest(candidates, since);
}

function readSpec(path) {
  const txt = readFileSync(path, 'utf8');
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = (m && parseYaml(m[1])) || {};
  const blockingCondition =
    fm.blocking_condition ?? fm.blocking ?? txt.match(/blocking condition[^:\n]*:\s*`?([^`\n]+)/i)?.[1]?.trim();
  return { fm, blockingCondition };
}

/**
 * Gestion déterministe des commits après un run `done` (pas de LLM dans cette boucle).
 * - autocommit : bmad-build-auto commite déjà à la fin ; on vérifie qu'il l'a fait
 *   et on rattrape ce qu'il aurait laissé (arbre sale, ou aucun commit).
 * - no-autocommit : on annule ses commits en gardant tout indexé pour relecture.
 * @param {BuildAutoResult} result
 */
function finalizeCommits(cwd, spec, base, autocommit, result) {
  if (autocommit) {
    const dirty = git(['status', '--porcelain'], cwd);
    if (dirty) {
      const files = dirty.split('\n').map((l) => l.slice(3));
      const title = readFileSync(spec, 'utf8').match(/^#\s+(.+)$/m)?.[1]?.trim() ?? basename(spec, '.md');
      git(['add', '-A'], cwd);
      git(['commit', '-m', `chore(bmad): finalise ${title}`, '-m', 'Commit de rattrapage : fichiers laissés non commités par bmad-build-auto.'], cwd);
      result.safetyNetCommit = files;
    }
    result.commitCount = Number(git(['rev-list', '--count', `${base}..HEAD`], cwd));
    return;
  }
  git(['reset', '--soft', base], cwd);
  git(['add', '-A'], cwd);
  result.staged = true;
  result.commitCount = 0;
  result.commits = undefined;
}

/** @param {BuildAutoResult} r */
function printResult(r) {
  const icon = { done: '✓', blocked: '✗', 'ready-for-dev': '◐' }[r.status] ?? '?';
  err(`\n${icon} Statut : ${r.status}`);
  if (r.spec) err(`  Spec     : ${r.spec}`);
  err(`  Branche  : ${r.branch}`);
  err(`  Worktree : ${r.worktree}`);
  if (r.commits) err(`  Commits  : ${r.commits} (${r.commitCount ?? '?'})`);
  if (r.status === 'done' && r.commitCount === 0 && !r.staged) err('  ⚠ Statut done mais aucun commit : diff vide ou run à vérifier');
  if (r.safetyNetCommit?.length) err(`  ⚠ Filet de sécurité : ${r.safetyNetCommit.length} fichier(s) commité(s) par la CLI : ${r.safetyNetCommit.join(', ')}`);
  if (r.staged) err('  Changements indexés, non commités (--no-autocommit) : relisez avec git diff --cached puis commitez.');
  if (r.followupReviewRecommended) err('  ⚠ Review supplémentaire recommandée : relancez build-auto sur la spec');
  if (r.deferred.length) {
    err(`  Findings reportés (${r.deferred.length}) :`);
    for (const d of r.deferred) err(`    - [${d.severity ?? '?'}] ${d.summary}${d.location ? ` (${d.location})` : ''}`);
  }
  if (r.status === 'blocked') {
    err(`  Blocage  : ${r.blockingCondition ?? 'non renseigné, voir la spec'}`);
    if (r.blockingCondition?.includes('intent gap'))
      err('  → Un patch de la tentative est référencé dans le triage log. Si la lecture est bonne : git apply + status in-review, puis relancer.');
    if (r.blockingCondition?.includes('story already blocked'))
      err('  → Blocage permanent : supprimez le fichier de story pour la relancer.');
  }
}

// ─── commande ───────────────────────────────────────────────────────────────

/**
 * @param {string} input
 * @param {BuildAutoOptions} o
 * @returns {Promise<number>}
 */
export async function buildAuto(input, o) {
  if (!input && !(o.folder && o.id)) {
    err('Donnez une intention, un ID de ticket ou un chemin de spec, ou bien --folder + --id.');
    return EXIT.error;
  }

  // 1. Vérification de l'installation BMAD dans le dossier courant
  const report = checkBmadInstall(process.cwd());
  printReport(report);
  if (!report.canRun) {
    if (!o.force) {
      err('✗ Installation BMAD incomplète : run annulé (--force pour passer outre).');
      if (o.json) console.log(JSON.stringify({ status: 'install-check-failed', report }));
      return EXIT.install;
    }
    err('⚠ --force : on continue malgré les erreurs.');
  }

  // 2. Worktree isolé
  const root = git(['rev-parse', '--show-toplevel'], process.cwd());
  if (git(['status', '--porcelain'], root)) {
    if (!o.worktree) {
      err("✗ Arbre de travail non propre : Build Auto l'exige. Commitez/stashez ou retirez --no-worktree.");
      return EXIT.error;
    }
    err('⚠ Modifications non commitées : elles ne seront PAS dans le worktree (créé depuis HEAD).');
  }

  const specInput = input.endsWith('.md') ? relative(root, resolve(input)) : undefined;
  const label = o.id ? `story-${o.id}` : specInput ? basename(specInput, '.md') : input;
  const { path: cwd, branch } = o.worktree
    ? createWorktree(root, label)
    : { path: root, branch: git(['branch', '--show-current'], root) };

  if (o.worktree) {
    syncUntracked(root, cwd, specInput ? [specInput] : []);
    const setup = o.setup === false ? '' : o.setup ?? detectSetup(cwd);
    if (setup) {
      err(`Préparation du worktree : ${setup}`);
      const r = spawnSync(setup, { cwd, shell: true, stdio: ['ignore', 2, 2] });
      if (r.status !== 0) {
        err('✗ Échec de la commande de setup.');
        return EXIT.error;
      }
    }
  }

  // 3. Run headless
  const startHead = git(['rev-parse', 'HEAD'], cwd);
  const since = Date.now() - 1000;
  err(`\nLancement de bmad-build-auto dans ${cwd}\n`);
  const claudeExitCode = await runClaude(buildPrompt(specInput ?? input, o), cwd, (line) =>
    o.json ? err(line) : printEvent(line),
  );

  // 4. L'état se lit dans la spec, jamais dans la sortie du chat
  const spec = findSpec(cwd, specInput, o, since);
  /** @type {BuildAutoResult} */
  const result = {
    status: 'unknown',
    spec,
    worktree: cwd,
    branch,
    followupReviewRecommended: false,
    deferred: [],
    claudeExitCode,
  };
  if (spec) {
    const { fm, blockingCondition } = readSpec(spec);
    result.status = fm.status ?? 'unknown';
    result.baselineRevision = fm.baseline_revision;
    result.commits = `${fm.baseline_revision && fm.baseline_revision !== 'NO_VCS' ? fm.baseline_revision : startHead}..${branch}`;
    result.followupReviewRecommended = Boolean(fm.followup_review_recommended);
    result.deferred = Array.isArray(fm.deferred) ? fm.deferred : [];
    result.blockingCondition = blockingCondition;

    if (result.status === 'done') {
      const base = fm.baseline_revision && fm.baseline_revision !== 'NO_VCS' ? fm.baseline_revision : startHead;
      try {
        finalizeCommits(cwd, spec, base, o.autocommit, result);
      } catch (e) {
        err(`⚠ Gestion des commits impossible : ${e.message}`);
      }
    }
  } else {
    err('✗ Aucune spec ni fichier de résultat trouvé après le run.');
  }

  // Les commits restent sur la branche. La spec peut être non versionnée
  // (_bmad-output gitignoré) : on la rapatrie avant de supprimer le worktree.
  if (o.cleanup && result.staged) {
    err('⚠ --cleanup ignoré : avec --no-autocommit, supprimer le worktree ferait perdre les changements indexés.');
  }
  if (o.cleanup && o.worktree && result.status === 'done' && !result.staged) {
    try {
      if (spec) {
        const back = join(root, relative(cwd, spec));
        mkdirSync(dirname(back), { recursive: true });
        cpSync(spec, back);
        result.spec = back;
      }
      git(['worktree', 'remove', '--force', cwd], root);
      result.worktree = '';
      err(`Worktree retiré, commits conservés sur ${branch}, spec copiée dans le repo.`);
    } catch (e) {
      err(`⚠ Nettoyage du worktree impossible : ${e.message}`);
    }
  }

  if (o.json) console.log(JSON.stringify(result));
  else printResult(result);

  switch (result.status) {
    case 'done': return EXIT.done;
    case 'blocked': return EXIT.blocked;
    case 'ready-for-dev': return EXIT.readyForDev;
    default: return EXIT.error;
  }
}

export function registerBuildAutoCommand(program) {
  program
    .command('build-auto')
    .description('Lance bmad-build-auto sur une story, en headless et dans un worktree isolé')
    .argument('[input]', 'intention libre, ID de ticket ou chemin de spec (.md)')
    .option('--folder <dir>', 'dossier de spec (dispatch dossier + ID)')
    .option('--id <id>', 'ID de story dans stories.yaml')
    .option('--plan-only', "s'arrête à ready-for-dev pour validation humaine de la spec")
    .option('--no-worktree', 'exécute dans le repo courant (arbre propre requis)')
    .option('--setup <cmd>', 'commande lancée dans le worktree avant le run (défaut : install selon le lockfile pnpm/yarn/npm)')
    .option('--no-setup', 'aucune commande de préparation du worktree')
    .option('--no-autocommit', 'annule les commits du run et laisse les changements indexés pour relecture')
    .option('--cleanup', 'retire le worktree si le run finit en done (la branche reste)')
    .option('--force', "ignore les erreurs du contrôle d'installation BMAD")
    .option('--json', "sortie JSON sur stdout (pour l'UI), logs sur stderr")
    .action(async (input, o) => {
      if (o.folder && !o.id) {
        err('--folder exige --id.');
        process.exitCode = EXIT.error;
        return;
      }
      process.exitCode = await buildAuto(input ?? '', o);
    });

  program
    .command('bmad-doctor')
    .description("Vérifie l'installation BMAD dans le dossier courant")
    .option('--json', "sortie JSON (pour l'UI)")
    .action((o) => {
      const report = checkBmadInstall(process.cwd());
      if (o.json) console.log(JSON.stringify(report));
      else printReport(report, process.stdout);
      process.exitCode = report.canRun ? 0 : EXIT.install;
    });
}
