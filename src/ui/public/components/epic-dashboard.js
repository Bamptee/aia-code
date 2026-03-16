/**
 * @fileoverview Epic Dashboard - Main view for Epic & Story management
 * Professional, scalable UI inspired by Asana
 */

import React from 'react';
import { api } from '/main.js';

// Status configurations
const EPIC_STATUS = {
  discovery: { label: 'Discovery', icon: '\uD83D\uDD0D', color: 'slate' },
  planning: { label: 'Planning', icon: '\uD83D\uDCDD', color: 'violet' },
  in_progress: { label: 'In Progress', icon: '\uD83D\uDEA7', color: 'amber' },
  testing: { label: 'Testing', icon: '\uD83E\uDDEA', color: 'sky' },
  done: { label: 'Done', icon: '\u2705', color: 'emerald' },
};

const STORY_STATUS = {
  draft: { label: 'Draft', color: 'slate' },
  ready_for_dev: { label: 'Ready for Dev', color: 'violet' },
  in_progress: { label: 'In Progress', color: 'amber' },
  testing: { label: 'Testing', color: 'sky' },
  done: { label: 'Done', color: 'emerald' },
};

const STORY_TYPE = {
  feature: { label: 'Feature', icon: '\u2728', color: 'emerald' },
  bug: { label: 'Bug', icon: '\uD83D\uDC1B', color: 'red' },
};

// LocalStorage persistence
const STORAGE_KEYS = {
  VIEW_MODE: 'aia-epic-view-mode',
  SHOW_ARCHIVED: 'aia-epic-show-archived',
  SPACE_FILTER: 'aia-epic-space-filter',
};

function loadFromStorage(key, defaultValue) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// ============== Utility Components ==============

function StatusBadge({ status, type = 'epic', size = 'sm' }) {
  const config = type === 'epic' ? EPIC_STATUS[status] : STORY_STATUS[status];
  if (!config) return null;

  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-xs'
    : 'px-3 py-1 text-sm';

  return React.createElement('span', {
    className: `inline-flex items-center gap-1 ${sizeClasses} rounded-full border bg-${config.color}-500/20 text-${config.color}-400 border-${config.color}-500/30`,
  },
    type === 'epic' && config.icon,
    config.label
  );
}

function TypeBadge({ type, size = 'sm' }) {
  const config = STORY_TYPE[type] || STORY_TYPE.feature;
  const sizeClasses = size === 'sm'
    ? 'px-1.5 py-0.5 text-xs'
    : 'px-2 py-1 text-sm';

  return React.createElement('span', {
    className: `inline-flex items-center gap-1 ${sizeClasses} rounded border bg-${config.color}-500/20 text-${config.color}-400 border-${config.color}-500/30`,
  }, config.icon, config.label);
}

function ProgressBar({ progress, size = 'sm' }) {
  const heightClass = size === 'sm' ? 'h-1.5' : 'h-2';
  return React.createElement('div', { className: `${heightClass} bg-slate-700 rounded-full overflow-hidden` },
    React.createElement('div', {
      className: `${heightClass} bg-aia-accent rounded-full transition-all duration-300`,
      style: { width: `${progress}%` },
    })
  );
}

function EmptyState({ icon, title, description, action }) {
  return React.createElement('div', { className: 'text-center py-12' },
    React.createElement('span', { className: 'text-4xl block mb-3' }, icon),
    React.createElement('h3', { className: 'text-lg font-medium text-slate-300 mb-1' }, title),
    React.createElement('p', { className: 'text-sm text-slate-500 mb-4' }, description),
    action
  );
}

function LoadingSpinner({ text = 'Loading...' }) {
  return React.createElement('div', { className: 'flex items-center justify-center py-12 gap-3' },
    React.createElement('div', { className: 'w-5 h-5 border-2 border-slate-600 border-t-aia-accent rounded-full animate-spin' }),
    React.createElement('span', { className: 'text-slate-400' }, text)
  );
}

// ============== Epic Card ==============

function EpicCard({ epic, onClick, onStatusChange }) {
  const statusConfig = EPIC_STATUS[epic.status] || EPIC_STATUS.discovery;
  const storyCount = epic.stories?.length || 0;
  const doneCount = (epic.stories || []).filter(s => s.status === 'done').length;
  const progress = storyCount > 0 ? Math.round((doneCount / storyCount) * 100) : 0;

  return React.createElement('div', {
    className: `bg-aia-card border border-aia-border rounded-lg p-4 hover:border-aia-accent/50 transition-all cursor-pointer ${epic.isArchived ? 'opacity-60' : ''}`,
    onClick: () => onClick(epic),
  },
    // Header
    React.createElement('div', { className: 'flex items-start justify-between mb-3' },
      React.createElement('div', { className: 'flex items-center gap-2' },
        epic.isGeneral && React.createElement('span', {
          className: 'text-sm bg-slate-700 px-2 py-0.5 rounded text-slate-400',
        }, '\uD83D\uDCC1 System'),
        React.createElement(StatusBadge, { status: epic.status, type: 'epic' }),
      ),
      epic.plannedPeriod && React.createElement('span', {
        className: 'text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded',
      }, epic.plannedPeriod)
    ),

    // Title
    React.createElement('h3', {
      className: `font-semibold text-slate-100 mb-2 ${epic.isArchived ? 'line-through text-slate-500' : ''}`,
    }, epic.name),

    // Description preview
    epic.description && React.createElement('p', {
      className: 'text-sm text-slate-400 mb-3 line-clamp-2',
    }, epic.description),

    // Progress
    React.createElement('div', { className: 'mb-3' },
      React.createElement('div', { className: 'flex justify-between text-xs text-slate-500 mb-1' },
        React.createElement('span', null, `${doneCount}/${storyCount} stories`),
        React.createElement('span', null, `${progress}%`)
      ),
      React.createElement(ProgressBar, { progress })
    ),

    // Footer
    React.createElement('div', { className: 'flex items-center justify-between text-xs' },
      React.createElement('span', { className: 'text-slate-500' },
        new Date(epic.updatedAt || epic.createdAt).toLocaleDateString()
      ),
      epic.isArchived && React.createElement('span', {
        className: 'bg-slate-700 text-slate-400 px-2 py-0.5 rounded',
      }, 'Archived')
    )
  );
}

// ============== Story Row ==============

function StoryRow({ story, onClick, onStatusChange }) {
  const typeConfig = STORY_TYPE[story.type] || STORY_TYPE.feature;
  const statusConfig = STORY_STATUS[story.status] || STORY_STATUS.draft;

  // Step progress
  const steps = story.steps || {};
  const stepKeys = ['brief', 'baSpec', 'questions'];
  const completedSteps = stepKeys.filter(k => steps[k]?.completed || steps[k]?.skipped).length;

  return React.createElement('div', {
    className: 'flex items-center gap-4 p-3 hover:bg-slate-800/50 rounded-lg cursor-pointer transition-colors',
    onClick: () => onClick(story),
  },
    // Type icon
    React.createElement('span', {
      className: `text-lg ${typeConfig.color === 'emerald' ? 'text-emerald-400' : 'text-red-400'}`,
    }, typeConfig.icon),

    // Content
    React.createElement('div', { className: 'flex-1 min-w-0' },
      React.createElement('div', { className: 'flex items-center gap-2 mb-0.5' },
        React.createElement('h4', { className: 'font-medium text-slate-200 truncate' }, story.title),
        story.space === 'experimentation' && React.createElement('span', {
          className: 'text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded',
        }, 'Experimentation')
      ),
      React.createElement('div', { className: 'flex items-center gap-3 text-xs text-slate-500' },
        React.createElement('span', null, story.epicName),
        React.createElement('span', null, `${completedSteps}/3 steps`),
      )
    ),

    // Status
    React.createElement('div', { className: 'flex items-center gap-2' },
      React.createElement(StatusBadge, { status: story.status, type: 'story' }),
    )
  );
}

// ============== Create Epic Modal ==============

function CreateEpicModal({ onClose, onCreated }) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [status, setStatus] = React.useState('discovery');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const epic = await api.post('/epics', {
        name: name.trim(),
        description: description.trim() || undefined,
        status,
      });
      onCreated(epic);
      onClose();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return React.createElement('div', {
    className: 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4',
    onClick: (e) => e.target === e.currentTarget && onClose(),
  },
    React.createElement('form', {
      className: 'bg-aia-card border border-aia-border rounded-xl w-full max-w-lg',
      onSubmit: handleSubmit,
    },
      // Header
      React.createElement('div', { className: 'flex items-center justify-between p-4 border-b border-aia-border' },
        React.createElement('h2', { className: 'text-lg font-semibold text-slate-100' }, '\uD83D\uDCCB Create New Epic'),
        React.createElement('button', {
          type: 'button',
          onClick: onClose,
          className: 'text-slate-400 hover:text-slate-200 p-1',
        }, '\u2715')
      ),

      // Body
      React.createElement('div', { className: 'p-4 space-y-4' },
        // Name
        React.createElement('div', null,
          React.createElement('label', { className: 'block text-sm text-slate-400 mb-1' }, 'Name *'),
          React.createElement('input', {
            type: 'text',
            value: name,
            onChange: (e) => setName(e.target.value),
            placeholder: 'Epic name',
            autoFocus: true,
            className: 'w-full bg-slate-900 border border-aia-border rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:border-aia-accent focus:outline-none',
          })
        ),

        // Description
        React.createElement('div', null,
          React.createElement('label', { className: 'block text-sm text-slate-400 mb-1' }, 'Description'),
          React.createElement('textarea', {
            value: description,
            onChange: (e) => setDescription(e.target.value),
            placeholder: 'Brief description of this epic...',
            rows: 3,
            className: 'w-full bg-slate-900 border border-aia-border rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:border-aia-accent focus:outline-none resize-none',
          })
        ),

        // Status
        React.createElement('div', null,
          React.createElement('label', { className: 'block text-sm text-slate-400 mb-2' }, 'Initial Status'),
          React.createElement('div', { className: 'flex flex-wrap gap-2' },
            ...Object.entries(EPIC_STATUS).map(([key, config]) =>
              React.createElement('button', {
                key,
                type: 'button',
                onClick: () => setStatus(key),
                className: `px-3 py-1.5 rounded-lg text-sm transition-all ${
                  status === key
                    ? `bg-${config.color}-500/20 text-${config.color}-400 border border-${config.color}-500/30`
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                }`,
              }, `${config.icon} ${config.label}`)
            )
          )
        ),

        // Error
        error && React.createElement('p', { className: 'text-red-400 text-sm' }, error)
      ),

      // Footer
      React.createElement('div', { className: 'flex justify-end gap-3 p-4 border-t border-aia-border' },
        React.createElement('button', {
          type: 'button',
          onClick: onClose,
          className: 'px-4 py-2 text-sm text-slate-400 hover:text-slate-200',
        }, 'Cancel'),
        React.createElement('button', {
          type: 'submit',
          disabled: loading,
          className: 'px-4 py-2 bg-aia-accent text-slate-900 rounded-lg text-sm font-medium hover:bg-aia-accent/90 disabled:opacity-50',
        }, loading ? 'Creating...' : 'Create Epic')
      )
    )
  );
}

// ============== Create Story Modal ==============

function CreateStoryModal({ epics, defaultEpicId, onClose, onCreated }) {
  const [title, setTitle] = React.useState('');
  const [type, setType] = React.useState('feature');
  const [epicId, setEpicId] = React.useState(defaultEpicId || '');
  const [description, setDescription] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!epicId) {
      setError('Please select an Epic');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const story = await api.post(`/epics/${epicId}/stories`, {
        title: title.trim(),
        type,
        description: description.trim() || undefined,
      });
      onCreated(story);
      onClose();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return React.createElement('div', {
    className: 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4',
    onClick: (e) => e.target === e.currentTarget && onClose(),
  },
    React.createElement('form', {
      className: 'bg-aia-card border border-aia-border rounded-xl w-full max-w-lg',
      onSubmit: handleSubmit,
    },
      // Header
      React.createElement('div', { className: 'flex items-center justify-between p-4 border-b border-aia-border' },
        React.createElement('h2', { className: 'text-lg font-semibold text-slate-100' },
          type === 'bug' ? '\uD83D\uDC1B Report Bug' : '\u2728 Create Story'
        ),
        React.createElement('button', {
          type: 'button',
          onClick: onClose,
          className: 'text-slate-400 hover:text-slate-200 p-1',
        }, '\u2715')
      ),

      // Body
      React.createElement('div', { className: 'p-4 space-y-4' },
        // Type selection
        React.createElement('div', { className: 'flex gap-3' },
          React.createElement('button', {
            type: 'button',
            onClick: () => setType('feature'),
            className: `flex-1 p-3 rounded-lg border-2 text-center transition-all ${
              type === 'feature'
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-slate-600 hover:border-slate-500'
            }`,
          },
            React.createElement('span', { className: 'text-2xl block mb-1' }, '\u2728'),
            React.createElement('span', { className: 'text-sm font-medium' }, 'Feature')
          ),
          React.createElement('button', {
            type: 'button',
            onClick: () => setType('bug'),
            className: `flex-1 p-3 rounded-lg border-2 text-center transition-all ${
              type === 'bug'
                ? 'border-red-500 bg-red-500/10'
                : 'border-slate-600 hover:border-slate-500'
            }`,
          },
            React.createElement('span', { className: 'text-2xl block mb-1' }, '\uD83D\uDC1B'),
            React.createElement('span', { className: 'text-sm font-medium' }, 'Bug')
          )
        ),

        // Epic selection
        React.createElement('div', null,
          React.createElement('label', { className: 'block text-sm text-slate-400 mb-1' }, 'Epic *'),
          React.createElement('select', {
            value: epicId,
            onChange: (e) => setEpicId(e.target.value),
            className: 'w-full bg-slate-900 border border-aia-border rounded-lg px-3 py-2 text-slate-200 focus:border-aia-accent focus:outline-none',
          },
            React.createElement('option', { value: '' }, 'Select an Epic...'),
            ...epics.filter(e => !e.isArchived).map(epic =>
              React.createElement('option', { key: epic.id, value: epic.id },
                `${epic.isGeneral ? '\uD83D\uDCC1 ' : ''}${epic.name}`
              )
            )
          )
        ),

        // Title
        React.createElement('div', null,
          React.createElement('label', { className: 'block text-sm text-slate-400 mb-1' }, 'Title *'),
          React.createElement('input', {
            type: 'text',
            value: title,
            onChange: (e) => setTitle(e.target.value),
            placeholder: type === 'bug' ? 'Describe the bug...' : 'Story title',
            className: 'w-full bg-slate-900 border border-aia-border rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:border-aia-accent focus:outline-none',
          })
        ),

        // Description
        React.createElement('div', null,
          React.createElement('label', { className: 'block text-sm text-slate-400 mb-1' }, 'Description'),
          React.createElement('textarea', {
            value: description,
            onChange: (e) => setDescription(e.target.value),
            placeholder: 'Additional details...',
            rows: 3,
            className: 'w-full bg-slate-900 border border-aia-border rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:border-aia-accent focus:outline-none resize-none',
          })
        ),

        // Error
        error && React.createElement('p', { className: 'text-red-400 text-sm' }, error)
      ),

      // Footer
      React.createElement('div', { className: 'flex justify-end gap-3 p-4 border-t border-aia-border' },
        React.createElement('button', {
          type: 'button',
          onClick: onClose,
          className: 'px-4 py-2 text-sm text-slate-400 hover:text-slate-200',
        }, 'Cancel'),
        React.createElement('button', {
          type: 'submit',
          disabled: loading,
          className: 'px-4 py-2 bg-aia-accent text-slate-900 rounded-lg text-sm font-medium hover:bg-aia-accent/90 disabled:opacity-50',
        }, loading ? 'Creating...' : (type === 'bug' ? 'Report Bug' : 'Create Story'))
      )
    )
  );
}

// ============== Stats Cards ==============

function StatsCard({ icon, value, label, subLabel, color = 'aia-accent' }) {
  return React.createElement('div', {
    className: 'bg-aia-card border border-aia-border rounded-lg p-4',
  },
    React.createElement('div', { className: 'flex items-center gap-3' },
      React.createElement('span', { className: 'text-2xl' }, icon),
      React.createElement('div', null,
        React.createElement('div', { className: `text-2xl font-bold text-${color}` }, value),
        React.createElement('div', { className: 'text-sm text-slate-400' }, label),
        subLabel && React.createElement('div', { className: 'text-xs text-slate-500' }, subLabel)
      )
    )
  );
}

// ============== Main Dashboard ==============

export function EpicDashboard() {
  const [epics, setEpics] = React.useState([]);
  const [stories, setStories] = React.useState([]);
  const [epicStats, setEpicStats] = React.useState(null);
  const [storyStats, setStoryStats] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const [viewMode, setViewMode] = React.useState(() => loadFromStorage(STORAGE_KEYS.VIEW_MODE, 'epics'));
  const [showArchived, setShowArchived] = React.useState(() => loadFromStorage(STORAGE_KEYS.SHOW_ARCHIVED, false));
  const [spaceFilter, setSpaceFilter] = React.useState(() => loadFromStorage(STORAGE_KEYS.SPACE_FILTER, 'all'));

  const [showCreateEpic, setShowCreateEpic] = React.useState(false);
  const [showCreateStory, setShowCreateStory] = React.useState(false);
  const [selectedEpicForStory, setSelectedEpicForStory] = React.useState(null);

  // Persist preferences
  React.useEffect(() => { saveToStorage(STORAGE_KEYS.VIEW_MODE, viewMode); }, [viewMode]);
  React.useEffect(() => { saveToStorage(STORAGE_KEYS.SHOW_ARCHIVED, showArchived); }, [showArchived]);
  React.useEffect(() => { saveToStorage(STORAGE_KEYS.SPACE_FILTER, spaceFilter); }, [spaceFilter]);

  // Load data
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [epicsData, storiesData, epicStatsData, storyStatsData] = await Promise.all([
        api.get(`/epics?includeArchived=${showArchived}`),
        api.get('/stories'),
        api.get('/epics/stats'),
        api.get('/stories/stats'),
      ]);
      setEpics(epicsData);
      setStories(storiesData);
      setEpicStats(epicStatsData);
      setStoryStats(storyStatsData);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  React.useEffect(() => { loadData(); }, [showArchived]);

  // Filter stories
  const filteredStories = React.useMemo(() => {
    if (spaceFilter === 'all') return stories;
    return stories.filter(s => s.space === spaceFilter);
  }, [stories, spaceFilter]);

  // Navigate to Epic detail
  const handleEpicClick = (epic) => {
    window.location.hash = `#/epics/${epic.id}`;
  };

  // Navigate to Story detail
  const handleStoryClick = (story) => {
    window.location.hash = `#/stories/${story.id}`;
  };

  // Handlers
  const handleEpicCreated = () => {
    loadData();
  };

  const handleStoryCreated = () => {
    loadData();
    setSelectedEpicForStory(null);
  };

  const openCreateStory = (epicId = null) => {
    setSelectedEpicForStory(epicId);
    setShowCreateStory(true);
  };

  if (loading) {
    return React.createElement(LoadingSpinner, { text: 'Loading epics...' });
  }

  if (error) {
    return React.createElement('div', { className: 'text-center py-12' },
      React.createElement('p', { className: 'text-red-400 mb-4' }, `Error: ${error}`),
      React.createElement('button', {
        onClick: loadData,
        className: 'px-4 py-2 bg-aia-accent/20 text-aia-accent rounded-lg hover:bg-aia-accent/30',
      }, 'Retry')
    );
  }

  return React.createElement('div', { className: 'space-y-6' },
    // Header
    React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'text-2xl font-bold text-slate-100' }, 'Epic Dashboard'),
        React.createElement('p', { className: 'text-sm text-slate-400' }, 'Manage your epics and stories')
      ),
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('button', {
          onClick: () => openCreateStory(),
          className: 'px-3 py-2 bg-slate-800 text-slate-300 border border-slate-700 rounded-lg text-sm hover:border-slate-600',
        }, '+ Story'),
        React.createElement('button', {
          onClick: () => setShowCreateEpic(true),
          className: 'px-3 py-2 bg-aia-accent text-slate-900 rounded-lg text-sm font-medium hover:bg-aia-accent/90',
        }, '+ Epic')
      )
    ),

    // Stats
    React.createElement('div', { className: 'grid grid-cols-2 md:grid-cols-4 gap-4' },
      React.createElement(StatsCard, {
        icon: '\uD83D\uDCCB',
        value: epicStats?.active || 0,
        label: 'Active Epics',
        subLabel: epicStats?.archived ? `${epicStats.archived} archived` : null,
      }),
      React.createElement(StatsCard, {
        icon: '\uD83D\uDCDD',
        value: storyStats?.total || 0,
        label: 'Total Stories',
        subLabel: `${storyStats?.byStatus?.done || 0} completed`,
      }),
      React.createElement(StatsCard, {
        icon: '\uD83D\uDE80',
        value: storyStats?.bySpace?.development || 0,
        label: 'In Development',
        color: 'violet-400',
      }),
      React.createElement(StatsCard, {
        icon: '\uD83E\uDDEA',
        value: storyStats?.bySpace?.experimentation || 0,
        label: 'In Experimentation',
        color: 'purple-400',
      })
    ),

    // View Toggle + Filters
    React.createElement('div', { className: 'flex items-center justify-between flex-wrap gap-4' },
      // View mode tabs
      React.createElement('div', { className: 'flex border border-aia-border rounded-lg overflow-hidden' },
        React.createElement('button', {
          onClick: () => setViewMode('epics'),
          className: `px-4 py-2 text-sm ${viewMode === 'epics' ? 'bg-aia-accent/20 text-aia-accent' : 'text-slate-400 hover:bg-slate-800'}`,
        }, '\uD83D\uDCCB Epics'),
        React.createElement('button', {
          onClick: () => setViewMode('stories'),
          className: `px-4 py-2 text-sm ${viewMode === 'stories' ? 'bg-aia-accent/20 text-aia-accent' : 'text-slate-400 hover:bg-slate-800'}`,
        }, '\uD83D\uDCDD Stories')
      ),

      // Filters
      React.createElement('div', { className: 'flex items-center gap-4' },
        // Space filter (for stories view)
        viewMode === 'stories' && React.createElement('div', { className: 'flex gap-1' },
          React.createElement('button', {
            onClick: () => setSpaceFilter('all'),
            className: `px-3 py-1.5 text-xs rounded ${spaceFilter === 'all' ? 'bg-aia-accent/20 text-aia-accent' : 'text-slate-400 hover:bg-slate-800'}`,
          }, 'All'),
          React.createElement('button', {
            onClick: () => setSpaceFilter('experimentation'),
            className: `px-3 py-1.5 text-xs rounded ${spaceFilter === 'experimentation' ? 'bg-purple-500/20 text-purple-400' : 'text-slate-400 hover:bg-slate-800'}`,
          }, 'Experimentation'),
          React.createElement('button', {
            onClick: () => setSpaceFilter('development'),
            className: `px-3 py-1.5 text-xs rounded ${spaceFilter === 'development' ? 'bg-violet-500/20 text-violet-400' : 'text-slate-400 hover:bg-slate-800'}`,
          }, 'Development')
        ),

        // Show archived toggle
        React.createElement('label', {
          className: 'flex items-center gap-2 text-xs text-slate-400 cursor-pointer',
        },
          React.createElement('input', {
            type: 'checkbox',
            checked: showArchived,
            onChange: (e) => setShowArchived(e.target.checked),
            className: 'w-3.5 h-3.5 rounded border-slate-500 bg-slate-800 text-aia-accent',
          }),
          'Show archived'
        )
      )
    ),

    // Content
    viewMode === 'epics' ? (
      epics.length === 0 ?
        React.createElement(EmptyState, {
          icon: '\uD83D\uDCCB',
          title: 'No Epics Yet',
          description: 'Create your first epic to organize your work',
          action: React.createElement('button', {
            onClick: () => setShowCreateEpic(true),
            className: 'px-4 py-2 bg-aia-accent text-slate-900 rounded-lg text-sm font-medium hover:bg-aia-accent/90',
          }, 'Create Epic')
        }) :
        React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' },
          ...epics.map(epic =>
            React.createElement(EpicCard, {
              key: epic.id,
              epic,
              onClick: handleEpicClick,
            })
          )
        )
    ) : (
      filteredStories.length === 0 ?
        React.createElement(EmptyState, {
          icon: '\uD83D\uDCDD',
          title: 'No Stories Found',
          description: spaceFilter !== 'all' ? 'No stories in this space' : 'Create your first story',
          action: React.createElement('button', {
            onClick: () => openCreateStory(),
            className: 'px-4 py-2 bg-aia-accent text-slate-900 rounded-lg text-sm font-medium hover:bg-aia-accent/90',
          }, 'Create Story')
        }) :
        React.createElement('div', { className: 'bg-aia-card border border-aia-border rounded-lg divide-y divide-aia-border' },
          ...filteredStories.map(story =>
            React.createElement(StoryRow, {
              key: story.id,
              story,
              onClick: handleStoryClick,
            })
          )
        )
    ),

    // Modals
    showCreateEpic && React.createElement(CreateEpicModal, {
      onClose: () => setShowCreateEpic(false),
      onCreated: handleEpicCreated,
    }),

    showCreateStory && React.createElement(CreateStoryModal, {
      epics,
      defaultEpicId: selectedEpicForStory,
      onClose: () => { setShowCreateStory(false); setSelectedEpicForStory(null); },
      onCreated: handleStoryCreated,
    })
  );
}
