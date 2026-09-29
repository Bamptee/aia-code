/**
 * @fileoverview Dev Plan Parser - Extracts structured tasks from dev-plan markdown
 * @module services/dev-plan-parser
 */

/**
 * Parses a dev-plan markdown file and extracts structured tasks
 * @param {string} markdown - Dev plan markdown content
 * @returns {Array<{id: string, title: string, files: string[], details: string, dependencies: string[], tests: string}>}
 */
export function parseDevPlan(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return [];
  }

  const tasks = [];

  // Match task headers: ## Task N: Title or ### Task N: Title
  // Also match variations like: ## Task 1 - Title, ## 1. Title, etc.
  const taskRegex = /^#{2,3}\s*(?:Task\s*)?(\d+)[:\.\-\s]+(.+?)$/gm;

  let match;
  const taskPositions = [];

  // Find all task headers and their positions
  while ((match = taskRegex.exec(markdown)) !== null) {
    taskPositions.push({
      id: `task-${match[1]}`,
      number: parseInt(match[1], 10),
      title: match[2].trim(),
      start: match.index,
      headerEnd: match.index + match[0].length,
    });
  }

  // Extract content for each task
  for (let i = 0; i < taskPositions.length; i++) {
    const task = taskPositions[i];
    const nextTaskStart = taskPositions[i + 1]?.start ?? markdown.length;
    const taskContent = normalizeFieldLabels(markdown.slice(task.headerEnd, nextTaskStart).trim());

    // Parse task content for structured fields
    const parsedTask = {
      id: task.id,
      number: task.number,
      title: task.title,
      files: extractFiles(taskContent),
      details: extractDetails(taskContent),
      dependencies: extractDependencies(taskContent),
      tests: extractTests(taskContent),
      covers: extractField(taskContent, /(?:Covers|Couvre|Traces?)/),
      doneWhen: extractField(taskContent, /(?:Done\s*when|Termin[ée]\s*quand)/),
      tier: extractTier(taskContent),
      parallelizable: extractParallelizable(taskContent),
      status: 'pending',
    };

    tasks.push(parsedTask);
  }

  return tasks.sort((a, b) => a.number - b.number);
}

/**
 * Turns markdown-bold field labels ("- **Files:** x", "**Files**: x") into plain
 * "- Files: x" so every field line starts with "- <Capital>" and field bodies stop there.
 * @param {string} content
 * @returns {string}
 */
function normalizeFieldLabels(content) {
  return content
    .replace(/\*\*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]{0,30}?)\s*:\s*\*\*/g, '$1:')
    .replace(/\*\*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]{0,30}?)\*\*\s*:/g, '$1:');
}

const FIELD_BODY = '([^\\n]+(?:\\n(?!\\s*[-*]\\s*[A-Z]|#|[A-Z][a-z]+:)[^\\n]+)*)';

/**
 * Extracts the body of a "- Label: body" field (multi-line until the next field).
 * @param {string} content
 * @param {RegExp} label
 * @returns {string}
 */
function extractField(content, label) {
  const re = new RegExp(`(?:^|\\n)\\s*[-*]?\\s*(?:${label.source})\\s*:\\s*${FIELD_BODY}`, 'i');
  const m = content.match(re);
  return m ? m[1].trim() : '';
}

/**
 * Extracts file paths from task content
 * @param {string} content - Task content
 * @returns {string[]}
 */
function extractFiles(content) {
  const files = [];

  // Match "Files:" or "File:" section
  const filesMatch = content.match(/(?:^|\n)\s*[-*]?\s*(?:Files?|Fichiers?)\s*:\s*([^\n]+(?:\n(?!\s*[-*]\s*[A-Z]|#|[A-Z][a-z]+:)[^\n]+)*)/i);
  if (filesMatch) {
    const fileList = filesMatch[1];
    // Extract file paths (look for patterns like path/to/file.ext)
    const pathMatches = fileList.match(/[`']?[\w\-./]+\.\w+[`']?/g);
    if (pathMatches) {
      files.push(...pathMatches.map(f => f.replace(/[`']/g, '').trim()));
    }
    // The Files line is the declared scope: paths quoted elsewhere (e.g. "follow the
    // pattern in `x.ts`") are references, not files the task may edit.
    return [...new Set(files)];
  }

  // No Files line: fall back to inline code blocks with file paths
  const inlineFiles = content.match(/`([^`]+\.[a-z]+)`/gi);
  if (inlineFiles) {
    for (const file of inlineFiles) {
      const cleaned = file.replace(/`/g, '').trim();
      if (cleaned.includes('/') || cleaned.includes('.')) {
        if (!files.includes(cleaned)) {
          files.push(cleaned);
        }
      }
    }
  }

  return [...new Set(files)];
}

/**
 * Extracts details/description from task content
 * @param {string} content - Task content
 * @returns {string}
 */
function extractDetails(content) {
  // Look for "Details:" or "Description:" section
  // Prefer Details, then Description, then Action (alternation would pick whichever comes first)
  for (const label of [/Details?|Détails?/, /Description/, /Actions?/]) {
    const value = extractField(content, label);
    if (value) return value;
  }

  // Otherwise, get the first paragraph that's not a field
  const lines = content.split('\n').filter(l => l.trim());
  const detailLines = [];

  for (const line of lines) {
    // Skip lines that look like field headers
    if (/^(?:Files?|Fichiers?|Dependencies?|Tests?|Notes?)\s*:/i.test(line)) {
      continue;
    }
    // Skip bullet points that look like field values
    if (/^[-*]\s*(?:Files?|Dependencies?|Tests?)\s*:/i.test(line)) {
      continue;
    }
    detailLines.push(line);
    // Stop at first empty-ish line or next section
    if (detailLines.length > 3) break;
  }

  return detailLines.join(' ').trim();
}

/**
 * Extracts dependencies from task content
 * @param {string} content - Task content
 * @returns {string[]}
 */
function extractDependencies(content) {
  const deps = [];

  // Match "Dependencies:" section
  const depsMatch = content.match(/(?:Dependencies?|Dépendances?|Requires?)\s*:\s*([^\n]+)/i);
  if (depsMatch) {
    const depList = depsMatch[1];
    // "None", "Aucune", "-", "N/A" as the leading value means no hard dependency,
    // whatever explanation follows ("None (but merge with Tasks 4–6)").
    if (/^[\s*_`]*(none|aucune|n\/a|-|—)\b/i.test(depList) || /^[\s*_`]*[-—][\s*_`.]*$/.test(depList)) {
      return [];
    }
    // Task references, including ranges ("Tasks 3–5")
    for (const m of depList.matchAll(/(\d+)(?:\s*[–—-]\s*(\d+))?/g)) {
      const from = parseInt(m[1], 10);
      const to = m[2] ? parseInt(m[2], 10) : from;
      for (let n = from; n <= to && n - from < 50; n++) deps.push(`task-${n}`);
    }
  }

  return deps;
}

/**
 * Extracts the model tier (high|medium|low) from task content.
 * @param {string} content - Task content
 * @returns {string|null}
 */
function extractTier(content) {
  const m = content.match(/(?:Model\s*tier|Tier)\s*:[\s*]*(high|medium|low|haut|moyen|bas)\b/i);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  if (raw === 'haut') return 'high';
  if (raw === 'moyen') return 'medium';
  if (raw === 'bas') return 'low';
  return raw;
}

/**
 * Extracts the parallelizable flag from task content.
 * Returns true/false when explicitly stated, otherwise null (unknown).
 * @param {string} content - Task content
 * @returns {boolean|null}
 */
function extractParallelizable(content) {
  const m = content.match(/Parallel(?:izable|isable)?\s*:[\s*]*(yes|no|true|false|oui|non)\b/i);
  if (!m) return null;
  return /^(yes|true|oui)$/i.test(m[1]);
}

/**
 * Extracts test requirements from task content
 * @param {string} content - Task content
 * @returns {string}
 */
function extractTests(content) {
  // Match "Tests:" section
  return extractField(content, /(?:Tests?|Testing)/);
}

/**
 * Validates that tasks have proper structure
 * @param {Array} tasks - Parsed tasks
 * @returns {{valid: boolean, issues: string[]}}
 */
export function validateTasks(tasks) {
  const issues = [];

  if (!tasks || tasks.length === 0) {
    issues.push('No tasks found in dev-plan');
    return { valid: false, issues };
  }

  for (const task of tasks) {
    if (!task.title) {
      issues.push(`Task ${task.id}: Missing title`);
    }
    if (task.files.length === 0) {
      issues.push(`Task ${task.id}: No files specified`);
    }
  }

  // Check for circular dependencies
  const taskIds = new Set(tasks.map(t => t.id));
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (!taskIds.has(dep)) {
        issues.push(`Task ${task.id}: Unknown dependency ${dep}`);
      }
      if (dep === task.id) {
        issues.push(`Task ${task.id}: Self-referencing dependency`);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Gets tasks in execution order (respecting dependencies)
 * @param {Array} tasks - Parsed tasks
 * @returns {Array} Tasks in execution order
 */
export function getExecutionOrder(tasks) {
  const result = [];
  const completed = new Set();
  const remaining = [...tasks];

  while (remaining.length > 0) {
    const ready = remaining.filter(t =>
      t.dependencies.every(dep => completed.has(dep))
    );

    if (ready.length === 0 && remaining.length > 0) {
      // Circular dependency or missing deps - just add remaining in order
      result.push(...remaining);
      break;
    }

    for (const task of ready) {
      result.push(task);
      completed.add(task.id);
      remaining.splice(remaining.indexOf(task), 1);
    }
  }

  return result;
}
