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
import { isValidFigmaUrl, STORY_STEPS, normalizeStepName } from '../../epic/models/validators.js';
import { CODE_STEPS, STEP_ORDER } from '../../constants.js';
import { loadConfig } from '../../models.js';
import { callModel } from '../../services/model-call.js';
import { buildPrompt } from '../../prompt-builder.js';

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
   * Always loads step content from .md files (source of truth)
   */
  router.get('/api/stories/:id', async (req, res, { params, root }) => {
    console.log(`[GET /api/stories/${params.id}] Starting, root=${root}`);
    try {
      // Always try to load from CLI format first (status.yaml + .md files)
      const storyDir = path.join(root, '.aia', 'stories', params.id);
      const statusFile = path.join(storyDir, 'status.yaml');
      console.log(`[GET /api/stories/${params.id}] Checking ${statusFile}`);

      const statusExists = await fs.pathExists(statusFile);
      console.log(`[GET /api/stories/${params.id}] statusFile exists: ${statusExists}`);

      if (statusExists) {
        const yaml = await import('yaml');
        const statusContent = await fs.readFile(statusFile, 'utf-8');
        const status = yaml.default.parse(statusContent);
        console.log(`[GET /api/stories/${params.id}] Loaded status, steps:`, Object.keys(status.steps || {}));

        // Build story object from CLI format
        const cliStory = {
          id: params.id,
          slug: status.slug || params.id,
          title: status.name || params.id,
          name: status.name || params.id,
          description: '',
          type: status.type || 'feature',
          phase: status.phase || 'development',
          space: 'development',
          steps: {},
          init: {},
          createdAt: status.createdAt || new Date().toISOString(),
          updatedAt: status.updatedAt || new Date().toISOString(),
          skippedSteps: status.skippedSteps || [],
          knowledge: status.knowledge || [],
        };

        // Helper to detect default template (not real content)
        const isDefaultTemplate = (content) => {
          if (!content) return true;
          return content.includes('<!-- Describe your story here') ||
                 content.includes('<!-- Add epic description here') ||
                 content.includes('<!-- Add any initial specs');
        };

        // Load init.md if exists
        const initFile = path.join(storyDir, 'init.md');
        if (await fs.pathExists(initFile)) {
          const initContent = await fs.readFile(initFile, 'utf-8');
          // Only set as enriched if it's not the default template
          if (initContent && initContent.trim() && !isDefaultTemplate(initContent)) {
            cliStory.init.enriched = initContent;
            cliStory.init.input = initContent;
          }
        }

        // V3 step files (kebab-case) - these are the canonical names
        const v3StepFiles = [
          { file: 'init.md', key: 'init', kebab: 'init' },
          { file: 'brainstorming.md', key: 'brainstorming', kebab: 'brainstorming' },
          { file: 'spec-func.md', key: 'specFunc', kebab: 'spec-func' },
          { file: 'spec-tech.md', key: 'specTech', kebab: 'spec-tech' },
          { file: 'dev-plan.md', key: 'devPlan', kebab: 'dev-plan' },
          { file: 'implement.md', key: 'implement', kebab: 'implement' },
          { file: 'review.md', key: 'review', kebab: 'review' },
        ];

        // Load V3 step content
        for (const { file, key, kebab } of v3StepFiles) {
          const filePath = path.join(storyDir, file);
          const fileExists = await fs.pathExists(filePath);
          if (fileExists) {
            const rawContent = await fs.readFile(filePath, 'utf-8');
            const stepStatus = status.steps?.[kebab] || status.steps?.[key] || 'pending';

            // For init step, ignore default template content
            const isTemplate = key === 'init' && isDefaultTemplate(rawContent);
            const content = isTemplate ? '' : rawContent;
            const hasContent = content && content.trim().length > 0;

            console.log(`[GET /api/stories/${params.id}] ${file}: exists=${fileExists}, length=${rawContent?.length || 0}, isTemplate=${isTemplate}, hasContent=${hasContent}`);

            cliStory.steps[key] = {
              content: content || '',
              completed: stepStatus === 'done' || hasContent,
              skipped: stepStatus === 'skipped' || (status.skippedSteps || []).includes(key),
              currentVersion: hasContent ? 1 : 0,
              history: hasContent ? [{
                version: 1,
                content,
                generatedAt: cliStory.updatedAt,
              }] : [],
            };
          } else {
            // Step file doesn't exist yet
            const stepStatus = status.steps?.[kebab] || status.steps?.[key] || 'pending';
            cliStory.steps[key] = {
              content: '',
              completed: false,
              skipped: stepStatus === 'skipped' || (status.skippedSteps || []).includes(key),
              currentVersion: 0,
              history: [],
            };
          }
        }

        return json(res, {
          ...cliStory,
          epicId: status.epic || 'general',
          epicName: status.epic || 'General',
        });
      }

      // Fallback: try JSON-based story (epic system)
      const { storyService } = await getServices(root);
      const { epic, story } = await storyService.findStoryWithEpic(params.id);

      if (story) {
        return json(res, {
          ...story,
          epicId: epic?.id || null,
          epicName: epic?.name || null,
        });
      }

      return error(res, `Story ${params.id} not found`, 404);
    } catch (err) {
      console.error(`[GET /api/stories/${params.id}] Error:`, err.message);
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
          selectedModel = body.model || config.models?.init?.[0]?.model || 'claude-default';
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
        // Use provided model or get from config (init step is a good default)
        selectedModel = body.model || config.models?.init?.[0]?.model || 'claude-default';
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
   * POST /api/stories/:id/steps/:stepName/generate - Generate step content with AI (SSE)
   * Uses buildPrompt for V3 steps and returns filesUsed metadata
   */
  router.post('/api/stories/:id/steps/:stepName/generate', async (req, res, { params, root, parseBody }) => {
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

      // Start SSE
      sseHeaders();
      sseSend('status', { status: 'preparing', message: 'Building prompt context...' });

      // Normalize step name for buildPrompt (kebab-case)
      const normalizedStep = normalizeStepName(params.stepName);
      const apiStepName = params.stepName.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');

      // Check if this is a V3 step that can use buildPrompt
      const v3Steps = ['init', 'brainstorming', 'spec-func', 'spec-tech', 'dev-plan', 'implement', 'review'];
      const isV3Step = v3Steps.includes(apiStepName);

      let generatedContent;
      let filesUsed = null;
      let selectedModel = aiProvider.getModel();

      if (isV3Step && story.slug) {
        // Use buildPrompt for V3 steps
        sseSend('status', { status: 'loading', message: 'Loading context files...' });

        try {
          const promptResult = await buildPrompt(story.slug, apiStepName, {
            description: body.context || '',
            instructions: body.instructions || '',
            root,
          });

          filesUsed = promptResult.filesUsed;
          const prompt = promptResult.prompt;

          sseSend('status', { status: 'generating', message: 'AI is generating content...' });

          // Stream log output to client
          const onData = ({ type, text }) => {
            try {
              sseSend('log', { type, text });
            } catch {
              // Ignore write errors during streaming
            }
          };

          // Load model from config
          try {
            const config = await loadConfig(root);
            selectedModel = body.model || config.models?.[apiStepName]?.[0]?.model || aiProvider.getModel();
          } catch {
            // Use default model
          }

          generatedContent = await callModel(selectedModel, prompt, {
            verbose: false,
            apply: false,
            onData,
            cwd: root,
          });
        } catch (err) {
          // Fallback to legacy method if buildPrompt fails
          console.log(`[Generate] buildPrompt failed for ${apiStepName}: ${err.message}, falling back to legacy`);
          sseSend('log', { type: 'warn', text: `Using legacy generation (buildPrompt failed: ${err.message})` });
          generatedContent = await generateLegacy(story, params.stepName, body, aiProvider);
        }
      } else {
        // Use legacy method for old steps
        sseSend('status', { status: 'generating', message: 'AI is generating content...' });
        generatedContent = await generateLegacy(story, params.stepName, body, aiProvider);
      }

      // Save to history (normalizeStepName ensures camelCase storage)
      console.log(`[Generate] Saving content (${generatedContent?.length || 0} chars) for step ${params.stepName}`);

      let updatedStory;
      const stepKey = normalizeStepName(params.stepName);

      try {
        updatedStory = await storyService.addStepVersion(
          params.id,
          params.stepName,
          generatedContent,
          body.instructions || 'Initial generation',
          selectedModel
        );
        console.log(`[Generate] Story saved successfully. Steps keys: ${Object.keys(updatedStory?.steps || {}).join(', ')}`);
      } catch (saveErr) {
        console.error(`[Generate] Failed to save to story service: ${saveErr.message}`);

        // Fallback: try to write directly to .md file for CLI-format stories
        if (story.slug) {
          try {
            const storyDir = path.join(root, '.aia', 'stories', story.slug);
            const stepFile = path.join(storyDir, `${apiStepName}.md`);

            if (await fs.pathExists(storyDir)) {
              await fs.writeFile(stepFile, generatedContent, 'utf-8');
              console.log(`[Generate] Fallback: Saved to ${stepFile}`);
              sseSend('log', { type: 'info', text: `Saved to ${apiStepName}.md` });

              // Create a mock story response for the UI
              updatedStory = {
                ...story,
                steps: {
                  ...story.steps,
                  [stepKey]: {
                    content: generatedContent,
                    completed: true,
                    currentVersion: 1,
                    history: [{
                      version: 1,
                      content: generatedContent,
                      generatedAt: new Date().toISOString(),
                    }],
                  },
                },
              };
            } else {
              throw new Error(`Story directory not found: ${storyDir}`);
            }
          } catch (fallbackErr) {
            console.error(`[Generate] Fallback also failed: ${fallbackErr.message}`);
            sseSend('log', { type: 'error', text: `Save failed: ${fallbackErr.message}` });
            sseSend('done', {
              ok: false,
              error: saveErr.message,
              content: generatedContent,
              filesUsed,
            });
            res.end();
            return;
          }
        } else {
          sseSend('log', { type: 'error', text: `Save failed: ${saveErr.message}` });
          sseSend('done', {
            ok: false,
            error: saveErr.message,
            content: generatedContent,
            filesUsed,
          });
          res.end();
          return;
        }
      }

      console.log(`[Generate] Normalized step key: ${stepKey}, has content: ${!!updatedStory?.steps?.[stepKey]?.content}`);

      // Send completion event with filesUsed
      sseSend('done', {
        ok: true,
        story: updatedStory,
        content: generatedContent,
        version: updatedStory.steps[stepKey]?.currentVersion,
        model: selectedModel,
        provider: aiProvider.getProvider(),
        filesUsed,
        history: updatedStory.steps[stepKey]?.history,
      });
    } catch (err) {
      try {
        sseSend('error', { message: err.message });
      } catch {
        // If SSE not started yet, use regular error response
        if (err.code === 'NOT_FOUND') {
          error(res, err.message, 404);
        } else if (err.code === 'AI_RESPONSE_ERROR' || err.code === 'AI_UNAVAILABLE') {
          error(res, err.message, 502);
        } else {
          error(res, err.message, 500);
        }
        return;
      }
    }
    res.end();
  });

  // Helper function for legacy generation
  async function generateLegacy(story, stepName, body, aiProvider) {
    let context = '';
    if (story.init?.enriched) {
      context += `Story Context:\n${story.init.enriched}`;
    } else if (story.init?.input) {
      context += `Story Context:\n${story.init.input}`;
    }

    let input = `Story: ${story.title}\n`;
    if (story.description) {
      input += `Description: ${story.description}\n`;
    }
    if (body.context) {
      input += `Additional context: ${body.context}\n`;
    }

    switch (stepName) {
      case 'init':
        return aiProvider.generateInit(input, context);
      case 'specFunc':
        if (story.steps?.init?.content) {
          input = `${input}\nExisting Init:\n${story.steps.init.content}`;
        }
        return aiProvider.generateSpecFunc(input, context);
      case 'brainstorming':
        if (story.steps?.init?.content) {
          input = `${input}\nInit:\n${story.steps.init.content}`;
        }
        if (story.steps?.specFunc?.content) {
          input = `${input}\nFunctional Specification:\n${story.steps.specFunc.content}`;
        }
        return aiProvider.generateBrainstorming(input, context);
      default:
        throw new Error(`No generator for step: ${stepName}`);
    }
  }

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
   * Body: { message: string, reviewMode?: boolean }
   * stepName can end with '-review' for separate review conversations
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

      // Detect review mode from stepName suffix or body flag
      const isReviewMode = params.stepName.endsWith('-review') || body.reviewMode === true;
      const actualStepName = params.stepName.replace(/-review$/, '');
      const conversationKey = params.stepName; // Keep full name for conversation storage

      // Normalize step name from kebab-case to camelCase for story.steps access
      const normalizedStep = normalizeStepName(actualStepName);

      console.log(`[Chat] Mode: ${isReviewMode ? 'REVIEW' : 'ITERATE'}`);
      console.log(`[Chat] Step: ${actualStepName} -> normalized: ${normalizedStep}`);
      console.log(`[Chat] Conversation key: ${conversationKey}`);

      // Get the story
      const { story } = await storyService.findStoryWithEpic(params.id);
      if (!story) {
        return error(res, `Story ${params.id} not found`, 404);
      }

      // Get step content for context - try both kebab and camelCase
      let stepContent = story.steps?.[normalizedStep]?.content || story.steps?.[actualStepName]?.content || '';

      // Log available steps for debugging
      const availableSteps = Object.keys(story.steps || {});
      console.log(`[Chat] Available steps in story: ${availableSteps.join(', ')}`);
      console.log(`[Chat] Step content loaded: ${stepContent ? `${stepContent.length} chars` : 'EMPTY'}`);

      // If no content in story.steps, try to load from .md file
      if (!stepContent) {
        try {
          const fs = await import('fs-extra');
          const path = await import('path');
          const { AIA_DIR } = await import('../../constants.js');

          // Try story directory first
          const storyDir = path.default.join(root, AIA_DIR, 'stories', story.slug || params.id);
          const stepFile = path.default.join(storyDir, `${actualStepName}.md`);

          if (await fs.default.pathExists(stepFile)) {
            stepContent = await fs.default.readFile(stepFile, 'utf8');
            console.log(`[Chat] Loaded from file: ${stepFile} (${stepContent.length} chars)`);
          } else {
            console.log(`[Chat] File not found: ${stepFile}`);
          }
        } catch (err) {
          console.log(`[Chat] Error loading step file: ${err.message}`);
        }
      }

      // Load config for communication_language
      let communicationLanguage = 'English';
      try {
        const config = await loadConfig(root);
        communicationLanguage = config.communication_language || 'English';
      } catch {
        // Use default
      }

      // Add user message to conversation (use full key including -review if present)
      await storyService.addConversationMessage(params.id, conversationKey, 'user', body.message);

      // Build context from story and previous conversation
      const conversation = await storyService.getConversation(params.id, conversationKey);
      let conversationContext = '';
      if (conversation.messages.length > 1) {
        conversationContext = '\n\nPrevious conversation:\n' +
          conversation.messages.slice(-10).map(m =>
            `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
          ).join('\n');
      }

      // Also load story init context if available
      let initContext = '';
      if (story.init?.enriched) {
        initContext = `\n\nSTORY CONTEXT (from init):\n${story.init.enriched}`;
      } else {
        // Try to load init.md directly for CLI-format stories
        try {
          const fs = await import('fs-extra');
          const path = await import('path');
          const { AIA_DIR } = await import('../../constants.js');

          const storyDir = path.default.join(root, AIA_DIR, 'stories', story.slug || params.id);
          const initFile = path.default.join(storyDir, 'init.md');

          if (await fs.default.pathExists(initFile)) {
            const initContent = await fs.default.readFile(initFile, 'utf8');
            // Only use if it's not just the default template
            if (initContent && !initContent.includes('<!-- Describe your story here')) {
              initContext = `\n\nSTORY CONTEXT (from init.md):\n${initContent}`;
            }
          }
        } catch (err) {
          console.log(`[Chat] Error loading init.md: ${err.message}`);
        }
      }

      // Always include story title for context
      const storyTitle = story.title || story.name || params.id;
      const storyDescription = story.description || '';

      console.log(`[Chat] Building prompt with ${stepContent.length} chars of step content, init: ${initContext.length} chars`);

      // Check if this is brainstorming step (chat-first mode)
      const isBrainstorming = actualStepName === 'brainstorming';

      // Build prompt for AI - different modes
      let prompt;
      if (isReviewMode) {
        prompt = `You are a CRITICAL REVIEWER performing an adversarial review. Your job is to find problems, weaknesses, and gaps.

STEP BEING REVIEWED: ${actualStepName}
${initContext}

CONTENT TO REVIEW:
---
${stepContent || '(No content generated for this step yet)'}
---
${conversationContext}

USER MESSAGE: ${body.message}

RESPONSE LANGUAGE: ${communicationLanguage}

YOUR ROLE: Be a tough, skeptical reviewer. You should:
- Challenge assumptions and decisions
- Identify missing edge cases
- Point out ambiguities and inconsistencies
- Question technical choices
- Find potential bugs or issues
- Suggest concrete improvements

Be direct and specific. Don't be nice for the sake of being nice - your job is to make this content better by finding its weaknesses.

Format issues as:
**[SEVERITY: high/medium/low]** Issue description
- Impact: What could go wrong
- Suggestion: How to fix it

IMPORTANT: Respond in ${communicationLanguage}.`;
      } else if (isBrainstorming) {
        // Brainstorming: conversational, exploratory mode
        prompt = `You are a product discovery assistant helping to brainstorm and explore a feature idea.

STORY TITLE: ${storyTitle}
${storyDescription ? `STORY DESCRIPTION: ${storyDescription}` : ''}
${initContext}
${conversationContext}

USER MESSAGE: ${body.message}

RESPONSE LANGUAGE: ${communicationLanguage}

IMPORTANT: You already know the story is about "${storyTitle}". Use this context to provide relevant suggestions.

YOUR ROLE: Help the user explore and refine this feature:
- If the user asks open questions like "what do you suggest?", propose concrete ideas based on the story title
- Ask clarifying questions to understand their needs (one or two at a time)
- Suggest alternative approaches or improvements
- Identify potential challenges and edge cases early
- Help prioritize requirements
- Build on previous answers in the conversation

Be proactive and creative. Start by acknowledging what the feature is about and then guide the discussion.

IMPORTANT: Respond in ${communicationLanguage}.`;
      } else {
        prompt = `You are a helpful assistant iterating on a product/feature specification.

CURRENT STEP: ${actualStepName}
${initContext}

CURRENT CONTENT:
---
${stepContent || '(No content generated for this step yet)'}
---
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
      }

      // Log the prompt header for debugging
      console.log(`[Chat] Prompt starts with: "${prompt.substring(0, 100)}..."`);
      console.log(`[Chat] Total prompt length: ${prompt.length} chars`);

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
   * stepName can end with '-review' for review conversations
   */
  router.post('/api/stories/:id/steps/:stepName/recap', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody().catch(() => ({}));
      const { storyService, aiProvider } = await getServices(root);

      if (!aiProvider.isConfigured()) {
        return error(res, 'AI provider not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.', 400);
      }

      // Detect review mode from stepName suffix or body flag
      const isReviewMode = params.stepName.endsWith('-review') || body.reviewMode === true;
      const actualStepName = params.stepName.replace(/-review$/, '');
      const conversationKey = params.stepName;

      // Get the story
      const { story } = await storyService.findStoryWithEpic(params.id);
      if (!story) {
        return error(res, `Story ${params.id} not found`, 404);
      }

      // Get current step content (use actual step name)
      const normalizedStep = normalizeStepName(actualStepName);
      const stepContent = story.steps[actualStepName]?.content || story.steps[normalizedStep]?.content;

      // Check if this is brainstorming (chat-first mode - no initial content required)
      const isBrainstorming = actualStepName === 'brainstorming';

      // For non-brainstorming steps, content is required
      if (!stepContent && !isBrainstorming) {
        return error(res, `Step ${actualStepName} has no content to update`, 400);
      }

      // Get conversation history (use full key including -review)
      const conversation = await storyService.getConversation(params.id, conversationKey);
      if (!conversation.messages || conversation.messages.length === 0) {
        return error(res, 'No conversation to recap', 400);
      }

      // Build conversation summary
      const conversationText = conversation.messages
        .map(m => `${m.role === 'user' ? 'USER' : 'AI'}: ${m.content}`)
        .join('\n\n');

      // Build prompt for regeneration - different modes
      let prompt;
      if (isBrainstorming) {
        // Brainstorming: generate summary from chat-first conversation
        prompt = `You are creating a structured summary of a brainstorming session.

STORY CONTEXT:
Title: ${story.title || story.name}
Description: ${story.description || 'No description'}

BRAINSTORMING CONVERSATION:
${conversationText}

TASK:
Create a structured markdown summary of this brainstorming session. Include:

## Key Ideas
- List the main ideas discussed

## Explored Options
- Different approaches considered
- Pros and cons mentioned

## Questions & Concerns
- Open questions raised
- Edge cases identified
- Potential challenges

## Decisions & Next Steps
- Any decisions made
- Recommended next steps

## Raw Notes
- Any other important points from the conversation

Output ONLY the markdown summary, no explanations or preamble.`;
      } else if (isReviewMode) {
        prompt = `You are applying fixes identified during an adversarial review session.

ORIGINAL DOCUMENT (${actualStepName}):
${stepContent}

REVIEW SESSION:
${conversationText}

TASK:
Apply the fixes and improvements discussed during the review:
- Fix all issues marked as high or medium severity
- Address the specific problems pointed out
- Keep changes focused on the identified issues
- Maintain the same format and structure
- Output ONLY the fixed document, no explanations

Be thorough but conservative - only change what was identified as problematic.`;
      } else {
        prompt = `You are updating a document based on user feedback collected during a conversation.

ORIGINAL DOCUMENT (${actualStepName}):
${stepContent}

CONVERSATION WITH FEEDBACK:
${conversationText}

TASK:
Regenerate the ${actualStepName} document incorporating all the user's feedback and suggestions from the conversation.
- Keep the same format and structure as the original
- Apply all requested changes
- Maintain professional tone
- Output ONLY the updated document, no explanations`;
      }

      const newContent = await callModel(aiProvider.getModel(), prompt, { verbose: false, apply: false });

      // Save new version to the actual step (not the -review key)
      const targetStep = normalizedStep || actualStepName;
      const updatedStory = await storyService.addStepVersion(
        params.id,
        targetStep,
        newContent.trim(),
        isReviewMode ? 'Fixes from adversarial review' : 'Recap from conversation feedback',
        aiProvider.getModel()
      );

      // Clear conversation after recap
      await storyService.clearConversation(params.id, conversationKey);

      json(res, {
        content: newContent.trim(),
        version: updatedStory.steps[targetStep]?.currentVersion,
        model: aiProvider.getModel(),
        conversationCleared: true,
        reviewMode: isReviewMode,
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

  // ============== V3 PHASE ENDPOINTS ==============

  /**
   * GET /api/stories/:id/phase - Get current phase of a story
   */
  router.get('/api/stories/:id/phase', async (req, res, { params, root }) => {
    try {
      const { storyService } = await getServices(root);
      const phase = await storyService.getCurrentPhase(params.id);
      const skippedSteps = await storyService.getSkippedSteps(params.id);

      json(res, { phase, skippedSteps });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/stories/:id/skip-to/:step - Skip to a target step
   * Marks intermediate steps as skipped
   */
  router.post('/api/stories/:id/skip-to/:step', async (req, res, { params, root }) => {
    try {
      const { storyService } = await getServices(root);
      const result = await storyService.skipToStep(params.id, params.step);

      json(res, {
        story: result.story,
        warning: result.warning,
        skippedSteps: result.skippedSteps || [],
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
   * GET /api/stories/:id/can-skip-to/:step - Check if skip is allowed
   */
  router.get('/api/stories/:id/can-skip-to/:step', async (req, res, { params, root }) => {
    try {
      const { storyService } = await getServices(root);
      const result = await storyService.canSkipTo(params.id, params.step);

      json(res, result);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/stories/:id/review/:step - Start adversarial review on a step
   * Uses review-universal.md prompt
   */
  router.post('/api/stories/:id/review/:step', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { storyService, aiProvider } = await getServices(root);

      if (!aiProvider.isConfigured()) {
        return error(res, 'AI provider not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.', 400);
      }

      const { story } = await storyService.findStoryWithEpic(params.id);
      if (!story) {
        return error(res, `Story ${params.id} not found`, 404);
      }

      // Determine review target - normalize step name from API (kebab-case) to internal (camelCase)
      const normalizedStep = normalizeStepName(params.step);
      const isCodeStep = CODE_STEPS.has(normalizedStep);

      const stepContent = story.steps?.[normalizedStep]?.content;
      if (!stepContent) {
        return error(res, `Step ${params.step} has no content to review`, 400);
      }

      // Response will be handled by conversation system
      json(res, {
        reviewMode: isCodeStep ? 'code' : 'file',
        targetStep: params.step,
        targetContent: stepContent,
        message: 'Use the chat endpoint to continue the review conversation',
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
