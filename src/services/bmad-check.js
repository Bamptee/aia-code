import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

/** @typedef {'ok' | 'warn' | 'error'} Level */

/**
 * @typedef {object} CheckItem
 * @property {string} id
 * @property {Level} level
 * @property {string} message
 * @property {string} [hint]
 */

/**
 * @typedef {object} BmadReport
 * @property {string} cwd
 * @property {CheckItem[]} items
 * @property {boolean} canRun false dès qu'un item est en "error"
 * @property {'project' | 'agents' | 'global'} [skillSource] où bmad-build-auto a été trouvé
 */

const SKILL = 'bmad-build-auto';
/** Présents sur une install BMAD < 6.11, quand bmad-build-auto n'existait pas encore */
const LEGACY_SKILLS = ['bmad-dev-auto', 'bmad-quick-dev', 'bmad-dev-story'];
/** Overrides à renommer depuis la 6.11 (Quick Dev -> Build) */
const LEGACY_OVERRIDES = [
  'bmad-dev-auto.toml',
  'bmad-dev-auto.user.toml',
  'bmad-quick-dev.toml',
  'bmad-quick-dev.user.toml',
];

const hasSkill = (base, name) => existsSync(join(base, name, 'SKILL.md'));

const countBmadSkills = (base) =>
  existsSync(base)
    ? readdirSync(base).filter((d) => d.startsWith('bmad-') && hasSkill(base, d)).length
    : 0;

function commandVersion(cmd, cwd) {
  const r = spawnSync(cmd, ['--version'], { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim().split('\n')[0] : null;
}

function hasPermissionAllowlist(cwd) {
  return ['.claude/settings.json', '.claude/settings.local.json'].some((f) => {
    try {
      const json = JSON.parse(readFileSync(join(cwd, f), 'utf8'));
      return (json?.permissions?.allow?.length ?? 0) > 0;
    } catch {
      return false;
    }
  });
}

/**
 * @param {string} [cwd]
 * @returns {BmadReport}
 */
export function checkBmadInstall(cwd = process.cwd()) {
  /** @type {CheckItem[]} */
  const items = [];
  const add = (id, level, message, hint) => items.push({ id, level, message, hint });

  const projectSkills = join(cwd, '.claude', 'skills');
  const agentsSkills = join(cwd, '.agents', 'skills');
  const globalSkills = join(homedir(), '.claude', 'skills');
  const installHint = 'npx bmad-method install (module BMM, outil Claude Code) à la racine du repo';

  // 1. Dossiers attendus dans le dossier courant
  if (existsSync(join(cwd, '.claude'))) add('claude-dir', 'ok', '.claude/ présent');
  else add('claude-dir', 'warn', 'Aucun dossier .claude/ dans le dossier courant', 'Lancez la commande depuis la racine du repo');

  if (existsSync(join(cwd, '_bmad'))) add('bmad-dir', 'ok', '_bmad/ présent');
  else add('bmad-dir', 'warn', 'Aucun dossier _bmad/ dans le dossier courant', installHint);

  // 2. Skill bmad-build-auto
  /** @type {BmadReport['skillSource']} */
  let skillSource;
  if (hasSkill(projectSkills, SKILL)) {
    skillSource = 'project';
    add('skill', 'ok', `${SKILL} trouvé (${countBmadSkills(projectSkills)} skills bmad-* dans .claude/skills)`);
  } else if (hasSkill(agentsSkills, SKILL)) {
    skillSource = 'agents';
    add('skill', 'warn', `${SKILL} trouvé uniquement dans .agents/skills`, "Vérifiez que Claude Code le charge, sinon réinstallez avec l'outil Claude Code");
  } else if (hasSkill(globalSkills, SKILL)) {
    skillSource = 'global';
    add('skill', 'warn', `${SKILL} introuvable dans le dossier courant, présent seulement dans ~/.claude/skills`, `Les autres devs et la CI ne l'auront pas : ${installHint}`);
  } else {
    const legacy = LEGACY_SKILLS.find((s) => hasSkill(projectSkills, s));
    add(
      'skill',
      'error',
      legacy
        ? `BMAD installé mais antérieur à la 6.11 (${legacy} trouvé, pas ${SKILL})`
        : `Skill ${SKILL} introuvable (ni dans .claude/skills, ni en global)`,
      legacy ? 'Mettez BMAD à jour : npx bmad-method install' : installHint,
    );
  }

  // 3. Overrides legacy, ignorés par bmad-build-auto
  for (const f of LEGACY_OVERRIDES) {
    if (existsSync(join(cwd, '_bmad', 'custom', f))) {
      const target = f.replace('bmad-dev-auto', 'bmad-build-auto').replace('bmad-quick-dev', 'bmad-build');
      add('legacy-override', 'warn', `Override legacy _bmad/custom/${f} : ignoré par ${SKILL}`, `Renommez-le en ${target}`);
    }
  }

  // 4. Outils requis
  const uv = commandVersion('uv', cwd);
  if (uv) add('uv', 'ok', uv);
  else add('uv', 'error', "uv introuvable : bmad-build-auto s'arrête sans lui", 'brew install uv');

  const claude = commandVersion('claude', cwd);
  if (claude) add('claude-cli', 'ok', `Claude Code ${claude}`);
  else add('claude-cli', 'error', 'CLI claude introuvable dans le PATH');

  // 5. Git
  const inGit = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, encoding: 'utf8' }).stdout?.trim() === 'true';
  if (inGit) add('git', 'ok', 'Dépôt git détecté');
  else add('git', 'error', 'Pas de dépôt git : worktree et suivi des commits impossibles');

  // 6. Permissions headless
  if (hasPermissionAllowlist(cwd)) add('permissions', 'ok', 'Allowlist de permissions Claude Code présente');
  else add(
    'permissions',
    'warn',
    'Aucune allowlist dans .claude/settings*.json : en headless, git/uv/le gestionnaire de paquets seront refusés et le run finira blocked',
    'Ajoutez permissions.allow, ex. ["Bash(git:*)", "Bash(uv run:*)", "Bash(pnpm:*)"]',
  );

  return { cwd, items, canRun: !items.some((i) => i.level === 'error'), skillSource };
}

/**
 * @param {BmadReport} report
 * @param {NodeJS.WritableStream} [out]
 */
export function printReport(report, out = process.stderr) {
  const icon = { ok: '✓', warn: '⚠', error: '✗' };
  out.write('Vérification BMAD\n');
  for (const i of report.items) {
    out.write(`  ${icon[i.level]} ${i.message}\n`);
    if (i.hint && i.level !== 'ok') out.write(`      → ${i.hint}\n`);
  }
  out.write('\n');
}
