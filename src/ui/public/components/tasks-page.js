/**
 * @fileoverview Tasks Page Component - Full-screen task management experience
 * Provides a comprehensive view of tasks with dependency visualization
 */

import React from 'react';
import { api } from '/main.js';
import { TaskList } from '/components/task-list.js';
import { TaskDetail } from '/components/task-detail.js';

// Dependency graph visualization component
function DependencyGraph({ tasks }) {
  if (!tasks || tasks.length === 0) return null;

  const sortedTasks = [...tasks].sort((a, b) => a.order - b.order);

  // Calculate task positions for the graph
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return { bg: 'bg-emerald-500', border: 'border-emerald-400', text: 'text-emerald-400' };
      case 'in_progress': return { bg: 'bg-amber-500', border: 'border-amber-400', text: 'text-amber-400' };
      case 'failed': return { bg: 'bg-red-500', border: 'border-red-400', text: 'text-red-400' };
      case 'skipped': return { bg: 'bg-slate-600', border: 'border-slate-500', text: 'text-slate-500' };
      default: return { bg: 'bg-slate-500', border: 'border-slate-400', text: 'text-slate-400' };
    }
  };

  return React.createElement('div', {
    className: 'bg-slate-800/30 rounded-xl border border-slate-700/50 p-4 mb-6 overflow-x-auto'
  },
    React.createElement('div', { className: 'flex items-center gap-2 mb-3' },
      React.createElement('span', { className: 'text-slate-400' }, '🔗'),
      React.createElement('h4', { className: 'text-sm font-medium text-slate-300' }, 'Task Flow')
    ),
    // Visual flow
    React.createElement('div', { className: 'flex items-center gap-2 min-w-max pb-2' },
      ...sortedTasks.map((task, index) => {
        const colors = getStatusColor(task.status);
        const hasDependencies = task.dependencies && task.dependencies.length > 0;

        return React.createElement(React.Fragment, { key: task.id },
          // Dependency arrow
          index > 0 && React.createElement('div', {
            className: 'flex items-center text-slate-600'
          },
            React.createElement('div', { className: 'w-4 h-px bg-slate-600' }),
            React.createElement('span', null, '→'),
            React.createElement('div', { className: 'w-4 h-px bg-slate-600' })
          ),
          // Task node
          React.createElement('div', {
            className: `relative flex flex-col items-center group cursor-pointer`,
            title: task.title
          },
            // Node circle
            React.createElement('div', {
              className: `w-10 h-10 rounded-full flex items-center justify-center
                ${colors.bg}/20 border-2 ${colors.border}
                group-hover:scale-110 transition-transform`
            },
              React.createElement('span', { className: `text-sm font-bold ${colors.text}` }, index + 1)
            ),
            // Task title (truncated)
            React.createElement('span', {
              className: 'text-[10px] text-slate-500 mt-1 max-w-16 truncate text-center'
            }, task.title.split(' ').slice(0, 2).join(' ')),
            // Dependency indicator
            hasDependencies && React.createElement('div', {
              className: 'absolute -top-1 -right-1 w-4 h-4 rounded-full bg-violet-500/50 border border-violet-400 flex items-center justify-center'
            },
              React.createElement('span', { className: 'text-[8px] text-violet-200' }, task.dependencies.length)
            )
          )
        );
      })
    ),
    // Legend
    React.createElement('div', { className: 'flex items-center gap-4 mt-4 pt-3 border-t border-slate-700/50' },
      React.createElement('span', { className: 'text-xs text-slate-500' }, 'Legend:'),
      React.createElement('div', { className: 'flex items-center gap-1 text-xs' },
        React.createElement('span', { className: 'w-2 h-2 rounded-full bg-emerald-500' }),
        React.createElement('span', { className: 'text-slate-400' }, 'Completed')
      ),
      React.createElement('div', { className: 'flex items-center gap-1 text-xs' },
        React.createElement('span', { className: 'w-2 h-2 rounded-full bg-amber-500 animate-pulse' }),
        React.createElement('span', { className: 'text-slate-400' }, 'Running')
      ),
      React.createElement('div', { className: 'flex items-center gap-1 text-xs' },
        React.createElement('span', { className: 'w-2 h-2 rounded-full bg-slate-500' }),
        React.createElement('span', { className: 'text-slate-400' }, 'Pending')
      ),
      React.createElement('div', { className: 'flex items-center gap-1 text-xs' },
        React.createElement('span', { className: 'w-2 h-2 rounded-full bg-red-500' }),
        React.createElement('span', { className: 'text-slate-400' }, 'Failed')
      )
    )
  );
}

// Story header component
function StoryHeader({ story, onBack }) {
  if (!story) return null;

  const statusConfig = {
    draft: { label: 'Draft', bgClass: 'bg-slate-500/20', textClass: 'text-slate-400' },
    ready_for_dev: { label: 'Ready for Dev', bgClass: 'bg-violet-500/20', textClass: 'text-violet-400' },
    in_progress: { label: 'In Progress', bgClass: 'bg-amber-500/20', textClass: 'text-amber-400' },
    testing: { label: 'Testing', bgClass: 'bg-sky-500/20', textClass: 'text-sky-400' },
    done: { label: 'Done', bgClass: 'bg-emerald-500/20', textClass: 'text-emerald-400' },
  };

  const config = statusConfig[story.status] || statusConfig.draft;

  return React.createElement('div', {
    className: 'bg-gradient-to-r from-slate-800/50 to-transparent rounded-xl p-5 mb-6 border border-slate-700/50'
  },
    // Breadcrumb
    React.createElement('div', { className: 'flex items-center gap-2 text-sm mb-3' },
      React.createElement('button', {
        onClick: onBack,
        className: 'text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors'
      }, '← Back'),
      React.createElement('span', { className: 'text-slate-600' }, '/'),
      React.createElement('a', {
        href: `#/stories/${story.id}`,
        className: 'text-slate-400 hover:text-aia-accent transition-colors'
      }, story.title)
    ),

    // Title and status
    React.createElement('div', { className: 'flex flex-wrap items-start justify-between gap-4' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'text-2xl font-bold text-slate-100 mb-2' },
          '📋 Task Management'
        ),
        React.createElement('p', { className: 'text-slate-400 text-sm' },
          `Managing implementation tasks for "${story.title}"`
        )
      ),
      React.createElement('div', { className: 'flex items-center gap-3' },
        React.createElement('span', {
          className: `px-3 py-1.5 text-sm rounded-lg ${config.bgClass} ${config.textClass}`
        }, config.label),
        story.taskSummary && React.createElement('span', {
          className: 'text-sm text-slate-500'
        },
          `${story.taskSummary.completed}/${story.taskSummary.total} tasks`
        )
      )
    )
  );
}

// Main Tasks Page component
export function TasksPage({ storyId }) {
  const [story, setStory] = React.useState(null);
  const [tasks, setTasks] = React.useState([]);
  const [selectedTask, setSelectedTask] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [showGraph, setShowGraph] = React.useState(true);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [storyData, tasksData] = await Promise.all([
        api.get(`/stories/${storyId}`),
        api.get(`/stories/${storyId}/tasks`)
      ]);
      setStory(storyData);
      setTasks(tasksData.tasks || []);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  React.useEffect(() => {
    loadData();
  }, [storyId]);

  const handleBack = () => {
    window.history.back();
  };

  const handleTaskSelect = (task) => {
    setSelectedTask(task);
  };

  const handleTaskUpdate = () => {
    loadData();
    setSelectedTask(null);
  };

  // Loading state
  if (loading) {
    return React.createElement('div', { className: 'flex items-center justify-center py-16' },
      React.createElement('div', {
        className: 'w-8 h-8 border-3 border-slate-600 border-t-aia-accent rounded-full animate-spin'
      }),
      React.createElement('span', { className: 'ml-3 text-slate-400' }, 'Loading tasks...')
    );
  }

  // Error state
  if (error) {
    return React.createElement('div', {
      className: 'text-center py-16 px-8 bg-red-500/5 rounded-xl border border-red-500/20'
    },
      React.createElement('span', { className: 'text-5xl mb-4 block' }, '⚠️'),
      React.createElement('h2', { className: 'text-xl font-bold text-red-400 mb-2' }, 'Failed to Load'),
      React.createElement('p', { className: 'text-slate-400 mb-6' }, error),
      React.createElement('div', { className: 'flex justify-center gap-3' },
        React.createElement('button', {
          onClick: handleBack,
          className: 'px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors'
        }, '← Go Back'),
        React.createElement('button', {
          onClick: loadData,
          className: 'px-4 py-2 text-sm bg-aia-accent/20 text-aia-accent rounded-lg hover:bg-aia-accent/30 transition-colors'
        }, 'Try Again')
      )
    );
  }

  return React.createElement('div', { className: 'space-y-0' },
    // Story header
    React.createElement(StoryHeader, { story, onBack: handleBack }),

    // Graph toggle
    tasks.length > 0 && React.createElement('div', { className: 'flex items-center justify-end mb-4' },
      React.createElement('button', {
        onClick: () => setShowGraph(!showGraph),
        className: `flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors
          ${showGraph
            ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
            : 'text-slate-500 hover:text-slate-300'}`
      },
        React.createElement('span', null, showGraph ? '📊' : '📊'),
        showGraph ? 'Hide Flow' : 'Show Flow'
      )
    ),

    // Dependency graph
    showGraph && tasks.length > 0 && React.createElement(DependencyGraph, { tasks }),

    // Task list
    React.createElement(TaskList, {
      storyId,
      onTaskSelect: handleTaskSelect,
      compact: false
    }),

    // Task detail modal
    selectedTask && React.createElement(TaskDetail, {
      task: selectedTask,
      storyId,
      onClose: () => setSelectedTask(null),
      onUpdate: handleTaskUpdate
    })
  );
}
