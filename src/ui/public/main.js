import React from 'react';
import { createRoot } from 'react-dom/client';
import { Dashboard } from '/components/dashboard.js';
import { ConfigView } from '/components/config-view.js';
import { EpicDashboard } from '/components/epic-dashboard.js';
import { EpicDetail } from '/components/epic-detail.js';
import { StoryView } from '/components/story-view.js';
import { RoadmapView } from '/components/roadmap-view.js';
import { QADashboard } from '/components/qa-dashboard.js';
import { TasksPage } from '/components/tasks-page.js';

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
  async patch(path, body = {}) {
    const res = await fetch(`/api${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    return res.json();
  },
  async delete(path) {
    const res = await fetch(`/api${path}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    return res.json();
  },
  async upload(path, formData) {
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    return res.json();
  },
};

// --- SSE stream helper ---
// POST with SSE response. Calls onLog(text) for each log chunk, returns { ok, error }.
export async function streamPost(path, body, { onLog, onStatus }) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = { ok: true };
  let eventType = null; // Persist between processLines calls

  const processLines = (lines) => {
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ') && eventType) {
        try {
          const data = JSON.parse(line.slice(6));
          if (eventType === 'log' && onLog) {
            onLog(data.text, data.type);
          } else if (eventType === 'status' && onStatus) {
            onStatus(data);
          } else if (eventType === 'error') {
            result = { ok: false, error: data.message };
          } else if (eventType === 'done') {
            result = { ok: true, ...data };
          }
          // Only reset eventType after successful parsing
          eventType = null;
        } catch (e) {
          // JSON parse failed - keep eventType for retry with more data
        }
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;

    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line

    processLines(lines);
  }

  // Process any remaining data in buffer after stream ends
  if (buffer.trim()) {
    processLines(buffer.split('\n'));
  }

  return result;
}

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
  // Epic routes
  if (hash === '#/epics') return { page: 'epics' };
  if (hash.startsWith('#/epics/')) {
    return { page: 'epic', id: decodeURIComponent(hash.slice('#/epics/'.length)) };
  }

  // Story tasks route
  const tasksMatch = hash.match(/^#\/(?:stories|product)\/([^/]+)\/tasks$/);
  if (tasksMatch) {
    return { page: 'tasks', slug: decodeURIComponent(tasksMatch[1]) };
  }

  // New unified routes: /product/:slug, /dev/:slug, /qa/:slug
  if (hash.startsWith('#/product/')) {
    return { page: 'story-view', slug: decodeURIComponent(hash.slice('#/product/'.length)), context: 'product' };
  }
  if (hash.startsWith('#/dev/')) {
    return { page: 'story-view', slug: decodeURIComponent(hash.slice('#/dev/'.length)), context: 'dev' };
  }
  // QA view for specific story
  const qaStoryMatch = hash.match(/^#\/qa\/([^/]+)$/);
  if (qaStoryMatch && qaStoryMatch[1] !== '') {
    return { page: 'story-view', slug: decodeURIComponent(qaStoryMatch[1]), context: 'qa' };
  }

  // Legacy routes - redirect to new routes
  if (hash.startsWith('#/stories/')) {
    const slug = decodeURIComponent(hash.slice('#/stories/'.length));
    window.location.hash = `#/product/${slug}`;
    return { page: 'story-view', slug, context: 'product' };
  }
  if (hash.startsWith('#/features/')) {
    const slug = decodeURIComponent(hash.slice('#/features/'.length));
    window.location.hash = `#/dev/${slug}`;
    return { page: 'story-view', slug, context: 'dev' };
  }

  if (hash === '#/roadmap') return { page: 'roadmap' };
  if (hash === '#/qa') return { page: 'qa' };
  if (hash === '#/dev') return { page: 'dev' };
  if (hash === '#/product') return { page: 'product' };
  if (hash === '#/config') return { page: 'config' };
  return { page: 'dashboard' };
}

// Navigation link component
function NavLink({ href, children, isActive }) {
  return React.createElement('a', {
    href,
    className: `text-sm transition-colors ${
      isActive
        ? 'text-aia-accent font-medium'
        : 'text-slate-400 hover:text-slate-200'
    }`,
  }, children);
}

// Dropdown menu for nav groups
function NavDropdown({ label, items, currentPage }) {
  const [open, setOpen] = React.useState(false);
  const isActive = items.some(item => item.page === currentPage);

  return React.createElement('div', { className: 'relative' },
    React.createElement('button', {
      onClick: () => setOpen(!open),
      className: `text-sm flex items-center gap-1 transition-colors ${
        isActive
          ? 'text-aia-accent font-medium'
          : 'text-slate-400 hover:text-slate-200'
      }`,
    },
      label,
      React.createElement('svg', {
        className: `w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`,
        fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24',
      },
        React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 9l-7 7-7-7' })
      )
    ),
    open && React.createElement('div', {
      className: 'absolute top-full left-0 mt-1 py-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl min-w-[140px] z-50',
    },
      items.map(item =>
        React.createElement('a', {
          key: item.href,
          href: item.href,
          onClick: () => setOpen(false),
          className: `block px-3 py-2 text-sm transition-colors ${
            item.page === currentPage
              ? 'text-aia-accent bg-slate-700/50'
              : 'text-slate-300 hover:bg-slate-700/50'
          }`,
        }, item.label)
      )
    ),
    open && React.createElement('div', {
      className: 'fixed inset-0 z-40',
      onClick: () => setOpen(false),
    })
  );
}

// --- App ---
function App() {
  const hash = useHashRoute();
  const { page, name, id, slug, context } = parseRoute(hash);
  const [projectName, setProjectName] = React.useState('');

  React.useEffect(() => {
    api.get('/config').then(data => {
      if (data.parsed?.projectName) setProjectName(data.parsed.projectName);
    }).catch(() => {});
  }, []);

  // Render current page
  const renderPage = () => {
    switch (page) {
      case 'dashboard':
      case 'dev':
        return React.createElement(Dashboard, { context: 'dev' });
      case 'config':
        return React.createElement(ConfigView);
      case 'epics':
      case 'product':
        return React.createElement(EpicDashboard);
      case 'epic':
        return React.createElement(EpicDetail, { epicId: id });
      case 'story-view':
        return React.createElement(StoryView, { slug, context });
      case 'tasks':
        return React.createElement(TasksPage, { storyId: slug || id });
      case 'roadmap':
        return React.createElement(RoadmapView);
      case 'qa':
        return React.createElement(QADashboard);
      default:
        return React.createElement(Dashboard, { context: 'dev' });
    }
  };

  return React.createElement('div', { className: 'min-h-screen' },
    // Navigation
    React.createElement('nav', { className: 'border-b border-aia-border px-6 py-3 flex items-center gap-6' },
      // Logo
      React.createElement('a', { href: '#/', className: 'text-aia-accent font-bold text-lg hover:text-sky-300 flex items-center gap-1.5' },
        'AIA',
        React.createElement('span', { className: 'text-slate-500 font-light text-sm tracking-tight' }, '{code}'),
      ),

      // Project name badge
      projectName && React.createElement('span', {
        className: 'bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded text-xs font-medium',
      }, projectName),

      // Divider
      React.createElement('div', { className: 'h-4 w-px bg-slate-700' }),

      // Product section
      React.createElement(NavLink, {
        href: '#/product',
        isActive: page === 'product' || page === 'epics',
      }, '🔍 Product'),

      // Dev section
      React.createElement(NavLink, {
        href: '#/dev',
        isActive: page === 'dev' || page === 'dashboard',
      }, '🚀 Dev'),

      // QA section
      React.createElement(NavLink, {
        href: '#/qa',
        isActive: page === 'qa',
      }, '✅ QA'),

      // Roadmap
      React.createElement(NavLink, {
        href: '#/roadmap',
        isActive: page === 'roadmap',
      }, '📅 Roadmap'),

      // Config - right aligned
      React.createElement('div', { className: 'ml-auto' },
        React.createElement(NavLink, {
          href: '#/config',
          isActive: page === 'config',
        }, '⚙️ Config'),
      ),
    ),

    // Main content
    React.createElement('main', { className: 'max-w-6xl mx-auto p-6' },
      renderPage()
    )
  );
}

createRoot(document.getElementById('root')).render(React.createElement(App));
