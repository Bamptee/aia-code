/**
 * @fileoverview Simple Epic API Routes - YAML-based epic management
 * Replaces the JSON-based epic system with a simpler YAML structure
 */

import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { json, error } from '../router.js';
import { AIA_DIR } from '../../constants.js';
import {
  createEpic,
  loadEpic,
  updateEpic,
  deleteEpic,
  listEpics,
  getEpicStories,
  ensureGeneralEpic,
  archiveEpic,
  unarchiveEpic,
  calculateEpicProgress,
  getEpicDir,
  listEpicsForDropdown,
  getDefaultEpicSlug,
  getAllStorySlugs,
} from '../../services/epic.js';
import { createStory, getStoriesDir } from '../../services/feature.js';
import { QABoosterService } from '../../epic/services/qa-booster-service.js';
import { loadStatus, getStoryDirPath, updateStepStatus } from '../../services/status.js';
import { loadConfig } from '../../models.js';
import { getApps } from '../../services/apps.js';
import { callModel } from '../../services/model-call.js';
import { runStep } from '../../services/runner.js';
import { loadPromptTemplate, loadInitSpecs } from '../../prompt-builder.js';

/**
 * Register all Epic-related API routes (simplified YAML system)
 */
export function registerSimpleEpicRoutes(router) {
  // ============== EPIC ENDPOINTS ==============

  /**
   * GET /api/epics/stats - Get Epic statistics (MUST be before :slug route)
   */
  router.get('/api/epics/stats', async (req, res, { root }) => {
    try {
      const epics = await listEpics(root, { includeArchived: true });

      const stats = {
        total: epics.length,
        active: epics.filter(e => !e.isArchived).length,
        archived: epics.filter(e => e.isArchived).length,
        byStatus: {},
      };

      for (const epic of epics) {
        stats.byStatus[epic.status] = (stats.byStatus[epic.status] || 0) + 1;
      }

      json(res, stats);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/epics/dropdown - List epics for dropdown selection
   * Returns simplified epic list with story counts, sorted with default first
   */
  router.get('/api/epics/dropdown', async (req, res, { root }) => {
    try {
      // Ensure General epic exists
      await ensureGeneralEpic(root);

      const epics = await listEpicsForDropdown(root);
      json(res, { epics });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/epics/default - Get the default epic slug
   */
  router.get('/api/epics/default', async (req, res, { root }) => {
    try {
      const slug = await getDefaultEpicSlug(root);
      const epic = await loadEpic(slug, root);
      json(res, { id: slug, slug, name: epic.name, isDefault: true });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/epics - List all Epics
   */
  router.get('/api/epics', async (req, res, { root, query }) => {
    try {
      // Ensure General epic exists
      await ensureGeneralEpic(root);

      const options = {
        includeArchived: query?.includeArchived === 'true',
        status: query?.status || undefined,
      };
      const epics = await listEpics(root, options);

      // Add progress and id for each epic (id = slug for compatibility)
      const epicsWithProgress = await Promise.all(
        epics.map(async (epic) => {
          const progress = await calculateEpicProgress(epic.slug, root);
          return { ...epic, id: epic.slug, progress };
        })
      );

      json(res, epicsWithProgress);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/epics/:slug - Get single Epic by slug
   */
  router.get('/api/epics/:slug', async (req, res, { params, root }) => {
    try {
      const epic = await loadEpic(params.slug, root);
      const progress = await calculateEpicProgress(params.slug, root);
      const rawStories = await getEpicStories(params.slug, root);

      // Add id and title for UI compatibility
      const stories = rawStories.map(story => ({
        id: story.slug,
        slug: story.slug,
        title: story.name,
        ...story,
      }));

      // Read init.md content
      const initPath = path.join(getEpicDir(params.slug, root), 'init.md');
      let initContent = '';
      if (await fs.pathExists(initPath)) {
        initContent = await fs.readFile(initPath, 'utf-8');
      }

      json(res, { ...epic, id: epic.slug, progress, stories, initContent });
    } catch (err) {
      if (err.message.includes('not found')) {
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

      if (!body.name || typeof body.name !== 'string') {
        return error(res, 'name is required', 400);
      }

      const epic = await createEpic(body.name, root, {
        description: body.description,
        status: body.status,
        plannedPeriod: body.plannedPeriod,
      });

      json(res, { ...epic, id: epic.slug }, 201);
    } catch (err) {
      if (err.message.includes('already exists')) {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * PATCH /api/epics/:slug - Update Epic
   */
  router.patch('/api/epics/:slug', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const epic = await updateEpic(params.slug, body, root);
      json(res, { ...epic, id: epic.slug });
    } catch (err) {
      if (err.message.includes('not found')) {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * PATCH /api/epics/:slug/status - Update Epic status
   */
  router.patch('/api/epics/:slug/status', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const epic = await updateEpic(params.slug, { status: body.status }, root);
      json(res, { ...epic, id: epic.slug });
    } catch (err) {
      if (err.message.includes('not found')) {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * DELETE /api/epics/:slug - Delete Epic (must have no stories)
   */
  router.delete('/api/epics/:slug', async (req, res, { params, root }) => {
    try {
      await deleteEpic(params.slug, root);
      json(res, { ok: true });
    } catch (err) {
      if (err.message.includes('not found')) {
        error(res, err.message, 404);
      } else if (err.message.includes('Cannot delete')) {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/epics/:slug/archive - Archive Epic
   */
  router.post('/api/epics/:slug/archive', async (req, res, { params, root }) => {
    try {
      const epic = await archiveEpic(params.slug, root);
      json(res, { ...epic, id: epic.slug });
    } catch (err) {
      if (err.message.includes('not found')) {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/epics/:slug/unarchive - Unarchive Epic
   */
  router.post('/api/epics/:slug/unarchive', async (req, res, { params, root }) => {
    try {
      const epic = await unarchiveEpic(params.slug, root);
      json(res, { ...epic, id: epic.slug });
    } catch (err) {
      if (err.message.includes('not found')) {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * PUT /api/epics/:slug/init - Update Epic init.md content
   */
  router.put('/api/epics/:slug/init', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const initPath = path.join(getEpicDir(params.slug, root), 'init.md');
      await fs.writeFile(initPath, body.content, 'utf-8');
      json(res, { ok: true });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  // ============== STORY ENDPOINTS (within Epic context) ==============

  /**
   * GET /api/epics/:slug/stories - Get stories for an epic
   */
  router.get('/api/epics/:slug/stories', async (req, res, { params, root }) => {
    try {
      const stories = await getEpicStories(params.slug, root);
      // Add id and title for UI compatibility
      const storiesWithIds = stories.map(story => ({
        id: story.slug,
        slug: story.slug,
        title: story.name,
        ...story,
      }));
      json(res, storiesWithIds);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/epics/:slug/stories - Create Story in Epic
   * Supports createdFrom field for tracking origin (dev/product)
   */
  router.post('/api/epics/:slug/stories', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();

      // Accept both 'name' and 'title' for compatibility
      const storyName = body.name || body.title;
      if (!storyName || typeof storyName !== 'string') {
        return error(res, 'name or title is required', 400);
      }

      // Verify epic exists
      await loadEpic(params.slug, root);

      // Validate createdFrom if provided
      const validCreatedFrom = ['dev', 'product'];
      const createdFrom = validCreatedFrom.includes(body.createdFrom) ? body.createdFrom : 'product';

      const story = await createStory(storyName, root, {
        epic: params.slug,
        type: body.type || 'feature',
        phase: body.phase || 'discovery',
        apps: body.apps || [],
        description: body.description,
        createdFrom,
      });

      // Return with id and epic info for UI compatibility
      json(res, { ...story, id: story.slug, title: story.name, epicId: story.epic }, 201);
    } catch (err) {
      if (err.message.includes('not found')) {
        error(res, err.message, 404);
      } else if (err.message.includes('already exists')) {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * PATCH /api/stories/:slug/epic - Move story to different epic
   */
  router.patch('/api/stories/:slug/epic', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const targetEpic = body.epic;

      // Verify target epic exists (or is null to unlink)
      if (targetEpic) {
        await loadEpic(targetEpic, root);
      }

      // Update story status.yaml
      const storyDir = await getStoryDirPath(params.slug, root);
      const statusPath = path.join(storyDir, 'status.yaml');
      const raw = await fs.readFile(statusPath, 'utf-8');
      const status = yaml.parse(raw);

      status.epic = targetEpic || null;
      status.updatedAt = new Date().toISOString();

      await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');

      json(res, status);
    } catch (err) {
      if (err.message.includes('not found')) {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  // ============== STORY AI WORKFLOW ENDPOINTS ==============

  /**
   * POST /api/stories/:slug/init/enrich - Enrich story init with AI (SSE streaming)
   * IMPORTANT: This route MUST be defined before /api/stories/:slug/init
   */
  router.post('/api/stories/:slug/init/enrich', async (req, res, { params, root, parseBody }) => {
    const MAX_DESCRIPTION_LENGTH = 50000;

    // SSE helpers
    const sseHeaders = () => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
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
      const description = body.description || body.input || '';

      if (!description.trim()) {
        return error(res, 'description is required', 400);
      }

      if (description.length > MAX_DESCRIPTION_LENGTH) {
        return error(res, `Description too long (${description.length} chars, max ${MAX_DESCRIPTION_LENGTH})`, 400);
      }

      const storyDir = await getStoryDirPath(params.slug, root);
      const initPath = path.join(storyDir, 'init.md');
      const statusPath = path.join(storyDir, 'status.yaml');

      // Read current status
      const rawStatus = await fs.readFile(statusPath, 'utf-8');
      const status = yaml.parse(rawStatus);

      // Start SSE streaming
      sseHeaders();
      sseSend('status', { status: 'enriching', message: 'Structuring your description...' });

      const onData = ({ type, text }) => {
        try { sseSend('log', { type, text }); } catch {}
      };

      // Load config to get user preferences
      const config = await loadConfig(root);

      // Build enrichment prompt
      const enrichPrompt = `You are a product discovery assistant helping to structure a story/feature idea.

USER INPUT:
${description}

TASK:
Transform this input into a well-structured discovery document in Markdown format.

OUTPUT FORMAT:
# ${status.name || params.slug}

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
- Output ONLY the markdown document, no explanations
- Write in ${config.document_output_language || 'English'}`;

      // Call model to enrich
      const model = body.model || config.models?.init?.[0]?.model || 'claude-default';

      sseSend('status', { status: 'generating', message: 'AI is structuring the story...' });

      const callResult = await callModel(model, enrichPrompt, {
        verbose: false,
        apply: false,
        onData
      });
      const enrichedContent = callResult.output;

      // Save enriched content to init.md
      await fs.writeFile(initPath, enrichedContent.trim(), 'utf-8');

      // Mark as enriched in status.yaml and step as done
      status.initEnriched = true;
      status.steps = status.steps || {};
      status.steps.init = 'done';
      status.updatedAt = new Date().toISOString();
      await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');

      // Load full story to return
      const storyData = await loadStatus(params.slug, root);

      sseSend('done', { ok: true, story: { ...storyData, id: params.slug }, content: enrichedContent.trim() });
    } catch (err) {
      try { sseSend('error', { message: err.message }); } catch {}
    }
    res.end();
  });

  /**
   * POST /api/stories/:slug/init - Set and optionally enrich story initial input
   */
  router.post('/api/stories/:slug/init', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();

      if (!body.input && !body.description) {
        return error(res, 'input or description is required', 400);
      }

      const storyDir = await getStoryDirPath(params.slug, root);
      const initPath = path.join(storyDir, 'init.md');
      const statusPath = path.join(storyDir, 'status.yaml');

      // Read current status
      const rawStatus = await fs.readFile(statusPath, 'utf-8');
      const status = yaml.parse(rawStatus);

      const inputText = body.input || body.description;

      // If enrich is requested, use AI
      if (body.enrich) {
        const config = await loadConfig(root);
        const model = body.model || config.models?.init?.[0]?.model || 'claude-default';

        const enrichPrompt = `You are a product discovery assistant helping to structure a story/feature idea.

USER INPUT:
${inputText}

TASK:
Transform this input into a well-structured discovery document in Markdown format.

OUTPUT FORMAT:
# ${status.name || params.slug}

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
- Output ONLY the markdown document, no explanations
- Write in ${config.document_output_language || 'English'}`;

        const callResult = await callModel(model, enrichPrompt, { verbose: false, apply: false });
        const enrichedContent = callResult.output;
        await fs.writeFile(initPath, enrichedContent.trim(), 'utf-8');

        // Mark as enriched in status.yaml and step as done
        status.initEnriched = true;
        status.steps = status.steps || {};
        status.steps.init = 'done';
        status.updatedAt = new Date().toISOString();
        await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');

        json(res, { ok: true, enriched: true, model, content: enrichedContent.trim() });
      } else {
        // Just save the raw input (not enriched)
        const initContent = `# ${status.name || params.slug}

## Description

${inputText}

## Constraints

`;
        await fs.writeFile(initPath, initContent, 'utf-8');

        // Mark step as done even if not enriched (content exists)
        status.initEnriched = false;
        status.steps = status.steps || {};
        status.steps.init = 'done';
        status.updatedAt = new Date().toISOString();
        await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');

        json(res, { ok: true, enriched: false, content: initContent });
      }
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/stories/:slug/init - Get story init.md content
   */
  router.get('/api/stories/:slug/init', async (req, res, { params, root }) => {
    try {
      const storyDir = await getStoryDirPath(params.slug, root);
      const initPath = path.join(storyDir, 'init.md');

      if (!(await fs.pathExists(initPath))) {
        return json(res, { content: '' });
      }

      const content = await fs.readFile(initPath, 'utf-8');
      json(res, { content });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * PUT /api/stories/:slug/init - Update story init.md content
   */
  router.put('/api/stories/:slug/init', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const storyDir = await getStoryDirPath(params.slug, root);
      const initPath = path.join(storyDir, 'init.md');
      const statusPath = path.join(storyDir, 'status.yaml');

      // Save content
      await fs.writeFile(initPath, body.content || '', 'utf-8');

      // Update status.yaml
      const rawStatus = await fs.readFile(statusPath, 'utf-8');
      const status = yaml.parse(rawStatus);
      status.initEnriched = true; // Mark as having content
      status.steps = status.steps || {};
      status.steps.init = 'done';
      status.updatedAt = new Date().toISOString();
      await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');

      json(res, { ok: true, content: body.content });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/stories/:slug/init/translate - Translate init.md to communication language
   */
  router.post('/api/stories/:slug/init/translate', async (req, res, { params, root }) => {
    try {
      const config = await loadConfig(root);
      const docLang = config.document_output_language || 'English';
      const commLang = config.communication_language || 'English';

      // Check if translation is needed
      if (docLang.toLowerCase() === commLang.toLowerCase()) {
        return json(res, {
          needed: false,
          reason: 'Same language',
          docLang,
          commLang
        });
      }

      // Read init.md content
      const storyDir = await getStoryDirPath(params.slug, root);
      const initPath = path.join(storyDir, 'init.md');

      if (!(await fs.pathExists(initPath))) {
        return json(res, { needed: false, reason: 'No content to translate' });
      }

      const content = await fs.readFile(initPath, 'utf-8');
      if (!content.trim()) {
        return json(res, { needed: false, reason: 'Empty content' });
      }

      // Translate using AI
      const translatePrompt = `Translate the following document from ${docLang} to ${commLang}.

IMPORTANT:
- Keep all markdown formatting intact (headers, lists, code blocks, etc.)
- Keep technical terms, code snippets, and proper nouns unchanged
- Provide a natural, fluent translation
- Output ONLY the translated document, no explanations

DOCUMENT TO TRANSLATE:
${content}`;

      const model = config.models?.init?.[0]?.model || 'claude-default';
      const callResult = await callModel(model, translatePrompt, { verbose: false, apply: false });
      const translated = callResult.output;

      json(res, {
        needed: true,
        docLang,
        commLang,
        original: content,
        translated: translated.trim()
      });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/config/languages - Get language settings
   */
  router.get('/api/config/languages', async (req, res, { root }) => {
    try {
      const config = await loadConfig(root);
      json(res, {
        document_output_language: config.document_output_language || 'English',
        communication_language: config.communication_language || 'English',
        needsTranslation: (config.document_output_language || 'English').toLowerCase() !==
                          (config.communication_language || 'English').toLowerCase()
      });
    } catch (err) {
      json(res, {
        document_output_language: 'English',
        communication_language: 'English',
        needsTranslation: false
      });
    }
  });

  /**
   * GET /api/stories/:slug/tokens - Get token usage for a story
   */
  router.get('/api/stories/:slug/tokens', async (req, res, { params, root }) => {
    try {
      const status = await loadStatus(params.slug, root);
      if (!status) {
        return error(res, 'Story not found', 404);
      }

      // Get tokenUsage from status.yaml
      const tokenUsage = status.tokenUsage || {};

      // Calculate totals
      let totalInput = 0;
      let totalOutput = 0;
      let totalTokens = 0;

      for (const stepData of Object.values(tokenUsage)) {
        if (stepData && typeof stepData === 'object') {
          totalInput += stepData.input || 0;
          totalOutput += stepData.output || 0;
          totalTokens += stepData.total || 0;
        }
      }

      json(res, {
        steps: tokenUsage,
        total: {
          input: totalInput,
          output: totalOutput,
          total: totalTokens,
        },
      });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  // ============== STORY STEP ENDPOINTS ==============

  // SSE helpers for step endpoints
  const sseHeaders = (res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
  };

  const sseSend = (res, event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush();
  };

  /**
   * POST /api/stories/:slug/steps/:step/generate - Generate step content with AI (SSE streaming)
   */
  router.post('/api/stories/:slug/steps/:step/generate', async (req, res, { params, root, parseBody }) => {
    const body = await parseBody();
    sseHeaders(res);
    sseSend(res, 'status', { step: params.step, status: 'started' });

    const onData = ({ type, text }) => {
      try { sseSend(res, 'log', { type, text }); } catch {}
    };

    try {
      // Reset step if already done (allows regeneration from UI)
      const storyDir = await getStoryDirPath(params.slug, root);
      const statusPath = path.join(storyDir, 'status.yaml');
      const rawStatus = await fs.readFile(statusPath, 'utf-8');
      const status = yaml.parse(rawStatus);
      if (status.steps?.[params.step] === 'done') {
        status.steps[params.step] = 'pending';
        status.updatedAt = new Date().toISOString();
        await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');
        sseSend(res, 'log', { type: 'info', text: `Reset step ${params.step} for regeneration` });
      }

      const result = await runStep(params.step, params.slug, {
        description: body.instructions || body.description || '',
        model: body.model || undefined,
        verbose: true,
        apply: true,
        root,
        onData,
      });

      // runStep now returns { output, filesUsed, tokenUsage }
      const output = typeof result === 'string' ? result : result?.output;
      const filesUsed = typeof result === 'object' ? result?.filesUsed : null;
      const tokenUsage = typeof result === 'object' ? result?.tokenUsage : null;

      // Save token usage to status.yaml
      if (tokenUsage) {
        try {
          const storyDir = await getStoryDirPath(params.slug, root);
          const statusPath = path.join(storyDir, 'status.yaml');
          const rawStatus = await fs.readFile(statusPath, 'utf-8');
          const status = yaml.parse(rawStatus);
          status.tokenUsage = status.tokenUsage || {};
          status.tokenUsage[params.step] = tokenUsage;
          status.updatedAt = new Date().toISOString();
          await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');
          sseSend(res, 'log', { type: 'info', text: `Tokens: ${tokenUsage.total} (in: ${tokenUsage.input}, out: ${tokenUsage.output})` });
        } catch (tokenErr) {
          console.error(`[Generate] Failed to save token usage: ${tokenErr.message}`);
        }
      }

      // Return with filesUsed for UI transparency
      sseSend(res, 'done', {
        step: params.step,
        output: output?.slice(0, 500),
        filesUsed,
        tokenUsage,
      });
    } catch (err) {
      sseSend(res, 'error', { message: err.message });
    }
    res.end();
  });

  /**
   * POST /api/stories/:slug/steps/:step/iterate - Iterate on step with additional instructions (SSE streaming)
   */
  router.post('/api/stories/:slug/steps/:step/iterate', async (req, res, { params, root, parseBody }) => {
    const body = await parseBody();
    sseHeaders(res);
    sseSend(res, 'status', { step: params.step, status: 'iterating' });

    const onData = ({ type, text }) => {
      try { sseSend(res, 'log', { type, text }); } catch {}
    };

    try {
      // Read current step content
      const storyDir = await getStoryDirPath(params.slug, root);
      const stepPath = path.join(storyDir, `${params.step}.md`);
      let currentContent = '';
      if (await fs.pathExists(stepPath)) {
        currentContent = await fs.readFile(stepPath, 'utf-8');
      }

      // Run step with iteration instructions
      const instructions = body.instructions?.trim() || 'Please review and improve this content. Fix any issues, clarify unclear sections, and enhance overall quality.';
      const result = await runStep(params.step, params.slug, {
        description: instructions,
        iterateOn: currentContent,
        model: body.model || undefined,
        verbose: true,
        apply: true,
        root,
        onData,
      });

      // runStep now returns { output, filesUsed, tokenUsage }
      const output = typeof result === 'string' ? result : result?.output;
      const filesUsed = typeof result === 'object' ? result?.filesUsed : null;
      const tokenUsage = typeof result === 'object' ? result?.tokenUsage : null;

      // Accumulate token usage in status.yaml
      if (tokenUsage) {
        try {
          const statusPath = path.join(storyDir, 'status.yaml');
          const rawStatus = await fs.readFile(statusPath, 'utf-8');
          const status = yaml.parse(rawStatus);
          status.tokenUsage = status.tokenUsage || {};
          const existing = status.tokenUsage[params.step] || { input: 0, output: 0, total: 0 };
          status.tokenUsage[params.step] = {
            input: existing.input + (tokenUsage.input || 0),
            output: existing.output + (tokenUsage.output || 0),
            total: existing.total + (tokenUsage.total || 0),
          };
          status.updatedAt = new Date().toISOString();
          await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');
          sseSend(res, 'log', { type: 'info', text: `Tokens: +${tokenUsage.total} (total: ${status.tokenUsage[params.step].total})` });
        } catch (tokenErr) {
          console.error(`[Iterate] Failed to save token usage: ${tokenErr.message}`);
        }
      }

      // Return with filesUsed for UI transparency
      sseSend(res, 'done', {
        step: params.step,
        output: output?.slice(0, 500),
        filesUsed,
      });
    } catch (err) {
      sseSend(res, 'error', { message: err.message });
    }
    res.end();
  });

  /**
   * PUT /api/stories/:slug/steps/:step - Manually save step content
   */
  router.put('/api/stories/:slug/steps/:step', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const storyDir = await getStoryDirPath(params.slug, root);
      const stepPath = path.join(storyDir, `${params.step}.md`);

      // Save content
      await fs.writeFile(stepPath, body.content || '', 'utf-8');

      // Update step status if completed flag is set
      if (body.completed !== undefined) {
        await updateStepStatus(params.slug, params.step, body.completed ? 'done' : 'pending', root);
      }

      json(res, { ok: true });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/stories/:slug/steps/:step/conversation - Get conversation for a step
   */
  router.get('/api/stories/:slug/steps/:step/conversation', async (req, res, { params, root }) => {
    try {
      const storyDir = await getStoryDirPath(params.slug, root);
      const convPath = path.join(storyDir, `${params.step}-conversation.json`);

      if (!(await fs.pathExists(convPath))) {
        return json(res, { messages: [] });
      }

      const data = await fs.readJson(convPath);
      json(res, { messages: data.messages || [] });
    } catch (err) {
      json(res, { messages: [] });
    }
  });

  /**
   * POST /api/stories/:slug/steps/:step/chat - Send a message in step conversation
   */
  router.post('/api/stories/:slug/steps/:step/chat', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      if (!body.message || typeof body.message !== 'string') {
        return error(res, 'message is required', 400);
      }

      const actualStep = params.step;

      console.log(`[Chat] Step: ${actualStep}`);

      const storyDir = await getStoryDirPath(params.slug, root);
      const convPath = path.join(storyDir, `${actualStep}-conversation.json`);
      const stepPath = path.join(storyDir, `${actualStep}.md`);

      // Load existing conversation
      let conversation = { messages: [] };
      if (await fs.pathExists(convPath)) {
        conversation = await fs.readJson(convPath);
      }

      // Load step content for context
      let stepContent = '';
      if (await fs.pathExists(stepPath)) {
        stepContent = await fs.readFile(stepPath, 'utf-8');
        console.log(`[Chat] ✓ Loaded step content: ${stepPath} (${stepContent.length} chars)`);
      } else {
        console.log(`[Chat] ⚠ Step file not found: ${stepPath}`);
      }

      // Load config for language
      const config = await loadConfig(root);
      const commLang = config.communication_language || 'English';

      // Load additional context for review step (prior steps + git diff)
      let reviewContext = '';
      const isCodeStep = ['implement', 'review'].includes(actualStep);
      if (actualStep === 'review') {
        // Load prior steps for context
        const STEP_ORDER = ['init', 'brainstorming', 'spec-func', 'spec-tech', 'dev-plan', 'implement'];
        const priorSections = [];
        for (const priorStep of STEP_ORDER) {
          const priorFile = path.join(storyDir, `${priorStep}.md`);
          if (await fs.pathExists(priorFile)) {
            const priorContent = await fs.readFile(priorFile, 'utf-8');
            if (priorContent && priorContent.length > 0) {
              const truncated = priorContent.length > 2000
                ? priorContent.slice(0, 2000) + '\n\n[... truncated ...]'
                : priorContent;
              priorSections.push(`### ${priorStep}\n${truncated}`);
            }
          }
        }
        if (priorSections.length > 0) {
          reviewContext += '\nPRIOR STEPS CONTEXT:\n' + priorSections.join('\n\n') + '\n';
        }

        // Load git diff for code review context
        try {
          const { getGitDiff } = await import('../../prompt-builder.js');
          const diff = await getGitDiff(root);
          if (diff) {
            reviewContext += `\nCODE CHANGES (git diff):\n\`\`\`diff\n${diff}\n\`\`\`\n`;
          }
        } catch (err) {
          console.log(`[Chat] Error loading git diff for review: ${err.message}`);
        }
      }

      // Build AI prompt with context about the workflow
      let chatPrompt;

      if (isCodeStep) {
        chatPrompt = `You are a helpful assistant discussing code implementation for the "${actualStep}" phase.

CURRENT STEP DOCUMENT:
${stepContent}
${reviewContext}
CONVERSATION HISTORY:
${conversation.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}

USER MESSAGE:
${body.message}

IMPORTANT CONTEXT:
- You are in a CHAT interface, not an agent. You CANNOT directly edit files or run commands.
- Your role is to DISCUSS and PLAN changes with the user.
- When you agree on changes to make, tell the user: "Click **Apply feedback** to apply these changes to the code."
- The "Apply feedback" button will trigger an AI agent that will actually modify the code based on our discussion.

INSTRUCTIONS:
- Discuss the user's question or request about the code/implementation
- If they report bugs or want changes, acknowledge and discuss the solution
- Be specific about what changes would be needed
- When ready to apply, remind them to click "Apply feedback"
- Respond in ${commLang}
- Keep responses concise and actionable`;
      } else {
        chatPrompt = `You are a helpful assistant discussing the "${actualStep}" document.

CURRENT DOCUMENT CONTENT:
${stepContent}

CONVERSATION HISTORY:
${conversation.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}

USER MESSAGE:
${body.message}

IMPORTANT CONTEXT:
- You are in a CHAT interface. You CANNOT directly edit the document.
- Your role is to DISCUSS and PLAN changes with the user.
- When you agree on changes, tell the user: "Click **Apply feedback** to update the document."
- The "Apply feedback" button will rewrite the document incorporating our discussion.

INSTRUCTIONS:
- Respond helpfully to the user's question or request
- If they ask for changes, explain what could be changed
- When ready to apply, remind them to click "Apply feedback"
- Respond in ${commLang}
- Keep responses concise but helpful`;
      }

      // Use model from request body, or fall back to config
      const model = body.model || config.models?.init?.[0]?.model || 'claude-default';
      const callResult = await callModel(model, chatPrompt, { verbose: false, apply: false });
      const aiResponse = callResult.output;

      // Build filesUsed for transparency
      const filesUsed = {
        promptTemplate: null,
        initFile: null,
        stepContent: stepContent ? `${actualStep}.md` : null,
        contextFiles: [],
      };

      // Save messages with tokenUsage and filesUsed
      const userMsg = { role: 'user', content: body.message, createdAt: new Date().toISOString() };
      const aiMsg = {
        role: 'assistant',
        content: aiResponse.trim(),
        createdAt: new Date().toISOString(),
        tokenUsage: callResult.tokenUsage,
        filesUsed,
      };
      conversation.messages.push(userMsg, aiMsg);
      await fs.writeJson(convPath, conversation, { spaces: 2 });

      json(res, { message: aiMsg });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/stories/:slug/steps/:step/start-chat - AI initiates brainstorming conversation
   */
  router.post('/api/stories/:slug/steps/:step/start-chat', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();

      // Validate: only available for chat-first steps
      const chatFirstSteps = ['brainstorming', 'review'];
      if (!chatFirstSteps.includes(params.step)) {
        return error(res, `start-chat only available for: ${chatFirstSteps.join(', ')}`, 400);
      }

      // Validate model if provided
      if (body.model && typeof body.model !== 'string') {
        return error(res, 'model must be a string', 400);
      }

      let promptTemplate;
      try {
        const result = await loadPromptTemplate(params.step, root);
        promptTemplate = result.content;
      } catch (err) {
        return error(res, `Failed to load ${params.step} prompt: ${err.message}`, 500);
      }

      // Load config for language
      const config = await loadConfig(root);
      const commLang = config.communication_language || 'English';

      let chatPrompt;

      if (params.step === 'brainstorming') {
        // Brainstorming: load init.md and ask questions
        const initContent = await loadInitSpecs(params.slug, root);

        chatPrompt = `${promptTemplate}\n\n`;
        if (initContent) {
          chatPrompt += `INIT DOCUMENT (story context):\n---\n${initContent}\n---\n\n`;
        }
        chatPrompt += `INSTRUCTIONS:
- You are initiating a brainstorming session for this feature
- Analyze the init document and identify key areas that need clarification
- Ask 3-5 focused questions to guide the discussion
- Be specific and actionable
- Respond in ${commLang}`;

      } else if (params.step === 'review') {
        // Review: load implement output + prior steps + git diff for comprehensive analysis
        const storyDir = await getStoryDirPath(params.slug, root);

        // Load implement.md content
        let implementContent = '';
        const implementPath = path.join(storyDir, 'implement.md');
        if (await fs.pathExists(implementPath)) {
          implementContent = await fs.readFile(implementPath, 'utf-8');
        }

        // Load prior steps for context
        const STEP_ORDER = ['init', 'brainstorming', 'spec-func', 'spec-tech', 'dev-plan', 'implement'];
        const priorSections = [];
        for (const priorStep of STEP_ORDER) {
          const priorFile = path.join(storyDir, `${priorStep}.md`);
          if (await fs.pathExists(priorFile)) {
            const priorContent = await fs.readFile(priorFile, 'utf-8');
            if (priorContent && priorContent.length > 0) {
              const truncated = priorContent.length > 2000
                ? priorContent.slice(0, 2000) + '\n\n[... truncated ...]'
                : priorContent;
              priorSections.push(`### ${priorStep}\n${truncated}`);
            }
          }
        }

        // Load git diff
        let gitDiffContext = '';
        try {
          const { getGitDiff } = await import('../../prompt-builder.js');
          const diff = await getGitDiff(root);
          if (diff) {
            gitDiffContext = `\n\nCODE CHANGES (git diff):\n\`\`\`diff\n${diff}\n\`\`\``;
          }
        } catch (err) {
          console.log(`[start-chat review] Error loading git diff: ${err.message}`);
        }

        chatPrompt = `${promptTemplate}\n\n`;

        if (priorSections.length > 0) {
          chatPrompt += `PRIOR STEPS CONTEXT:\n${priorSections.join('\n\n')}\n\n`;
        }

        if (implementContent) {
          chatPrompt += `IMPLEMENTATION DOCUMENT:\n---\n${implementContent}\n---\n\n`;
        }

        chatPrompt += `${gitDiffContext}\n\n`;

        chatPrompt += `INSTRUCTIONS:
- You are initiating a code review session for this feature
- Perform a comprehensive analysis of the implementation
- For each issue found, specify: file/line reference, severity (critical/warning/suggestion), description, and suggested fix
- End with a clear verdict: ship / ship with fixes / needs rework
- Be thorough but fair — acknowledge what's done well too
- Respond in ${commLang}`;
      }

      // Use model from request body, or fall back to config
      const model = body.model || config.models?.init?.[0]?.model || 'claude-default';

      let callResult;
      try {
        callResult = await callModel(model, chatPrompt, { verbose: false, apply: false });
      } catch (err) {
        return error(res, `Model call failed: ${err.message}`, 500);
      }

      const aiResponse = callResult.output;

      // Build filesUsed for transparency
      const filesUsed = {
        promptTemplate: `${params.step}.md`,
        initFile: params.step === 'brainstorming' ? 'init.md' : null,
        stepContent: params.step === 'review' ? 'implement.md' : null,
        contextFiles: [],
      };

      // Create message with tokenUsage and filesUsed
      const aiMsg = {
        role: 'assistant',
        content: aiResponse.trim(),
        createdAt: new Date().toISOString(),
        tokenUsage: callResult.tokenUsage,
        filesUsed,
      };

      // Save conversation
      const storyDir = await getStoryDirPath(params.slug, root);
      const convPath = path.join(storyDir, `${params.step}-conversation.json`);
      const conversation = { messages: [aiMsg] };
      await fs.writeJson(convPath, conversation, { spaces: 2 });

      json(res, { message: aiMsg });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/stories/:slug/steps/:step/translate - Translate step content to communication language
   */
  router.post('/api/stories/:slug/steps/:step/translate', async (req, res, { params, root }) => {
    try {
      const config = await loadConfig(root);
      const docLang = config.document_output_language || 'English';
      const commLang = config.communication_language || 'English';

      // Check if translation is needed
      if (docLang.toLowerCase() === commLang.toLowerCase()) {
        return json(res, {
          needed: false,
          reason: 'Same language',
          docLang,
          commLang
        });
      }

      // Read step content
      const storyDir = await getStoryDirPath(params.slug, root);
      const stepPath = path.join(storyDir, `${params.step}.md`);

      if (!(await fs.pathExists(stepPath))) {
        return json(res, { needed: false, reason: 'No content to translate' });
      }

      const content = await fs.readFile(stepPath, 'utf-8');
      if (!content.trim()) {
        return json(res, { needed: false, reason: 'Empty content' });
      }

      // Translate using AI
      const translatePrompt = `Translate the following document from ${docLang} to ${commLang}.

IMPORTANT:
- Keep all markdown formatting intact (headers, lists, code blocks, etc.)
- Keep technical terms, code snippets, and proper nouns unchanged
- Provide a natural, fluent translation
- Output ONLY the translated document, no explanations

DOCUMENT TO TRANSLATE:
${content}`;

      const model = config.models?.init?.[0]?.model || 'claude-default';
      const callResult = await callModel(model, translatePrompt, { verbose: false, apply: false });
      const translated = callResult.output;

      json(res, {
        needed: true,
        docLang,
        commLang,
        original: content,
        translated: translated.trim()
      });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/stories/:slug/steps/:step/recap - Apply conversation feedback (SSE streaming)
   * For implement/review: applies code changes in agent mode
   * For other steps: updates the .md document
   */
  router.post('/api/stories/:slug/steps/:step/recap', async (req, res, { params, root }) => {
    const actualStep = params.step;
    console.log('[Recap] Starting recap for', params.slug, actualStep);
    sseHeaders(res);
    sseSend(res, 'status', { step: actualStep, status: 'applying_feedback' });

    const onData = ({ type, text }) => {
      try { sseSend(res, 'log', { type, text }); } catch {}
    };

    try {
      const storyDir = await getStoryDirPath(params.slug, root);
      const convPath = path.join(storyDir, `${params.step}-conversation.json`);
      const stepPath = path.join(storyDir, `${actualStep}.md`);
      console.log('[Recap] Conversation path:', convPath);

      // Load conversation
      if (!(await fs.pathExists(convPath))) {
        console.log('[Recap] No conversation file found');
        sseSend(res, 'error', { message: 'No conversation to recap' });
        return res.end();
      }
      const conversation = await fs.readJson(convPath);
      console.log('[Recap] Loaded conversation with', conversation.messages?.length || 0, 'messages');
      if (!conversation.messages || conversation.messages.length === 0) {
        sseSend(res, 'error', { message: 'Conversation is empty' });
        return res.end();
      }

      // Check if this is a code-action step (implement/review)
      const isCodeStep = ['implement', 'review'].includes(actualStep);

      if (isCodeStep) {
        // For implement/review: run in agent mode to apply code changes
        // We call callModel directly instead of runStep to bypass "already done" check
        sseSend(res, 'log', { type: 'info', text: `🚀 Applying code changes based on ${conversation.messages.length} messages...\n` });

        // Load config for model selection
        const config = await loadConfig(root);
        const model = config.models?.implement?.[0]?.model || config.models?.init?.[0]?.model || 'claude-sonnet-4-20250514';

        // Load current step content for context
        let stepContent = '';
        if (await fs.pathExists(stepPath)) {
          stepContent = await fs.readFile(stepPath, 'utf-8');
        }

        // Build instructions from conversation
        const codeInstructions = `You are working on the "${params.slug}" feature/story.

CURRENT IMPLEMENTATION NOTES:
${stepContent || '(No implementation notes yet)'}

CONVERSATION WITH USER:
${conversation.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}

TASK:
Based on the conversation above, apply the requested code changes to the codebase.

INSTRUCTIONS:
1. Read the relevant files to understand the current state
2. Apply all the code changes discussed in the conversation
3. After making changes, provide a summary of:
   - ✅ What was changed (files modified)
   - 🧪 How to test these changes
   - 📋 Any remaining tasks or suggestions
4. Be thorough but focused on what was discussed
5. If a change was requested but you're unsure, explain what you did and why`;

        console.log('[Recap] Calling model in agent mode:', model);

        // Call model directly in agent mode (bypasses runStep's "already done" check)
        const callResult = await callModel(model, codeInstructions, {
          verbose: true,
          apply: true,
          onData,
          cwd: root,
        });
        const output = callResult.output;

        // Add summary message to conversation before clearing
        const summaryMsg = {
          role: 'assistant',
          content: `✅ **Feedback applied!**\n\nI've applied the changes discussed. Here's what was done:\n\n${output?.slice(0, 1500) || 'Changes applied successfully.'}`,
          createdAt: new Date().toISOString(),
          isRecapSummary: true,
        };

        // Keep the summary in conversation for reference, clear the rest
        await fs.writeJson(convPath, { messages: [summaryMsg] }, { spaces: 2 });

        sseSend(res, 'done', { ok: true, summary: summaryMsg });
      } else {
        // For other steps: update the .md document
        sseSend(res, 'log', { type: 'info', text: `📝 Applying ${conversation.messages.length} messages to document...\n` });

        // Load current step content
        let stepContent = '';
        if (await fs.pathExists(stepPath)) {
          stepContent = await fs.readFile(stepPath, 'utf-8');
        }

        // Build recap instructions from conversation
        const recapInstructions = `Apply the following feedback from conversation:\n\n${conversation.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}`;

        // Use runStep with iterateOn to update the document
        const result = await runStep(actualStep, params.slug, {
          description: recapInstructions,
          iterateOn: stepContent,
          verbose: true,
          apply: true,
          root,
          onData,
        });

        // runStep now returns { output, filesUsed }
        const output = typeof result === 'string' ? result : result?.output;
        const filesUsed = typeof result === 'object' ? result?.filesUsed : null;

        // Clear conversation after recap
        await fs.writeJson(convPath, { messages: [] }, { spaces: 2 });

        sseSend(res, 'done', { ok: true, output: output?.slice(0, 500), filesUsed });
      }
    } catch (err) {
      sseSend(res, 'error', { message: err.message });
    }
    res.end();
  });

  // ============== STANDALONE STORY ENDPOINTS ==============

  /**
   * GET /api/stories - List all stories
   */
  router.get('/api/stories', async (req, res, { root, query }) => {
    try {
      const storiesDir = getStoriesDir(root);
      if (!(await fs.pathExists(storiesDir))) {
        return json(res, []);
      }

      const entries = await fs.readdir(storiesDir, { withFileTypes: true });
      const stories = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const status = await loadStatus(entry.name, root);
            if (status.deletedAt && query?.includeDeleted !== 'true') continue;

            // Filter by epic if requested
            if (query?.epicSlug && status.epic !== query.epicSlug) continue;

            stories.push({
              id: entry.name,
              slug: status.slug || entry.name,
              title: status.name || entry.name,
              ...status,
            });
          } catch {
            // Skip invalid stories
          }
        }
      }

      json(res, stories);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/stories/stats - Get Story statistics (MUST be before :slug route)
   */
  router.get('/api/stories/stats', async (req, res, { root, query }) => {
    try {
      const storiesDir = getStoriesDir(root);
      if (!(await fs.pathExists(storiesDir))) {
        return json(res, { total: 0, byType: {}, byPhase: {}, byEpic: {}, byStatus: {} });
      }

      const entries = await fs.readdir(storiesDir, { withFileTypes: true });
      const stats = {
        total: 0,
        byType: {},
        byPhase: {},
        byEpic: {},
        byStatus: {},
      };

      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const status = await loadStatus(entry.name, root);
            if (status.deletedAt) continue;

            if (query?.epicSlug && status.epic !== query.epicSlug) continue;

            stats.total++;
            stats.byType[status.type || 'feature'] = (stats.byType[status.type || 'feature'] || 0) + 1;
            stats.byPhase[status.phase || 'discovery'] = (stats.byPhase[status.phase || 'discovery'] || 0) + 1;
            const epicKey = status.epic || 'unassigned';
            stats.byEpic[epicKey] = (stats.byEpic[epicKey] || 0) + 1;
            stats.byStatus[status.phase || 'discovery'] = (stats.byStatus[status.phase || 'discovery'] || 0) + 1;
          } catch {
            // Skip invalid stories
          }
        }
      }

      json(res, stats);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/stories/:slug - Get single story details
   */
  router.get('/api/stories/:slug', async (req, res, { params, root }) => {
    try {
      const status = await loadStatus(params.slug, root);
      const storyDir = await getStoryDirPath(params.slug, root);

      // Read init.md content
      const initPath = path.join(storyDir, 'init.md');
      let initContent = '';
      if (await fs.pathExists(initPath)) {
        initContent = await fs.readFile(initPath, 'utf-8');
      }

      // Build steps with content
      // V3 workflow steps: init, brainstorming, spec-func, spec-tech, dev-plan, implement, review
      const stepsData = {};
      const stepNames = ['init', 'brainstorming', 'spec-func', 'spec-tech', 'dev-plan', 'implement', 'review'];
      for (const stepName of stepNames) {
        const stepPath = path.join(storyDir, `${stepName}.md`);
        let content = '';
        if (await fs.pathExists(stepPath)) {
          content = await fs.readFile(stepPath, 'utf-8');
        }
        // Convert kebab-case to camelCase for status lookup (spec-func -> specFunc)
        const statusKey = stepName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        stepsData[stepName] = {
          status: status.steps?.[statusKey] || status.steps?.[stepName] || 'pending',
          content,
          completed: (status.steps?.[statusKey] || status.steps?.[stepName]) === 'done',
          skipped: (status.steps?.[statusKey] || status.steps?.[stepName]) === 'skipped',
        };
      }

      // Build init object for compatibility
      // Only mark as enriched if status indicates it was enriched by AI
      const isEnriched = status.initEnriched === true;
      // Check if init.md is just the default template (contains the placeholder comment)
      const isDefaultTemplate = initContent.includes('<!-- Describe your story here') ||
                                initContent.includes('<!-- Add epic description here');
      const init = {
        input: (isEnriched || isDefaultTemplate) ? '' : initContent,
        enriched: isEnriched ? initContent : null,
        attachments: [],
      };

      // Get epic info if story has an epic
      let epicId = null;
      let epicName = null;
      if (status.epic) {
        try {
          const epic = await loadEpic(status.epic, root);
          epicId = epic.slug;
          epicName = epic.name;
        } catch {
          // Epic not found, use slug as fallback
          epicId = status.epic;
          epicName = status.epic;
        }
      }

      json(res, {
        id: params.slug,
        slug: status.slug || params.slug,
        title: status.name || params.slug,
        ...status,
        epicId,
        epicName,
        init,
        steps: stepsData,
        stepsStatus: status.steps,
      });
    } catch (err) {
      if (err.message.includes('not found')) {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * POST /api/stories - Create story (standalone)
   * Unified endpoint for both dev and product views
   * Automatically generates slug and assigns to general epic if not provided
   */
  router.post('/api/stories', async (req, res, { root, parseBody }) => {
    try {
      const body = await parseBody();

      // Accept both 'name' and 'title' for compatibility
      const storyName = body.name || body.title;
      if (!storyName || typeof storyName !== 'string') {
        return error(res, 'name or title is required', 400);
      }

      // Validate createdFrom if provided
      const validCreatedFrom = ['dev', 'product'];
      const createdFrom = validCreatedFrom.includes(body.createdFrom) ? body.createdFrom : 'product';

      const story = await createStory(storyName, root, {
        epic: body.epic || body.epicSlug || null,  // Will default to 'general' in createStory
        type: body.type || 'feature',
        phase: body.phase || 'discovery',
        apps: body.apps || [],
        description: body.description,
        createdFrom,
      });

      // Return with id, title and epic info for UI compatibility
      json(res, { ...story, id: story.slug, title: story.name, epicId: story.epic }, 201);
    } catch (err) {
      if (err.message.includes('already exists')) {
        error(res, err.message, 400);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * PATCH /api/stories/:slug/status - Update story status and/or phase
   */
  router.patch('/api/stories/:slug/status', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const storyDir = await getStoryDirPath(params.slug, root);
      const statusPath = path.join(storyDir, 'status.yaml');

      const raw = await fs.readFile(statusPath, 'utf-8');
      const status = yaml.parse(raw);

      if (body.status) {
        status.status = body.status;
      }

      // Support phase change
      if (body.phase) {
        const validPhases = ['discovery', 'development', 'qa', 'done'];
        if (!validPhases.includes(body.phase)) {
          return error(res, `Invalid phase. Must be one of: ${validPhases.join(', ')}`, 400);
        }
        status.phase = body.phase;
        // Update current_step based on phase
        // V3 workflow: init, brainstorming, spec-func, spec-tech, dev-plan, implement, review
        if (body.phase === 'discovery') {
          status.current_step = 'init';
        } else if (body.phase === 'development') {
          status.current_step = 'spec-tech';
        } else if (body.phase === 'qa') {
          status.current_step = 'review';
        }
      }

      status.updatedAt = new Date().toISOString();
      await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');

      json(res, { id: params.slug, ...status });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * PATCH /api/stories/:slug/apps - Update story apps scope
   */
  router.patch('/api/stories/:slug/apps', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const storyDir = await getStoryDirPath(params.slug, root);
      const statusPath = path.join(storyDir, 'status.yaml');

      const raw = await fs.readFile(statusPath, 'utf-8');
      const status = yaml.parse(raw);

      // Validate apps - must be an array of strings
      if (!Array.isArray(body.apps)) {
        return error(res, 'apps must be an array', 400);
      }

      // F11: Limit array size to prevent abuse
      const MAX_APPS = 50;
      if (body.apps.length > MAX_APPS) {
        return error(res, `apps array exceeds maximum size (${MAX_APPS})`, 400);
      }

      // Filter to valid strings
      const requestedApps = body.apps.filter(a => typeof a === 'string' && a.trim()).map(a => a.trim());

      // F9: Validate that app names exist in config
      const configuredApps = await getApps(root);
      const validAppNames = new Set(configuredApps.map(a => a.name));
      const validatedApps = requestedApps.filter(name => validAppNames.has(name));

      // Warn if some apps were invalid (but still proceed)
      const invalidApps = requestedApps.filter(name => !validAppNames.has(name));
      if (invalidApps.length > 0) {
        console.warn(`[API] Invalid app names ignored: ${invalidApps.join(', ')}`);
      }

      status.apps = validatedApps;
      status.updatedAt = new Date().toISOString();
      await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');

      json(res, { id: params.slug, apps: status.apps });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * DELETE /api/stories/:slug - Delete story (soft delete)
   */
  router.delete('/api/stories/:slug', async (req, res, { params, root }) => {
    try {
      const storyDir = await getStoryDirPath(params.slug, root);
      const statusPath = path.join(storyDir, 'status.yaml');

      const raw = await fs.readFile(statusPath, 'utf-8');
      const status = yaml.parse(raw);

      status.deletedAt = new Date().toISOString();
      await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');

      json(res, { ok: true });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/stories/:slug/move - Move story to another epic
   */
  router.post('/api/stories/:slug/move', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const targetEpic = body.targetEpicId;

      // Verify target epic exists if specified
      if (targetEpic && targetEpic !== 'general') {
        await loadEpic(targetEpic, root);
      }

      const storyDir = await getStoryDirPath(params.slug, root);
      const statusPath = path.join(storyDir, 'status.yaml');

      const raw = await fs.readFile(statusPath, 'utf-8');
      const status = yaml.parse(raw);

      status.epic = targetEpic || null;
      status.updatedAt = new Date().toISOString();

      await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');

      json(res, { id: params.slug, ...status });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/stories/:slug/can-promote - Check if story can be promoted
   */
  router.get('/api/stories/:slug/can-promote', async (req, res, { params, root }) => {
    try {
      const status = await loadStatus(params.slug, root);

      // Check if discovery steps are complete
      const discoverySteps = ['init', 'brainstorming', 'spec-func'];
      const missingSteps = discoverySteps.filter(step =>
        status.steps?.[step] !== 'done' && status.steps?.[step] !== 'skipped'
      );

      json(res, {
        canPromote: missingSteps.length === 0,
        missingSteps,
      });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/stories/:slug/can-send-to-dev - Check if story can be sent to dev
   */
  router.get('/api/stories/:slug/can-send-to-dev', async (req, res, { params, root }) => {
    try {
      const status = await loadStatus(params.slug, root);

      const discoverySteps = ['init', 'brainstorming', 'spec-func'];
      const allComplete = discoverySteps.every(step =>
        status.steps?.[step] === 'done' || status.steps?.[step] === 'skipped'
      );

      json(res, {
        canPromote: allComplete,
        phase: status.phase,
      });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/stories/:slug/promote - Promote story to development
   */
  router.post('/api/stories/:slug/promote', async (req, res, { params, root }) => {
    try {
      const storyDir = await getStoryDirPath(params.slug, root);
      const statusPath = path.join(storyDir, 'status.yaml');

      const raw = await fs.readFile(statusPath, 'utf-8');
      const status = yaml.parse(raw);

      status.phase = 'development';
      status.current_step = 'spec-tech'; // V3 workflow
      status.space = 'development';
      status.updatedAt = new Date().toISOString();

      await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');

      json(res, { id: params.slug, ...status });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/stories/:slug/send-to-dev - Send story to development
   */
  router.post('/api/stories/:slug/send-to-dev', async (req, res, { params, root }) => {
    try {
      const storyDir = await getStoryDirPath(params.slug, root);
      const statusPath = path.join(storyDir, 'status.yaml');

      const raw = await fs.readFile(statusPath, 'utf-8');
      const status = yaml.parse(raw);

      status.phase = 'development';
      status.current_step = 'spec-tech'; // V3 workflow
      status.space = 'development';
      status.updatedAt = new Date().toISOString();

      await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');

      json(res, {
        ok: true,
        featureName: params.slug,
        id: params.slug,
        ...status,
      });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/stories/:slug/resend-to-qa - Resend story to QA after fixes
   */
  router.post('/api/stories/:slug/resend-to-qa', async (req, res, { params, root }) => {
    try {
      const storyDir = await getStoryDirPath(params.slug, root);
      const statusPath = path.join(storyDir, 'status.yaml');

      const raw = await fs.readFile(statusPath, 'utf-8');
      const status = yaml.parse(raw);

      // Move to QA phase and clear rejection status
      status.phase = 'qa';
      status.status = 'testing';
      status.current_step = 'review';
      status.qaStatus = 'pending'; // Clear rejected status
      delete status.qaRejectionReason;
      status.updatedAt = new Date().toISOString();

      // Add history entry
      if (!status.qaHistory) status.qaHistory = [];
      status.qaHistory.push({
        action: 'resubmit',
        performedAt: new Date().toISOString(),
      });

      await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');

      json(res, {
        ok: true,
        id: params.slug,
        ...status,
      });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  // ============== AI & CONFIG ENDPOINTS ==============

  /**
   * GET /api/ai/status - Check AI configuration
   */
  router.get('/api/ai/status', async (req, res, { root }) => {
    try {
      const config = await loadConfig(root);
      const hasModels = config.models && Object.keys(config.models).length > 0;
      json(res, { configured: hasModels });
    } catch {
      json(res, { configured: false });
    }
  });

  /**
   * GET /api/models - Get available models
   */
  router.get('/api/models', async (req, res, { root }) => {
    try {
      const config = await loadConfig(root);
      const models = [];

      if (config.models) {
        for (const [step, stepModels] of Object.entries(config.models)) {
          for (const m of stepModels) {
            if (!models.find(x => x.model === m.model)) {
              models.push({ model: m.model, provider: m.provider || 'unknown' });
            }
          }
        }
      }

      json(res, models);
    } catch {
      json(res, []);
    }
  });

  // ============== QA ENDPOINTS ==============

  /**
   * GET /api/qa/queue - List stories in QA phase ready for testing
   */
  router.get('/api/qa/queue', async (req, res, { root }) => {
    try {
      const storiesDir = getStoriesDir(root);
      if (!(await fs.pathExists(storiesDir))) {
        return json(res, []);
      }

      const entries = await fs.readdir(storiesDir, { withFileTypes: true });
      const queue = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const status = await loadStatus(entry.name, root);
            if (status.deletedAt) continue;

            // Stories in QA phase are in the queue
            if (status.phase === 'qa') {
              // Get epic info
              let epicName = status.epic || 'Unassigned';
              if (status.epic) {
                try {
                  const epic = await loadEpic(status.epic, root);
                  epicName = epic.name;
                } catch {
                  // Use slug as fallback
                }
              }

              queue.push({
                id: entry.name,
                slug: status.slug || entry.name,
                title: status.name || entry.name,
                type: status.type || 'feature',
                status: status.status || 'testing',
                phase: status.phase,
                epicId: status.epic,
                epicName,
                description: status.description,
                qaHistory: status.qaHistory || [],
                updatedAt: status.updatedAt,
              });
            }
          } catch {
            // Skip invalid stories
          }
        }
      }

      json(res, queue);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/qa/stats - Get QA statistics
   */
  router.get('/api/qa/stats', async (req, res, { root }) => {
    try {
      const storiesDir = getStoriesDir(root);
      if (!(await fs.pathExists(storiesDir))) {
        return json(res, {
          inTesting: 0,
          approvedToday: 0,
          rejectedToday: 0,
          totalApprovals: 0,
          totalRejections: 0,
          avgRejectionsPerStory: 0,
        });
      }

      const entries = await fs.readdir(storiesDir, { withFileTypes: true });
      const today = new Date().toISOString().split('T')[0];

      let inTesting = 0;
      let approvedToday = 0;
      let rejectedToday = 0;
      let totalApprovals = 0;
      let totalRejections = 0;
      let storiesWithRejections = 0;

      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const status = await loadStatus(entry.name, root);
            if (status.deletedAt) continue;

            if (status.phase === 'qa') {
              inTesting++;
            }

            const qaHistory = status.qaHistory || [];
            let storyRejections = 0;
            for (const action of qaHistory) {
              const actionDate = action.performedAt?.split('T')[0];
              if (action.action === 'approve') {
                totalApprovals++;
                if (actionDate === today) approvedToday++;
              } else if (action.action === 'reject') {
                totalRejections++;
                storyRejections++;
                if (actionDate === today) rejectedToday++;
              }
            }
            if (storyRejections > 0) storiesWithRejections++;
          } catch {
            // Skip invalid stories
          }
        }
      }

      json(res, {
        inTesting,
        approvedToday,
        rejectedToday,
        totalApprovals,
        totalRejections,
        avgRejectionsPerStory: storiesWithRejections > 0
          ? (totalRejections / storiesWithRejections).toFixed(1)
          : 0,
      });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/qa/:storyId/approve - Approve a story in QA
   */
  router.post('/api/qa/:storyId/approve', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const storyDir = await getStoryDirPath(params.storyId, root);
      const statusPath = path.join(storyDir, 'status.yaml');

      const raw = await fs.readFile(statusPath, 'utf-8');
      const status = yaml.parse(raw);

      // Add QA history entry
      if (!status.qaHistory) status.qaHistory = [];
      status.qaHistory.push({
        action: 'approve',
        performedAt: new Date().toISOString(),
        notes: body.notes || null,
      });

      // Move to done phase and clear QA rejection status
      status.phase = 'done';
      status.status = 'done';
      status.qaStatus = 'approved';
      delete status.qaRejectionReason; // Clear rejection reason
      status.updatedAt = new Date().toISOString();

      await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');

      json(res, { ok: true, id: params.storyId, ...status });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/qa/:storyId/reject - Reject a story in QA
   */
  router.post('/api/qa/:storyId/reject', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      if (!body.reason || body.reason.length < 10) {
        return error(res, 'Rejection reason must be at least 10 characters', 400);
      }

      const storyDir = await getStoryDirPath(params.storyId, root);
      const statusPath = path.join(storyDir, 'status.yaml');

      const raw = await fs.readFile(statusPath, 'utf-8');
      const status = yaml.parse(raw);

      // Add QA history entry
      if (!status.qaHistory) status.qaHistory = [];
      status.qaHistory.push({
        action: 'reject',
        performedAt: new Date().toISOString(),
        reason: body.reason,
      });

      // Move back to development phase with QA rejected status
      status.phase = 'development';
      status.status = 'in_progress';
      status.current_step = 'implement';
      status.qaStatus = 'rejected'; // Mark as QA rejected for badge display
      status.qaRejectionReason = body.reason; // Store the reason
      status.updatedAt = new Date().toISOString();

      await fs.writeFile(statusPath, yaml.stringify(status), 'utf-8');

      json(res, { ok: true, id: params.storyId, ...status });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

// ============== ROADMAP ENDPOINTS ==============

  /**
   * Generate period label based on granularity
   * @private
   */
  function getPeriodLabel(date, granularity) {
    const year = date.getFullYear();

    switch (granularity) {
      case 'weekly': {
        // ISO week number calculation
        const firstDayOfYear = new Date(year, 0, 1);
        const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
        const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
        return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
      }
      case 'monthly': {
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
      }
      case 'quarterly': {
        const quarter = Math.ceil((date.getMonth() + 1) / 3);
        return `${year}-Q${quarter}`;
      }
      default:
        return `${year}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    }
  }

  /**
   * Parses a period string and validates format
   * @private
   */
  function parsePeriod(period) {
    // Quarterly: 2026-Q1
    const quarterMatch = period.match(/^(\d{4})-Q([1-4])$/);
    if (quarterMatch) {
      return { type: 'quarterly', year: parseInt(quarterMatch[1], 10), quarter: parseInt(quarterMatch[2], 10) };
    }

    // Monthly: 2026-03
    const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
    if (monthMatch) {
      return { type: 'monthly', year: parseInt(monthMatch[1], 10), month: parseInt(monthMatch[2], 10) };
    }

    // Weekly: 2026-W12
    const weekMatch = period.match(/^(\d{4})-W(\d{2})$/);
    if (weekMatch) {
      return { type: 'weekly', year: parseInt(weekMatch[1], 10), week: parseInt(weekMatch[2], 10) };
    }

    throw new Error(`Invalid period format: ${period}`);
  }

  /**
   * Generates a range of periods from now until periodsAhead periods in the future
   * @private
   */
  function generatePeriodRange(granularity, periodsAhead) {
    const periods = [];
    const current = new Date();

    for (let i = 0; i < periodsAhead; i++) {
      const label = getPeriodLabel(current, granularity);
      if (!periods.includes(label)) {
        periods.push(label);
      }

      // Advance to next period
      switch (granularity) {
        case 'weekly':
          current.setDate(current.getDate() + 7);
          break;
        case 'monthly':
          current.setMonth(current.getMonth() + 1);
          break;
        case 'quarterly':
          current.setMonth(current.getMonth() + 3);
          break;
      }
    }

    return periods;
  }

  /**
   * GET /api/roadmap - Get roadmap view
   * Query params: ?granularity=quarterly&periodsAhead=4&includeCompleted=false
   */
  router.get('/api/roadmap', async (req, res, { root, query }) => {
    try {
      const granularity = query?.granularity || 'quarterly';
      const periodsAhead = parseInt(query?.periodsAhead || '6', 10);
      const includeCompleted = query?.includeCompleted === 'true';

      // Validate granularity
      const validGranularities = ['weekly', 'monthly', 'quarterly'];
      if (!validGranularities.includes(granularity)) {
        return error(res, `Invalid granularity: ${granularity}. Must be one of: ${validGranularities.join(', ')}`, 400);
      }

      // Get all epics
      const epics = await listEpics(root, { includeArchived: false });

      // Filter completed if needed, and exclude General epic (system epic)
      const filteredEpics = epics.filter((e) => {
        // Exclude General epic from roadmap
        if (e.isGeneral) return false;
        // Exclude completed if option is false
        if (!includeCompleted && e.status === 'done') return false;
        return true;
      });

      // Generate period range
      const periods = generatePeriodRange(granularity, periodsAhead);
      const currentPeriod = getPeriodLabel(new Date(), granularity);

      // Build roadmap data
      const roadmapData = {
        granularity,
        currentPeriod,
        generatedAt: new Date().toISOString(),
        periods: {},
        unplanned: [],
      };

      // Initialize periods
      for (const period of periods) {
        roadmapData.periods[period] = [];
      }

      // Assign epics to periods
      for (const epic of filteredEpics) {
        const progress = await calculateEpicProgress(epic.slug, root);
        const epicData = {
          id: epic.slug,
          name: epic.name,
          status: epic.status,
          progress: progress.percentage || 0,
          storyCount: epic.storyCount || 0,
          isGeneral: epic.isGeneral || false,
          plannedPeriod: epic.plannedPeriod || null,
        };

        if (epic.plannedPeriod && roadmapData.periods[epic.plannedPeriod] !== undefined) {
          // Epic has a period that's in the visible range
          roadmapData.periods[epic.plannedPeriod].push(epicData);
        } else {
          // Epic has no period OR period is outside visible range -> goes to backlog
          roadmapData.unplanned.push(epicData);
        }
      }

      json(res, roadmapData);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/roadmap/stats - Get roadmap statistics
   */
  router.get('/api/roadmap/stats', async (req, res, { root }) => {
    try {
      const epics = await listEpics(root, { includeArchived: false });

      // Exclude General epic from stats
      const filteredEpics = epics.filter((e) => !e.isGeneral);

      const stats = {
        totalEpics: filteredEpics.length,
        planned: 0,
        unplanned: 0,
        byPeriod: {},
        byStatus: {},
      };

      for (const epic of filteredEpics) {
        if (epic.plannedPeriod) {
          stats.planned++;
          stats.byPeriod[epic.plannedPeriod] = (stats.byPeriod[epic.plannedPeriod] || 0) + 1;
        } else {
          stats.unplanned++;
        }

        stats.byStatus[epic.status] = (stats.byStatus[epic.status] || 0) + 1;
      }

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
      const { epicId, period } = body;

      if (!epicId) {
        return error(res, 'epicId is required', 400);
      }
      if (!period) {
        return error(res, 'period is required', 400);
      }

      // Validate period format
      try {
        parsePeriod(period);
      } catch (e) {
        return error(res, `Invalid period format: ${period}. Use format like 2026-Q1, 2026-03, or 2026-W12`, 400);
      }

      const epic = await updateEpic(epicId, { plannedPeriod: period }, root);
      json(res, { ...epic, id: epic.slug });
    } catch (err) {
      if (err.message.includes('not found')) {
        error(res, err.message, 404);
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
      const { epicId } = body;

      if (!epicId) {
        return error(res, 'epicId is required', 400);
      }

      const epic = await updateEpic(epicId, { plannedPeriod: null }, root);
      json(res, { ...epic, id: epic.slug });
    } catch (err) {
      if (err.message.includes('not found')) {
        error(res, err.message, 404);
      } else {
        error(res, err.message, 500);
      }
    }
  });

  /**
   * GET /api/qa/profiles - Get available QA generation profiles
   */
  router.get('/api/qa/profiles', async (req, res) => {
    // Import dynamically to get the profiles
    const { QA_PROFILES, QA_CATEGORIES } = await import('../../epic/services/qa-booster-service.js');
    json(res, { profiles: QA_PROFILES, categories: QA_CATEGORIES });
  });

  /**
   * POST /api/stories/:slug/generate-qa - Generate QA plan for a story
   * Reads spec-func.md and spec-tech.md from the story directory and generates a qa.md file
   * @param {string} [body.profile] - QA profile: 'product', 'api', 'security', 'full'
   * @param {string[]} [body.categories] - Custom categories (overrides profile)
   */
  router.post('/api/stories/:slug/generate-qa', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const storyDir = await getStoryDirPath(params.slug, root);

      // Read spec-func.md (specs) and spec-tech.md (tech) files (V3 workflow)
      const specFuncPath = path.join(storyDir, 'spec-func.md');
      const specTechPath = path.join(storyDir, 'spec-tech.md');

      let specsContent = '';
      let techContent = '';

      if (await fs.pathExists(specFuncPath)) {
        specsContent = await fs.readFile(specFuncPath, 'utf-8');
      }

      if (await fs.pathExists(specTechPath)) {
        techContent = await fs.readFile(specTechPath, 'utf-8');
      }

      // Check if we have at least one source file
      if (!specsContent.trim() && !techContent.trim()) {
        return error(res, 'No source content found. Please generate spec-func.md or spec-tech.md first.', 400);
      }

      // Load story status for feature name
      const status = await loadStatus(params.slug, root);
      const featureName = status.name || params.slug;

      // Create QA Booster service with options from body
      const qaConfig = {
        includeApiTests: body.includeApiTests !== false,
        includeSecurityTests: body.includeSecurityTests !== false,
        includeEdgeCases: body.includeEdgeCases !== false,
        templateStyle: body.templateStyle || 'detailed',
        // Profile and categories support
        profile: body.profile || 'full',
        categories: body.categories || null,
      };

      const qaService = new QABoosterService(qaConfig);
      qaService.setRoot(root);

      // Execute QA generation with model selection and profile
      const result = await qaService.execute({
        featurePath: storyDir,
        featureName,
        specsContent,
        techContent,
        testCycle: body.cycle || 'initial',
        model: body.model || undefined, // Pass selected model
        profile: body.profile || 'full', // Pass profile
        categories: body.categories || null, // Pass custom categories
      });

      if (!result.success) {
        return error(res, result.error?.message || 'QA generation failed', 500);
      }

      // Return success with metadata
      json(res, {
        ok: true,
        outputPath: result.outputPath,
        metadata: result.metadata,
        message: `Generated ${result.metadata.totalTests} test cases (profile: ${result.metadata.profile})`,
      });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/stories/:slug/qa-plan - Get QA plan content for a story
   */
  router.get('/api/stories/:slug/qa-plan', async (req, res, { params, root }) => {
    try {
      const storyDir = await getStoryDirPath(params.slug, root);
      const qaPath = path.join(storyDir, 'qa.md');

      if (!(await fs.pathExists(qaPath))) {
        return json(res, { exists: false, content: null });
      }

      const content = await fs.readFile(qaPath, 'utf-8');
      json(res, { exists: true, content });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * PUT /api/stories/:slug/qa-plan/toggle - Toggle a checkbox in the QA plan
   */
  router.put('/api/stories/:slug/qa-plan/toggle', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const { lineIndex, checked } = body;

      if (typeof lineIndex !== 'number' || typeof checked !== 'boolean') {
        return error(res, 'lineIndex (number) and checked (boolean) are required', 400);
      }

      const storyDir = await getStoryDirPath(params.slug, root);
      const qaPath = path.join(storyDir, 'qa.md');

      if (!(await fs.pathExists(qaPath))) {
        return error(res, 'QA plan not found', 404);
      }

      const content = await fs.readFile(qaPath, 'utf-8');
      const lines = content.split('\n');

      if (lineIndex < 0 || lineIndex >= lines.length) {
        return error(res, 'Invalid line index', 400);
      }

      const line = lines[lineIndex];

      // Check if it's a checkbox line
      const checkboxMatch = line.match(/^(\s*-\s*\[)([ xX])(\]\s*.+)$/);
      if (!checkboxMatch) {
        return error(res, 'Line is not a checkbox item', 400);
      }

      // Toggle the checkbox
      const newCheckState = checked ? 'x' : ' ';
      lines[lineIndex] = `${checkboxMatch[1]}${newCheckState}${checkboxMatch[3]}`;

      // Write back the file
      await fs.writeFile(qaPath, lines.join('\n'), 'utf-8');

      json(res, { ok: true, lineIndex, checked });
    } catch (err) {
      error(res, err.message, 500);
    }
  });

}
