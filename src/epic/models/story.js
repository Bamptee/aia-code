/**
 * @fileoverview Story model definition and factory functions
 * @module epic/models/story
 */

import { generateUUID } from '../utils/id-generator.js';
import { STORY_STATUS, STORY_SPACE, STORY_TYPE } from './validators.js';

/**
 * @typedef {Object} StepVersion
 * @property {number} version - Version number
 * @property {string} content - Content at this version
 * @property {string|null} instructions - User instructions that led to this version
 * @property {string} model - AI model used
 * @property {string} generatedAt - ISO 8601 timestamp
 */

/**
 * @typedef {Object} StepState
 * @property {boolean} completed - Whether step is completed
 * @property {boolean} skipped - Whether step is skipped
 * @property {string|null} content - Step content when completed
 * @property {Array<StepVersion>} history - Version history for iterations
 * @property {number} currentVersion - Current active version number
 */

/**
 * @typedef {Object} StorySteps
 * @property {StepState} init - Init step state
 * @property {StepState} brainstorming - Brainstorming step state
 * @property {StepState} specFunc - Spec-func step state
 * @property {StepState} specTech - Spec-tech step state
 * @property {StepState} devPlan - Dev plan step state
 * @property {StepState} implement - Implementation step state
 * @property {StepState} review - Review step state
 */

/**
 * @typedef {Object} QAAction
 * @property {'approve'|'reject'} action - QA action type
 * @property {string|null} reason - Reason (required for reject)
 * @property {string|null} createdBugId - Bug ID created on rejection
 * @property {string} performedAt - ISO 8601 timestamp
 */

/**
 * @typedef {Object} TaskSummary
 * @property {number} total - Total number of tasks
 * @property {number} pending - Number of pending tasks
 * @property {number} inProgress - Number of tasks in progress
 * @property {number} completed - Number of completed tasks
 * @property {number} failed - Number of failed tasks
 * @property {number} skipped - Number of skipped tasks
 */

/**
 * @typedef {Object} StoryAttachment
 * @property {string} filename - Original filename
 * @property {string} path - Relative path to attachment
 * @property {string} type - MIME type
 * @property {number} size - File size in bytes
 * @property {string} uploadedAt - ISO 8601 timestamp
 */

/**
 * @typedef {Object} StoryInit
 * @property {string|null} input - User's initial input/description
 * @property {string|null} enriched - AI-enriched version of the input
 * @property {string|null} model - Model used for enrichment
 * @property {string|null} enrichedAt - When the input was enriched
 * @property {Array<StoryAttachment>} attachments - Attached files
 */

/**
 * @typedef {Object} StoryWorktrunk
 * @property {boolean} enabled - Whether worktrunk is enabled
 * @property {string|null} branch - Worktree branch name (e.g., 'story/{storyId}')
 * @property {string|null} path - Absolute path to the worktree
 * @property {string|null} createdAt - ISO 8601 timestamp when worktree was created
 * @property {Array<{app: string, branch: string}>} submoduleBranches - Branches created in submodules
 */

/**
 * @typedef {Object} Story
 * @property {string} id - UUID v4
 * @property {'feature'|'bug'} type - Story type
 * @property {string} title - Display title (1-200 characters)
 * @property {string|null} description - Detailed description
 * @property {string} status - Current status
 * @property {'experimentation'|'development'} space - Workflow space
 * @property {StoryInit} init - Initial input and enriched description
 * @property {StorySteps} steps - Step completion tracking
 * @property {string|null} linkedFeatureId - For Bugs: parent Feature reference
 * @property {Array<QAAction>} qaHistory - QA action history
 * @property {Array<string>} attachments - Array of attachment filenames
 * @property {boolean} taskMode - Whether story uses task-based workflow
 * @property {TaskSummary|null} taskSummary - Summary of task counts
 * @property {StoryWorktrunk|null} worktrunk - Worktrunk configuration for isolated development
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {string} updatedAt - ISO 8601 timestamp
 */

/**
 * Creates a new Step state object
 * @returns {StepState} Default step state
 */
function createStepState() {
  return {
    completed: false,
    skipped: false,
    content: null,
    history: [],
    currentVersion: 0,
  };
}

/**
 * Creates a new Story object
 * @param {Object} data - Story data
 * @param {string} data.title - Story title (required)
 * @param {string} data.type - Story type: 'feature' or 'bug' (required)
 * @param {string} [data.description] - Story description
 * @param {string} [data.space='experimentation'] - Workflow space
 * @param {string} [data.linkedFeatureId] - Linked feature ID for bugs
 * @returns {Story} New Story object
 */
export function createStory(data) {
  const now = new Date().toISOString();

  return {
    id: generateUUID(),
    type: data.type,
    title: data.title.trim(),
    description: data.description?.trim() || null,
    status: STORY_STATUS.DRAFT,
    space: data.space || STORY_SPACE.EXPERIMENTATION,
    init: {
      input: null,
      enriched: null,
      model: null,
      enrichedAt: null,
      attachments: [],
    },
    steps: {
      init: createStepState(),
      brainstorming: createStepState(),
      specFunc: createStepState(),
      specTech: createStepState(),
      devPlan: createStepState(),
      implement: createStepState(),
      review: createStepState(),
    },
    linkedFeatureId: data.linkedFeatureId || null,
    qaHistory: [],
    attachments: [],
    taskMode: false,
    taskSummary: null,
    worktrunk: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates a Bug from QA rejection
 * @param {Story} feature - Original feature being rejected
 * @param {string} reason - Rejection reason
 * @returns {Story} New Bug story
 */
export function createBugFromRejection(feature, reason) {
  const now = new Date().toISOString();

  return {
    id: generateUUID(),
    type: STORY_TYPE.BUG,
    title: `[QA Rejection] ${feature.title}`,
    description: reason.trim(),
    status: STORY_STATUS.DRAFT,
    space: STORY_SPACE.DEVELOPMENT,
    init: {
      input: reason.trim(),
      enriched: null,
      model: null,
      enrichedAt: null,
      attachments: [],
    },
    steps: {
      init: {
        completed: true,
        skipped: false,
        content: reason.trim(),
        history: [],
        currentVersion: 0,
      },
      brainstorming: {
        completed: false,
        skipped: true,
        content: null,
        history: [],
        currentVersion: 0,
      },
      specFunc: {
        completed: false,
        skipped: true,
        content: null,
        history: [],
        currentVersion: 0,
      },
      specTech: {
        completed: false,
        skipped: true,
        content: null,
        history: [],
        currentVersion: 0,
      },
      devPlan: {
        completed: false,
        skipped: true,
        content: null,
        history: [],
        currentVersion: 0,
      },
      implement: {
        completed: false,
        skipped: true,
        content: null,
        history: [],
        currentVersion: 0,
      },
      review: {
        completed: false,
        skipped: true,
        content: null,
        history: [],
        currentVersion: 0,
      },
    },
    linkedFeatureId: feature.id,
    qaHistory: [],
    attachments: [],
    taskMode: false,
    taskSummary: null,
    worktrunk: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Enables task mode for a story
 * @param {Story} story - Story to enable task mode for
 * @returns {Story} Story with task mode enabled
 */
export function enableTaskMode(story) {
  return {
    ...story,
    taskMode: true,
    taskSummary: {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Updates task summary for a story
 * @param {Story} story - Story to update
 * @param {TaskSummary} summary - New task summary
 * @returns {Story} Updated story
 */
export function updateTaskSummary(story, summary) {
  return {
    ...story,
    taskSummary: summary,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Product steps that must be completed before promotion to development
 * @type {string[]}
 */
const PRODUCT_STEPS_FOR_PROMOTION = ['init', 'brainstorming', 'specFunc'];

/**
 * Checks if a Story can be promoted to development
 * Only checks product steps (init, brainstorming, specFunc), not dev steps
 * @param {Story} story - Story to check
 * @returns {{canPromote: boolean, missingSteps: string[]}} Result
 */
export function canPromoteStory(story) {
  const missingSteps = [];

  for (const stepName of PRODUCT_STEPS_FOR_PROMOTION) {
    const stepState = story.steps[stepName];
    if (stepState && !stepState.completed && !stepState.skipped) {
      missingSteps.push(stepName);
    }
  }

  return {
    canPromote: missingSteps.length === 0,
    missingSteps,
  };
}

/**
 * Checks if a Story can be deleted
 * @param {Story} story - Story to check
 * @param {Array<Story>} allStories - All stories to check for linked bugs
 * @returns {{canDelete: boolean, reason: string|null, linkedBugs: Array<Story>}} Result
 */
export function canDeleteStory(story, allStories) {
  // Find bugs linked to this story that are not done
  const linkedBugs = allStories.filter(
    (s) => s.linkedFeatureId === story.id && s.type === 'bug' && s.status !== 'done'
  );

  if (linkedBugs.length > 0) {
    return {
      canDelete: false,
      reason: `Cannot delete: ${linkedBugs.length} linked bugs are not completed`,
      linkedBugs,
    };
  }

  return {
    canDelete: true,
    reason: null,
    linkedBugs: [],
  };
}

/**
 * Updates Story timestamp
 * @param {Story} story - Story to update
 * @returns {Story} Updated Story with new timestamp
 */
export function touchStory(story) {
  return {
    ...story,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Creates a QA action record
 * @param {'approve'|'reject'} action - QA action type
 * @param {string|null} [reason] - Reason (required for reject)
 * @param {string|null} [createdBugId] - Bug ID if created
 * @returns {QAAction} QA action record
 */
export function createQAAction(action, reason = null, createdBugId = null) {
  return {
    action,
    reason,
    createdBugId,
    performedAt: new Date().toISOString(),
  };
}

/**
 * Creates a worktrunk configuration for a story
 * @param {string} branch - Worktree branch name
 * @param {string} path - Absolute path to the worktree
 * @param {Array<{app: string, branch: string}>} [submoduleBranches] - Submodule branches created
 * @returns {StoryWorktrunk} Worktrunk configuration
 */
export function createWorktrunk(branch, path, submoduleBranches = []) {
  return {
    enabled: true,
    branch,
    path,
    createdAt: new Date().toISOString(),
    submoduleBranches,
  };
}

/**
 * Enables worktrunk for a story
 * @param {Story} story - Story to enable worktrunk for
 * @param {string} branch - Worktree branch name
 * @param {string} path - Absolute path to the worktree
 * @param {Array<{app: string, branch: string}>} [submoduleBranches] - Submodule branches
 * @returns {Story} Updated story
 */
export function enableWorktrunk(story, branch, path, submoduleBranches = []) {
  return {
    ...story,
    worktrunk: createWorktrunk(branch, path, submoduleBranches),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Disables worktrunk for a story
 * @param {Story} story - Story to disable worktrunk for
 * @returns {Story} Updated story
 */
export function disableWorktrunk(story) {
  return {
    ...story,
    worktrunk: null,
    updatedAt: new Date().toISOString(),
  };
}
