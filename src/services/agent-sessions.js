// Agent session tracking - in-memory Map with log buffer
// Symphony SPEC compliant state management
const sessions = new Map();
// Map<storyId, Session>

const claimed = new Set();
// Set<storyId> - stories réservées pour éviter double-dispatch

const retryQueue = new Map();
// Map<storyId, RetryEntry>

const MAX_LOGS = 500;

// Configuration defaults
// TODO: Load from config.yaml at runtime via loadConfig() if needed
// For now, these work well as sensible defaults
const STALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const STALL_CHECK_INTERVAL_MS = 30 * 1000; // Check every 30s
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 10000; // 10s
const MAX_DELAY_MS = 300000; // 5min

let stallCheckInterval = null;

/**
 * @typedef {Object} Session
 * @property {string} step - Current step being executed
 * @property {number} startedAt - Timestamp when session started
 * @property {number} lastEventAt - Timestamp of last event
 * @property {Object} tokens - {input, output, total}
 * @property {number} attempt - Attempt number (1-based)
 * @property {Array} logs - Log buffer
 * @property {Set} sseClients - SSE client connections
 * @property {string} status - 'running' | 'stalled' | 'completing'
 * @property {string} root - Project root directory
 */

/**
 * @typedef {Object} RetryEntry
 * @property {number} attempt - Retry attempt number
 * @property {number} dueAt - Timestamp when retry is scheduled
 * @property {string} error - Reason for retry
 * @property {NodeJS.Timeout} timer - Timer handle
 * @property {string} step - Step to retry
 * @property {string} root - Project root for retry execution
 * @property {string} [failedModel] - Model that failed (for fallback logic)
 */

// Fallback models when primary model fails (using CLI aliases)
// These delegate to the respective CLI's configured model
const FALLBACK_MODELS = ['claude-default', 'gemini-default', 'openai-default'];

/**
 * Start a new agent session for a feature
 * @param {string} feature - Feature name
 * @param {string} step - Step name
 * @param {Object} options - Optional settings
 * @param {number} [options.attempt=1] - Attempt number for retries
 * @param {string} [options.root] - Project root directory
 */
export function startSession(feature, step, options = {}) {
  const now = Date.now();
  const attempt = options.attempt || 1;
  const root = options.root || process.cwd();

  // Check if there's an existing session waiting for retry
  const existingSession = sessions.get(feature);
  const existingClients = existingSession?.sseClients || new Set();

  // Notify existing clients that retry is starting
  if (existingClients.size > 0) {
    for (const client of existingClients) {
      try {
        client.write(`event: retryStarted\ndata: ${JSON.stringify({ attempt, step })}\n\n`);
      } catch {
        existingClients.delete(client);
      }
    }
  }

  sessions.set(feature, {
    step,
    startedAt: now,
    lastEventAt: now,
    tokens: { input: 0, output: 0, total: 0 },
    attempt,
    logs: [],
    sseClients: existingClients, // Reuse existing SSE clients
    status: 'running',
    root,
  });

  // Ensure stall detection is running when we have sessions
  startStallDetection();
}

/**
 * End an agent session and notify all SSE clients
 * @param {string} feature - Feature name
 * @param {Object} options - Optional settings
 * @param {boolean} [options.success=true] - Whether session ended successfully
 */
export function endSession(feature, options = {}) {
  const session = sessions.get(feature);
  if (session) {
    session.status = 'completing';

    // Check if a retry is pending - if so, don't send "done" to keep UI connected
    const hasPendingRetry = retryQueue.has(feature);

    if (hasPendingRetry) {
      // Notify clients that we're waiting for retry, not fully done
      for (const client of session.sseClients) {
        try {
          client.write(`event: retryPending\ndata: ${JSON.stringify({ feature })}\n\n`);
        } catch {
          // Client may have disconnected
        }
      }
      // Keep SSE clients for the retry - transfer them to a temporary holder
      session.status = 'waitingRetry';
      // Don't delete the session yet - the retry will reuse it
    } else {
      // No retry pending - fully close the session
      for (const client of session.sseClients) {
        try {
          client.write(`event: done\ndata: {}\n\n`);
        } catch {
          // Client may have disconnected
        }
      }
      sessions.delete(feature);
    }

    // Release claim if session ended successfully
    if (options.success !== false) {
      release(feature);
    }
  }

  // Stop stall detection if no more sessions
  if (sessions.size === 0) {
    stopStallDetection();
  }
}

/**
 * Claim a story to prevent double-dispatch
 * @param {string} storyId - Story ID
 * @throws {Error} If story is already claimed
 */
export function claim(storyId) {
  if (claimed.has(storyId)) {
    throw new Error(`Story ${storyId} is already claimed`);
  }
  claimed.add(storyId);
}

/**
 * Release a claimed story
 * @param {string} storyId - Story ID
 */
export function release(storyId) {
  claimed.delete(storyId);
  // Clear any pending retry
  const retry = retryQueue.get(storyId);
  if (retry?.timer) {
    clearTimeout(retry.timer);
  }
  retryQueue.delete(storyId);
}

/**
 * Check if a story is claimed
 * @param {string} storyId - Story ID
 * @returns {boolean}
 */
export function isClaimed(storyId) {
  return claimed.has(storyId);
}

/**
 * Get an active session for a feature
 * @param {string} feature - Feature name
 * @returns {Object|null} Session object or null
 */
export function getSession(feature) {
  return sessions.get(feature) || null;
}

/**
 * Update lastEventAt timestamp for a session
 * @param {string} storyId - Story ID
 */
export function updateLastEvent(storyId) {
  const session = sessions.get(storyId);
  if (session) {
    session.lastEventAt = Date.now();
    // Reset status to running if it was marked as stalled
    if (session.status === 'stalled') {
      session.status = 'running';
      broadcastToSession(storyId, { type: 'status', status: 'running' });
    }
  }
}

/**
 * Update token counts for a session
 * @param {string} storyId - Story ID
 * @param {Object} tokens - Token counts
 * @param {number} [tokens.input] - Input tokens
 * @param {number} [tokens.output] - Output tokens
 */
export function updateTokens(storyId, tokens) {
  const session = sessions.get(storyId);
  if (session) {
    session.tokens = {
      input: tokens.input || 0,
      output: tokens.output || 0,
      total: (tokens.input || 0) + (tokens.output || 0),
    };
  }
}

/**
 * Append a log entry to a session's buffer
 * @param {string} feature - Feature name
 * @param {string} text - Log text
 * @param {string} type - Log type ('stdout' or 'stderr')
 */
export function appendLog(feature, text, type = 'stdout') {
  const session = sessions.get(feature);
  if (!session) return;

  // Update lastEventAt on each log
  session.lastEventAt = Date.now();

  session.logs.push({ text, type, ts: Date.now() });
  if (session.logs.length > MAX_LOGS) session.logs.shift();

  // Broadcast to all SSE clients
  for (const client of session.sseClients) {
    try {
      client.write(`event: log\ndata: ${JSON.stringify({ text, type })}\n\n`);
    } catch {
      // Client may have disconnected
    }
  }
}

/**
 * Register an SSE client for a session
 * @param {string} feature - Feature name
 * @param {Response} res - HTTP response object
 */
export function addSseClient(feature, res) {
  const session = sessions.get(feature);
  if (session) session.sseClients.add(res);
}

/**
 * Unregister an SSE client from a session
 * @param {string} feature - Feature name
 * @param {Response} res - HTTP response object
 */
export function removeSseClient(feature, res) {
  const session = sessions.get(feature);
  if (session) session.sseClients.delete(res);
}

/**
 * Check if a feature has an active session
 * @param {string} feature - Feature name
 * @returns {boolean}
 */
export function isRunning(feature) {
  return sessions.has(feature);
}

/**
 * Get all running sessions (for dashboard)
 * @returns {Object} Map of feature name to session summary
 */
export function getAllRunningSessions() {
  const result = {};
  for (const [feature, session] of sessions) {
    result[feature] = {
      step: session.step,
      startedAt: session.startedAt,
      lastEventAt: session.lastEventAt,
      tokens: session.tokens,
      attempt: session.attempt,
      status: session.status,
    };
  }
  return result;
}

/**
 * Get retry info for a story
 * @param {string} storyId - Story ID
 * @returns {Object|null} Retry entry or null
 */
export function getRetryInfo(storyId) {
  const retry = retryQueue.get(storyId);
  if (!retry) return null;
  return {
    attempt: retry.attempt,
    dueAt: retry.dueAt,
    error: retry.error,
    step: retry.step,
  };
}

/**
 * Broadcast a message to all SSE clients of a session
 * @param {string} storyId - Story ID
 * @param {Object} data - Data to broadcast
 */
function broadcastToSession(storyId, data) {
  const session = sessions.get(storyId);
  if (!session) return;

  for (const client of session.sseClients) {
    try {
      client.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      // Client may have disconnected
    }
  }
}

/**
 * Start the stall detection loop
 */
export function startStallDetection() {
  if (stallCheckInterval) return;

  stallCheckInterval = setInterval(() => {
    const now = Date.now();
    for (const [storyId, session] of sessions) {
      const elapsed = now - session.lastEventAt;
      if (elapsed > STALL_TIMEOUT_MS && session.status === 'running') {
        console.log(`[Stall] Story ${storyId} stalled (${Math.round(elapsed / 1000)}s without output)`);
        session.status = 'stalled';
        // Notify SSE clients
        broadcastToSession(storyId, {
          type: 'stall',
          elapsed,
          message: `Agent stalled - no output for ${Math.round(elapsed / 1000)}s`,
        });
        // Schedule retry
        scheduleRetry(storyId, session.step, 'Agent stalled (no output)', session.root);
      }
    }
  }, STALL_CHECK_INTERVAL_MS);
}

/**
 * Stop the stall detection loop
 */
export function stopStallDetection() {
  if (stallCheckInterval) {
    clearInterval(stallCheckInterval);
    stallCheckInterval = null;
  }
}

/**
 * Schedule a retry with exponential backoff
 * @param {string} storyId - Story ID
 * @param {string} step - Step to retry
 * @param {string} error - Error message
 * @param {string} [root] - Project root directory
 * @param {string} [failedModel] - Model that failed (for fallback)
 */
export function scheduleRetry(storyId, step, error, root = process.cwd(), failedModel = null) {
  const existing = retryQueue.get(storyId);
  const attempt = existing ? existing.attempt + 1 : 1;

  if (attempt > MAX_RETRIES) {
    console.log(`[Retry] Max retries (${MAX_RETRIES}) reached for ${storyId}`);
    release(storyId);
    broadcastToSession(storyId, {
      type: 'maxRetries',
      error,
      message: `Max retries (${MAX_RETRIES}) reached. Manual intervention required.`,
    });
    return;
  }

  // Exponential backoff: 10s, 20s, 40s... max 5min
  const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
  const dueAt = Date.now() + delay;

  // Clear existing timer
  if (existing?.timer) {
    clearTimeout(existing.timer);
  }

  // Track failed models for fallback
  const existingFailedModels = existing?.failedModels || [];
  const failedModels = failedModel && !existingFailedModels.includes(failedModel)
    ? [...existingFailedModels, failedModel]
    : existingFailedModels;

  const timer = setTimeout(() => {
    executeRetry(storyId, step, attempt, root, failedModels);
  }, delay);

  retryQueue.set(storyId, {
    attempt,
    dueAt,
    error,
    timer,
    step,
    root,
    failedModels,
  });

  console.log(`[Retry] Scheduled retry #${attempt} for ${storyId} in ${Math.round(delay / 1000)}s`);
  broadcastToSession(storyId, {
    type: 'retryScheduled',
    attempt,
    maxRetries: MAX_RETRIES,
    dueAt,
    delay,
    error,
  });
}

/**
 * Execute a retry
 * @param {string} storyId - Story ID
 * @param {string} step - Step to retry
 * @param {number} attempt - Attempt number
 * @param {string} root - Project root directory
 * @param {string[]} failedModels - Models that have already failed
 */
async function executeRetry(storyId, step, attempt, root, failedModels = []) {
  // Find a fallback model that hasn't failed yet
  const fallbackModel = FALLBACK_MODELS.find(m => !failedModels.includes(m));

  if (fallbackModel) {
    console.log(`[Retry] Executing retry #${attempt} for ${storyId} with fallback model: ${fallbackModel}`);
  } else {
    console.log(`[Retry] Executing retry #${attempt} for ${storyId} (no fallback available)`);
  }

  // Don't delete retryQueue yet - keep it for attempt tracking
  // It will be deleted on success or overwritten on next scheduleRetry

  // Import runner dynamically to avoid circular deps
  try {
    const { runStep } = await import('./runner.js');
    // Pass isRetry flag and fallback model
    await runStep(step, storyId, {
      attempt,
      root,
      isRetry: true,
      model: fallbackModel, // Use fallback model if available
    });
    // Success - clear the retry queue
    retryQueue.delete(storyId);
  } catch (err) {
    // runStep already called scheduleRetry via its catch block
    // We don't call it again here to avoid double-scheduling
    console.error(`[Retry] Retry #${attempt} failed for ${storyId}:`, err.message);
  }
}

/**
 * Cancel a pending retry
 * @param {string} storyId - Story ID
 */
export function cancelRetry(storyId) {
  const retry = retryQueue.get(storyId);
  if (retry?.timer) {
    clearTimeout(retry.timer);
    retryQueue.delete(storyId);
    console.log(`[Retry] Cancelled pending retry for ${storyId}`);
    broadcastToSession(storyId, {
      type: 'retryCancelled',
      storyId,
    });
  }
}
