import { motion } from 'motion/react';
import { Loader2, CheckCircle2, ChevronRight } from 'lucide-react';
import { formatDuration, formatClock, safeStringify } from './activity.js';
import { getAgentDisplayName, type ToolActivityEntry } from '../../stores/agentActivityStore.js';

/**
 * Ligne d'action/outil récent — nom technique, agent attribué, durée,
 * horodatage, et détails (arguments + résultat) dépliables.
 */
export function ToolRow({ tool, isOpen, onToggle, reduceMotion }: {
  tool: ToolActivityEntry; isOpen: boolean; onToggle: () => void; reduceMotion: boolean;
}) {
  const durationMs = tool.endTimestamp ? tool.endTimestamp - tool.timestamp : undefined;
  const hasDetails = !!(tool.result || (tool.args && Object.keys(tool.args).length > 0));

  return (
    <motion.div initial={reduceMotion ? false : { opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
      className="rounded-[var(--radius-md)] px-2.5 py-2" style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}>
      <div className="flex items-center gap-2">
        {tool.status === 'running'
          ? <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin" style={{ color: 'var(--accent-primary)' }} />
          : <CheckCircle2 className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--color-success)' }} />}
        <span className="flex-1 truncate font-mono text-xs" style={{ color: 'var(--text-secondary)' }} title={tool.tool}>{tool.label}</span>
        <span className="rounded-full px-1.5 py-px text-[10px] font-medium" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-dimmed)' }} title="Agent attribué">
          {getAgentDisplayName(tool.agentId)}
        </span>
        {tool.status === 'done' && durationMs != null && (
          <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{formatDuration(durationMs)}</span>
        )}
      </div>

      <div className="mt-1 flex items-center gap-2 pl-5">
        <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{formatClock(tool.timestamp)}</span>
        {hasDetails && (
          <button type="button" onClick={onToggle}
            className="flex items-center gap-0.5 rounded text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]"
            style={{ color: 'var(--text-muted)' }} aria-expanded={isOpen}>
            <ChevronRight className="h-2.5 w-2.5 transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} />
            {isOpen ? 'Masquer' : 'Détails'}
          </button>
        )}
      </div>

      {isOpen && hasDetails && (
        <div className="mt-1.5 flex flex-col gap-1.5 pl-5">
          {tool.args && Object.keys(tool.args).length > 0 && (
            <pre className="max-h-24 overflow-auto rounded-[var(--radius-sm)] px-2 py-1.5 font-mono text-[10px] leading-snug custom-scrollbar"
              style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border-base)' }}>
              {safeStringify(tool.args)}
            </pre>
          )}
          {tool.result && (
            <div className="rounded-[var(--radius-sm)] px-2 py-1.5 text-[11px] leading-snug" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border-base)' }}>
              {tool.result.length > 300 ? tool.result.slice(0, 300) + '…' : tool.result}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
