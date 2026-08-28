import React, { useEffect, useRef } from 'react';
import { File, Folder } from 'lucide-react';
import type { MentionSuggestion } from '../../hooks/useFileMention';

interface MentionDropdownProps {
  suggestions: MentionSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: MentionSuggestion) => void;
  onHover: (index: number) => void;
  query: string;
}

/**
 * Dropdown autocomplete pour les mentions @fichier/@dossier dans le chat.
 */
export function MentionDropdown({ suggestions, selectedIndex, onSelect, onHover, query }: MentionDropdownProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (suggestions.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 rounded-lg overflow-hidden z-50 max-h-[200px] overflow-y-auto custom-scrollbar"
      style={{
        backgroundColor: 'var(--bg-ctrl)',
        border: '1px solid var(--border-strong)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-1.5 text-xs uppercase font-bold tracking-wider"
        style={{ color: 'var(--text-dimmed)', borderBottom: '1px solid var(--border-base)' }}
      >
        Fichiers & Dossiers
      </div>

      {suggestions.map((item, index) => (
        <button
          key={item.path}
          onClick={() => onSelect(item)}
          onMouseEnter={() => onHover(index)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors"
          style={{
            backgroundColor: index === selectedIndex ? 'var(--accent-subtle)' : 'transparent',
          }}
        >
          {item.type === 'directory' ? (
            <Folder size={12} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
          ) : (
            <File size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          )}
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium block truncate" style={{ color: 'var(--text-primary)' }}>
              <HighlightMatch text={item.name} query={query} />
            </span>
            <span className="text-xs block truncate" style={{ color: 'var(--text-dimmed)' }}>
              {item.path}
            </span>
          </div>
          <span
            className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
            style={{
              backgroundColor: item.type === 'directory' ? 'rgba(245,158,11,0.1)' : 'var(--accent-subtle)',
              color: item.type === 'directory' ? 'var(--color-warning)' : 'var(--text-dimmed)',
            }}
          >
            {item.type === 'directory' ? 'dossier' : 'fichier'}
          </span>
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
