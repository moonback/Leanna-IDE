import { useState, useEffect, useRef, memo } from 'react';
import type React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronDown, ChevronUp, CheckCircle2, Loader2, X,
  FolderSearch, FileText, FilePen, FileSearch, FolderPlus,
  FileMinus, FolderMinus, FileCode, Info, Database, Globe, Brain, Cpu,
  Search, Terminal, RefreshCw,
} from 'lucide-react';
import type { ActivityStep } from '../../hooks/useLiveAPI';

interface AssistantActivityBarProps {
  steps: ActivityStep[];
  connected: boolean;
  /** When true, renders inline (no absolute positioning/floating) */
  inline?: boolean;
}

// ── Per-tool metadata ────────────────────────────────────────────────────────
const TOOL_META: Record<string, { icon: React.ElementType; category: string; color: string }> = {
  list_project_files:         { icon: FolderSearch, category: 'Fichiers',    color: '#60a5fa' },
  read_project_file:          { icon: FileText,     category: 'Fichiers',    color: '#60a5fa' },
  write_project_file:         { icon: FilePen,      category: 'Fichiers',    color: '#34d399' },
  modify_project_file:        { icon: FilePen,      category: 'Fichiers',    color: '#34d399' },
  search_in_files:            { icon: FileSearch,   category: 'Fichiers',    color: '#a78bfa' },
  open_project_file:          { icon: FileCode,     category: 'Fichiers',    color: '#60a5fa' },
  create_project_directory:   { icon: FolderPlus,   category: 'Fichiers',    color: '#34d399' },
  rename_project_file:        { icon: FilePen,      category: 'Fichiers',    color: '#fbbf24' },
  delete_project_file:        { icon: FileMinus,    category: 'Fichiers',    color: '#f87171' },
  delete_project_folder:      { icon: FolderMinus,  category: 'Fichiers',    color: '#f87171' },
  analyze_project_file:       { icon: FileSearch,   category: 'Fichiers',    color: '#a78bfa' },
  get_workspace_info:         { icon: Info,         category: 'Workspace',   color: '#94a3b8' },
  generate_codebase_markdown: { icon: RefreshCw,    category: 'Workspace',   color: '#fbbf24' },
  open_ide:                   { icon: Terminal,     category: 'IDE',         color: '#60a5fa' },
  save_memory:                { icon: Database,     category: 'Mémoire',     color: '#a78bfa' },
  search_memory:              { icon: Brain,        category: 'Mémoire',     color: '#a78bfa' },
  automation_navigate:        { icon: Globe,        category: 'Web',         color: '#34d399' },
  automation_search:          { icon: Search,       category: 'Web',         color: '#34d399' },
  automation_snapshot:        { icon: Globe,        category: 'Web',         color: '#60a5fa' },
  automation_click:           { icon: Globe,        category: 'Web',         color: '#fbbf24' },
  automation_type:            { icon: Globe,        category: 'Web',         color: '#fbbf24' },
  automation_extract:         { icon: Globe,        category: 'Web',         color: '#60a5fa' },
  reasoning_delegate_task:    { icon: Cpu,          category: 'Raisonnement',color: '#f97316' },
};

function getMeta(tool: string) {
  return TOOL_META[tool] ?? { icon: Terminal, category: 'Outil', color: '#94a3b8' };
}

function elapsed(ts: Date): string {
  const ms = Date.now() - ts.getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const StepRow = memo(function StepRow({
  step,
  meta,
  isRun,
  dur,
}: {
  step: ActivityStep;
  meta: { icon: React.ElementType; category: string; color: string };
  isRun: boolean;
  dur: string;
}) {
  const Icon = meta.icon;
  return (
    <div
      className="flex items-start gap-2.5 px-3 py-2 mx-1.5 rounded-2xl"
      style={{
        backgroundColor: isRun ? 'rgba(59,130,246,0.10)' : 'var(--bg-surface)',
        border: '1px solid var(--border-base)',
        boxShadow: isRun ? '0 8px 20px rgba(59,130,246,0.08)' : 'inset 0 -1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <div
        className="flex-shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center"
        style={{ backgroundColor: isRun ? `${meta.color}20` : 'var(--bg-input)' }}
      >
        {isRun ? (
          <Loader2 className="w-3 h-3 animate-spin" style={{ color: meta.color }} />
        ) : (
          <Icon className="w-3 h-3" style={{ color: isRun ? meta.color : 'var(--text-muted)' }} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span
            className="text-xs font-medium truncate"
            style={{ color: isRun ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            {step.label}
          </span>
          <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
            {isRun ? elapsed(step.timestamp) : dur}
          </span>
        </div>
        <span className="text-[10px]" style={{ color: isRun ? meta.color : 'var(--text-muted)', opacity: isRun ? 1 : 0.6 }}>
          {meta.category}
        </span>
      </div>

      <div className="flex-shrink-0 mt-0.5">
        {isRun ? (
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: meta.color }} />
        ) : (
          <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--text-muted)', opacity: 0.35 }} />
        )}
      </div>
    </div>
  );
});

// ── Component ────────────────────────────────────────────────────────────────
export function AssistantActivityBar({ steps, connected, inline = false }: AssistantActivityBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track elapsed for running steps
  const [, setTick] = useState(0);

  const runningStep = [...steps].reverse().find(s => s.status === 'running');
  const isWorking = !!runningStep;
  const doneCount = steps.filter(s => s.status === 'done').length;

  // Ticker — refresh elapsed every 100ms while working
  useEffect(() => {
    if (!isWorking) return;
    const id = setInterval(() => setTick(t => t + 1), 100);
    return () => clearInterval(id);
  }, [isWorking]);

  // Show when work starts
  useEffect(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isWorking) {
      setVisible(true);
    }
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [isWorking]);

  // Auto-scroll to bottom when list updates
  useEffect(() => {
    if (expanded && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [steps, expanded]);

  // Nothing to render
  if (!connected) return null;

  // In inline mode, always visible when there are steps (no auto-hide logic)
  const shouldShow = inline ? steps.length > 0 : visible;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          key="activity-bar"
          initial={inline ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
          animate={inline ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={inline ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className={inline
            ? "flex flex-col min-h-0 overflow-hidden"
            : "absolute bottom-8 right-4 z-40 w-80 rounded-2xl overflow-hidden"
          }
          style={inline
            ? { borderTop: '1px solid var(--border-base)' }
            : {
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
                backdropFilter: 'blur(18px)',
              }
          }
        >
          {/* ── Header ── */}
          <div
            className="flex items-center gap-2.5 px-4 py-3 cursor-pointer select-none"
            style={{
              borderBottom: expanded ? '1px solid rgba(148,163,184,0.18)' : 'none',
              backgroundColor: expanded ? 'rgba(255,255,255,0.02)' : 'transparent',
            }}
            onClick={() => setExpanded(v => !v)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(v => !v); } }}
            tabIndex={0}
            role="button"
            aria-expanded={expanded}
          >
            {/* Animated status dot */}
            <div className="relative flex-shrink-0 w-4 h-4 flex items-center justify-center">
              {isWorking ? (
                <>
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ backgroundColor: 'var(--accent-primary)', opacity: 0.2 }}
                    animate={{ scale: [1, 1.8, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <Loader2
                    className="w-3.5 h-3.5 animate-spin relative"
                    style={{ color: 'var(--accent-primary)' }}
                  />
                </>
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#34d399' }} />
              )}
            </div>

            {/* Main label */}
            <div className="flex-1 min-w-0">
              {isWorking ? (
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span
                    className="text-xs font-semibold truncate"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    {runningStep.label}
                  </span>
                  <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {elapsed(runningStep.timestamp)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium" style={{ color: '#34d399' }}>
                    Terminé
                  </span>
                  <span
                    className="text-[10px] px-2 py-1 rounded-full"
                    style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}
                  >
                    {doneCount} étape{doneCount > 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                className="p-1 rounded-full transition-colors hover:bg-white/10"
                aria-label={expanded ? 'Réduire' : 'Développer'}
                onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
              >
                {expanded
                  ? <ChevronDown className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                  : <ChevronUp className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                }
              </button>
              <button
                className="p-1 rounded-full transition-colors hover:bg-white/10"
                aria-label="Fermer"
                onClick={e => { e.stopPropagation(); setVisible(false); setExpanded(false); }}
              >
                {!inline && <X className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />}
              </button>
            </div>
          </div>

          {/* ── Steps list ── */}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                key="steps"
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                style={{ overflow: 'hidden' }}
              >
                <div
                  ref={listRef}
                  className={`overflow-y-auto py-1.5 ${inline ? 'flex-1' : ''}`}
                  style={inline ? undefined : { maxHeight: 220 }}
                >
                  {steps.map((step, i) => {
                          const meta = getMeta(step.tool);
                          const isRun = step.status === 'running';
                          const nextStep = steps[i + 1];
                          const dur = isRun
                            ? elapsed(step.timestamp)
                            : nextStep
                              ? `${((nextStep.timestamp.getTime() - step.timestamp.getTime()) / 1000).toFixed(1)}s`
                              : '—';

                          return (
                            <StepRow key={step.id} step={step} meta={meta} isRun={isRun} dur={dur} />
                          );
                        })}
                </div>

                {/* Footer with total count */}
                {steps.length > 0 && (
                  <div
                    className="px-3 py-1.5 flex items-center justify-between"
                    style={{ borderTop: '1px solid var(--border-base)' }}
                  >
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {steps.length} action{steps.length > 1 ? 's' : ''}
                    </span>
                    {!isWorking && (
                      <span className="text-[10px]" style={{ color: '#34d399' }}>
                        ✓ Toutes terminées
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
