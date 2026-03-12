import React from 'react';
import { api } from '/main.js';

const STATUS_CLASSES = {
  done: 'step-done',
  pending: 'step-pending',
  'in-progress': 'step-in-progress',
  error: 'step-error',
};

// Duplicated from constants.js to avoid async fetch on initial render
const QUICK_STEPS = ['dev-plan', 'implement', 'review'];
const FEATURE_TYPES = ['feature', 'bug'];
const DEFAULT_FEATURE_TYPE = 'feature';
const DELETION_FILTER = { ACTIVE: 'active', DELETED: 'deleted', ALL: 'all' };

function StepBadge({ step, status }) {
  return React.createElement('span', {
    className: `inline-block px-2 py-0.5 text-xs rounded border ${STATUS_CLASSES[status] || 'step-pending'}`,
  }, step);
}

function TypeBadge({ type }) {
  const isFeature = type !== 'bug';
  return React.createElement('span', {
    className: `text-xs px-1.5 py-0.5 rounded border ${isFeature ? 'type-feature' : 'type-bug'}`,
  }, isFeature ? '\u2728 FEATURE' : '\uD83D\uDC1B BUG');
}

function AppChip({ app, small = false }) {
  return React.createElement('span', {
    className: `app-chip ${small ? 'text-[10px] px-1.5' : ''}`,
    title: app.path || app,
  }, typeof app === 'object' ? `${app.icon || ''} ${app.name}` : app);
}

function FeatureCard({ feature, availableApps, onRestore }) {
  const steps = feature.steps || {};
  const isQuickFlow = feature.flow === 'quick';
  const featureType = feature.type || DEFAULT_FEATURE_TYPE;
  const featureApps = feature.apps || [];
  const isDeleted = feature.isDeleted || feature.deletedAt != null;
  const [restoring, setRestoring] = React.useState(false);

  // Filter steps based on flow type
  const relevantSteps = isQuickFlow
    ? Object.entries(steps).filter(([k]) => QUICK_STEPS.includes(k))
    : Object.entries(steps);

  const doneCount = relevantSteps.filter(([_, s]) => s === 'done').length;
  const totalCount = relevantSteps.length;

  // Map app names to full app objects for icons
  const appObjects = featureApps.map(appName => {
    const found = availableApps.find(a => a.name === appName);
    return found || { name: appName, icon: '\uD83D\uDCC1' };
  });

  const handleRestore = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setRestoring(true);
    try {
      await api.post(`/features/${feature.name}/restore`);
      if (onRestore) onRestore();
    } catch (err) {
      console.error('Failed to restore:', err);
    }
    setRestoring(false);
  };

  return React.createElement('a', {
    href: `#/features/${feature.name}`,
    className: `block bg-aia-card border rounded-lg p-4 transition-colors ${
      isDeleted
        ? 'border-red-500/30 opacity-75 hover:border-red-500/50'
        : 'border-aia-border hover:border-aia-accent/50'
    }`,
  },
    // Header row: Type badge + step count / deleted badge
    React.createElement('div', { className: 'flex items-center justify-between mb-2' },
      isDeleted
        ? React.createElement('span', {
            className: 'text-xs px-1.5 py-0.5 rounded border bg-red-500/20 text-red-400 border-red-500/30',
          }, '\uD83D\uDDD1 DELETED')
        : React.createElement(TypeBadge, { type: featureType }),
      !isDeleted && React.createElement('span', { className: 'text-xs text-slate-500' },
        `${doneCount}/${totalCount} steps`
      ),
      isDeleted && React.createElement('button', {
        onClick: handleRestore,
        disabled: restoring,
        className: 'text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded hover:bg-emerald-500/30 disabled:opacity-40',
      }, restoring ? 'Restoring...' : 'Restore'),
    ),

    // Feature name row with Quick/wt badges
    React.createElement('div', { className: 'flex items-center gap-2 mb-2' },
      React.createElement('h3', { className: `font-semibold ${isDeleted ? 'text-slate-500 line-through' : 'text-slate-100'}` }, feature.name),
      !isDeleted && isQuickFlow && React.createElement('span', {
        className: 'bg-amber-500/20 text-amber-400 text-xs px-1.5 py-0.5 rounded',
        title: 'Quick Flow',
      }, 'QUICK'),
      !isDeleted && feature.hasWorktree && React.createElement('span', {
        className: 'bg-orange-500/20 text-orange-400 text-xs px-1.5 py-0.5 rounded',
        title: 'Git worktree active',
      }, 'wt'),
      !isDeleted && feature.agentRunning && React.createElement('span', {
        className: 'bg-blue-500/20 text-blue-400 text-xs px-1.5 py-0.5 rounded flex items-center gap-1',
        title: 'Agent running',
      },
        React.createElement('span', { className: 'animate-pulse' }, '\u25CF'),
        'Running'
      ),
    ),

    // Progress bar
    React.createElement('div', { className: 'h-1.5 bg-slate-700 rounded-full mb-2 overflow-hidden' },
      React.createElement('div', {
        className: 'h-full bg-aia-accent rounded-full transition-all',
        style: { width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%` },
      })
    ),

    // Current step
    feature.current_step && React.createElement('p', { className: 'text-xs text-slate-400 mb-2' },
      'Current: ', React.createElement('span', { className: 'text-aia-accent' }, feature.current_step)
    ),

    // App tags
    appObjects.length > 0 && React.createElement('div', { className: 'flex flex-wrap gap-1 mt-2' },
      ...appObjects.map(app =>
        React.createElement(AppChip, { key: app.name, app, small: true })
      )
    ),
  );
}

function TypeFilterTabs({ filter, onChange, counts }) {
  const tabs = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'feature', label: '\u2728 Features', count: counts.features, colorClass: 'text-emerald-400' },
    { key: 'bug', label: '\uD83D\uDC1B Bugs', count: counts.bugs, colorClass: 'text-red-400' },
  ];

  return React.createElement('div', { className: 'flex gap-2' },
    ...tabs.map(tab =>
      React.createElement('button', {
        key: tab.key,
        onClick: () => onChange(tab.key),
        className: `px-3 py-1.5 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
          filter === tab.key
            ? tab.colorClass ? `${tab.colorClass} border-current bg-current/10` : 'border-aia-accent text-aia-accent bg-aia-accent/10'
            : 'border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500'
        }`,
      },
        tab.label,
        React.createElement('span', {
          className: 'text-slate-500',
        }, `(${tab.count})`),
      )
    )
  );
}

function AppsFilter({ apps, selected, onChange }) {
  if (!apps.length) return null;

  const enabledApps = apps.filter(a => a.enabled !== false);
  if (!enabledApps.length) return null;

  return React.createElement('div', { className: 'flex flex-wrap gap-1.5' },
    React.createElement('span', { className: 'text-xs text-slate-500 self-center mr-1' }, 'Apps:'),
    ...enabledApps.map(app =>
      React.createElement('button', {
        key: app.name,
        onClick: () => {
          const isSelected = selected.includes(app.name);
          onChange(isSelected
            ? selected.filter(n => n !== app.name)
            : [...selected, app.name]
          );
        },
        className: `px-2 py-0.5 text-xs rounded-full border transition-colors ${
          selected.includes(app.name)
            ? 'app-chip-selected'
            : 'app-chip hover:border-slate-500'
        }`,
      }, `${app.icon || '\uD83D\uDCC1'} ${app.name}`)
    ),
    selected.length > 0 && React.createElement('button', {
      onClick: () => onChange([]),
      className: 'text-xs text-slate-500 hover:text-slate-300 ml-1',
    }, 'Clear'),
  );
}

function WorktreeFilter({ filter, onChange, counts }) {
  const tabs = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'with-wt', label: 'With Worktree', count: counts.withWt },
    { key: 'without-wt', label: 'Without Worktree', count: counts.withoutWt },
  ];

  return React.createElement('div', { className: 'flex gap-1 border-b border-aia-border' },
    ...tabs.map(tab =>
      React.createElement('button', {
        key: tab.key,
        onClick: () => onChange(tab.key),
        className: `px-3 py-1.5 text-xs border-b-2 transition-colors flex items-center gap-1.5 ${
          filter === tab.key
            ? 'border-aia-accent text-aia-accent'
            : 'border-transparent text-slate-500 hover:text-slate-300'
        }`,
      },
        tab.label,
        tab.key === 'with-wt' && tab.count > 0 && React.createElement('span', {
          className: 'bg-orange-500/20 text-orange-400 text-xs px-1.5 py-0.5 rounded',
        }, tab.count),
        tab.key !== 'with-wt' && React.createElement('span', {
          className: 'text-slate-600',
        }, `(${tab.count})`),
      )
    )
  );
}

function DeletionFilter({ filter, onChange, deletedCount }) {
  return React.createElement('div', { className: 'flex items-center gap-2' },
    React.createElement('span', { className: 'text-xs text-slate-500' }, 'Show:'),
    React.createElement('button', {
      onClick: () => onChange(DELETION_FILTER.ACTIVE),
      className: `px-3 py-1 text-xs rounded border transition-colors ${
        filter === DELETION_FILTER.ACTIVE
          ? 'bg-aia-accent/20 text-aia-accent border-aia-accent/30'
          : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500'
      }`,
    }, 'Active'),
    React.createElement('button', {
      onClick: () => onChange(DELETION_FILTER.DELETED),
      className: `px-3 py-1 text-xs rounded border transition-colors flex items-center gap-1.5 ${
        filter === DELETION_FILTER.DELETED
          ? 'bg-red-500/20 text-red-400 border-red-500/30'
          : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500'
      }`,
    },
      '\uD83D\uDDD1 Deleted',
      deletedCount > 0 && React.createElement('span', {
        className: 'bg-red-500/30 text-red-400 text-xs px-1.5 py-0.5 rounded',
      }, deletedCount),
    ),
    React.createElement('button', {
      onClick: () => onChange(DELETION_FILTER.ALL),
      className: `px-3 py-1 text-xs rounded border transition-colors ${
        filter === DELETION_FILTER.ALL
          ? 'bg-slate-600 text-slate-200 border-slate-500'
          : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500'
      }`,
    }, 'All'),
  );
}

function CreateFeatureModal({ apps, onCreated, onClose }) {
  const [step, setStep] = React.useState(1);
  const [type, setType] = React.useState(DEFAULT_FEATURE_TYPE);
  const [selectedApps, setSelectedApps] = React.useState([]);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const enabledApps = apps.filter(a => a.enabled !== false);
  const totalSteps = enabledApps.length > 0 ? 3 : 2;

  const handleNext = () => {
    if (step === 1) {
      // Skip step 2 if no apps
      setStep(enabledApps.length > 0 ? 2 : 3);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 3) {
      setStep(enabledApps.length > 0 ? 2 : 1);
    } else if (step === 2) {
      setStep(1);
    }
  };

  const handleCreate = async () => {
    // Clean up name: trim whitespace and leading/trailing hyphens
    const cleanName = name.trim().replace(/^-+|-+$/g, '');
    if (!cleanName) {
      setErr('Name is required');
      return;
    }
    setErr('');
    setLoading(true);
    try {
      await api.post('/features', {
        name: cleanName,
        type,
        apps: selectedApps,
      });
      onCreated();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && step === 3 && name.trim() && !loading) {
      e.preventDefault();
      handleCreate();
    }
  };

  return React.createElement('div', {
    className: 'fixed inset-0 bg-black/50 flex items-center justify-center z-50',
    onClick: (e) => e.target === e.currentTarget && onClose(),
    onKeyDown: handleKeyDown,
  },
    React.createElement('div', {
      className: 'bg-aia-card border border-aia-border rounded-lg p-6 w-full max-w-md space-y-4',
    },
      // Header
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('h2', { className: 'text-lg font-semibold text-slate-100' },
          type === 'bug' ? '\uD83D\uDC1B New Bug' : '\u2728 New Feature'
        ),
        React.createElement('button', {
          onClick: onClose,
          className: 'text-slate-500 hover:text-slate-300',
        }, '\u2715'),
      ),

      // Progress indicator
      React.createElement('div', { className: 'flex gap-1' },
        ...[1, 2, 3].slice(0, totalSteps).map(s =>
          React.createElement('div', {
            key: s,
            className: `h-1 flex-1 rounded ${s <= step ? 'bg-aia-accent' : 'bg-slate-700'}`,
          })
        )
      ),

      // Step 1: Type selection
      step === 1 && React.createElement('div', { className: 'space-y-4 modal-step-active' },
        React.createElement('p', { className: 'text-sm text-slate-400' }, 'What are you creating?'),
        React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
          React.createElement('button', {
            onClick: () => setType('feature'),
            className: `p-4 rounded-lg border-2 text-center transition-all ${
              type === 'feature'
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-slate-600 hover:border-slate-500'
            }`,
          },
            React.createElement('span', { className: 'text-3xl block mb-2' }, '\u2728'),
            React.createElement('span', { className: 'text-sm font-medium text-slate-200' }, 'Feature'),
            React.createElement('p', { className: 'text-xs text-slate-500 mt-1' }, 'New functionality'),
          ),
          React.createElement('button', {
            onClick: () => setType('bug'),
            className: `p-4 rounded-lg border-2 text-center transition-all ${
              type === 'bug'
                ? 'border-red-500 bg-red-500/10'
                : 'border-slate-600 hover:border-slate-500'
            }`,
          },
            React.createElement('span', { className: 'text-3xl block mb-2' }, '\uD83D\uDC1B'),
            React.createElement('span', { className: 'text-sm font-medium text-slate-200' }, 'Bug'),
            React.createElement('p', { className: 'text-xs text-slate-500 mt-1' }, 'Quick flow'),
          ),
        ),
      ),

      // Step 2: App selection (only if apps exist)
      step === 2 && React.createElement('div', { className: 'space-y-4 modal-step-active' },
        React.createElement('p', { className: 'text-sm text-slate-400' }, 'Which apps are involved?'),
        React.createElement('div', { className: 'flex flex-wrap gap-2' },
          ...enabledApps.map(app =>
            React.createElement('button', {
              key: app.name,
              onClick: () => {
                setSelectedApps(prev =>
                  prev.includes(app.name)
                    ? prev.filter(n => n !== app.name)
                    : [...prev, app.name]
                );
              },
              className: `px-3 py-2 rounded-lg border text-sm transition-all ${
                selectedApps.includes(app.name)
                  ? 'border-aia-accent bg-aia-accent/10 text-aia-accent'
                  : 'border-slate-600 text-slate-300 hover:border-slate-500'
              }`,
            }, `${app.icon || '\uD83D\uDCC1'} ${app.name}`)
          )
        ),
        React.createElement('p', { className: 'text-xs text-slate-500' },
          selectedApps.length === 0 ? 'Optional: select apps to scope this work' : `${selectedApps.length} app(s) selected`
        ),
      ),

      // Step 3: Name and description
      step === 3 && React.createElement('div', { className: 'space-y-4 modal-step-active' },
        React.createElement('div', null,
          React.createElement('label', { className: 'text-xs text-slate-400 block mb-1' }, 'Name *'),
          React.createElement('input', {
            type: 'text',
            value: name,
            onChange: e => {
              // Sanitize input: lowercase, replace invalid chars, collapse hyphens
              // Don't trim leading/trailing hyphens here - let user type freely
              const sanitized = e.target.value
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, '')
                .replace(/-+/g, '-');
              setName(sanitized);
            },
            onBlur: () => {
              // Trim leading/trailing hyphens on blur
              setName(n => n.replace(/^-+|-+$/g, ''));
            },
            placeholder: type === 'bug' ? 'bug-name' : 'feature-name',
            autoFocus: true,
            className: 'w-full bg-slate-900 border border-aia-border rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-aia-accent focus:outline-none',
          }),
          React.createElement('p', { className: 'text-xs text-slate-500 mt-1' }, 'Lowercase with hyphens (e.g. fix-login-bug)'),
        ),
        err && React.createElement('p', { className: 'text-red-400 text-xs' }, err),
      ),

      // Footer buttons
      React.createElement('div', { className: 'flex justify-between pt-2' },
        step > 1
          ? React.createElement('button', {
              onClick: handleBack,
              className: 'text-sm text-slate-400 hover:text-slate-200',
            }, '\u2190 Back')
          : React.createElement('div'),
        step < totalSteps
          ? React.createElement('button', {
              onClick: handleNext,
              className: 'bg-aia-accent/20 text-aia-accent border border-aia-accent/30 rounded px-4 py-1.5 text-sm hover:bg-aia-accent/30',
            }, 'Next \u2192')
          : React.createElement('button', {
              onClick: handleCreate,
              disabled: loading || !name.trim(),
              className: 'bg-aia-accent text-slate-900 rounded px-4 py-1.5 text-sm font-medium hover:bg-aia-accent/90 disabled:opacity-40',
            }, loading ? 'Creating...' : 'Create'),
      ),
    )
  );
}

export function Dashboard() {
  const [features, setFeatures] = React.useState([]);
  const [deletedCount, setDeletedCount] = React.useState(0);
  const [apps, setApps] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [appsFilter, setAppsFilter] = React.useState([]);
  const [wtFilter, setWtFilter] = React.useState('all');
  const [deletionFilter, setDeletionFilter] = React.useState(DELETION_FILTER.ACTIVE);
  const [showCreateModal, setShowCreateModal] = React.useState(false);

  const [loadError, setLoadError] = React.useState(null);

  async function load() {
    setLoadError(null);
    setLoading(true);
    try {
      // Fetch features based on deletion filter
      const [featuresData, appsData, deletedData] = await Promise.all([
        api.get(`/features?filter=${deletionFilter}`),
        api.get('/apps'),
        // Also fetch deleted count for the filter badge
        deletionFilter !== DELETION_FILTER.DELETED
          ? api.get(`/features?filter=${DELETION_FILTER.DELETED}`)
          : Promise.resolve([]),
      ]);
      setFeatures(featuresData);
      setApps(appsData);
      // Set deleted count
      if (deletionFilter === DELETION_FILTER.DELETED) {
        setDeletedCount(featuresData.length);
      } else {
        setDeletedCount(deletedData.length);
      }
    } catch (e) {
      setLoadError(e.message || 'Failed to load data');
    }
    setLoading(false);
  }

  React.useEffect(() => { load(); }, [deletionFilter]);

  // Filter features
  const filteredFeatures = features.filter(f => {
    // Type filter
    const fType = f.type || DEFAULT_FEATURE_TYPE;
    if (typeFilter !== 'all' && fType !== typeFilter) return false;

    // Apps filter
    if (appsFilter.length > 0) {
      const fApps = f.apps || [];
      if (!appsFilter.some(a => fApps.includes(a))) return false;
    }

    // Worktree filter
    if (wtFilter === 'with-wt' && !f.hasWorktree) return false;
    if (wtFilter === 'without-wt' && f.hasWorktree) return false;

    return true;
  });

  // Counts for type tabs
  const typeCounts = {
    all: features.length,
    features: features.filter(f => (f.type || DEFAULT_FEATURE_TYPE) === 'feature').length,
    bugs: features.filter(f => f.type === 'bug').length,
  };

  // Counts for worktree tabs
  const wtCounts = {
    all: features.length,
    withWt: features.filter(f => f.hasWorktree).length,
    withoutWt: features.filter(f => !f.hasWorktree).length,
  };

  return React.createElement('div', { className: 'space-y-6' },
    // Header
    React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('h1', { className: 'text-xl font-bold text-slate-100' }, 'Features'),
      React.createElement('button', {
        onClick: () => setShowCreateModal(true),
        className: 'bg-aia-accent/20 text-aia-accent border border-aia-accent/30 rounded px-3 py-1.5 text-sm hover:bg-aia-accent/30',
      }, '+ New'),
    ),

    // Filters row
    !loading && React.createElement('div', { className: 'space-y-3' },
      // Deletion filter (Active / Deleted / All)
      React.createElement(DeletionFilter, {
        filter: deletionFilter,
        onChange: setDeletionFilter,
        deletedCount,
      }),

      // Type filter pills (only show if there are features to filter)
      features.length > 0 && React.createElement(TypeFilterTabs, {
        filter: typeFilter,
        onChange: setTypeFilter,
        counts: typeCounts,
      }),

      // Apps filter
      features.length > 0 && React.createElement(AppsFilter, {
        apps,
        selected: appsFilter,
        onChange: setAppsFilter,
      }),

      // Worktree filter tabs
      features.length > 0 && wtCounts.withWt > 0 && React.createElement(WorktreeFilter, {
        filter: wtFilter,
        onChange: setWtFilter,
        counts: wtCounts,
      }),
    ),

    // Error message
    loadError && React.createElement('p', { className: 'text-red-400 text-sm' }, `Error: ${loadError}`),

    // Features grid
    loading
      ? React.createElement('p', { className: 'text-slate-500' }, 'Loading...')
      : features.length === 0
        ? React.createElement('div', { className: 'text-center py-8' },
            deletionFilter === DELETION_FILTER.DELETED
              ? React.createElement('div', { className: 'space-y-2' },
                  React.createElement('p', { className: 'text-slate-500' }, '\uD83D\uDDD1 No deleted features'),
                  React.createElement('p', { className: 'text-xs text-slate-600' }, 'Deleted features will appear here for recovery'),
                )
              : React.createElement('p', { className: 'text-slate-500' }, 'No features yet. Create one to get started.')
          )
        : filteredFeatures.length === 0
          ? React.createElement('p', { className: 'text-slate-500' }, 'No features match these filters.')
          : React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' },
              ...filteredFeatures.map(f => React.createElement(FeatureCard, { key: f.name, feature: f, availableApps: apps, onRestore: load }))
            ),

    // Create modal
    showCreateModal && React.createElement(CreateFeatureModal, {
      apps,
      onCreated: load,
      onClose: () => setShowCreateModal(false),
    }),
  );
}
