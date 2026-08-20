import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import {
  Folder, FolderOpen, Plus, RefreshCcw, ChevronRight, ChevronDown, ChevronUp,
  Shield, Search, X, ArrowDownAZ, ArrowUpZA, Layers, GripVertical,
  Eye, EyeOff, FolderInput,
} from 'lucide-react';
import { FileIcon } from './FileIcon';
import type { TreeEntry } from '../../types/ide';
import Tree from 'react-window-tree';
import { motion, AnimatePresence } from 'motion/react';


type SortMode = 'name-asc' | 'name-desc' | 'type';

type FileExplorerProps = {
  tree: TreeEntry[];
  workspaceTree?: TreeEntry[];
  diffPaths?: Map<string, 'added' | 'modified' | 'deleted'>;
  expandedDirs: Set<string>;
  loading: boolean;
  currentDir: string;
  onOpenFile: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: TreeEntry) => void;
  onCreateFile: () => void;
  onRefresh: () => void;
  onNavigate: (dir: string) => void;
  onMoveEntry?: (srcPath: string, destDir: string) => void;
};

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function sortEntries(entries: TreeEntry[], mode: SortMode): TreeEntry[] {
  const dirs = entries.filter(e => e.type === 'directory');
  const files = entries.filter(e => e.type === 'file');

  const byName = (a: TreeEntry, b: TreeEntry) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const byNameDesc = (a: TreeEntry, b: TreeEntry) => -byName(a, b);

  switch (mode) {
    case 'name-asc':
      return [...dirs.sort(byName), ...files.sort(byName)];
    case 'name-desc':
      return [...dirs.sort(byNameDesc), ...files.sort(byNameDesc)];
    case 'type':
      return [
        ...dirs.sort(byName),
        ...files.sort((a, b) => {
          const extA = a.name.includes('.') ? a.name.split('.').pop()! : '';
          const extB = b.name.includes('.') ? b.name.split('.').pop()! : '';
          return extA.localeCompare(extB) || a.name.localeCompare(b.name);
        }),
      ];
  }
}

function filterTree(entries: TreeEntry[], query: string, showHidden: boolean): TreeEntry[] {
  if (!query && showHidden) return entries;
  const q = query.toLowerCase();
  return entries.reduce<TreeEntry[]>((acc, entry) => {
    const isHidden = entry.name.startsWith('.');
    if (!showHidden && isHidden) return acc;
    if (entry.type === 'directory' && entry.children) {
      const filteredChildren = filterTree(entry.children, query, showHidden);
      if (filteredChildren.length > 0 || entry.name.toLowerCase().includes(q)) {
        acc.push({ ...entry, children: filteredChildren });
      }
    } else if (entry.name.toLowerCase().includes(q)) {
      acc.push(entry);
    }
    return acc;
  }, []);
}

function countEntries(entries: TreeEntry[]): number {
  return entries.reduce((acc, e) => {
    if (e.type === 'file') return acc + 1;
    return acc + countEntries(e.children ?? []);
  }, 0);
}

// â”€â”€ Sort Icon helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SortIcon({ mode }: { mode: SortMode }) {
  if (mode === 'name-asc') return <ArrowDownAZ size={12} />;
  if (mode === 'name-desc') return <ArrowUpZA size={12} />;
  return <Layers size={12} />;
}

function sortLabel(mode: SortMode): string {
  if (mode === 'name-asc') return 'Tri : Aâ†’Z';
  if (mode === 'name-desc') return 'Tri : Zâ†’A';
  return 'Tri : Type';
}

function nextSort(mode: SortMode): SortMode {
  if (mode === 'name-asc') return 'name-desc';
  if (mode === 'name-desc') return 'type';
  return 'name-asc';
}

// â”€â”€ HighlightMatch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        style={{
          backgroundColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
          color: 'inherit',
          borderRadius: '2px',
          padding: '0 2px',
        }}
      >
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// â”€â”€ Convert TreeEntry to DataNode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface DataNode {
  key: string;
  title: React.ReactNode;
  children?: DataNode[];
  isLeaf?: boolean;
  originalEntry: TreeEntry;
}

function toDataNode(
  entry: TreeEntry,
  depth: number,
  expandedDirs: Set<string>,
  searchQuery: string,
  onOpenFile: (path: string) => void,
  onToggleDirectory: (path: string) => void,
  onContextMenu: (e: React.MouseEvent, entry: TreeEntry) => void,
  draggingPath: string | null,
  dragOverPath: string | null,
  onMoveEntry: ((srcPath: string, destDir: string) => void) | undefined,
  handleDragStart: (e: React.DragEvent, entry: TreeEntry) => void,
  handleDragEnd: () => void,
  handleDragOver: (e: React.DragEvent, entry: TreeEntry) => void,
  handleDragLeave: (e: React.DragEvent) => void,
  handleDrop: (e: React.DragEvent, entry: TreeEntry) => void,
  diffPaths?: Map<string, 'added' | 'modified' | 'deleted'>,
): DataNode {
  const isExpanded = expandedDirs.has(entry.path);
  const hasChildren = entry.type === 'directory' && entry.children && entry.children.length > 0;
  const isDragTarget = dragOverPath === entry.path;
  const diffStatus = diffPaths?.get(entry.path);

  // Diff color coding
  const diffColor = diffStatus === 'added'
    ? 'var(--color-success, #22c55e)'
    : diffStatus === 'modified'
      ? 'var(--color-warning, #f59e0b)'
      : diffStatus === 'deleted'
        ? 'var(--color-error, #ef4444)'
        : undefined;

  const title = (
    <div
      className="flex items-center gap-1.5 py-1 px-2 text-[12px] cursor-pointer select-none relative group transition-colors duration-150 rounded-md"
      style={{
        paddingLeft: `${8 + depth * 14}px`,
        color: diffColor || 'var(--text-primary)',
        backgroundColor: isDragTarget
          ? 'color-mix(in srgb, var(--accent-primary) 15%, transparent)'
          : 'transparent',
        outline: isDragTarget ? '1.5px solid var(--accent-primary)' : 'none',
        outlineOffset: '-1px',
        borderRadius: '6px',
        transition: 'background 0.15s, outline 0.15s',
      }}
      onClick={() => {
        if (entry.type === 'file') onOpenFile(entry.path);
        else onToggleDirectory(entry.path);
      }}
      onContextMenu={(e) => onContextMenu(e, entry)}
      draggable
      onDragStart={(e) => handleDragStart(e, entry)}
      onDragEnd={handleDragEnd}
      onDragOver={(e) => handleDragOver(e, entry)}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, entry)}
    >
      {/* Drag handle indicator */}
      <span className="opacity-0 group-hover:opacity-30 transition-opacity absolute" style={{ left: `${depth * 14 + 2}px` }}>
        <GripVertical size={10} />
      </span>

      {/* Arrow indicator for directories */}
      {entry.type === 'directory' ? (
        <span className="opacity-60 group-hover:opacity-100 mr-0.5">
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      ) : (
        <span className="w-4" />
      )}

      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {entry.type === 'directory' ? (
          isDragTarget || isExpanded ? (
            <FolderOpen size={14} style={{ color: diffColor || 'var(--accent-primary)' }} />
          ) : (
            <Folder size={14} style={{ color: diffColor || 'var(--accent-primary)' }} />
          )
        ) : (
          <FileIcon filePath={entry.path} size={14} />
        )}
        <span className="truncate font-normal opacity-90 group-hover:opacity-100" title={entry.name}>
          {searchQuery ? (
            <HighlightMatch text={entry.name} query={searchQuery} />
          ) : (
            entry.name
          )}
        </span>
        {/* Diff status indicator */}
        {diffStatus && (
          <span
            className="ml-auto text-[9px] font-bold uppercase px-1 rounded"
            style={{
              color: diffColor,
              backgroundColor: `color-mix(in srgb, ${diffColor} 12%, transparent)`,
            }}
          >
            {diffStatus === 'added' ? 'A' : diffStatus === 'modified' ? 'M' : 'D'}
          </span>
        )}
      </div>
    </div>
  );

  const children = hasChildren && isExpanded
    ? entry.children!.map(child =>
        toDataNode(
          child,
          depth + 1,
          expandedDirs,
          searchQuery,
          onOpenFile,
          onToggleDirectory,
          onContextMenu,
          draggingPath,
          dragOverPath,
          onMoveEntry,
          handleDragStart,
          handleDragEnd,
          handleDragOver,
          handleDragLeave,
          handleDrop,
          diffPaths,
        )
      )
    : undefined;

  return {
    key: entry.path,
    title,
    children,
    isLeaf: entry.type === 'file',
    originalEntry: entry,
  };
}

// Main Component 

const FileExplorer = memo(function FileExplorer({
  tree,
  workspaceTree,
  diffPaths,
  expandedDirs,
  loading,
  currentDir,
  onOpenFile,
  onToggleDirectory,
  onContextMenu,
  onCreateFile,
  onRefresh,
  onNavigate,
  onMoveEntry,
}: FileExplorerProps) {
  // Sandbox status
  const [sandboxActive, setSandboxActive] = useState(false);

  useEffect(() => {
    let mounted = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const checkSandbox = async (force = false) => {
      try {
        const { sandboxApi } = await import('../../services/sandboxApi');
        const data = await sandboxApi.getStatus(force);
        if (mounted && data.status === 'success') {
          setSandboxActive(data.sandbox?.active ?? false);
        }
      } catch { /* silent */ }
    };

    checkSandbox();

    const handleChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => checkSandbox(true), 150);
    };

    window.addEventListener('jarvis-sandbox-changed', handleChange);
    return () => {
      mounted = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('jarvis-sandbox-changed', handleChange);
    };
  }, []);

  // Search, Sort, Hidden files
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('name-asc');
  const [showHidden, setShowHidden] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce manuel
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Keyboard shortcut: Ctrl+Shift+F to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showSearch]);

  const toggleSearch = useCallback(() => {
    setShowSearch(prev => {
      if (prev) setSearchQuery('');
      else {
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      return !prev;
    });
  }, []);

  // Process tree: filter, hidden, sort
  const processedTree = useMemo(() => {
    const filtered = filterTree(tree, debouncedSearch, showHidden);
    const applySort = (entries: TreeEntry[]): TreeEntry[] =>
      sortEntries(entries, sortMode).map(e =>
        e.type === 'directory' && e.children
          ? { ...e, children: applySort(e.children) }
          : e
      );
    return applySort(filtered);
  }, [tree, debouncedSearch, sortMode, showHidden]);

  // Drag & Drop
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, entry: TreeEntry) => {
    setDraggingPath(entry.path);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', entry.path);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, entry: TreeEntry) => {
    if (entry.type !== 'directory') return;
    if (entry.path === draggingPath) return;
    if (draggingPath && entry.path.startsWith(draggingPath + '/')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverPath(entry.path);
  }, [draggingPath]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) {
      setDragOverPath(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, entry: TreeEntry) => {
    e.preventDefault();
    setDragOverPath(null);
    setDraggingPath(null);
    if (entry.type !== 'directory') return;
    const src = e.dataTransfer.getData('text/plain');
    if (!src || src === entry.path) return;
    if (src.startsWith(entry.path + '/')) return;
    onMoveEntry?.(src, entry.path);
  }, [onMoveEntry]);

  const handleDragEnd = useCallback(() => {
    setDraggingPath(null);
    setDragOverPath(null);
  }, []);

  // Convert to rc-tree format (sandbox/active tree)
  const treeData = useMemo(() => {
    return processedTree.map(entry =>
      toDataNode(
        entry,
        0,
        expandedDirs,
        debouncedSearch,
        onOpenFile,
        onToggleDirectory,
        onContextMenu,
        draggingPath,
        dragOverPath,
        onMoveEntry,
        handleDragStart,
        handleDragEnd,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        diffPaths,
      )
    );
  }, [
    processedTree,
    expandedDirs,
    debouncedSearch,
    onOpenFile,
    onToggleDirectory,
    onContextMenu,
    onMoveEntry,
    draggingPath,
    dragOverPath,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    diffPaths,
  ]);

  // Workspace tree section (read-only, no drag & drop)
  const [wsExpandedDirs, setWsExpandedDirs] = useState<Set<string>>(new Set());
  const [showWorkspace, setShowWorkspace] = useState(true);

  const wsToggleDir = useCallback((dirPath: string) => {
    setWsExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  }, []);

  const processedWorkspaceTree = useMemo(() => {
    if (!workspaceTree || workspaceTree.length === 0) return [];
    const filtered = filterTree(workspaceTree, debouncedSearch, showHidden);
    const applySort = (entries: TreeEntry[]): TreeEntry[] =>
      sortEntries(entries, sortMode).map(e =>
        e.type === 'directory' && e.children
          ? { ...e, children: applySort(e.children) }
          : e
      );
    return applySort(filtered);
  }, [workspaceTree, debouncedSearch, sortMode, showHidden]);

  const noopDrag = useCallback(() => {}, []);
  const noopDragEvent = useCallback((_e: React.DragEvent, _entry: TreeEntry) => {}, []);
  const noopDragLeave = useCallback((_e: React.DragEvent) => {}, []);

  const wsTreeData = useMemo(() => {
    return processedWorkspaceTree.map(entry =>
      toDataNode(
        entry,
        0,
        wsExpandedDirs,
        debouncedSearch,
        onOpenFile,
        wsToggleDir,
        onContextMenu,
        null,
        null,
        undefined,
        noopDragEvent,
        noopDrag,
        noopDragEvent,
        noopDragLeave,
        noopDragEvent,
        diffPaths,
      )
    );
  }, [
    processedWorkspaceTree,
    wsExpandedDirs,
    debouncedSearch,
    onOpenFile,
    wsToggleDir,
    onContextMenu,
    diffPaths,
    noopDrag,
    noopDragEvent,
    noopDragLeave,
  ]);

  const wsExpandedKeys = useMemo(() => Array.from(wsExpandedDirs), [wsExpandedDirs]);

  const handleWsTreeExpand = useCallback((keys: React.Key[]) => {
    keys.forEach(key => wsToggleDir(String(key)));
  }, [wsToggleDir]);

  // Sync expansion with rc-tree
  const expandedKeys = useMemo(() => Array.from(expandedDirs), [expandedDirs]);

  const handleTreeExpand = useCallback((keys: React.Key[]) => {
    keys.forEach(key => onToggleDirectory(String(key)));
  }, [onToggleDirectory]);

  // Count files
  const fileCount = useMemo(() => countEntries(processedTree), [processedTree]);

  return (
    <div
      className="flex flex-col border-r h-full select-none"
      style={{
        width: '260px',
        borderColor: 'var(--border-base)',
        backgroundColor: 'var(--bg-sidebar)',
      }}
    >
      {/* Explorer Header (with integrated "Changer de projet") */}
      <div
        className="flex items-center justify-between border-b px-3"
        style={{ height: '36px', borderColor: 'var(--border-base)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={async () => {
              try {
                await fetch('/api/self-root/clear', { method: 'POST' });
              } catch { /* best-effort */ }
              window.location.reload();
            }}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-[var(--bg-panel)]"
            style={{ color: 'var(--accent-primary)' }}
            title="Changer de projet racine"
          >
            <FolderInput size={12} />
          </button>
          <div className="min-w-0">
            <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
              📁 Explorer
            </span>
            <div className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }} title={currentDir ? currentDir : 'Racine'}>
              {currentDir === '.' ? 'Racine' : currentDir}
            </div>
          </div>
          {!loading && (
            <span className="text-[9px] px-1.5 rounded-md" style={{ color: 'var(--text-dimmed)', background: 'var(--bg-input)' }}>
              {fileCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {currentDir && currentDir !== '.' && (
            <button
              onClick={() => onNavigate(currentDir.split('/').slice(0, -1).join('/') || '.')}
              className="flex items-center rounded-md px-2 py-0.5 text-[9px] font-semibold transition-colors hover:bg-[var(--bg-panel)]"
              style={{ color: 'var(--accent-primary)' }}
              title="Remonter d'un niveau"
            >
              <ChevronUp size={12} />
              <span className="hidden sm:inline">Parent</span>
            </button>
          )}
          <div className="flex items-center gap-1">
            {sandboxActive ? (
              <span
                className="text-[8px] px-1.5 py-0.5 rounded-md font-bold flex items-center gap-0.5 shadow-sm border border-success-subtle bg-success-subtle text-success"
                title="Mode Sandbox actif"
              >
                <Shield size={8} />
                SBX
              </span>
            ) : (
              <span
                className="text-[8px] px-1.5 py-0.5 rounded-md font-bold flex items-center gap-0.5 border border-[rgba(156,163,175,0.15)] bg-[rgba(156,163,175,0.08)] text-[var(--text-muted)]"
                title="Mode Sandbox inactif"
              >
                <Shield size={8} />
                SBX
              </span>
            )}
          </div>
        </div>
      </div>
      {/* Toolbar */}
      <div
        className="flex items-center gap-0.5 px-2 border-b"
        style={{ height: '32px', borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-base)' }}
      >
        <button
          onClick={toggleSearch}
          className={`rounded-md p-1.5 transition-colors hover:bg-[var(--bg-panel)] ${showSearch ? 'bg-[var(--bg-panel)]' : ''}`}
          title="Rechercher (Ctrl+Shift+F)"
          style={{ color: showSearch ? 'var(--accent-primary)' : 'var(--text-muted)' }}
        >
          <Search size={13} />
        </button>
        <button
          onClick={() => setShowHidden(!showHidden)}
          className="rounded-md p-1.5 transition-colors hover:bg-[var(--bg-panel)]"
          title={showHidden ? 'Masquer fichiers cachés' : 'Afficher fichiers cachés'}
          style={{ color: showHidden ? 'var(--accent-primary)' : 'var(--text-muted)' }}
        >
          {showHidden ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button
          onClick={() => setSortMode(nextSort)}
          className="rounded-md p-1.5 transition-colors hover:bg-[var(--bg-panel)]"
          title={sortLabel(sortMode)}
          style={{ color: sortMode !== 'name-asc' ? 'var(--accent-primary)' : 'var(--text-muted)' }}
        >
          <SortIcon mode={sortMode} />
        </button>
        <div className="flex-1" />
        <button
          onClick={onCreateFile}
          className="rounded-md p-1.5 transition-colors hover:bg-[var(--bg-panel)]"
          title="Nouveau fichier"
        >
          <Plus size={13} style={{ color: 'var(--text-muted)' }} />
        </button>
        <button
          onClick={onRefresh}
          className="rounded-md p-1.5 transition-colors hover:bg-[var(--bg-panel)]"
          title="Actualiser"
        >
          <RefreshCcw size={13} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Search input (expandable) */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div
              className="flex items-center gap-1.5 border-b px-3 py-1.5"
              style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-base)' }}
            >
              <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filtrer les fichiersâ€¦"
                className="flex-1 bg-transparent text-[12px] outline-none placeholder:opacity-40"
                style={{ color: 'var(--text-primary)' }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="opacity-50 hover:opacity-100 transition"
                  title="Effacer"
                >
                  <X size={11} style={{ color: 'var(--text-muted)' }} />
                </button>
              )}
              <button
                onClick={toggleSearch}
                className="opacity-50 hover:opacity-100 transition"
                title="Fermer la recherche"
              >
                <X size={11} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            {searchQuery && (
              <div
                className="px-3 py-0.5 text-[9px] border-b"
                style={{
                  borderColor: 'var(--border-base)',
                  color: 'var(--text-dimmed)',
                  backgroundColor: 'color-mix(in srgb, var(--accent-primary) 5%, transparent)',
                }}
              >
                {fileCount} résultat{fileCount !== 1 ? 's' : ''} pour «{searchQuery}»
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sort indicator (non-default) */}
      {sortMode !== 'name-asc' && !searchQuery && !showSearch && (
        <div
          className="flex items-center gap-1 px-3 py-0.5 text-[9px] border-b"
          style={{
            borderColor: 'var(--border-base)',
            backgroundColor: 'color-mix(in srgb, var(--accent-primary) 8%, transparent)',
            color: 'var(--accent-primary)',
          }}
        >
          <SortIcon mode={sortMode} />
          <span>{sortLabel(sortMode)}</span>
          <button
            className="ml-auto opacity-60 hover:opacity-100 transition"
            onClick={() => setSortMode('name-asc')}
            title="Réinitialiser le tri"
          >
            <X size={9} />
          </button>
        </div>
      )}

      {/* Tree View Container - Virtualized */}
      <div className="flex-1 overflow-y-auto py-1 custom-scrollbar" style={{ height: '100%' }}>
        {loading ? (
          <div className="space-y-1.5 px-3 py-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2" style={{ paddingLeft: `${8 + (i % 4) * 14}px` }}>
                <div className="skeleton w-4 h-4 rounded flex-shrink-0 opacity-40" />
                <div className="skeleton h-2.5 rounded flex-1 opacity-30" style={{ maxWidth: `${60 + Math.random() * 80}px` }} />
              </div>
            ))}
          </div>
        ) : processedTree.length === 0 && !searchQuery ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div
              className="w-10 h-10 rounded flex items-center justify-center mb-3"
              style={{ backgroundColor: 'var(--accent-subtle)' }}
            >
              <Folder size={20} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <p className="text-[12px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              Dossier vide
            </p>
            <p className="text-[10px] mb-4 leading-normal opacity-60" style={{ color: 'var(--text-muted)' }}>
              Créez un fichier ou ouvrez un projet.
            </p>
            <button
              onClick={onCreateFile}
              className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-semibold transition hover:opacity-95"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: '#fff',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <Plus size={12} />
              Nouveau fichier
            </button>
          </div>
        ) : processedTree.length === 0 && searchQuery ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <Search size={24} className="mb-3 opacity-30" style={{ color: 'var(--text-muted)' }} />
            <p className="text-[12px] opacity-60" style={{ color: 'var(--text-muted)' }}>
              Aucun fichier ne correspond Ã  «{searchQuery}»
            </p>
          </div>
        ) : (
          <>
            {/* Section: Sandbox (active tree) */}
            {sandboxActive && (
              <div
                className="flex items-center gap-1.5 px-3 py-1 border-b sticky top-0 z-10"
                style={{
                  borderColor: 'var(--border-base)',
                  backgroundColor: 'color-mix(in srgb, var(--color-success, #22c55e) 6%, var(--bg-sidebar))',
                }}
              >
                <Shield size={10} style={{ color: 'var(--color-success, #22c55e)' }} />
                <span className="text-[10px] font-semibold" style={{ color: 'var(--color-success, #22c55e)' }}>
                  Sandbox
                </span>
                {diffPaths && diffPaths.size > 0 && (
                  <span
                    className="text-[9px] px-1.5 rounded-full ml-auto"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-warning, #f59e0b) 15%, transparent)',
                      color: 'var(--color-warning, #f59e0b)',
                    }}
                  >
                    {diffPaths.size} diff
                  </span>
                )}
              </div>
            )}
            <Tree
              treeData={treeData}
              height={sandboxActive && showWorkspace ? 320 : 600}
              itemHeight={26}
              virtual
              showLine
              expandedKeys={expandedKeys}
              onExpand={handleTreeExpand}
              selectable={false}
              defaultExpandParent
            />

            {/* Section: Workspace (real files, hors sandbox) */}
            {sandboxActive && processedWorkspaceTree.length > 0 && (
              <>
                <div
                  className="flex items-center gap-1.5 px-3 py-1 border-t border-b cursor-pointer select-none"
                  style={{
                    borderColor: 'var(--border-base)',
                    backgroundColor: 'color-mix(in srgb, var(--accent-primary) 6%, var(--bg-sidebar))',
                  }}
                  onClick={() => setShowWorkspace(prev => !prev)}
                >
                  <span className="opacity-60">
                    {showWorkspace ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  </span>
                  <Folder size={10} style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--accent-primary)' }}>
                    Workspace
                  </span>
                  <span className="text-[9px] opacity-50 ml-1" style={{ color: 'var(--text-muted)' }}>
                    (fichiers réels)
                  </span>
                </div>
                {showWorkspace && (
                  <Tree
                    treeData={wsTreeData}
                    height={280}
                    itemHeight={26}
                    virtual
                    showLine
                    expandedKeys={wsExpandedKeys}
                    onExpand={handleWsTreeExpand}
                    selectable={false}
                    defaultExpandParent
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
});

export { FileExplorer };
