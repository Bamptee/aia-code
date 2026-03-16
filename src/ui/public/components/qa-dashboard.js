/**
 * QA Dashboard Component
 * Testing queue management with approval/rejection workflow
 */

import React from 'react';
import { api } from '/main.js';

const { useState, useEffect, useCallback } = React;

// Status badge
function StatusBadge({ status }) {
  const colors = {
    draft: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    ready_for_dev: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    in_progress: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    testing: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    done: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  };
  const labels = {
    draft: 'Brouillon',
    ready_for_dev: 'Prêt',
    in_progress: 'En cours',
    testing: 'Test',
    done: 'Terminé',
  };
  return React.createElement('span', {
    className: `px-2 py-0.5 rounded text-xs border ${colors[status] || colors.draft}`,
  }, labels[status] || status);
}

// Type badge
function TypeBadge({ type }) {
  const config = {
    feature: { bg: 'bg-sky-500/20', text: 'text-sky-300', border: 'border-sky-500/30', label: 'Feature' },
    bug: { bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500/30', label: 'Bug' },
  };
  const c = config[type] || config.feature;
  return React.createElement('span', {
    className: `px-2 py-0.5 rounded text-xs border ${c.bg} ${c.text} ${c.border}`,
  }, c.label);
}

// Stats card
function StatsCard({ label, value, color = 'sky', icon }) {
  const colors = {
    sky: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
  };
  return React.createElement('div', {
    className: `rounded-lg p-4 border ${colors[color]}`,
  },
    React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('div', null,
        React.createElement('div', { className: 'text-2xl font-bold' }, value),
        React.createElement('div', { className: 'text-xs text-slate-400 mt-1' }, label)
      ),
      icon && React.createElement('div', { className: 'text-2xl opacity-50' }, icon)
    )
  );
}

// Rejection modal
function RejectModal({ story, onClose, onReject }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (reason.length < 10) {
      setError('La raison doit contenir au moins 10 caractères');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onReject(story.id, reason);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return React.createElement('div', {
    className: 'fixed inset-0 bg-black/50 flex items-center justify-center z-50',
    onClick: onClose,
  },
    React.createElement('div', {
      className: 'bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg mx-4 p-6',
      onClick: (e) => e.stopPropagation(),
    },
      React.createElement('h2', { className: 'text-xl font-bold text-slate-100 mb-4' }, 'Rejeter la story'),
      React.createElement('div', { className: 'bg-slate-700/50 rounded-lg p-3 mb-4' },
        React.createElement('div', { className: 'font-medium text-slate-200' }, story.title),
        React.createElement('div', { className: 'flex items-center gap-2 mt-2' },
          React.createElement(TypeBadge, { type: story.type }),
          React.createElement('span', { className: 'text-xs text-slate-400' }, story.epicName)
        )
      ),
      React.createElement('form', { onSubmit: handleSubmit },
        React.createElement('div', { className: 'mb-4' },
          React.createElement('label', { className: 'block text-sm text-slate-300 mb-2' },
            'Raison du rejet *'
          ),
          React.createElement('textarea', {
            value: reason,
            onChange: (e) => setReason(e.target.value),
            rows: 4,
            placeholder: 'Décrivez le problème rencontré (minimum 10 caractères)...',
            className: 'w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent',
          }),
          React.createElement('div', { className: 'text-xs text-slate-500 mt-1' },
            `${reason.length} / 10 caractères minimum`
          )
        ),
        error && React.createElement('div', {
          className: 'mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm',
        }, error),
        React.createElement('div', {
          className: 'bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4 text-sm text-amber-300',
        },
          'Un bug sera automatiquement créé et lié à cette story.'
        ),
        React.createElement('div', { className: 'flex gap-3' },
          React.createElement('button', {
            type: 'button',
            onClick: onClose,
            className: 'flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200 transition-colors',
          }, 'Annuler'),
          React.createElement('button', {
            type: 'submit',
            disabled: loading || reason.length < 10,
            className: 'flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg text-white transition-colors',
          }, loading ? 'Rejet en cours...' : 'Rejeter')
        )
      )
    )
  );
}

// Approval confirmation modal
function ApproveModal({ story, onClose, onApprove }) {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onApprove(story.id, notes || null);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return React.createElement('div', {
    className: 'fixed inset-0 bg-black/50 flex items-center justify-center z-50',
    onClick: onClose,
  },
    React.createElement('div', {
      className: 'bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg mx-4 p-6',
      onClick: (e) => e.stopPropagation(),
    },
      React.createElement('h2', { className: 'text-xl font-bold text-slate-100 mb-4' }, 'Approuver la story'),
      React.createElement('div', { className: 'bg-slate-700/50 rounded-lg p-3 mb-4' },
        React.createElement('div', { className: 'font-medium text-slate-200' }, story.title),
        React.createElement('div', { className: 'flex items-center gap-2 mt-2' },
          React.createElement(TypeBadge, { type: story.type }),
          React.createElement('span', { className: 'text-xs text-slate-400' }, story.epicName)
        )
      ),
      React.createElement('form', { onSubmit: handleSubmit },
        React.createElement('div', { className: 'mb-4' },
          React.createElement('label', { className: 'block text-sm text-slate-300 mb-2' },
            'Notes (optionnel)'
          ),
          React.createElement('textarea', {
            value: notes,
            onChange: (e) => setNotes(e.target.value),
            rows: 3,
            placeholder: 'Commentaires sur le test...',
            className: 'w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent',
          })
        ),
        error && React.createElement('div', {
          className: 'mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm',
        }, error),
        React.createElement('div', {
          className: 'bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 mb-4 text-sm text-emerald-300',
        },
          'La story passera au statut "Terminé".'
        ),
        React.createElement('div', { className: 'flex gap-3' },
          React.createElement('button', {
            type: 'button',
            onClick: onClose,
            className: 'flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200 transition-colors',
          }, 'Annuler'),
          React.createElement('button', {
            type: 'submit',
            disabled: loading,
            className: 'flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg text-white transition-colors',
          }, loading ? 'Approbation...' : 'Approuver')
        )
      )
    )
  );
}

// Story card in queue
function QueueStoryCard({ story, onApprove, onReject, onViewDetails }) {
  return React.createElement('div', {
    className: 'bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-all p-4',
  },
    // Header
    React.createElement('div', { className: 'flex items-start justify-between gap-4 mb-3' },
      React.createElement('div', { className: 'flex-1 min-w-0' },
        React.createElement('a', {
          href: `#/qa/${story.slug || story.id}`,
          className: 'font-medium text-slate-200 hover:text-aia-accent block truncate',
        }, story.title),
        React.createElement('div', { className: 'flex items-center gap-2 mt-1' },
          React.createElement(TypeBadge, { type: story.type }),
          React.createElement('span', { className: 'text-xs text-slate-500' }, '•'),
          React.createElement('a', {
            href: `#/epics/${story.epicId}`,
            className: 'text-xs text-slate-400 hover:text-slate-300',
          }, story.epicName)
        )
      ),
      React.createElement(StatusBadge, { status: story.status })
    ),

    // Description
    story.description && React.createElement('p', {
      className: 'text-sm text-slate-400 mb-3 line-clamp-2',
    }, story.description),

    // QA History indicator
    story.qaHistory && story.qaHistory.length > 0 && React.createElement('div', {
      className: 'flex items-center gap-2 mb-3 text-xs text-slate-500',
    },
      React.createElement('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
        React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' })
      ),
      `${story.qaHistory.length} action(s) QA précédente(s)`
    ),

    // Linked feature for bugs
    story.type === 'bug' && story.linkedFeatureId && React.createElement('div', {
      className: 'flex items-center gap-2 mb-3 text-xs bg-red-500/10 border border-red-500/20 rounded px-2 py-1',
    },
      React.createElement('span', { className: 'text-red-400' }, 'Lié à:'),
      React.createElement('span', { className: 'text-slate-300' }, story.linkedFeatureId)
    ),

    // Actions
    React.createElement('div', { className: 'flex gap-2 pt-3 border-t border-slate-700' },
      React.createElement('button', {
        onClick: () => onApprove(story),
        className: 'flex-1 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-lg text-emerald-300 text-sm transition-colors flex items-center justify-center gap-2',
      },
        React.createElement('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
          React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M5 13l4 4L19 7' })
        ),
        'Approuver'
      ),
      React.createElement('button', {
        onClick: () => onReject(story),
        className: 'flex-1 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded-lg text-red-300 text-sm transition-colors flex items-center justify-center gap-2',
      },
        React.createElement('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
          React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M6 18L18 6M6 6l12 12' })
        ),
        'Rejeter'
      )
    )
  );
}

// Empty state
function EmptyQueue() {
  return React.createElement('div', {
    className: 'text-center py-16 bg-slate-800/30 rounded-xl border border-slate-700',
  },
    React.createElement('div', { className: 'text-4xl mb-4' }, '🎉'),
    React.createElement('h3', { className: 'text-xl font-medium text-slate-200 mb-2' },
      'File d\'attente vide'
    ),
    React.createElement('p', { className: 'text-slate-400 max-w-md mx-auto' },
      'Aucune story en attente de test. Les stories passeront ici lorsqu\'elles seront prêtes pour la QA.'
    )
  );
}

// Recent activity
function RecentActivity({ stats }) {
  return React.createElement('div', { className: 'bg-slate-800/30 rounded-xl border border-slate-700 p-4' },
    React.createElement('h3', { className: 'font-medium text-slate-200 mb-4' }, 'Activité récente'),
    React.createElement('div', { className: 'space-y-3' },
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('span', { className: 'text-sm text-slate-400' }, 'Approuvées aujourd\'hui'),
        React.createElement('span', { className: 'text-emerald-400 font-medium' }, stats.approvedToday)
      ),
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('span', { className: 'text-sm text-slate-400' }, 'Rejetées aujourd\'hui'),
        React.createElement('span', { className: 'text-red-400 font-medium' }, stats.rejectedToday)
      ),
      React.createElement('div', { className: 'border-t border-slate-700 pt-3 mt-3' }),
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('span', { className: 'text-sm text-slate-400' }, 'Total approbations'),
        React.createElement('span', { className: 'text-slate-300 font-medium' }, stats.totalApprovals)
      ),
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('span', { className: 'text-sm text-slate-400' }, 'Total rejets'),
        React.createElement('span', { className: 'text-slate-300 font-medium' }, stats.totalRejections)
      ),
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('span', { className: 'text-sm text-slate-400' }, 'Moy. rejets/story'),
        React.createElement('span', { className: 'text-slate-300 font-medium' }, stats.avgRejectionsPerStory)
      )
    )
  );
}

// QA History component
function QAHistory({ history }) {
  if (!history || history.length === 0) {
    return React.createElement('div', {
      className: 'bg-slate-800/30 rounded-xl border border-slate-700 p-4',
    },
      React.createElement('h3', { className: 'font-medium text-slate-200 mb-4' }, 'Historique QA'),
      React.createElement('p', { className: 'text-sm text-slate-500' }, 'Aucune action QA récente.')
    );
  }

  return React.createElement('div', {
    className: 'bg-slate-800/30 rounded-xl border border-slate-700 p-4',
  },
    React.createElement('h3', { className: 'font-medium text-slate-200 mb-4' }, 'Historique QA'),
    React.createElement('div', { className: 'space-y-3 max-h-80 overflow-y-auto' },
      ...history.map((action, idx) =>
        React.createElement('div', {
          key: idx,
          className: `p-3 rounded-lg border ${
            action.action === 'approve'
              ? 'bg-emerald-500/10 border-emerald-500/20'
              : 'bg-red-500/10 border-red-500/20'
          }`,
        },
          React.createElement('div', { className: 'flex items-center justify-between mb-1' },
            React.createElement('span', {
              className: `text-sm font-medium ${action.action === 'approve' ? 'text-emerald-400' : 'text-red-400'}`,
            }, action.action === 'approve' ? '✓ Approuvé' : '✗ Rejeté'),
            React.createElement('span', { className: 'text-xs text-slate-500' },
              new Date(action.performedAt).toLocaleString('fr-FR')
            )
          ),
          React.createElement('a', {
            href: `#/qa/${action.storySlug || action.storyId}`,
            className: 'text-sm text-slate-300 hover:text-aia-accent truncate block',
          }, action.storyTitle || action.storyId),
          action.reason && React.createElement('p', {
            className: 'text-xs text-slate-400 mt-1 italic',
          }, action.reason)
        )
      )
    )
  );
}

// Main QA Dashboard
export function QADashboard() {
  const [queue, setQueue] = useState([]);
  const [allStories, setAllStories] = useState([]);
  const [qaHistory, setQaHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [approveModal, setApproveModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  // Kanban view removed - was not filtering correctly by QA phase

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [queueData, statsData, storiesData] = await Promise.all([
        api.get('/qa/queue'),
        api.get('/qa/stats'),
        api.get('/stories'),
      ]);
      setQueue(queueData);
      setStats(statsData);
      setAllStories(storiesData);

      // Extract QA history from all stories
      const history = [];
      for (const story of storiesData) {
        if (story.qaHistory && story.qaHistory.length > 0) {
          for (const action of story.qaHistory) {
            history.push({
              ...action,
              storyId: story.id,
              storySlug: story.slug,
              storyTitle: story.title,
            });
          }
        }
      }
      // Sort by date descending and limit to 20
      history.sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt));
      setQaHistory(history.slice(0, 20));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApprove = async (storyId, notes) => {
    await api.post(`/qa/${storyId}/approve`, { notes });
    await loadData();
  };

  const handleReject = async (storyId, reason) => {
    await api.post(`/qa/${storyId}/reject`, { reason });
    await loadData();
  };

  if (loading && !stats) {
    return React.createElement('div', { className: 'flex items-center justify-center h-64' },
      React.createElement('div', { className: 'animate-spin rounded-full h-8 w-8 border-b-2 border-aia-accent' })
    );
  }

  return React.createElement('div', { className: 'space-y-6' },
    // Header
    React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'text-2xl font-bold text-slate-100' }, 'QA Dashboard'),
        React.createElement('p', { className: 'text-slate-400 text-sm mt-1' },
          'Gestion des tests et approbations'
        )
      ),
      React.createElement('div', { className: 'flex items-center gap-3' },
        React.createElement('button', {
          onClick: loadData,
          className: 'px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 transition-colors flex items-center gap-2',
        },
          React.createElement('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
            React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' })
          ),
          'Actualiser'
        )
      )
    ),

    // Error
    error && React.createElement('div', {
      className: 'bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg',
    }, error),

    // Stats
    stats && React.createElement('div', { className: 'grid grid-cols-4 gap-4' },
      React.createElement(StatsCard, {
        label: 'En attente de test',
        value: stats.inTesting,
        color: 'amber',
      }),
      React.createElement(StatsCard, {
        label: 'Approuvées aujourd\'hui',
        value: stats.approvedToday,
        color: 'emerald',
      }),
      React.createElement(StatsCard, {
        label: 'Rejetées aujourd\'hui',
        value: stats.rejectedToday,
        color: 'red',
      }),
      React.createElement(StatsCard, {
        label: 'Total approbations',
        value: stats.totalApprovals,
        color: 'sky',
      })
    ),

    // Main content - List view only
    React.createElement('div', { className: 'grid grid-cols-3 gap-6' },
      // Queue
      React.createElement('div', { className: 'col-span-2 space-y-4' },
        React.createElement('h2', { className: 'text-lg font-medium text-slate-200 flex items-center gap-2' },
          'File d\'attente',
          queue.length > 0 && React.createElement('span', {
            className: 'bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full text-xs',
          }, queue.length)
        ),
        queue.length === 0
          ? React.createElement(EmptyQueue)
          : React.createElement('div', { className: 'space-y-4' },
              queue.map(story =>
                React.createElement(QueueStoryCard, {
                  key: story.id,
                  story,
                  onApprove: setApproveModal,
                  onReject: setRejectModal,
                })
              )
            )
      ),

      // Sidebar
      React.createElement('div', { className: 'space-y-4' },
        stats && React.createElement(RecentActivity, { stats }),
        React.createElement(QAHistory, { history: qaHistory })
      )
    ),

    // Modals
    approveModal && React.createElement(ApproveModal, {
      story: approveModal,
      onClose: () => setApproveModal(null),
      onApprove: handleApprove,
    }),
    rejectModal && React.createElement(RejectModal, {
      story: rejectModal,
      onClose: () => setRejectModal(null),
      onReject: handleReject,
    })
  );
}
