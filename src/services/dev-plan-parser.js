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
    const taskContent = markdown.slice(task.headerEnd, nextTaskStart).trim();

    // Parse task content for structured fields
    const parsedTask = {
      id: task.id,
      number: task.number,
      title: task.title,
      files: extractFiles(taskContent),
      details: extractDetails(taskContent),
      dependencies: extractDependencies(taskContent),
      tests: extractTests(taskContent),
      status: 'pending',
    };

    tasks.push(parsedTask);
  }

  return tasks.sort((a, b) => a.number - b.number);
}

/**
 * Extracts file paths from task content
 * @param {string} content - Task content
 * @returns {string[]}
 */
function extractFiles(content) {
  const files = [];

  // Match "Files:" or "File:" section
  const filesMatch = content.match(/(?:Files?|Fichiers?)\s*:\s*([^\n]+(?:\n(?!-|\*|#|[A-Z][a-z]+:)[^\n]+)*)/i);
  if (filesMatch) {
    const fileList = filesMatch[1];
    // Extract file paths (look for patterns like path/to/file.ext)
    const pathMatches = fileList.match(/[`']?[\w\-./]+\.\w+[`']?/g);
    if (pathMatches) {
      files.push(...pathMatches.map(f => f.replace(/[`']/g, '').trim()));
    }
  }

  // Also look for inline code blocks with file paths
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
  const detailsMatch = content.match(/(?:Details?|Description|Actions?)\s*:\s*([^\n]+(?:\n(?!-\s*[A-Z]|#|[A-Z][a-z]+:)[^\n]+)*)/i);
  if (detailsMatch) {
    return detailsMatch[1].trim();
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
    // Look for task references
    const taskRefs = depList.match(/(?:Task\s*)?(\d+)/gi);
    if (taskRefs) {
      deps.push(...taskRefs.map(t => `task-${t.replace(/\D/g, '')}`));
    }
    // Handle "none" or "aucune"
    if (/none|aucune|n\/a|-/i.test(depList)) {
      return [];
    }
  }

  return deps;
}

/**
 * Extracts test requirements from task content
 * @param {string} content - Task content
 * @returns {string}
 */
function extractTests(content) {
  // Match "Tests:" section
  const testsMatch = content.match(/(?:Tests?|Testing)\s*:\s*([^\n]+(?:\n(?!-\s*[A-Z]|#|[A-Z][a-z]+:)[^\n]+)*)/i);
  if (testsMatch) {
    return testsMatch[1].trim();
  }
  return '';
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
