import React from 'react';
import { api } from '/main.js';

function YamlEditor({ title, loadFn, saveFn }) {
  const [content, setContent] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  React.useEffect(() => {
    loadFn().then(c => setContent(c)).catch(() => setContent('')).finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await saveFn(content);
      setDirty(false);
      setMsg({ type: 'ok', text: 'Saved.' });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    }
    setSaving(false);
  }

  if (loading) return React.createElement('p', { className: 'text-slate-500 text-sm' }, 'Loading...');

  return React.createElement('div', { className: 'space-y-2' },
    React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('h3', { className: 'text-sm font-semibold text-slate-300' }, title),
      React.createElement('div', { className: 'flex gap-2 items-center' },
        dirty && React.createElement('span', { className: 'text-xs text-amber-400' }, 'unsaved'),
        msg && React.createElement('span', { className: `text-xs ${msg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}` }, msg.text),
        React.createElement('button', {
          onClick: save,
          disabled: saving || !dirty,
          className: 'bg-aia-accent/20 text-aia-accent border border-aia-accent/30 rounded px-3 py-1 text-xs hover:bg-aia-accent/30 disabled:opacity-40',
        }, saving ? '...' : 'Save'),
      ),
    ),
    React.createElement('textarea', {
      value: content,
      onChange: e => { setContent(e.target.value); setDirty(true); },
      spellCheck: false,
      className: 'w-full h-72 bg-slate-900 border border-aia-border rounded p-3 text-sm text-slate-300 font-mono resize-y focus:border-aia-accent focus:outline-none',
    })
  );
}

function FileList({ title, files, selectedFile, onSelect }) {
  if (!files.length) return null;
  return React.createElement('div', { className: 'space-y-1' },
    React.createElement('h4', { className: 'text-xs font-semibold text-slate-400 uppercase tracking-wider' }, title),
    ...files.map(f =>
      React.createElement('button', {
        key: f,
        onClick: () => onSelect(f),
        className: `block w-full text-left px-2 py-1 text-sm rounded ${selectedFile === f ? 'bg-aia-accent/20 text-aia-accent' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`,
      }, f)
    )
  );
}

export function ConfigView() {
  const [contextFiles, setContextFiles] = React.useState([]);
  const [knowledgeCategories, setKnowledgeCategories] = React.useState([]);
  const [selectedFile, setSelectedFile] = React.useState(null);
  const [selectedType, setSelectedType] = React.useState(null); // 'context' | 'knowledge'
  const [selectedCategory, setSelectedCategory] = React.useState(null);
  const [logs, setLogs] = React.useState('');
  const [showLogs, setShowLogs] = React.useState(false);

  React.useEffect(() => {
    api.get('/context').then(setContextFiles).catch(() => {});
    api.get('/knowledge').then(setKnowledgeCategories).catch(() => {});
  }, []);

  function selectContext(f) {
    setSelectedFile(f);
    setSelectedType('context');
    setSelectedCategory(null);
  }

  function selectKnowledge(cat, f) {
    setSelectedFile(f);
    setSelectedType('knowledge');
    setSelectedCategory(cat);
  }

  async function loadLogs() {
    try {
      const data = await api.get('/logs');
      setLogs(data.content || '(empty)');
      setShowLogs(true);
    } catch {}
  }

  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h1', { className: 'text-xl font-bold text-slate-100' }, 'Configuration'),

    // config.yaml
    React.createElement(YamlEditor, {
      title: 'config.yaml',
      loadFn: async () => (await api.get('/config')).content,
      saveFn: async (content) => api.put('/config', { content }),
    }),

    // Sidebar + editor for context/knowledge
    React.createElement('div', { className: 'grid grid-cols-4 gap-4' },
      // Sidebar
      React.createElement('div', { className: 'col-span-1 space-y-4' },
        React.createElement(FileList, {
          title: 'Context',
          files: contextFiles,
          selectedFile: selectedType === 'context' ? selectedFile : null,
          onSelect: selectContext,
        }),
        ...knowledgeCategories.map(cat =>
          React.createElement(FileList, {
            key: cat.name,
            title: `Knowledge / ${cat.name}`,
            files: cat.files,
            selectedFile: selectedType === 'knowledge' && selectedCategory === cat.name ? selectedFile : null,
            onSelect: f => selectKnowledge(cat.name, f),
          })
        ),
        React.createElement('button', {
          onClick: loadLogs,
          className: 'text-xs text-slate-500 hover:text-slate-300 mt-4',
        }, 'View execution logs'),
      ),

      // Editor
      React.createElement('div', { className: 'col-span-3' },
        selectedFile && selectedType === 'context' && React.createElement(YamlEditor, {
          key: `ctx-${selectedFile}`,
          title: `context/${selectedFile}`,
          loadFn: async () => (await api.get(`/context/${selectedFile}`)).content,
          saveFn: async (content) => api.put(`/context/${selectedFile}`, { content }),
        }),
        selectedFile && selectedType === 'knowledge' && React.createElement(YamlEditor, {
          key: `kn-${selectedCategory}-${selectedFile}`,
          title: `knowledge/${selectedCategory}/${selectedFile}`,
          loadFn: async () => (await api.get(`/knowledge/${selectedCategory}/${selectedFile}`)).content,
          saveFn: async (content) => api.put(`/knowledge/${selectedCategory}/${selectedFile}`, { content }),
        }),
        !selectedFile && !showLogs && React.createElement('p', { className: 'text-slate-500 text-sm' }, 'Select a file to edit.'),
        showLogs && React.createElement('div', { className: 'space-y-2' },
          React.createElement('div', { className: 'flex items-center justify-between' },
            React.createElement('h3', { className: 'text-sm font-semibold text-slate-300' }, 'Execution Logs'),
            React.createElement('button', { onClick: () => setShowLogs(false), className: 'text-xs text-slate-500 hover:text-slate-300' }, 'Close'),
          ),
          React.createElement('pre', { className: 'bg-slate-900 border border-aia-border rounded p-3 text-xs text-slate-400 overflow-auto max-h-96' }, logs),
        ),
      ),
    ),
  );
}
