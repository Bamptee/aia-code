import React from 'react';
import { api, streamPost } from '/main.js';

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

function QuickRunButton({ name, onDone }) {
  const [running, setRunning] = React.useState(false);
  const [description, setDescription] = React.useState('');
  const [expanded, setExpanded] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [logs, setLogs] = React.useState([]);

  async function run() {
    setRunning(true);
    setErr(null);
    setLogs([]);

    const res = await streamPost(`/features/${name}/quick`, { description }, {
      onLog: (text) => setLogs(prev => [...prev, text]),
      onStatus: (data) => setLogs(prev => [...prev, `[${data.status}] ${data.mode || ''}\n`]),
    });

    if (res.ok) {
      if (onDone) onDone();
    } else {
      setErr(res.error);
    }
    setRunning(false);
  }

  if (!expanded) {
    return React.createElement('button', {
      onClick: () => setExpanded(true),
      className: 'bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded px-3 py-1.5 text-xs hover:bg-amber-500/30',
    }, 'Quick Ticket (dev-plan \u2192 implement \u2192 review)');
  }

  return React.createElement('div', { className: 'bg-slate-900 border border-amber-500/30 rounded p-4 space-y-3' },
    React.createElement('h4', { className: 'text-sm font-semibold text-amber-400' }, 'Quick Ticket'),
    React.createElement('p', { className: 'text-xs text-slate-500' }, 'Skips early steps, runs dev-plan \u2192 implement \u2192 review'),
    React.createElement('input', {
      type: 'text',
      value: description,
      onChange: e => setDescription(e.target.value),
      placeholder: 'Optional description...',
      disabled: running,
      className: 'w-full bg-aia-card border border-aia-border rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-amber-400 focus:outline-none',
    }),
    React.createElement('div', { className: 'flex gap-2' },
      React.createElement('button', {
        onClick: run,
        disabled: running,
        className: 'bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded px-4 py-1.5 text-sm hover:bg-amber-500/30 disabled:opacity-40',
      }, running ? 'Running...' : 'Run Quick'),
      React.createElement('button', {
        onClick: () => setExpanded(false),
        disabled: running,
        className: 'text-slate-500 hover:text-slate-300 text-xs',
      }, 'Cancel'),
    ),
    React.createElement(LogViewer, { logs }),
    err && React.createElement('p', { className: 'text-red-400 text-xs' }, err),
  );
}

function LogViewer({ logs }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  if (!logs.length) return null;
  return React.createElement('pre', {
    ref,
    className: 'bg-black/50 border border-aia-border rounded p-3 text-xs text-slate-400 overflow-auto max-h-64 whitespace-pre-wrap',
  }, logs.join(''));
}

function ModelSelect({ model, onChange, disabled }) {
  const [models, setModels] = React.useState([]);

  React.useEffect(() => {
    api.get('/models').then(setModels).catch(() => {});
  }, []);

  return React.createElement('select', {
    value: model,
    onChange: e => onChange(e.target.value),
    disabled,
    className: 'bg-aia-card border border-aia-border rounded px-2 py-1 text-xs text-slate-300 focus:border-aia-accent focus:outline-none',
  },
    React.createElement('option', { value: '' }, 'Model: auto (weighted)'),
    ...models.map(m => React.createElement('option', { key: m, value: m }, m)),
  );
}

function RunPanel({ name, step, stepStatus, onDone }) {
  const isDone = stepStatus === 'done';
  const [description, setDescription] = React.useState('');
  const [instructions, setInstructions] = React.useState('');
  const [model, setModel] = React.useState('');
  const [apply, setApply] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [logs, setLogs] = React.useState([]);

  const sseCallbacks = {
    onLog: (text) => setLogs(prev => [...prev, text]),
    onStatus: (data) => setLogs(prev => [...prev, `[${data.status}] ${data.step || ''}\n`]),
  };

  async function run() {
    setRunning(true); setResult(null); setErr(null); setLogs([]);
    const res = await streamPost(`/features/${name}/run/${step}`, { description, apply, model: model || undefined }, sseCallbacks);
    if (res.ok) { setResult('Step completed.'); if (onDone) onDone(); }
    else setErr(res.error);
    setRunning(false);
  }

  async function iterate() {
    setRunning(true); setResult(null); setErr(null); setLogs([]);
    const res = await streamPost(`/features/${name}/iterate/${step}`, { instructions, apply, model: model || undefined }, sseCallbacks);
    if (res.ok) { setResult('Iteration completed.'); setInstructions(''); if (onDone) onDone(); }
    else setErr(res.error);
    setRunning(false);
  }

  async function reset() {
    try { await api.post(`/features/${name}/reset/${step}`); if (onDone) onDone(); }
    catch (e) { setErr(e.message); }
  }

  return React.createElement('div', { className: 'space-y-3' },

    // --- Run block (when step is not done) ---
    !isDone && React.createElement('div', { className: 'bg-slate-900 border border-aia-border rounded p-4 space-y-3' },
      React.createElement('h4', { className: 'text-sm font-semibold text-emerald-400' }, `Run: ${step}`),
      React.createElement('input', {
        type: 'text',
        value: description,
        onChange: e => setDescription(e.target.value),
        placeholder: 'Optional description...',
        disabled: running,
        className: 'w-full bg-aia-card border border-aia-border rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-emerald-400 focus:outline-none',
      }),
      React.createElement('div', { className: 'flex items-center gap-4 flex-wrap' },
        React.createElement(ModelSelect, { model, onChange: setModel, disabled: running }),
        React.createElement('label', { className: 'flex items-center gap-2 text-xs text-slate-400 cursor-pointer' },
          React.createElement('input', { type: 'checkbox', checked: apply, onChange: e => setApply(e.target.checked), disabled: running, className: 'rounded' }),
          'Agent mode (--apply)'
        ),
        React.createElement('button', {
          onClick: run, disabled: running,
          className: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded px-4 py-1.5 text-sm hover:bg-emerald-500/30 disabled:opacity-40',
        }, running ? 'Running...' : 'Run Step'),
      ),
    ),

    // --- Iterate block (when step is done) ---
    isDone && React.createElement('div', { className: 'bg-slate-900 border border-violet-500/30 rounded p-4 space-y-3' },
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('h4', { className: 'text-sm font-semibold text-violet-400' }, `Iterate: ${step}`),
        React.createElement('span', { className: 'text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded' }, 'done'),
      ),
      React.createElement('p', { className: 'text-xs text-slate-500' }, 'The previous output will be used as base. Describe what to change below.'),
      React.createElement('label', { className: 'text-xs font-medium text-slate-400 block' }, 'Iteration instructions'),
      React.createElement('textarea', {
        value: instructions,
        onChange: e => setInstructions(e.target.value),
        placeholder: 'e.g. "Add error handling for edge cases", "Focus more on mobile", "Split into smaller functions"...',
        disabled: running,
        rows: 3,
        className: 'w-full bg-aia-card border border-aia-border rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-violet-400 focus:outline-none resize-y',
      }),
      React.createElement('div', { className: 'flex items-center gap-4 flex-wrap' },
        React.createElement(ModelSelect, { model, onChange: setModel, disabled: running }),
        React.createElement('label', { className: 'flex items-center gap-2 text-xs text-slate-400 cursor-pointer' },
          React.createElement('input', { type: 'checkbox', checked: apply, onChange: e => setApply(e.target.checked), disabled: running, className: 'rounded' }),
          'Agent mode (--apply)'
        ),
        React.createElement('button', {
          onClick: iterate, disabled: running || !instructions.trim(),
          className: 'bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded px-4 py-1.5 text-sm hover:bg-violet-500/30 disabled:opacity-40',
        }, running ? 'Iterating...' : 'Iterate'),
        React.createElement('button', {
          onClick: reset, disabled: running,
          className: 'text-slate-500 hover:text-slate-300 text-xs',
        }, 'Reset to pending'),
      ),
    ),

    // --- Shared log viewer + results ---
    React.createElement(LogViewer, { logs }),
    result && React.createElement('p', { className: 'text-emerald-400 text-xs' }, result),
    err && React.createElement('p', { className: 'text-red-400 text-xs' }, err),
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

    // Quick run
    React.createElement(QuickRunButton, { name, onDone: load }),

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

    // Run / Iterate panel
    activeStep && React.createElement(RunPanel, { name, step: activeStep, stepStatus: steps[activeStep], onDone: load }),

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
