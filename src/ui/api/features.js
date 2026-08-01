import path from 'node:path';
import fs from 'fs-extra';
import Busboy from 'busboy';
import { AIA_DIR, DELETION_FILTER, QUICK_STEPS, LEGACY_FEATURES_DIR } from '../../constants.js';
import { loadStatus, updateStepStatus, resetStep, updateFlowType, updateType, updateApps, softDeleteFeature, restoreFeature, isFeatureDeleted, updateEpicId, getFeatureEpicId, getStoryDirPath } from '../../services/status.js';
import { FEATURE_TYPES } from '../../constants.js';

/**
 * Get stories directory (with legacy fallback check)
 */
function getStoriesDir(root) {
  return path.join(root, AIA_DIR, 'stories');
}

function getLegacyFeaturesDir(root) {
  return path.join(root, AIA_DIR, LEGACY_FEATURES_DIR);
}

/**
 * List all stories from both stories/ and legacy features/ directories
 */
async function listAllStories(root) {
  const stories = [];

  // Check stories directory
  const storiesDir = getStoriesDir(root);
  if (await fs.pathExists(storiesDir)) {
    const entries = await fs.readdir(storiesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        stories.push({ name: entry.name, source: 'stories' });
      }
    }
  }

  // Check legacy features directory
  const legacyDir = getLegacyFeaturesDir(root);
  if (await fs.pathExists(legacyDir)) {
    const entries = await fs.readdir(legacyDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Only add if not already in stories
        if (!stories.some(s => s.name === entry.name)) {
          stories.push({ name: entry.name, source: 'features' });
        }
      }
    }
  }

  return stories;
}

/**
 * Check if a feature is completed (all relevant steps are done or skipped)
 * @param {Object} status - Feature status object with steps, skippedSteps
 * @returns {boolean}
 */
function isFeatureCompleted(status) {
  const steps = status.steps || {};
  const skippedSteps = status.skippedSteps || [];

  // Relevant steps depend on phase:
  // - discovery phase: DISCOVERY_STEPS (init, brainstorming, spec-func)
  // - development phase: DEVELOPMENT_STEPS (spec-tech, dev-plan, implement, review)
  const phase = status.phase || 'discovery';
  const relevantStepKeys = phase === 'discovery'
    ? ['init', 'brainstorming', 'spec-func']
    : ['spec-tech', 'dev-plan', 'implement', 'review'];

  // Filter to only the relevant steps
  const relevantSteps = relevantStepKeys.map(k => [k, steps[k] || 'pending']);

  if (relevantSteps.length === 0) return false;

  // A step is "complete" if it's done OR skipped
  return relevantSteps.every(([stepKey, stepStatus]) => {
    return stepStatus === 'done' || skippedSteps.includes(stepKey);
  });
}
import { createStory, skipStep, unskipStep } from '../../services/feature.js';
import { STORY_PHASES } from '../../constants.js';
import { runStep } from '../../services/runner.js';
import { runQuick } from '../../services/quick.js';
import { runSquad } from '../../services/squad.js';
import { DEFAULT_MAX_PARALLEL } from '../../constants.js';
import { suggestFlowType } from '../../services/flow-analyzer.js';
import { getGuidance } from '../../services/suggestions.js';
import { callModel } from '../../services/model-call.js';
import { loadConfig } from '../../models.js';
import { json, error } from '../router.js';
import { isWtInstalled, hasWorktree, getFeatureBranch } from '../../services/worktrunk.js';
import { getSession, isRunning, addSseClient, removeSseClient, getRetryInfo, isClaimed } from '../../services/agent-sessions.js';

const MAX_DESCRIPTION_LENGTH = 50000; // 50KB

function sseHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no', // Disable nginx buffering if behind proxy
  });
  res.flushHeaders(); // Force headers to be sent immediately
}

function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  // Force flush for SSE streaming
  if (res.flush) res.flush();
}

function validateAttachments(rawAttachments) {
  return Array.isArray(rawAttachments)
    ? rawAttachments
        .filter(a => a && typeof a === 'object' && typeof a.path === 'string')
        .map(a => ({ filename: a.filename || 'unknown', path: a.path }))
    : [];
}

export function registerFeatureRoutes(router) {
  // List all stories (from both stories/ and legacy features/)
  // Query params:
  //   ?filter=active|deleted|all (default: active)
  //   ?minimal=true - Return minimal data for faster initial load (name, type, flow, createdAt, deletedAt only)
  router.get('/api/features', async (req, res, { root, query }) => {
    const entries = await listAllStories(root);
    if (entries.length === 0) {
      return json(res, []);
    }
    const features = [];
    const wtInstalled = isWtInstalled();

    // Parse filter from query params (default: active, with validation)
    const validFilters = [DELETION_FILTER.ACTIVE, DELETION_FILTER.DELETED, DELETION_FILTER.ALL];
    const filter = validFilters.includes(query?.filter) ? query.filter : DELETION_FILTER.ACTIVE;

    // Parse minimal flag for lazy loading support
    const minimal = query?.minimal === 'true';

    for (const entry of entries) {
      try {
        const status = await loadStatus(entry.name, root);
        const deleted = isFeatureDeleted(status);

        // Apply deletion filter
        if (filter === DELETION_FILTER.ACTIVE && deleted) continue;
        if (filter === DELETION_FILTER.DELETED && !deleted) continue;
        // DELETION_FILTER.ALL shows everything

        if (minimal) {
          // Minimal mode: return basic info + essential computed fields for fast initial render
          // Include hasWorktree and isCompleted since they're needed for filtering
          const hasWt = wtInstalled && hasWorktree(getFeatureBranch(entry.name), root);
          const completed = isFeatureCompleted(status);
          features.push({
            name: entry.name,
            slug: status.slug || entry.name,
            displayName: status.name || entry.name,
            type: status.type,
            flow: status.flow,
            phase: status.phase || 'development',
            createdAt: status.createdAt,
            deletedAt: status.deletedAt,
            isDeleted: deleted,
            hasWorktree: hasWt,
            isCompleted: completed,
            epicId: getFeatureEpicId(status),
          });
        } else {
          // Full mode: return all data including computed states
          const hasWt = wtInstalled && hasWorktree(getFeatureBranch(entry.name), root);
          const running = isRunning(entry.name);
          const completed = isFeatureCompleted(status);
          features.push({
            name: entry.name,
            slug: status.slug || entry.name,
            displayName: status.name || entry.name,
            ...status,
            hasWorktree: hasWt,
            isDeleted: deleted,
            agentRunning: running,
            isCompleted: completed,
            epicId: getFeatureEpicId(status),
          });
        }
      } catch {
        features.push({ name: entry.name, error: true, hasWorktree: false, isDeleted: false, agentRunning: false });
      }
    }
    json(res, features);
  });

  // Get a single story
  router.get('/api/features/:name', async (req, res, { params, root }) => {
    try {
      const status = await loadStatus(params.name, root);
      const storyDir = await getStoryDirPath(params.name, root);
      const files = await fs.readdir(storyDir);
      json(res, {
        name: params.name,
        slug: status.slug || params.name,
        displayName: status.name || params.name,
        ...status,
        files,
      });
    } catch (err) {
      error(res, err.message, 404);
    }
  });

  // Get agent running status for a feature (Symphony SPEC compliant)
  router.get('/api/features/:name/agent-status', (req, res, { params }) => {
    const session = getSession(params.name);
    const retryInfo = getRetryInfo(params.name);
    const claimed = isClaimed(params.name);

    // Determine overall status
    let status = 'idle';
    if (session) {
      status = session.status; // 'running' | 'stalled' | 'completing'
    } else if (retryInfo) {
      status = 'retrying';
    }

    if (!session && !retryInfo) {
      return json(res, {
        status: 'idle',
        running: false,
        claimed,
      });
    }

    json(res, {
      status,
      running: !!session,
      claimed,
      step: session?.step || retryInfo?.step,
      startedAt: session?.startedAt,
      lastEventAt: session?.lastEventAt,
      tokens: session?.tokens || { input: 0, output: 0, total: 0 },
      attempt: session?.attempt || retryInfo?.attempt || 1,
      logs: session?.logs || [],
      retry: retryInfo ? {
        attempt: retryInfo.attempt,
        dueAt: retryInfo.dueAt,
        error: retryInfo.error,
        countdown: Math.max(0, Math.round((retryInfo.dueAt - Date.now()) / 1000)),
      } : null,
    });
  });

  // SSE stream for agent logs (reconnection endpoint)
  router.get('/api/features/:name/agent-stream', (req, res, { params }) => {
    const session = getSession(params.name);
    if (!session) {
      return error(res, 'No active session', 404);
    }
    sseHeaders(res);
    // Replay buffered logs
    for (const log of session.logs) {
      sseSend(res, 'log', { text: log.text, type: log.type });
    }
    // Register for live updates
    addSseClient(params.name, res);
    req.on('close', () => removeSseClient(params.name, res));
  });

  // Read a story file
  router.get('/api/features/:name/files/:filename', async (req, res, { params, root }) => {
    const storyDir = await getStoryDirPath(params.name, root);
    const filePath = path.join(storyDir, params.filename);
    if (!(await fs.pathExists(filePath))) {
      return error(res, 'File not found', 404);
    }
    const content = await fs.readFile(filePath, 'utf-8');
    json(res, { filename: params.filename, content });
  });

  // Save a story file
  router.put('/api/features/:name/files/:filename', async (req, res, { params, root, parseBody }) => {
    const body = await parseBody();
    const storyDir = await getStoryDirPath(params.name, root);
    const filePath = path.join(storyDir, params.filename);
    await fs.writeFile(filePath, body.content, 'utf-8');
    json(res, { ok: true });
  });

  // Create a new feature
  // Uses createStory with auto-generated slug from name (same as product flow)
  router.post('/api/features', async (req, res, { root, parseBody }) => {
    const body = await parseBody();
    try {
      const { name, type = 'feature', apps = [] } = body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return error(res, 'name is required', 400);
      }

      // Use createStory which generates a unique slug from the name
      // This ensures consistency with product flow (/api/stories endpoint)
      const story = await createStory(name.trim(), root, {
        type,
        apps,
        phase: STORY_PHASES.DEVELOPMENT,  // Dev-created stories start in development
        createdFrom: 'dev',
      });

      // Return with name = slug for backwards compatibility with existing frontend
      json(res, { ok: true, name: story.slug, type, apps, slug: story.slug }, 201);
    } catch (err) {
      error(res, err.message, 400);
    }
  });

  // Run a step with SSE streaming
  router.post('/api/features/:name/run/:step', async (req, res, { params, root, parseBody }) => {
    const body = await parseBody();
    sseHeaders(res);
    sseSend(res, 'status', { step: params.step, status: 'started' });

    const onData = ({ type, text }) => {
      try { sseSend(res, 'log', { type, text }); } catch {}
    };

    try {
      const validatedAttachments = validateAttachments(body.attachments || []);

      const output = await runStep(params.step, params.name, {
        description: body.description,
        attachments: validatedAttachments,
        model: body.model || undefined,
        verbose: body.verbose !== undefined ? body.verbose : true,
        apply: body.apply || false,
        root,
        onData,
      });
      sseSend(res, 'done', { step: params.step, output: output.slice(0, 500) });
    } catch (err) {
      sseSend(res, 'error', { message: err.message });
    }
    res.end();
  });

  // Quick ticket with SSE streaming (dev-plan -> implement -> review)
  router.post('/api/features/:name/quick', async (req, res, { params, root, parseBody }) => {
    const body = await parseBody();
    sseHeaders(res);
    sseSend(res, 'status', { status: 'started', mode: 'quick' });

    const onData = ({ type, text }) => {
      try { sseSend(res, 'log', { type, text }); } catch {}
    };

    try {
      await runQuick(params.name, {
        description: body.description,
        apply: body.apply || false,
        root,
        onData,
      });
      sseSend(res, 'done', { status: 'completed' });
    } catch (err) {
      sseSend(res, 'error', { message: err.message });
    }
    res.end();
  });

  // Squad multi-agent build with SSE streaming
  // spec-tech -> dev-plan -> build (parallel sub-agents) -> review
  router.post('/api/features/:name/squad', async (req, res, { params, root, parseBody }) => {
    const body = await parseBody();
    sseHeaders(res);
    sseSend(res, 'status', { kind: 'started', mode: 'squad' });

    const onData = ({ type, text, taskId }) => {
      try { sseSend(res, 'log', { type, text, taskId }); } catch {}
    };
    const onEvent = (ev) => {
      try { sseSend(res, 'status', ev); } catch {}
    };

    try {
      const maxParallel = Math.max(1, parseInt(body.parallel, 10) || DEFAULT_MAX_PARALLEL);
      const { report } = await runSquad(params.name, {
        description: body.description,
        maxParallel,
        review: body.review !== false,
        root,
        onData,
        onEvent,
      });
      sseSend(res, 'done', {
        verdict: report.verdict,
        ok: report.ok,
        failed: report.failed,
        tasks: report.tasks,
      });
    } catch (err) {
      sseSend(res, 'error', { message: err.message });
    }
    res.end();
  });

  // Iterate a step with SSE streaming (reset + re-run with instructions)
  router.post('/api/features/:name/iterate/:step', async (req, res, { params, root, parseBody }) => {
    const body = await parseBody();
    sseHeaders(res);
    sseSend(res, 'status', { step: params.step, status: 'iterating' });

    try {
      await resetStep(params.name, params.step, root);

      const onData = ({ type, text }) => {
        try { sseSend(res, 'log', { type, text }); } catch {}
      };

      const validatedAttachments = validateAttachments(body.attachments || []);

      await runStep(params.step, params.name, {
        instructions: body.instructions,
        attachments: validatedAttachments,
        model: body.model || undefined,
        verbose: body.verbose !== undefined ? body.verbose : true,
        apply: body.apply || false,
        root,
        onData,
      });
      sseSend(res, 'done', { step: params.step });
    } catch (err) {
      sseSend(res, 'error', { message: err.message });
    }
    res.end();
  });

  // Reset a step
  router.post('/api/features/:name/reset/:step', async (req, res, { params, root }) => {
    try {
      await resetStep(params.name, params.step, root);
      json(res, { ok: true });
    } catch (err) {
      error(res, err.message, 400);
    }
  });

  // Initialize feature with description, enrich with agent, and get flow suggestion
  router.post('/api/features/:name/init', async (req, res, { params, root, parseBody }) => {
    const body = await parseBody();
    const { description } = body;

    if (!description) {
      return error(res, 'Description is required', 400);
    }

    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return error(res, `Description too long (${description.length} chars, max ${MAX_DESCRIPTION_LENGTH})`, 400);
    }

    sseHeaders(res);
    sseSend(res, 'status', { status: 'enriching', message: 'Structuring your description...' });

    const onData = ({ type, text }) => {
      try { sseSend(res, 'log', { type, text }); } catch {}
    };

    try {
      // Load config to get user preferences
      const config = await loadConfig(root);

      // Build enrichment prompt
      const enrichPrompt = `You are helping structure a feature description for a development project.

USER INPUT:
${description}

TASK:
Transform this input into a well-structured feature specification document in Markdown format.

OUTPUT FORMAT:
# ${params.name}

## Summary
(1-2 sentence summary of what this feature does)

## Problem Statement
(What problem does this solve? Why is it needed?)

## Requirements
(List the key functional requirements as bullet points)

## Constraints
(Any technical constraints, limitations, or considerations)

## Success Criteria
(How do we know this feature is complete and working?)

IMPORTANT:
- Keep it concise but complete
- Don't add requirements that weren't mentioned or implied
- If the input is vague, make reasonable assumptions and note them
- Output ONLY the markdown document, no explanations
- Write the ENTIRE document in ${config.document_output_language || 'English'} regardless of the input language`;

      // Call model to enrich (use init model config or default)
      const model = config.models?.init?.[0]?.model || 'claude-default';

      sseSend(res, 'status', { status: 'generating', message: 'AI is structuring the feature...' });

      const callResult = await callModel(model, enrichPrompt, {
        verbose: false,
        apply: false,
        onData
      });
      const enrichedContent = callResult.output;

      // Save enriched content to init.md
      const storyDir = await getStoryDirPath(params.name, root);
      const initPath = path.join(storyDir, 'init.md');
      await fs.writeFile(initPath, enrichedContent.trim(), 'utf-8');

      // Analyze and suggest flow type based on enriched content
      const suggestion = suggestFlowType(enrichedContent);

      sseSend(res, 'done', { ok: true, suggestion, content: enrichedContent.trim() });
    } catch (err) {
      sseSend(res, 'error', { message: err.message });
    }
    res.end();
  });

  // Get guidance for a step
  router.get('/api/features/:name/guidance/:step', async (req, res, { params, root }) => {
    const config = await loadConfig(root);
    const language = config.communication_language || 'English';
    const guidance = getGuidance(params.step, language);
    if (!guidance) {
      return error(res, `No guidance for step "${params.step}"`, 404);
    }
    json(res, guidance);
  });

  // Upload attachments (multipart/form-data)
  router.post('/api/features/:name/attachments', async (req, res, { params, root }) => {
    const storyDir = await getStoryDirPath(params.name, root);
    const attachDir = path.join(storyDir, 'attachments');
    await fs.ensureDir(attachDir);

    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
    });

    const files = [];
    const writtenFiles = []; // F12: Track all written files for cleanup
    let totalSize = 0;
    const maxTotalSize = 50 * 1024 * 1024; // 50MB total
    let hasError = false;

    // F12: Cleanup function to remove all written files on error
    const cleanupFiles = async () => {
      for (const filepath of writtenFiles) {
        await fs.unlink(filepath).catch(() => {});
      }
    };

    busboy.on('file', (fieldname, file, info) => {
      const { filename, mimeType } = info;

      // Validate mime type
      const allowedTypes = ['image/', 'application/pdf', 'text/'];
      const isAllowed = allowedTypes.some(t => mimeType.startsWith(t));
      if (!isAllowed) {
        file.resume(); // Drain the stream
        return;
      }

      const safeFilename = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const filepath = path.join(attachDir, safeFilename);
      const writeStream = fs.createWriteStream(filepath);
      writtenFiles.push(filepath); // F12: Track for cleanup

      // F7: Handle writeStream errors
      writeStream.on('error', async (err) => {
        hasError = true;
        file.resume(); // Stop reading
        await cleanupFiles();
        if (!res.headersSent) {
          error(res, `Write error: ${err.message}`, 500);
        }
      });

      let fileSize = 0;
      file.on('data', (data) => {
        fileSize += data.length;
        totalSize += data.length;

        // F3: Check total size during upload, not after
        if (totalSize > maxTotalSize) {
          hasError = true;
          file.resume(); // Stop reading this file
        }
      });

      file.pipe(writeStream);

      file.on('end', () => {
        if (!hasError && fileSize > 0) {
          files.push({
            filename: safeFilename,
            originalName: filename,
            path: filepath,
            mimeType,
            size: fileSize,
          });
        }
      });

      file.on('limit', () => {
        fs.unlink(filepath).catch(() => {});
        // Remove from writtenFiles since we're handling it here
        const idx = writtenFiles.indexOf(filepath);
        if (idx > -1) writtenFiles.splice(idx, 1);
      });
    });

    busboy.on('finish', async () => {
      if (hasError) {
        // F12: Clean up all files if we hit an error
        await cleanupFiles();
        if (!res.headersSent) {
          error(res, `Total size exceeds ${maxTotalSize / 1024 / 1024}MB limit`, 413);
        }
        return;
      }
      json(res, { ok: true, files });
    });

    busboy.on('error', async (err) => {
      await cleanupFiles();
      if (!res.headersSent) {
        error(res, err.message, 500);
      }
    });

    req.pipe(busboy);
  });

  // List attachments
  router.get('/api/features/:name/attachments', async (req, res, { params, root }) => {
    const storyDir = await getStoryDirPath(params.name, root);
    const attachDir = path.join(storyDir, 'attachments');
    if (!(await fs.pathExists(attachDir))) {
      return json(res, []);
    }

    const entries = await fs.readdir(attachDir);
    const files = await Promise.all(
      entries.map(async (filename) => {
        const filepath = path.join(attachDir, filename);
        const stat = await fs.stat(filepath);
        return {
          filename,
          path: filepath,
          size: stat.size,
        };
      })
    );
    json(res, files);
  });

  // Delete an attachment
  router.delete('/api/features/:name/attachments/:filename', async (req, res, { params, root }) => {
    // F1: Prevent path traversal attacks
    const filename = path.basename(params.filename);
    if (filename !== params.filename || filename.includes('..')) {
      return error(res, 'Invalid filename', 400);
    }

    const storyDir = await getStoryDirPath(params.name, root);
    const filepath = path.join(storyDir, 'attachments', filename);
    if (!(await fs.pathExists(filepath))) {
      return error(res, 'Attachment not found', 404);
    }
    await fs.remove(filepath);
    json(res, { ok: true });
  });

  // Update flow type (quick/full)
  router.patch('/api/features/:name/flow', async (req, res, { params, root, parseBody }) => {
    const body = await parseBody();
    const { flow } = body;

    if (!flow || !['quick', 'full'].includes(flow)) {
      return error(res, 'Invalid flow type. Must be "quick" or "full"', 400);
    }

    try {
      await updateFlowType(params.name, flow, root);
      json(res, { ok: true, flow });
    } catch (err) {
      error(res, err.message, 400);
    }
  });

  // Update feature type (feature/bug)
  router.patch('/api/features/:name/type', async (req, res, { params, root, parseBody }) => {
    const body = await parseBody();
    const { type } = body;

    if (!type || !FEATURE_TYPES.includes(type)) {
      return error(res, `Invalid type. Must be one of: ${FEATURE_TYPES.join(', ')}`, 400);
    }

    try {
      await updateType(params.name, type, root);
      json(res, { ok: true, type });
    } catch (err) {
      error(res, err.message, 400);
    }
  });

  // Update feature apps/scope
  router.patch('/api/features/:name/apps', async (req, res, { params, root, parseBody }) => {
    const body = await parseBody();
    const { apps } = body;

    if (!Array.isArray(apps)) {
      return error(res, 'apps must be an array', 400);
    }

    // Validate all elements are non-empty strings
    const invalidApps = apps.filter(a => typeof a !== 'string' || !a.trim());
    if (invalidApps.length > 0) {
      return error(res, 'apps must contain only non-empty strings', 400);
    }

    try {
      await updateApps(params.name, apps, root);
      json(res, { ok: true, apps });
    } catch (err) {
      error(res, err.message, 400);
    }
  });

  // Soft delete a feature
  router.delete('/api/features/:name', async (req, res, { params, root }) => {
    try {
      await softDeleteFeature(params.name, root);
      json(res, { ok: true, deletedAt: new Date().toISOString() });
    } catch (err) {
      error(res, err.message, 400);
    }
  });

  // Restore a deleted feature
  router.post('/api/features/:name/restore', async (req, res, { params, root }) => {
    try {
      await restoreFeature(params.name, root);
      json(res, { ok: true });
    } catch (err) {
      error(res, err.message, 400);
    }
  });

  // Update feature epic assignment
  router.patch('/api/features/:name/epic', async (req, res, { params, root, parseBody }) => {
    const body = await parseBody();
    const { epicId } = body;

    // epicId can be null to unlink from epic, or a string to link
    if (epicId !== null && typeof epicId !== 'string') {
      return error(res, 'epicId must be a string or null', 400);
    }

    try {
      await updateEpicId(params.name, epicId, root);
      json(res, { ok: true, epicId });
    } catch (err) {
      error(res, err.message, 400);
    }
  });

  // Link all unlinked stories to General Epic
  router.post('/api/features/link-to-general', async (req, res, { root }) => {
    const entries = await listAllStories(root);
    if (entries.length === 0) {
      return json(res, { ok: true, linked: 0 });
    }

    const GENERAL_EPIC_ID = '00000000-0000-0000-0000-000000000000';
    let linked = 0;

    for (const entry of entries) {
      try {
        const status = await loadStatus(entry.name, root);
        const epicId = getFeatureEpicId(status);
        const deleted = isFeatureDeleted(status);

        // Only link active (non-deleted) stories that have no epicId
        if (!deleted && !epicId) {
          await updateEpicId(entry.name, GENERAL_EPIC_ID, root);
          linked++;
        }
      } catch {
        // Skip stories with errors
      }
    }

    json(res, { ok: true, linked });
  });

  // Skip a step
  router.post('/api/features/:name/skip/:step', async (req, res, { params, root }) => {
    try {
      const updated = await skipStep(params.name, params.step, root);
      json(res, { ok: true, story: updated });
    } catch (err) {
      error(res, err.message, 400);
    }
  });

  // Unskip (restore) a step
  router.delete('/api/features/:name/skip/:step', async (req, res, { params, root }) => {
    try {
      const updated = await unskipStep(params.name, params.step, root);
      json(res, { ok: true, story: updated });
    } catch (err) {
      error(res, err.message, 400);
    }
  });
}
