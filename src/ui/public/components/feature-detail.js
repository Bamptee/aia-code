import React from 'react';
import { api, streamPost } from '/main.js';
import { WorktrunkPanel } from '/components/worktrunk-panel.js';

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentZone({ feature, attachments, onUpload, onRemove }) {
  const inputRef = React.useRef(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const handleFiles = async (files) => {
    if (!files.length) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        setError(`File "${file.name}" exceeds 10MB limit`);
        setUploading(false);
        return;
      }
      formData.append('files', file);
    }

    try {
      const res = await api.upload(`/features/${feature}/attachments`, formData);
      if (res.ok && res.files) {
        onUpload(res.files);
      }
    } catch (e) {
      setError(e.message || 'Upload failed');
    }
    setUploading(false);
  };

  const handleRemove = async (filename) => {
    try {
      await api.delete(`/features/${feature}/attachments/${filename}`);
      onRemove(filename);
    } catch (e) {
      setError(e.message || 'Delete failed');
    }
  };

  return React.createElement('div', { className: 'border border-dashed border-slate-600 rounded p-3 mb-3' },
    React.createElement('input', {
      ref: inputRef,
      type: 'file',
      multiple: true,
      accept: 'image/*,application/pdf,text/*,.md,.txt,.json,.yaml,.yml',
      className: 'hidden',
      onChange: (e) => handleFiles(Array.from(e.target.files)),
    }),
    React.createElement('div', { className: 'flex items-center gap-2' },
      React.createElement('button', {
        onClick: () => inputRef.current?.click(),
        disabled: uploading,
        className: 'text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1',
      },
        uploading ? React.createElement('span', { className: 'animate-spin' }, '⟳') : '+',
        uploading ? ' Uploading...' : ' Add attachments (images, PDF, text)',
      ),
      React.createElement('span', { className: 'text-xs text-slate-600' }, 'Max 10MB/file'),
    ),
    error && React.createElement('p', { className: 'text-red-400 text-xs mt-1' }, error),
    attachments.length > 0 && React.createElement('div', { className: 'mt-2 flex flex-wrap gap-2' },
      ...attachments.map(a => React.createElement('span', {
        key: a.filename,
        className: 'bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded flex items-center gap-2',
        title: a.path,
      },
        a.mimeType?.startsWith('image/') && React.createElement('span', { className: 'text-emerald-400' }, '🖼'),
        a.mimeType === 'application/pdf' && React.createElement('span', { className: 'text-red-400' }, '📄'),
        a.originalName || a.filename,
        a.size && React.createElement('span', { className: 'text-slate-500' }, `(${formatFileSize(a.size)})`),
        React.createElement('button', {
          onClick: () => handleRemove(a.filename),
          className: 'text-red-400 hover:text-red-300 ml-1',
          title: 'Remove attachment',
        }, '×'),
      )),
    ),
  );
}

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

function VerbosePanel({ logs, expanded, onToggle }) {
  if (!logs.length) return null;
  return React.createElement('div', { className: 'mt-2' },
    React.createElement('button', {
      onClick: onToggle,
      'aria-expanded': expanded, // F13: Accessibility
      'aria-label': `Toggle verbose logs, ${logs.length} lines`,
      className: 'text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1',
    }, expanded ? '\u25BC' : '\u25B6', `Verbose (${logs.length} lines)`),
    expanded && React.createElement('pre', {
      className: 'bg-black/70 border border-slate-700 rounded p-2 mt-1 text-xs text-slate-500 overflow-auto max-h-48 whitespace-pre-wrap',
      role: 'log',
      'aria-label': 'Verbose output',
    }, logs.join(''))
  );
}

function ChatLog({ messages }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages]);

  if (!messages.length) return null;

  return React.createElement('div', {
    ref,
    className: 'bg-slate-900 border border-aia-border rounded p-3 font-mono text-sm overflow-auto max-h-80',
    role: 'log', // F13: Accessibility
    'aria-label': 'Chat history',
  }, messages.map((msg) =>
    React.createElement('div', { key: msg.id || msg.content.slice(0, 20), className: 'mb-2' }, // F11: Unique key
      React.createElement('span', {
        className: msg.role === 'user' ? 'text-cyan-400' : 'text-emerald-400'
      }, msg.role === 'user' ? '> you: ' : 'agent: '),
      React.createElement('span', { className: 'text-slate-300 whitespace-pre-wrap' }, msg.content)
    )
  ));
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

const MAX_MESSAGES = 100;
const MAX_VERBOSE_LOGS = 500;

function RunPanel({ name, step, stepStatus, onDone }) {
  const isDone = stepStatus === 'done';
  const [inputText, setInputText] = React.useState('');
  const [instructions, setInstructions] = React.useState('');
  const [model, setModel] = React.useState('');
  const [apply, setApply] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [messages, setMessages] = React.useState([]);
  const [verboseLogs, setVerboseLogs] = React.useState([]);
  const [verboseExpanded, setVerboseExpanded] = React.useState(false);
  const [history, setHistory] = React.useState([]);
  const [attachments, setAttachments] = React.useState([]);
  const agentBuffer = React.useRef('');
  const requestId = React.useRef(0); // F4: Track request to prevent race conditions
  const [resetting, setResetting] = React.useState(false); // F14: Track reset state

  // Load attachments when step changes
  React.useEffect(() => {
    api.get(`/features/${name}/attachments`)
      .then(files => setAttachments(files))
      .catch(() => setAttachments([]));
  }, [name, step]);

  // Reset chat state when step changes
  React.useEffect(() => {
    requestId.current++; // F5: Invalidate pending requests on step change
    setMessages([]);
    setVerboseLogs([]);
    setHistory([]);
    setResult(null);
    setErr(null);
    agentBuffer.current = '';
  }, [step]);

  const handleAttachmentUpload = (files) => {
    setAttachments(prev => [...prev, ...files]);
  };

  const handleAttachmentRemove = (filename) => {
    setAttachments(prev => prev.filter(a => a.filename !== filename));
  };

  // F4: Create callbacks bound to current request
  const createSseCallbacks = (currentRequestId) => ({
    onLog: (text, type) => {
      if (requestId.current !== currentRequestId) return; // Ignore stale callbacks
      if (type === 'stderr') {
        setVerboseLogs(prev => [...prev, text].slice(-MAX_VERBOSE_LOGS)); // F8: Limit size
      } else {
        agentBuffer.current += text;
      }
    },
    onStatus: (data) => {
      if (requestId.current !== currentRequestId) return;
      setVerboseLogs(prev => [...prev, `[${data.status}] ${data.step || ''}\n`].slice(-MAX_VERBOSE_LOGS));
    },
  });

  async function handleSend() {
    if (!inputText.trim() || running) return;

    const userMessage = inputText.trim();
    const msgId = Date.now(); // F11: Unique key for messages
    setInputText('');
    setMessages(prev => [...prev, { id: msgId, role: 'user', content: userMessage }].slice(-MAX_MESSAGES));
    setRunning(true);
    setResult(null);
    setErr(null);
    setVerboseLogs([]);
    agentBuffer.current = '';

    const currentRequestId = ++requestId.current; // F4: New request ID
    const newHistory = [...history, { role: 'user', content: userMessage }];
    setHistory(newHistory);

    const res = await streamPost(`/features/${name}/run/${step}`, {
      description: userMessage,
      apply,
      model: model || undefined,
      history: newHistory.slice(0, -1),
      attachments: attachments.map(a => ({ filename: a.filename, path: a.path })),
    }, createSseCallbacks(currentRequestId));

    // F4: Check if this request is still current
    if (requestId.current !== currentRequestId) return;

    if (agentBuffer.current.trim()) {
      const agentResponse = agentBuffer.current.trim();
      setMessages(prev => [...prev, { id: Date.now(), role: 'agent', content: agentResponse }].slice(-MAX_MESSAGES));
      setHistory(prev => [...prev, { role: 'agent', content: agentResponse }]);
    }

    if (res.ok) {
      setResult('Step completed.');
      if (onDone) onDone();
    } else {
      setErr(res.error);
    }
    setRunning(false);
  }

  async function iterate() {
    if (!instructions.trim() || running) return;

    const msgId = Date.now();
    const iterationInstructions = instructions;
    setMessages(prev => [...prev, { id: msgId, role: 'user', content: iterationInstructions }].slice(-MAX_MESSAGES));
    setRunning(true);
    setResult(null);
    setErr(null);
    setVerboseLogs([]);
    agentBuffer.current = '';

    const currentRequestId = ++requestId.current;
    // F7: Pass history in iterate mode too
    const newHistory = [...history, { role: 'user', content: iterationInstructions }];
    setHistory(newHistory);

    const res = await streamPost(`/features/${name}/iterate/${step}`, {
      instructions: iterationInstructions,
      apply,
      model: model || undefined,
      history: newHistory.slice(0, -1),
      attachments: attachments.map(a => ({ filename: a.filename, path: a.path })),
    }, createSseCallbacks(currentRequestId));

    if (requestId.current !== currentRequestId) return;

    if (agentBuffer.current.trim()) {
      setMessages(prev => [...prev, { id: Date.now(), role: 'agent', content: agentBuffer.current.trim() }].slice(-MAX_MESSAGES));
      setHistory(prev => [...prev, { role: 'agent', content: agentBuffer.current.trim() }]);
    }

    if (res.ok) {
      setResult('Iteration completed.');
      setInstructions('');
      if (onDone) onDone();
    } else {
      setErr(res.error);
    }
    setRunning(false);
  }

  // F14: Better reset with state tracking
  async function reset() {
    setResetting(true);
    setErr(null);
    try {
      await api.post(`/features/${name}/reset/${step}`);
      requestId.current++;
      setMessages([]);
      setVerboseLogs([]);
      setHistory([]);
      setResult(null);
      if (onDone) onDone();
    } catch (e) {
      setErr(`Reset failed: ${e.message}`);
    } finally {
      setResetting(false);
    }
  }

  const handleKeyDown = (e, submitFn) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitFn();
    }
  };

  return React.createElement('div', { className: 'space-y-3' },

    // --- Chat log ---
    React.createElement(ChatLog, { messages }),

    // --- Attachments zone ---
    React.createElement(AttachmentZone, {
      feature: name,
      attachments,
      onUpload: handleAttachmentUpload,
      onRemove: handleAttachmentRemove,
    }),

    // --- Run block (when step is not done) ---
    !isDone && React.createElement('div', { className: 'bg-slate-900 border border-aia-border rounded p-4 space-y-3' },
      React.createElement('h4', { className: 'text-sm font-semibold text-emerald-400' }, `Run: ${step}`),
      React.createElement('textarea', {
        value: inputText,
        onChange: e => setInputText(e.target.value),
        onKeyDown: e => handleKeyDown(e, handleSend),
        placeholder: 'Describe what you want... (Enter to send, Shift+Enter for newline)',
        disabled: running,
        rows: 3,
        className: 'w-full bg-aia-card border border-aia-border rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-emerald-400 focus:outline-none resize-y max-h-96 overflow-auto',
      }),
      inputText.length > 0 && React.createElement('span', { className: 'text-xs text-slate-500' }, `${inputText.length} characters`),
      React.createElement('div', { className: 'flex items-center gap-4 flex-wrap' },
        React.createElement(ModelSelect, { model, onChange: setModel, disabled: running }),
        React.createElement('label', { className: 'flex items-center gap-2 text-xs text-slate-400 cursor-pointer', title: 'Allow AI to edit files in your project' },
          React.createElement('input', { type: 'checkbox', checked: apply, onChange: e => setApply(e.target.checked), disabled: running, className: 'rounded' }),
          'Agent mode'
        ),
        React.createElement('button', {
          onClick: handleSend, disabled: running || !inputText.trim(),
          className: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded px-4 py-1.5 text-sm hover:bg-emerald-500/30 disabled:opacity-40',
        }, running ? 'Running...' : 'Send'),
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
        onKeyDown: e => handleKeyDown(e, iterate),
        placeholder: 'e.g. "Add error handling for edge cases"... (Enter to send, Shift+Enter for newline)',
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
          onClick: reset, disabled: running || resetting,
          className: 'text-slate-500 hover:text-slate-300 text-xs disabled:opacity-40',
        }, resetting ? 'Resetting...' : 'Reset to pending'),
      ),
      // Step guidance for completed steps
      React.createElement(StepGuidance, { step, feature: name }),
    ),

    // --- Verbose panel (stderr logs) ---
    React.createElement(VerbosePanel, {
      logs: verboseLogs,
      expanded: verboseExpanded,
      onToggle: () => setVerboseExpanded(!verboseExpanded),
    }),

    // --- Results ---
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

    // Worktrunk panel
    !showInitPanel && React.createElement(WorktrunkPanel, { featureName: name }),

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
