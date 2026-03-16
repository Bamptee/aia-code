/**
 * Roadmap View Component
 * Planning visualization with time-based Epic organization
 */

import React from 'react';
import { api } from '/main.js';

const { useState, useEffect, useCallback } = React;

// Status badge component
function StatusBadge({ status }) {
  const colors = {
    draft: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    active: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    done: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  };
  return React.createElement('span', {
    className: `px-2 py-0.5 rounded text-xs border ${colors[status] || colors.draft}`,
  }, status);
}

// Progress bar component
function ProgressBar({ progress, size = 'md' }) {
  const heights = { sm: 'h-1', md: 'h-1.5', lg: 'h-2' };
  return React.createElement('div', {
    className: `w-full bg-slate-700 rounded-full ${heights[size]}`,
  },
    React.createElement('div', {
      className: 'bg-aia-accent rounded-full h-full transition-all duration-300',
      style: { width: `${progress}%` },
    })
  );
}

// Epic card for roadmap
function RoadmapEpicCard({ epic, onDragStart, onAssignPeriod }) {
  const handleDragStart = (e) => {
    // Set drag data and visual feedback
    e.dataTransfer.setData('text/plain', epic.id);
    e.dataTransfer.effectAllowed = 'move';
    // Add a class for visual feedback during drag
    e.target.classList.add('opacity-50');
    if (onDragStart) onDragStart(epic.id);
  };

  const handleDragEnd = (e) => {
    // Remove visual feedback
    e.target.classList.remove('opacity-50');
  };

  return React.createElement('div', {
    className: 'bg-slate-800/50 rounded-lg p-3 border border-slate-700 hover:border-slate-600 cursor-grab active:cursor-grabbing transition-all group',
    draggable: true,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
  },
    React.createElement('div', { className: 'flex items-start justify-between gap-2 mb-2' },
      React.createElement('a', {
        href: `#/epics/${epic.id}`,
        className: 'font-medium text-slate-200 hover:text-aia-accent text-sm truncate flex-1',
      }, epic.name),
      React.createElement(StatusBadge, { status: epic.status })
    ),
    React.createElement('div', { className: 'flex items-center gap-3 text-xs text-slate-400' },
      React.createElement('span', null, `${epic.storyCount} stories`),
      React.createElement('span', null, `${epic.progress}%`)
    ),
    React.createElement('div', { className: 'mt-2' },
      React.createElement(ProgressBar, { progress: epic.progress, size: 'sm' })
    )
  );
}

// Period column
function PeriodColumn({ period, epics, isCurrentPeriod, onDrop, onRemoveFromPeriod }) {
  const [dragCounter, setDragCounter] = useState(0);

  // Use counter-based approach to handle dragEnter/Leave properly with nested elements
  const handleDragEnter = (e) => {
    e.preventDefault();
    setDragCounter(prev => prev + 1);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragCounter(prev => prev - 1);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragCounter(0);
    const epicId = e.dataTransfer.getData('text/plain');
    if (epicId && onDrop) {
      onDrop(epicId, period);
    }
  };

  const isDragOver = dragCounter > 0;

  // Format period label for display
  const formatPeriodLabel = (p) => {
    if (p.includes('-Q')) {
      const [year, quarter] = p.split('-');
      return `Q${quarter.replace('Q', '')} ${year}`;
    }
    if (p.includes('-W')) {
      const [year, week] = p.split('-W');
      return `S${week} ${year}`;
    }
    // Monthly
    const [year, month] = p.split('-');
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
  };

  return React.createElement('div', {
    className: `flex-shrink-0 w-72 bg-slate-800/30 rounded-lg border transition-all ${
      isDragOver ? 'border-aia-accent bg-slate-800/50' :
      isCurrentPeriod ? 'border-aia-accent/50' : 'border-slate-700'
    }`,
    onDragEnter: handleDragEnter,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  },
    // Header
    React.createElement('div', {
      className: `px-4 py-3 border-b ${isCurrentPeriod ? 'border-aia-accent/30 bg-aia-accent/10' : 'border-slate-700'}`,
    },
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('h3', { className: 'font-medium text-slate-200' }, formatPeriodLabel(period)),
        isCurrentPeriod && React.createElement('span', {
          className: 'text-xs bg-aia-accent/20 text-aia-accent px-2 py-0.5 rounded',
        }, 'Actuel')
      ),
      React.createElement('div', { className: 'text-xs text-slate-500 mt-1' },
        `${epics.length} epic${epics.length !== 1 ? 's' : ''}`
      )
    ),
    // Epics list
    React.createElement('div', { className: 'p-3 space-y-2 min-h-[200px]' },
      epics.length === 0
        ? React.createElement('div', { className: 'text-center text-slate-500 text-sm py-8' },
            'Déposer des epics ici'
          )
        : epics.map((epic, index) =>
            React.createElement(RoadmapEpicCard, {
              key: epic.id || `epic-${index}`,
              epic,
            })
          )
    )
  );
}

// Backlog / Unplanned section
function BacklogSection({ epics, onDrop }) {
  const [dragCounter, setDragCounter] = useState(0);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleDragEnter = (e) => {
    e.preventDefault();
    setDragCounter(prev => prev + 1);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragCounter(prev => prev - 1);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragCounter(0);
    const epicId = e.dataTransfer.getData('text/plain');
    if (epicId && onDrop) {
      onDrop(epicId, null); // null means unassign
    }
  };

  const isDragOver = dragCounter > 0;

  return React.createElement('div', {
    className: `bg-slate-800/30 rounded-lg border transition-all ${
      isDragOver ? 'border-amber-500 bg-slate-800/50' : 'border-slate-700'
    }`,
    onDragEnter: handleDragEnter,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  },
    // Header
    React.createElement('button', {
      className: 'w-full px-4 py-3 flex items-center justify-between border-b border-slate-700 hover:bg-slate-700/30 transition-colors',
      onClick: () => setIsExpanded(!isExpanded),
    },
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('span', { className: 'text-amber-400' },
          React.createElement('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
            React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' })
          )
        ),
        React.createElement('h3', { className: 'font-medium text-slate-200' }, 'Backlog'),
        React.createElement('span', {
          className: 'bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded text-xs',
        }, epics.length)
      ),
      React.createElement('svg', {
        className: `w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`,
        fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24',
      },
        React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 9l-7 7-7-7' })
      )
    ),
    // Epics grid
    isExpanded && React.createElement('div', { className: 'p-4' },
      epics.length === 0
        ? React.createElement('div', { className: 'text-center text-slate-500 text-sm py-4' },
            'Aucun epic non planifié'
          )
        : React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3' },
            epics.map((epic, index) =>
              React.createElement(RoadmapEpicCard, { key: epic.id || `backlog-${index}`, epic })
            )
          )
    )
  );
}

// Granularity selector
function GranularitySelector({ value, onChange }) {
  const options = [
    { value: 'weekly', label: 'Hebdo' },
    { value: 'monthly', label: 'Mensuel' },
    { value: 'quarterly', label: 'Trimestriel' },
  ];

  return React.createElement('div', { className: 'flex bg-slate-800 rounded-lg p-1 border border-slate-700' },
    options.map(opt =>
      React.createElement('button', {
        key: opt.value,
        onClick: () => onChange(opt.value),
        className: `px-3 py-1.5 text-sm rounded-md transition-colors ${
          value === opt.value
            ? 'bg-aia-accent text-white'
            : 'text-slate-400 hover:text-slate-200'
        }`,
      }, opt.label)
    )
  );
}

// Stats cards
function StatsCard({ label, value, color = 'sky' }) {
  const colors = {
    sky: 'text-sky-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    violet: 'text-violet-400',
  };

  return React.createElement('div', { className: 'bg-slate-800/50 rounded-lg p-4 border border-slate-700' },
    React.createElement('div', { className: `text-2xl font-bold ${colors[color]}` }, value),
    React.createElement('div', { className: 'text-xs text-slate-400 mt-1' }, label)
  );
}

// Main Roadmap View
export function RoadmapView() {
  const [roadmapData, setRoadmapData] = useState(null);
  const [granularity, setGranularity] = useState(() => {
    return localStorage.getItem('roadmap-granularity') || 'quarterly';
  });
  const [periodsAhead, setPeriodsAhead] = useState(6);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  const loadRoadmap = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get(`/roadmap?granularity=${granularity}&periodsAhead=${periodsAhead}&includeCompleted=${includeCompleted}`);
      setRoadmapData(data);

      // Load stats
      const statsData = await api.get('/roadmap/stats');
      setStats(statsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [granularity, periodsAhead, includeCompleted]);

  useEffect(() => {
    loadRoadmap();
  }, [loadRoadmap]);

  // Save granularity preference
  useEffect(() => {
    localStorage.setItem('roadmap-granularity', granularity);
  }, [granularity]);

  const handleAssignPeriod = async (epicId, period) => {
    try {
      if (period === null) {
        await api.post('/roadmap/unassign', { epicId });
      } else {
        await api.post('/roadmap/assign', { epicId, period });
      }
      await loadRoadmap();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading && !roadmapData) {
    return React.createElement('div', { className: 'flex items-center justify-center h-64' },
      React.createElement('div', { className: 'animate-spin rounded-full h-8 w-8 border-b-2 border-aia-accent' })
    );
  }

  if (error && !roadmapData) {
    return React.createElement('div', { className: 'text-center py-12' },
      React.createElement('div', { className: 'text-red-400 mb-4' }, error),
      React.createElement('button', {
        onClick: loadRoadmap,
        className: 'px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm',
      }, 'Réessayer')
    );
  }

  const periods = roadmapData ? Object.keys(roadmapData.periods) : [];

  return React.createElement('div', { className: 'space-y-6' },
    // Header
    React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'text-2xl font-bold text-slate-100' }, 'Roadmap'),
        React.createElement('p', { className: 'text-slate-400 text-sm mt-1' },
          'Planification des Epics par période'
        )
      ),
      React.createElement('div', { className: 'flex items-center gap-4' },
        React.createElement(GranularitySelector, {
          value: granularity,
          onChange: setGranularity,
        }),
        React.createElement('label', { className: 'flex items-center gap-2 text-sm text-slate-400' },
          React.createElement('input', {
            type: 'checkbox',
            checked: includeCompleted,
            onChange: (e) => setIncludeCompleted(e.target.checked),
            className: 'rounded border-slate-600 bg-slate-700 text-aia-accent focus:ring-aia-accent',
          }),
          'Terminés'
        )
      )
    ),

    // Stats
    stats && React.createElement('div', { className: 'grid grid-cols-4 gap-4' },
      React.createElement(StatsCard, { label: 'Total Epics', value: stats.totalEpics, color: 'sky' }),
      React.createElement(StatsCard, { label: 'Planifiés', value: stats.planned, color: 'emerald' }),
      React.createElement(StatsCard, { label: 'Non planifiés', value: stats.unplanned, color: 'amber' }),
      React.createElement(StatsCard, {
        label: 'En cours',
        value: stats.byStatus?.active || 0,
        color: 'violet',
      })
    ),

    // Error toast
    error && React.createElement('div', {
      className: 'bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm',
    }, error),

    // Timeline
    roadmapData && React.createElement('div', { className: 'overflow-x-auto pb-4' },
      React.createElement('div', { className: 'flex gap-4 min-w-max' },
        periods.map(period =>
          React.createElement(PeriodColumn, {
            key: period,
            period,
            epics: roadmapData.periods[period] || [],
            isCurrentPeriod: period === roadmapData.currentPeriod,
            onDrop: handleAssignPeriod,
          })
        )
      )
    ),

    // Backlog
    roadmapData && React.createElement(BacklogSection, {
      epics: roadmapData.unplanned || [],
      onDrop: handleAssignPeriod,
    }),

    // Legend
    React.createElement('div', { className: 'flex items-center gap-6 text-xs text-slate-500 pt-4 border-t border-slate-800' },
      React.createElement('span', null, 'Glisser-déposer les epics pour les planifier'),
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('div', { className: 'w-3 h-3 rounded bg-slate-500/50' }),
        React.createElement('span', null, 'Draft')
      ),
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('div', { className: 'w-3 h-3 rounded bg-sky-500/50' }),
        React.createElement('span', null, 'Actif')
      ),
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('div', { className: 'w-3 h-3 rounded bg-emerald-500/50' }),
        React.createElement('span', null, 'Terminé')
      )
    )
  );
}
