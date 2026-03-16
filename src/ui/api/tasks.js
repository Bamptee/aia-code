/**
 * @fileoverview Task API Routes
 * @module ui/api/tasks
 */

import { FileStorageProvider } from '../../epic/providers/file-storage-provider.js';
import { TaskStorageProvider } from '../../epic/providers/task-storage-provider.js';
import { AIProvider } from '../../epic/providers/ai-provider.js';
import { StoryIndexService } from '../../epic/services/story-index-service.js';
import { EpicService } from '../../epic/services/epic-service.js';
import { StoryService } from '../../epic/services/story-service.js';
import { TaskService } from '../../epic/services/task-service.js';
import { TaskSplittingService } from '../../epic/services/task-splitting-service.js';
import { TaskExecutorService } from '../../epic/services/task-executor-service.js';
import { TaskReviewService, REVIEW_MODE } from '../../epic/services/task-review-service.js';

/**
 * Creates and initializes services
 */
function createServices(root = process.cwd()) {
  const storage = new FileStorageProvider(root);
  const taskStorage = new TaskStorageProvider(root);
  const storyIndexService = new StoryIndexService(storage);
  const epicService = new EpicService(storage, storyIndexService);
  const storyService = new StoryService(storage, storyIndexService, epicService);
  const taskService = new TaskService(taskStorage, storyService);
  const aiProvider = new AIProvider();
  const taskSplittingService = new TaskSplittingService(aiProvider, taskService);
  const taskExecutorService = new TaskExecutorService(taskService);
  const taskReviewService = new TaskReviewService(taskService, aiProvider);

  return {
    storyService,
    taskService,
    taskSplittingService,
    taskExecutorService,
    taskReviewService,
  };
}

/**
 * Registers task API routes
 * @param {import('express').Router} router - Express router
 */
export function registerTaskRoutes(router) {
  // GET /api/stories/:storyId/tasks - List all tasks for a story
  router.get('/stories/:storyId/tasks', async (req, res) => {
    try {
      const { taskService } = createServices();
      const { storyId } = req.params;

      const tasks = await taskService.getTasksForStory(storyId);
      const summary = await taskService.getTaskSummary(storyId);

      res.json({
        tasks,
        summary,
      });
    } catch (err) {
      res.status(err.code === 'NOT_FOUND' ? 404 : 500).json({ error: err.message });
    }
  });

  // GET /api/stories/:storyId/tasks/:taskId - Get single task
  router.get('/stories/:storyId/tasks/:taskId', async (req, res) => {
    try {
      const { taskService } = createServices();
      const { storyId, taskId } = req.params;

      const task = await taskService.getTask(storyId, taskId);
      res.json(task);
    } catch (err) {
      res.status(err.code === 'NOT_FOUND' ? 404 : 500).json({ error: err.message });
    }
  });

  // POST /api/stories/:storyId/tasks/split - Generate tasks from story
  router.post('/stories/:storyId/tasks/split', async (req, res) => {
    try {
      const { taskSplittingService, storyService } = createServices();
      const { storyId } = req.params;

      const story = await storyService.getById(storyId);
      const tasks = await taskSplittingService.splitIntoTasks(story, req.body.context || {});

      // Enable task mode on story
      await storyService.enableTaskMode(storyId);
      await storyService.updateTaskSummary(storyId, await createServices().taskService.getTaskSummary(storyId));

      res.json({
        tasks,
        count: tasks.length,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/stories/:storyId/tasks/:taskId/run - Execute a task
  router.post('/stories/:storyId/tasks/:taskId/run', async (req, res) => {
    try {
      const { taskExecutorService, storyService, taskService } = createServices();
      const { storyId, taskId } = req.params;

      const task = await taskExecutorService.executeTask(storyId, taskId, {
        force: req.body.force || false,
        context: req.body.context || {},
      });

      // Update story task summary
      await storyService.updateTaskSummary(storyId, await taskService.getTaskSummary(storyId));

      res.json(task);
    } catch (err) {
      res.status(err.code === 'BUSINESS_RULE_VIOLATION' ? 400 : 500).json({ error: err.message });
    }
  });

  // POST /api/stories/:storyId/tasks/run-all - Execute all pending tasks
  router.post('/stories/:storyId/tasks/run-all', async (req, res) => {
    try {
      const { taskExecutorService, storyService, taskService } = createServices();
      const { storyId } = req.params;

      const summary = await taskExecutorService.executeAllTasks(storyId, {
        stopOnError: req.body.stopOnError !== false,
        context: req.body.context || {},
      });

      // Update story task summary
      await storyService.updateTaskSummary(storyId, await taskService.getTaskSummary(storyId));

      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/stories/:storyId/tasks/:taskId/review - Review a task
  router.post('/stories/:storyId/tasks/:taskId/review', async (req, res) => {
    try {
      const { taskReviewService } = createServices();
      const { storyId, taskId } = req.params;

      const result = await taskReviewService.reviewTask(storyId, taskId, {
        useAI: req.body.useAI || false,
      });

      res.json(result);
    } catch (err) {
      res.status(err.code === 'BUSINESS_RULE_VIOLATION' ? 400 : 500).json({ error: err.message });
    }
  });

  // POST /api/stories/:storyId/tasks/review-all - Review all completed tasks
  router.post('/stories/:storyId/tasks/review-all', async (req, res) => {
    try {
      const { taskReviewService } = createServices();
      const { storyId } = req.params;

      const result = await taskReviewService.reviewAllTasks(storyId, {
        mode: req.body.mode === 'general' ? REVIEW_MODE.GENERAL : REVIEW_MODE.INDIVIDUAL,
        useAI: req.body.useAI || false,
        storyContext: req.body.storyContext || '',
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/stories/:storyId/tasks/:taskId/approve - Approve a task
  router.post('/stories/:storyId/tasks/:taskId/approve', async (req, res) => {
    try {
      const { taskReviewService } = createServices();
      const { storyId, taskId } = req.params;

      const task = await taskReviewService.approveTask(storyId, taskId, req.body.feedback);
      res.json(task);
    } catch (err) {
      res.status(err.code === 'BUSINESS_RULE_VIOLATION' ? 400 : 500).json({ error: err.message });
    }
  });

  // POST /api/stories/:storyId/tasks/:taskId/request-changes - Request changes
  router.post('/stories/:storyId/tasks/:taskId/request-changes', async (req, res) => {
    try {
      const { taskReviewService } = createServices();
      const { storyId, taskId } = req.params;

      if (!req.body.feedback) {
        return res.status(400).json({ error: 'Feedback is required' });
      }

      const task = await taskReviewService.requestChanges(
        storyId,
        taskId,
        req.body.feedback,
        req.body.issues || []
      );
      res.json(task);
    } catch (err) {
      res.status(err.code === 'VALIDATION_ERROR' ? 400 : 500).json({ error: err.message });
    }
  });

  // POST /api/stories/:storyId/tasks/:taskId/reset - Reset a task
  router.post('/stories/:storyId/tasks/:taskId/reset', async (req, res) => {
    try {
      const { taskService, storyService } = createServices();
      const { storyId, taskId } = req.params;

      const task = await taskService.resetTask(storyId, taskId);

      // Update story task summary
      await storyService.updateTaskSummary(storyId, await taskService.getTaskSummary(storyId));

      res.json(task);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/stories/:storyId/tasks/:taskId/skip - Skip a task
  router.post('/stories/:storyId/tasks/:taskId/skip', async (req, res) => {
    try {
      const { taskService, storyService } = createServices();
      const { storyId, taskId } = req.params;

      const task = await taskService.skipTask(storyId, taskId);

      // Update story task summary
      await storyService.updateTaskSummary(storyId, await taskService.getTaskSummary(storyId));

      res.json(task);
    } catch (err) {
      res.status(err.code === 'BUSINESS_RULE_VIOLATION' ? 400 : 500).json({ error: err.message });
    }
  });

  // PATCH /api/stories/:storyId/tasks/:taskId - Update a task
  router.patch('/stories/:storyId/tasks/:taskId', async (req, res) => {
    try {
      const { taskService } = createServices();
      const { storyId, taskId } = req.params;

      const task = await taskService.updateTask(storyId, taskId, req.body);
      res.json(task);
    } catch (err) {
      res.status(err.code === 'VALIDATION_ERROR' ? 400 : 500).json({ error: err.message });
    }
  });

  // DELETE /api/stories/:storyId/tasks/:taskId - Delete a task
  router.delete('/stories/:storyId/tasks/:taskId', async (req, res) => {
    try {
      const { taskService, storyService } = createServices();
      const { storyId, taskId } = req.params;

      await taskService.deleteTask(storyId, taskId);

      // Update story task summary
      await storyService.updateTaskSummary(storyId, await taskService.getTaskSummary(storyId));

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/stories/:storyId/tasks - Delete all tasks for a story
  router.delete('/stories/:storyId/tasks', async (req, res) => {
    try {
      const { taskService, storyService } = createServices();
      const { storyId } = req.params;

      await taskService.deleteAllTasks(storyId);

      // Update story task summary
      await storyService.updateTaskSummary(storyId, { total: 0, pending: 0, inProgress: 0, completed: 0, failed: 0, skipped: 0 });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/stories/:storyId/tasks/progress - Get task progress
  router.get('/stories/:storyId/tasks/progress', async (req, res) => {
    try {
      const { taskExecutorService } = createServices();
      const { storyId } = req.params;

      const progress = await taskExecutorService.getProgress(storyId);
      res.json(progress);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/stories/:storyId/tasks/review-status - Get review status
  router.get('/stories/:storyId/tasks/review-status', async (req, res) => {
    try {
      const { taskReviewService } = createServices();
      const { storyId } = req.params;

      const status = await taskReviewService.getReviewStatus(storyId);
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
