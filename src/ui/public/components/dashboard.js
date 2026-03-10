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

function FeatureCard({ feature }) {
  const steps = feature.steps || {};
  const doneCount = Object.values(steps).filter(s => s === 'done').length;
  const totalCount = Object.keys(steps).length;

  return React.createElement('a', {
    href: `#/features/${feature.name}`,
    className: 'block bg-aia-card border border-aia-border rounded-lg p-4 hover:border-aia-accent/50 transition-colors',
  },
    React.createElement('div', { className: 'flex items-center justify-between mb-3' },
      React.createElement('h3', { className: 'text-slate-100 font-semibold' }, feature.name),
      React.createElement('span', { className: 'text-xs text-slate-500' },
        `${doneCount}/${totalCount} steps`
      ),
    ),
    feature.current_step && React.createElement('p', { className: 'text-xs text-slate-400 mb-3' },
      'Current: ', React.createElement('span', { className: 'text-aia-accent' }, feature.current_step)
    ),
    React.createElement('div', { className: 'flex flex-wrap gap-1.5' },
      ...Object.entries(steps).map(([step, status]) =>
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

export function Dashboard() {
  const [features, setFeatures] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  async function load() {
    try {
      const data = await api.get('/features');
      setFeatures(data);
    } catch {}
    setLoading(false);
  }

  React.useEffect(() => { load(); }, []);

  return React.createElement('div', null,
    React.createElement('div', { className: 'flex items-center justify-between mb-6' },
      React.createElement('h1', { className: 'text-xl font-bold text-slate-100' }, 'Features'),
      React.createElement(NewFeatureForm, { onCreated: load }),
    ),
    loading
      ? React.createElement('p', { className: 'text-slate-500' }, 'Loading...')
      : features.length === 0
        ? React.createElement('p', { className: 'text-slate-500' }, 'No features yet. Create one to get started.')
        : React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' },
            ...features.map(f => React.createElement(FeatureCard, { key: f.name, feature: f }))
          )
  );
}
