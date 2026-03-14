/**
 * @fileoverview Task List Component - Display and manage tasks for a story
 * Enhanced with beautiful visual design, animations, and dependency visualization
 */

import React from 'react';
import { api } from '/main.js';

// Task status configurations with enhanced visuals
const TASK_STATUS = {
  pending: {
    label: 'Pending',
    icon: '○',
    bgClass: 'bg-slate-500/20',
    textClass: 'text-slate-400',
    borderClass: 'border-slate-500/30',
    gradient: 'from-slate-500/0 to-slate-500/5'
  },
  in_progress: {
    label: 'Running',
    icon: '◐',
    bgClass: 'bg-amber-500/20',
    textClass: 'text-amber-400',
    borderClass: 'border-amber-500/30',
    gradient: 'from-amber-500/0 to-amber-500/10',
    pulse: true
  },
  completed: {
    label: 'Completed',
    icon: '●',
    bgClass: 'bg-emerald-500/20',
    textClass: 'text-emerald-400',
    borderClass: 'border-emerald-500/30',
    gradient: 'from-emerald-500/0 to-emerald-500/5'
  },
  failed: {
    label: 'Failed',
    icon: '✗',
    bgClass: 'bg-red-500/20',
    textClass: 'text-red-400',
    borderClass: 'border-red-500/30',
    gradient: 'from-red-500/0 to-red-500/5'
  },
  skipped: {
    label: 'Skipped',
    icon: '⊘',
    bgClass: 'bg-slate-700/50',
    textClass: 'text-slate-500',
    borderClass: 'border-slate-600',
    gradient: 'from-slate-700/0 to-slate-700/10'
  },
};

// Review status configurations
const REVIEW_STATUS = {
  pending: { label: 'Pending Review', icon: '👀', textClass: 'text-slate-400', bgClass: 'bg-slate-500/10' },
  approved: { label: 'Approved', icon: '✓', textClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10' },
  changes_requested: { label: 'Changes Requested', icon: '↻', textClass: 'text-amber-400', bgClass: 'bg-amber-500/10' },
};

// Animated loading spinner
function LoadingSpinner({ size = 'md' }) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-5 h-5 border-2',
    lg: 'w-8 h-8 border-3'
  };
  return React.createElement('div', {
    className: `${sizeClasses[size]} border-slate-600 border-t-aia-accent rounded-full animate-spin`
  });
}

// Beautiful task card with modern design
function TaskCard({ task, storyId, onTaskUpdate, onTaskSelect, allTasks, index }) {
  const [actionLoading, setActionLoading] = React.useState(null);
  const statusConfig = TASK_STATUS[task.status] || TASK_STATUS.pending;
  const reviewConfig = task.reviewResult ? REVIEW_STATUS[task.reviewResult.status] : null;

  // Check if task can run (dependencies met)
  const canRunTask = React.useMemo(() => {
    if (task.status !== 'pending') return false;
    if (!task.dependencies || task.dependencies.length === 0) return true;
    return task.dependencies.every(depId => {
      const depTask = allTasks.find(t => t.id === depId);
      return depTask && (depTask.status === 'completed' || depTask.status === 'skipped');
    });
  }, [task, allTasks]);

  // Get blocking dependencies
  const blockingDeps = React.useMemo(() => {
    if (!task.dependencies || task.dependencies.length === 0) return [];
    return task.dependencies
      .map(depId => {
        const depTask = allTasks.find(t => t.id === depId);
        if (depTask && depTask.status !== 'completed' && depTask.status !== 'skipped') {
          return depTask;
        }
        return null;
      })
      .filter(Boolean);
  }, [task, allTasks]);

  const handleAction = async (action, e) => {
    if (e) e.stopPropagation();
    setActionLoading(action);
    try {
      await api.post(`/stories/${storyId}/tasks/${task.id}/${action}`);
      onTaskUpdate();
    } catch (err) {
      alert(err.message);
    }
    setActionLoading(null);
  };

  const canRun = task.status === 'pending' && canRunTask;
  const canReset = task.status === 'completed' || task.status === 'failed' || task.status === 'skipped';
  const canSkip = task.status === 'pending';
  const canReview = task.status === 'completed' && (!task.reviewResult || task.reviewResult.status !== 'approved');

  return React.createElement('div', {
    className: `relative group border rounded-xl transition-all duration-300 cursor-pointer overflow-hidden
      ${statusConfig.bgClass} ${statusConfig.borderClass}
      hover:border-aia-accent/50 hover:shadow-lg hover:shadow-aia-accent/10
      bg-gradient-to-br ${statusConfig.gradient}`,
    onClick: () => onTaskSelect && onTaskSelect(task),
  },
    // Animated glow for running tasks
    task.status === 'in_progress' && React.createElement('div', {
      className: 'absolute inset-0 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/10 animate-pulse',
      style: { animationDuration: '2s' }
    }),

    React.createElement('div', { className: 'relative p-4' },
      // Header with order badge and status
      React.createElement('div', { className: 'flex items-start justify-between gap-3 mb-3' },
        React.createElement('div', { className: 'flex items-center gap-3 min-w-0' },
          // Order badge
          React.createElement('div', {
            className: `flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg
              ${statusConfig.bgClass} ${statusConfig.textClass} border ${statusConfig.borderClass}
              font-mono text-sm font-bold`
          }, index + 1),
          // Title and blocked info
          React.createElement('div', { className: 'min-w-0' },
            React.createElement('h4', {
              className: 'font-semibold text-slate-100 group-hover:text-white transition-colors truncate'
            }, task.title),
            blockingDeps.length > 0 && React.createElement('p', {
              className: 'text-xs text-amber-400/80 mt-0.5 flex items-center gap-1'
            },
              '⏳ Waiting for: ',
              blockingDeps.map(d => `#${d.order + 1}`).join(', ')
            )
          )
        ),
        // Status badge
        React.createElement('div', { className: 'flex items-center gap-2 flex-shrink-0' },
          React.createElement('span', {
            className: `text-lg ${statusConfig.textClass} ${task.status === 'in_progress' ? 'animate-spin' : ''}`
          }, statusConfig.icon),
          React.createElement('span', {
            className: `hidden sm:inline px-2.5 py-1 text-xs rounded-full font-medium
              ${statusConfig.bgClass} ${statusConfig.textClass} border ${statusConfig.borderClass}`,
          }, statusConfig.label)
        )
      ),

      // File badges
      task.files && task.files.length > 0 && React.createElement('div', {
        className: 'flex flex-wrap gap-1.5 mb-3',
      },
        ...task.files.slice(0, 4).map(file =>
          React.createElement('span', {
            key: file,
            className: 'inline-flex items-center gap-1 text-xs bg-slate-800/80 text-slate-300 px-2 py-1 rounded-md font-mono border border-slate-700/50',
          },
            React.createElement('span', { className: 'text-aia-accent text-[10px]' }, '📄'),
            file.split('/').pop()
          )
        ),
        task.files.length > 4 && React.createElement('span', {
          className: 'text-xs text-slate-500 px-2 py-1',
        }, `+${task.files.length - 4} more`)
      ),

      // Dependencies resolved indicator
      task.dependencies && task.dependencies.length > 0 && blockingDeps.length === 0 && React.createElement('div', {
        className: 'flex items-center gap-1.5 text-xs text-emerald-400/80 mb-3',
      }, '✓ ', `${task.dependencies.length} dependencies resolved`),

      // Review status
      reviewConfig && React.createElement('div', {
        className: `flex items-center gap-1.5 text-xs ${reviewConfig.textClass} ${reviewConfig.bgClass} px-2 py-1 rounded-md w-fit mb-3`,
      },
        React.createElement('span', null, reviewConfig.icon),
        React.createElement('span', null, reviewConfig.label)
      ),

      // Action buttons
      React.createElement('div', {
        className: 'flex flex-wrap items-center gap-2 pt-3 border-t border-slate-700/50'
      },
        // Run button
        canRun && React.createElement('button', {
          onClick: (e) => handleAction('run', e),
          disabled: actionLoading === 'run',
          className: `inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
            bg-gradient-to-r from-aia-accent to-sky-400 text-slate-900
            hover:from-aia-accent/90 hover:to-sky-400/90
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-aia-accent/25`,
        },
          actionLoading === 'run' ? React.createElement(LoadingSpinner, { size: 'sm' }) : '▶',
          actionLoading === 'run' ? 'Running...' : 'Run'
        ),

        // Blocked indicator
        task.status === 'pending' && !canRunTask && React.createElement('span', {
          className: 'text-xs text-slate-500 flex items-center gap-1',
        }, '🔒 Blocked'),

        // Skip button
        canSkip && React.createElement('button', {
          onClick: (e) => handleAction('skip', e),
          disabled: actionLoading === 'skip',
          className: 'px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors',
        }, actionLoading === 'skip' ? '...' : 'Skip'),

        // Reset button
        canReset && React.createElement('button', {
          onClick: (e) => handleAction('reset', e),
          disabled: actionLoading === 'reset',
          className: 'px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors flex items-center gap-1',
        }, actionLoading === 'reset' ? '...' : '↻ Reset'),

        // Spacer
        React.createElement('div', { className: 'flex-1' }),

        // Approve button
        canReview && React.createElement('button', {
          onClick: (e) => handleAction('approve', e),
          disabled: actionLoading === 'approve',
          className: `inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
            bg-emerald-500/20 text-emerald-400 border border-emerald-500/30
            hover:bg-emerald-500/30 hover:border-emerald-500/50
            disabled:opacity-50 transition-all duration-200`,
        },
          actionLoading === 'approve' ? '...' : '✓ Approve'
        )
      )
    )
  );
}

// Enhanced progress bar with animated segments
function ProgressBar({ summary }) {
  if (!summary || summary.total === 0) return null;

  const completed = summary.completed + summary.skipped;
  const percentage = Math.round((completed / summary.total) * 100);

  return React.createElement('div', {
    className: 'mb-6 p-4 bg-gradient-to-br from-slate-800/50 to-slate-800/30 rounded-xl border border-slate-700/50'
  },
    // Header
    React.createElement('div', { className: 'flex items-center justify-between mb-3' },
      React.createElement('span', { className: 'text-sm text-slate-300 font-medium' }, 'Progress'),
      React.createElement('span', { className: 'text-2xl font-bold text-white' }, `${percentage}%`)
    ),

    // Multi-segment progress bar
    React.createElement('div', { className: 'h-3 bg-slate-700/50 rounded-full overflow-hidden flex' },
      summary.completed > 0 && React.createElement('div', {
        className: 'h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500',
        style: { width: `${Math.round((summary.completed / summary.total) * 100)}%` },
      }),
      summary.skipped > 0 && React.createElement('div', {
        className: 'h-full bg-slate-500 transition-all duration-500',
        style: { width: `${Math.round((summary.skipped / summary.total) * 100)}%` },
      }),
      summary.inProgress > 0 && React.createElement('div', {
        className: 'h-full bg-gradient-to-r from-amber-500 to-amber-400 animate-pulse transition-all duration-500',
        style: { width: `${Math.round((summary.inProgress / summary.total) * 100)}%` },
      }),
      summary.failed > 0 && React.createElement('div', {
        className: 'h-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-500',
        style: { width: `${Math.round((summary.failed / summary.total) * 100)}%` },
      })
    ),

    // Stats row
    React.createElement('div', { className: 'flex flex-wrap items-center justify-center gap-4 sm:gap-6 mt-4 text-xs' },
      React.createElement('div', { className: 'flex items-center gap-1.5' },
        React.createElement('span', { className: 'w-2 h-2 rounded-full bg-emerald-500' }),
        React.createElement('span', { className: 'text-slate-400' }, `${summary.completed} completed`)
      ),
      summary.inProgress > 0 && React.createElement('div', { className: 'flex items-center gap-1.5' },
        React.createElement('span', { className: 'w-2 h-2 rounded-full bg-amber-500 animate-pulse' }),
        React.createElement('span', { className: 'text-amber-400' }, `${summary.inProgress} running`)
      ),
      React.createElement('div', { className: 'flex items-center gap-1.5' },
        React.createElement('span', { className: 'w-2 h-2 rounded-full bg-slate-500' }),
        React.createElement('span', { className: 'text-slate-400' }, `${summary.pending} pending`)
      ),
      summary.failed > 0 && React.createElement('div', { className: 'flex items-center gap-1.5' },
        React.createElement('span', { className: 'w-2 h-2 rounded-full bg-red-500' }),
        React.createElement('span', { className: 'text-red-400' }, `${summary.failed} failed`)
      ),
      summary.skipped > 0 && React.createElement('div', { className: 'flex items-center gap-1.5' },
        React.createElement('span', { className: 'w-2 h-2 rounded-full bg-slate-600' }),
        React.createElement('span', { className: 'text-slate-500' }, `${summary.skipped} skipped`)
      )
    )
  );
}

// Empty state component
function EmptyState({ onSplit, splitting }) {
  return React.createElement('div', {
    className: 'text-center py-16 px-8 border-2 border-dashed border-slate-700/50 rounded-2xl bg-gradient-to-b from-slate-800/20 to-transparent'
  },
    // Icon
    React.createElement('div', {
      className: 'w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-aia-accent/20 to-violet-500/20 flex items-center justify-center border border-aia-accent/20'
    },
      React.createElement('span', { className: 'text-4xl' }, '📋')
    ),
    React.createElement('h3', { className: 'text-xl font-semibold text-slate-200 mb-2' }, 'No Tasks Yet'),
    React.createElement('p', { className: 'text-slate-400 mb-6 max-w-md mx-auto' },
      'Split your story into discrete implementation tasks for better tracking, review, and execution.'
    ),
    // Benefits
    React.createElement('div', { className: 'flex flex-wrap justify-center gap-4 sm:gap-6 mb-8 text-sm text-slate-500' },
      React.createElement('div', { className: 'flex items-center gap-1.5' },
        React.createElement('span', { className: 'text-emerald-400' }, '✓'), 'Focused execution'
      ),
      React.createElement('div', { className: 'flex items-center gap-1.5' },
        React.createElement('span', { className: 'text-emerald-400' }, '✓'), 'Individual review'
      ),
      React.createElement('div', { className: 'flex items-center gap-1.5' },
        React.createElement('span', { className: 'text-emerald-400' }, '✓'), 'Dependency tracking'
      )
    ),
    React.createElement('button', {
      onClick: onSplit,
      disabled: splitting,
      className: `inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium
        bg-gradient-to-r from-aia-accent to-violet-500 text-slate-900
        hover:from-aia-accent/90 hover:to-violet-500/90
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-all duration-200 shadow-lg shadow-aia-accent/25 hover:shadow-xl hover:shadow-aia-accent/30`,
    },
      splitting ? React.createElement(LoadingSpinner, { size: 'sm' }) : '✨',
      splitting ? 'Generating Tasks...' : 'Generate Tasks with AI'
    )
  );
}

// Main TaskList component
export function TaskList({ storyId, onTaskSelect, compact = false }) {
  const [tasks, setTasks] = React.useState([]);
  const [summary, setSummary] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [runningAll, setRunningAll] = React.useState(false);
  const [splitting, setSplitting] = React.useState(false);
  const [reviewingAll, setReviewingAll] = React.useState(false);

  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/stories/${storyId}/tasks`);
      setTasks(data.tasks || []);
      setSummary(data.summary || null);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  React.useEffect(() => {
    loadTasks();
    // Auto-refresh while tasks are running
    const interval = setInterval(() => {
      if (tasks.some(t => t.status === 'in_progress')) {
        loadTasks();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [storyId]);

  const handleSplit = async () => {
    setSplitting(true);
    try {
      await api.post(`/stories/${storyId}/tasks/split`);
      await loadTasks();
    } catch (err) {
      alert(err.message);
    }
    setSplitting(false);
  };

  const handleRunAll = async () => {
    setRunningAll(true);
    try {
      await api.post(`/stories/${storyId}/tasks/run-all`);
      await loadTasks();
    } catch (err) {
      alert(err.message);
    }
    setRunningAll(false);
  };

  const handleReviewAll = async () => {
    setReviewingAll(true);
    try {
      const result = await api.post(`/stories/${storyId}/tasks/review-all`, { mode: 'individual' });
      alert(`Reviewed ${result.tasksReviewed} tasks`);
      await loadTasks();
    } catch (err) {
      alert(err.message);
    }
    setReviewingAll(false);
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to delete all tasks? This cannot be undone.')) return;
    try {
      await api.delete(`/stories/${storyId}/tasks`);
      await loadTasks();
    } catch (err) {
      alert(err.message);
    }
  };

  // Loading state
  if (loading) {
    return React.createElement('div', { className: 'flex items-center justify-center py-12' },
      React.createElement(LoadingSpinner, { size: 'lg' }),
      React.createElement('span', { className: 'ml-3 text-slate-400' }, 'Loading tasks...')
    );
  }

  // Error state
  if (error) {
    return React.createElement('div', {
      className: 'text-center py-12 px-8 bg-red-500/5 rounded-xl border border-red-500/20'
    },
      React.createElement('span', { className: 'text-4xl mb-4 block' }, '⚠️'),
      React.createElement('p', { className: 'text-red-400 mb-4' }, error),
      React.createElement('button', {
        onClick: loadTasks,
        className: 'text-sm text-aia-accent hover:underline',
      }, 'Try again')
    );
  }

  // Empty state
  if (tasks.length === 0) {
    return React.createElement(EmptyState, { onSplit: handleSplit, splitting });
  }

  const sortedTasks = [...tasks].sort((a, b) => a.order - b.order);
  const hasPendingTasks = summary?.pending > 0;
  const hasCompletedTasks = summary?.completed > 0;

  return React.createElement('div', { className: 'space-y-6' },
    // Header with actions
    !compact && React.createElement('div', { className: 'flex flex-wrap items-center justify-between gap-4' },
      React.createElement('div', null,
        React.createElement('h3', { className: 'text-xl font-bold text-slate-100' }, 'Implementation Tasks'),
        React.createElement('p', { className: 'text-sm text-slate-500 mt-1' },
          `${summary?.total || 0} tasks • ${summary?.completed || 0} completed`
        )
      ),
      React.createElement('div', { className: 'flex flex-wrap items-center gap-2' },
        // Run all button
        hasPendingTasks && React.createElement('button', {
          onClick: handleRunAll,
          disabled: runningAll,
          className: `inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
            bg-gradient-to-r from-aia-accent to-sky-400 text-slate-900
            hover:from-aia-accent/90 hover:to-sky-400/90
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all shadow-sm hover:shadow-md hover:shadow-aia-accent/25`,
        },
          runningAll ? React.createElement(LoadingSpinner, { size: 'sm' }) : null,
          runningAll ? 'Running...' : '▶ Run All'
        ),
        // Review all button
        hasCompletedTasks && React.createElement('button', {
          onClick: handleReviewAll,
          disabled: reviewingAll,
          className: `inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
            bg-violet-500/20 text-violet-400 border border-violet-500/30
            hover:bg-violet-500/30 disabled:opacity-50 transition-colors`,
        }, reviewingAll ? '...' : '👀 Review All'),
        // Delete all button
        React.createElement('button', {
          onClick: handleClearAll,
          className: 'p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors',
          title: 'Delete all tasks',
        }, '🗑')
      )
    ),

    // Progress bar
    !compact && summary && React.createElement(ProgressBar, { summary }),

    // Task cards
    React.createElement('div', { className: compact ? 'space-y-3' : 'space-y-4' },
      ...sortedTasks.map((task) =>
        React.createElement(TaskCard, {
          key: task.id,
          task,
          storyId,
          onTaskUpdate: loadTasks,
          onTaskSelect,
          allTasks: tasks,
          index: task.order,
        })
      )
    ),

    // Regenerate link
    !compact && tasks.length > 0 && React.createElement('div', { className: 'text-center pt-4' },
      React.createElement('button', {
        onClick: handleSplit,
        disabled: splitting,
        className: 'text-sm text-slate-500 hover:text-slate-300 transition-colors',
      }, splitting ? 'Regenerating...' : '✨ Regenerate tasks with AI')
    )
  );
}
