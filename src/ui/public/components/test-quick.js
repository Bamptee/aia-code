/**
 * @fileoverview Test-quick UI component
 * Provides a user interface for managing test-quick items
 */

import React from 'react';
import { api } from '/main.js';

const STATUS_COLORS = {
  pending: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  active: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
};

/**
 * Status badge component
 */
function StatusBadge({ status }) {
  return React.createElement('span', {
    className: `inline-block px-2 py-0.5 text-xs rounded border ${STATUS_COLORS[status] || STATUS_COLORS.pending}`,
  }, status);
}

/**
 * Single item card component
 */
function TestQuickItemCard({ item, onStatusChange, onDelete }) {
  const [updating, setUpdating] = React.useState(false);

  async function handleStatusChange(newStatus) {
    setUpdating(true);
    try {
      await api.patch(`/test-quick/${item.name}/status`, { status: newStatus });
      onStatusChange();
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdating(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${item.name}"?`)) return;
    try {
      await api.delete(`/test-quick/${item.name}`);
      onDelete();
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }

  const statusOptions = ['pending', 'active', 'completed', 'error'];

  return React.createElement('div', {
    className: 'bg-aia-card border border-aia-border rounded-lg p-4 hover:border-aia-accent/30 transition-colors',
  },
    // Header row
    React.createElement('div', { className: 'flex items-center justify-between mb-2' },
      React.createElement('h3', { className: 'text-slate-100 font-semibold' }, item.name),
      React.createElement(StatusBadge, { status: item.status }),
    ),

    // Description
    item.description && React.createElement('p', {
      className: 'text-sm text-slate-400 mb-3',
    }, item.description),

    // Timestamps
    React.createElement('div', { className: 'flex gap-4 text-xs text-slate-500 mb-3' },
      React.createElement('span', null, 'Created: ', new Date(item.createdAt).toLocaleDateString()),
      item.updatedAt && React.createElement('span', null, 'Updated: ', new Date(item.updatedAt).toLocaleDateString()),
    ),

    // Actions
    React.createElement('div', { className: 'flex items-center gap-2 pt-2 border-t border-aia-border' },
      React.createElement('select', {
        value: item.status,
        onChange: (e) => handleStatusChange(e.target.value),
        disabled: updating,
        className: 'bg-slate-900 border border-aia-border rounded px-2 py-1 text-xs text-slate-300 focus:border-aia-accent focus:outline-none',
      },
        ...statusOptions.map(s =>
          React.createElement('option', { key: s, value: s }, s)
        )
      ),
      React.createElement('button', {
        onClick: handleDelete,
        className: 'ml-auto text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/10',
      }, 'Delete'),
    ),
  );
}

/**
 * New item form component
 */
function NewItemForm({ onCreated }) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/test-quick', { name, description });
      setName('');
      setDescription('');
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return React.createElement('form', {
    onSubmit: handleSubmit,
    className: 'bg-aia-card border border-aia-border rounded-lg p-4 space-y-3',
  },
    React.createElement('h3', { className: 'text-sm font-semibold text-slate-200' }, 'New Item'),

    React.createElement('div', { className: 'flex gap-2' },
      React.createElement('input', {
        type: 'text',
        value: name,
        onChange: e => setName(e.target.value),
        placeholder: 'item-name',
        disabled: loading,
        className: 'bg-slate-900 border border-aia-border rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-aia-accent focus:outline-none flex-1',
      }),
      React.createElement('input', {
        type: 'text',
        value: description,
        onChange: e => setDescription(e.target.value),
        placeholder: 'Description (optional)',
        disabled: loading,
        className: 'bg-slate-900 border border-aia-border rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-aia-accent focus:outline-none flex-1',
      }),
    ),

    React.createElement('div', { className: 'flex items-center gap-4' },
      React.createElement('button', {
        type: 'submit',
        disabled: loading || !name,
        className: 'bg-aia-accent/20 text-aia-accent border border-aia-accent/30 rounded px-4 py-1.5 text-sm hover:bg-aia-accent/30 disabled:opacity-40',
      }, loading ? 'Creating...' : 'Create Item'),
    ),

    error && React.createElement('p', { className: 'text-red-400 text-xs' }, error),
  );
}

/**
 * Filter tabs component
 */
function FilterTabs({ filter, onChange, counts }) {
  const tabs = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'pending', label: 'Pending', count: counts.pending },
    { key: 'active', label: 'Active', count: counts.active },
    { key: 'completed', label: 'Completed', count: counts.completed },
  ];

  return React.createElement('div', { className: 'flex gap-1 border-b border-aia-border' },
    ...tabs.map(tab =>
      React.createElement('button', {
        key: tab.key,
        onClick: () => onChange(tab.key),
        className: `px-3 py-1.5 text-xs border-b-2 transition-colors ${
          filter === tab.key
            ? 'border-aia-accent text-aia-accent'
            : 'border-transparent text-slate-500 hover:text-slate-300'
        }`,
      },
        tab.label,
        React.createElement('span', { className: 'text-slate-600 ml-1' }, `(${tab.count})`),
      )
    )
  );
}

/**
 * Main test-quick component
 */
export function TestQuickView() {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState('all');
  const [error, setError] = React.useState('');

  async function loadItems() {
    try {
      const result = await api.get('/test-quick');
      setItems(result.items || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    loadItems();
  }, []);

  async function handleClearCompleted() {
    if (!confirm('Clear all completed items?')) return;
    try {
      await api.post('/test-quick/clear-completed');
      loadItems();
    } catch (err) {
      setError(err.message);
    }
  }

  // Filter items
  const filteredItems = filter === 'all'
    ? items
    : items.filter(item => item.status === filter);

  // Counts for tabs
  const counts = {
    all: items.length,
    pending: items.filter(i => i.status === 'pending').length,
    active: items.filter(i => i.status === 'active').length,
    completed: items.filter(i => i.status === 'completed').length,
  };

  return React.createElement('div', { className: 'space-y-6' },
    // Header
    React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('h1', { className: 'text-xl font-bold text-slate-100' }, 'Test Quick'),
      counts.completed > 0 && React.createElement('button', {
        onClick: handleClearCompleted,
        className: 'text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-800',
      }, 'Clear Completed'),
    ),

    // New item form
    React.createElement(NewItemForm, { onCreated: loadItems }),

    // Filter tabs
    !loading && items.length > 0 && React.createElement(FilterTabs, {
      filter,
      onChange: setFilter,
      counts,
    }),

    // Error message
    error && React.createElement('p', { className: 'text-red-400 text-sm' }, error),

    // Items list
    loading
      ? React.createElement('p', { className: 'text-slate-500' }, 'Loading...')
      : items.length === 0
        ? React.createElement('p', { className: 'text-slate-500' }, 'No items yet. Create one to get started.')
        : filteredItems.length === 0
          ? React.createElement('p', { className: 'text-slate-500' }, 'No items match this filter.')
          : React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' },
              ...filteredItems.map(item =>
                React.createElement(TestQuickItemCard, {
                  key: item.id,
                  item,
                  onStatusChange: loadItems,
                  onDelete: loadItems,
                })
              )
            ),
  );
}
