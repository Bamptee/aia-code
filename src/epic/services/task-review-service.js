/**
 * @fileoverview Task Review Service - Individual and batch task review
 * @module epic/services/task-review-service
 */

import { BusinessRuleError, ValidationError } from '../utils/errors.js';
import { TASK_STATUS, createReviewResult } from '../models/task.js';

/**
 * Review modes
 * @readonly
 * @enum {string}
 */
export const REVIEW_MODE = Object.freeze({
  INDIVIDUAL: 'individual',
  GENERAL: 'general',
  DIFF: 'diff',
});

/**
 * Review status
 * @readonly
 * @enum {string}
 */
export const REVIEW_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes_requested',
});

/**
 * Prompt template for task review
 * @private
 */
const TASK_REVIEW_PROMPT = `You are a senior code reviewer performing a thorough review of a task implementation.

## Task Information:
**Title:** {title}
**Details:** {details}
**Files Modified:** {files}

## Implementation Output:
{implementationOutput}

## Review Instructions:
1. Check if the implementation matches the task requirements
2. Look for potential bugs or issues
3. Verify code quality and best practices
4. Check for security concerns
5. Assess test coverage needs

## Output Format:
Return a JSON object with:
{
  "status": "approved" | "changes_requested",
  "summary": "Brief summary of review findings",
  "issues": ["List of specific issues found"],
  "suggestions": ["List of improvement suggestions"],
  "securityConcerns": ["Any security-related concerns"]
}

Return ONLY the JSON object.`;

/**
 * Prompt template for general review
 * @private
 */
const GENERAL_REVIEW_PROMPT = `You are a senior code reviewer performing a holistic review of multiple task implementations.

## Story Context:
{storyContext}

## Completed Tasks:
{tasks}

## Review Instructions:
1. Check overall consistency across implementations
2. Verify proper integration between components
3. Look for duplicated code or missed abstractions
4. Check for security concerns
5. Assess overall architecture decisions

## Output Format:
Return a JSON object with:
{
  "overallStatus": "approved" | "changes_requested",
  "summary": "Overall review summary",
  "integrationIssues": ["Issues with how components work together"],
  "architecturalConcerns": ["High-level architectural concerns"],
  "taskSpecificIssues": [{"taskId": "...", "issues": [...]}],
  "securityConcerns": ["Security-related concerns"]
}

Return ONLY the JSON object.`;

/**
 * Service for reviewing tasks
 */
export class TaskReviewService {
  /**
   * @param {import('./task-service.js').TaskService} taskService
   * @param {import('../providers/ai-provider.js').AIProvider} [aiProvider]
   */
  constructor(taskService, aiProvider = null) {
    this.taskService = taskService;
    this.aiProvider = aiProvider;
  }

  /**
   * Reviews a single task
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @param {Object} [options] - Review options
   * @param {boolean} [options.useAI=false] - Use AI for review
   * @returns {Promise<Object>} Review result
   */
  async reviewTask(storyId, taskId, options = {}) {
    const task = await this.taskService.getTask(storyId, taskId);

    // Check if task is reviewable
    if (task.status !== TASK_STATUS.COMPLETED) {
      throw new BusinessRuleError(
        `Task must be completed to review. Current status: ${task.status}`
      );
    }

    let reviewResult;

    if (options.useAI && this.aiProvider) {
      reviewResult = await this._aiReviewTask(task);
    } else {
      // Manual review - just mark as pending
      reviewResult = createReviewResult({
        status: REVIEW_STATUS.PENDING,
        feedback: null,
        issues: [],
      });
    }

    // Save review result to task
    await this.taskService.setReviewResult(storyId, taskId, reviewResult);

    return {
      taskId,
      taskTitle: task.title,
      ...reviewResult,
    };
  }

  /**
   * Reviews all completed tasks
   * @param {string} storyId - Story ID
   * @param {Object} [options] - Review options
   * @param {string} [options.mode='general'] - Review mode
   * @param {boolean} [options.useAI=false] - Use AI for review
   * @param {string} [options.storyContext] - Additional story context
   * @returns {Promise<Object>} Review summary
   */
  async reviewAllTasks(storyId, options = {}) {
    const { mode = REVIEW_MODE.GENERAL, useAI = false, storyContext = '' } = options;

    const tasks = await this.taskService.getTasksForStory(storyId);
    const completedTasks = tasks.filter((t) => t.status === TASK_STATUS.COMPLETED);

    if (completedTasks.length === 0) {
      throw new BusinessRuleError('No completed tasks to review');
    }

    let result;

    if (mode === REVIEW_MODE.INDIVIDUAL) {
      // Review each task individually
      const reviews = [];
      for (const task of completedTasks) {
        const review = await this.reviewTask(storyId, task.id, { useAI });
        reviews.push(review);
      }

      result = {
        mode: REVIEW_MODE.INDIVIDUAL,
        tasksReviewed: reviews.length,
        reviews,
        approved: reviews.filter((r) => r.status === REVIEW_STATUS.APPROVED).length,
        changesRequested: reviews.filter((r) => r.status === REVIEW_STATUS.CHANGES_REQUESTED).length,
      };
    } else if (mode === REVIEW_MODE.GENERAL && useAI && this.aiProvider) {
      // Holistic AI review
      result = await this._aiReviewAll(completedTasks, storyContext);
    } else {
      // Summary without AI
      result = {
        mode: REVIEW_MODE.GENERAL,
        tasksReviewed: completedTasks.length,
        tasks: completedTasks.map((t) => ({
          id: t.id,
          title: t.title,
          files: t.files,
          hasImplementationResult: !!t.implementationResult,
          currentReviewStatus: t.reviewResult?.status || REVIEW_STATUS.PENDING,
        })),
        needsManualReview: true,
      };
    }

    return result;
  }

  /**
   * Gets review status for all tasks
   * @param {string} storyId - Story ID
   * @returns {Promise<Object>} Review status summary
   */
  async getReviewStatus(storyId) {
    const tasks = await this.taskService.getTasksForStory(storyId);

    const summary = {
      total: tasks.length,
      reviewable: 0,
      approved: 0,
      changesRequested: 0,
      pendingReview: 0,
      notReviewable: 0,
      tasks: [],
    };

    for (const task of tasks) {
      const taskStatus = {
        id: task.id,
        title: task.title,
        taskStatus: task.status,
        reviewStatus: task.reviewResult?.status || null,
      };

      if (task.status === TASK_STATUS.COMPLETED) {
        summary.reviewable++;

        if (task.reviewResult?.status === REVIEW_STATUS.APPROVED) {
          summary.approved++;
          taskStatus.reviewStatus = REVIEW_STATUS.APPROVED;
        } else if (task.reviewResult?.status === REVIEW_STATUS.CHANGES_REQUESTED) {
          summary.changesRequested++;
          taskStatus.reviewStatus = REVIEW_STATUS.CHANGES_REQUESTED;
        } else {
          summary.pendingReview++;
          taskStatus.reviewStatus = REVIEW_STATUS.PENDING;
        }
      } else {
        summary.notReviewable++;
      }

      summary.tasks.push(taskStatus);
    }

    return summary;
  }

  /**
   * Approves a task
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @param {string} [feedback] - Optional approval feedback
   * @returns {Promise<Object>} Updated task
   */
  async approveTask(storyId, taskId, feedback = null) {
    const task = await this.taskService.getTask(storyId, taskId);

    if (task.status !== TASK_STATUS.COMPLETED) {
      throw new BusinessRuleError('Can only approve completed tasks');
    }

    const reviewResult = createReviewResult({
      status: REVIEW_STATUS.APPROVED,
      feedback,
      issues: [],
    });

    return this.taskService.setReviewResult(storyId, taskId, reviewResult);
  }

  /**
   * Requests changes for a task
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @param {string} feedback - Required feedback explaining needed changes
   * @param {string[]} [issues=[]] - List of specific issues
   * @returns {Promise<Object>} Updated task
   */
  async requestChanges(storyId, taskId, feedback, issues = []) {
    if (!feedback || typeof feedback !== 'string' || feedback.trim().length < 10) {
      throw new ValidationError('Feedback must be at least 10 characters');
    }

    const task = await this.taskService.getTask(storyId, taskId);

    if (task.status !== TASK_STATUS.COMPLETED) {
      throw new BusinessRuleError('Can only request changes for completed tasks');
    }

    const reviewResult = createReviewResult({
      status: REVIEW_STATUS.CHANGES_REQUESTED,
      feedback: feedback.trim(),
      issues,
    });

    return this.taskService.setReviewResult(storyId, taskId, reviewResult);
  }

  /**
   * Clears review result for a task
   * @param {string} storyId - Story ID
   * @param {string} taskId - Task ID
   * @returns {Promise<Object>} Updated task
   */
  async clearReview(storyId, taskId) {
    return this.taskService.setReviewResult(storyId, taskId, null);
  }

  /**
   * Gets tasks that need review
   * @param {string} storyId - Story ID
   * @returns {Promise<Array>} Tasks needing review
   */
  async getTasksNeedingReview(storyId) {
    const tasks = await this.taskService.getTasksForStory(storyId);

    return tasks.filter((t) => {
      return (
        t.status === TASK_STATUS.COMPLETED &&
        (!t.reviewResult || t.reviewResult.status === REVIEW_STATUS.PENDING)
      );
    });
  }

  /**
   * Gets tasks with requested changes
   * @param {string} storyId - Story ID
   * @returns {Promise<Array>} Tasks with changes requested
   */
  async getTasksWithRequestedChanges(storyId) {
    const tasks = await this.taskService.getTasksForStory(storyId);

    return tasks.filter((t) => {
      return t.reviewResult?.status === REVIEW_STATUS.CHANGES_REQUESTED;
    });
  }

  /**
   * Performs AI review of a single task
   * @private
   * @param {Object} task - Task to review
   * @returns {Promise<Object>} Review result
   */
  async _aiReviewTask(task) {
    const prompt = TASK_REVIEW_PROMPT
      .replace('{title}', task.title)
      .replace('{details}', task.details || 'No details provided')
      .replace('{files}', task.files.join(', ') || 'No files specified')
      .replace(
        '{implementationOutput}',
        task.implementationResult?.output || 'No implementation output available'
      );

    const response = await this.aiProvider.generate(prompt, {
      maxTokens: 2048,
      temperature: 0.3,
    });

    try {
      const parsed = JSON.parse(this._cleanJsonResponse(response));

      return createReviewResult({
        status: parsed.status === 'approved' ? REVIEW_STATUS.APPROVED : REVIEW_STATUS.CHANGES_REQUESTED,
        feedback: parsed.summary,
        issues: [
          ...(parsed.issues || []),
          ...(parsed.securityConcerns || []).map((c) => `[Security] ${c}`),
        ],
      });
    } catch (error) {
      // If parsing fails, return a pending review
      return createReviewResult({
        status: REVIEW_STATUS.PENDING,
        feedback: `AI review parsing failed: ${error.message}. Manual review required.`,
        issues: [],
      });
    }
  }

  /**
   * Performs holistic AI review of all tasks
   * @private
   * @param {Array} tasks - Tasks to review
   * @param {string} storyContext - Story context
   * @returns {Promise<Object>} Review result
   */
  async _aiReviewAll(tasks, storyContext) {
    const tasksJson = JSON.stringify(
      tasks.map((t) => ({
        id: t.id,
        title: t.title,
        details: t.details,
        files: t.files,
        implementationOutput: t.implementationResult?.output?.substring(0, 1000),
      })),
      null,
      2
    );

    const prompt = GENERAL_REVIEW_PROMPT
      .replace('{storyContext}', storyContext || 'No additional context')
      .replace('{tasks}', tasksJson);

    const response = await this.aiProvider.generate(prompt, {
      maxTokens: 4096,
      temperature: 0.3,
    });

    try {
      const parsed = JSON.parse(this._cleanJsonResponse(response));

      return {
        mode: REVIEW_MODE.GENERAL,
        overallStatus: parsed.overallStatus,
        summary: parsed.summary,
        integrationIssues: parsed.integrationIssues || [],
        architecturalConcerns: parsed.architecturalConcerns || [],
        taskSpecificIssues: parsed.taskSpecificIssues || [],
        securityConcerns: parsed.securityConcerns || [],
        tasksReviewed: tasks.length,
      };
    } catch (error) {
      return {
        mode: REVIEW_MODE.GENERAL,
        error: `AI review parsing failed: ${error.message}`,
        tasksReviewed: tasks.length,
        needsManualReview: true,
      };
    }
  }

  /**
   * Cleans JSON response from AI
   * @private
   * @param {string} response - AI response
   * @returns {string} Cleaned JSON string
   */
  _cleanJsonResponse(response) {
    let cleaned = response.trim();

    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }

    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }

    return cleaned.trim();
  }

  /**
   * Checks if all completed tasks are approved
   * @param {string} storyId - Story ID
   * @returns {Promise<boolean>} True if all completed tasks are approved
   */
  async areAllTasksApproved(storyId) {
    const tasks = await this.taskService.getTasksForStory(storyId);
    const completedTasks = tasks.filter((t) => t.status === TASK_STATUS.COMPLETED);

    if (completedTasks.length === 0) {
      return false;
    }

    return completedTasks.every((t) => t.reviewResult?.status === REVIEW_STATUS.APPROVED);
  }
}
