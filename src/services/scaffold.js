import path from 'node:path';
import fs from 'fs-extra';
import { AIA_DIR, AIA_FOLDERS } from '../constants.js';

const CONTEXT_TEMPLATES = {
  'context/project.md': `# Project

<!-- Describe your project here. This is injected into every AI prompt. -->

## Stack


## Description

`,
  'context/architecture.md': `# Architecture

<!-- Describe your architecture here. -->

## Overview


## Key decisions

`,
};

export async function createAiaStructure(root = process.cwd()) {
  for (const folder of AIA_FOLDERS) {
    await fs.ensureDir(path.join(root, AIA_DIR, folder));
  }

  for (const [file, content] of Object.entries(CONTEXT_TEMPLATES)) {
    const filePath = path.join(root, AIA_DIR, file);
    if (!(await fs.pathExists(filePath))) {
      await fs.writeFile(filePath, content, 'utf-8');
    }
  }
}
