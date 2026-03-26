import React from 'react';
import { api } from '/main.js';

const { useState, useEffect, useCallback } = React;
const h = React.createElement;

const LEVEL_ORDER = ['workspaces', 'spaces', 'folders', 'lists', 'tasks'];
const LEVEL_ICONS = { workspace: '\u{1F3E2}', space: '\u{1F4C1}', folder: '\u{1F4C2}', list: '\u{1F4CB}', task: '' };

// Custom fields to show inline on tasks (by name, case-insensitive)
const PRIORITY_FIELDS = ['module tag', 'item type', 'squad team', 'product type'];

// Works with both pre-resolved slim fields (browse) and raw fields (preview/getTask)
function getFieldDisplay(cf) {
  if (!cf || cf.value == null || cf.value === '') return null;
  // Pre-resolved by server (slim format)
  if (cf.resolved) {
    if (cf.type === 'labels' && Array.isArray(cf.resolved)) {
      return cf.resolved.length ? { labels: cf.resolved } : null;
    }
    return { label: cf.resolved.name, color: cf.resolved.color };
  }
  // Tasks type (relations) — display task names or IDs
  if (cf.type === 'tasks') {
    if (Array.isArray(cf.value)) {
      const names = cf.value.map(t => t.name || t.custom_id || t.id || 'Unknown');
      return names.length ? { label: names.join(', ') } : null;
    }
    if (typeof cf.value === 'object' && cf.value) {
      return { label: cf.value.name || cf.value.id || 'Unknown' };
    }
    return { label: String(cf.value) };
  }
  // Users type — display usernames
  if (cf.type === 'users' && Array.isArray(cf.value)) {
    const names = cf.value.map(u => u.username || u.email || 'Unknown').filter(Boolean);
    return names.length ? { label: names.join(', ') } : null;
  }
  if (cf.type === 'users' && typeof cf.value === 'object' && cf.value) {
    return { label: cf.value.username || cf.value.email || 'Unknown' };
  }
  // Raw format (from getTask) — resolve locally
  if (cf.type === 'drop_down' && cf.type_config?.options) {
    const opt = cf.type_config.options.find(o => o.orderindex === cf.value);
    return opt ? { label: opt.name, color: opt.color } : null;
  }
  if (cf.type === 'labels' && cf.type_config?.options && Array.isArray(cf.value)) {
    const labels = cf.value.map(id => {
      const opt = cf.type_config.options.find(o => o.id === id);
      return opt ? { name: opt.label || opt.name, color: opt.color } : null;
    }).filter(Boolean);
    return labels.length ? { labels } : null;
  }
  return { label: String(cf.value).substring(0, 30) };
}

function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('done') || s.includes('complete') || s.includes('closed')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (s.includes('progress') || s.includes('review') || s.includes('active')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (s.includes('block') || s.includes('stuck')) return 'bg-red-500/20 text-red-400 border-red-500/30';
  return 'bg-slate-700/50 text-slate-400 border-slate-600/30';
}

const inputClass = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none';
const btnPrimary = 'px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded text-sm transition-colors disabled:opacity-40';
const btnSecondary = 'px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm transition-colors';
const labelClass = 'block text-sm text-slate-300 mb-1';

// ─── Push Modal (exported for use in story-view) ─────────────────

export function PushModal({ slug, onClose, onPushed }) {
  const [spaces, setSpaces] = useState([]);
  const [folders, setFolders] = useState([]);
  const [lists, setLists] = useState([]);
  const [selectedSpace, setSelectedSpace] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('');
  const [selectedList, setSelectedList] = useState('');
  const [pushing, setPushing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // Load spaces on mount
  useEffect(() => {
    (async () => {
      try {
        const config = await api.get('/integrations/config');
        if (config.clickup?.space_id) {
          // If a space is already configured, load folders directly
          setSelectedSpace(config.clickup.space_id);
          await loadFolders(config.clickup.space_id);
          if (config.clickup?.default_list_id) {
            setSelectedList(config.clickup.default_list_id);
          }
        } else {
          const data = await api.get('/integrations/browse/spaces?parentId=' + (config.clickup?.workspace_id || ''));
          setSpaces(data.items || []);
        }
      } catch (err) {
        setErrorMsg(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadFolders(spaceId) {
    setSelectedSpace(spaceId);
    setFolders([]);
    setLists([]);
    setSelectedFolder('');
    setSelectedList('');
    try {
      const data = await api.get(`/integrations/browse/folders?parentId=${spaceId}`);
      setFolders(data.items || []);
      // Also load folderless lists
      const listsData = await api.get(`/integrations/browse/lists?parentId=${spaceId}`);
      setLists(listsData.items || []);
    } catch (err) {
      setErrorMsg(err.message);
    }
  }

  async function loadListsFromFolder(folderId) {
    setSelectedFolder(folderId);
    setSelectedList('');
    try {
      const data = await api.get(`/integrations/browse/lists?parentId=${folderId}`);
      setLists(data.items || []);
    } catch (err) {
      setErrorMsg(err.message);
    }
  }

  async function doPush() {
    if (!selectedList) return;
    setPushing(true);
    setErrorMsg('');
    try {
      // Save the selected list as default for next time
      await api.post('/integrations/setup', {
        defaultListId: selectedList,
        spaceId: selectedSpace,
      });
      const result = await api.post('/integrations/push', { slug });
      if (onPushed) onPushed(result);
      onClose();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setPushing(false);
    }
  }

  // Modal overlay
  return h('div', {
    className: 'fixed inset-0 bg-black/60 flex items-center justify-center z-50',
    onClick: e => { if (e.target === e.currentTarget) onClose(); },
  },
    h('div', { className: 'bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 shadow-xl' },
      // Header
      h('div', { className: 'flex items-center justify-between mb-4' },
        h('h3', { className: 'text-lg font-bold text-white' }, `Push "${slug}" to ClickUp`),
        h('button', { className: 'text-slate-400 hover:text-white text-xl', onClick: onClose }, '\u00D7'),
      ),

      loading
        ? h('div', { className: 'text-slate-500 text-sm py-4' }, 'Loading...')
        : h('div', { className: 'space-y-3' },
          // Space selector (if multiple)
          spaces.length > 0 && h('div', null,
            h('label', { className: labelClass }, 'Space'),
            h('select', {
              className: inputClass,
              value: selectedSpace,
              onChange: e => loadFolders(e.target.value),
            },
              h('option', { value: '' }, 'Select a space...'),
              ...spaces.map(s => h('option', { key: s.id, value: s.id }, s.name)),
            ),
          ),

          // Folders (if any)
          selectedSpace && folders.length > 0 && h('div', null,
            h('label', { className: labelClass }, 'Folder (optional)'),
            h('select', {
              className: inputClass,
              value: selectedFolder,
              onChange: e => e.target.value ? loadListsFromFolder(e.target.value) : loadFolders(selectedSpace),
            },
              h('option', { value: '' }, 'No folder (folderless lists)'),
              ...folders.map(f => h('option', { key: f.id, value: f.id }, f.name)),
            ),
          ),

          // Lists
          selectedSpace && h('div', null,
            h('label', { className: labelClass }, 'List'),
            lists.length > 0
              ? h('select', {
                  className: inputClass,
                  value: selectedList,
                  onChange: e => setSelectedList(e.target.value),
                },
                  h('option', { value: '' }, 'Select a list...'),
                  ...lists.map(l => h('option', { key: l.id, value: l.id }, l.name)),
                )
              : h('div', { className: 'text-slate-500 text-xs' }, 'No lists found. Select a folder or check your space.'),
          ),

          // Error
          errorMsg && h('div', { className: 'p-2 rounded text-sm bg-red-900/50 border border-red-700 text-red-300' }, errorMsg),

          // Actions
          h('div', { className: 'flex gap-2 pt-2' },
            h('button', { className: btnSecondary, onClick: onClose }, 'Cancel'),
            h('button', {
              className: btnPrimary,
              onClick: doPush,
              disabled: !selectedList || pushing,
            }, pushing ? 'Pushing...' : '\u2191 Push to ClickUp'),
          ),
        ),
    ),
  );
}

// ─── Setup Wizard ────────────────────────────────────────────────

function SetupWizard({ onComplete, existingConfig }) {
  // Skip step 1 if already configured (editing settings)
  const isEdit = Boolean(existingConfig?.configured);
  const [step, setStep] = useState(isEdit ? 2 : 1);
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(isEdit ? { ok: true } : null);
  const [workspaces, setWorkspaces] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState(existingConfig?.clickup?.workspace_id || '');
  const [spaceId, setSpaceId] = useState(existingConfig?.clickup?.space_id || '');
  const [defaultListId, setDefaultListId] = useState(existingConfig?.clickup?.default_list_id || '');
  const [epicAs, setEpicAs] = useState(existingConfig?.clickup?.epic_as || 'folder');
  const [autoPush, setAutoPush] = useState(existingConfig?.auto_push !== false);
  const [autoPullCheck, setAutoPullCheck] = useState(existingConfig?.auto_pull_check !== false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Auto-load spaces if editing with existing workspace
  useEffect(() => {
    if (isEdit && workspaceId) {
      loadSpacesFromConfig();
    }
  }, []);

  async function loadSpacesFromConfig() {
    try {
      // Test connection first to get workspaces
      const result = await api.post('/integrations/test-connection');
      if (result.ok && result.teams) {
        setWorkspaces(result.teams);
      }
      // Load spaces
      const data = await api.get(`/integrations/browse/spaces?parentId=${workspaceId}`);
      setSpaces(data.items || []);
    } catch { /* silent — user can still type IDs */ }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    setErrorMsg('');
    try {
      const result = await api.post('/integrations/test-key', { apiKey });
      setTestResult(result);
      if (result.ok && result.teams) {
        setWorkspaces(result.teams);
        if (result.teams.length === 1) {
          loadSpaces(result.teams[0].id);
        }
      }
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  }

  async function loadSpaces(wsId) {
    setWorkspaceId(wsId);
    try {
      const key = apiKey || undefined;
      const data = key
        ? await api.post('/integrations/browse-with-key', { apiKey: key, level: 'spaces', parentId: wsId })
        : await api.get(`/integrations/browse/spaces?parentId=${wsId}`);
      setSpaces(data.items || []);
      if (data.items?.length === 1) setSpaceId(data.items[0].id);
    } catch (err) {
      setErrorMsg(`Failed to load spaces: ${err.message}`);
    }
  }

  async function saveConfig() {
    setSaving(true);
    setErrorMsg('');
    try {
      const payload = { workspaceId, spaceId, defaultListId, epicAs, autoPush, autoPullCheck };
      if (apiKey) payload.apiKey = apiKey;
      await api.post('/integrations/setup', payload);
      onComplete();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Step 1: API Key (skipped in edit mode)
  if (step === 1) {
    return h('div', { className: 'max-w-lg mx-auto' },
      h('div', { className: 'mb-6' },
        h('div', { className: 'flex items-center gap-2 mb-1' },
          h('div', { className: 'w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-sm font-bold' }, '1'),
          h('h3', { className: 'text-lg font-semibold text-white' }, 'API Key'),
        ),
        h('p', { className: 'text-sm text-slate-400 mt-1 ml-10' }, 'Enter your ClickUp personal API token. It will be saved in your .env file (never committed to git).'),
      ),
      h('div', { className: 'ml-10 space-y-4' },
        h('div', null,
          h('label', { className: labelClass }, 'ClickUp API Token'),
          h('input', {
            type: 'password',
            className: inputClass,
            placeholder: 'pk_...',
            value: apiKey,
            onChange: e => { setApiKey(e.target.value); setTestResult(null); },
          }),
          h('a', {
            href: 'https://app.clickup.com/settings/apps',
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'text-xs text-violet-400 hover:text-violet-300 mt-1 inline-block',
          }, 'Get a token from ClickUp Settings \u2192'),
        ),
        testResult && h('div', {
          className: `p-2 rounded text-sm ${testResult.ok ? 'bg-emerald-900/50 border border-emerald-700 text-emerald-300' : 'bg-red-900/50 border border-red-700 text-red-300'}`,
        }, testResult.ok ? '\u2713 Connection successful' : `\u2717 ${testResult.error}`),
        h('div', { className: 'flex gap-2' },
          h('button', {
            className: btnPrimary,
            onClick: testConnection,
            disabled: !apiKey || testing,
          }, testing ? 'Testing...' : 'Test Connection'),
          testResult?.ok && h('button', {
            className: btnPrimary,
            onClick: () => setStep(2),
          }, 'Next \u2192'),
        ),
      ),
    );
  }

  // Step 2: Workspace & Space
  if (step === 2) {
    return h('div', { className: 'max-w-lg mx-auto' },
      h('div', { className: 'mb-6' },
        h('div', { className: 'flex items-center gap-2 mb-1' },
          h('div', { className: 'w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-sm font-bold' }, isEdit ? '1' : '2'),
          h('h3', { className: 'text-lg font-semibold text-white' }, 'Workspace & Space'),
        ),
        h('p', { className: 'text-sm text-slate-400 mt-1 ml-10' }, 'Select where your AIA stories will be synced.'),
      ),
      h('div', { className: 'ml-10 space-y-4' },
        h('div', null,
          h('label', { className: labelClass }, 'Workspace'),
          workspaces.length > 0
            ? h('select', {
                className: inputClass,
                value: workspaceId,
                onChange: e => loadSpaces(e.target.value),
              },
                h('option', { value: '' }, 'Select a workspace...'),
                ...workspaces.map(ws => h('option', { key: ws.id, value: ws.id }, ws.name)),
              )
            : h('input', { className: inputClass, placeholder: 'Workspace ID', value: workspaceId, onChange: e => setWorkspaceId(e.target.value) }),
        ),
        h('div', null,
          h('label', { className: labelClass }, 'Space'),
          spaces.length > 0
            ? h('select', {
                className: inputClass,
                value: spaceId,
                onChange: e => setSpaceId(e.target.value),
              },
                h('option', { value: '' }, 'Select a space...'),
                ...spaces.map(s => h('option', { key: s.id, value: s.id }, s.name)),
              )
            : h('input', { className: inputClass, placeholder: 'Space ID', value: spaceId, onChange: e => setSpaceId(e.target.value) }),
        ),
        errorMsg && h('div', { className: 'p-2 rounded text-sm bg-red-900/50 border border-red-700 text-red-300' }, errorMsg),
        h('div', { className: 'flex gap-2' },
          !isEdit && h('button', { className: btnSecondary, onClick: () => setStep(1) }, '\u2190 Back'),
          h('button', {
            className: btnPrimary,
            onClick: () => setStep(3),
            disabled: !workspaceId || !spaceId,
          }, 'Next \u2192'),
        ),
      ),
    );
  }

  // Step 3: Options & Save
  if (step === 3) {
    return h('div', { className: 'max-w-lg mx-auto' },
      h('div', { className: 'mb-6' },
        h('div', { className: 'flex items-center gap-2 mb-1' },
          h('div', { className: 'w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-sm font-bold' }, isEdit ? '2' : '3'),
          h('h3', { className: 'text-lg font-semibold text-white' }, 'Options'),
        ),
      ),
      h('div', { className: 'ml-10 space-y-4' },
        h('div', null,
          h('label', { className: labelClass }, 'Map epics as'),
          h('select', { className: inputClass, value: epicAs, onChange: e => setEpicAs(e.target.value) },
            h('option', { value: 'folder' }, 'Folders (recommended)'),
            h('option', { value: 'list' }, 'Lists'),
          ),
        ),
        h('label', { className: 'flex items-center gap-2 text-sm text-slate-300 cursor-pointer' },
          h('input', { type: 'checkbox', checked: autoPush, onChange: e => setAutoPush(e.target.checked) }),
          'Auto-push after each step completion',
        ),
        h('label', { className: 'flex items-center gap-2 text-sm text-slate-300 cursor-pointer' },
          h('input', { type: 'checkbox', checked: autoPullCheck, onChange: e => setAutoPullCheck(e.target.checked) }),
          'Check for remote changes before run',
        ),
        !isEdit && h('div', { className: 'p-3 bg-slate-800/50 rounded border border-slate-700 text-xs text-slate-400 space-y-1' },
          h('div', null, '\u{1F4BE} API key saved in ', h('code', { className: 'text-violet-400' }, '.env')),
          h('div', null, '\u2699\uFE0F Config saved in ', h('code', { className: 'text-violet-400' }, '.aia/config.yaml')),
        ),
        errorMsg && h('div', { className: 'p-2 rounded text-sm bg-red-900/50 border border-red-700 text-red-300' }, errorMsg),
        h('div', { className: 'flex gap-2' },
          h('button', { className: btnSecondary, onClick: () => setStep(2) }, '\u2190 Back'),
          h('button', {
            className: btnPrimary,
            onClick: saveConfig,
            disabled: saving,
          }, saving ? 'Saving...' : '\u2713 Save & Connect'),
        ),
      ),
    );
  }

  return null;
}

// ─── Favorites helpers ───────────────────────────────────────────

const FAV_KEY = 'aia-clickup-favorites';
function loadFavorites() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; }
}
function saveFavorites(favs) {
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}

// ─── Main Component ──────────────────────────────────────────────

export function IntegrationsBrowser() {
  const [config, setConfig] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [items, setItems] = useState([]);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [currentLevel, setCurrentLevel] = useState('home');
  const [currentParentId, setCurrentParentId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [preview, setPreview] = useState(null);
  const [filter, setFilter] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pullResults, setPullResults] = useState([]);
  const [favorites, setFavorites] = useState(() => loadFavorites());
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [customFields, setCustomFields] = useState([]);
  const [fieldFilters, setFieldFilters] = useState({});
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [taskPage, setTaskPage] = useState(0);
  const [hasMoreTasks, setHasMoreTasks] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadConfig = useCallback(() => {
    api.get('/integrations/config').then(data => {
      setConfig(data);
      setShowSetup(!data.configured);
    }).catch(() => {});
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  useEffect(() => {
    if (config?.configured && !showSetup) {
      loadLevel('workspaces', null);
    }
  }, [config?.configured, showSetup]);

  async function loadLevel(level, parentId) {
    setIsLoading(true);
    setErrorMsg('');
    setSelectedItems(new Set());
    setPreview(null);
    setFilter('');
    setSearchResult(null);
    setCustomFields([]);
    setFieldFilters({});
    setCollapsedGroups({});
    setTaskPage(0);
    setHasMoreTasks(false);
    try {
      const qs = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
      const data = await api.get(`/integrations/browse/${level}${qs}`);
      setItems(data.items || []);
      setCurrentLevel(level);
      setCurrentParentId(parentId);
      // ClickUp returns ~100 tasks per page; if we get 100, there might be more
      if (level === 'tasks') {
        setHasMoreTasks((data.items || []).length >= 100);
      }
      // Load custom fields when entering a task list
      if (level === 'tasks' && parentId) {
        api.get(`/integrations/fields/${parentId}`).then(d => setCustomFields(d.fields || [])).catch(() => {});
      }
    } catch (err) {
      setErrorMsg(err.message);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadMoreTasks() {
    if (!currentParentId || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = taskPage + 1;
      const data = await api.get(`/integrations/browse/tasks?parentId=${encodeURIComponent(currentParentId)}&page=${nextPage}`);
      const newItems = data.items || [];
      setItems(prev => [...prev, ...newItems]);
      setTaskPage(nextPage);
      setHasMoreTasks(newItems.length >= 100);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  function drillDown(item) {
    const nextIdx = LEVEL_ORDER.indexOf(currentLevel) + 1;
    if (nextIdx >= LEVEL_ORDER.length) return;
    setBreadcrumb(prev => [...prev, { level: currentLevel, parentId: currentParentId, name: item.name, id: item.id, type: item.type }]);
    loadLevel(LEVEL_ORDER[nextIdx], item.id);
  }

  function goToBreadcrumb(idx) {
    if (idx < 0) {
      setBreadcrumb([]);
      setItems([]);
      setCurrentLevel('home');
      setCurrentParentId(null);
      return;
    }
    const target = breadcrumb[idx];
    setBreadcrumb(prev => prev.slice(0, idx));
    loadLevel(target.level, target.parentId);
  }

  function navigateToFavorite(fav) {
    // Set breadcrumb from favorite's path, then load
    setBreadcrumb(fav.path || []);
    loadLevel(fav.level, fav.id);
  }

  // ─── Favorites ──────────────────────────────────────────────

  function toggleFavorite(item) {
    const existing = favorites.find(f => f.id === item.id);
    let next;
    if (existing) {
      next = favorites.filter(f => f.id !== item.id);
    } else {
      next = [...favorites, {
        id: item.id,
        name: item.name,
        type: item.type || currentLevel.replace(/s$/, ''),
        level: LEVEL_ORDER[LEVEL_ORDER.indexOf(currentLevel) + 1] || 'tasks',
        path: [...breadcrumb, { level: currentLevel, parentId: currentParentId, name: item.name, id: item.id }],
      }];
    }
    setFavorites(next);
    saveFavorites(next);
  }

  function isFavorite(id) {
    return favorites.some(f => f.id === id);
  }

  // ─── Search ─────────────────────────────────────────────────

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResult(null);
    setErrorMsg('');
    try {
      const task = await api.get(`/integrations/search/${encodeURIComponent(searchQuery.trim())}`);
      setSearchResult(task);
    } catch (err) {
      setErrorMsg(`Task "${searchQuery}" not found`);
    } finally {
      setSearching(false);
    }
  }

  // ─── Selection & Pull ───────────────────────────────────────

  function toggleSelect(id) {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function previewTask(taskId) {
    try {
      const task = await api.get(`/integrations/task/${taskId}`);
      setPreview(task);
    } catch (err) {
      setPreview({ error: err.message });
    }
  }

  async function pullSelected() {
    setPulling(true);
    setPullResults([]);
    const ids = [...selectedItems];
    const results = [];
    const errors = [];
    for (const id of ids) {
      try {
        const result = await api.post('/integrations/pull', { externalId: id });
        results.push(result);
      } catch (err) {
        errors.push(`${id}: ${err.message}`);
      }
    }
    setSelectedItems(new Set());
    setPulling(false);
    setPullResults(results);
    if (errors.length) setErrorMsg(`Errors: ${errors.join('; ')}`);
    else setErrorMsg('');
  }

  async function pullSingle(taskId) {
    setPulling(true);
    setPullResults([]);
    try {
      const result = await api.post('/integrations/pull', { externalId: taskId });
      setPullResults([result]);
      setSearchResult(null);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setPulling(false);
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect ClickUp integration? Your synced data will remain.')) return;
    try {
      await api.post('/integrations/disconnect');
      setConfig(null);
      setShowSetup(true);
      setItems([]);
      setBreadcrumb([]);
    } catch (err) {
      setErrorMsg(err.message);
    }
  }

  // ─── Filtering (name + custom fields) ──────────────────────

  const filteredItems = (() => {
    let result = items;
    // Text filter
    if (filter) {
      const q = filter.toLowerCase();
      result = result.filter(i => {
        const nameMatch = i.name?.toLowerCase().includes(q);
        const idMatch = i.custom_id?.toLowerCase().includes(q);
        return nameMatch || idMatch;
      });
    }
    // Custom field filters (using pre-resolved values from server)
    for (const [fieldId, filterValue] of Object.entries(fieldFilters)) {
      if (!filterValue) continue;
      const fv = filterValue.toLowerCase();
      result = result.filter(i => {
        const cf = (i.custom_fields || []).find(f => f.id === fieldId);
        if (!cf) return false;
        // Dropdown — resolved name
        if (cf.type === 'drop_down' && cf.resolved) {
          return cf.resolved.name?.toLowerCase() === fv;
        }
        // Labels — resolved array of {name, color}
        if (cf.type === 'labels' && Array.isArray(cf.resolved)) {
          return cf.resolved.some(lb => lb.name?.toLowerCase() === fv);
        }
        // Fallback
        return String(cf.value).toLowerCase().includes(fv);
      });
    }
    return result;
  })();

  // ─── Setup mode ─────────────────────────────────────────────
  if (showSetup || !config?.configured) {
    return h('div', { className: 'p-6' },
      h('div', { className: 'flex items-center justify-between mb-8' },
        h('h2', { className: 'text-xl font-bold text-white' }, 'ClickUp Integration'),
        config?.configured && h('button', {
          className: 'text-sm text-slate-400 hover:text-white',
          onClick: () => setShowSetup(false),
        }, 'Cancel'),
      ),
      h(SetupWizard, {
        existingConfig: config,
        onComplete: () => { setShowSetup(false); loadConfig(); },
      }),
    );
  }

  // ─── Browser mode ───────────────────────────────────────────
  return h('div', { className: 'p-4 sm:p-6' },
    // Header
    h('div', { className: 'flex items-center justify-between mb-3 gap-2 flex-wrap' },
      h('h2', { className: 'text-lg font-bold text-white' }, 'ClickUp Browser'),
      h('div', { className: 'flex gap-1.5 flex-wrap' },
        selectedItems.size > 0 && h('button', {
          className: 'px-2 py-1 bg-aia-accent text-white rounded text-xs',
          onClick: pullSelected, disabled: pulling,
        }, pulling ? 'Pulling...' : `Pull (${selectedItems.size})`),
        h('button', { className: 'px-2 py-1 bg-slate-700 text-slate-200 rounded text-xs', onClick: () => loadLevel(currentLevel, currentParentId) }, 'Refresh'),
        h('button', { className: 'px-2 py-1 bg-slate-700 text-slate-200 rounded text-xs', onClick: () => setShowSetup(true) }, 'Settings'),
        h('button', { className: 'px-2 py-1 bg-red-900/50 text-red-400 border border-red-700/50 rounded text-xs hover:bg-red-900', onClick: disconnect }, 'Disconnect'),
      ),
    ),

    // Global search bar
    h('form', { onSubmit: handleSearch, className: 'flex gap-2 mb-3' },
      h('input', {
        type: 'text',
        className: 'flex-1 min-w-0 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-500',
        placeholder: 'Search by task ID (e.g. BB-32592)...',
        value: searchQuery,
        onChange: e => setSearchQuery(e.target.value),
      }),
      h('button', {
        type: 'submit',
        className: 'px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded text-xs disabled:opacity-40 flex-shrink-0',
        disabled: searching || !searchQuery.trim(),
      }, searching ? 'Searching...' : 'Search'),
    ),

    // Search result
    searchResult && h('div', { className: 'mb-3 p-2 bg-slate-800 border border-violet-500/30 rounded text-xs' },
      h('div', { className: 'flex items-center justify-between' },
        h('div', null,
          h('div', { className: 'flex items-center gap-2' },
            searchResult.custom_id && h('span', { className: 'text-xs font-mono bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded' }, searchResult.custom_id),
            h('span', { className: 'text-white font-medium' }, searchResult.name),
          ),
          h('div', { className: 'text-xs text-slate-400 mt-1' },
            `Status: ${searchResult.status?.status || '?'}`,
            searchResult.list?.name && ` \u2022 List: ${searchResult.list.name}`,
            searchResult.folder?.name && ` \u2022 Folder: ${searchResult.folder.name}`,
          ),
        ),
        h('div', { className: 'flex gap-2' },
          h('button', {
            className: 'px-3 py-1 bg-violet-600 text-white rounded text-sm',
            onClick: () => pullSingle(searchResult.id),
            disabled: pulling,
          }, 'Pull'),
          h('button', {
            className: 'px-2 py-1 text-slate-400 hover:text-white text-sm',
            onClick: () => setSearchResult(null),
          }, '\u00D7'),
        ),
      ),
    ),

    // Favorites bar
    favorites.length > 0 && h('div', { className: 'mb-4' },
      h('div', { className: 'text-xs text-slate-500 uppercase tracking-wide mb-1' }, 'Favorites'),
      h('div', { className: 'flex flex-wrap gap-2' },
        ...favorites.map(fav =>
          h('button', {
            key: fav.id,
            className: 'flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-sm text-slate-200 transition-colors',
            onClick: () => navigateToFavorite(fav),
          },
            h('span', null, LEVEL_ICONS[fav.type] || '\u2B50'),
            h('span', null, fav.name),
            h('span', {
              className: 'text-slate-500 hover:text-red-400 ml-1',
              onClick: (e) => { e.stopPropagation(); toggleFavorite(fav); },
            }, '\u00D7'),
          ),
        ),
      ),
    ),

    // Breadcrumb
    h('div', { className: 'flex items-center gap-1 text-sm text-slate-400 mb-4 flex-wrap' },
      h('span', { className: 'cursor-pointer hover:text-white', onClick: () => goToBreadcrumb(-1) }, 'Home'),
      ...breadcrumb.flatMap((bc, idx) => [
        h('span', { key: `sep-${idx}` }, ' \u203A '),
        h('span', { key: `bc-${idx}`, className: 'cursor-pointer hover:text-white', onClick: () => goToBreadcrumb(idx) }, bc.name),
      ]),
    ),

    // Filter bar
    (() => {
      const hasActiveFilters = filter || Object.values(fieldFilters).some(v => v);
      return h('div', { className: 'flex gap-1.5 mb-3 flex-wrap items-center' },
        h('input', {
          type: 'text',
          className: 'flex-1 min-w-[120px] px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-500',
          placeholder: currentLevel === 'tasks' ? 'Filter by name or ID...' : 'Filter by name...',
          value: filter,
          onChange: e => setFilter(e.target.value),
        }),
        // Custom field filter dropdowns (only for tasks level)
        ...customFields
          .filter(f => f.type === 'drop_down' || f.type === 'labels')
          .map(field =>
            h('select', {
              key: field.id,
              className: `px-2 py-1.5 bg-slate-800 border rounded text-xs max-w-[140px] truncate ${fieldFilters[field.id] ? 'border-violet-500 text-violet-300' : 'border-slate-700 text-slate-300'}`,
              value: fieldFilters[field.id] || '',
              onChange: e => setFieldFilters(prev => ({ ...prev, [field.id]: e.target.value })),
            },
              h('option', { value: '' }, field.name),
              ...(field.type_config?.options || []).map(opt => {
                const optName = opt.label || opt.name; // labels use 'label', dropdowns use 'name'
                return h('option', { key: opt.id || optName, value: optName }, optName);
              }),
            ),
          ),
        hasActiveFilters && h('button', {
          className: 'px-2 py-2 text-xs text-slate-400 hover:text-white',
          onClick: () => { setFilter(''); setFieldFilters({}); },
        }, 'Reset'),
      );
    })(),

    // Error
    errorMsg && h('div', { className: 'mb-3 p-2 bg-red-900/50 border border-red-700 rounded text-sm text-red-300' }, errorMsg),

    // Pull results
    pullResults.length > 0 && h('div', { className: 'mb-3 p-3 bg-emerald-900/30 border border-emerald-700/50 rounded text-sm space-y-1' },
      ...pullResults.map((r, i) => {
        const route = r.phase === 'development' ? 'dev' : 'product';
        return h('div', { key: i, className: 'flex items-center gap-2' },
          h('span', { className: 'text-emerald-400' }, r.isNew ? '\u2713 Created' : '\u2713 Updated'),
          h('a', { href: `#/${route}/${r.slug}`, className: 'text-violet-400 hover:text-violet-300 underline' }, r.name || r.slug),
          h('span', { className: 'text-slate-500 text-xs' }, `(${r.writtenFiles?.length || 0} files \u2192 ${route})`),
        );
      }),
    ),

    // Home view
    currentLevel === 'home' && items.length === 0 && !isLoading && h('div', { className: 'text-center py-8' },
      h('p', { className: 'text-slate-400 mb-4' }, 'Use the search bar to find tasks by ID, or browse your workspace.'),
      h('button', {
        className: 'px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded text-sm',
        onClick: () => loadLevel('workspaces', null),
      }, 'Browse Workspaces'),
    ),

    // Content
    currentLevel !== 'home' && h('div', { className: 'flex gap-3' },
      // Item list
      h('div', { className: 'flex-1 min-w-0 max-h-[70vh] overflow-y-auto' },
        isLoading
          ? h('div', { className: 'text-slate-500 text-sm py-4' }, 'Loading...')
          : filteredItems.length === 0
            ? h('div', { className: 'text-slate-500 text-sm py-4' }, 'No items found.')
            : currentLevel === 'tasks'
              // ─── Task list grouped by status ────────────────
              ? (() => {
                  const groups = {};
                  for (const item of filteredItems) {
                    const st = item.status || 'No status';
                    if (!groups[st]) groups[st] = [];
                    groups[st].push(item);
                  }
                  return h('div', { className: 'space-y-3' },
                    ...Object.entries(groups).map(([status, tasks]) => {
                      const collapsed = collapsedGroups[status];
                      return h('div', { key: status },
                        // Status group header (clickable to collapse)
                        h('div', {
                          className: 'flex items-center gap-2 mb-1 cursor-pointer select-none',
                          onClick: () => setCollapsedGroups(prev => ({ ...prev, [status]: !prev[status] })),
                        },
                          h('span', { className: 'text-xs text-slate-500 w-3' }, collapsed ? '\u25B6' : '\u25BC'),
                          h('span', { className: `text-xs font-medium px-2 py-0.5 rounded border ${statusColor(status)}` }, status),
                          h('span', { className: 'text-xs text-slate-500' }, `${tasks.length}`),
                          h('div', { className: 'flex-1 h-px bg-slate-800' }),
                        ),
                        // Tasks in this group (hidden when collapsed)
                        !collapsed && h('div', { className: 'space-y-1 ml-5' },
                          ...tasks.map(item => {
                            const priorityFields = (item.custom_fields || [])
                              .filter(cf => PRIORITY_FIELDS.includes(cf.name?.toLowerCase()) && cf.value != null && cf.value !== '');
                            return h('div', {
                              key: item.id,
                              className: `flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer hover:bg-slate-800 ${preview?.id === item.id ? 'bg-violet-500/10 border border-violet-500/30' : selectedItems.has(item.id) ? 'bg-slate-800/80 border border-aia-accent' : 'border border-transparent'}`,
                            },
                              h('input', {
                                type: 'checkbox',
                                checked: selectedItems.has(item.id),
                                onChange: () => toggleSelect(item.id),
                                onClick: e => e.stopPropagation(),
                                className: 'flex-shrink-0',
                              }),
                              h('div', {
                                className: 'flex-1 min-w-0',
                                onClick: () => previewTask(item.id),
                              },
                                // Row 1: ID + name + assignees
                                h('div', { className: 'flex items-center gap-2' },
                                  item.custom_id && h('span', { className: 'text-xs font-mono text-violet-400 bg-violet-500/10 px-1 rounded flex-shrink-0' }, item.custom_id),
                                  h('span', { className: 'text-white text-xs truncate max-w-[300px]' }, item.name),
                                  // Assignees
                                  item.assignees?.length > 0 && h('div', { className: 'flex -space-x-1 ml-auto flex-shrink-0' },
                                    ...item.assignees.slice(0, 3).map(a =>
                                      a.profilePicture
                                        ? h('img', {
                                            key: a.id,
                                            src: a.profilePicture,
                                            className: 'w-5 h-5 rounded-full border border-slate-900',
                                            title: a.username || a.email,
                                          })
                                        : h('div', {
                                            key: a.id || a.username,
                                            className: 'w-5 h-5 rounded-full bg-slate-600 border border-slate-900 flex items-center justify-center text-[9px] text-slate-300',
                                            title: a.username || a.email,
                                          }, (a.initials || (a.username || a.email || '?')[0]).toUpperCase()),
                                    ),
                                    item.assignees.length > 3 && h('div', {
                                      className: 'w-5 h-5 rounded-full bg-slate-700 border border-slate-900 flex items-center justify-center text-[9px] text-slate-400',
                                    }, `+${item.assignees.length - 3}`),
                                  ),
                                ),
                                // Row 2: Priority custom fields as tags
                                priorityFields.length > 0 && h('div', { className: 'flex gap-1 mt-1 flex-wrap' },
                                  ...priorityFields.map(cf => {
                                    const val = getFieldDisplay(cf);
                                    if (!val) return null;
                                    if (val.labels) {
                                      return val.labels.map(lb =>
                                        h('span', {
                                          key: `${cf.id}-${lb.name}`,
                                          className: 'text-[10px] px-1.5 py-0.5 rounded',
                                          style: lb.color ? { backgroundColor: lb.color + '22', color: lb.color, border: `1px solid ${lb.color}44` } : {},
                                        }, lb.name),
                                      );
                                    }
                                    return h('span', {
                                      key: cf.id,
                                      className: 'text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400',
                                      style: val.color ? { backgroundColor: val.color + '22', color: val.color, border: `1px solid ${val.color}44` } : {},
                                    }, val.label);
                                  }),
                                ),
                              ),
                            );
                          }),
                        ),
                      );
                    }),
                    // Load more button
                    hasMoreTasks && h('div', { className: 'text-center pt-3' },
                      h('button', {
                        className: 'px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm',
                        onClick: loadMoreTasks,
                        disabled: loadingMore,
                      }, loadingMore ? 'Loading...' : 'Load more tasks'),
                    ),
                  );
                })()
              // ─── Non-task items (spaces, folders, lists) ────
              : h('div', { className: 'space-y-1' },
                  ...filteredItems.map(item => {
                    const canFav = item.type === 'space' || item.type === 'folder' || item.type === 'list';
                    return h('div', {
                      key: item.id,
                      className: 'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-slate-800 border border-transparent',
                    },
                      h('span', {
                        className: 'flex-1 flex items-center gap-2',
                        onClick: () => drillDown(item),
                      },
                        h('span', null, LEVEL_ICONS[item.type] || ''),
                        h('span', { className: 'text-white text-sm' }, item.name),
                        item.taskCount != null && h('span', { className: 'text-xs text-slate-500 ml-auto' }, `${item.taskCount} tasks`),
                      ),
                      canFav && h('button', {
                        className: `text-sm ${isFavorite(item.id) ? 'text-yellow-400' : 'text-slate-600 hover:text-yellow-400'}`,
                        onClick: (e) => { e.stopPropagation(); toggleFavorite(item); },
                        title: isFavorite(item.id) ? 'Remove from favorites' : 'Add to favorites',
                      }, '\u2605'),
                    );
                  }),
                ),
      ),

      // Preview panel
      preview && h('div', { className: 'w-72 bg-slate-800 rounded p-3 border border-slate-700 flex-shrink-0 max-h-[70vh] overflow-y-auto text-xs' },
        preview.error
          ? h('div', { className: 'text-red-400 text-sm' }, preview.error)
          : h('div', { className: 'space-y-2' },
            h('div', { className: 'flex items-center justify-between' },
              h('h3', { className: 'text-white font-bold' }, preview.name),
              h('button', { className: 'text-slate-500 hover:text-white', onClick: () => setPreview(null) }, '\u00D7'),
            ),
            preview.custom_id && h('div', { className: 'text-xs font-mono text-violet-400' }, preview.custom_id),
            h('div', { className: `inline-block text-xs px-2 py-0.5 rounded border ${statusColor(preview.status?.status)}` }, preview.status?.status || 'unknown'),
            // Assignees with avatars
            preview.assignees?.length > 0 && h('div', { className: 'flex items-center gap-2 flex-wrap' },
              ...preview.assignees.map(a =>
                h('div', { key: a.id || a.username, className: 'flex items-center gap-1' },
                  a.profilePicture
                    ? h('img', { src: a.profilePicture, className: 'w-5 h-5 rounded-full' })
                    : h('div', { className: 'w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center text-[9px] text-slate-300' },
                        (a.initials || (a.username || '?')[0]).toUpperCase()),
                  h('span', { className: 'text-xs text-slate-300' }, a.username || a.email),
                ),
              ),
            ),
            preview.tags?.length > 0 && h('div', { className: 'flex gap-1 flex-wrap' },
              ...preview.tags.map(t => h('span', { key: t.name, className: 'text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded' }, t.name)),
            ),
            // Custom fields
            preview.custom_fields?.filter(cf => cf.value != null && cf.value !== '').length > 0 &&
              h('div', { className: 'border-t border-slate-700 pt-2 mt-2 space-y-1' },
                h('div', { className: 'text-xs text-slate-500 mb-1' }, 'Custom Fields'),
                ...preview.custom_fields.filter(cf => cf.value != null && cf.value !== '').map(cf => {
                  const val = getFieldDisplay(cf);
                  if (!val) return null;
                  return h('div', { key: cf.id, className: 'flex justify-between text-xs items-center' },
                    h('span', { className: 'text-slate-400' }, cf.name),
                    val.labels
                      ? h('div', { className: 'flex gap-1' }, ...val.labels.map(lb =>
                          h('span', { key: lb.name, className: 'px-1 py-0.5 rounded text-[10px]',
                            style: lb.color ? { backgroundColor: lb.color + '22', color: lb.color } : {},
                          }, lb.name),
                        ))
                      : h('span', { className: 'text-slate-200',
                          style: val.color ? { color: val.color } : {},
                        }, val.label),
                  );
                }),
              ),
            preview.description && h('div', { className: 'text-xs text-slate-500 mt-2 max-h-40 overflow-y-auto border-t border-slate-700 pt-2' },
              preview.description.substring(0, 500) + (preview.description.length > 500 ? '...' : '')),
            h('button', {
              className: 'w-full mt-3 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded text-sm',
              onClick: () => pullSingle(preview.id),
              disabled: pulling,
            }, 'Pull this task'),
          ),
      ),
    ),
  );
}
