import React from 'react';
import { createRoot } from 'react-dom/client';
import { Dashboard } from '/components/dashboard.js';
import { FeatureDetail } from '/components/feature-detail.js';
import { ConfigView } from '/components/config-view.js';

// --- API client ---
export const api = {
  async get(path) {
    const res = await fetch(`/api${path}`);
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    return res.json();
  },
  async post(path, body = {}) {
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    return res.json();
  },
  async put(path, body = {}) {
    const res = await fetch(`/api${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    return res.json();
  },
};

// --- Simple hash router ---
function useHashRoute() {
  const [route, setRoute] = React.useState(window.location.hash || '#/');
  React.useEffect(() => {
    const handler = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return route;
}

function parseRoute(hash) {
  if (hash.startsWith('#/features/')) {
    return { page: 'feature', name: decodeURIComponent(hash.slice('#/features/'.length)) };
  }
  if (hash === '#/config') return { page: 'config' };
  return { page: 'dashboard' };
}

// --- App ---
function App() {
  const hash = useHashRoute();
  const { page, name } = parseRoute(hash);

  return React.createElement('div', { className: 'min-h-screen' },
    React.createElement('nav', { className: 'border-b border-aia-border px-6 py-3 flex items-center gap-6' },
      React.createElement('a', { href: '#/', className: 'text-aia-accent font-bold text-lg hover:text-sky-300' }, 'AIA'),
      React.createElement('a', { href: '#/', className: 'text-slate-400 hover:text-slate-200 text-sm' }, 'Features'),
      React.createElement('a', { href: '#/config', className: 'text-slate-400 hover:text-slate-200 text-sm' }, 'Config'),
    ),
    React.createElement('main', { className: 'max-w-6xl mx-auto p-6' },
      page === 'dashboard' ? React.createElement(Dashboard) :
      page === 'feature' ? React.createElement(FeatureDetail, { name }) :
      page === 'config' ? React.createElement(ConfigView) : null
    )
  );
}

createRoot(document.getElementById('root')).render(React.createElement(App));
