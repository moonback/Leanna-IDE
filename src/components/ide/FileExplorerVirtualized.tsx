import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import {
  Folder, FolderOpen, Plus, RefreshCcw, ChevronRight, ChevronDown, ChevronUp,
  Shield, Search, X, ArrowDownAZ, ArrowUpZA, Layers, GripVertical,
  Eye, EyeOff, FolderInput,
} from 'lucide-react';
import { FileIcon } from './FileIcon.js';
import type { TreeEntry } from '../../types/ide.js';
import Tree from 'react-window-tree';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

const TreeComponent = Tree as any;

type SortMode = 'name-asc' | 'name-desc' | 'type';

export type DiffInfo = {
  status: 'added' | 'modified' | 'deleted';
  additions?: number;
  deletions?: number;
};

type FileExplorerProps = {
  tree: TreeEntry[];
  workspaceTree?: TreeEntry[];
  diffPaths?: Map<string, DiffInfo>;
  expandedDirs: Set<string>;
  loading: boolean;
  currentDir: string;
  onOpenFile: (path: string) => void;
  onOpenFileDiff?: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: TreeEntry) => void;
  onCreateFile: () => void;
  onRefresh: () => void;
  onNavigate: (dir: string) => void;
  onMoveEntry?: (srcPath: string, destDir: string) => void;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function filterTreeOnlyDiffs(
  entries: TreeEntry[],
  diffPaths: Map<string, DiffInfo> | undefined,
  query: string,
  showHidden: boolean,
): TreeEntry[] {
  if (!diffPaths || diffPaths.size === 0) return [];
  const q = query.toLowerCase();

  return entries.reduce<TreeEntry[]>((acc, entry) => {
    const isHidden = entry.name.startsWith('.');
    if (!showHidden && isHidden) return acc;

    if (entry.type === 'directory' && entry.children) {
      const filteredChildren = filterTreeOnlyDiffs(entry.children, diffPaths, query, showHidden);
      if (filteredChildren.length > 0) {
        acc.push({ ...entry, children: filteredChildren });
      }
    } else if (entry.type === 'file') {
      const diffInfo = getDiffInfo(diffPaths, entry.path);
      if (diffInfo && (!q || entry.name.toLowerCase().includes(q))) {
        acc.push(entry);
      }
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

// ── Sort Icon helper ────────────────────────────────────────────────────────

function SortIcon({ mode }: { mode: SortMode }) {
  if (mode === 'name-asc') return <ArrowDownAZ size={12} />;
  if (mode === 'name-desc') return <ArrowUpZA size={12} />;
  return <Layers size={12} />;
}

function sortLabel(mode: SortMode): string {
  if (mode === 'name-asc') return 'Tri : A→Z';
  if (mode === 'name-desc') return 'Tri : Z→A';
  return 'Tri : Type';
}

function nextSort(mode: SortMode): SortMode {
  if (mode === 'name-asc') return 'name-desc';
  if (mode === 'name-desc') return 'type';
  return 'name-asc';
}

// ── HighlightMatch ──────────────────────────────────────────────────────────

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

// ── Convert TreeEntry to DataNode ───────────────────────────────────────────

interface DataNode {
  key: string;
  title: React.ReactNode;
  children?: DataNode[];
  isLeaf?: boolean;
  originalEntry: TreeEntry;
}

function getDiffInfo(
  diffPaths: Map<string, DiffInfo> | undefined,
  targetPath: string,
): DiffInfo | undefined {
  if (!diffPaths || diffPaths.size === 0) return undefined;
  
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase().trim();
  const normalizedTarget = norm(targetPath);
  const targetSegments = normalizedTarget.split('/').filter(Boolean);
  const targetName = targetSegments[targetSegments.length - 1];

  for (const [key, val] of diffPaths.entries()) {
    const normKey = norm(key);
    if (
      normKey === normalizedTarget ||
      normalizedTarget.endsWith('/' + normKey) ||
      normKey.endsWith('/' + normalizedTarget)
    ) {
      return val;
    }
    const keySegments = normKey.split('/').filter(Boolean);
    const keyName = keySegments[keySegments.length - 1];
    if (keyName && targetName && keyName === targetName) {
      if (normalizedTarget.includes(normKey) || normKey.includes(normalizedTarget) || keySegments.length === 1 || targetSegments.length === 1) {
        return val;
      }
    }
  }
  return undefined;
}

// Version améliorée de toDataNode avec un rendu plus soigné
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
  diffPaths?: Map<string, DiffInfo>,
): DataNode {
  const isExpanded = expandedDirs.has(entry.path);
  const hasChildren = entry.type === 'directory' && entry.children && entry.children.length > 0;
  const isDragTarget = dragOverPath === entry.path;
  const diffInfo = entry.type === 'file' ? getDiffInfo(diffPaths, entry.path) : undefined;
  const diffStatus = diffInfo?.status;
  const additions = diffInfo?.additions ?? 0;
  const deletions = diffInfo?.deletions ?? 0;

  const diffColor = diffStatus === 'added'
    ? 'var(--color-success)'
    : diffStatus === 'modified'
      ? 'var(--color-warning)'
      : diffStatus === 'deleted'
        ? 'var(--color-error)'
        : undefined;

  const rowBg = isDragTarget
    ? 'color-mix(in srgb, var(--accent-primary) 20%, transparent)'
    : diffStatus === 'modified'
      ? 'color-mix(in srgb, var(--color-warning) 10%, transparent)'
      : diffStatus === 'added'
        ? 'color-mix(in srgb, var(--color-success) 10%, transparent)'
        : diffStatus === 'deleted'
          ? 'color-mix(in srgb, var(--color-error) 10%, transparent)'
          : 'transparent';

  const activateRow = () => {
    if (entry.type === 'file') onOpenFile(entry.path);
    else onToggleDirectory(entry.path);
  };

  const title = (
    <div
      role="treeitem"
      tabIndex={0}
      aria-expanded={entry.type === 'directory' ? isExpanded : undefined}
      className="flex items-center gap-1.5 py-1 px-2 text-sm cursor-pointer select-none relative group transition-all duration-150 rounded-md hover:bg-[var(--bg-panel)]"
      style={{
        paddingLeft: `${12 + depth * 16}px`,
        color: diffColor || 'var(--text-primary)',
        backgroundColor: rowBg,
        outline: isDragTarget ? '2px solid var(--accent-primary)' : 'none',
        outlineOffset: '-1px',
        borderRadius: '6px',
        transition: 'background 0.15s, outline 0.15s, transform 0.1s',
        transform: isDragTarget ? 'scale(1.01)' : 'scale(1)',
      }}
      onClick={activateRow}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activateRow();
        }
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
      <span className="opacity-0 group-hover:opacity-40 transition-opacity absolute" style={{ left: `${depth * 16 + 4}px` }}>
        <GripVertical size={12} />
      </span>

      {/* Arrow indicator for directories */}
      {entry.type === 'directory' ? (
        <span className="opacity-60 group-hover:opacity-100 mr-0.5 transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          <ChevronRight size={14} />
        </span>
      ) : (
        <span className="w-4" />
      )}

      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {/* Status dot */}
        {diffStatus && (
          <span
            className="w-2 h-2 rounded-full shrink-0 shadow-sm"
            style={{ backgroundColor: diffColor }}
          />
        )}

        {entry.type === 'directory' ? (
          isDragTarget || isExpanded ? (
            <FolderOpen size={16} style={{ color: diffColor || 'var(--accent-primary)' }} />
          ) : (
            <Folder size={16} style={{ color: diffColor || 'var(--accent-primary)' }} />
          )
        ) : (
          <FileIcon filePath={entry.path} size={16} />
        )}
        <span
          className={`truncate ${diffStatus ? 'font-medium' : 'font-normal'}`}
          title={entry.name}
          style={{ color: diffColor || 'var(--text-primary)' }}
        >
          {searchQuery ? (
            <HighlightMatch text={entry.name} query={searchQuery} />
          ) : (
            entry.name
          )}
        </span>

        {/* Diff stats améliorés */}
        {diffStatus && (
          <div className="ml-auto flex items-center gap-1 text-xs font-mono shrink-0 pl-2">
            {additions > 0 && (
              <span
                className="font-bold px-1.5 py-0.5 rounded"
                style={{
                  color: 'var(--color-success)',
                  backgroundColor: 'color-mix(in srgb, var(--color-success) 15%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-success) 25%, transparent)',
                }}
                title={`${additions} ligne(s) ajoutée(s)`}
              >
                +{additions}
              </span>
            )}
            {deletions > 0 && (
              <span
                className="font-bold px-1.5 py-0.5 rounded"
                style={{
                  color: 'var(--color-error)',
                  backgroundColor: 'color-mix(in srgb, var(--color-error) 15%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-error) 25%, transparent)',
                }}
                title={`${deletions} ligne(s) retirée(s)`}
              >
                -{deletions}
              </span>
            )}
            {additions === 0 && deletions === 0 && (
              <span
                className="text-xs font-bold uppercase px-1.5 py-0.5 rounded"
                style={{
                  color: diffColor,
                  backgroundColor: `color-mix(in srgb, ${diffColor} 18%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${diffColor} 30%, transparent)`,
                }}
              >
                {diffStatus === 'added' ? 'A' : diffStatus === 'modified' ? 'M' : 'D'}
              </span>
            )}
          </div>
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

// ── Composant principal amélioré ────────────────────────────────────────────

const FileExplorer = memo(function FileExplorer({
  tree,
  workspaceTree,
  diffPaths,
  expandedDirs,
  loading,
  currentDir,
  onOpenFile,
  onOpenFileDiff,
  onToggleDirectory,
  onContextMenu,
  onCreateFile,
  onRefresh,
  onNavigate,
  onMoveEntry,
}: FileExplorerProps) {
  const reduceMotion = useReducedMotion();
  // Sandbox status & Live Diffs
  const [sandboxActive, setSandboxActive] = useState(false);
  const [sandboxModifiedCount, setSandboxModifiedCount] = useState(0);
  const [liveDiffPaths, setLiveDiffPaths] = useState<Map<string, DiffInfo>>(new Map());

  useEffect(() => {
    let mounted = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const checkSandbox = async (force = true) => {
      try {
        const { sandboxApi } = await import('../../services/sandboxApi.js');
        const [statusData, diffData] = await Promise.all([
          sandboxApi.getStatus(force),
          sandboxApi.getDiff(force),
        ]);

        if (mounted && statusData.status === 'success') {
          setSandboxActive(statusData.sandbox?.active ?? false);
          setSandboxModifiedCount((statusData.sandbox as any)?.modifiedCount ?? 0);
        }

        if (mounted && diffData.status === 'success' && Array.isArray((diffData as any).diff)) {
          const map = new Map<string, DiffInfo>();
          for (const item of (diffData as any).diff) {
            map.set(item.path, {
              status: item.status,
              additions: item.additions ?? 0,
              deletions: item.deletions ?? 0,
            });
          }
          setLiveDiffPaths(map);
        }
      } catch { /* silent */ }
    };

    checkSandbox(true);

    const handleChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => checkSandbox(true), 150);
    };

    const interval = setInterval(() => {
      checkSandbox(true);
    }, 3000);

    window.addEventListener('Leanna-sandbox-changed', handleChange);
    window.addEventListener('Leanna-sandbox-file-changed', handleChange);
    return () => {
      mounted = false;
      clearInterval(interval);
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('Leanna-sandbox-changed', handleChange);
      window.removeEventListener('Leanna-sandbox-file-changed', handleChange);
    };
  }, []);

  const effectiveDiffPaths = useMemo(() => {
    if (liveDiffPaths.size > 0) return liveDiffPaths;
    return diffPaths;
  }, [liveDiffPaths, diffPaths]);

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('name-asc');
  const [showHidden, setShowHidden] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'F') {
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
        effectiveDiffPaths,
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
    effectiveDiffPaths,
  ]);

  const [wsExpandedDirs, setWsExpandedDirs] = useState<Set<string>>(new Set());
  const [showWorkspace, setShowWorkspace] = useState(true);
  const hasAutoCollapsed = useRef(false);

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
    const entriesToFilter = (effectiveDiffPaths && effectiveDiffPaths.size > 0)
      ? filterTreeOnlyDiffs(workspaceTree, effectiveDiffPaths, debouncedSearch, showHidden)
      : filterTree(workspaceTree, debouncedSearch, showHidden);

    const applySort = (entries: TreeEntry[]): TreeEntry[] =>
      sortEntries(entries, sortMode).map(e =>
        e.type === 'directory' && e.children
          ? { ...e, children: applySort(e.children) }
          : e
      );
    return applySort(entriesToFilter);
  }, [workspaceTree, effectiveDiffPaths, debouncedSearch, sortMode, showHidden]);

  useEffect(() => {
    if (processedWorkspaceTree.length === 0) {
      hasAutoCollapsed.current = false;
      return;
    }
    if (!hasAutoCollapsed.current) {
      hasAutoCollapsed.current = true;
      setWsExpandedDirs(new Set());
      setShowWorkspace(false);
    }
  }, [processedWorkspaceTree]);

  const noopDrag = useCallback(() => {}, []);
  const noopDragEvent = useCallback((_e: React.DragEvent, _entry: TreeEntry) => {}, []);
  const noopDragLeave = useCallback((_e: React.DragEvent) => {}, []);

  const wsTreeData = useMemo(() => {
    const openWsFile = onOpenFileDiff ?? onOpenFile;
    return processedWorkspaceTree.map(entry =>
      toDataNode(
        entry,
        0,
        wsExpandedDirs,
        debouncedSearch,
        openWsFile,
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
        effectiveDiffPaths,
      )
    );
  }, [
    processedWorkspaceTree,
    wsExpandedDirs,
    debouncedSearch,
    onOpenFile,
    onOpenFileDiff,
    wsToggleDir,
    onContextMenu,
    effectiveDiffPaths,
    noopDrag,
    noopDragEvent,
    noopDragLeave,
  ]);

  const wsExpandedKeys = useMemo(() => Array.from(wsExpandedDirs), [wsExpandedDirs]);
  const handleWsTreeExpand = useCallback((keys: React.Key[]) => {
    keys.forEach(key => wsToggleDir(String(key)));
  }, [wsToggleDir]);

  const expandedKeys = useMemo(() => Array.from(expandedDirs), [expandedDirs]);
  const handleTreeExpand = useCallback((keys: React.Key[]) => {
    keys.forEach(key => onToggleDirectory(String(key)));
  }, [onToggleDirectory]);

  const fileCount = useMemo(() => countEntries(processedTree), [processedTree]);

  // ── Rendu amélioré ─────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col border-r h-full select-none"
      style={{
        width: '260px',
        borderColor: 'var(--border-base)',
        backgroundColor: 'var(--bg-sidebar)',
      }}
    >
      {/* Header amélioré */}
      <div
        className="flex items-center justify-between border-b px-3 py-1.5"
        style={{ borderColor: 'var(--border-base)', minHeight: '44px' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={async () => {
              // Fermer tous les onglets et désactiver le workspace actuel
              window.dispatchEvent(new CustomEvent('Leanna-workspace-changed', { detail: { workspace: null } }));
              
              // Désactiver le workspace côté serveur
              try {
                await fetch('/api/self-root/clear', { method: 'POST' });
              } catch (e) {
                console.error('[FileExplorer] Failed to clear workspace:', e);
              }
              
              // Ouvrir la modale de sélection
              window.dispatchEvent(new CustomEvent('Leanna-open-workspace-switcher'));
            }}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-[var(--bg-panel)]"
            style={{ color: 'var(--accent-primary)' }}
            title="Changer de projet racine"
          >
            <FolderInput size={14} />
          </button>
          <div className="min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Explorer
            </span>
            <div
              className="text-xs truncate font-mono"
              style={{ color: 'var(--text-muted)' }}
              title={currentDir || 'Racine'}
            >
              {currentDir === '.' ? '~/projet' : currentDir}
            </div>
          </div>
          {!loading && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ color: 'var(--text-dimmed)', background: 'var(--bg-input)' }}
            >
              {fileCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {currentDir && currentDir !== '.' && (
            <button
              onClick={() => onNavigate(currentDir.split('/').slice(0, -1).join('/') || '.')}
              className="flex items-center rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--bg-panel)]"
              style={{ color: 'var(--accent-primary)' }}
              title="Remonter d'un niveau"
            >
              <ChevronUp size={14} />
              <span className="hidden sm:inline ml-0.5">Parent</span>
            </button>
          )}
          <div className="flex items-center gap-1">
            {sandboxActive ? (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-sm"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-success) 15%, transparent)',
                  color: 'var(--color-success)',
                  border: '1px solid color-mix(in srgb, var(--color-success) 30%, transparent)',
                }}
                title="Mode Sandbox actif"
              >
                <Shield size={10} />
                SBX
              </span>
            ) : (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1"
                style={{
                  backgroundColor: 'var(--bg-panel)',
                  color: 'var(--text-dimmed)',
                  border: '1px solid var(--border-base)',
                }}
                title="Mode Sandbox inactif"
              >
                <Shield size={10} />
                SBX
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar améliorée */}
      <div
        className="flex items-center gap-0.5 px-2 border-b"
        style={{ height: '36px', borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-base)' }}
      >
        <button
          onClick={toggleSearch}
          className={`rounded-md p-1.5 transition-all duration-200 hover:bg-[var(--bg-panel)] hover:scale-105 ${
            showSearch ? 'bg-[var(--bg-panel)]' : ''
          }`}
          title="Rechercher (Ctrl/Cmd+Shift+F)"
          style={{ color: showSearch ? 'var(--accent-primary)' : 'var(--text-muted)' }}
        >
          <Search size={14} />
        </button>
        <button
          onClick={() => setShowHidden(!showHidden)}
          className="rounded-md p-1.5 transition-all duration-200 hover:bg-[var(--bg-panel)] hover:scale-105"
          title={showHidden ? 'Masquer fichiers cachés' : 'Afficher fichiers cachés'}
          style={{ color: showHidden ? 'var(--accent-primary)' : 'var(--text-muted)' }}
        >
          {showHidden ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button
          onClick={() => setSortMode(nextSort)}
          className="rounded-md p-1.5 transition-all duration-200 hover:bg-[var(--bg-panel)] hover:scale-105"
          title={sortLabel(sortMode)}
          style={{ color: sortMode !== 'name-asc' ? 'var(--accent-primary)' : 'var(--text-muted)' }}
        >
          <SortIcon mode={sortMode} />
        </button>
        <div className="flex-1" />
        <button
          onClick={onCreateFile}
          className="rounded-md p-1.5 transition-all duration-200 hover:bg-[var(--bg-panel)] hover:scale-105"
          title="Nouveau fichier"
        >
          <Plus size={14} style={{ color: 'var(--text-muted)' }} />
        </button>
        <button
          onClick={onRefresh}
          className="rounded-md p-1.5 transition-all duration-200 hover:bg-[var(--bg-panel)] hover:scale-105 hover:rotate-90"
          title="Actualiser"
        >
          <RefreshCcw size={14} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Search input amélioré */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="flex items-center gap-2 border-b px-3 py-2"
              style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-base)' }}
            >
              <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filtrer les fichiers…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:opacity-50"
                style={{ color: 'var(--text-primary)' }}
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="rounded-full p-1 hover:bg-[var(--bg-panel)] transition"
                  title="Effacer"
                >
                  <X size={12} style={{ color: 'var(--text-muted)' }} />
                </button>
              )}
              <button
                onClick={toggleSearch}
                className="rounded-full p-1 hover:bg-[var(--bg-panel)] transition"
                title="Fermer la recherche"
              >
                <X size={12} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            {searchQuery && (
              <div
                className="px-3 py-1 text-xs border-b flex items-center gap-2"
                style={{
                  borderColor: 'var(--border-base)',
                  color: 'var(--text-dimmed)',
                  backgroundColor: 'color-mix(in srgb, var(--accent-primary) 6%, transparent)',
                }}
              >
                <span className="font-medium">{fileCount}</span>
                <span>résultat{fileCount !== 1 ? 's' : ''}</span>
                <span className="opacity-50">pour</span>
                <span className="font-mono font-medium" style={{ color: 'var(--accent-primary)' }}>
                  «{searchQuery}»
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sort indicator amélioré */}
      {sortMode !== 'name-asc' && !searchQuery && !showSearch && (
        <div
          className="flex items-center gap-2 px-3 py-1 text-xs border-b"
          style={{
            borderColor: 'var(--border-base)',
            backgroundColor: 'color-mix(in srgb, var(--accent-primary) 8%, transparent)',
            color: 'var(--accent-primary)',
          }}
        >
          <SortIcon mode={sortMode} />
          <span className="font-medium">{sortLabel(sortMode)}</span>
          <button
            className="ml-auto rounded-full p-0.5 hover:bg-[var(--bg-panel)] transition"
            onClick={() => setSortMode('name-asc')}
            title="Réinitialiser le tri"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {/* Tree View Container - avec meilleur padding */}
      <div className="flex-1 overflow-y-auto py-1 custom-scrollbar" style={{ height: '100%' }}>
        {loading ? (
          <div className="space-y-2 px-3 py-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-2 animate-pulse"
                style={{ paddingLeft: `${8 + (i % 5) * 14}px` }}
              >
                <div className="skeleton w-4 h-4 rounded-md flex-shrink-0" style={{ background: 'var(--bg-input)' }} />
                <div
                  className="skeleton h-2.5 rounded-md flex-1"
                  style={{ background: 'var(--bg-input)', maxWidth: `${50 + Math.random() * 100}px` }}
                />
              </div>
            ))}
          </div>
        ) : processedTree.length === 0 && !searchQuery ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' }}
            >
              <Folder size={28} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              {currentDir === '.' || !currentDir ? 'Aucun projet ouvert' : 'Dossier vide'}
            </p>
            <p className="text-sm mb-5 leading-relaxed opacity-60" style={{ color: 'var(--text-muted)' }}>
              {currentDir === '.' || !currentDir 
                ? 'Ouvrez un projet pour commencer à travailler.' 
                : 'Créez un fichier pour commencer.'}
            </p>
            {(currentDir !== '.' && currentDir) && (
              <button
                onClick={onCreateFile}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition hover:shadow-lg hover:scale-105"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'white',
                }}
              >
                <Plus size={16} />
                Nouveau fichier
              </button>
            )}
          </div>
        ) : processedTree.length === 0 && searchQuery ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <Search size={32} className="mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm opacity-60" style={{ color: 'var(--text-muted)' }}>
              Aucun fichier ne correspond à <span className="font-mono font-medium" style={{ color: 'var(--accent-primary)' }}>«{searchQuery}»</span>
            </p>
          </div>
        ) : (
          <>
            {/* Section Sandbox améliorée */}
            {sandboxActive && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 border-b sticky top-0 z-10 backdrop-blur-sm"
                style={{
                  borderColor: 'var(--border-base)',
                  backgroundColor: 'color-mix(in srgb, var(--color-success) 8%, var(--bg-sidebar))',
                }}
              >
                <Shield size={12} style={{ color: 'var(--color-success)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--color-success)' }}>
                  Sandbox
                </span>
                {effectiveDiffPaths && effectiveDiffPaths.size > 0 && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium ml-auto"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-warning) 18%, transparent)',
                      color: 'var(--color-warning)',
                      border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
                    }}
                  >
                    {effectiveDiffPaths.size} diff{effectiveDiffPaths.size > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
            <TreeComponent
              treeData={treeData}
              height={sandboxActive && showWorkspace ? 320 : 600}
              itemHeight={28}
              virtual
              showLine
              expandedKeys={expandedKeys}
              onExpand={handleTreeExpand}
              selectable={false}
              defaultExpandParent
              prefixCls="rc-tree"
            />

            {/* Section Workspace améliorée */}
            {sandboxActive && processedWorkspaceTree.length > 0 && (
              <>
                <div
                  className="flex items-center gap-2 px-3 py-1.5 border-t border-b cursor-pointer select-none transition-colors hover:bg-[var(--bg-panel)]"
                  style={{
                    borderColor: 'var(--border-base)',
                    backgroundColor: 'color-mix(in srgb, var(--accent-primary) 6%, var(--bg-sidebar))',
                  }}
                  onClick={() => setShowWorkspace(prev => !prev)}
                >
                  <span className="opacity-60 transition-transform duration-200" style={{ transform: showWorkspace ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                    <ChevronDown size={12} />
                  </span>
                  <FolderInput size={12} style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-sm font-bold" style={{ color: 'var(--accent-primary)' }}>
                    Dossiers Réels
                  </span>
                  {sandboxModifiedCount > 0 ? (
                    <span
                      className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--color-warning) 18%, transparent)',
                        color: 'var(--color-warning)',
                        border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
                      }}
                      title="Cliquez sur un fichier pour examiner et valider les modifications"
                    >
                      <span>{sandboxModifiedCount} modif{sandboxModifiedCount > 1 ? 's' : ''}</span>
                      <span>↔</span>
                    </span>
                  ) : (
                    <span
                      className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--color-success) 15%, transparent)',
                        color: 'var(--color-success)',
                        border: '1px solid color-mix(in srgb, var(--color-success) 30%, transparent)',
                      }}
                      title="Tous les fichiers sont validés et synchronisés sur le workspace réel"
                    >
                      <span>✓ Validé</span>
                    </span>
                  )}
                </div>
                {showWorkspace && (
                  <TreeComponent
                    treeData={wsTreeData}
                    height={280}
                    itemHeight={28}
                    virtual
                    showLine
                    expandedKeys={wsExpandedKeys}
                    onExpand={handleWsTreeExpand}
                    selectable={false}
                    defaultExpandParent
                    prefixCls="rc-tree"
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