import React, { useEffect, useRef } from 'react';
import { Zap } from 'lucide-react';
import type { SlashCommandSuggestion } from '../../hooks/useSlashCommand.js';

interface SlashCommandDropdownProps {
  suggestions: SlashCommandSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: SlashCommandSuggestion) => void;
  onHover: (index: number) => void;
  query: string;
}

/**
 * Dropdown autocomplete pour les commandes /skill dans le chat.
 */
export function SlashCommandDropdown({ suggestions, selectedIndex, onSelect, onHover, query }: SlashCommandDropdownProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex + 1] as HTMLElement | undefined; // +1 for header
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (suggestions.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 rounded-lg overflow-hidden z-50 max-h-[220px] overflow-y-auto custom-scrollbar"
      style={{
        backgroundColor: 'var(--bg-ctrl)',
        border: '1px solid var(--border-strong)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-1.5 text-xs uppercase font-bold tracking-wider flex items-center gap-1.5"
        style={{ color: 'var(--text-dimmed)', borderBottom: '1px solid var(--border-base)' }}
      >
        <Zap size={9} />
        Skills disponibles
      </div>

      {suggestions.map((item, index) => (
        <button
          key={item.name}
          onClick={() => onSelect(item)}
          onMouseEnter={() => onHover(index)}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
          style={{
            backgroundColor: index === selectedIndex ? 'var(--accent-subtle)' : 'transparent',
          }}
        >
          <div
            className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: index === selectedIndex ? 'var(--accent-primary)' : 'var(--bg-input)',
              border: '1px solid var(--border-base)',
            }}
          >
            <span
              className="text-sm font-bold"
              style={{ color: index === selectedIndex ? 'white' : 'var(--text-muted)' }}
            >
              /
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium block truncate" style={{ color: 'var(--text-primary)' }}>
              <HighlightMatch text={item.name} query={query} />
            </span>
            <span className="text-xs block truncate" style={{ color: 'var(--text-dimmed)' }}>
              {item.description}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

/** Highlight the matching portion of a name */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}
