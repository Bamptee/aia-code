/**
 * @fileoverview Epic API Routes - REST endpoints for Epic & Story management
 * @module ui/api/epics
 */

import path from 'node:path';
import fs from 'fs-extra';
import Busboy from 'busboy';
import { json, error } from '../router.js';
import { FileStorageProvider } from '../../epic/providers/file-storage-provider.js';
import { EpicService } from '../../epic/services/epic-service.js';
import { StoryService } from '../../epic/services/story-service.js';
import { QAService } from '../../epic/services/qa-service.js';
import { RoadmapService } from '../../epic/services/roadmap-service.js';
import { StoryIndexService } from '../../epic/services/story-index-service.js';
import { POCService } from '../../epic/services/poc-service.js';
import { POCEnvironmentService } from '../../epic/services/poc-environment-service.js';
import { MigrationService } from '../../epic/services/migration-service.js';
import { IntegrityService } from '../../epic/services/integrity-service.js';
import { StoryToFeatureService } from '../../epic/services/story-to-feature-service.js';
import { FigmaDiscoveryService } from '../../epic/services/figma-discovery-service.js';
import { FigmaProvider } from '../../epic/providers/figma-provider.js';
import { AIProvider } from '../../epic/providers/ai-provider.js';
import { isValidFigmaUrl, STORY_STEPS } from '../../epic/models/validators.js';
import { loadConfig } from '../../models.js';
import { callModel } from '../../services/model-call.js';

/**
 * Lazily initialize services with caching
 */
let servicesCache = null;
let servicesRoot = null;

async function getServices(root) {
  if (servicesCache && servicesRoot === root) {
    return servicesCache;
  }

  const storage = new FileStorageProvider(root);
  await storage.ensureDirectories();

  const storyIndexService = new StoryIndexService(storage);
  const epicService = new EpicService(storage, storyIndexService);
  const storyService = new StoryService(storage, storyIndexService, epicService);
  const qaService = new QAService(storage, storyService, storyIndexService);
  const roadmapService = new RoadmapService(storage, epicService);
  const aiProvider = new AIProvider();
  const figmaProvider = new FigmaProvider(storage);
  const pocService = new POCService(storage, storyService, aiProvider, figmaProvider);
  const pocEnvService = new POCEnvironmentService(storage, storyService);
  const migrationService = new MigrationService(storage, epicService);
  const integrityService = new IntegrityService(storage, storyIndexService);
  const storyToFeatureService = new StoryToFeatureService(storage, storyService, root);
  const figmaDiscoveryService = new FigmaDiscoveryService(storage, figmaProvider, storyService, aiProvider);

  // Ensure General Epic exists
  await epicService.getOrCreateGeneralEpic();

  servicesCache = {
    storage,
    epicService,
    storyService,
    storyIndexService,
    qaService,
    roadmapService,
    pocService,
    pocEnvService,
    migrationService,
    integrityService,
    storyToFeatureService,
    figmaProvider,
    figmaDiscoveryService,
    aiProvider,
  };
  servicesRoot = root;

  return servicesCache;
}

/**
 * Register all Epic-related API routes
 * @param {import('../router.js').Router} router
 */
export function registerEpicRoutes(router) {
  // ============== EPIC ENDPOINTS ==============

  /**
   * GET /api/epics - List all Epics
   * Query params: ?includeArchived=true&status=discovery
   */
  router.get('/api/epics', async (req, res, { root, query }) => {
    try {
      const { epicService } = await getServices(root);
      const options = {
        includeArchived: query?.includeArchived === 'true',
        status: query?.status || undefined,
      };
      const epics = await epicService.list(options);
      json(res, epics);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/epics/stats - Get Epic statistics
   */
  router.get('/api/epics/stats', async (req, res, { root }) => {
    try {
      const { epicService } = await getServices(root);
      const stats = await epicService.getStats();
      json(res, stats);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/epics/:id - Get single Epic by ID
   */
  router.get('/api/epics/:id', async (req, res, { params, root }) => {
    try {
      const { epicService } = await getServices(root);
      const epic = await epicService.getById(params.id);
      json(res, {
        ...epic,
        progress: epicService.calculateProgress(epic),
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/epics - Create new Epic
   */
  router.post('/api/epics', async (req, res, { root, parseBody }) => {
    try {
      const body = await parseBody();
      const { epicService } = await getServices(root);
      const epic = await epicService.create(body);
      json(res, epic, 201);
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * PATCH /api/epics/:id - Update Epic
   */
  router.patch('/api/epics/:id', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { epicService } = await getServices(root);
      const epic = await epicService.update(params.id, body);
      json(res, epic);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'VALIDATION_ERROR' || err.code === 'BUSINESS_RULE_VIOLATION') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * PATCH /api/epics/:id/status - Update Epic status
   */
  router.patch('/api/epics/:id/status', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { epicService } = await getServices(root);
      const epic = await epicService.updateStatus(params.id, body.status);
      json(res, epic);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'VALIDATION_ERROR' || err.code === 'BUSINESS_RULE_VIOLATION') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * DELETE /api/epics/:id - Delete Epic (must be empty)
   */
  router.delete('/api/epics/:id', async (req, res, { params, root }) => {
    try {
      const { epicService } = await getServices(root);
      await epicService.delete(params.id);
      json(res, { ok: true });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'BUSINESS_RULE_VIOLATION') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/epics/:id/archive - Archive Epic
   */
  router.post('/api/epics/:id/archive', async (req, res, { params, root }) => {
    try {
      const { epicService } = await getServices(root);
      const epic = await epicService.archive(params.id);
      json(res, epic);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'BUSINESS_RULE_VIOLATION') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/epics/:id/unarchive - Unarchive Epic
   */
  router.post('/api/epics/:id/unarchive', async (req, res, { params, root }) => {
    try {
      const { epicService } = await getServices(root);
      const epic = await epicService.unarchive(params.id);
      json(res, epic);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  // ============== STORY ENDPOINTS ==============

  /**
   * GET /api/stories - List all Stories
   * Query params: ?epicId=...&space=...&status=...&type=...
   */
  router.get('/api/stories', async (req, res, { root, query }) => {
    try {
      const { storyService } = await getServices(root);
      const filters = {
        epicId: query?.epicId || undefined,
        space: query?.space || undefined,
        status: query?.status || undefined,
        type: query?.type || undefined,
      };
      const stories = await storyService.list(filters);
      json(res, stories);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/stories/stats - Get Story statistics
   */
  router.get('/api/stories/stats', async (req, res, { root, query }) => {
    try {
      const { storyService } = await getServices(root);
      const filters = {
        epicId: query?.epicId || undefined,
      };
      const stats = await storyService.getStats(filters);
      json(res, stats);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/stories/:id - Get single Story by ID
   */
  router.get('/api/stories/:id', async (req, res, { params, root }) => {
    try {
      const { storyService } = await getServices(root);
      const { epic, story } = await storyService.findStoryWithEpic(params.id);
      if (!story) {
        return error(res, `Story ${params.id} not found`, 404);
      }
      json(res, {
        ...story,
        epicId: epic?.id || null,
        epicName: epic?.name || null,
      });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/epics/:epicId/stories - Create Story in Epic
   */
  router.post('/api/epics/:epicId/stories', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { storyService } = await getServices(root);
      const story = await storyService.create(params.epicId, body);
      json(res, story, 201);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'VALIDATION_ERROR') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * PATCH /api/stories/:id - Update Story
   */
  router.patch('/api/stories/:id', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { storyService } = await getServices(root);
      const story = await storyService.update(params.id, body);
      json(res, story);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'VALIDATION_ERROR') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * PATCH /api/stories/:id/status - Update Story status
   */
  router.patch('/api/stories/:id/status', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { storyService } = await getServices(root);
      const story = await storyService.updateStatus(params.id, body.status);
      json(res, story);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'VALIDATION_ERROR') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * DELETE /api/stories/:id - Delete Story
   */
  router.delete('/api/stories/:id', async (req, res, { params, root }) => {
    try {
      const { storyService } = await getServices(root);
      await storyService.delete(params.id);
      json(res, { ok: true });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'BUSINESS_RULE_VIOLATION') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/stories/:id/move - Move Story to different Epic
   */
  router.post('/api/stories/:id/move', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { storyService } = await getServices(root);
      const story = await storyService.move(params.id, body.targetEpicId);
      json(res, story);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/stories/:id/promote - Promote Story to Ready for Dev (legacy)
   */
  router.post('/api/stories/:id/promote', async (req, res, { params, root }) => {
    try {
      const { storyService } = await getServices(root);
      const story = await storyService.promote(params.id);
      json(res, story);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'BUSINESS_RULE_VIOLATION') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/stories/:id/publish - Publish story (draft -> pending)
   * Makes the story visible to Dev
   */
  router.post('/api/stories/:id/publish', async (req, res, { params, root }) => {
    try {
      const { storyService } = await getServices(root);
      const story = await storyService.publish(params.id);
      json(res, story);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'BUSINESS_RULE_VIOLATION') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/stories/:id/unpublish - Unpublish story (pending -> draft)
   * Removes the story from Dev visibility
   */
  router.post('/api/stories/:id/unpublish', async (req, res, { params, root }) => {
    try {
      const { storyService } = await getServices(root);
      const story = await storyService.unpublish(params.id);
      json(res, story);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'BUSINESS_RULE_VIOLATION') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/stories/:id/send-to-dev - Create Feature from Story (promote to dev)
   * Creates a new feature with story content pre-filled
   */
  router.post('/api/stories/:id/send-to-dev', async (req, res, { params, root }) => {
    try {
      const { storyToFeatureService } = await getServices(root);
      const result = await storyToFeatureService.promote(params.id);
      json(res, {
        success: true,
        featureName: result.featureName,
        featurePath: result.featurePath,
        story: result.story,
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'BUSINESS_RULE_VIOLATION') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * GET /api/stories/:id/can-send-to-dev - Check if Story can be sent to dev
   */
  router.get('/api/stories/:id/can-send-to-dev', async (req, res, { params, root }) => {
    try {
      const { storyToFeatureService } = await getServices(root);
      const result = await storyToFeatureService.canPromote(params.id);
      json(res, result);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * PATCH /api/stories/:id/steps/:stepName - Update Story step
   */
  router.patch('/api/stories/:id/steps/:stepName', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { storyService } = await getServices(root);
      const story = await storyService.updateStep(params.id, params.stepName, body);
      json(res, story);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'VALIDATION_ERROR') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * GET /api/ai/status - Check AI provider status
   */
  router.get('/api/ai/status', async (req, res, { root }) => {
    try {
      const { aiProvider } = await getServices(root);
      json(res, {
        configured: aiProvider.isConfigured(),
        provider: aiProvider.getProvider(),
        model: aiProvider.getModel(),
        message: aiProvider.isConfigured()
          ? `AI configured with ${aiProvider.getProvider()} (${aiProvider.getModel()})`
          : 'Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable AI features',
      });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  // ============== STORY AI WORKFLOW ENDPOINTS ==============

  /**
   * POST /api/stories/:id/init - Set and optionally enrich story initial input
   * Body: { input: string, enrich?: boolean, model?: string }
   */
  router.post('/api/stories/:id/init', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { storyService, figmaProvider } = await getServices(root);

      if (!body.input || typeof body.input !== 'string') {
        return error(res, 'input is required and must be a string', 400);
      }

      // Save the input
      let story = await storyService.setInitInput(params.id, body.input);
      let selectedModel = null;

      // Optionally enrich with AI
      if (body.enrich) {
        // Load config to get model
        let config;
        try {
          config = await loadConfig(root);
          selectedModel = body.model || config.models?.brief?.[0]?.model || 'claude-default';
        } catch {
          return error(res, 'AI not configured. Run "aia init" to set up your project.', 400);
        }

        // Build context from Figma links
        let figmaContext = '';
        if (story.init?.figmaLinks?.length > 0 && figmaProvider.isConfigured()) {
          const figmaSummaries = [];
          for (const link of story.init.figmaLinks) {
            try {
              const cachedData = await figmaProvider.getCached(link.url);
              if (cachedData) {
                const summary = figmaProvider.generateSummary(cachedData);
                const label = link.label ? ` (${link.label})` : '';
                figmaSummaries.push(`Figma Design${label}:\n${summary}`);
              }
            } catch {
              // Skip
            }
          }
          if (figmaSummaries.length > 0) {
            figmaContext = '\n\n--- Figma Design Context ---\n' + figmaSummaries.join('\n\n');
          }
        }

        // Build enrichment prompt
        const enrichPrompt = `You are a product discovery assistant helping to structure a story/feature idea.

USER INPUT:
${body.input}
${figmaContext}

TASK:
Transform this input into a well-structured discovery document in Markdown format.

OUTPUT FORMAT:
# Discovery Document

## Summary
(1-2 sentence summary of what this feature/story does)

## Problem Statement
(What problem does this solve? Why is it needed?)

## User Value
(What value does this bring to users?)

## Key Requirements
(List the key functional requirements as bullet points)

## Open Questions
(Any questions that need to be answered before implementation)

## Constraints & Considerations
(Any technical constraints, limitations, or considerations)

IMPORTANT:
- Keep it concise but complete
- Don't add requirements that weren't mentioned or implied
- If the input is vague, make reasonable assumptions and note them
- Output ONLY the markdown document, no explanations`;

        const enriched = await callModel(selectedModel, enrichPrompt, { verbose: false, apply: false });
        story = await storyService.setInitEnriched(params.id, enriched.trim(), selectedModel);
      }

      json(res, {
        story,
        enriched: body.enrich,
        model: selectedModel,
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/stories/:id/init/enrich - Enrich existing init input with AI
   * Body: { model?: string }
   */
  router.post('/api/stories/:id/init/enrich', async (req, res, { params, root, parseBody }) => {
    // SSE helper functions
    const sseHeaders = () => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
    };

    const sseSend = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (res.flush) res.flush();
    };

    try {
      const body = await parseBody();
      const { storyService, figmaProvider } = await getServices(root);

      // Load config to get model
      let config;
      let selectedModel;
      try {
        config = await loadConfig(root);
        // Use provided model or get from config (brief step is a good default)
        selectedModel = body.model || config.models?.brief?.[0]?.model || 'claude-default';
      } catch {
        return error(res, 'AI not configured. Run "aia init" to set up your project.', 400);
      }

      // Get the story
      const { story } = await storyService.findStoryWithEpic(params.id);
      if (!story) {
        return error(res, `Story ${params.id} not found`, 404);
      }

      const input = story.init?.input || story.description || story.title;
      if (!input) {
        return error(res, 'No init input to enrich. Set init.input first.', 400);
      }

      // Start SSE streaming
      sseHeaders();
      sseSend('status', { status: 'enriching', message: 'Structuring your story context...' });

      // Build context from Figma links
      let figmaContext = '';
      if (story.init?.figmaLinks?.length > 0 && figmaProvider.isConfigured()) {
        sseSend('status', { status: 'figma', message: 'Loading Figma design context...' });
        const figmaSummaries = [];
        for (const link of story.init.figmaLinks) {
          try {
            const cachedData = await figmaProvider.getCached(link.url);
            if (cachedData) {
              const summary = figmaProvider.generateSummary(cachedData);
              const label = link.label ? ` (${link.label})` : '';
              figmaSummaries.push(`Figma Design${label}:\n${summary}`);
            }
          } catch {
            // Skip if can't get cached data
          }
        }
        if (figmaSummaries.length > 0) {
          figmaContext = '\n\n--- Figma Design Context ---\n' + figmaSummaries.join('\n\n');
        }
      }

      sseSend('status', { status: 'generating', message: 'AI is structuring the story...' });

      // Build enrichment prompt
      const enrichPrompt = `You are a product discovery assistant helping to structure a story/feature idea.

USER INPUT:
${input}
${figmaContext}

TASK:
Transform this input into a well-structured discovery document in Markdown format.

OUTPUT FORMAT:
# Discovery Document

## Summary
(1-2 sentence summary of what this feature/story does)

## Problem Statement
(What problem does this solve? Why is it needed?)

## User Value
(What value does this bring to users?)

## Key Requirements
(List the key functional requirements as bullet points)

## Open Questions
(Any questions that need to be answered before implementation)

## Constraints & Considerations
(Any technical constraints, limitations, or considerations)

IMPORTANT:
- Keep it concise but complete
- Don't add requirements that weren't mentioned or implied
- If the input is vague, make reasonable assumptions and note them
- Output ONLY the markdown document, no explanations`;

      // Stream log output to client
      const onData = ({ type, text }) => {
        try {
          sseSend('log', { type, text });
        } catch {
          // Ignore write errors during streaming
        }
      };

      const enriched = await callModel(selectedModel, enrichPrompt, { verbose: false, apply: false, onData });
      const updatedStory = await storyService.setInitEnriched(params.id, enriched.trim(), selectedModel);

      // Send completion event with the updated story data
      sseSend('done', {
        ok: true,
        story: updatedStory,
        enriched: true,
        model: selectedModel,
        figmaContextIncluded: figmaContext.length > 0,
      });
    } catch (err) {
      try {
        sseSend('error', { message: err.message });
      } catch {
        // If SSE not started yet, use regular error response
        if (err.code === 'NOT_FOUND') {
          error(res, err.message, 404);
        } else {
          error(res, err.message, 500);
        }
        return;
      }
    }
    res.end();
  });

  /**
   * POST /api/stories/:id/steps/:stepName/iterate - Iterate on step with AI
   * Body: { instructions: string }
   * Uses existing content + instructions to generate new version
   */
  router.post('/api/stories/:id/steps/:stepName/iterate', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { storyService, aiProvider } = await getServices(root);

      if (!aiProvider.isConfigured()) {
        return error(res, 'AI provider not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.', 400);
      }

      const validSteps = STORY_STEPS;
      if (!validSteps.includes(params.stepName)) {
        return error(res, `Invalid step name. Must be one of: ${validSteps.join(', ')}`, 400);
      }

      if (!body.instructions || typeof body.instructions !== 'string') {
        return error(res, 'instructions is required', 400);
      }

      // Get the story
      const { story } = await storyService.findStoryWithEpic(params.id);
      if (!story) {
        return error(res, `Story ${params.id} not found`, 404);
      }

      const currentContent = story.steps[params.stepName]?.content;
      if (!currentContent) {
        return error(res, `Step ${params.stepName} has no content to iterate on. Generate first.`, 400);
      }

      // Build context from story
      let context = '';
      if (story.init?.enriched) {
        context += `Story Init:\n${story.init.enriched}\n\n`;
      }

      // Iterate with AI
      const newContent = await aiProvider.iterateContent(currentContent, body.instructions, context);

      // Save new version
      const updatedStory = await storyService.addStepVersion(
        params.id,
        params.stepName,
        newContent,
        body.instructions,
        aiProvider.getModel()
      );

      json(res, {
        content: newContent,
        version: updatedStory.steps[params.stepName].currentVersion,
        model: aiProvider.getModel(),
        history: updatedStory.steps[params.stepName].history,
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * GET /api/stories/:id/steps/:stepName/history - Get step version history
   */
  router.get('/api/stories/:id/steps/:stepName/history', async (req, res, { params, root }) => {
    try {
      const { storyService } = await getServices(root);

      const validSteps = STORY_STEPS;
      if (!validSteps.includes(params.stepName)) {
        return error(res, `Invalid step name. Must be one of: ${validSteps.join(', ')}`, 400);
      }

      const history = await storyService.getStepHistory(params.id, params.stepName);
      json(res, { history });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/stories/:id/steps/:stepName/revert - Revert to a previous version
   * Body: { version: number }
   */
  router.post('/api/stories/:id/steps/:stepName/revert', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { storyService } = await getServices(root);

      const validSteps = STORY_STEPS;
      if (!validSteps.includes(params.stepName)) {
        return error(res, `Invalid step name. Must be one of: ${validSteps.join(', ')}`, 400);
      }

      if (typeof body.version !== 'number') {
        return error(res, 'version is required and must be a number', 400);
      }

      const story = await storyService.revertStepToVersion(params.id, params.stepName, body.version);

      json(res, {
        story,
        currentVersion: story.steps[params.stepName].currentVersion,
        content: story.steps[params.stepName].content,
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/stories/:id/steps/:stepName/generate - Generate step content with AI (with history)
   * Updated to save versions in history
   */
  router.post('/api/stories/:id/steps/:stepName/generate', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { storyService, aiProvider } = await getServices(root);

      if (!aiProvider.isConfigured()) {
        return error(res, 'AI provider not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.', 400);
      }

      const validSteps = STORY_STEPS;
      if (!validSteps.includes(params.stepName)) {
        return error(res, `Invalid step name. Must be one of: ${validSteps.join(', ')}`, 400);
      }

      // Get the story
      const { story } = await storyService.findStoryWithEpic(params.id);
      if (!story) {
        return error(res, `Story ${params.id} not found`, 404);
      }

      // Build context from story init
      let context = '';
      if (story.init?.enriched) {
        context += `Story Context:\n${story.init.enriched}`;
      } else if (story.init?.input) {
        context += `Story Context:\n${story.init.input}`;
      }

      // Build input based on step type
      let input = `Story: ${story.title}\n`;
      if (story.description) {
        input += `Description: ${story.description}\n`;
      }
      if (body.context) {
        input += `Additional context: ${body.context}\n`;
      }

      // Generate based on step type
      let generatedContent;
      switch (params.stepName) {
        case 'brief':
          generatedContent = await aiProvider.generateBrief(input, context);
          break;
        case 'baSpec':
          if (story.steps?.brief?.content) {
            input = `${input}\nExisting Brief:\n${story.steps.brief.content}`;
          }
          generatedContent = await aiProvider.generateBASpec(input, context);
          break;
        case 'questions':
          if (story.steps?.brief?.content) {
            input = `${input}\nBrief:\n${story.steps.brief.content}`;
          }
          if (story.steps?.baSpec?.content) {
            input = `${input}\nBA Specification:\n${story.steps.baSpec.content}`;
          }
          generatedContent = await aiProvider.generateQuestions(input, context);
          break;
      }

      // Save to history
      const updatedStory = await storyService.addStepVersion(
        params.id,
        params.stepName,
        generatedContent,
        body.instructions || 'Initial generation',
        aiProvider.getModel()
      );

      json(res, {
        content: generatedContent,
        version: updatedStory.steps[params.stepName].currentVersion,
        model: aiProvider.getModel(),
        provider: aiProvider.getProvider(),
        history: updatedStory.steps[params.stepName].history,
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'AI_RESPONSE_ERROR' || err.code === 'AI_UNAVAILABLE') {
        error(res, err.message, 502);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  // ============== STORY CONVERSATION ENDPOINTS ==============

  /**
   * GET /api/stories/:id/steps/:stepName/conversation - Get conversation history for a step
   */
  router.get('/api/stories/:id/steps/:stepName/conversation', async (req, res, { params, root }) => {
    try {
      const { storyService } = await getServices(root);
      const conversation = await storyService.getConversation(params.id, params.stepName);
      json(res, conversation);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'VALIDATION_ERROR') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/stories/:id/steps/:stepName/chat - Send a message in step conversation
   * Body: { message: string }
   * Returns AI response in configured communication_language
   */
  router.post('/api/stories/:id/steps/:stepName/chat', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { storyService, aiProvider } = await getServices(root);

      if (!aiProvider.isConfigured()) {
        return error(res, 'AI provider not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.', 400);
      }

      if (!body.message || typeof body.message !== 'string') {
        return error(res, 'message is required and must be a string', 400);
      }

      // Get the story
      const { story } = await storyService.findStoryWithEpic(params.id);
      if (!story) {
        return error(res, `Story ${params.id} not found`, 404);
      }

      // Get step content for context
      const stepContent = story.steps[params.stepName]?.content || '';

      // Load config for communication_language
      let communicationLanguage = 'English';
      try {
        const config = await loadConfig(root);
        communicationLanguage = config.communication_language || 'English';
      } catch {
        // Use default
      }

      // Add user message to conversation
      await storyService.addConversationMessage(params.id, params.stepName, 'user', body.message);

      // Build context from story and previous conversation
      const conversation = await storyService.getConversation(params.id, params.stepName);
      let conversationContext = '';
      if (conversation.messages.length > 1) {
        conversationContext = '\n\nPrevious conversation:\n' +
          conversation.messages.slice(-10).map(m =>
            `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
          ).join('\n');
      }

      // Build prompt for AI
      const prompt = `You are a helpful assistant reviewing and iterating on a product/feature specification.

CURRENT STEP: ${params.stepName}
CURRENT CONTENT:
${stepContent || '(No content yet)'}
${conversationContext}

USER MESSAGE: ${body.message}

RESPONSE LANGUAGE: ${communicationLanguage}

TASK: Respond helpfully to the user's message. You can:
- Answer questions about the current content
- Suggest improvements
- Clarify requirements
- Identify gaps or issues

Keep your response concise and actionable. If the user wants changes, describe what should change but don't rewrite the whole document.

IMPORTANT: Respond in ${communicationLanguage}.`;

      const response = await callModel(aiProvider.getModel(), prompt, { verbose: false, apply: false });

      // Add assistant response to conversation
      const assistantMessage = await storyService.addConversationMessage(
        params.id,
        params.stepName,
        'assistant',
        response.trim(),
        response.trim() // translatedContent is same since we asked for specific language
      );

      json(res, {
        response: response.trim(),
        message: assistantMessage,
        language: communicationLanguage,
        model: aiProvider.getModel(),
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'VALIDATION_ERROR') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * DELETE /api/stories/:id/steps/:stepName/conversation - Clear conversation history
   */
  router.delete('/api/stories/:id/steps/:stepName/conversation', async (req, res, { params, root }) => {
    try {
      const { storyService } = await getServices(root);
      await storyService.clearConversation(params.id, params.stepName);
      json(res, { ok: true });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'VALIDATION_ERROR') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/stories/:id/steps/:stepName/recap - Recap conversation and regenerate step content
   * Combines all feedback from conversation into an updated version
   */
  router.post('/api/stories/:id/steps/:stepName/recap', async (req, res, { params, root }) => {
    try {
      const { storyService, aiProvider } = await getServices(root);

      if (!aiProvider.isConfigured()) {
        return error(res, 'AI provider not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.', 400);
      }

      // Get the story
      const { story } = await storyService.findStoryWithEpic(params.id);
      if (!story) {
        return error(res, `Story ${params.id} not found`, 404);
      }

      // Get current step content
      const stepContent = story.steps[params.stepName]?.content;
      if (!stepContent) {
        return error(res, `Step ${params.stepName} has no content to update`, 400);
      }

      // Get conversation history
      const conversation = await storyService.getConversation(params.id, params.stepName);
      if (!conversation.messages || conversation.messages.length === 0) {
        return error(res, 'No conversation to recap', 400);
      }

      // Build conversation summary
      const conversationText = conversation.messages
        .map(m => `${m.role === 'user' ? 'USER FEEDBACK' : 'ASSISTANT RESPONSE'}: ${m.content}`)
        .join('\n\n');

      // Build prompt for regeneration
      const prompt = `You are updating a document based on user feedback collected during a conversation.

ORIGINAL DOCUMENT (${params.stepName}):
${stepContent}

CONVERSATION WITH FEEDBACK:
${conversationText}

TASK:
Regenerate the ${params.stepName} document incorporating all the user's feedback and suggestions from the conversation.
- Keep the same format and structure as the original
- Apply all requested changes
- Maintain professional tone
- Output ONLY the updated document, no explanations`;

      const newContent = await callModel(aiProvider.getModel(), prompt, { verbose: false, apply: false });

      // Save new version
      const updatedStory = await storyService.addStepVersion(
        params.id,
        params.stepName,
        newContent.trim(),
        'Recap from conversation feedback',
        aiProvider.getModel()
      );

      // Clear conversation after recap
      await storyService.clearConversation(params.id, params.stepName);

      json(res, {
        content: newContent.trim(),
        version: updatedStory.steps[params.stepName].currentVersion,
        model: aiProvider.getModel(),
        conversationCleared: true,
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'VALIDATION_ERROR') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  // ============== STORY INIT ASSETS ENDPOINTS ==============

  /**
   * GET /api/stories/:id/init/assets - Get all init assets (attachments + figma links)
   */
  router.get('/api/stories/:id/init/assets', async (req, res, { params, root }) => {
    try {
      const { storyService } = await getServices(root);
      const assets = await storyService.getInitAssets(params.id);
      json(res, assets);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/stories/:id/init/figma - Add a Figma link
   * Body: { url: string, label?: string }
   */
  router.post('/api/stories/:id/init/figma', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { storyService, figmaProvider } = await getServices(root);

      if (!body.url) {
        return error(res, 'url is required', 400);
      }

      if (!isValidFigmaUrl(body.url)) {
        return error(res, 'Invalid Figma URL format', 400);
      }

      // Generate cache key
      const cacheKey = figmaProvider.isConfigured() ? figmaProvider.getCacheKey(body.url) : null;

      const story = await storyService.addFigmaLink(params.id, body.url, body.label || null, cacheKey);

      // Optionally fetch and cache Figma data
      let figmaData = null;
      if (figmaProvider.isConfigured()) {
        try {
          figmaData = await figmaProvider.fetchDesign(body.url);
        } catch {
          // Continue without cached data
        }
      }

      json(res, {
        story,
        figmaLinks: story.init?.figmaLinks || [],
        cachedData: figmaData,
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'VALIDATION_ERROR') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * DELETE /api/stories/:id/init/figma - Remove a Figma link
   * Body: { url: string }
   */
  router.delete('/api/stories/:id/init/figma', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { storyService } = await getServices(root);

      if (!body.url) {
        return error(res, 'url is required', 400);
      }

      const story = await storyService.removeFigmaLink(params.id, body.url);

      json(res, {
        story,
        figmaLinks: story.init?.figmaLinks || [],
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/stories/:id/init/attachments - Upload attachments (multipart/form-data)
   */
  router.post('/api/stories/:id/init/attachments', async (req, res, { params, root }) => {
    try {
      const { storyService, storage } = await getServices(root);

      // Verify story exists
      const { story } = await storyService.findStoryWithEpic(params.id);
      if (!story) {
        return error(res, `Story ${params.id} not found`, 404);
      }

      // Create attachments directory
      const attachDir = path.join(storage.getAiaDir(), 'story-attachments', params.id);
      await fs.ensureDir(attachDir);

      const busboy = Busboy({
        headers: req.headers,
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
      });

      const uploadedFiles = [];
      let totalSize = 0;
      const maxTotalSize = 50 * 1024 * 1024; // 50MB total
      let hasError = false;

      busboy.on('file', (name, file, info) => {
        if (hasError) {
          file.resume();
          return;
        }

        const { filename, mimeType } = info;
        const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = path.join(attachDir, safeName);
        const relativePath = path.join('story-attachments', params.id, safeName);

        let fileSize = 0;
        const writeStream = fs.createWriteStream(filePath);

        file.on('data', (data) => {
          fileSize += data.length;
          totalSize += data.length;

          if (totalSize > maxTotalSize) {
            hasError = true;
            file.resume();
            writeStream.destroy();
            fs.unlink(filePath).catch(() => {});
            return;
          }
        });

        file.pipe(writeStream);

        file.on('end', () => {
          if (!hasError) {
            uploadedFiles.push({
              filename: safeName,
              path: relativePath,
              type: mimeType,
              size: fileSize,
            });
          }
        });
      });

      busboy.on('finish', async () => {
        if (hasError) {
          return error(res, 'Total upload size exceeds 50MB limit', 400);
        }

        try {
          // Add each file to story
          let updatedStory = story;
          for (const file of uploadedFiles) {
            updatedStory = await storyService.addAttachment(params.id, file);
          }

          json(res, {
            uploaded: uploadedFiles.length,
            files: uploadedFiles,
            attachments: updatedStory.init?.attachments || [],
          });
        } catch (err) {
          error(res, err.message, 500);
        }
      });

      busboy.on('error', (err) => {
        error(res, `Upload error: ${err.message}`, 500);
      });

      req.pipe(busboy);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/stories/:id/init/attachments - List attachments
   */
  router.get('/api/stories/:id/init/attachments', async (req, res, { params, root }) => {
    try {
      const { storyService } = await getServices(root);
      const assets = await storyService.getInitAssets(params.id);
      json(res, assets.attachments);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * GET /api/stories/:id/init/attachments/:filename - Download attachment
   */
  router.get('/api/stories/:id/init/attachments/:filename', async (req, res, { params, root }) => {
    try {
      const { storage } = await getServices(root);

      const safeName = path.basename(params.filename);
      const filePath = path.join(storage.getAiaDir(), 'story-attachments', params.id, safeName);

      if (!(await fs.pathExists(filePath))) {
        return error(res, 'Attachment not found', 404);
      }

      const stat = await fs.stat(filePath);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);

      const readStream = fs.createReadStream(filePath);
      readStream.pipe(res);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * DELETE /api/stories/:id/init/attachments/:filename - Delete attachment
   */
  router.delete('/api/stories/:id/init/attachments/:filename', async (req, res, { params, root }) => {
    try {
      const { storyService, storage } = await getServices(root);

      const safeName = path.basename(params.filename);
      const filePath = path.join(storage.getAiaDir(), 'story-attachments', params.id, safeName);

      // Remove from story
      const story = await storyService.removeAttachment(params.id, safeName);

      // Delete file
      if (await fs.pathExists(filePath)) {
        await fs.unlink(filePath);
      }

      json(res, {
        deleted: safeName,
        attachments: story.init?.attachments || [],
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * GET /api/stories/:id/can-promote - Check if Story can be promoted
   */
  router.get('/api/stories/:id/can-promote', async (req, res, { params, root }) => {
    try {
      const { storyService } = await getServices(root);
      const result = await storyService.canPromote(params.id);
      json(res, result);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  // ============== QA ENDPOINTS ==============

  /**
   * GET /api/qa/queue - List Stories in testing
   */
  router.get('/api/qa/queue', async (req, res, { root }) => {
    try {
      const { qaService } = await getServices(root);
      const stories = await qaService.listTestingQueue();
      json(res, stories);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/qa/stats - Get QA statistics
   */
  router.get('/api/qa/stats', async (req, res, { root }) => {
    try {
      const { qaService } = await getServices(root);
      const stats = await qaService.getStats();
      json(res, stats);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/qa/:storyId/approve - Approve Story
   */
  router.post('/api/qa/:storyId/approve', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { qaService } = await getServices(root);
      const story = await qaService.approve(params.storyId, body.notes);
      json(res, story);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'BUSINESS_RULE_VIOLATION') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/qa/:storyId/reject - Reject Story
   */
  router.post('/api/qa/:storyId/reject', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { qaService } = await getServices(root);
      const result = await qaService.reject(params.storyId, body.reason);
      json(res, result);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'VALIDATION_ERROR' || err.code === 'BUSINESS_RULE_VIOLATION') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/qa/:storyId/to-testing - Move Story to testing
   */
  router.post('/api/qa/:storyId/to-testing', async (req, res, { params, root }) => {
    try {
      const { qaService } = await getServices(root);
      const story = await qaService.moveToTesting(params.storyId);
      json(res, story);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'BUSINESS_RULE_VIOLATION') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * GET /api/qa/:storyId/history - Get QA history for Story
   */
  router.get('/api/qa/:storyId/history', async (req, res, { params, root }) => {
    try {
      const { qaService } = await getServices(root);
      const history = await qaService.getHistory(params.storyId);
      json(res, history);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  // ============== ROADMAP ENDPOINTS ==============

  /**
   * GET /api/roadmap - Get roadmap view
   * Query params: ?granularity=quarterly&periodsAhead=4&includeCompleted=false
   */
  router.get('/api/roadmap', async (req, res, { root, query }) => {
    try {
      const { roadmapService } = await getServices(root);
      const options = {
        granularity: query?.granularity || 'quarterly',
        periodsAhead: parseInt(query?.periodsAhead || '4', 10),
        includeCompleted: query?.includeCompleted === 'true',
      };
      const roadmap = await roadmapService.getRoadmap(options);
      json(res, roadmap);
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * GET /api/roadmap/stats - Get roadmap statistics
   */
  router.get('/api/roadmap/stats', async (req, res, { root }) => {
    try {
      const { roadmapService } = await getServices(root);
      const stats = await roadmapService.getStats();
      json(res, stats);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/roadmap/assign - Assign Epic to period
   */
  router.post('/api/roadmap/assign', async (req, res, { root, parseBody }) => {
    try {
      const body = await parseBody();
      const { roadmapService } = await getServices(root);
      const epic = await roadmapService.assignPeriod(body.epicId, body.period);
      json(res, epic);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'VALIDATION_ERROR') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/roadmap/unassign - Remove Epic from period (move to backlog)
   */
  router.post('/api/roadmap/unassign', async (req, res, { root, parseBody }) => {
    try {
      const body = await parseBody();
      const { roadmapService } = await getServices(root);
      const epic = await roadmapService.unassignPeriod(body.epicId);
      json(res, epic);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * GET /api/roadmap/periods/:period - Get Epics for specific period
   */
  router.get('/api/roadmap/periods/:period', async (req, res, { params, root }) => {
    try {
      const { roadmapService } = await getServices(root);
      const epics = await roadmapService.getEpicsForPeriod(params.period);
      json(res, epics);
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * GET /api/roadmap/periods/:period/progress - Get period progress
   */
  router.get('/api/roadmap/periods/:period/progress', async (req, res, { params, root }) => {
    try {
      const { roadmapService } = await getServices(root);
      const progress = await roadmapService.getPeriodProgress(params.period);
      json(res, progress);
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  // ============== SYSTEM ENDPOINTS ==============

  /**
   * GET /api/epic-system/diagnose - Run system diagnostics
   */
  router.get('/api/epic-system/diagnose', async (req, res, { root }) => {
    try {
      const { integrityService, storyIndexService } = await getServices(root);
      const issues = await integrityService.runAllChecks();
      const indexValid = await storyIndexService.validate();
      json(res, {
        healthy: issues.length === 0 && indexValid,
        issues,
        indexValid,
      });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/epic-system/repair - Repair integrity issues
   */
  router.post('/api/epic-system/repair', async (req, res, { root }) => {
    try {
      const { integrityService, storyIndexService } = await getServices(root);
      const issues = await integrityService.runAllChecks();
      const repaired = await integrityService.repair(issues);
      await storyIndexService.rebuild();
      json(res, { repaired, indexRebuilt: true });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/epic-system/rebuild-index - Rebuild story index
   */
  router.post('/api/epic-system/rebuild-index', async (req, res, { root }) => {
    try {
      const { storyIndexService } = await getServices(root);
      await storyIndexService.rebuild();
      json(res, { ok: true });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  // ============== POC ENDPOINTS ==============

  /**
   * GET /api/stories/:id/pocs - List POC files for a story
   */
  router.get('/api/stories/:id/pocs', async (req, res, { params, root }) => {
    try {
      const { pocService } = await getServices(root);
      const files = await pocService.listPOCs(params.id);
      json(res, { files });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/stories/:id/poc/generate - Generate POC for a story
   */
  router.post('/api/stories/:id/poc/generate', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { pocService, pocEnvService, aiProvider } = await getServices(root);

      // Check AI provider
      if (!aiProvider.isConfigured()) {
        return error(res, 'AI provider not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.', 400);
      }

      const mode = body.mode || 'full';
      const filename = body.filename || 'poc.js';

      // Generate POC
      const result = await pocService.generateAndSave(params.id, filename, {
        context: body.context,
        includeFigmaData: body.includeFigma !== false,
      });

      let envPath = null;

      // Create isolated environment if requested
      if (body.isolated && mode !== 'prototype') {
        const env = await pocEnvService.createEnvironment(params.id, {
          withGit: true,
          withDeps: true,
          template: body.template || 'minimal',
        });
        await pocEnvService.copyPOCToEnv(params.id, filename);
        envPath = env.path;
      } else if (mode === 'prototype') {
        // Prototype mode: minimal environment
        const env = await pocEnvService.createEnvironment(params.id, {
          withGit: false,
          withDeps: false,
          template: 'minimal',
        });
        await pocEnvService.copyPOCToEnv(params.id, filename);
        envPath = env.path;
      }

      json(res, {
        filename: result.savedAs,
        envPath,
        model: result.metadata.model,
        hadFigmaData: result.metadata.hadFigmaData,
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * GET /api/stories/:id/pocs/:filename - Get POC file content
   */
  router.get('/api/stories/:id/pocs/:filename', async (req, res, { params, root }) => {
    try {
      const { pocService } = await getServices(root);
      const content = await pocService.getPOC(params.id, params.filename);
      res.setHeader('Content-Type', 'text/plain');
      res.end(content);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  // ============== FIGMA DISCOVERY ENDPOINTS ==============

  /**
   * POST /api/figma/discover - Discover stories from Figma design
   */
  router.post('/api/figma/discover', async (req, res, { root, parseBody }) => {
    try {
      const body = await parseBody();
      const { figmaDiscoveryService, figmaProvider } = await getServices(root);

      if (!figmaProvider.isConfigured()) {
        return error(res, 'Figma API not configured. Set FIGMA_TOKEN environment variable.', 400);
      }

      if (!body.figmaUrl) {
        return error(res, 'figmaUrl is required', 400);
      }

      const result = await figmaDiscoveryService.discoverStories(body.figmaUrl, {
        useAI: body.useAI || false,
        context: body.context || '',
      });

      json(res, result);
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR') {
        error(res, err.message, 400);
      } else if (err.code === 'EXTERNAL_SERVICE_ERROR') {
        error(res, err.message, 502);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/figma/import - Import discovered stories into an epic
   */
  router.post('/api/figma/import', async (req, res, { root, parseBody }) => {
    try {
      const body = await parseBody();
      const { figmaDiscoveryService } = await getServices(root);

      if (!body.epicId || !body.stories || !body.figmaUrl) {
        return error(res, 'epicId, stories, and figmaUrl are required', 400);
      }

      const result = await figmaDiscoveryService.importStories(body.epicId, body.stories, body.figmaUrl);
      json(res, result);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else if (err.code === 'VALIDATION_ERROR') {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/figma/analyze - Analyze a Figma design
   */
  router.post('/api/figma/analyze', async (req, res, { root, parseBody }) => {
    try {
      const body = await parseBody();
      const { figmaDiscoveryService, figmaProvider } = await getServices(root);

      if (!figmaProvider.isConfigured()) {
        return error(res, 'Figma API not configured. Set FIGMA_TOKEN environment variable.', 400);
      }

      if (!body.figmaUrl) {
        return error(res, 'figmaUrl is required', 400);
      }

      const result = await figmaDiscoveryService.analyzeDesign(body.figmaUrl);
      json(res, result);
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR') {
        error(res, err.message, 400);
      } else if (err.code === 'EXTERNAL_SERVICE_ERROR') {
        error(res, err.message, 502);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * GET /api/figma/status - Check Figma API status
   */
  router.get('/api/figma/status', async (req, res, { root }) => {
    try {
      const { figmaProvider } = await getServices(root);
      json(res, {
        configured: figmaProvider.isConfigured(),
        message: figmaProvider.isConfigured()
          ? 'Figma API is configured'
          : 'Set FIGMA_TOKEN environment variable to enable Figma integration',
      });
    } catch (err) {
      error(res, err.message, 500);
    }
  });
}
