/**
 * @fileoverview POC Environment Service - Creates isolated environments for POC execution
 * @module epic/services/poc-environment-service
 */

import path from 'node:path';
import { execSync } from 'node:child_process';
import fs from 'fs-extra';
import { NotFoundError } from '../utils/errors.js';

/**
 * Service for creating isolated POC environments
 */
export class POCEnvironmentService {
  /**
   * @param {import('../providers/file-storage-provider.js').FileStorageProvider} storage
   * @param {import('./story-service.js').StoryService} storyService
   */
  constructor(storage, storyService) {
    this.storage = storage;
    this.storyService = storyService;
  }

  /**
   * Creates an isolated environment for POC execution
   * @param {string} storyId - Story ID
   * @param {Object} [options] - Environment options
   * @param {boolean} [options.withGit=true] - Initialize git
   * @param {boolean} [options.withDeps=true] - Install dependencies
   * @param {string} [options.template='minimal'] - Template type: 'minimal', 'node', 'vite', 'next'
   * @returns {Promise<{path: string, scripts: Object}>}
   */
  async createEnvironment(storyId, options = {}) {
    const { withGit = true, withDeps = true, template = 'minimal' } = options;

    const { epic, story } = await this.storyService.findStoryWithEpic(storyId);
    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }

    // Create isolated directory
    const envDir = this._getEnvPath(storyId);
    await fs.ensureDir(envDir);

    // Create based on template
    const templateSetup = this._getTemplateSetup(template);
    await this._setupTemplate(envDir, templateSetup, story);

    // Initialize git if requested
    if (withGit) {
      await this._initGit(envDir);
    }

    // Install dependencies if requested and template has them
    if (withDeps && templateSetup.hasDeps) {
      await this._installDeps(envDir);
    }

    // Record environment metadata
    const metadata = {
      storyId,
      epicId: epic.id,
      template,
      createdAt: new Date().toISOString(),
      scripts: templateSetup.scripts,
    };
    await fs.writeJSON(path.join(envDir, '.poc-env.json'), metadata, { spaces: 2 });

    return {
      path: envDir,
      scripts: templateSetup.scripts,
    };
  }

  /**
   * Gets the path to an existing environment
   * @param {string} storyId - Story ID
   * @returns {Promise<string|null>}
   */
  async getEnvironmentPath(storyId) {
    const envDir = this._getEnvPath(storyId);
    if (await fs.pathExists(envDir)) {
      return envDir;
    }
    return null;
  }

  /**
   * Checks if an environment exists
   * @param {string} storyId - Story ID
   * @returns {Promise<boolean>}
   */
  async exists(storyId) {
    return fs.pathExists(this._getEnvPath(storyId));
  }

  /**
   * Removes an isolated environment
   * @param {string} storyId - Story ID
   * @returns {Promise<void>}
   */
  async removeEnvironment(storyId) {
    const envDir = this._getEnvPath(storyId);
    if (await fs.pathExists(envDir)) {
      await fs.remove(envDir);
    }
  }

  /**
   * Lists all environments
   * @returns {Promise<Array<{storyId: string, path: string, createdAt: string}>>}
   */
  async listEnvironments() {
    const baseDir = path.join(this.storage.root, '.aia', 'poc-envs');
    if (!(await fs.pathExists(baseDir))) {
      return [];
    }

    const dirs = await fs.readdir(baseDir);
    const envs = [];

    for (const dir of dirs) {
      const metaPath = path.join(baseDir, dir, '.poc-env.json');
      if (await fs.pathExists(metaPath)) {
        const meta = await fs.readJSON(metaPath);
        envs.push({
          storyId: meta.storyId,
          path: path.join(baseDir, dir),
          createdAt: meta.createdAt,
          template: meta.template,
        });
      }
    }

    return envs;
  }

  /**
   * Copies POC file to environment
   * @param {string} storyId - Story ID
   * @param {string} filename - POC filename
   * @returns {Promise<string>} Path to copied file
   */
  async copyPOCToEnv(storyId, filename) {
    const envDir = await this.getEnvironmentPath(storyId);
    if (!envDir) {
      throw new NotFoundError(`Environment for story ${storyId} not found`);
    }

    const pocData = await this.storage.readAttachment(storyId, filename);
    const destPath = path.join(envDir, 'src', filename);
    await fs.ensureDir(path.dirname(destPath));
    await fs.writeFile(destPath, pocData);

    return destPath;
  }

  /**
   * Runs a command in the environment
   * @param {string} storyId - Story ID
   * @param {string} command - Command to run
   * @returns {Promise<{stdout: string, stderr: string}>}
   */
  async runCommand(storyId, command) {
    const envDir = await this.getEnvironmentPath(storyId);
    if (!envDir) {
      throw new NotFoundError(`Environment for story ${storyId} not found`);
    }

    try {
      const stdout = execSync(command, {
        cwd: envDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { stdout, stderr: '' };
    } catch (error) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
      };
    }
  }

  /**
   * @private
   */
  _getEnvPath(storyId) {
    const sanitizedId = storyId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.storage.root, '.aia', 'poc-envs', sanitizedId);
  }

  /**
   * @private
   */
  _getTemplateSetup(template) {
    const templates = {
      minimal: {
        hasDeps: false,
        scripts: { run: 'node src/poc.js' },
        files: {
          'src/poc.js': '// POC code will be placed here\n',
          'README.md': '# POC Environment\n\nRun with: `node src/poc.js`\n',
        },
      },
      node: {
        hasDeps: true,
        scripts: {
          run: 'node src/index.js',
          test: 'node --test',
          dev: 'node --watch src/index.js',
        },
        files: {
          'src/index.js': '// Entry point\n',
          'package.json': JSON.stringify(
            {
              name: 'poc-environment',
              type: 'module',
              scripts: {
                start: 'node src/index.js',
                test: 'node --test',
                dev: 'node --watch src/index.js',
              },
            },
            null,
            2
          ),
          'README.md': '# POC Environment\n\n```bash\nnpm install\nnpm start\n```\n',
        },
      },
      vite: {
        hasDeps: true,
        scripts: {
          run: 'npm run dev',
          build: 'npm run build',
          preview: 'npm run preview',
        },
        files: {
          'index.html':
            '<!DOCTYPE html>\n<html>\n<head><title>POC</title></head>\n<body>\n<div id="app"></div>\n<script type="module" src="/src/main.js"></script>\n</body>\n</html>',
          'src/main.js': '// Vite entry point\n',
          'package.json': JSON.stringify(
            {
              name: 'poc-vite',
              type: 'module',
              scripts: {
                dev: 'vite',
                build: 'vite build',
                preview: 'vite preview',
              },
              devDependencies: {
                vite: '^5.0.0',
              },
            },
            null,
            2
          ),
          'vite.config.js': 'import { defineConfig } from "vite";\nexport default defineConfig({});\n',
        },
      },
      next: {
        hasDeps: true,
        scripts: {
          run: 'npm run dev',
          build: 'npm run build',
          start: 'npm run start',
        },
        files: {
          'app/page.js':
            'export default function Home() {\n  return <main>POC</main>;\n}\n',
          'app/layout.js':
            'export default function RootLayout({ children }) {\n  return (\n    <html><body>{children}</body></html>\n  );\n}\n',
          'package.json': JSON.stringify(
            {
              name: 'poc-next',
              scripts: {
                dev: 'next dev',
                build: 'next build',
                start: 'next start',
              },
              dependencies: {
                next: '^14.0.0',
                react: '^18.0.0',
                'react-dom': '^18.0.0',
              },
            },
            null,
            2
          ),
          'next.config.js': 'module.exports = {};\n',
        },
      },
    };

    return templates[template] || templates.minimal;
  }

  /**
   * @private
   */
  async _setupTemplate(envDir, templateSetup, story) {
    // Create files from template
    for (const [filePath, content] of Object.entries(templateSetup.files)) {
      const fullPath = path.join(envDir, filePath);
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, content);
    }

    // Add story context file
    const contextContent = `# Story Context

**Title:** ${story.title}
**ID:** ${story.id}

## Description
${story.description || 'No description'}

## Steps Completed
- Init: ${story.steps.init.completed ? 'Yes' : 'No'}
- Spec-Func: ${story.steps.specFunc.completed ? 'Yes' : 'No'}
- Brainstorming: ${story.steps.brainstorming.completed ? 'Yes' : 'No'}
`;
    await fs.writeFile(path.join(envDir, 'STORY_CONTEXT.md'), contextContent);
  }

  /**
   * @private
   */
  async _initGit(envDir) {
    try {
      execSync('git init', { cwd: envDir, stdio: 'pipe' });
      await fs.writeFile(path.join(envDir, '.gitignore'), 'node_modules/\n.DS_Store\n');
      execSync('git add .', { cwd: envDir, stdio: 'pipe' });
      execSync('git commit -m "Initial POC environment"', { cwd: envDir, stdio: 'pipe' });
    } catch {
      // Git init failed, continue without git
    }
  }

  /**
   * @private
   */
  async _installDeps(envDir) {
    const packageJsonPath = path.join(envDir, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      try {
        execSync('npm install', { cwd: envDir, stdio: 'pipe' });
      } catch {
        // npm install failed, continue without deps
      }
    }
  }
}
