/**
 * @fileoverview Task Detail Component - Detailed view of a single task
 * Enhanced with beautiful visual design and comprehensive task information
 */

import React from 'react';
import { api } from '/main.js';

// Task status configurations
const TASK_STATUS = {
  pending: {
    label: 'Pending',
    icon: '○',
    bgClass: 'bg-slate-500/20',
    textClass: 'text-slate-400',
    borderClass: 'border-slate-500/30',
    headerGradient: 'from-slate-500/20 to-transparent'
  },
  in_progress: {
    label: 'Running',
    icon: '◐',
    bgClass: 'bg-amber-500/20',
    textClass: 'text-amber-400',
    borderClass: 'border-amber-500/30',
    headerGradient: 'from-amber-500/20 to-transparent'
  },
  completed: {
    label: 'Completed',
    icon: '●',
    bgClass: 'bg-emerald-500/20',
    textClass: 'text-emerald-400',
    borderClass: 'border-emerald-500/30',
    headerGradient: 'from-emerald-500/20 to-transparent'
  },
  failed: {
    label: 'Failed',
    icon: '✗',
    bgClass: 'bg-red-500/20',
    textClass: 'text-red-400',
    borderClass: 'border-red-500/30',
    headerGradient: 'from-red-500/20 to-transparent'
  },
  skipped: {
    label: 'Skipped',
    icon: '⊘',
    bgClass: 'bg-slate-700/50',
    textClass: 'text-slate-500',
    borderClass: 'border-slate-600',
    headerGradient: 'from-slate-700/20 to-transparent'
  },
};

// Review status configurations
const REVIEW_STATUS = {
  pending: { label: 'Pending Review', icon: '👀', bgClass: 'bg-slate-500/20', textClass: 'text-slate-400' },
  approved: { label: 'Approved', icon: '✓', bgClass: 'bg-emerald-500/20', textClass: 'text-emerald-400' },
  changes_requested: { label: 'Changes Requested', icon: '↻', bgClass: 'bg-amber-500/20', textClass: 'text-amber-400' },
};

// Loading spinner component
function LoadingSpinner({ size = 'sm' }) {
  const sizeClasses = { sm: 'w-4 h-4 border-2', md: 'w-5 h-5 border-2' };
  return React.createElement('div', {
    className: `${sizeClasses[size]} border-slate-600 border-t-aia-accent rounded-full animate-spin`
  });
}

// Collapsible section with icon
function Section({ title, icon, children, defaultOpen = true }) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return React.createElement('div', { className: 'mb-5' },
    React.createElement('button', {
      onClick: () => setIsOpen(!isOpen),
      className: 'w-full flex items-center justify-between text-sm font-medium text-slate-300 hover:text-slate-100 transition-colors mb-2 group'
    },
      React.createElement('div', { className: 'flex items-center gap-2' },
        icon && React.createElement('span', { className: 'text-base' }, icon),
        title
      ),
      React.createElement('span', {
        className: `text-slate-500 group-hover:text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`
      }, '▼')
    ),
    isOpen && children
  );
}

// Tab navigation component
function TabNav({ tabs, activeTab, onChange }) {
  return React.createElement('div', {
    className: 'flex gap-1 p-1 bg-slate-800/50 rounded-lg mb-4'
  },
    ...tabs.map(tab =>
      React.createElement('button', {
        key: tab.id,
        onClick: () => onChange(tab.id),
        className: `flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all
          ${activeTab === tab.id
            ? 'bg-slate-700 text-white shadow-sm'
            : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'}`
      },
        tab.icon && React.createElement('span', { className: 'mr-1' }, tab.icon),
        tab.label,
        tab.count !== undefined && React.createElement('span', {
          className: `ml-1 px-1.5 py-0.5 rounded text-[10px] ${activeTab === tab.id ? 'bg-slate-600' : 'bg-slate-700'}`
        }, tab.count)
      )
    )
  );
}

export function TaskDetail({ task, storyId, onClose, onUpdate }) {
  const [loading, setLoading] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(null);
  const [reviewFeedback, setReviewFeedback] = React.useState('');
  const [showReviewForm, setShowReviewForm] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('overview');

  if (!task) return null;

  const statusConfig = TASK_STATUS[task.status] || TASK_STATUS.pending;
  const reviewConfig = task.reviewResult ? REVIEW_STATUS[task.reviewResult.status] : null;

  const handleAction = async (action) => {
    setActionLoading(action);
    try {
      await api.post(`/stories/${storyId}/tasks/${task.id}/${action}`);
      onUpdate && onUpdate();
    } catch (err) {
      alert(err.message);
    }
    setActionLoading(null);
  };

  const handleRequestChanges = async () => {
    if (!reviewFeedback.trim() || reviewFeedback.length < 10) {
      alert('Please provide at least 10 characters of feedback');
      return;
    }
    setLoading(true);
    try {
      await api.post(`/stories/${storyId}/tasks/${task.id}/request-changes`, {
        feedback: reviewFeedback,
      });
      setShowReviewForm(false);
      setReviewFeedback('');
      onUpdate && onUpdate();
    } catch (err) {
      alert(err.message);
    }
    setLoading(false);
  };

  const canRun = task.status === 'pending';
  const canReset = task.status === 'completed' || task.status === 'failed' || task.status === 'skipped';
  const canSkip = task.status === 'pending';
  const canReview = task.status === 'completed';

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'files', label: 'Files', icon: '📄', count: task.files?.length || 0 },
    { id: 'results', label: 'Results', icon: '📊' },
  ];

  return React.createElement('div', {
    className: 'fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4',
    onClick: (e) => e.target === e.currentTarget && onClose(),
  },
    React.createElement('div', {
      className: 'bg-aia-card border border-aia-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl shadow-black/50'
    },
      // Header with gradient background
      React.createElement('div', {
        className: `relative bg-gradient-to-r ${statusConfig.headerGradient} border-b border-aia-border`
      },
        // Decorative pattern
        React.createElement('div', {
          className: 'absolute inset-0 opacity-5',
          style: { backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '20px 20px' }
        }),

        React.createElement('div', { className: 'relative p-5' },
          // Top row: close button
          React.createElement('div', { className: 'flex items-start justify-between mb-3' },
            React.createElement('div', { className: 'flex items-center gap-3' },
              // Status icon (large)
              React.createElement('div', {
                className: `flex items-center justify-center w-12 h-12 rounded-xl
                  ${statusConfig.bgClass} ${statusConfig.textClass} border ${statusConfig.borderClass}
                  text-2xl ${task.status === 'in_progress' ? 'animate-spin' : ''}`
              }, statusConfig.icon),
              React.createElement('div', null,
                React.createElement('span', { className: 'text-xs text-slate-500 font-mono' }, `Task #${task.order + 1}`),
                React.createElement('h2', { className: 'text-xl font-bold text-slate-100' }, task.title)
              )
            ),
            React.createElement('button', {
              onClick: onClose,
              className: 'p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors',
            }, '✕')
          ),

          // Status badges row
          React.createElement('div', { className: 'flex flex-wrap items-center gap-2' },
            // Status badge
            React.createElement('span', {
              className: `inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium
                ${statusConfig.bgClass} ${statusConfig.textClass} border ${statusConfig.borderClass}`,
            }, statusConfig.icon, statusConfig.label),
            // Review badge
            reviewConfig && React.createElement('span', {
              className: `inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium
                ${reviewConfig.bgClass} ${reviewConfig.textClass}`,
            }, reviewConfig.icon, reviewConfig.label)
          )
        )
      ),

      // Tab navigation
      React.createElement('div', { className: 'px-4 pt-4' },
        React.createElement(TabNav, { tabs, activeTab, onChange: setActiveTab })
      ),

      // Content area
      React.createElement('div', { className: 'flex-1 overflow-y-auto px-5 pb-4' },
        // Overview tab
        activeTab === 'overview' && React.createElement(React.Fragment, null,
          // Implementation details
          task.details && React.createElement(Section, { title: 'Implementation Details', icon: '📝' },
            React.createElement('div', {
              className: 'bg-slate-900/50 rounded-xl p-4 text-sm text-slate-300 whitespace-pre-wrap border border-slate-800/50'
            }, task.details)
          ),

          // Dependencies
          task.dependencies && task.dependencies.length > 0 && React.createElement(Section, {
            title: `Dependencies (${task.dependencies.length})`,
            icon: '🔗'
          },
            React.createElement('div', { className: 'flex flex-wrap gap-2' },
              ...task.dependencies.map(dep =>
                React.createElement('span', {
                  key: dep,
                  className: 'text-sm bg-slate-800 text-slate-400 px-3 py-1.5 rounded-lg font-mono border border-slate-700/50',
                }, dep.slice(0, 8) + '...')
              )
            )
          ),

          // Tests
          task.tests && task.tests.length > 0 && React.createElement(Section, {
            title: `Tests (${task.tests.length})`,
            icon: '🧪'
          },
            React.createElement('div', { className: 'space-y-2' },
              ...task.tests.map((test, i) =>
                React.createElement('div', {
                  key: i,
                  className: 'flex items-start gap-2 text-sm text-slate-300 bg-slate-800/30 px-3 py-2 rounded-lg'
                },
                  React.createElement('span', { className: 'text-emerald-400 mt-0.5' }, '✓'),
                  test
                )
              )
            )
          ),

          // Timestamps
          React.createElement('div', {
            className: 'text-xs text-slate-500 mt-6 pt-4 border-t border-slate-800/50 flex flex-wrap gap-4'
          },
            React.createElement('span', null, `Created: ${new Date(task.createdAt).toLocaleString()}`),
            React.createElement('span', null, `Updated: ${new Date(task.updatedAt).toLocaleString()}`)
          )
        ),

        // Files tab
        activeTab === 'files' && React.createElement(React.Fragment, null,
          task.files && task.files.length > 0
            ? React.createElement('div', { className: 'space-y-2' },
                ...task.files.map((file, i) =>
                  React.createElement('div', {
                    key: file,
                    className: 'flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg border border-slate-700/30 hover:bg-slate-800/50 transition-colors'
                  },
                    React.createElement('div', {
                      className: 'flex items-center justify-center w-8 h-8 rounded-lg bg-aia-accent/10 text-aia-accent'
                    }, '📄'),
                    React.createElement('div', { className: 'flex-1 min-w-0' },
                      React.createElement('p', { className: 'text-sm font-mono text-slate-200 truncate' }, file.split('/').pop()),
                      React.createElement('p', { className: 'text-xs text-slate-500 truncate' }, file)
                    ),
                    React.createElement('span', {
                      className: 'text-xs px-2 py-1 rounded bg-slate-700 text-slate-400'
                    }, i + 1)
                  )
                )
              )
            : React.createElement('div', { className: 'text-center py-8 text-slate-500' },
                React.createElement('span', { className: 'text-4xl mb-2 block' }, '📁'),
                'No files specified for this task'
              )
        ),

        // Results tab
        activeTab === 'results' && React.createElement(React.Fragment, null,
          // Implementation Result
          task.implementationResult
            ? React.createElement(Section, { title: 'Implementation Result', icon: task.implementationResult.success ? '✅' : '❌' },
                React.createElement('div', {
                  className: `p-4 rounded-xl border ${
                    task.implementationResult.success
                      ? 'bg-emerald-500/5 border-emerald-500/30'
                      : 'bg-red-500/5 border-red-500/30'
                  }`,
                },
                  // Header
                  React.createElement('div', { className: 'flex items-center justify-between mb-3' },
                    React.createElement('span', {
                      className: `text-sm font-medium ${task.implementationResult.success ? 'text-emerald-400' : 'text-red-400'}`,
                    }, task.implementationResult.success ? '✓ Implementation Successful' : '✗ Implementation Failed'),
                    task.implementationResult.completedAt && React.createElement('span', {
                      className: 'text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded',
                    }, new Date(task.implementationResult.completedAt).toLocaleString())
                  ),
                  // Error message
                  task.implementationResult.error && React.createElement('div', {
                    className: 'bg-red-500/10 text-red-400 text-sm p-3 rounded-lg mb-3 border border-red-500/20',
                  }, task.implementationResult.error),
                  // Files modified
                  task.implementationResult.filesModified && task.implementationResult.filesModified.length > 0 &&
                    React.createElement('div', { className: 'mb-3' },
                      React.createElement('span', { className: 'text-xs text-slate-500' }, 'Files modified:'),
                      React.createElement('div', { className: 'flex flex-wrap gap-1 mt-1' },
                        ...task.implementationResult.filesModified.map(f =>
                          React.createElement('span', {
                            key: f,
                            className: 'text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono'
                          }, f)
                        )
                      )
                    ),
                  // Output log
                  task.implementationResult.output && React.createElement('div', null,
                    React.createElement('span', { className: 'text-xs text-slate-500' }, 'Output:'),
                    React.createElement('pre', {
                      className: 'mt-1 text-xs font-mono text-slate-400 bg-slate-900 p-3 rounded-lg max-h-40 overflow-auto border border-slate-800',
                    }, task.implementationResult.output.substring(0, 2000))
                  )
                )
              )
            : React.createElement('div', { className: 'text-center py-8 text-slate-500' },
                React.createElement('span', { className: 'text-4xl mb-2 block' }, '⏳'),
                'No implementation results yet'
              ),

          // Review Result
          task.reviewResult && React.createElement(Section, { title: 'Review Result', icon: '👀', defaultOpen: true },
            React.createElement('div', {
              className: `p-4 rounded-xl border ${
                task.reviewResult.status === 'approved'
                  ? 'bg-emerald-500/5 border-emerald-500/30'
                  : task.reviewResult.status === 'changes_requested'
                    ? 'bg-amber-500/5 border-amber-500/30'
                    : 'bg-slate-800/50 border-slate-700'
              }`,
            },
              React.createElement('div', { className: 'flex items-center justify-between mb-2' },
                React.createElement('span', {
                  className: `text-sm font-medium ${reviewConfig?.textClass || 'text-slate-400'}`,
                }, `${reviewConfig?.icon || ''} ${reviewConfig?.label || 'Pending'}`),
                task.reviewResult.reviewedAt && React.createElement('span', {
                  className: 'text-xs text-slate-500',
                }, new Date(task.reviewResult.reviewedAt).toLocaleString())
              ),
              task.reviewResult.feedback && React.createElement('p', {
                className: 'text-sm text-slate-300 mt-2 bg-slate-900/50 p-3 rounded-lg',
              }, task.reviewResult.feedback),
              task.reviewResult.issues && task.reviewResult.issues.length > 0 &&
                React.createElement('div', { className: 'mt-3 space-y-1' },
                  React.createElement('span', { className: 'text-xs text-slate-500' }, 'Issues:'),
                  ...task.reviewResult.issues.map((issue, i) =>
                    React.createElement('div', {
                      key: i,
                      className: 'text-sm text-slate-300 flex items-start gap-2 bg-amber-500/5 p-2 rounded border border-amber-500/20',
                    },
                      React.createElement('span', { className: 'text-amber-400' }, '!'),
                      issue
                    )
                  )
                )
            )
          ),

          // Review Form
          showReviewForm && React.createElement(Section, { title: 'Request Changes', icon: '✏️' },
            React.createElement('div', { className: 'space-y-3' },
              React.createElement('textarea', {
                value: reviewFeedback,
                onChange: (e) => setReviewFeedback(e.target.value),
                placeholder: 'Describe the changes needed (at least 10 characters)...',
                rows: 4,
                className: `w-full bg-slate-900 border rounded-xl px-4 py-3 text-sm text-slate-200
                  placeholder-slate-500 focus:border-aia-accent focus:outline-none resize-none
                  ${reviewFeedback.length >= 10 ? 'border-emerald-500/30' : 'border-slate-700'}`,
              }),
              React.createElement('div', { className: 'flex items-center justify-between' },
                React.createElement('span', { className: 'text-xs text-slate-500' },
                  `${reviewFeedback.length} / 10 characters minimum`
                ),
                React.createElement('div', { className: 'flex gap-2' },
                  React.createElement('button', {
                    onClick: () => setShowReviewForm(false),
                    className: 'px-4 py-2 text-sm text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-700/50 transition-colors',
                  }, 'Cancel'),
                  React.createElement('button', {
                    onClick: handleRequestChanges,
                    disabled: loading || reviewFeedback.length < 10,
                    className: `px-4 py-2 text-sm font-medium rounded-lg transition-all
                      ${reviewFeedback.length >= 10
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
                        : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      }`,
                  }, loading ? 'Sending...' : 'Request Changes')
                )
              )
            )
          )
        )
      ),

      // Footer Actions
      React.createElement('div', {
        className: 'flex flex-wrap items-center justify-between gap-3 p-4 border-t border-aia-border bg-slate-800/30'
      },
        React.createElement('span', { className: 'text-xs text-slate-600 font-mono' },
          task.id.slice(0, 12) + '...'
        ),
        React.createElement('div', { className: 'flex flex-wrap items-center gap-2' },
          // Run button
          canRun && React.createElement('button', {
            onClick: () => handleAction('run'),
            disabled: actionLoading === 'run',
            className: `inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg
              bg-gradient-to-r from-aia-accent to-sky-400 text-slate-900
              hover:from-aia-accent/90 hover:to-sky-400/90
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all shadow-sm hover:shadow-md hover:shadow-aia-accent/25`,
          },
            actionLoading === 'run' ? React.createElement(LoadingSpinner) : '▶',
            actionLoading === 'run' ? 'Running...' : 'Run Task'
          ),
          // Skip button
          canSkip && React.createElement('button', {
            onClick: () => handleAction('skip'),
            disabled: actionLoading === 'skip',
            className: 'px-4 py-2 text-sm text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-700/50 transition-colors',
          }, actionLoading === 'skip' ? '...' : 'Skip'),
          // Reset button
          canReset && React.createElement('button', {
            onClick: () => handleAction('reset'),
            disabled: actionLoading === 'reset',
            className: 'px-4 py-2 text-sm text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-700/50 transition-colors flex items-center gap-1',
          }, actionLoading === 'reset' ? '...' : '↻ Reset'),
          // Review buttons
          canReview && !showReviewForm && React.createElement(React.Fragment, null,
            React.createElement('button', {
              onClick: () => handleAction('approve'),
              disabled: actionLoading === 'approve',
              className: `inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg
                bg-emerald-500/20 text-emerald-400 border border-emerald-500/30
                hover:bg-emerald-500/30 disabled:opacity-50 transition-all`,
            }, actionLoading === 'approve' ? '...' : '✓ Approve'),
            React.createElement('button', {
              onClick: () => { setShowReviewForm(true); setActiveTab('results'); },
              disabled: actionLoading,
              className: `inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg
                bg-amber-500/20 text-amber-400 border border-amber-500/30
                hover:bg-amber-500/30 disabled:opacity-50 transition-all`,
            }, '↻ Request Changes')
          )
        )
      )
    )
  );
}
