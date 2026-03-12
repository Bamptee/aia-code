import React from 'react';
import { api } from '/main.js';

const STATUS_CLASSES = {
  done: 'step-done',
  pending: 'step-pending',
  'in-progress': 'step-in-progress',
  error: 'step-error',
};

function StepBadge({ step, status }) {
  return React.createElement('span', {
    className: `inline-block px-2 py-0.5 text-xs rounded border ${STATUS_CLASSES[status] || 'step-pending'}`,
  }, step);
}

// Duplicated from constants.js to avoid async fetch on initial render
// Also available via /api/constants if dynamic loading is needed
const QUICK_STEPS = ['dev-plan', 'implement', 'review'];

function FeatureCard({ feature }) {
  const steps = feature.steps || {};
  const isQuickFlow = feature.flow === 'quick';

  // Filter steps based on flow type
  const relevantSteps = isQuickFlow
    ? Object.entries(steps).filter(([k]) => QUICK_STEPS.includes(k))
    : Object.entries(steps);

  const doneCount = relevantSteps.filter(([_, s]) => s === 'done').length;
  const totalCount = relevantSteps.length;

  return React.createElement('a', {
    href: `#/features/${feature.name}`,
    className: 'block bg-aia-card border border-aia-border rounded-lg p-4 hover:border-aia-accent/50 transition-colors',
  },
    React.createElement('div', { className: 'flex items-center justify-between mb-3' },
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('h3', { className: 'text-slate-100 font-semibold' }, feature.name),
        isQuickFlow && React.createElement('span', {
          className: 'bg-amber-500/20 text-amber-400 text-xs px-1.5 py-0.5 rounded',
          title: 'Quick Flow',
        }, 'Quick'),
        feature.hasWorktree && React.createElement('span', {
          className: 'bg-orange-500/20 text-orange-400 text-xs px-1.5 py-0.5 rounded',
          title: 'Git worktree active',
        }, 'wt'),
      ),
      React.createElement('span', { className: 'text-xs text-slate-500' },
        `${doneCount}/${totalCount} steps`
      ),
    ),
    feature.current_step && React.createElement('p', { className: 'text-xs text-slate-400 mb-3' },
      'Current: ', React.createElement('span', { className: 'text-aia-accent' }, feature.current_step)
    ),
    React.createElement('div', { className: 'flex flex-wrap gap-1.5' },
      ...(isQuickFlow ? relevantSteps : Object.entries(steps)).map(([step, status]) =>
        React.createElement(StepBadge, { key: step, step, status })
      )
    )
  );
}

function NewFeatureForm({ onCreated }) {
  const [name, setName] = React.useState('');
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await api.post('/features', { name });
      setName('');
      onCreated();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return React.createElement('form', { onSubmit: handleSubmit, className: 'flex gap-2 items-start' },
    React.createElement('div', null,
      React.createElement('input', {
        type: 'text',
        value: name,
        onChange: e => setName(e.target.value),
        placeholder: 'feature-name',
        className: 'bg-aia-card border border-aia-border rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-aia-accent focus:outline-none',
      }),
      err && React.createElement('p', { className: 'text-red-400 text-xs mt-1' }, err),
    ),
    React.createElement('button', {
      type: 'submit',
      disabled: loading || !name,
      className: 'bg-aia-accent/20 text-aia-accent border border-aia-accent/30 rounded px-3 py-1.5 text-sm hover:bg-aia-accent/30 disabled:opacity-40',
    }, loading ? '...' : '+ New Feature')
  );
}

function FilterTabs({ filter, onChange, counts }) {
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

export function Dashboard() {
  const [features, setFeatures] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState('all');

  async function load() {
    try {
      const data = await api.get('/features');
      setFeatures(data);
    } catch {}
    setLoading(false);
  }

  React.useEffect(() => { load(); }, []);

  // Filter features
  const filteredFeatures = features.filter(f => {
    if (filter === 'with-wt') return f.hasWorktree;
    if (filter === 'without-wt') return !f.hasWorktree;
    return true;
  });

  // Counts for tabs
  const counts = {
    all: features.length,
    withWt: features.filter(f => f.hasWorktree).length,
    withoutWt: features.filter(f => !f.hasWorktree).length,
  };

  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('h1', { className: 'text-xl font-bold text-slate-100' }, 'Features'),
      React.createElement(NewFeatureForm, { onCreated: load }),
    ),

    // Filter tabs
    !loading && features.length > 0 && React.createElement(FilterTabs, {
      filter,
      onChange: setFilter,
      counts,
    }),

    loading
      ? React.createElement('p', { className: 'text-slate-500' }, 'Loading...')
      : features.length === 0
        ? React.createElement('p', { className: 'text-slate-500' }, 'No features yet. Create one to get started.')
        : filteredFeatures.length === 0
          ? React.createElement('p', { className: 'text-slate-500' }, 'No features match this filter.')
          : React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' },
              ...filteredFeatures.map(f => React.createElement(FeatureCard, { key: f.name, feature: f }))
            )
  );
}
