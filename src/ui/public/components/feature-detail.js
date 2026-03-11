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

function FlowSelector({ name, currentFlow, onFlowChanged }) {
  const [saving, setSaving] = React.useState(false);

  const handleChange = async (newFlow) => {
    if (newFlow === currentFlow) return;
    setSaving(true);
    try {
      await api.patch(`/features/${name}/flow`, { flow: newFlow });
      if (onFlowChanged) onFlowChanged(newFlow);
    } catch (e) {
      console.error('Failed to update flow:', e);
    }
    setSaving(false);
  };

  return React.createElement('div', { className: 'flex items-center gap-2' },
    React.createElement('span', { className: 'text-xs text-slate-500' }, 'Flow:'),
    React.createElement('button', {
      onClick: () => handleChange('quick'),
      disabled: saving,
      className: `px-3 py-1 text-xs rounded border transition-all ${currentFlow === 'quick' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500'}`,
    }, 'Quick'),
    React.createElement('button', {
      onClick: () => handleChange('full'),
      disabled: saving,
      className: `px-3 py-1 text-xs rounded border transition-all ${currentFlow === 'full' ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500'}`,
    }, 'Full'),
    React.createElement('span', { className: 'text-xs text-slate-600 ml-2' },
      currentFlow === 'quick' ? '(dev-plan \u2192 implement \u2192 review)' : '(brief \u2192 ... \u2192 review)'
    ),
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

function InitPanel({ name, onFlowSelected, onCancel, onEnriched }) {
  const [description, setDescription] = React.useState('');
  const [suggestion, setSuggestion] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [statusMsg, setStatusMsg] = React.useState('');
  const [logs, setLogs] = React.useState([]);
  const [err, setErr] = React.useState(null);

  const handleSubmit = async () => {
    setLoading(true);
    setErr(null);
    setLogs([]);
    setStatusMsg('Structuring your description...');

    const res = await streamPost(`/features/${name}/init`, { description }, {
      onLog: (text) => setLogs(prev => [...prev, text]),
      onStatus: (data) => setStatusMsg(data.message || data.status),
    });

    if (res.ok) {
      setSuggestion(res.suggestion);
      setStatusMsg('');
      if (onEnriched) onEnriched();
    } else {
      setErr(res.error || 'Failed to enrich description');
    }
    setLoading(false);
  };

  const handleFlowChoice = (flow) => {
    onFlowSelected(flow);
  };

  return React.createElement('div', { className: 'bg-aia-card border border-aia-border rounded p-4 space-y-4' },
    React.createElement('h3', { className: 'text-sm font-semibold text-cyan-400' }, 'Describe your feature'),

    // Textarea (hidden when loading or has suggestion)
    !loading && !suggestion && React.createElement('textarea', {
      value: description,
      onChange: e => setDescription(e.target.value),
      placeholder: 'Describe what you want to build...\n\nBe as detailed as needed. The AI will structure your description.',
      rows: 8,
      className: 'w-full bg-aia-card border border-aia-border rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-aia-accent focus:outline-none resize-y max-h-96 overflow-auto',
    }),

    // Character count and buttons
    !loading && !suggestion && React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('span', { className: 'text-xs text-slate-500' }, `${description.length} characters`),
      React.createElement('div', { className: 'flex gap-2' },
        React.createElement('button', {
          onClick: onCancel,
          className: 'text-slate-500 hover:text-slate-300 text-xs',
        }, 'Cancel'),
        React.createElement('button', {
          onClick: handleSubmit,
          disabled: !description.trim(),
          className: 'bg-aia-accent/20 text-aia-accent border border-aia-accent/30 rounded px-4 py-2 text-sm hover:bg-aia-accent/30 disabled:opacity-40',
        }, 'Continue'),
      ),
    ),

    // Loading state with logs
    loading && React.createElement('div', { className: 'space-y-3' },
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('div', { className: 'animate-spin w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full' }),
        React.createElement('span', { className: 'text-sm text-cyan-400' }, statusMsg || 'Processing...'),
      ),
      logs.length > 0 && React.createElement(LogViewer, { logs }),
    ),

    // Error
    err && React.createElement('p', { className: 'text-red-400 text-xs' }, err),

    // Flow suggestion
    suggestion && React.createElement('div', { className: 'space-y-3' },
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('span', { className: 'text-emerald-400' }, '\u2713'),
        React.createElement('span', { className: 'text-sm text-slate-300' }, 'Feature spec created in init.md'),
      ),
      React.createElement('p', { className: 'text-sm text-slate-400' },
        `Suggested: ${suggestion === 'quick' ? 'Quick Flow (dev-plan \u2192 implement \u2192 review)' : 'Full Flow (8 steps)'}`
      ),
      React.createElement('div', { className: 'flex gap-2' },
        React.createElement('button', {
          onClick: () => handleFlowChoice('quick'),
          className: `px-4 py-2 text-sm rounded border ${suggestion === 'quick' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-700 text-slate-300 border-slate-600'} hover:brightness-110`,
        }, 'Quick Flow'),
        React.createElement('button', {
          onClick: () => handleFlowChoice('full'),
          className: `px-4 py-2 text-sm rounded border ${suggestion === 'full' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-700 text-slate-300 border-slate-600'} hover:brightness-110`,
        }, 'Full Flow'),
      ),
    ),
  );
}

function StepGuidance({ step, feature }) {
  const [guidance, setGuidance] = React.useState(null);

  React.useEffect(() => {
    api.get(`/features/${feature}/guidance/${step}`).then(setGuidance).catch(() => {});
  }, [step, feature]);

  if (!guidance) return null;

  return React.createElement('div', { className: 'bg-emerald-500/10 border border-emerald-500/30 rounded p-4 mt-4' },
    React.createElement('h4', { className: 'text-emerald-400 font-semibold text-sm mb-2' }, guidance.summary),
    React.createElement('div', { className: 'text-slate-300 text-xs space-y-1' },
      ...guidance.actions.map((action, i) =>
        React.createElement('p', { key: i }, `\u2022 ${action.replace('<feature>', feature)}`)
      ),
    ),
    guidance.next && React.createElement('p', { className: 'text-cyan-400 text-xs mt-2' },
      `Next step: ${guidance.next}`
    ),
    guidance.tips.length > 0 && React.createElement('p', { className: 'text-amber-400 text-xs mt-2' },
      `Tip: ${guidance.tips[0]}`
    ),
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
      React.createElement('textarea', {
        value: description,
        onChange: e => setDescription(e.target.value),
        placeholder: 'Optional description or additional context...',
        disabled: running,
        rows: 3,
        className: 'w-full bg-aia-card border border-aia-border rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-emerald-400 focus:outline-none resize-y max-h-96 overflow-auto',
      }),
      description.length > 0 && React.createElement('span', { className: 'text-xs text-slate-500' }, `${description.length} characters`),
      React.createElement('div', { className: 'flex items-center gap-4 flex-wrap' },
        React.createElement(ModelSelect, { model, onChange: setModel, disabled: running }),
        React.createElement('label', { className: 'flex items-center gap-2 text-xs text-slate-400 cursor-pointer', title: 'Allow AI to edit files in your project' },
          React.createElement('input', { type: 'checkbox', checked: apply, onChange: e => setApply(e.target.checked), disabled: running, className: 'rounded' }),
          'Agent mode'
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
        className: 'w-full bg-aia-card border border-aia-border rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-violet-400 focus:outline-none resize-y max-h-96 overflow-auto',
      }),
      instructions.length > 0 && React.createElement('span', { className: 'text-xs text-slate-500' }, `${instructions.length} characters`),
      React.createElement('div', { className: 'flex items-center gap-4 flex-wrap' },
        React.createElement(ModelSelect, { model, onChange: setModel, disabled: running }),
        React.createElement('label', { className: 'flex items-center gap-2 text-xs text-slate-400 cursor-pointer', title: 'Allow AI to edit files in your project' },
          React.createElement('input', { type: 'checkbox', checked: apply, onChange: e => setApply(e.target.checked), disabled: running, className: 'rounded' }),
          'Agent mode'
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
      // Step guidance for completed steps
      React.createElement(StepGuidance, { step, feature: name }),
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
  const [showInitPanel, setShowInitPanel] = React.useState(false);
  const [selectedFlow, setSelectedFlow] = React.useState(null);
  const [fileVersion, setFileVersion] = React.useState(0);

  async function load(checkInitPanel = true) {
    try {
      const data = await api.get(`/features/${name}`);
      setFeature(data);
      const steps = data.steps || {};

      // Load persisted flow from status
      if (data.flow && !selectedFlow) {
        setSelectedFlow(data.flow);
      }

      // Check if no steps have been started and init.md is empty (only on initial load)
      if (checkInitPanel) {
        const allPending = Object.values(steps).every(s => s === 'pending');
        const persistedFlow = data.flow || selectedFlow;

        if (allPending && !persistedFlow) {
          // Check if init.md has content (enriched)
          try {
            const initFile = await api.get(`/features/${name}/files/init.md`);
            const content = initFile.content || '';
            // If init.md has been enriched (contains ## Summary which is added by the agent), don't show InitPanel
            // The default template only has ## Description, ## Existing specs, ## Constraints
            const isEnriched = content.includes('## Summary') || content.includes('## Problem');
            if (!isEnriched) {
              setShowInitPanel(true);
            } else {
              // Auto-select first pending step based on flow
              const flow = persistedFlow || 'full';
              const firstStep = flow === 'quick' ? 'dev-plan' : 'brief';
              if (!activeStep) {
                setActiveStep(firstStep);
                setActiveFile(`${firstStep}.md`);
              }
            }
          } catch {
            setShowInitPanel(true);
          }
        } else if (!activeStep) {
          // Auto-select current step or first pending based on flow
          const flow = persistedFlow || 'full';
          const currentStep = data.current_step;
          if (currentStep) {
            setActiveStep(currentStep);
            setActiveFile(`${currentStep}.md`);
          } else {
            // Use flow to determine first step
            const firstStep = flow === 'quick' ? 'dev-plan' : 'brief';
            const stepStatus = steps[firstStep];
            if (stepStatus === 'pending') {
              setActiveStep(firstStep);
              setActiveFile(`${firstStep}.md`);
            } else {
              const firstPending = Object.entries(steps).find(([_, status]) => status === 'pending');
              if (firstPending) {
                setActiveStep(firstPending[0]);
                setActiveFile(`${firstPending[0]}.md`);
              }
            }
          }
        }
      }
    } catch {}
    setLoading(false);
  }

  React.useEffect(() => { load(true); }, [name]);

  const handleFlowSelected = async (flow) => {
    // Persist flow to status.yaml
    try {
      await api.patch(`/features/${name}/flow`, { flow });
    } catch (e) {
      console.error('Failed to save flow:', e);
    }
    setSelectedFlow(flow);
    setShowInitPanel(false);
    // Select the first step based on flow type
    const firstStep = flow === 'quick' ? 'dev-plan' : 'brief';
    setActiveStep(firstStep);
    setActiveFile(`${firstStep}.md`);
    // Refresh file viewer
    setFileVersion(v => v + 1);
    load(false); // Reload without checking init panel
  };

  const handleFlowChanged = (newFlow) => {
    setSelectedFlow(newFlow);
    // Select the first step based on new flow type
    const firstStep = newFlow === 'quick' ? 'dev-plan' : 'brief';
    setActiveStep(firstStep);
    setActiveFile(`${firstStep}.md`);
    load(false);
  };

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

    // Init panel (when no steps started)
    showInitPanel && React.createElement(InitPanel, {
      name,
      onFlowSelected: handleFlowSelected,
      onCancel: () => setShowInitPanel(false),
      onEnriched: () => {
        setActiveFile('init.md');
        setFileVersion(v => v + 1);
      },
    }),

    // Flow selector (only show if not showing init panel)
    !showInitPanel && React.createElement(FlowSelector, {
      name,
      currentFlow: selectedFlow || 'full',
      onFlowChanged: handleFlowChanged,
    }),

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
    activeStep && React.createElement(RunPanel, { name, step: activeStep, stepStatus: steps[activeStep], onDone: () => { setFileVersion(v => v + 1); load(false); } }),

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
    activeFile && React.createElement(FileEditor, { key: `${name}-${activeFile}-${fileVersion}`, name, filename: activeFile, onSaved: () => { setFileVersion(v => v + 1); load(false); } }),
  );
}
