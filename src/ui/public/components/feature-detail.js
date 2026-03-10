import React from 'react';
import { api } from '/main.js';

const STATUS_CLASSES = {
  done: 'step-done',
  pending: 'step-pending',
  'in-progress': 'step-in-progress',
  error: 'step-error',
};

const STATUS_ICONS = { done: '\u2713', pending: '\u00b7', 'in-progress': '\u25b6', error: '\u2717' };

function StepPill({ step, status, active, onClick }) {
  return React.createElement('button', {
    onClick,
    className: `px-3 py-1.5 text-xs rounded border transition-all ${STATUS_CLASSES[status] || 'step-pending'} ${active ? 'ring-2 ring-aia-accent ring-offset-1 ring-offset-aia-bg' : 'hover:brightness-125'}`,
  }, `${STATUS_ICONS[status] || ''} ${step}`);
}

function FileEditor({ name, filename, onSaved }) {
  const [content, setContent] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setLoading(true);
    setDirty(false);
    api.get(`/features/${name}/files/${filename}`)
      .then(data => setContent(data.content))
      .catch(() => setContent(''))
      .finally(() => setLoading(false));
  }, [name, filename]);

  async function save() {
    setSaving(true);
    try {
      await api.put(`/features/${name}/files/${filename}`, { content });
      setDirty(false);
      if (onSaved) onSaved();
    } catch {}
    setSaving(false);
  }

  if (loading) return React.createElement('p', { className: 'text-slate-500 text-sm' }, 'Loading...');

  return React.createElement('div', { className: 'flex flex-col gap-2' },
    React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('span', { className: 'text-sm text-slate-400' }, filename),
      React.createElement('div', { className: 'flex gap-2' },
        dirty && React.createElement('span', { className: 'text-xs text-amber-400' }, 'unsaved'),
        React.createElement('button', {
          onClick: save,
          disabled: saving || !dirty,
          className: 'bg-aia-accent/20 text-aia-accent border border-aia-accent/30 rounded px-3 py-1 text-xs hover:bg-aia-accent/30 disabled:opacity-40',
        }, saving ? 'Saving...' : 'Save'),
      ),
    ),
    React.createElement('textarea', {
      value: content,
      onChange: e => { setContent(e.target.value); setDirty(true); },
      spellCheck: false,
      className: 'w-full h-96 bg-slate-900 border border-aia-border rounded p-3 text-sm text-slate-300 font-mono resize-y focus:border-aia-accent focus:outline-none',
    })
  );
}

function RunPanel({ name, step, onDone }) {
  const [description, setDescription] = React.useState('');
  const [apply, setApply] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(null);

  async function run() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const data = await api.post(`/features/${name}/run/${step}`, { description, apply });
      setResult('Step completed.');
      if (onDone) onDone();
    } catch (e) {
      setError(e.message);
    }
    setRunning(false);
  }

  async function reset() {
    try {
      await api.post(`/features/${name}/reset/${step}`);
      if (onDone) onDone();
    } catch (e) {
      setError(e.message);
    }
  }

  return React.createElement('div', { className: 'bg-slate-900 border border-aia-border rounded p-4 space-y-3' },
    React.createElement('h4', { className: 'text-sm font-semibold text-slate-300' }, `Run: ${step}`),
    React.createElement('input', {
      type: 'text',
      value: description,
      onChange: e => setDescription(e.target.value),
      placeholder: 'Optional description...',
      className: 'w-full bg-aia-card border border-aia-border rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-aia-accent focus:outline-none',
    }),
    React.createElement('div', { className: 'flex items-center gap-4' },
      React.createElement('label', { className: 'flex items-center gap-2 text-xs text-slate-400 cursor-pointer' },
        React.createElement('input', {
          type: 'checkbox',
          checked: apply,
          onChange: e => setApply(e.target.checked),
          className: 'rounded',
        }),
        'Agent mode (--apply)'
      ),
      React.createElement('button', {
        onClick: run,
        disabled: running,
        className: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded px-4 py-1.5 text-sm hover:bg-emerald-500/30 disabled:opacity-40',
      }, running ? 'Running...' : 'Run Step'),
      React.createElement('button', {
        onClick: reset,
        disabled: running,
        className: 'text-slate-500 hover:text-slate-300 text-xs',
      }, 'Reset'),
    ),
    running && React.createElement('p', { className: 'text-amber-400 text-xs animate-pulse' }, 'Step is running... This may take a few minutes.'),
    result && React.createElement('p', { className: 'text-emerald-400 text-xs' }, result),
    error && React.createElement('p', { className: 'text-red-400 text-xs' }, error),
  );
}

export function FeatureDetail({ name }) {
  const [feature, setFeature] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [activeFile, setActiveFile] = React.useState('init.md');
  const [activeStep, setActiveStep] = React.useState(null);

  async function load() {
    try {
      const data = await api.get(`/features/${name}`);
      setFeature(data);
    } catch {}
    setLoading(false);
  }

  React.useEffect(() => { load(); }, [name]);

  if (loading) return React.createElement('p', { className: 'text-slate-500' }, 'Loading...');
  if (!feature) return React.createElement('p', { className: 'text-red-400' }, `Feature "${name}" not found.`);

  const steps = feature.steps || {};

  return React.createElement('div', { className: 'space-y-6' },
    // Header
    React.createElement('div', { className: 'flex items-center gap-3' },
      React.createElement('a', { href: '#/', className: 'text-slate-500 hover:text-slate-300' }, '\u2190'),
      React.createElement('h1', { className: 'text-xl font-bold text-slate-100' }, name),
      feature.current_step && React.createElement('span', { className: 'text-xs bg-aia-accent/20 text-aia-accent px-2 py-0.5 rounded' }, feature.current_step),
    ),

    // Pipeline
    React.createElement('div', { className: 'flex flex-wrap gap-2' },
      ...Object.entries(steps).map(([step, status]) =>
        React.createElement(StepPill, {
          key: step,
          step,
          status,
          active: activeStep === step,
          onClick: () => { setActiveStep(step); setActiveFile(`${step}.md`); },
        })
      )
    ),

    // Run panel
    activeStep && React.createElement(RunPanel, { name, step: activeStep, onDone: load }),

    // File tabs
    React.createElement('div', { className: 'flex gap-1 border-b border-aia-border' },
      ...(feature.files || []).filter(f => f.endsWith('.md') || f.endsWith('.yaml')).map(f =>
        React.createElement('button', {
          key: f,
          onClick: () => setActiveFile(f),
          className: `px-3 py-1.5 text-xs border-b-2 transition-colors ${activeFile === f ? 'border-aia-accent text-aia-accent' : 'border-transparent text-slate-500 hover:text-slate-300'}`,
        }, f)
      )
    ),

    // Editor
    activeFile && React.createElement(FileEditor, { key: `${name}-${activeFile}`, name, filename: activeFile, onSaved: load }),
  );
}
