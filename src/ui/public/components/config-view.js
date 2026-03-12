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

function UserPreferences() {
  const [prefs, setPrefs] = React.useState({
    user_name: '',
    communication_language: 'English',
  });
  const [configPath, setConfigPath] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  React.useEffect(() => {
    api.get('/user-config').then(data => {
      const parsed = data.parsed || {};
      setPrefs({
        user_name: parsed.user_name || '',
        communication_language: parsed.communication_language || 'English',
      });
      setConfigPath(data.path || '');
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleChange = (field, value) => {
    setPrefs(p => ({ ...p, [field]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.patch('/user-config', prefs);
      setDirty(false);
      setMsg({ type: 'ok', text: 'Saved.' });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    }
    setSaving(false);
  };

  if (loading) return React.createElement('p', { className: 'text-slate-500 text-sm' }, 'Loading...');

  const languages = ['English', 'French', 'Spanish', 'German', 'Portuguese', 'Italian', 'Dutch', 'Russian', 'Chinese', 'Japanese', 'Korean'];

  return React.createElement('div', { className: 'bg-aia-card border border-aia-border rounded p-4 space-y-4' },
    React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('h3', { className: 'text-sm font-semibold text-cyan-400' }, 'User Preferences'),
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

    React.createElement('div', { className: 'grid grid-cols-2 gap-4' },
      // User name
      React.createElement('div', { className: 'space-y-1' },
        React.createElement('label', { className: 'text-xs text-slate-400' }, 'Your Name'),
        React.createElement('input', {
          type: 'text',
          value: prefs.user_name,
          onChange: e => handleChange('user_name', e.target.value),
          placeholder: 'Optional',
          className: 'w-full bg-slate-900 border border-aia-border rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-aia-accent focus:outline-none',
        }),
      ),

      // Communication language
      React.createElement('div', { className: 'space-y-1' },
        React.createElement('label', { className: 'text-xs text-slate-400' }, 'Communication Language'),
        React.createElement('select', {
          value: prefs.communication_language,
          onChange: e => handleChange('communication_language', e.target.value),
          className: 'w-full bg-slate-900 border border-aia-border rounded px-3 py-1.5 text-sm text-slate-200 focus:border-aia-accent focus:outline-none',
        },
          ...languages.map(lang => React.createElement('option', { key: lang, value: lang }, lang)),
        ),
      ),
    ),

    React.createElement('p', { className: 'text-xs text-slate-500' },
      'Your personal preferences. Stored globally in ~/.aia/ and apply to all projects.'
    ),
    configPath && React.createElement('p', { className: 'text-xs text-slate-600' },
      `Location: ${configPath}`
    ),
  );
}

function ProjectSettings({ onSaved }) {
  const [settings, setSettings] = React.useState({
    projectName: '',
    document_output_language: 'English',
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  React.useEffect(() => {
    api.get('/config').then(data => {
      const parsed = data.parsed || {};
      setSettings({
        projectName: parsed.projectName || '',
        document_output_language: parsed.document_output_language || 'English',
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleChange = (field, value) => {
    setSettings(p => ({ ...p, [field]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.patch('/config/project', settings);
      setDirty(false);
      setMsg({ type: 'ok', text: 'Saved.' });
      if (onSaved) onSaved();
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    }
    setSaving(false);
  };

  if (loading) return React.createElement('p', { className: 'text-slate-500 text-sm' }, 'Loading...');

  const languages = ['English', 'French', 'Spanish', 'German', 'Portuguese', 'Italian', 'Dutch', 'Russian', 'Chinese', 'Japanese', 'Korean'];

  return React.createElement('div', { className: 'bg-aia-card border border-aia-border rounded p-4 space-y-4' },
    React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('h3', { className: 'text-sm font-semibold text-violet-400' }, 'Project Settings'),
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

    React.createElement('div', { className: 'grid grid-cols-2 gap-4' },
      // Project name
      React.createElement('div', { className: 'space-y-1' },
        React.createElement('label', { className: 'text-xs text-slate-400' }, 'Project Name'),
        React.createElement('input', {
          type: 'text',
          value: settings.projectName,
          onChange: e => handleChange('projectName', e.target.value),
          placeholder: 'My Project',
          className: 'w-full bg-slate-900 border border-aia-border rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-aia-accent focus:outline-none',
        }),
      ),

      // Document output language
      React.createElement('div', { className: 'space-y-1' },
        React.createElement('label', { className: 'text-xs text-slate-400' }, 'Document Output Language'),
        React.createElement('select', {
          value: settings.document_output_language,
          onChange: e => handleChange('document_output_language', e.target.value),
          className: 'w-full bg-slate-900 border border-aia-border rounded px-3 py-1.5 text-sm text-slate-200 focus:border-aia-accent focus:outline-none',
        },
          ...languages.map(lang => React.createElement('option', { key: lang, value: lang }, lang)),
        ),
      ),
    ),

    React.createElement('p', { className: 'text-xs text-slate-500' },
      'Project-wide settings. Stored in .aia/config.yaml and shared with your team.'
    ),
  );
}

function ProjectScope({ onSaved }) {
  const [apps, setApps] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [scanning, setScanning] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  React.useEffect(() => {
    api.get('/apps').then(setApps).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleToggle = async (appName, enabled) => {
    setDirty(true);
    setMsg(null);
    try {
      await api.patch(`/apps/${appName}`, { enabled });
      setApps(prev => prev.map(a => a.name === appName ? { ...a, enabled } : a));
      setDirty(false);
      setMsg({ type: 'ok', text: 'Saved.' });
      if (onSaved) onSaved();
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    }
  };

  const handleScan = async () => {
    setScanning(true);
    setMsg(null);
    try {
      const scanned = await api.post('/apps/scan');
      setApps(scanned);
      setMsg({ type: 'ok', text: `Found ${scanned.length} app(s).` });
      if (onSaved) onSaved();
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    }
    setScanning(false);
  };

  if (loading) return React.createElement('p', { className: 'text-slate-500 text-sm' }, 'Loading...');

  return React.createElement('div', { className: 'bg-aia-card border border-aia-border rounded p-4 space-y-4' },
    React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('h3', { className: 'text-sm font-semibold text-amber-400' }, 'Project Scope'),
      React.createElement('div', { className: 'flex gap-2 items-center' },
        msg && React.createElement('span', { className: `text-xs ${msg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}` }, msg.text),
        React.createElement('button', {
          onClick: handleScan,
          disabled: scanning,
          className: 'bg-aia-accent/20 text-aia-accent border border-aia-accent/30 rounded px-3 py-1 text-xs hover:bg-aia-accent/30 disabled:opacity-40',
        }, scanning ? 'Scanning...' : 'Re-scan Project'),
      ),
    ),

    apps.length === 0
      ? React.createElement('p', { className: 'text-slate-500 text-sm' },
          'No apps detected. Click "Re-scan Project" to detect apps and submodules.'
        )
      : React.createElement('div', { className: 'space-y-2' },
          ...apps.map(app =>
            React.createElement('div', {
              key: app.name,
              className: 'flex items-center justify-between py-2 border-b border-slate-700 last:border-0',
            },
              React.createElement('div', { className: 'flex items-center gap-2' },
                React.createElement('span', { className: 'text-lg' }, app.icon || '\uD83D\uDCC1'),
                React.createElement('div', null,
                  React.createElement('span', { className: 'text-sm text-slate-200' }, app.name),
                  React.createElement('p', { className: 'text-xs text-slate-500' }, app.path),
                ),
              ),
              React.createElement('label', { className: 'relative inline-flex items-center cursor-pointer' },
                React.createElement('input', {
                  type: 'checkbox',
                  checked: app.enabled !== false,
                  onChange: (e) => handleToggle(app.name, e.target.checked),
                  className: 'sr-only peer',
                }),
                React.createElement('div', {
                  className: 'w-9 h-5 bg-slate-700 rounded-full peer peer-checked:bg-aia-accent peer-checked:after:translate-x-full after:content-[\'\'] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all',
                }),
              ),
            )
          )
        ),

    React.createElement('p', { className: 'text-xs text-slate-500' },
      'Enable/disable apps to control feature scope options. Disabled apps won\'t appear in feature scope selection.'
    ),
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
  const [configVersion, setConfigVersion] = React.useState(0);

  React.useEffect(() => {
    api.get('/context').then(setContextFiles).catch(() => {});
    api.get('/knowledge').then(setKnowledgeCategories).catch(() => {});
  }, []);

  const handlePreferencesSaved = () => {
    setConfigVersion(v => v + 1);
  };

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

    // Two columns: User Preferences + Project Settings
    React.createElement('div', { className: 'grid grid-cols-2 gap-4' },
      React.createElement(UserPreferences),
      React.createElement(ProjectSettings, { onSaved: handlePreferencesSaved }),
    ),

    // Project Scope
    React.createElement(ProjectScope, { onSaved: handlePreferencesSaved }),

    // config.yaml (advanced)
    React.createElement(YamlEditor, {
      key: `config-${configVersion}`,
      title: 'config.yaml (advanced)',
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
