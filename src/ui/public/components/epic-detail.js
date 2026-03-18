/**
 * @fileoverview Epic Detail - Detailed view for managing a single Epic
 * Displays stories, allows status changes, and provides story management
 */

import React from 'react';
import { api } from '/main.js';

// Status configurations
const EPIC_STATUS = {
  discovery: { label: 'Discovery', icon: '\uD83D\uDD0D', color: 'slate', bgClass: 'bg-slate-500/20', textClass: 'text-slate-400', borderClass: 'border-slate-500/30' },
  planning: { label: 'Planning', icon: '\uD83D\uDCDD', color: 'violet', bgClass: 'bg-violet-500/20', textClass: 'text-violet-400', borderClass: 'border-violet-500/30' },
  in_progress: { label: 'In Progress', icon: '\uD83D\uDEA7', color: 'amber', bgClass: 'bg-amber-500/20', textClass: 'text-amber-400', borderClass: 'border-amber-500/30' },
  testing: { label: 'Testing', icon: '\uD83E\uDDEA', color: 'sky', bgClass: 'bg-sky-500/20', textClass: 'text-sky-400', borderClass: 'border-sky-500/30' },
  done: { label: 'Done', icon: '\u2705', color: 'emerald', bgClass: 'bg-emerald-500/20', textClass: 'text-emerald-400', borderClass: 'border-emerald-500/30' },
};

const STORY_STATUS = {
  draft: { label: 'Draft', bgClass: 'bg-slate-500/20', textClass: 'text-slate-400', borderClass: 'border-slate-500/30' },
  ready_for_dev: { label: 'Ready', bgClass: 'bg-violet-500/20', textClass: 'text-violet-400', borderClass: 'border-violet-500/30' },
  in_progress: { label: 'In Progress', bgClass: 'bg-amber-500/20', textClass: 'text-amber-400', borderClass: 'border-amber-500/30' },
  testing: { label: 'Testing', bgClass: 'bg-sky-500/20', textClass: 'text-sky-400', borderClass: 'border-sky-500/30' },
  done: { label: 'Done', bgClass: 'bg-emerald-500/20', textClass: 'text-emerald-400', borderClass: 'border-emerald-500/30' },
};

const STORY_TYPE = {
  feature: { label: 'Feature', icon: '\u2728', bgClass: 'bg-emerald-500/20', textClass: 'text-emerald-400', borderClass: 'border-emerald-500/30' },
  bug: { label: 'Bug', icon: '\uD83D\uDC1B', bgClass: 'bg-red-500/20', textClass: 'text-red-400', borderClass: 'border-red-500/30' },
};

// ============== Utility Components ==============

function LoadingSpinner({ text = 'Loading...' }) {
  return React.createElement('div', { className: 'flex items-center justify-center py-12 gap-3' },
    React.createElement('div', { className: 'w-5 h-5 border-2 border-slate-600 border-t-aia-accent rounded-full animate-spin' }),
    React.createElement('span', { className: 'text-slate-400' }, text)
  );
}

function ProgressBar({ progress, showLabel = true }) {
  return React.createElement('div', { className: 'flex items-center gap-3' },
    React.createElement('div', { className: 'flex-1 h-2 bg-slate-700 rounded-full overflow-hidden' },
      React.createElement('div', {
        className: 'h-full bg-aia-accent rounded-full transition-all duration-500',
        style: { width: `${progress}%` },
      })
    ),
    showLabel && React.createElement('span', { className: 'text-sm font-medium text-aia-accent w-12 text-right' }, `${progress}%`)
  );
}

function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, danger = false }) {
  return React.createElement('div', {
    className: 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4',
    onClick: (e) => e.target === e.currentTarget && onCancel(),
  },
    React.createElement('div', { className: 'bg-aia-card border border-aia-border rounded-xl w-full max-w-md p-6' },
      React.createElement('h3', { className: 'text-lg font-semibold text-slate-100 mb-2' }, title),
      React.createElement('p', { className: 'text-sm text-slate-400 mb-6' }, message),
      React.createElement('div', { className: 'flex justify-end gap-3' },
        React.createElement('button', {
          onClick: onCancel,
          className: 'px-4 py-2 text-sm text-slate-400 hover:text-slate-200',
        }, 'Cancel'),
        React.createElement('button', {
          onClick: onConfirm,
          className: `px-4 py-2 rounded-lg text-sm font-medium ${
            danger
              ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
              : 'bg-aia-accent text-slate-900 hover:bg-aia-accent/90'
          }`,
        }, confirmLabel)
      )
    )
  );
}

// ============== Story Card Component ==============

function StoryCard({ story, onStatusChange, onClick, onDelete, onMove }) {
  const [showActions, setShowActions] = React.useState(false);
  const typeConfig = STORY_TYPE[story.type] || STORY_TYPE.feature;
  const statusConfig = STORY_STATUS[story.status] || STORY_STATUS.draft;

  // Calculate step completion
  const steps = story.steps || {};
  const stepKeys = ['init', 'brainstorming', 'specFunc'];
  const completedSteps = stepKeys.filter(k => steps[k]?.completed).length;
  const skippedSteps = stepKeys.filter(k => steps[k]?.skipped).length;

  return React.createElement('div', {
    className: 'group bg-slate-800/50 border border-aia-border rounded-lg p-4 hover:border-aia-accent/30 transition-all cursor-pointer',
    onClick: () => onClick(story),
    onMouseEnter: () => setShowActions(true),
    onMouseLeave: () => setShowActions(false),
  },
    // Header
    React.createElement('div', { className: 'flex items-start justify-between mb-2' },
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('span', {
          className: `inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded border ${typeConfig.bgClass} ${typeConfig.textClass} ${typeConfig.borderClass}`,
        }, typeConfig.icon, typeConfig.label),
        story.space === 'experimentation' && React.createElement('span', {
          className: 'text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/30',
        }, '\uD83D\uDD2C Experiment')
      ),
      React.createElement('span', {
        className: `px-2 py-0.5 text-xs rounded border ${statusConfig.bgClass} ${statusConfig.textClass} ${statusConfig.borderClass}`,
      }, statusConfig.label)
    ),

    // Title
    React.createElement('h4', { className: 'font-medium text-slate-200 mb-2' }, story.title),

    // Description preview
    story.description && React.createElement('p', {
      className: 'text-sm text-slate-500 line-clamp-2 mb-3',
    }, story.description),

    // Step progress
    React.createElement('div', { className: 'flex items-center gap-2 text-xs text-slate-500 mb-3' },
      React.createElement('span', null, `${completedSteps}/3 steps`),
      skippedSteps > 0 && React.createElement('span', { className: 'text-slate-600' }, `(${skippedSteps} skipped)`)
    ),

    // Footer
    React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('span', { className: 'text-xs text-slate-600' },
        new Date(story.updatedAt || story.createdAt).toLocaleDateString()
      ),
      // Quick actions
      showActions && React.createElement('div', {
        className: 'flex gap-1',
        onClick: (e) => e.stopPropagation(),
      },
        story.status !== 'done' && React.createElement('button', {
          onClick: () => onStatusChange(story.id, 'done'),
          className: 'p-1.5 text-xs bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30',
          title: 'Mark as done',
        }, '\u2713'),
        React.createElement('button', {
          onClick: () => onDelete(story.id),
          className: 'p-1.5 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30',
          title: 'Delete',
        }, '\uD83D\uDDD1')
      )
    )
  );
}

// ============== Create Story Modal ==============

function CreateStoryModal({ epicId, onClose, onCreated }) {
  const [title, setTitle] = React.useState('');
  const [type, setType] = React.useState('feature');
  const [description, setDescription] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
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
          type === 'bug' ? '\uD83D\uDC1B Report Bug' : '\u2728 Add Story'
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
              type === 'feature' ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-600 hover:border-slate-500'
            }`,
          },
            React.createElement('span', { className: 'text-2xl block mb-1' }, '\u2728'),
            React.createElement('span', { className: 'text-sm font-medium' }, 'Feature')
          ),
          React.createElement('button', {
            type: 'button',
            onClick: () => setType('bug'),
            className: `flex-1 p-3 rounded-lg border-2 text-center transition-all ${
              type === 'bug' ? 'border-red-500 bg-red-500/10' : 'border-slate-600 hover:border-slate-500'
            }`,
          },
            React.createElement('span', { className: 'text-2xl block mb-1' }, '\uD83D\uDC1B'),
            React.createElement('span', { className: 'text-sm font-medium' }, 'Bug')
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
            placeholder: 'Additional details...',
            rows: 3,
            className: 'w-full bg-slate-900 border border-aia-border rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:border-aia-accent focus:outline-none resize-none',
          })
        ),

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
        }, loading ? 'Creating...' : 'Create')
      )
    )
  );
}

// ============== Edit Epic Modal ==============

function EditEpicModal({ epic, onClose, onSaved }) {
  const [name, setName] = React.useState(epic.name);
  const [description, setDescription] = React.useState(epic.description || '');
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
      const updated = await api.patch(`/epics/${epic.id}`, {
        name: name.trim(),
        description: description.trim() || null,
      });
      onSaved(updated);
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
      React.createElement('div', { className: 'flex items-center justify-between p-4 border-b border-aia-border' },
        React.createElement('h2', { className: 'text-lg font-semibold text-slate-100' }, 'Edit Epic'),
        React.createElement('button', {
          type: 'button',
          onClick: onClose,
          className: 'text-slate-400 hover:text-slate-200 p-1',
        }, '\u2715')
      ),

      React.createElement('div', { className: 'p-4 space-y-4' },
        React.createElement('div', null,
          React.createElement('label', { className: 'block text-sm text-slate-400 mb-1' }, 'Name'),
          React.createElement('input', {
            type: 'text',
            value: name,
            onChange: (e) => setName(e.target.value),
            disabled: epic.isGeneral,
            className: 'w-full bg-slate-900 border border-aia-border rounded-lg px-3 py-2 text-slate-200 focus:border-aia-accent focus:outline-none disabled:opacity-50',
          })
        ),

        React.createElement('div', null,
          React.createElement('label', { className: 'block text-sm text-slate-400 mb-1' }, 'Description'),
          React.createElement('textarea', {
            value: description,
            onChange: (e) => setDescription(e.target.value),
            rows: 4,
            className: 'w-full bg-slate-900 border border-aia-border rounded-lg px-3 py-2 text-slate-200 focus:border-aia-accent focus:outline-none resize-none',
          })
        ),

        error && React.createElement('p', { className: 'text-red-400 text-sm' }, error)
      ),

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
        }, loading ? 'Saving...' : 'Save Changes')
      )
    )
  );
}

// ============== Main Epic Detail Component ==============

export function EpicDetail({ epicId }) {
  const [epic, setEpic] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [showCreateStory, setShowCreateStory] = React.useState(false);
  const [showEditEpic, setShowEditEpic] = React.useState(false);
  const [confirmAction, setConfirmAction] = React.useState(null);
  const [statusFilter, setStatusFilter] = React.useState('all');

  // Load epic data
  const loadEpic = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/epics/${epicId}`);
      setEpic(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  React.useEffect(() => {
    loadEpic();
  }, [epicId]);

  // Handlers
  const handleStatusChange = async (newStatus) => {
    try {
      const updated = await api.patch(`/epics/${epic.id}/status`, { status: newStatus });
      setEpic({ ...epic, ...updated });
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStoryStatusChange = async (storyId, newStatus) => {
    try {
      await api.patch(`/stories/${storyId}/status`, { status: newStatus });
      loadEpic();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteStory = async (storyId) => {
    setConfirmAction({
      title: 'Delete Story',
      message: 'Are you sure you want to delete this story? This action cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          await api.delete(`/stories/${storyId}`);
          loadEpic();
        } catch (err) {
          alert(err.message);
        }
        setConfirmAction(null);
      },
    });
  };

  const handleArchiveEpic = async () => {
    setConfirmAction({
      title: epic.isArchived ? 'Unarchive Epic' : 'Archive Epic',
      message: epic.isArchived
        ? 'This will restore the epic to active status.'
        : 'Archived epics are hidden from the main view but can be restored later.',
      confirmLabel: epic.isArchived ? 'Unarchive' : 'Archive',
      onConfirm: async () => {
        try {
          const endpoint = epic.isArchived ? `/epics/${epic.id}/unarchive` : `/epics/${epic.id}/archive`;
          await api.post(endpoint);
          loadEpic();
        } catch (err) {
          alert(err.message);
        }
        setConfirmAction(null);
      },
    });
  };

  const handleDeleteEpic = async () => {
    if ((epic.stories || []).length > 0) {
      alert('Cannot delete epic with stories. Please move or delete all stories first.');
      return;
    }

    setConfirmAction({
      title: 'Delete Epic',
      message: 'Are you sure you want to permanently delete this epic?',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          await api.delete(`/epics/${epic.id}`);
          window.location.hash = '#/epics';
        } catch (err) {
          alert(err.message);
        }
        setConfirmAction(null);
      },
    });
  };

  const handleStoryClick = (story) => {
    window.location.hash = `#/stories/${story.id}`;
  };

  const handleStoryCreated = () => {
    loadEpic();
  };

  if (loading) {
    return React.createElement(LoadingSpinner, { text: 'Loading epic...' });
  }

  if (error) {
    return React.createElement('div', { className: 'text-center py-12' },
      React.createElement('p', { className: 'text-red-400 mb-4' }, `Error: ${error}`),
      React.createElement('div', { className: 'flex justify-center gap-3' },
        React.createElement('a', {
          href: '#/epics',
          className: 'px-4 py-2 text-sm text-slate-400 hover:text-slate-200',
        }, '\u2190 Back to Epics'),
        React.createElement('button', {
          onClick: loadEpic,
          className: 'px-4 py-2 bg-aia-accent/20 text-aia-accent rounded-lg hover:bg-aia-accent/30',
        }, 'Retry')
      )
    );
  }

  if (!epic) return null;

  const statusConfig = EPIC_STATUS[epic.status] || EPIC_STATUS.discovery;
  const stories = epic.stories || [];
  const doneCount = stories.filter(s => s.status === 'done').length;
  const progress = stories.length > 0 ? Math.round((doneCount / stories.length) * 100) : 0;

  // Filter stories
  const filteredStories = statusFilter === 'all'
    ? stories
    : stories.filter(s => s.status === statusFilter);

  // Group by phase for better organization
  const discoveryStories = filteredStories.filter(s => s.phase === 'discovery' || !s.phase);
  const developmentStories = filteredStories.filter(s => s.phase === 'development');
  const qaStories = filteredStories.filter(s => s.phase === 'qa');
  const doneStories = filteredStories.filter(s => s.phase === 'done');

  return React.createElement('div', { className: 'space-y-6' },
    // Breadcrumb
    React.createElement('div', { className: 'flex items-center gap-2 text-sm' },
      React.createElement('a', {
        href: '#/epics',
        className: 'text-slate-400 hover:text-slate-200',
      }, 'Epics'),
      React.createElement('span', { className: 'text-slate-600' }, '/'),
      React.createElement('span', { className: 'text-slate-200' }, epic.name)
    ),

    // Header
    React.createElement('div', { className: 'bg-aia-card border border-aia-border rounded-xl p-6' },
      React.createElement('div', { className: 'flex items-start justify-between mb-4' },
        React.createElement('div', { className: 'flex items-center gap-3' },
          epic.isGeneral && React.createElement('span', {
            className: 'text-sm bg-slate-700 px-2 py-1 rounded text-slate-400',
          }, '\uD83D\uDCC1 System Epic'),
          epic.isArchived && React.createElement('span', {
            className: 'text-sm bg-slate-700 px-2 py-1 rounded text-slate-500',
          }, 'Archived'),
        ),
        React.createElement('div', { className: 'flex items-center gap-2' },
          !epic.isGeneral && React.createElement('button', {
            onClick: () => setShowEditEpic(true),
            className: 'p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded',
            title: 'Edit Epic',
          }, '\u270F\uFE0F'),
          !epic.isGeneral && React.createElement('button', {
            onClick: handleArchiveEpic,
            className: 'p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded',
            title: epic.isArchived ? 'Unarchive' : 'Archive',
          }, epic.isArchived ? '\uD83D\uDCE4' : '\uD83D\uDCE5'),
          !epic.isGeneral && stories.length === 0 && React.createElement('button', {
            onClick: handleDeleteEpic,
            className: 'p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded',
            title: 'Delete Epic',
          }, '\uD83D\uDDD1')
        )
      ),

      // Title and description
      React.createElement('h1', { className: 'text-2xl font-bold text-slate-100 mb-2' }, epic.name),
      epic.description && React.createElement('p', { className: 'text-slate-400 mb-4' }, epic.description),

      // Status selector
      React.createElement('div', { className: 'flex items-center gap-4 mb-4' },
        React.createElement('span', { className: 'text-sm text-slate-500' }, 'Status:'),
        React.createElement('div', { className: 'flex gap-2' },
          ...Object.entries(EPIC_STATUS).map(([key, config]) =>
            React.createElement('button', {
              key,
              onClick: () => handleStatusChange(key),
              className: `px-3 py-1.5 rounded-lg text-sm transition-all ${
                epic.status === key
                  ? `${config.bgClass} ${config.textClass} border ${config.borderClass}`
                  : 'bg-slate-800 text-slate-500 border border-slate-700 hover:border-slate-600'
              }`,
            }, `${config.icon} ${config.label}`)
          )
        )
      ),

      // Progress
      React.createElement('div', null,
        React.createElement('div', { className: 'flex justify-between text-sm mb-2' },
          React.createElement('span', { className: 'text-slate-400' },
            `${doneCount} of ${stories.length} stories completed`
          ),
          epic.plannedPeriod && React.createElement('span', { className: 'text-slate-500' },
            `Planned: ${epic.plannedPeriod}`
          )
        ),
        React.createElement(ProgressBar, { progress })
      )
    ),

    // Stories section
    React.createElement('div', { className: 'bg-aia-card border border-aia-border rounded-xl' },
      // Stories header
      React.createElement('div', { className: 'flex items-center justify-between p-4 border-b border-aia-border' },
        React.createElement('div', { className: 'flex items-center gap-4' },
          React.createElement('h2', { className: 'text-lg font-semibold text-slate-200' }, 'Stories'),
          // Filter tabs
          React.createElement('div', { className: 'flex gap-1' },
            React.createElement('button', {
              onClick: () => setStatusFilter('all'),
              className: `px-2 py-1 text-xs rounded ${statusFilter === 'all' ? 'bg-aia-accent/20 text-aia-accent' : 'text-slate-500 hover:bg-slate-800'}`,
            }, `All (${stories.length})`),
            ...Object.entries(STORY_STATUS).map(([key, config]) => {
              const count = stories.filter(s => s.status === key).length;
              if (count === 0) return null;
              return React.createElement('button', {
                key,
                onClick: () => setStatusFilter(key),
                className: `px-2 py-1 text-xs rounded ${statusFilter === key ? `${config.bgClass} ${config.textClass}` : 'text-slate-500 hover:bg-slate-800'}`,
              }, `${config.label} (${count})`);
            })
          )
        ),
        React.createElement('button', {
          onClick: () => setShowCreateStory(true),
          className: 'px-3 py-1.5 bg-aia-accent text-slate-900 rounded-lg text-sm font-medium hover:bg-aia-accent/90',
        }, '+ Add Story')
      ),

      // Stories content
      filteredStories.length === 0 ? (
        React.createElement('div', { className: 'p-8 text-center' },
          React.createElement('span', { className: 'text-3xl block mb-2' }, '\uD83D\uDCDD'),
          React.createElement('p', { className: 'text-slate-500' },
            stories.length === 0 ? 'No stories yet. Create your first story to get started.' : 'No stories match this filter.'
          )
        )
      ) : (
        React.createElement('div', { className: 'p-4' },
          // Discovery stories
          discoveryStories.length > 0 && React.createElement('div', { className: 'mb-6' },
            React.createElement('h3', { className: 'text-sm font-medium text-purple-400 mb-3 flex items-center gap-2' },
              '\uD83D\uDD0D',
              `Discovery (${discoveryStories.length})`
            ),
            React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-3' },
              ...discoveryStories.map(story =>
                React.createElement(StoryCard, {
                  key: story.id,
                  story,
                  onClick: handleStoryClick,
                  onStatusChange: handleStoryStatusChange,
                  onDelete: handleDeleteStory,
                })
              )
            )
          ),

          // Development stories
          developmentStories.length > 0 && React.createElement('div', { className: 'mb-6' },
            React.createElement('h3', { className: 'text-sm font-medium text-violet-400 mb-3 flex items-center gap-2' },
              '\uD83D\uDE80',
              `Development (${developmentStories.length})`
            ),
            React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-3' },
              ...developmentStories.map(story =>
                React.createElement(StoryCard, {
                  key: story.id,
                  story,
                  onClick: handleStoryClick,
                  onStatusChange: handleStoryStatusChange,
                  onDelete: handleDeleteStory,
                })
              )
            )
          ),

          // QA stories
          qaStories.length > 0 && React.createElement('div', { className: 'mb-6' },
            React.createElement('h3', { className: 'text-sm font-medium text-sky-400 mb-3 flex items-center gap-2' },
              '\u2705',
              `QA (${qaStories.length})`
            ),
            React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-3' },
              ...qaStories.map(story =>
                React.createElement(StoryCard, {
                  key: story.id,
                  story,
                  onClick: handleStoryClick,
                  onStatusChange: handleStoryStatusChange,
                  onDelete: handleDeleteStory,
                })
              )
            )
          ),

          // Done stories
          doneStories.length > 0 && React.createElement('div', null,
            React.createElement('h3', { className: 'text-sm font-medium text-emerald-400 mb-3 flex items-center gap-2' },
              '\uD83C\uDFC1',
              `Done (${doneStories.length})`
            ),
            React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-3' },
              ...doneStories.map(story =>
                React.createElement(StoryCard, {
                  key: story.id,
                  story,
                  onClick: handleStoryClick,
                  onStatusChange: handleStoryStatusChange,
                  onDelete: handleDeleteStory,
                })
              )
            )
          )
        )
      )
    ),

    // Modals
    showCreateStory && React.createElement(CreateStoryModal, {
      epicId: epic.id,
      onClose: () => setShowCreateStory(false),
      onCreated: handleStoryCreated,
    }),

    showEditEpic && React.createElement(EditEpicModal, {
      epic,
      onClose: () => setShowEditEpic(false),
      onSaved: (updated) => setEpic({ ...epic, ...updated }),
    }),

    confirmAction && React.createElement(ConfirmDialog, {
      ...confirmAction,
      onCancel: () => setConfirmAction(null),
    })
  );
}
