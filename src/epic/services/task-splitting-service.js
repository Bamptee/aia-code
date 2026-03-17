/**
 * @fileoverview Task Splitting Service - AI-powered task generation from story/feature specs
 * @module epic/services/task-splitting-service
 */

import { AIResponseError, ValidationError } from '../utils/errors.js';
import { createTask } from '../models/task.js';

/**
 * Prompt template for task splitting
 * @private
 */
const TASK_SPLITTING_PROMPT = `You are a senior software architect analyzing a feature specification to break it down into discrete, actionable implementation tasks.

## Feature Specification:
{spec}

## Context (if available):
{context}

## Instructions:
Analyze the specification and generate a structured list of implementation tasks. Each task should be:
- Self-contained and focusable
- Clear about what files need to be created/modified
- Ordered by dependency (tasks that others depend on should come first)
- Testable

## Output Format:
Return a JSON array of tasks. Each task object should have:
- "title": string (short, descriptive title)
- "details": string (detailed implementation instructions)
- "files": array of strings (files to create/modify)
- "dependencies": array of numbers (indices of tasks this depends on, 0-indexed)
- "tests": array of strings (test descriptions)

Example:
[
  {
    "title": "Create data model for User",
    "details": "Create the User model with id, name, email fields. Include validation logic.",
    "files": ["src/models/user.js", "src/models/index.js"],
    "dependencies": [],
    "tests": ["Test user creation", "Test validation"]
  },
  {
    "title": "Implement user repository",
    "details": "Create repository layer for User CRUD operations.",
    "files": ["src/repositories/user-repository.js"],
    "dependencies": [0],
    "tests": ["Test CRUD operations"]
  }
]

Return ONLY the JSON array, no other text or formatting.`;

/**
 * Prompt template for refining tasks
 * @private
 */
const TASK_REFINEMENT_PROMPT = `You are a senior software architect refining an existing task breakdown based on user feedback.

## Current Tasks:
{tasks}

## User Feedback:
{feedback}

## Instructions:
Modify the tasks based on the feedback. You can:
- Split tasks into smaller pieces
- Merge tasks that are too granular
- Add missing tasks
- Remove unnecessary tasks
- Update task details or dependencies

Return the refined task list in the same JSON format.

Return ONLY the JSON array, no other text or formatting.`;

/**
 * Service for AI-powered task generation and refinement
 */
export class TaskSplittingService {
  /**
   * @param {import('../providers/ai-provider.js').AIProvider} aiProvider
   * @param {import('./task-service.js').TaskService} taskService
   */
  constructor(aiProvider, taskService) {
    this.aiProvider = aiProvider;
    this.taskService = taskService;
  }

  /**
   * Splits a story/feature into discrete tasks
   * @param {Object} story - Story object
   * @param {Object} [context={}] - Additional context
   * @param {string} [context.devPlan] - Existing dev plan content
   * @param {string} [context.codebaseInfo] - Information about the codebase
   * @returns {Promise<Array<import('../models/task.js').Task>>} Generated tasks
   */
  async splitIntoTasks(story, context = {}) {
    // Build specification from story
    const spec = this._buildSpecFromStory(story);

    // Build context string
    const contextStr = this._buildContextString(context);

    // Generate prompt
    const prompt = TASK_SPLITTING_PROMPT
      .replace('{spec}', spec)
      .replace('{context}', contextStr || 'No additional context provided.');

    // Call AI provider
    const response = await this.aiProvider.generate(prompt, {
      maxTokens: 8192,
      temperature: 0.3, // Lower temperature for more consistent structure
    });

    // Parse response
    const taskDefinitions = this.parseTasksFromAI(response);

    // Create and save tasks
    const tasks = await this.taskService.createTasks(story.id, taskDefinitions);

    return tasks;
  }

  /**
   * Refines existing tasks based on user feedback
   * @param {string} storyId - Story ID
   * @param {string} feedback - User feedback for refinement
   * @returns {Promise<Array<import('../models/task.js').Task>>} Refined tasks
   */
  async refineTasks(storyId, feedback) {
    // Get existing tasks
    const existingTasks = await this.taskService.getTasksForStory(storyId);

    if (existingTasks.length === 0) {
      throw new ValidationError('No existing tasks to refine');
    }

    // Format existing tasks for the prompt
    const tasksJson = JSON.stringify(
      existingTasks.map((t, i) => ({
        index: i,
        title: t.title,
        details: t.details,
        files: t.files,
        dependencies: t.dependencies,
        tests: t.tests,
        status: t.status,
      })),
      null,
      2
    );

    // Generate refinement prompt
    const prompt = TASK_REFINEMENT_PROMPT
      .replace('{tasks}', tasksJson)
      .replace('{feedback}', feedback);

    // Call AI provider
    const response = await this.aiProvider.generate(prompt, {
      maxTokens: 8192,
      temperature: 0.3,
    });

    // Parse response
    const refinedDefinitions = this.parseTasksFromAI(response);

    // Delete old tasks and create new ones
    await this.taskService.deleteAllTasks(storyId);
    const tasks = await this.taskService.createTasks(storyId, refinedDefinitions);

    return tasks;
  }

  /**
   * Parses AI response into task definitions
   * @param {string} aiResponse - Raw AI response
   * @returns {Array<Object>} Task definitions
   * @throws {AIResponseError} If parsing fails
   */
  parseTasksFromAI(aiResponse) {
    try {
      // Clean up the response - remove any markdown code fences
      let cleaned = aiResponse.trim();

      // Remove markdown code fences if present
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
      }

      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }

      cleaned = cleaned.trim();

      // Parse JSON
      const tasks = JSON.parse(cleaned);

      if (!Array.isArray(tasks)) {
        throw new Error('Response is not an array');
      }

      // Validate and normalize each task
      return tasks.map((task, index) => {
        if (!task.title || typeof task.title !== 'string') {
          throw new Error(`Task ${index} missing title`);
        }

        return {
          tempId: `task-${index}`,
          title: task.title.trim(),
          details: task.details?.trim() || '',
          files: Array.isArray(task.files) ? task.files : [],
          dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
          tests: Array.isArray(task.tests) ? task.tests : [],
          order: index,
        };
      });
    } catch (error) {
      throw new AIResponseError(
        `Failed to parse AI response as task list: ${error.message}`,
        { response: aiResponse.substring(0, 500) }
      );
    }
  }

  /**
   * Builds specification string from story
   * @private
   * @param {Object} story - Story object
   * @returns {string} Specification string
   */
  _buildSpecFromStory(story) {
    const parts = [];

    parts.push(`# ${story.title}`);

    if (story.description) {
      parts.push(`\n## Description\n${story.description}`);
    }

    // Add step content if available
    if (story.steps) {
      if (story.steps.init?.content) {
        parts.push(`\n## Init\n${story.steps.init.content}`);
      }
      if (story.steps.specFunc?.content) {
        parts.push(`\n## Functional Specification\n${story.steps.specFunc.content}`);
      }
      if (story.steps.brainstorming?.content) {
        parts.push(`\n## Brainstorming\n${story.steps.brainstorming.content}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Builds context string from context object
   * @private
   * @param {Object} context - Context object
   * @returns {string} Context string
   */
  _buildContextString(context) {
    const parts = [];

    if (context.devPlan) {
      parts.push(`## Existing Dev Plan\n${context.devPlan}`);
    }

    if (context.codebaseInfo) {
      parts.push(`## Codebase Information\n${context.codebaseInfo}`);
    }

    if (context.constraints) {
      parts.push(`## Constraints\n${context.constraints}`);
    }

    if (context.techStack) {
      parts.push(`## Technology Stack\n${context.techStack}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Generates tasks from a dev plan markdown file
   * @param {string} storyId - Story ID
   * @param {string} devPlanContent - Content of dev-plan.md
   * @returns {Promise<Array<import('../models/task.js').Task>>} Generated tasks
   */
  async splitFromDevPlan(storyId, devPlanContent) {
    // Parse the dev plan to extract tasks
    const taskDefinitions = this._parseDevPlanToTasks(devPlanContent);

    if (taskDefinitions.length === 0) {
      throw new ValidationError('No tasks found in dev plan');
    }

    // Create tasks
    const tasks = await this.taskService.createTasks(storyId, taskDefinitions);
    return tasks;
  }

  /**
   * Parses a dev plan markdown into task definitions
   * @private
   * @param {string} content - Dev plan content
   * @returns {Array<Object>} Task definitions
   */
  _parseDevPlanToTasks(content) {
    const tasks = [];
    const lines = content.split('\n');

    let currentTask = null;
    let currentSection = null;
    let taskOrder = 0;

    for (const line of lines) {
      // Match task headers like "## Task 1: Create Task Data Model"
      const taskMatch = line.match(/^##\s+Task\s+(\d+):\s+(.+)$/i);
      if (taskMatch) {
        // Save previous task if exists
        if (currentTask) {
          tasks.push(currentTask);
        }

        currentTask = {
          tempId: `task-${taskOrder}`,
          title: taskMatch[2].trim(),
          details: '',
          files: [],
          dependencies: [],
          tests: [],
          order: taskOrder,
        };
        taskOrder++;
        currentSection = null;
        continue;
      }

      // Match section headers within a task
      const sectionMatch = line.match(/^\*\*(.+?):?\*\*\s*$/);
      if (sectionMatch && currentTask) {
        currentSection = sectionMatch[1].toLowerCase();
        continue;
      }

      // Process content based on current section
      if (currentTask && currentSection) {
        if (currentSection === 'files' || currentSection.includes('file')) {
          // Match file paths like "- `src/models/task.js` (create)"
          const fileMatch = line.match(/^\s*[-*]\s+`?([^`\s(]+)`?\s*/);
          if (fileMatch) {
            currentTask.files.push(fileMatch[1]);
          }
        } else if (currentSection === 'details' || currentSection === 'description') {
          currentTask.details += line + '\n';
        } else if (currentSection === 'dependencies' || currentSection === 'depends on') {
          // Match dependencies like "- Task 1"
          const depMatch = line.match(/^\s*[-*]\s+Task\s+(\d+)/i);
          if (depMatch) {
            currentTask.dependencies.push(parseInt(depMatch[1], 10) - 1); // 0-indexed
          }
        } else if (currentSection === 'tests' || currentSection.includes('test')) {
          const testMatch = line.match(/^\s*[-*]\s+(.+)$/);
          if (testMatch) {
            currentTask.tests.push(testMatch[1].trim());
          }
        }
      }

      // Also capture content after "**Details:**" on the same line
      const inlineDetailsMatch = line.match(/^\*\*Details:\*\*\s*(.+)$/);
      if (inlineDetailsMatch && currentTask) {
        currentTask.details += inlineDetailsMatch[1] + '\n';
      }
    }

    // Save last task
    if (currentTask) {
      tasks.push(currentTask);
    }

    // Clean up details
    return tasks.map((t) => ({
      ...t,
      details: t.details.trim(),
    }));
  }

  /**
   * Suggests tasks based on a simple description
   * @param {string} storyId - Story ID
   * @param {string} description - Feature description
   * @returns {Promise<Array<Object>>} Suggested task definitions (not saved)
   */
  async suggestTasks(storyId, description) {
    const prompt = TASK_SPLITTING_PROMPT
      .replace('{spec}', description)
      .replace('{context}', 'No additional context provided.');

    const response = await this.aiProvider.generate(prompt, {
      maxTokens: 8192,
      temperature: 0.3,
    });

    return this.parseTasksFromAI(response);
  }
}
