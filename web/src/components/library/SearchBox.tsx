'use client';

import { Search, X } from 'lucide-react';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Search box (FR-8).
 * Case-insensitive filter sur title + snippet + id (la logique vit dans la Library page).
 */
export function SearchBox({ value, onChange, placeholder = 'Search stories…' }: SearchBoxProps) {
  return (
    <div className="relative flex items-center">
      <Search
        size={14}
        className="pointer-events-none absolute left-2 text-text-3"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-64 rounded border border-border bg-surface py-1.5 pl-7 pr-7 text-sm text-text placeholder:text-text-3 focus:border-border-strong focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-1.5 text-text-3 hover:text-text"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
