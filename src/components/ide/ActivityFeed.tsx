import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity, FileText, GitBranch, Terminal, MessageSquare,
  Zap, CheckCircle2, Clock, ChevronDown,
} from 'lucide-react';
import type { ActivityStep } from '../../hooks/useLiveAPI';

// ── Types ──────────────────────────────────────────────────────────────────

interface FeedEntry {
  id: string;
  type: 'file' | 'git' | 'terminal' | 'chat' | 'agent' | 'system';
  title: string;
  description?: string;
  timestamp: Date;
  status: 'success' | 'running' | 'error';
}

interface ActivityFeedProps {
  steps: ActivityStep[];
  connected: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function timeLabel(d: Date): string {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function getIcon(type: FeedEntry['type']) {
  switch (type) {
    case 'file': return FileText;
    case 'git': return GitBranch;
    case 'terminal': return Terminal;
    case 'chat': return MessageSquare;
    case 'agent': return Zap;
    default: return Activity;
  }
}

function getColor(type: FeedEntry['type']) {
  switch (type) {
    case 'file': return '#60a5fa';
    case 'git': return '#f472b6';
    case 'terminal': return '#fbbf24';
    case 'chat': return 'var(--accent-primary)';
    case 'agent': return '#a855f7';
    default: return 'var(--text-muted)';
  }
}

function stepToFeedEntry(step: ActivityStep): FeedEntry {
  const tool = step.tool;
  let type: FeedEntry['type'] = 'agent';
  if (tool.includes('file') || tool.includes('project') || tool.includes('codebase')) type = 'file';
  else if (tool.includes('git')) type = 'git';
  else if (tool.includes('system_execute') || tool.includes('terminal')) type = 'terminal';

  return {
    id: step.id,
    type,
    title: step.label,
    timestamp: step.timestamp,
    status: step.status === 'running' ? 'running' : 'success',
  };
}

// ── Activity Feed Component ────────────────────────────────────────────────

export function ActivityFeed({ steps, connected }: ActivityFeedProps) {
  const [expanded, setExpanded] = useState(true);

  const entries: FeedEntry[] = steps.map(stepToFeedEntry);
  const grouped = groupByTime(entries);

  if (!connected || entries.length === 0) return null;

  return (
    <div className="flex flex-col overflow-hidden" style={{ borderTop: '1px solid var(--border-base)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none flex-shrink-0"
        onClick={() => setExpanded(v => !v)}
      >
        <Activity size={12} style={{ color: 'var(--accent-primary)' }} />
        <span className="text-[10px] font-bold uppercase tracking-wider flex-1" style={{ color: 'var(--text-muted)' }}>
          Activité
        </span>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
          style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-dimmed)' }}>
          {entries.length}
        </span>
        <ChevronDown size={11} className={`transition-transform ${expanded ? '' : '-rotate-90'}`} style={{ color: 'var(--text-dimmed)' }} />
      </div>

      {/* Feed entries */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="overflow-y-auto max-h-48 px-2 pb-2 space-y-0.5 custom-scrollbar">
              {grouped.map(({ label, items }) => (
                <div key={label}>
                  <div className="text-[9px] font-semibold uppercase tracking-wider px-2 py-1" style={{ color: 'var(--text-dimmed)' }}>
                    {label}
                  </div>
                  {items.map((entry) => (
                    <FeedRow key={entry.id} entry={entry} />
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Feed Row ───────────────────────────────────────────────────────────────

function FeedRow({ entry }: { entry: FeedEntry }) {
  const Icon = getIcon(entry.type);
  const color = getColor(entry.type);
  const isRunning = entry.status === 'running';

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/5 transition">
      <div
        className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}12` }}
      >
        <Icon size={10} style={{ color }} />
      </div>
      <span className="text-[10px] flex-1 truncate" style={{ color: isRunning ? 'var(--text-primary)' : 'var(--text-muted)' }}>
        {entry.title}
      </span>
      <span className="text-[9px] font-mono flex-shrink-0" style={{ color: 'var(--text-dimmed)' }}>
        {timeLabel(entry.timestamp)}
      </span>
      {isRunning ? (
        <div className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: color }} />
      ) : (
        <CheckCircle2 size={9} className="flex-shrink-0" style={{ color: 'var(--text-dimmed)', opacity: 0.4 }} />
      )}
    </div>
  );
}

// ── Group entries by time period ───────────────────────────────────────────

function groupByTime(entries: FeedEntry[]): { label: string; items: FeedEntry[] }[] {
  const now = Date.now();
  const groups: { label: string; items: FeedEntry[] }[] = [];
  const recent: FeedEntry[] = [];
  const earlier: FeedEntry[] = [];

  for (const e of [...entries].reverse()) {
    const age = now - e.timestamp.getTime();
    if (age < 5 * 60 * 1000) recent.push(e);
    else earlier.push(e);
  }

  if (recent.length > 0) groups.push({ label: 'Maintenant', items: recent });
  if (earlier.length > 0) groups.push({ label: 'Plus tôt', items: earlier });

  return groups;
}
