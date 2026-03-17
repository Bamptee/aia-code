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

  // Docker services state
  const [services, setServices] = React.useState([]);
  const [servicesLoading, setServicesLoading] = React.useState(false);
  const [serviceActionLoading, setServiceActionLoading] = React.useState(null); // service name being acted on
  const [serviceTerminal, setServiceTerminal] = React.useState(null); // { service, name }

  const loadStatus = async () => {
    try {
      const status = await api.get(`/features/${featureName}/wt`);
      setWtStatus(status);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const loadServices = async () => {
    setServicesLoading(true);
    try {
      const data = await api.get(`/features/${featureName}/wt/services`);
      setServices(data.services || []);
    } catch {
      setServices([]);
    }
    setServicesLoading(false);
  };

  React.useEffect(() => {
    loadStatus();
  }, [featureName]);

  // Load services when worktree is active and docker is available
  React.useEffect(() => {
    if (wtStatus?.hasWorktree && wtStatus?.docker?.available && wtStatus?.docker?.hasComposeFile) {
      loadServices();
    }
  }, [wtStatus?.hasWorktree, wtStatus?.docker?.available, wtStatus?.docker?.hasComposeFile]);

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
      setServiceTerminal(null);
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
    setServiceTerminal(null);
    setShowTerminal(true);
  };

  // Service actions
  const handleStartService = async (serviceName) => {
    setServiceActionLoading(serviceName);
    setError(null);
    try {
      await api.post(`/features/${featureName}/wt/services/${serviceName}/start`);
      await loadServices();
    } catch (err) {
      setError(err.message);
    }
    setServiceActionLoading(null);
  };

  const handleStopService = async (serviceName) => {
    setServiceActionLoading(serviceName);
    setError(null);
    try {
      await api.post(`/features/${featureName}/wt/services/${serviceName}/stop`);
      await loadServices();
    } catch (err) {
      setError(err.message);
    }
    setServiceActionLoading(null);
  };

  const handleStartAllServices = async () => {
    setServicesLoading(true);
    setError(null);
    try {
      await api.post(`/features/${featureName}/wt/services/start`);
      await loadServices();
    } catch (err) {
      setError(err.message);
    }
    setServicesLoading(false);
  };

  const handleStopAllServices = async () => {
    setServicesLoading(true);
    setError(null);
    try {
      await api.post(`/features/${featureName}/wt/services/stop`);
      await loadServices();
    } catch (err) {
      setError(err.message);
    }
    setServicesLoading(false);
  };

  const handleOpenServiceShell = async (serviceName) => {
    if (!terminalReady) {
      try {
        await loadXtermScripts();
        setTerminalReady(true);
      } catch {
        setError('Failed to load terminal scripts');
        return;
      }
    }
    setShowTerminal(false);
    setServiceTerminal({ service: serviceName });
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
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/api/terminal?cwd=${encodeURIComponent(wtStatus.path)}`;
  const serviceWsUrl = serviceTerminal
    ? `${wsProtocol}//${window.location.host}/api/terminal/compose?service=${encodeURIComponent(serviceTerminal.service)}&cwd=${encodeURIComponent(wtStatus.path)}`
    : null;

  const dockerAvailable = wtStatus.docker?.available;
  const hasComposeFile = wtStatus.docker?.hasComposeFile;

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

    // Terminal button
    React.createElement('div', { className: 'flex flex-wrap gap-2' },
      React.createElement('button', {
        onClick: showTerminal ? () => setShowTerminal(false) : handleOpenTerminal,
        className: 'bg-slate-700 text-slate-300 border border-slate-600 rounded px-3 py-1.5 text-xs hover:bg-slate-600',
      }, showTerminal ? 'Hide Terminal' : 'Open Terminal'),
    ),

    // Docker section
    React.createElement('div', { className: 'border-t border-slate-700 pt-4 space-y-3' },
      // Docker status header
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('span', { className: 'text-cyan-400 font-medium text-sm' }, 'Docker'),
          dockerAvailable
            ? React.createElement('span', { className: 'bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded' }, 'running')
            : React.createElement('span', { className: 'bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded' }, 'not running'),
        ),
        hasComposeFile && dockerAvailable && React.createElement('button', {
          onClick: loadServices,
          disabled: servicesLoading,
          className: 'text-slate-500 hover:text-slate-300 text-xs',
        }, servicesLoading ? '...' : 'Refresh'),
      ),

      // No Docker available
      !dockerAvailable && React.createElement('p', { className: 'text-slate-500 text-xs' },
        'Docker daemon is not running. Start Docker to manage services.'
      ),

      // Docker available but no compose file
      dockerAvailable && !hasComposeFile && React.createElement('p', { className: 'text-slate-500 text-xs' },
        'No docker-compose.wt.yml found in worktree. Create one to manage services.'
      ),

      // Services list
      dockerAvailable && hasComposeFile && services.length > 0 && React.createElement('div', { className: 'space-y-2' },
        // Start All / Stop All buttons
        React.createElement('div', { className: 'flex gap-2' },
          React.createElement('button', {
            onClick: handleStartAllServices,
            disabled: servicesLoading,
            className: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded px-3 py-1 text-xs hover:bg-emerald-500/30 disabled:opacity-40',
          }, servicesLoading ? '...' : 'Start All'),
          React.createElement('button', {
            onClick: handleStopAllServices,
            disabled: servicesLoading,
            className: 'bg-red-500/20 text-red-400 border border-red-500/30 rounded px-3 py-1 text-xs hover:bg-red-500/30 disabled:opacity-40',
          }, servicesLoading ? '...' : 'Stop All'),
        ),

        // Services
        React.createElement('div', { className: 'space-y-1' },
          ...services.map(svc => {
            const isRunning = svc.state === 'running';
            const isLoading = serviceActionLoading === svc.name;

            return React.createElement('div', {
              key: svc.name,
              className: 'flex items-center justify-between bg-slate-800 rounded px-3 py-2',
            },
              React.createElement('div', { className: 'flex items-center gap-2 flex-wrap' },
                React.createElement('span', {
                  className: `w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-slate-500'}`,
                  title: svc.state,
                }),
                React.createElement('span', { className: 'text-sm text-slate-300 font-mono' }, svc.name),
                svc.health && React.createElement('span', {
                  className: `text-xs px-1.5 py-0.5 rounded ${svc.health === 'healthy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`,
                }, svc.health),
                // Display ports
                svc.ports && svc.ports.length > 0 && React.createElement('span', {
                  className: 'text-xs text-cyan-500 font-mono',
                }, svc.ports.map(p => `:${p.published}`).join(' ')),
              ),
              React.createElement('div', { className: 'flex gap-2' },
                isRunning && React.createElement('button', {
                  onClick: () => handleOpenServiceShell(svc.name),
                  className: 'text-cyan-400 hover:text-cyan-300 text-xs',
                }, 'Shell'),
                isRunning
                  ? React.createElement('button', {
                      onClick: () => handleStopService(svc.name),
                      disabled: isLoading,
                      className: 'text-red-400 hover:text-red-300 text-xs disabled:opacity-40',
                    }, isLoading ? '...' : 'Stop')
                  : React.createElement('button', {
                      onClick: () => handleStartService(svc.name),
                      disabled: isLoading,
                      className: 'text-emerald-400 hover:text-emerald-300 text-xs disabled:opacity-40',
                    }, isLoading ? '...' : 'Start'),
              ),
            );
          }),
        ),
      ),

      // Loading services
      dockerAvailable && hasComposeFile && servicesLoading && services.length === 0 && React.createElement('p', { className: 'text-slate-500 text-xs' },
        'Loading services...'
      ),

      // No services defined
      dockerAvailable && hasComposeFile && !servicesLoading && services.length === 0 && React.createElement('p', { className: 'text-slate-500 text-xs' },
        'No services defined in docker-compose.wt.yml'
      ),
    ),

    // Worktree Terminal
    showTerminal && terminalReady && React.createElement('div', { className: 'mt-4' },
      React.createElement(Terminal, {
        wsUrl,
        onClose: () => setShowTerminal(false),
      }),
    ),

    // Service Terminal
    serviceTerminal && terminalReady && React.createElement('div', { className: 'mt-4' },
      React.createElement('div', { className: 'flex items-center justify-between mb-2' },
        React.createElement('span', { className: 'text-xs text-cyan-400' }, `Shell: ${serviceTerminal.service}`),
        React.createElement('button', {
          onClick: () => setServiceTerminal(null),
          className: 'text-slate-500 hover:text-slate-300 text-xs',
        }, 'Close'),
      ),
      React.createElement(Terminal, {
        wsUrl: serviceWsUrl,
        onClose: () => setServiceTerminal(null),
      }),
    ),

    // Error
    error && React.createElement('p', { className: 'text-red-400 text-xs' }, error),
  );
}

/**
 * StoryWorktrunkPanel - Worktrunk panel for Stories (uses /api/stories/:id/worktrunk endpoints)
 */
export function StoryWorktrunkPanel({ storyId, onWorktrunkChange }) {
  const [wtStatus, setWtStatus] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [showTerminal, setShowTerminal] = React.useState(false);
  const [terminalReady, setTerminalReady] = React.useState(false);

  // Docker services state
  const [services, setServices] = React.useState([]);
  const [servicesLoading, setServicesLoading] = React.useState(false);
  const [serviceActionLoading, setServiceActionLoading] = React.useState(null);
  const [serviceTerminal, setServiceTerminal] = React.useState(null);

  const loadStatus = async () => {
    try {
      const status = await api.get(`/stories/${storyId}/worktrunk`);
      setWtStatus(status);
      setError(null);
    } catch (err) {
      // On error, still set a default wtStatus so we don't show "not installed"
      setWtStatus({ installed: true, hasWorktree: false, error: true });
      setError(err.message);
    }
    setLoading(false);
  };

  const loadServices = async () => {
    setServicesLoading(true);
    try {
      const data = await api.get(`/stories/${storyId}/worktrunk/services`);
      setServices(data.services || []);
    } catch {
      setServices([]);
    }
    setServicesLoading(false);
  };

  React.useEffect(() => {
    loadStatus();
  }, [storyId]);

  React.useEffect(() => {
    if (wtStatus?.hasWorktree && wtStatus?.docker?.available && wtStatus?.docker?.hasComposeFile) {
      loadServices();
    }
  }, [wtStatus?.hasWorktree, wtStatus?.docker?.available, wtStatus?.docker?.hasComposeFile]);

  const handleCreateWorktree = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await api.post(`/stories/${storyId}/worktrunk`);
      await loadStatus();
      if (onWorktrunkChange) onWorktrunkChange(true);
    } catch (err) {
      setError(err.message);
    }
    setActionLoading(false);
  };

  const handleRemoveWorktree = async () => {
    if (!confirm('Remove worktree for this story? This will delete the worktree directory.')) {
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await api.delete(`/stories/${storyId}/worktrunk`);
      setShowTerminal(false);
      setServiceTerminal(null);
      await loadStatus();
      if (onWorktrunkChange) onWorktrunkChange(false);
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
    setServiceTerminal(null);
    setShowTerminal(true);
  };

  const handleStartService = async (serviceName) => {
    setServiceActionLoading(serviceName);
    setError(null);
    try {
      await api.post(`/stories/${storyId}/worktrunk/services/${serviceName}/start`);
      await loadServices();
    } catch (err) {
      setError(err.message);
    }
    setServiceActionLoading(null);
  };

  const handleStopService = async (serviceName) => {
    setServiceActionLoading(serviceName);
    setError(null);
    try {
      await api.post(`/stories/${storyId}/worktrunk/services/${serviceName}/stop`);
      await loadServices();
    } catch (err) {
      setError(err.message);
    }
    setServiceActionLoading(null);
  };

  const handleStartAllServices = async () => {
    setServicesLoading(true);
    setError(null);
    try {
      await api.post(`/stories/${storyId}/worktrunk/services/start`);
      await loadServices();
    } catch (err) {
      setError(err.message);
    }
    setServicesLoading(false);
  };

  const handleStopAllServices = async () => {
    setServicesLoading(true);
    setError(null);
    try {
      await api.post(`/stories/${storyId}/worktrunk/services/stop`);
      await loadServices();
    } catch (err) {
      setError(err.message);
    }
    setServicesLoading(false);
  };

  const handleOpenServiceShell = async (serviceName) => {
    if (!terminalReady) {
      try {
        await loadXtermScripts();
        setTerminalReady(true);
      } catch {
        setError('Failed to load terminal scripts');
        return;
      }
    }
    setShowTerminal(false);
    setServiceTerminal({ service: serviceName });
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
        'Create an isolated worktree for this story to work without affecting your main branch.'
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
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/api/terminal?cwd=${encodeURIComponent(wtStatus.path)}`;
  const serviceWsUrl = serviceTerminal
    ? `${wsProtocol}//${window.location.host}/api/terminal/compose?service=${encodeURIComponent(serviceTerminal.service)}&cwd=${encodeURIComponent(wtStatus.path)}`
    : null;

  const dockerAvailable = wtStatus.docker?.available;
  const hasComposeFile = wtStatus.docker?.hasComposeFile;

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
      // Submodule branches if any
      wtStatus.submoduleBranches && wtStatus.submoduleBranches.length > 0 && React.createElement('div', { className: 'mt-2' },
        React.createElement('p', { className: 'text-xs text-slate-500' }, 'Submodule Branches'),
        ...wtStatus.submoduleBranches.map(sb =>
          React.createElement('p', { key: sb.app, className: 'text-xs text-slate-400 font-mono' }, `${sb.app}: ${sb.branch}`)
        ),
      ),
    ),

    // Terminal button
    React.createElement('div', { className: 'flex flex-wrap gap-2' },
      React.createElement('button', {
        onClick: showTerminal ? () => setShowTerminal(false) : handleOpenTerminal,
        className: 'bg-slate-700 text-slate-300 border border-slate-600 rounded px-3 py-1.5 text-xs hover:bg-slate-600',
      }, showTerminal ? 'Hide Terminal' : 'Open Terminal'),
    ),

    // Docker section
    React.createElement('div', { className: 'border-t border-slate-700 pt-4 space-y-3' },
      // Docker status header
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('span', { className: 'text-cyan-400 font-medium text-sm' }, 'Docker'),
          dockerAvailable
            ? React.createElement('span', { className: 'bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded' }, 'running')
            : React.createElement('span', { className: 'bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded' }, 'not running'),
        ),
        hasComposeFile && dockerAvailable && React.createElement('button', {
          onClick: loadServices,
          disabled: servicesLoading,
          className: 'text-slate-500 hover:text-slate-300 text-xs',
        }, servicesLoading ? '...' : 'Refresh'),
      ),

      // No Docker available
      !dockerAvailable && React.createElement('p', { className: 'text-slate-500 text-xs' },
        'Docker daemon is not running. Start Docker to manage services.'
      ),

      // Docker available but no compose file
      dockerAvailable && !hasComposeFile && React.createElement('p', { className: 'text-slate-500 text-xs' },
        'No docker-compose.wt.yml found in worktree. Create one to manage services.'
      ),

      // Services list
      dockerAvailable && hasComposeFile && services.length > 0 && React.createElement('div', { className: 'space-y-2' },
        React.createElement('div', { className: 'flex gap-2' },
          React.createElement('button', {
            onClick: handleStartAllServices,
            disabled: servicesLoading,
            className: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded px-3 py-1 text-xs hover:bg-emerald-500/30 disabled:opacity-40',
          }, servicesLoading ? '...' : 'Start All'),
          React.createElement('button', {
            onClick: handleStopAllServices,
            disabled: servicesLoading,
            className: 'bg-red-500/20 text-red-400 border border-red-500/30 rounded px-3 py-1 text-xs hover:bg-red-500/30 disabled:opacity-40',
          }, servicesLoading ? '...' : 'Stop All'),
        ),

        React.createElement('div', { className: 'space-y-1' },
          ...services.map(svc => {
            const isRunning = svc.state === 'running';
            const isLoading = serviceActionLoading === svc.name;

            return React.createElement('div', {
              key: svc.name,
              className: 'flex items-center justify-between bg-slate-800 rounded px-3 py-2',
            },
              React.createElement('div', { className: 'flex items-center gap-2 flex-wrap' },
                React.createElement('span', {
                  className: `w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-slate-500'}`,
                  title: svc.state,
                }),
                React.createElement('span', { className: 'text-sm text-slate-300 font-mono' }, svc.name),
                svc.health && React.createElement('span', {
                  className: `text-xs px-1.5 py-0.5 rounded ${svc.health === 'healthy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`,
                }, svc.health),
                svc.ports && svc.ports.length > 0 && React.createElement('span', {
                  className: 'text-xs text-cyan-500 font-mono',
                }, svc.ports.map(p => `:${p.published}`).join(' ')),
              ),
              React.createElement('div', { className: 'flex gap-2' },
                isRunning && React.createElement('button', {
                  onClick: () => handleOpenServiceShell(svc.name),
                  className: 'text-cyan-400 hover:text-cyan-300 text-xs',
                }, 'Shell'),
                isRunning
                  ? React.createElement('button', {
                      onClick: () => handleStopService(svc.name),
                      disabled: isLoading,
                      className: 'text-red-400 hover:text-red-300 text-xs disabled:opacity-40',
                    }, isLoading ? '...' : 'Stop')
                  : React.createElement('button', {
                      onClick: () => handleStartService(svc.name),
                      disabled: isLoading,
                      className: 'text-emerald-400 hover:text-emerald-300 text-xs disabled:opacity-40',
                    }, isLoading ? '...' : 'Start'),
              ),
            );
          }),
        ),
      ),

      // Loading services
      dockerAvailable && hasComposeFile && servicesLoading && services.length === 0 && React.createElement('p', { className: 'text-slate-500 text-xs' },
        'Loading services...'
      ),

      // No services defined
      dockerAvailable && hasComposeFile && !servicesLoading && services.length === 0 && React.createElement('p', { className: 'text-slate-500 text-xs' },
        'No services defined in docker-compose.wt.yml'
      ),
    ),

    // Worktree Terminal
    showTerminal && terminalReady && React.createElement('div', { className: 'mt-4' },
      React.createElement(Terminal, {
        wsUrl,
        onClose: () => setShowTerminal(false),
      }),
    ),

    // Service Terminal
    serviceTerminal && terminalReady && React.createElement('div', { className: 'mt-4' },
      React.createElement('div', { className: 'flex items-center justify-between mb-2' },
        React.createElement('span', { className: 'text-xs text-cyan-400' }, `Shell: ${serviceTerminal.service}`),
        React.createElement('button', {
          onClick: () => setServiceTerminal(null),
          className: 'text-slate-500 hover:text-slate-300 text-xs',
        }, 'Close'),
      ),
      React.createElement(Terminal, {
        wsUrl: serviceWsUrl,
        onClose: () => setServiceTerminal(null),
      }),
    ),

    // Error
    error && React.createElement('p', { className: 'text-red-400 text-xs' }, error),
  );
}
