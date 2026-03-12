import React from 'react';
import { api } from '/main.js';
import { Terminal, loadXtermScripts } from '/components/terminal.js';

export function WorktrunkPanel({ featureName }) {
  const [wtStatus, setWtStatus] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [showTerminal, setShowTerminal] = React.useState(false);
  const [terminalReady, setTerminalReady] = React.useState(false);
  const [servicesLoading, setServicesLoading] = React.useState(false);
  const [servicesMessage, setServicesMessage] = React.useState(null);

  const loadStatus = async () => {
    try {
      const status = await api.get(`/features/${featureName}/wt`);
      setWtStatus(status);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  React.useEffect(() => {
    loadStatus();
  }, [featureName]);

  const handleCreateWorktree = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await api.post(`/features/${featureName}/wt/create`);
      await loadStatus();
    } catch (err) {
      setError(err.message);
    }
    setActionLoading(false);
  };

  const handleRemoveWorktree = async () => {
    if (!confirm(`Remove worktree for "${featureName}"? This will delete the worktree directory.`)) {
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await api.delete(`/features/${featureName}/wt`);
      setShowTerminal(false);
      await loadStatus();
    } catch (err) {
      setError(err.message);
    }
    setActionLoading(false);
  };

  const handleOpenTerminal = async () => {
    if (!terminalReady) {
      try {
        await loadXtermScripts();
        setTerminalReady(true);
      } catch {
        setError('Failed to load terminal scripts');
        return;
      }
    }
    setShowTerminal(true);
  };

  const handleStartServices = async () => {
    setServicesLoading(true);
    setError(null);
    setServicesMessage(null);
    try {
      await api.post(`/features/${featureName}/wt/services/start`);
      setServicesMessage('Services started');
      setTimeout(() => setServicesMessage(null), 3000);
    } catch (err) {
      setError(err.message);
    }
    setServicesLoading(false);
  };

  const handleStopServices = async () => {
    setServicesLoading(true);
    setError(null);
    setServicesMessage(null);
    try {
      await api.post(`/features/${featureName}/wt/services/stop`);
      setServicesMessage('Services stopped');
      setTimeout(() => setServicesMessage(null), 3000);
    } catch (err) {
      setError(err.message);
    }
    setServicesLoading(false);
  };

  if (loading) {
    return React.createElement('div', { className: 'bg-aia-card border border-aia-border rounded p-4' },
      React.createElement('p', { className: 'text-slate-500 text-sm' }, 'Loading worktrunk status...')
    );
  }

  // Not installed state
  if (!wtStatus?.installed) {
    return React.createElement('div', { className: 'bg-slate-900 border border-slate-700 rounded p-4' },
      React.createElement('div', { className: 'flex items-center gap-2 mb-2' },
        React.createElement('span', { className: 'text-orange-400' }, 'Worktrunk'),
        React.createElement('span', { className: 'bg-slate-700 text-slate-400 text-xs px-2 py-0.5 rounded' }, 'not installed'),
      ),
      React.createElement('p', { className: 'text-slate-500 text-xs mb-3' },
        'Worktrunk (wt) CLI is not installed. It enables isolated development environments using git worktrees.'
      ),
      React.createElement('div', { className: 'bg-black/30 rounded p-2' },
        React.createElement('code', { className: 'text-xs text-slate-400' },
          'cargo install worktrunk'
        ),
      ),
    );
  }

  // No worktree state
  if (!wtStatus?.hasWorktree) {
    return React.createElement('div', { className: 'bg-slate-900 border border-orange-500/30 rounded p-4' },
      React.createElement('div', { className: 'flex items-center justify-between mb-3' },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('span', { className: 'text-orange-400 font-medium' }, 'Worktrunk'),
        ),
      ),
      React.createElement('p', { className: 'text-slate-400 text-sm mb-3' },
        'Create an isolated worktree for this feature to work without affecting your main branch.'
      ),
      React.createElement('button', {
        onClick: handleCreateWorktree,
        disabled: actionLoading,
        className: 'bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded px-4 py-2 text-sm hover:bg-orange-500/30 disabled:opacity-40',
      }, actionLoading ? 'Creating...' : 'Create Worktree'),
      error && React.createElement('p', { className: 'text-red-400 text-xs mt-2' }, error),
    );
  }

  // Active worktree state
  // F8: Use wss:// for HTTPS, ws:// for HTTP
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/api/terminal?cwd=${encodeURIComponent(wtStatus.path)}`;

  return React.createElement('div', { className: 'bg-slate-900 border border-orange-500/30 rounded p-4 space-y-4' },
    // Header
    React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('span', { className: 'text-orange-400 font-medium' }, 'Worktrunk'),
        React.createElement('span', { className: 'bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded' }, 'active'),
      ),
      React.createElement('button', {
        onClick: handleRemoveWorktree,
        disabled: actionLoading,
        className: 'text-red-400 hover:text-red-300 text-xs disabled:opacity-40',
      }, actionLoading ? 'Removing...' : 'Remove'),
    ),

    // Worktree info
    React.createElement('div', { className: 'space-y-1' },
      React.createElement('p', { className: 'text-xs text-slate-500' }, 'Branch'),
      React.createElement('p', { className: 'text-sm text-slate-300 font-mono' }, wtStatus.branch),
      React.createElement('p', { className: 'text-xs text-slate-500 mt-2' }, 'Path'),
      React.createElement('p', { className: 'text-sm text-slate-400 font-mono truncate', title: wtStatus.path }, wtStatus.path),
    ),

    // Actions
    React.createElement('div', { className: 'flex flex-wrap gap-2' },
      React.createElement('button', {
        onClick: showTerminal ? () => setShowTerminal(false) : handleOpenTerminal,
        className: 'bg-slate-700 text-slate-300 border border-slate-600 rounded px-3 py-1.5 text-xs hover:bg-slate-600',
      }, showTerminal ? 'Hide Terminal' : 'Open Terminal'),

      // Docker services buttons (only if services exist)
      wtStatus.hasServices && React.createElement(React.Fragment, null,
        React.createElement('button', {
          onClick: handleStartServices,
          disabled: servicesLoading,
          className: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded px-3 py-1.5 text-xs hover:bg-emerald-500/30 disabled:opacity-40',
        }, servicesLoading ? '...' : 'Start Services'),
        React.createElement('button', {
          onClick: handleStopServices,
          disabled: servicesLoading,
          className: 'bg-red-500/20 text-red-400 border border-red-500/30 rounded px-3 py-1.5 text-xs hover:bg-red-500/30 disabled:opacity-40',
        }, servicesLoading ? '...' : 'Stop Services'),
      ),
    ),

    // Terminal
    showTerminal && terminalReady && React.createElement('div', { className: 'mt-4' },
      React.createElement(Terminal, {
        wsUrl,
        onClose: () => setShowTerminal(false),
      }),
    ),

    // F9: Services feedback message
    servicesMessage && React.createElement('p', { className: 'text-emerald-400 text-xs' }, servicesMessage),

    // Error
    error && React.createElement('p', { className: 'text-red-400 text-xs' }, error),
  );
}
