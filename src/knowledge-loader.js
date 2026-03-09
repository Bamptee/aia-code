import path from 'node:path';
import fs from 'fs-extra';
import { AIA_DIR } from './constants.js';

async function collectMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function loadKnowledge(categories, root = process.cwd()) {
  const knowledgeDir = path.join(root, AIA_DIR, 'knowledge');
  const sections = [];

  for (const category of categories) {
    const categoryDir = path.join(knowledgeDir, category);

    if (!(await fs.pathExists(categoryDir))) {
      continue;
    }

    const files = (await collectMarkdownFiles(categoryDir)).sort();

    for (const filePath of files) {
      const content = (await fs.readFile(filePath, 'utf-8')).trim();
      if (content) {
        sections.push(content);
      }
    }
  }

  return sections.join('\n\n---\n\n');
}
