/**
 * @fileoverview ClickUp sync provider — push/pull stories, browse hierarchy
 * @module providers/clickup-provider
 */

import { SyncProvider } from './sync-provider.js';
import {
  ExternalAPIError,
  RateLimitError,
  TimeoutError,
  ExternalServiceError,
  NotFoundError,
} from '../epic/utils/errors.js';

const DEFAULT_STATUS_MAP = Object.freeze({
  pending: 'to do',
  'in-progress': 'in progress',
  done: 'complete',
  error: 'blocked',
});

/**
 * ClickUp sync provider implementation
 * @extends SyncProvider
 */
export class ClickUpProvider extends SyncProvider {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.apiKey] - API key (or read from env)
   * @param {string} [options.apiKeyEnv='CLICKUP_API_KEY'] - Env var name for API key
   * @param {string} [options.workspaceId]
   * @param {string} [options.spaceId]
   * @param {string} [options.defaultListId]
   * @param {string} [options.epicAs='folder'] - 'folder' or 'list'
   * @param {Object} [options.statusMap]
   * @param {Function} [options.fetchFn] - Fetch implementation (for testing)
   * @param {number} [options.timeout=30000]
   */
  constructor(options = {}) {
    super('clickup');
    this.apiKey = options.apiKey || process.env[options.apiKeyEnv || 'CLICKUP_API_KEY'] || '';
    this.workspaceId = options.workspaceId || options.workspace_id;
    this.spaceId = options.spaceId || options.space_id;
    this.defaultListId = options.defaultListId || options.default_list_id;
    this.epicAs = options.epicAs || options.epic_as || 'folder';
    this.statusMap = options.statusMap || options.status_map || { ...DEFAULT_STATUS_MAP };
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.timeout = options.timeout ?? 30000;
    this.baseUrl = 'https://api.clickup.com/api/v2';
    this.isConfigured = Boolean(this.apiKey);
  }

  // ─── HTTP helpers ───────────────────────────────────────────────

  async _request(method, urlPath, body, isFormData = false) {
    const url = `${this.baseUrl}${urlPath}`;
    const headers = { Authorization: this.apiKey };
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let res;
    try {
      res = await this.fetchFn(url, {
        method,
        headers,
        body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new TimeoutError(`Request timed out after ${this.timeout}ms`, this.timeout);
      }
      throw new ExternalServiceError(`Network error: ${err.message}`, { url });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers?.get?.('retry-after') || '60', 10);
      throw new RateLimitError('ClickUp rate limit exceeded', retryAfter);
    }
    if (res.status === 401 || res.status === 403) {
      throw new ExternalAPIError(`ClickUp auth error: ${res.status}`, res.status);
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).err || ''; } catch { /* ignore */ }
      throw new ExternalAPIError(
        `ClickUp API error ${res.status}: ${detail || res.statusText}`,
        res.status,
      );
    }

    // Some endpoints return empty body (204 etc.)
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new ExternalAPIError(`Invalid JSON response from ClickUp: ${text.substring(0, 200)}`, res.status);
    }
  }

  async _requestWithRetry(method, urlPath, body, maxRetries = 3) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this._request(method, urlPath, body);
      } catch (err) {
        lastError = err;
        if (err instanceof RateLimitError) {
          const wait = Math.min((err.retryAfter || 10) * 1000, 30000);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        // Retry on 5xx / network
        if (
          (err instanceof ExternalAPIError && err.apiStatusCode >= 500) ||
          err instanceof ExternalServiceError
        ) {
          const wait = 1000 * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        throw err; // 4xx (non-429) → don't retry
      }
    }
    throw lastError;
  }

  // ─── Connection ─────────────────────────────────────────────────

  async testConnection() {
    try {
      const data = await this._request('GET', '/team');
      return { ok: true, teams: data.teams?.map(t => ({ id: t.id, name: t.name })) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ─── Navigation (browse) ───────────────────────────────────────

  async getWorkspaces() {
    const data = await this._requestWithRetry('GET', '/team');
    return (data.teams || []).map(t => ({ id: t.id, name: t.name }));
  }

  async getSpaces(workspaceId) {
    const data = await this._requestWithRetry('GET', `/team/${workspaceId}/space`);
    return (data.spaces || []).map(s => ({ id: s.id, name: s.name }));
  }

  async getFolders(spaceId) {
    const data = await this._requestWithRetry('GET', `/space/${spaceId}/folder`);
    return (data.folders || []).map(f => ({
      id: f.id,
      name: f.name,
      lists: (f.lists || []).map(l => ({ id: l.id, name: l.name })),
    }));
  }

  async getLists(folderId) {
    const data = await this._requestWithRetry('GET', `/folder/${folderId}/list`);
    return (data.lists || []).map(l => ({ id: l.id, name: l.name, taskCount: l.task_count }));
  }

  async getListsFromSpace(spaceId) {
    const data = await this._requestWithRetry('GET', `/space/${spaceId}/list`);
    return (data.lists || []).map(l => ({ id: l.id, name: l.name, taskCount: l.task_count }));
  }

  async getTasks(listId, options = {}) {
    const params = new URLSearchParams();
    if (options.page !== undefined) params.set('page', String(options.page));
    if (options.include_closed) params.set('include_closed', 'true');
    if (options.statuses) {
      for (const s of options.statuses) params.append('statuses[]', s);
    }
    const qs = params.toString();
    const data = await this._requestWithRetry('GET', `/list/${listId}/task${qs ? '?' + qs : ''}`);
    return { tasks: data.tasks || [] };
  }

  async getTask(taskId) {
    return this._requestWithRetry('GET', `/task/${taskId}`);
  }

  /**
   * Search task by custom ID (e.g. "BB-32592") or task ID
   */
  async findTaskById(customId) {
    // Try custom task ID first (human-readable like "BB-32592")
    try {
      const data = await this._requestWithRetry(
        'GET',
        `/task/${customId}?custom_task_ids=true&team_id=${this.workspaceId}`,
      );
      return data;
    } catch {
      // Fallback: try as regular task ID
      return this._requestWithRetry('GET', `/task/${customId}`);
    }
  }

  /**
   * Get custom fields for a list
   */
  async getListFields(listId) {
    const data = await this._requestWithRetry('GET', `/list/${listId}/field`);
    return data.fields || [];
  }

  async browse(level, parentId, options = {}) {
    switch (level) {
      case 'workspaces': return { items: (await this.getWorkspaces()).map(i => ({ ...i, type: 'workspace' })) };
      case 'spaces': return { items: (await this.getSpaces(parentId)).map(i => ({ ...i, type: 'space' })) };
      case 'folders': return { items: (await this.getFolders(parentId)).map(i => ({ ...i, type: 'folder' })) };
      case 'lists': {
        // Try both folder lists and folderless (space) lists in parallel
        const [folderLists, spaceLists] = await Promise.all([
          this.getLists(parentId).catch(() => []),
          this.getListsFromSpace(parentId).catch(() => []),
        ]);
        return { items: [...folderLists, ...spaceLists].map(i => ({ ...i, type: 'list' })) };
      }
      case 'tasks': {
        const { tasks } = await this.getTasks(parentId, { page: options.page || 0 });
        return {
          items: tasks.map(t => ({
            id: t.id,
            name: t.name,
            type: 'task',
            status: t.status?.status,
            url: t.url,
            dateUpdated: t.date_updated,
            custom_id: t.custom_id,
            // Slim down custom_fields: only keep resolved values, strip type_config options
            custom_fields: (t.custom_fields || [])
              .filter(cf => cf.value != null && cf.value !== '')
              .map(cf => {
                const slim = { id: cf.id, name: cf.name, type: cf.type, value: cf.value };
                // Resolve dropdown value to name+color
                if (cf.type === 'drop_down' && cf.type_config?.options) {
                  const opt = cf.type_config.options.find(o => o.orderindex === cf.value);
                  if (opt) slim.resolved = { name: opt.name, color: opt.color };
                }
                // Resolve labels value (array of IDs) to name+color
                if (cf.type === 'labels' && cf.type_config?.options && Array.isArray(cf.value)) {
                  slim.resolved = cf.value.map(id => {
                    const opt = cf.type_config.options.find(o => o.id === id);
                    return opt ? { name: opt.label || opt.name, color: opt.color } : null;
                  }).filter(Boolean);
                }
                return slim;
              }),
            assignees: (t.assignees || []).map(a => ({
              id: a.id, username: a.username, initials: a.initials,
              email: a.email, profilePicture: a.profilePicture, color: a.color,
            })),
            tags: (t.tags || []).map(tg => ({ name: tg.name, tag_fg: tg.tag_fg, tag_bg: tg.tag_bg })),
          })),
        };
      }
      default:
        return { items: [] };
    }
  }

  async searchTasks(query, options = {}) {
    const listId = options.listId || this.defaultListId;
    if (!listId) return { tasks: [] };
    const { tasks } = await this.getTasks(listId, options);
    const q = query.toLowerCase();
    return { tasks: tasks.filter(t => t.name?.toLowerCase().includes(q)) };
  }

  // ─── Push ───────────────────────────────────────────────────────

  async pushStory(slug, storyData) {
    const listId = storyData.listId || this.defaultListId;
    if (!listId && !storyData.existingTaskId) {
      throw new ExternalAPIError('No list ID configured. Set default_list_id in sync config or provide a listId.', 400);
    }
    const mappedStatus = this.statusMap[storyData.status];

    const taskBody = {
      name: storyData.name,
      description: storyData.steps?.init?.content || '',
    };
    // Only set status if we have a valid mapping — otherwise let ClickUp use the list default
    if (mappedStatus) {
      taskBody.status = mappedStatus;
    }

    let task;
    if (storyData.existingTaskId) {
      // Update existing task
      task = await this._requestWithRetry('PUT', `/task/${storyData.existingTaskId}`, taskBody);
      task.id = task.id || storyData.existingTaskId;
    } else {
      // Create new task
      if (storyData.epicExternalId && this.epicAs === 'folder') {
        // Get first list in the epic folder
        const lists = await this.getLists(storyData.epicExternalId).catch(() => []);
        const targetList = lists[0]?.id || listId;
        task = await this._requestWithRetry('POST', `/list/${targetList}/task`, taskBody);
      } else {
        task = await this._requestWithRetry('POST', `/list/${listId}/task`, taskBody);
      }
    }

    // Upload step attachments
    if (storyData.steps) {
      await this._pushAttachments(task.id, storyData.steps);
    }

    // Sync subtasks from dev-plan
    if (storyData.steps?.['dev-plan']?.content) {
      await this._syncSubtasks(task.id, storyData.steps['dev-plan'].content, listId);
    }

    return { taskId: task.id, url: task.url || `https://app.clickup.com/t/${task.id}` };
  }

  async pushStep(slug, step, content, meta) {
    if (!meta?.taskId) {
      throw new NotFoundError('Story not pushed yet, run aia push first');
    }

    // implement step is local-only
    if (step === 'implement') {
      return { ok: true, skipped: true };
    }

    // Update description if init
    if (step === 'init') {
      await this._requestWithRetry('PUT', `/task/${meta.taskId}`, { description: content });
    }

    // Upload attachment
    await this._uploadAttachment(meta.taskId, `aia--${step}.md`, content);

    // Sync subtasks for dev-plan
    if (step === 'dev-plan') {
      await this._syncSubtasks(meta.taskId, content, this.defaultListId);
    }

    return { ok: true };
  }

  async _pushAttachments(taskId, steps) {
    // Get existing aia attachments to replace
    const existing = await this._getAiaAttachments(taskId);

    for (const [step, data] of Object.entries(steps)) {
      if (step === 'implement' || !data?.content) continue;

      // status.yaml keeps its own extension, others get .md
      const filename = step.endsWith('.yaml') ? `aia--${step}` : `aia--${step}.md`;

      // Delete old version if exists
      const old = existing.find(a => a.filename === filename);
      if (old) {
        await this._deleteAttachment(old.id).catch(() => {});
      }

      await this._uploadAttachment(taskId, filename, data.content);
    }
  }

  async _uploadAttachment(taskId, filename, content) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const formData = new FormData();
    formData.append('attachment', blob, filename);
    return this._request('POST', `/task/${taskId}/attachment`, formData, true);
  }

  async _syncSubtasks(taskId, devPlanContent, listId) {
    if (!listId) return; // Cannot create subtasks without a target list

    // Parse phases from dev-plan markdown
    const phases = [];
    const phaseRegex = /^##\s+(?:Phase|Task)\s+\d+[:\s]+(.*)/gm;
    let match;
    while ((match = phaseRegex.exec(devPlanContent)) !== null) {
      phases.push(match[1].trim());
    }

    if (!phases.length) return;

    // Fetch existing subtasks to avoid duplicates
    const existingNames = new Set();
    try {
      const task = await this._requestWithRetry('GET', `/task/${taskId}`);
      for (const sub of task.subtasks || []) {
        existingNames.add(sub.name);
      }
    } catch { /* proceed without dedup */ }

    for (const phaseName of phases) {
      if (existingNames.has(phaseName)) continue;
      await this._requestWithRetry('POST', `/list/${listId}/task`, {
        name: phaseName,
        parent: taskId,
      }).catch(() => {});
    }
  }

  async _getAiaAttachments(taskId) {
    try {
      const task = await this._requestWithRetry('GET', `/task/${taskId}`);
      // ClickUp uses 'title' for attachment filename, normalize to 'filename'
      return (task.attachments || [])
        .map(a => ({ ...a, filename: a.title || a.filename || a.name }))
        .filter(a => a.filename?.startsWith('aia--'));
    } catch {
      return [];
    }
  }

  async _deleteAttachment(attachmentId) {
    return this._request('DELETE', `/attachment/${attachmentId}`);
  }

  // ─── Pull ───────────────────────────────────────────────────────

  async pullStory(externalId) {
    const task = await this._requestWithRetry('GET', `/task/${externalId}`);

    // Reverse-map status
    const reverseMap = {};
    for (const [local, remote] of Object.entries(this.statusMap)) {
      reverseMap[remote.toLowerCase()] = local;
    }
    const taskStatus = task.status?.status?.toLowerCase() || '';
    const localStatus = reverseMap[taskStatus] || 'pending';

    // Generate slug from name
    const slug = task.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 60);

    // Download aia-- attachments (ClickUp uses 'title' for filename)
    const steps = {};
    const attachments = (task.attachments || [])
      .map(a => ({ ...a, filename: a.title || a.filename || a.name }))
      .filter(a => a.filename?.startsWith('aia--'));

    // init from description
    if (task.description) {
      steps.init = { content: task.description, status: 'done' };
    }

    for (const att of attachments) {
      // aia--status.yaml keeps full name, others strip .md
      const isYaml = att.filename.endsWith('.yaml');
      const stepName = isYaml
        ? att.filename.replace('aia--', '')
        : att.filename.replace('aia--', '').replace('.md', '');
      if (stepName === 'init') continue; // description is source of truth for init
      // Sanitize stepName to prevent path traversal
      if (!/^[a-z0-9.-]+$/.test(stepName)) continue;
      const content = await this._downloadAttachment(att.url);
      if (!content) continue; // skip failed downloads
      steps[stepName] = { content, status: 'done' };
    }

    return {
      slug,
      name: task.name,
      status: localStatus,
      url: task.url || `https://app.clickup.com/t/${task.id}`,
      dateUpdated: task.date_updated,
      steps,
      subtasks: task.subtasks || [],
      meta: {
        assignees: (task.assignees || []).map(a => a.username || a.email),
        tags: (task.tags || []).map(t => t.name),
      },
    };
  }

  async _downloadAttachment(url) {
    try {
      const res = await this.fetchFn(url, {
        headers: { Authorization: this.apiKey },
      });
      if (!res.ok) {
        console.warn(`Failed to download attachment (${res.status}): ${url}`);
        return '';
      }
      return await res.text();
    } catch (err) {
      console.warn(`Attachment download error: ${err.message}`);
      return '';
    }
  }

  async getRemoteUpdatedAt(externalId) {
    try {
      const task = await this._requestWithRetry('GET', `/task/${externalId}`);
      return task.date_updated ? new Date(parseInt(task.date_updated, 10)) : null;
    } catch {
      return null;
    }
  }

  // ─── Epics ──────────────────────────────────────────────────────

  async pushEpic(epicData) {
    if (this.epicAs === 'folder') {
      const data = await this._requestWithRetry(
        'POST',
        `/space/${this.spaceId}/folder`,
        { name: epicData.name },
      );
      return { externalId: data.id, url: `https://app.clickup.com/folder/${data.id}` };
    }
    // list mode
    const data = await this._requestWithRetry(
      'POST',
      `/space/${this.spaceId}/list`,
      { name: epicData.name },
    );
    return { externalId: data.id, url: `https://app.clickup.com/list/${data.id}` };
  }

  async pullEpic(externalId) {
    if (this.epicAs === 'folder') {
      const folder = await this._requestWithRetry('GET', `/folder/${externalId}`);
      const lists = await this.getLists(externalId).catch(() => []);
      const stories = [];
      for (const list of lists) {
        const { tasks } = await this.getTasks(list.id);
        stories.push(...tasks.map(t => ({ id: t.id, name: t.name, status: t.status?.status })));
      }
      return { name: folder.name, description: '', status: 'active', stories };
    }
    // list mode
    const list = await this._requestWithRetry('GET', `/list/${externalId}`);
    const { tasks } = await this.getTasks(externalId);
    return {
      name: list.name,
      description: '',
      status: 'active',
      stories: tasks.map(t => ({ id: t.id, name: t.name, status: t.status?.status })),
    };
  }

  async updateStatus(externalId, status) {
    const mappedStatus = this.statusMap[status];
    if (!mappedStatus) return { ok: true }; // Skip if no valid mapping
    await this._requestWithRetry('PUT', `/task/${externalId}`, { status: mappedStatus });
    return { ok: true };
  }
}
