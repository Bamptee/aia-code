import path from 'node:path';
import fs from 'fs-extra';
import { AIA_DIR } from '../../constants.js';
import { loadStatus, updateStepStatus, resetStep, updateFlowType } from '../../services/status.js';
import { createFeature, validateFeatureName } from '../../services/feature.js';
import { runStep } from '../../services/runner.js';
import { runQuick } from '../../services/quick.js';
import { suggestFlowType } from '../../services/flow-analyzer.js';
import { getGuidance } from '../../services/suggestions.js';
import { callModel } from '../../services/model-call.js';
import { loadConfig } from '../../models.js';
import { json, error } from '../router.js';

const MAX_DESCRIPTION_LENGTH = 50000; // 50KB

function sseHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
}

function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function registerFeatureRoutes(router) {
  // List all features
  router.get('/api/features', async (req, res, { root }) => {
    const featuresDir = path.join(root, AIA_DIR, 'features');
    if (!(await fs.pathExists(featuresDir))) {
      return json(res, []);
    }
    const entries = await fs.readdir(featuresDir, { withFileTypes: true });
    const features = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const status = await loadStatus(entry.name, root);
          features.push({ name: entry.name, ...status });
        } catch {
          features.push({ name: entry.name, error: true });
        }
      }
    }
    json(res, features);
  });

  // Get a single feature
  router.get('/api/features/:name', async (req, res, { params, root }) => {
    try {
      const status = await loadStatus(params.name, root);
      const featureDir = path.join(root, AIA_DIR, 'features', params.name);
      const files = await fs.readdir(featureDir);
      json(res, { name: params.name, ...status, files });
    } catch (err) {
      error(res, err.message, 404);
    }
  });

  // Read a feature file
  router.get('/api/features/:name/files/:filename', async (req, res, { params, root }) => {
    const filePath = path.join(root, AIA_DIR, 'features', params.name, params.filename);
    if (!(await fs.pathExists(filePath))) {
      return error(res, 'File not found', 404);
    }
    const content = await fs.readFile(filePath, 'utf-8');
    json(res, { filename: params.filename, content });
  });

  // Save a feature file
  router.put('/api/features/:name/files/:filename', async (req, res, { params, root, parseBody }) => {
    const body = await parseBody();
    const filePath = path.join(root, AIA_DIR, 'features', params.name, params.filename);
    await fs.writeFile(filePath, body.content, 'utf-8');
    json(res, { ok: true });
  });

  // Create a new feature
  router.post('/api/features', async (req, res, { root, parseBody }) => {
    const body = await parseBody();
    try {
      validateFeatureName(body.name);
      await createFeature(body.name, root);
      json(res, { ok: true, name: body.name }, 201);
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
      const output = await runStep(params.step, params.name, {
        description: body.description,
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

  // Quick ticket with SSE streaming (create + run)
  router.post('/api/quick', async (req, res, { root, parseBody }) => {
    const body = await parseBody();
    sseHeaders(res);
    sseSend(res, 'status', { status: 'started', mode: 'quick', name: body.name });

    const onData = ({ type, text }) => {
      try { sseSend(res, 'log', { type, text }); } catch {}
    };

    try {
      await runQuick(body.name, {
        description: body.description,
        apply: body.apply || false,
        root,
        onData,
      });
      sseSend(res, 'done', { status: 'completed', name: body.name });
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

      const output = await runStep(params.step, params.name, {
        instructions: body.instructions,
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

      // Call model to enrich (use brief model config or default)
      const model = config.models?.brief?.[0]?.model || 'claude-default';

      sseSend(res, 'status', { status: 'generating', message: 'AI is structuring the feature...' });

      const enrichedContent = await callModel(model, enrichPrompt, {
        verbose: false,
        apply: false,
        onData
      });

      // Save enriched content to init.md
      const initPath = path.join(root, AIA_DIR, 'features', params.name, 'init.md');
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
}
