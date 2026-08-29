import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileIcon } from './FileIcon';
import {
  Search, Command, Save, WrapText, Map, AlignJustify,
  X, ArrowUp, ArrowDown, CornerDownLeft,
} from 'lucide-react';

// ── Auth helpers ───────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('Leanna_api_token');
  return token ? { 'x-Leanna-token': token } : {};
}

// ── Types ──────────────────────────────────────────────────────────────────

type PaletteMode = 'files' | 'commands';

interface FileEntry {
  path: string;
  name: string;
}

interface CommandEntry {
  id: string;
  label: string;
  description?: string;
  category?: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  mode: PaletteMode;
  openFiles: { path: string }[];
  onOpenFile: (path: string) => void;
  onClose: () => void;
  onSave: () => void;
  onFormat: () => void;
  onToggleMinimap: () => void;
  onToggleWordWrap: () => void;
  onToggleSettings: () => void;
  onShowDiff: () => void;
}

// ── Simple fuzzy match ─────────────────────────────────────────────────────

function fuzzyMatch(needle: string, haystack: string): boolean {
  if (!needle) return true;
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  let ni = 0;
  for (let hi = 0; hi < h.length && ni < n.length; hi++) {
    if (h[hi] === n[ni]) ni++;
  }
  return ni === n.length;
}

function fuzzyScore(needle: string, haystack: string): number {
  if (!needle) return 0;
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  // Exact match scores highest
  if (h === n) return 100;
  // Contains match
  if (h.includes(n)) return 80;
  // Filename match (last segment)
  const filename = h.split('/').pop() ?? h;
  if (filename.includes(n)) return 60;
  // Fuzzy
  return 20;
}

// ── Component ──────────────────────────────────────────────────────────────

export function CommandPalette({
  mode: initialMode,
  openFiles,
  onOpenFile,
  onClose,
  onSave,
  onFormat,
  onToggleMinimap,
  onToggleWordWrap,
  onToggleSettings,
  onShowDiff,
}: CommandPaletteProps) {
  const [mode, setMode] = useState<PaletteMode>(initialMode);
  const [query, setQuery] = useState('');
  const [allFiles, setAllFiles] = useState<FileEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
    setSelectedIndex(0);
  }, [mode]);

  // Load file list for file mode
  useEffect(() => {
    if (mode !== 'files') return;

    const fetchFiles = async () => {
      try {
        const response = await fetch('/api/ide/tree', { headers: getAuthHeaders() });
        if (!response.ok) return;
        const data = await response.json();
        const files: FileEntry[] = [];
        const walk = (entries: any[]) => {
          for (const e of entries) {
            if (e.type === 'file') {
              files.push({ path: e.path, name: e.name });
            } else if (e.children) {
              walk(e.children);
            }
          }
        };
        walk(data.entries ?? []);
        setAllFiles(files);
      } catch (e) {
        console.error('Failed to load file list:', e);
      }
    };

    fetchFiles();
  }, [mode]);

  // Commands list — grouped by category
  const commands = useMemo<CommandEntry[]>(() => [
    {
      id: 'save',
      label: 'Sauvegarder',
      description: 'Sauvegarder le fichier actif',
      category: 'Fichier',
      icon: <Save size={14} />,
      shortcut: 'Ctrl+S',
      action: () => { onSave(); onClose(); },
    },
    {
      id: 'format',
      label: 'Formater le document',
      description: 'Formater le fichier actif avec Prettier',
      category: 'Fichier',
      icon: <AlignJustify size={14} />,
      shortcut: 'Shift+Alt+F',
      action: () => { onFormat(); onClose(); },
    },
    {
      id: 'toggle-minimap',
      label: 'Basculer la minimap',
      description: 'Afficher ou masquer la minimap',
      category: 'Affichage',
      icon: <Map size={14} />,
      action: () => { onToggleMinimap(); onClose(); },
    },
    {
      id: 'toggle-wordwrap',
      label: 'Basculer le retour à la ligne',
      description: 'Activer ou désactiver le word wrap',
      category: 'Affichage',
      icon: <WrapText size={14} />,
      shortcut: 'Alt+Z',
      action: () => { onToggleWordWrap(); onClose(); },
    },
    {
      id: 'settings',
      label: 'Paramètres de l\'éditeur',
      description: 'Ouvrir le panneau de paramètres',
      category: 'Préférences',
      icon: <Command size={14} />,
      action: () => { onToggleSettings(); onClose(); },
    },
    {
      id: 'diff',
      label: 'Voir les différences',
      description: 'Comparer le fichier actif avec la version sauvegardée',
      category: 'Fichier',
      icon: <Search size={14} />,
      action: () => { onShowDiff(); onClose(); },
    },
  ], [onSave, onFormat, onToggleMinimap, onToggleWordWrap, onToggleSettings, onShowDiff, onClose]);

  // Filtered + sorted results
  const results = useMemo(() => {
    if (mode === 'files') {
      return allFiles
        .filter(f => fuzzyMatch(query, f.path))
        .sort((a, b) => fuzzyScore(query, b.path) - fuzzyScore(query, a.path))
        .slice(0, 20);
    } else {
      return commands.filter(c =>
        fuzzyMatch(query, c.label) || fuzzyMatch(query, c.description ?? '')
      );
    }
  }, [mode, query, allFiles, commands]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length, query]);

  // Scroll selected item into view
  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (mode === 'files') {
        const file = results[selectedIndex] as FileEntry | undefined;
        if (file) { onOpenFile(file.path); onClose(); }
      } else {
        const cmd = results[selectedIndex] as CommandEntry | undefined;
        if (cmd) cmd.action();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [mode, results, selectedIndex, onOpenFile, onClose]);

  const handleSelect = useCallback((index: number) => {
    if (mode === 'files') {
      const file = results[index] as FileEntry | undefined;
      if (file) { onOpenFile(file.path); onClose(); }
    } else {
      const cmd = results[index] as CommandEntry | undefined;
      if (cmd) cmd.action();
    }
  }, [mode, results, onOpenFile, onClose]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex w-full max-w-xl flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border-base)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Mode tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--border-base)' }}>
          <button
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition border-b-2 ${
              mode === 'files' ? 'border-[var(--accent-primary)]' : 'border-transparent opacity-60 hover:opacity-100'
            }`}
            style={{ color: 'var(--text-primary)' }}
            title="Rechercher un fichier (Ctrl+P)"
            onClick={() => { setMode('files'); setQuery(''); }}
          >
            <Search size={12} /> Fichiers
            <span className="ml-1 opacity-50">Ctrl+P</span>
          </button>
          <button
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition border-b-2 ${
              mode === 'commands' ? 'border-[var(--accent-primary)]' : 'border-transparent opacity-60 hover:opacity-100'
            }`}
            style={{ color: 'var(--text-primary)' }}
            title="Exécuter une commande (Ctrl+Shift+P)"
            onClick={() => { setMode('commands'); setQuery(''); }}
          >
            <Command size={12} /> Commandes
            <span className="ml-1 opacity-50">Ctrl+Shift+P</span>
          </button>

          <button
            className="ml-auto rounded p-2 hover:bg-white/10"
            title="Fermer (Escape)"
            onClick={onClose}
          >
            <X size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: 'var(--border-base)' }}>
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'files' ? 'Chercher un fichier...' : 'Chercher une commande...'}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          {query && (
            <button onClick={() => setQuery('')} className="rounded p-0.5 hover:bg-white/10" title="Effacer la recherche">
              <X size={12} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Aucun résultat pour «{query}»
            </div>
          ) : mode === 'files' ? (
            (results as FileEntry[]).map((file, i) => (
              <button
                key={file.path}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                  i === selectedIndex ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
                onClick={() => handleSelect(i)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <FileIcon filePath={file.path} size={14} />
                <div className="flex flex-col min-w-0">
                  <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                    {file.name}
                  </span>
                  <span className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                    {file.path}
                  </span>
                </div>
              </button>
            ))
          ) : (
            (() => {
              // Group commands by category
              const grouped: { category: string; items: { cmd: CommandEntry; globalIndex: number }[] }[] = [];
              let flatIndex = 0;
              (results as CommandEntry[]).forEach((cmd) => {
                const cat = cmd.category || 'Autres';
                let group = grouped.find(g => g.category === cat);
                if (!group) {
                  group = { category: cat, items: [] };
                  grouped.push(group);
                }
                group.items.push({ cmd, globalIndex: flatIndex });
                flatIndex++;
              });

              return grouped.map((group) => (
                <div key={group.category}>
                  <div className="px-3 pt-2 pb-1">
                    <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                      {group.category}
                    </span>
                  </div>
                  {group.items.map(({ cmd, globalIndex: i }) => (
                    <button
                      key={cmd.id}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                        i === selectedIndex ? 'bg-white/10' : 'hover:bg-white/5'
                      }`}
                      onClick={() => handleSelect(i)}
                      onMouseEnter={() => setSelectedIndex(i)}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>{cmd.icon}</span>
                      <div className="flex flex-1 flex-col min-w-0">
                        <span style={{ color: 'var(--text-primary)' }}>{cmd.label}</span>
                        {cmd.description && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {cmd.description}
                          </span>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <kbd
                          className="px-1.5 py-0.5 text-sm"
                          style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)' }}
                        >
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  ))}
                </div>
              ));
            })()
          )}
        </div>

        {/* Footer hint */}
        <div
          className="flex items-center gap-3 border-t px-3 py-2 text-xs"
          style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
        >
          <span className="flex items-center gap-1"><ArrowUp size={10} /><ArrowDown size={10} /> naviguer</span>
          <span className="flex items-center gap-1"><CornerDownLeft size={10} /> ouvrir</span>
          <span className="flex items-center gap-1"><kbd className="rounded px-1 py-0.5" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>Esc</kbd> fermer</span>
          <span className="ml-auto">{results.length} résultat{results.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}
