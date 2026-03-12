// Agent session tracking - in-memory Map with log buffer
// Map<featureName, { step, startedAt, logs: Array<{text, type, ts}>, sseClients: Set<Response> }>
const sessions = new Map();
const MAX_LOGS = 500;

/**
 * Start a new agent session for a feature
 * @param {string} feature - Feature name
 * @param {string} step - Step name
 */
export function startSession(feature, step) {
  sessions.set(feature, {
    step,
    startedAt: Date.now(),
    logs: [],
    sseClients: new Set(),
  });
}

/**
 * End an agent session and notify all SSE clients
 * @param {string} feature - Feature name
 */
export function endSession(feature) {
  const session = sessions.get(feature);
  if (session) {
    // Notify all SSE clients that session ended
    for (const client of session.sseClients) {
      try {
        client.write(`event: done\ndata: {}\n\n`);
      } catch {
        // Client may have disconnected
      }
    }
    sessions.delete(feature);
  }
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
 * Append a log entry to a session's buffer
 * @param {string} feature - Feature name
 * @param {string} text - Log text
 * @param {string} type - Log type ('stdout' or 'stderr')
 */
export function appendLog(feature, text, type = 'stdout') {
  const session = sessions.get(feature);
  if (!session) return;

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
    result[feature] = { step: session.step, startedAt: session.startedAt };
  }
  return result;
}
