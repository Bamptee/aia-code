/**
 * Epic Selector Component
 * Dropdown for selecting and changing epic assignment for stories
 */

import React from 'react';
import { api } from '/main.js';

const { useState, useEffect, useCallback } = React;

/**
 * EpicSelector - A dropdown component for selecting epics
 * @param {Object} props
 * @param {string} props.currentEpicId - Current epic slug/id
 * @param {Function} props.onEpicChange - Callback when epic changes (async)
 * @param {boolean} props.disabled - Disable the selector
 * @param {boolean} props.showCount - Show story count next to epic name
 * @param {string} props.className - Additional CSS classes
 */
export function EpicSelector({ currentEpicId, onEpicChange, disabled = false, showCount = true, className = '' }) {
  const [epics, setEpics] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  const loadEpics = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.get('/epics/dropdown');
      setEpics(response.epics || []);
    } catch (err) {
      setError('Failed to load epics');
      console.error('Error loading epics:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEpics();
  }, [loadEpics]);

  const handleChange = async (newEpicId) => {
    if (newEpicId === currentEpicId || disabled || isUpdating) return;

    setIsUpdating(true);
    setError(null);
    setIsOpen(false);

    try {
      await onEpicChange(newEpicId);
    } catch (err) {
      setError('Failed to update epic');
      console.error('Error updating epic:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const currentEpic = epics.find(e => e.id === currentEpicId || e.slug === currentEpicId);
  const displayName = currentEpic?.name || currentEpicId || 'Select epic...';

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isOpen && !e.target.closest('.epic-selector')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  if (isLoading) {
    return React.createElement('div', {
      className: `inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-400 ${className}`,
    },
      React.createElement('div', { className: 'w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin' }),
      'Loading...'
    );
  }

  return React.createElement('div', { className: `epic-selector relative ${className}` },
    // Dropdown trigger button
    React.createElement('button', {
      onClick: (e) => {
        e.stopPropagation();
        if (!disabled && !isUpdating) setIsOpen(!isOpen);
      },
      disabled: disabled || isUpdating,
      className: `flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm transition-colors ${
        disabled || isUpdating
          ? 'opacity-50 cursor-not-allowed text-slate-500'
          : 'text-slate-300 hover:border-slate-600 hover:text-slate-200 cursor-pointer'
      }`,
    },
      React.createElement('span', { className: 'text-violet-400' }, '📁'),
      React.createElement('span', { className: 'max-w-32 truncate' }, displayName),
      currentEpic?.isDefault && React.createElement('span', {
        className: 'text-xs bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded',
      }, 'Default'),
      isUpdating
        ? React.createElement('div', { className: 'w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin' })
        : React.createElement('svg', {
            className: `w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`,
            fill: 'none',
            stroke: 'currentColor',
            viewBox: '0 0 24 24',
          },
            React.createElement('path', {
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              strokeWidth: 2,
              d: 'M19 9l-7 7-7-7',
            })
          )
    ),

    // Dropdown menu
    isOpen && React.createElement('div', {
      className: 'absolute top-full left-0 mt-1 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden',
    },
      React.createElement('div', { className: 'max-h-64 overflow-y-auto' },
        epics.length === 0
          ? React.createElement('div', {
              className: 'px-3 py-4 text-sm text-slate-500 text-center',
            }, 'No epics available')
          : epics.map(epic =>
              React.createElement('button', {
                key: epic.id || epic.slug,
                onClick: () => handleChange(epic.id || epic.slug),
                className: `w-full px-3 py-2 text-left text-sm transition-colors flex items-center justify-between ${
                  (epic.id === currentEpicId || epic.slug === currentEpicId)
                    ? 'bg-violet-500/20 text-violet-300'
                    : 'text-slate-300 hover:bg-slate-700'
                }`,
              },
                React.createElement('div', { className: 'flex items-center gap-2 min-w-0' },
                  React.createElement('span', null, epic.isDefault ? '⭐' : '📁'),
                  React.createElement('span', { className: 'truncate' }, epic.name),
                  epic.isDefault && React.createElement('span', {
                    className: 'text-xs text-violet-400',
                  }, '(Default)')
                ),
                showCount && React.createElement('span', {
                  className: 'text-xs text-slate-500 ml-2 flex-shrink-0',
                }, `${epic.storyCount || 0}`)
              )
            )
      )
    ),

    // Error message
    error && React.createElement('p', {
      className: 'absolute top-full left-0 mt-1 text-red-400 text-xs',
    }, error)
  );
}

/**
 * Compact inline epic selector for story cards/list items
 */
export function EpicSelectorInline({ currentEpicId, currentEpicName, storySlug, onUpdate, disabled = false }) {
  const [isEditing, setIsEditing] = useState(false);

  const handleEpicChange = async (newEpicId) => {
    try {
      const response = await api.patch(`/stories/${storySlug}/epic`, { epic: newEpicId });
      if (onUpdate) onUpdate(response);
      setIsEditing(false);
    } catch (err) {
      console.error('Error updating story epic:', err);
      throw err;
    }
  };

  if (!isEditing) {
    return React.createElement('button', {
      onClick: () => !disabled && setIsEditing(true),
      disabled,
      className: `inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
        disabled
          ? 'text-slate-500 cursor-not-allowed'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700 cursor-pointer'
      }`,
      title: 'Click to change epic',
    },
      React.createElement('span', null, '📁'),
      React.createElement('span', { className: 'max-w-24 truncate' }, currentEpicName || currentEpicId || 'No epic')
    );
  }

  return React.createElement(EpicSelector, {
    currentEpicId,
    onEpicChange: handleEpicChange,
    disabled,
    showCount: false,
    className: 'inline-block',
  });
}
