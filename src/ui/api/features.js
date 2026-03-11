import path from 'node:path';
import fs from 'fs-extra';
import Busboy from 'busboy';
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

// F6: Extracted validation helpers to avoid code duplication
function validateHistory(rawHistory) {
  return Array.isArray(rawHistory)
    ? rawHistory
        .filter(msg => msg && typeof msg === 'object' && typeof msg.content === 'string')
        .map(msg => ({
          role: msg.role === 'agent' ? 'agent' : 'user',
          content: String(msg.content).slice(0, 50000),
        }))
        .slice(-20)
    : [];
}

function validateAttachments(rawAttachments) {
  return Array.isArray(rawAttachments)
    ? rawAttachments
        .filter(a => a && typeof a === 'object' && typeof a.path === 'string')
        .map(a => ({ filename: a.filename || 'unknown', path: a.path }))
    : [];
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
      const validatedHistory = validateHistory(body.history || []);
      const validatedAttachments = validateAttachments(body.attachments || []);

      const output = await runStep(params.step, params.name, {
        description: body.description,
        history: validatedHistory,
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

      const validatedHistory = validateHistory(body.history || []);
      const validatedAttachments = validateAttachments(body.attachments || []);

      await runStep(params.step, params.name, {
        instructions: body.instructions,
        history: validatedHistory,
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

  // Upload attachments (multipart/form-data)
  router.post('/api/features/:name/attachments', async (req, res, { params, root }) => {
    const attachDir = path.join(root, AIA_DIR, 'features', params.name, 'attachments');
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
    const attachDir = path.join(root, AIA_DIR, 'features', params.name, 'attachments');
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

    const filepath = path.join(root, AIA_DIR, 'features', params.name, 'attachments', filename);
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
}
