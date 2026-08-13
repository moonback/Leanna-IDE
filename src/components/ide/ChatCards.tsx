import { useState } from 'react';
import { motion } from 'motion/react';
import {
  FileText, Terminal, GitBranch, Package, Eye, Check, X,
  ChevronDown, ChevronRight, Copy, ExternalLink,
} from 'lucide-react';

// ── File Card ──────────────────────────────────────────────────────────────

interface FileCardProps {
  path: string;
  action: 'created' | 'modified' | 'deleted' | 'read';
  linesAdded?: number;
  linesRemoved?: number;
  onClick?: () => void;
}

export function FileCard({ path, action, linesAdded, linesRemoved, onClick }: FileCardProps) {
  const fileName = path.split(/[/\\]/).pop() || path;
  const dir = path.split(/[/\\]/).slice(-3, -1).join('/');

  const actionColors = {
    created: '#4ade80',
    modified: '#fbbf24',
    deleted: '#f87171',
    read: 'var(--accent-primary)',
  };
  const actionLabels = {
    created: 'Créé',
    modified: 'Modifié',
    deleted: 'Supprimé',
    read: 'Lu',
  };

  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all hover:bg-white/5 group"
      style={{ border: '1px solid var(--border-base)' }}
    >
      <FileText size={14} style={{ color: actionColors[action] }} className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[11px] font-medium block truncate" style={{ color: 'var(--text-primary)' }}>
          {fileName}
        </span>
        <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{dir}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {typeof linesAdded === 'number' && linesAdded > 0 && (
          <span className="text-[9px] font-mono" style={{ color: '#4ade80' }}>+{linesAdded}</span>
        )}
        {typeof linesRemoved === 'number' && linesRemoved > 0 && (
          <span className="text-[9px] font-mono" style={{ color: '#f87171' }}>-{linesRemoved}</span>
        )}
        <span
          className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded"
          style={{ backgroundColor: `${actionColors[action]}15`, color: actionColors[action] }}
        >
          {actionLabels[action]}
        </span>
      </div>
    </motion.button>
  );
}

// ── Command Card ───────────────────────────────────────────────────────────

interface CommandCardProps {
  command: string;
  output?: string;
  exitCode?: number;
  onCopy?: () => void;
}

export function CommandCard({ command, output, exitCode, onCopy }: CommandCardProps) {
  const [expanded, setExpanded] = useState(false);
  const success = exitCode === 0 || exitCode === undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border-base)' }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
        onClick={() => output && setExpanded(v => !v)}
      >
        <Terminal size={13} style={{ color: success ? '#4ade80' : '#f87171' }} />
        <code className="text-[11px] font-mono flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
          {command}
        </code>
        {exitCode !== undefined && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
            style={{ backgroundColor: success ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', color: success ? '#4ade80' : '#f87171' }}>
            {success ? '✓' : `exit ${exitCode}`}
          </span>
        )}
        {onCopy && (
          <button onClick={(e) => { e.stopPropagation(); onCopy(); }} className="p-1 rounded hover:bg-white/10 transition">
            <Copy size={11} style={{ color: 'var(--text-muted)' }} />
          </button>
        )}
        {output && (
          expanded ? <ChevronDown size={11} style={{ color: 'var(--text-dimmed)' }} />
                   : <ChevronRight size={11} style={{ color: 'var(--text-dimmed)' }} />
        )}
      </div>
      {expanded && output && (
        <div className="px-3 py-2 border-t max-h-32 overflow-y-auto" style={{ borderColor: 'var(--border-base)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
          <pre className="text-[10px] font-mono whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>
            {output}
          </pre>
        </div>
      )}
    </motion.div>
  );
}

// ── Diff Card (Priorité 9) ─────────────────────────────────────────────────

interface DiffCardProps {
  filePath: string;
  additions: number;
  deletions: number;
  onAccept?: () => void;
  onReject?: () => void;
  onView?: () => void;
}

export function DiffCard({ filePath, additions, deletions, onAccept, onReject, onView }: DiffCardProps) {
  const fileName = filePath.split(/[/\\]/).pop() || filePath;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border-base)' }}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
        <GitBranch size={13} style={{ color: '#f472b6' }} />
        <div className="flex-1 min-w-0">
          <span className="text-[11px] font-medium block truncate" style={{ color: 'var(--text-primary)' }}>
            {fileName}
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] font-mono" style={{ color: '#4ade80' }}>+{additions}</span>
            <span className="text-[9px] font-mono" style={{ color: '#f87171' }}>-{deletions}</span>
            <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>lignes</span>
          </div>
        </div>
      </div>
      {/* Accept / Reject / View buttons */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-t" style={{ borderColor: 'var(--border-base)', backgroundColor: 'rgba(0,0,0,0.1)' }}>
        {onView && (
          <button onClick={onView} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium hover:bg-white/5 transition"
            style={{ color: 'var(--accent-primary)' }}>
            <Eye size={11} /> Voir
          </button>
        )}
        {onAccept && (
          <button onClick={onAccept} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium hover:bg-green-500/10 transition"
            style={{ color: '#4ade80' }}>
            <Check size={11} /> Accepter
          </button>
        )}
        {onReject && (
          <button onClick={onReject} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium hover:bg-red-500/10 transition"
            style={{ color: '#f87171' }}>
            <X size={11} /> Annuler
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ── Package Card ───────────────────────────────────────────────────────────

interface PackageCardProps {
  name: string;
  version?: string;
  action: 'install' | 'update' | 'remove';
}

export function PackageCard({ name, version, action }: PackageCardProps) {
  const colors = { install: '#4ade80', update: '#fbbf24', remove: '#f87171' };
  const labels = { install: 'Installé', update: 'Mis à jour', remove: 'Supprimé' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 px-3 py-2 rounded-xl"
      style={{ border: '1px solid var(--border-base)' }}
    >
      <Package size={13} style={{ color: colors[action] }} />
      <span className="text-[11px] font-mono flex-1" style={{ color: 'var(--text-primary)' }}>
        {name}{version ? `@${version}` : ''}
      </span>
      <span className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded"
        style={{ backgroundColor: `${colors[action]}12`, color: colors[action] }}>
        {labels[action]}
      </span>
    </motion.div>
  );
}

// ── Multi-file Changes Summary (Priorité 9 — Diff moderne) ────────────────

interface ChangesSummaryProps {
  files: { path: string; additions: number; deletions: number }[];
  onAcceptAll?: () => void;
  onRejectAll?: () => void;
  onViewFile?: (path: string) => void;
}

export function ChangesSummary({ files, onAcceptAll, onRejectAll, onViewFile }: ChangesSummaryProps) {
  const [expanded, setExpanded] = useState(true);
  const totalAdd = files.reduce((s, f) => s + f.additions, 0);
  const totalDel = files.reduce((s, f) => s + f.deletions, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border-base)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
        onClick={() => setExpanded(v => !v)}
      >
        <GitBranch size={13} style={{ color: '#f472b6' }} />
        <span className="text-[11px] font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>
          {files.length} fichier{files.length > 1 ? 's' : ''} modifié{files.length > 1 ? 's' : ''}
        </span>
        <span className="text-[9px] font-mono" style={{ color: '#4ade80' }}>+{totalAdd}</span>
        <span className="text-[9px] font-mono" style={{ color: '#f87171' }}>-{totalDel}</span>
        {expanded ? <ChevronDown size={11} style={{ color: 'var(--text-dimmed)' }} />
                  : <ChevronRight size={11} style={{ color: 'var(--text-dimmed)' }} />}
      </div>

      {/* File list */}
      {expanded && (
        <div className="border-t" style={{ borderColor: 'var(--border-base)' }}>
          {files.map(f => {
            const name = f.path.split(/[/\\]/).pop() || f.path;
            return (
              <div key={f.path}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 transition cursor-pointer"
                onClick={() => onViewFile?.(f.path)}
              >
                <FileText size={11} style={{ color: 'var(--text-muted)' }} />
                <span className="text-[10px] flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{name}</span>
                <span className="text-[9px] font-mono" style={{ color: '#4ade80' }}>+{f.additions}</span>
                <span className="text-[9px] font-mono" style={{ color: '#f87171' }}>-{f.deletions}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      {(onAcceptAll || onRejectAll) && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-t" style={{ borderColor: 'var(--border-base)', backgroundColor: 'rgba(0,0,0,0.1)' }}>
          {onAcceptAll && (
            <button onClick={onAcceptAll} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium hover:bg-green-500/10 transition"
              style={{ color: '#4ade80' }}>
              <Check size={11} /> Accepter tout
            </button>
          )}
          {onRejectAll && (
            <button onClick={onRejectAll} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium hover:bg-red-500/10 transition"
              style={{ color: '#f87171' }}>
              <X size={11} /> Annuler tout
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
