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

// Sorting options
const SORT_OPTIONS = {
  DATE_DESC: { field: 'date', order: 'desc', label: 'Newest first' },
  DATE_ASC: { field: 'date', order: 'asc', label: 'Oldest first' },
  NAME_ASC: { field: 'name', order: 'asc', label: 'Name (A-Z)' },
  NAME_DESC: { field: 'name', order: 'desc', label: 'Name (Z-A)' },
};

// LocalStorage keys for persistence
const STORAGE_KEYS = {
  SORT: 'aia-feature-list-sort',
  SHOW_COMPLETED: 'aia-feature-list-show-completed',
  TYPE_FILTER: 'aia-feature-list-type-filter',
  APPS_FILTER: 'aia-feature-list-apps-filter',
  WT_FILTER: 'aia-feature-list-wt-filter',
  DELETION_FILTER: 'aia-feature-list-deletion-filter',
};

/**
 * Load a value from localStorage with fallback
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if not found
 * @returns {*} Parsed value or default
 */
function loadFromStorage(key, defaultValue) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Save a value to localStorage
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 */
function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Sort features by the specified field and order
 * @param {Array} features - Array of features to sort
 * @param {string} field - 'date' or 'name'
 * @param {string} order - 'asc' or 'desc'
 * @returns {Array} Sorted array (new array, doesn't mutate original)
 */
function sortFeatures(features, field, order) {
  const sorted = [...features];

  sorted.sort((a, b) => {
    let comparison = 0;

    if (field === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else if (field === 'date') {
      // Use createdAt if available, otherwise fall back to name (alphabetical as proxy)
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      comparison = dateA - dateB;
    }

    return order === 'desc' ? -comparison : comparison;
  });

  return sorted;
}

/**
 * Check if a feature is completed (all relevant steps are done)
 * Uses API-provided isCompleted field if available, otherwise calculates locally
 * @param {Object} feature - Feature object with steps or isCompleted
 * @returns {boolean}
 */
function isFeatureCompleted(feature) {
  // Use API-provided value if available (from minimal mode)
  if (typeof feature.isCompleted === 'boolean') {
    return feature.isCompleted;
  }
  // Fallback: calculate from steps (for lazy-loaded full data)
  const steps = feature.steps || {};
  const isQuickFlow = feature.flow === 'quick';
  const relevantSteps = isQuickFlow
    ? Object.entries(steps).filter(([k]) => QUICK_STEPS.includes(k))
    : Object.entries(steps);

  if (relevantSteps.length === 0) return false;
  return relevantSteps.every(([_, status]) => status === 'done');
}

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

/**
 * Skeleton loader component for feature cards
 * Displays a loading placeholder while card state is being fetched
 */
function FeatureCardSkeleton({ featureName }) {
  return React.createElement('div', {
    className: 'block bg-aia-card border border-aia-border rounded-lg p-4 animate-pulse',
    'aria-label': `Loading ${featureName}...`,
    role: 'status',
  },
    // Header row skeleton
    React.createElement('div', { className: 'flex items-center justify-between mb-2' },
      React.createElement('div', { className: 'h-5 w-20 bg-slate-700 rounded' }),
      React.createElement('div', { className: 'h-4 w-16 bg-slate-700 rounded' }),
    ),
    // Name row skeleton - show actual name for context
    React.createElement('div', { className: 'flex items-center gap-2 mb-2' },
      React.createElement('h3', { className: 'font-semibold text-slate-400' }, featureName),
    ),
    // Progress bar skeleton
    React.createElement('div', { className: 'h-1.5 bg-slate-700 rounded-full mb-2' }),
    // Loading indicator
    React.createElement('div', { className: 'flex items-center gap-2' },
      React.createElement('div', { className: 'w-3 h-3 border-2 border-slate-600 border-t-aia-accent rounded-full animate-spin' }),
      React.createElement('span', { className: 'text-xs text-slate-500' }, 'Loading details...'),
    ),
  );
}

/**
 * Hook to fetch individual card state asynchronously
 * @param {string} featureName - The feature name to fetch state for
 * @param {boolean} enabled - Whether to enable fetching
 * @returns {{ state: Object|null, isLoading: boolean, error: string|null }}
 */
function useCardState(featureName, enabled = true) {
  const [state, setState] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!enabled || !featureName) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api.get(`/features/${featureName}`)
      .then(data => {
        if (!cancelled) {
          setState(data);
          setIsLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message || 'Failed to load');
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [featureName, enabled]);

  return { state, isLoading, error };
}

function FeatureCard({ feature, availableApps, onRestore, lazyLoad = false }) {
  // Use lazy loading hook if enabled, otherwise use the feature data directly
  const { state: lazyState, isLoading, error } = useCardState(
    lazyLoad ? feature.name : null,
    lazyLoad
  );

  // Use lazy-loaded state if available, otherwise use the passed feature
  const effectiveFeature = lazyLoad && lazyState ? { ...feature, ...lazyState } : feature;

  const steps = effectiveFeature.steps || {};
  const isQuickFlow = effectiveFeature.flow === 'quick';
  const featureType = effectiveFeature.type || DEFAULT_FEATURE_TYPE;
  const featureApps = effectiveFeature.apps || [];
  const isDeleted = effectiveFeature.isDeleted || effectiveFeature.deletedAt != null;
  const [restoring, setRestoring] = React.useState(false);

  // Show skeleton while loading in lazy mode
  if (lazyLoad && isLoading) {
    return React.createElement(FeatureCardSkeleton, { featureName: feature.name });
  }

  // Show error state if lazy load failed
  if (lazyLoad && error) {
    return React.createElement('div', {
      className: 'block bg-aia-card border border-red-500/30 rounded-lg p-4',
    },
      React.createElement('h3', { className: 'font-semibold text-slate-100 mb-2' }, feature.name),
      React.createElement('p', { className: 'text-xs text-red-400' }, `Error: ${error}`),
    );
  }

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
      React.createElement('h3', { className: `font-semibold ${isDeleted ? 'text-slate-500 line-through' : 'text-slate-100'}` }, effectiveFeature.name),
      !isDeleted && isQuickFlow && React.createElement('span', {
        className: 'bg-amber-500/20 text-amber-400 text-xs px-1.5 py-0.5 rounded',
        title: 'Quick Flow',
      }, 'QUICK'),
      !isDeleted && effectiveFeature.hasWorktree && React.createElement('span', {
        className: 'bg-orange-500/20 text-orange-400 text-xs px-1.5 py-0.5 rounded',
        title: 'Git worktree active',
      }, 'wt'),
      !isDeleted && effectiveFeature.agentRunning && React.createElement('span', {
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
    effectiveFeature.current_step && React.createElement('p', { className: 'text-xs text-slate-400 mb-2' },
      'Current: ', React.createElement('span', { className: 'text-aia-accent' }, effectiveFeature.current_step)
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
      'Deleted',  // Text-only label, no trash icon
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

/**
 * Completion filter toggle - show/hide completed features
 */
function CompletionFilter({ showCompleted, onChange }) {
  return React.createElement('div', { className: 'flex items-center gap-2' },
    React.createElement('label', {
      className: 'flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none',
    },
      React.createElement('input', {
        type: 'checkbox',
        checked: showCompleted,
        onChange: (e) => onChange(e.target.checked),
        className: 'w-3.5 h-3.5 rounded border-slate-500 bg-slate-800 text-aia-accent focus:ring-aia-accent focus:ring-offset-0',
      }),
      'Show completed',
    ),
  );
}

/**
 * Sort dropdown component for sorting features
 */
function SortDropdown({ sortKey, onChange }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentOption = SORT_OPTIONS[sortKey] || SORT_OPTIONS.DATE_DESC;

  return React.createElement('div', { className: 'relative', ref: dropdownRef },
    React.createElement('button', {
      onClick: () => setIsOpen(!isOpen),
      className: 'flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500 transition-colors',
    },
      React.createElement('span', { className: 'text-slate-500' }, 'Sort:'),
      currentOption.label,
      React.createElement('span', { className: 'text-slate-500' }, isOpen ? '\u25B2' : '\u25BC'),
    ),
    isOpen && React.createElement('div', {
      className: 'absolute top-full left-0 mt-1 w-40 bg-slate-800 border border-slate-600 rounded shadow-lg z-10',
    },
      ...Object.entries(SORT_OPTIONS).map(([key, option]) =>
        React.createElement('button', {
          key,
          onClick: () => {
            onChange(key);
            setIsOpen(false);
          },
          className: `w-full text-left px-3 py-2 text-xs transition-colors ${
            sortKey === key
              ? 'bg-aia-accent/20 text-aia-accent'
              : 'text-slate-300 hover:bg-slate-700'
          }`,
        }, option.label)
      ),
    ),
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
      const result = await api.post('/features', {
        name: cleanName,
        type,
        apps: selectedApps,
      });
      onClose();
      // Navigate directly to the edit page for the new feature
      window.location.hash = `#/features/${encodeURIComponent(result.name || cleanName)}`;
    } catch (e) {
      setErr(e.message);
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

  // Filter states with localStorage persistence
  const [typeFilter, setTypeFilter] = React.useState(() => loadFromStorage(STORAGE_KEYS.TYPE_FILTER, 'all'));
  const [appsFilter, setAppsFilter] = React.useState(() => loadFromStorage(STORAGE_KEYS.APPS_FILTER, []));
  const [wtFilter, setWtFilter] = React.useState(() => loadFromStorage(STORAGE_KEYS.WT_FILTER, 'all'));
  const [deletionFilter, setDeletionFilter] = React.useState(() => loadFromStorage(STORAGE_KEYS.DELETION_FILTER, DELETION_FILTER.ACTIVE));
  const [showCompleted, setShowCompleted] = React.useState(() => loadFromStorage(STORAGE_KEYS.SHOW_COMPLETED, false));

  // Sort state with localStorage persistence
  const [sortKey, setSortKey] = React.useState(() => loadFromStorage(STORAGE_KEYS.SORT, 'DATE_DESC'));

  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [loadError, setLoadError] = React.useState(null);

  // Persist filter/sort changes to localStorage
  React.useEffect(() => { saveToStorage(STORAGE_KEYS.TYPE_FILTER, typeFilter); }, [typeFilter]);
  React.useEffect(() => { saveToStorage(STORAGE_KEYS.APPS_FILTER, appsFilter); }, [appsFilter]);
  React.useEffect(() => { saveToStorage(STORAGE_KEYS.WT_FILTER, wtFilter); }, [wtFilter]);
  React.useEffect(() => { saveToStorage(STORAGE_KEYS.DELETION_FILTER, deletionFilter); }, [deletionFilter]);
  React.useEffect(() => { saveToStorage(STORAGE_KEYS.SHOW_COMPLETED, showCompleted); }, [showCompleted]);
  React.useEffect(() => { saveToStorage(STORAGE_KEYS.SORT, sortKey); }, [sortKey]);

  // Track whether to use lazy loading for card states
  const [useLazyLoad, setUseLazyLoad] = React.useState(true);

  async function load() {
    setLoadError(null);
    setLoading(true);
    try {
      // Fetch minimal features data for fast initial render
      // Card states will be loaded asynchronously per-card
      const [featuresData, appsData, deletedData] = await Promise.all([
        api.get(`/features?filter=${deletionFilter}&minimal=true`),
        api.get('/apps'),
        // Also fetch deleted count for the filter badge (minimal mode)
        deletionFilter !== DELETION_FILTER.DELETED
          ? api.get(`/features?filter=${DELETION_FILTER.DELETED}&minimal=true`)
          : Promise.resolve([]),
      ]);
      setFeatures(featuresData);
      setApps(appsData);
      setUseLazyLoad(true); // Enable lazy loading for new data
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

  // Count completed features for display
  const completedCount = features.filter(isFeatureCompleted).length;

  // Filter features
  const filteredFeatures = React.useMemo(() => {
    let result = features.filter(f => {
      // Completion filter - hide completed unless showCompleted is true
      if (!showCompleted && isFeatureCompleted(f)) return false;

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

    // Apply sorting
    const sortOption = SORT_OPTIONS[sortKey] || SORT_OPTIONS.DATE_DESC;
    result = sortFeatures(result, sortOption.field, sortOption.order);

    return result;
  }, [features, showCompleted, typeFilter, appsFilter, wtFilter, sortKey]);

  // Counts for type tabs (exclude completed if not showing them)
  const countBase = showCompleted ? features : features.filter(f => !isFeatureCompleted(f));
  const typeCounts = {
    all: countBase.length,
    features: countBase.filter(f => (f.type || DEFAULT_FEATURE_TYPE) === 'feature').length,
    bugs: countBase.filter(f => f.type === 'bug').length,
  };

  // Counts for worktree tabs
  const wtCounts = {
    all: countBase.length,
    withWt: countBase.filter(f => f.hasWorktree).length,
    withoutWt: countBase.filter(f => !f.hasWorktree).length,
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
      // First row: Deletion filter + Sort + Completion toggle
      React.createElement('div', { className: 'flex items-center justify-between flex-wrap gap-3' },
        React.createElement(DeletionFilter, {
          filter: deletionFilter,
          onChange: setDeletionFilter,
          deletedCount,
        }),
        React.createElement('div', { className: 'flex items-center gap-4' },
          features.length > 0 && React.createElement(CompletionFilter, {
            showCompleted,
            onChange: setShowCompleted,
          }),
          completedCount > 0 && !showCompleted && React.createElement('span', {
            className: 'text-xs text-slate-500',
          }, `${completedCount} completed hidden`),
          features.length > 0 && React.createElement(SortDropdown, {
            sortKey,
            onChange: setSortKey,
          }),
        ),
      ),

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
              ...filteredFeatures.map(f => React.createElement(FeatureCard, {
                key: f.name,
                feature: f,
                availableApps: apps,
                onRestore: load,
                lazyLoad: useLazyLoad,
              }))
            ),

    // Create modal
    showCreateModal && React.createElement(CreateFeatureModal, {
      apps,
      onCreated: load,
      onClose: () => setShowCreateModal(false),
    }),
  );
}
