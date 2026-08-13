import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronUp,
  ChevronDown,
  X,
  Clock,
  Zap,
  Terminal,
  Info,
  FileText,
  FilePen,
  Search,
  Trash2,
  Globe,
  Brain,
  Users,
  Database,
  LayoutGrid,
} from 'lucide-react';
import type { ActivityStep, ReasoningState } from '../../hooks/useLiveAPI';

// ---------------------------------------------------------------------------
// Types & Helpers
// ---------------------------------------------------------------------------

interface AgentProgressBarProps {
  steps: ActivityStep[];
  connected: boolean;
  onClear?: () => void;
  reasoning?: ReasoningState;
}

function elapsed(ts: Date): string {
  if (!(ts instanceof Date)) ts = new Date(ts);
  const seconds = Math.floor((Date.now() - ts.getTime()) / 1000);
  if (seconds < 2) return 'à l\'instant';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function elapsedBetween(start: Date, end: Date): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 100) return `${ms}ms`;
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
}

/** Duration of a completed step */
function stepDuration(step: ActivityStep): string | null {
  if (!step.endTimestamp) return null;
  return elapsedBetween(new Date(step.timestamp), new Date(step.endTimestamp));
}

type StepStatus = 'running' | 'done' | 'error' | 'pending';

function getStepStatus(step: ActivityStep): StepStatus {
  if (step.status === 'running') return 'running';
  if (step.status === 'done') return 'done';
  if (step.status === 'error') return 'error';
  return 'pending';
}

// ---------------------------------------------------------------------------
// Tool categorisation
// ---------------------------------------------------------------------------

type ToolCategory = 'file-read' | 'file-write' | 'file-delete' | 'search' | 'web' | 'agent' | 'reasoning' | 'memory' | 'system' | 'other';

const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  read_project_file: 'file-read',
  list_project_files: 'file-read',
  analyze_project_file: 'file-read',
  open_project_file: 'file-read',
  write_project_file: 'file-write',
  modify_project_file: 'file-write',
  create_project_directory: 'file-write',
  rename_project_file: 'file-write',
  delete_project_file: 'file-delete',
  search_in_files: 'search',
  automation_search: 'search',
  automation_navigate: 'web',
  automation_snapshot: 'web',
  automation_click: 'web',
  automation_type: 'web',
  automation_extract: 'web',
  agent_delegate: 'agent',
  agent_orchestrate: 'agent',
  agent_status: 'agent',
  agent_list_tasks: 'agent',
  agent_list_roles: 'agent',
  agent_cancel: 'agent',
  agent_stats: 'agent',
  reasoning_think: 'reasoning',
  reasoning_delegate_task: 'reasoning',
  reasoning_list_strategies: 'reasoning',
  save_memory: 'memory',
  search_memory: 'memory',
  get_workspace_info: 'system',
  generate_codebase_markdown: 'system',
  open_ide: 'system',
};

function getToolCategory(tool: string): ToolCategory {
  return TOOL_CATEGORIES[tool] ?? 'other';
}

const CATEGORY_COLORS: Record<ToolCategory, string> = {
  'file-read':   'var(--accent-primary)',
  'file-write':  '#22c55e',
  'file-delete': '#ef4444',
  'search':      '#f59e0b',
  'web':         '#6366f1',
  'agent':       '#ec4899',
  'reasoning':   '#a855f7',
  'memory':      '#14b8a6',
  'system':      'var(--text-muted)',
  'other':       'var(--text-dimmed)',
};

const ToolCategoryIcon = memo(function ToolCategoryIcon({ tool, size = 10 }: { tool: string; size?: number }) {
  const cat = getToolCategory(tool);
  const color = CATEGORY_COLORS[cat];
  const cls = `flex-shrink-0`;
  const style = useMemo(() => ({ color, width: size, height: size }), [color, size]);

  switch (cat) {
    case 'file-read':   return <FileText className={cls} style={style} />;
    case 'file-write':  return <FilePen className={cls} style={style} />;
    case 'file-delete': return <Trash2 className={cls} style={style} />;
    case 'search':      return <Search className={cls} style={style} />;
    case 'web':         return <Globe className={cls} style={style} />;
    case 'agent':       return <Users className={cls} style={style} />;
    case 'reasoning':   return <Brain className={cls} style={style} />;
    case 'memory':      return <Database className={cls} style={style} />;
    case 'system':      return <LayoutGrid className={cls} style={style} />;
    default:            return <Terminal className={cls} style={style} />;
  }
});

function formatToolName(tool: string): string {
  const translations: Record<string, string> = {
    'agent orchestrate': 'orchestration d\'agents',
    'agent delegate': 'délégation d\'agent',
    'agent status': 'statut de l\'agent',
    'read project file': 'lecture de fichier',
    'write project file': 'écriture de fichier',
    'modify project file': 'modification de fichier',
    'patch project file': 'patch de fichier',
    'list project files': 'liste des fichiers',
    'search in files': 'recherche dans les fichiers',
    'verify file': 'vérification de fichier',
    'knowledge build context': 'construction du contexte',
    'knowledge semantic search': 'recherche sémantique',
    'knowledge search entities': 'recherche d\'entités',
    'knowledge memory search': 'recherche en mémoire',
    'knowledge memory add': 'ajout en mémoire',
    'knowledge memory list': 'liste de la mémoire',
    'knowledge impact analyze': 'analyse d\'impact',
    'knowledge status': 'statut de la connaissance',
    'knowledge reindex': 'ré-indexation',
    'save memory': 'sauvegarde en mémoire',
    'search memory': 'recherche en mémoire',
    'get current time': 'heure actuelle',
    'reasoning think': 'raisonnement',
    'automation search': 'recherche web',
    'request tools': 'demande d\'outils',
    'open ide': 'ouverture de l\'IDE',
    'open project file': 'ouverture de fichier',
    'analyze project file': 'analyse de fichier',
  };

  const formatted = tool
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();

  return translations[formatted] || formatted;
}
// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const StepIcon = memo(function StepIcon({ status, tool }: { status: StepStatus; tool: string }) {
  const cat = getToolCategory(tool);
  const color = CATEGORY_COLORS[cat];

  if (status === 'running') {
    return (
      <div className="relative flex items-center justify-center w-4 h-4">
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: color, opacity: 0.12 }}
          animate={{ scale: [1, 1.5, 1], opacity: [0.12, 0.04, 0.12] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <Loader2 style={{ width: 12, height: 12, color, position: 'relative' }} className="animate-spin" />
      </div>
    );
  }
  if (status === 'done') {
    return (
      <div className="w-4 h-4 flex items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.1)' }}>
        <CheckCircle2 style={{ width: 11, height: 11, color: 'var(--color-success)' }} />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="w-4 h-4 flex items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
        <AlertCircle style={{ width: 11, height: 11, color: 'var(--color-error)' }} />
      </div>
    );
  }
  return (
    <div className="w-4 h-4 flex items-center justify-center">
      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--border-base)' }} />
    </div>
  );
});

const ProgressRing = memo(function ProgressRing({ percent, size = 20, stroke = 2.5, isWorking }: {
  percent: number;
  size?: number;
  stroke?: number;
  isWorking?: boolean;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} className="flex-shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke="var(--border-base)" strokeWidth={stroke} opacity={0.25} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={isWorking ? 'var(--accent-primary)' : 'var(--color-success)'}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      />
    </svg>
  );
});

const CategoryLegend = memo(function CategoryLegend({ steps }: { steps: ActivityStep[] }) {
  const counts = useMemo(() => {
    const map: Partial<Record<ToolCategory, number>> = {};
    for (const s of steps) {
      const cat = getToolCategory(s.tool);
      map[cat] = (map[cat] ?? 0) + 1;
    }
    return Object.entries(map) as [ToolCategory, number][];
  }, [steps]);

  if (counts.length < 2) return null;

  const translations: Record<ToolCategory, string> = {
    'file-read': 'lecture de fichier',
    'file-write': 'écriture de fichier',
    'file-delete': 'suppression de fichier',
    'search': 'recherche',
    'web': 'web',
    'agent': 'agent',
    'reasoning': 'raisonnement',
    'memory': 'mémoire',
    'system': 'système',
    'other': 'autre',
  };

  return (
    <div className="flex flex-wrap gap-2 px-3 pb-3">
      {counts.map(([cat, n]) => (
        <div
          key={cat}
          className="flex items-center gap-1 rounded-full px-3 py-1"
          style={{
            backgroundColor: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
          <span className="text-[9px] font-mono" style={{ color: 'var(--text-secondary)' }}>
            {translations[cat] || cat.replace('-', ' ')} · {n}
          </span>
        </div>
      ))}
    </div>
  );
});


const StatsBar = memo(function StatsBar({ doneCount, errorCount, totalCount, totalDuration, avgDuration }: {
  doneCount: number;
  errorCount: number;
  totalCount: number;
  totalDuration: string;
  avgDuration: string | null;
}) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-1.5 border-b"
      style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-surface)' }}
    >
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--color-success)' }} />
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
          {doneCount} terminée{doneCount > 1 ? 's' : ''}
        </span>
      </div>
      {errorCount > 0 && (
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3" style={{ color: 'var(--color-error)' }} />
          <span className="text-[10px] font-medium" style={{ color: 'var(--color-error)' }}>
            {errorCount} erreur{errorCount > 1 ? 's' : ''}
          </span>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <Zap className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
          {totalCount} étape{totalCount > 1 ? 's' : ''}
        </span>
      </div>
      {avgDuration && (
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono tabular-nums" style={{ color: 'var(--text-dimmed)' }}>
            ø {avgDuration}
          </span>
        </div>
      )}
      <div className="flex items-center gap-1.5 ml-auto">
        <Clock className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
        <span className="text-[10px] font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {totalDuration}
        </span>
      </div>
    </div>
  );
});


// ---------------------------------------------------------------------------
// ReasoningPanel — affichage des étapes Chain-of-Thought en temps réel
// ---------------------------------------------------------------------------

const COMPLEXITY_LABELS: Record<string, { label: string; color: string }> = {
  simple:   { label: 'Direct',             color: '#94a3b8' },
  moderate: { label: 'Chain of Thought',   color: '#60a5fa' },
  complex:  { label: 'CoT complet',        color: '#a78bfa' },
  critical: { label: 'Tree-of-Thought',    color: '#f97316' },
};

const CoTStepRow = memo(function CoTStepRow({ step, isLast }: { step: NonNullable<ReasoningState['steps']>[number]; isLast: boolean }) {
  const isRunning = step.status === 'running';
  const isDone    = step.status === 'done';
  const isFailed  = step.status === 'failed';

  const dotColor = isRunning ? '#a855f7' : isDone ? '#22c55e' : isFailed ? '#ef4444' : '#64748b';

  return (
    <div className="flex gap-2 min-h-[24px]">
      {/* Timeline */}
      <div className="flex flex-col items-center flex-shrink-0 w-3.5 pt-[4px]">
        {isRunning ? (
          <Loader2 style={{ width: 10, height: 10, color: dotColor }} className="animate-spin" />
        ) : isDone ? (
          <CheckCircle2 style={{ width: 10, height: 10, color: dotColor }} />
        ) : isFailed ? (
          <AlertCircle style={{ width: 10, height: 10, color: dotColor }} />
        ) : (
          <div className="w-1.5 h-1.5 rounded-full mt-0.5" style={{ backgroundColor: dotColor }} />
        )}
        {!isLast && (
          <div
            className="w-px flex-1 mt-0.5"
            style={{ backgroundColor: isDone ? `${dotColor}55` : 'var(--border-base)', opacity: 0.5 }}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-1.5">
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className="text-[10px] leading-snug"
            style={{
              color: isRunning ? 'var(--text-primary)' : isDone ? 'var(--text-secondary)' : isFailed ? 'var(--color-error)' : 'var(--text-dimmed)',
              fontWeight: isRunning ? 600 : 400,
            }}
          >
            {step.label}
          </span>
          {step.durationMs !== undefined && (
            <span className="text-[9px] tabular-nums font-mono flex-shrink-0" style={{ color: 'var(--text-dimmed)' }}>
              {step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>
        {step.content && (
          <p className="text-[9px] leading-relaxed mt-0.5 line-clamp-2" style={{ color: 'var(--text-dimmed)' }}>
            {step.content}
          </p>
        )}
      </div>
    </div>
  );
});

const ReasoningPanel = memo(function ReasoningPanel({ reasoning }: { reasoning?: ReasoningState }) {
  if (!reasoning || (!reasoning.active && (!reasoning.steps || reasoning.steps.length === 0))) return null;

  const meta = reasoning.complexity ? COMPLEXITY_LABELS[reasoning.complexity] : null;
  const steps = reasoning.steps ?? [];
  const doneCount = steps.filter(s => s.status === 'done').length;
  const totalSteps = reasoning.totalSteps ?? steps.length;

  return (
    <AnimatePresence>
      {(reasoning.active || steps.length > 0) && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{ overflow: 'hidden' }}
          role="region"
          aria-label="Raisonnement en cours"
        >
          {/* Header */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 border-b"
            style={{ borderColor: 'var(--border-base)', backgroundColor: 'rgba(168,85,247,0.04)' }}
          >
            <motion.div
              animate={reasoning.active ? { rotate: 360 } : { rotate: 0 }}
              transition={reasoning.active ? { duration: 2, repeat: Infinity, ease: 'linear' } : {}}
            >
              <Brain style={{ width: 11, height: 11, color: '#a855f7' }} />
            </motion.div>
            <span className="text-[10px] font-semibold" style={{ color: '#a855f7' }}>
              {reasoning.strategyLabel ?? reasoning.strategy ?? 'Raisonnement'}
            </span>
            {meta && (
              <span
                className="text-[8px] px-1.5 py-px rounded font-mono"
                style={{
                  backgroundColor: meta.color + '22',
                  color: meta.color,
                  border: `1px solid ${meta.color}44`,
                }}
              >
                {meta.label}
              </span>
            )}
            {totalSteps > 0 && (
              <span
                className="ml-auto text-[9px] tabular-nums font-mono"
                style={{ color: 'var(--text-dimmed)' }}
              >
                {doneCount}/{totalSteps}
              </span>
            )}
          </div>

          {/* Steps */}
          {steps.length > 0 && (
            <div className="px-3 py-2">
              {steps.map((step, i) => (
                <CoTStepRow key={step.index} step={step} isLast={i === steps.length - 1} />
              ))}
            </div>
          )}

          {/* Pulse quand actif sans steps encore */}
          {reasoning.active && steps.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-2">
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  className="w-1 h-1 rounded-full"
                  style={{ backgroundColor: '#a855f7' }}
                  animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
              <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>Analyse en cours…</span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// ---------------------------------------------------------------------------
// AgentProgressBar Component
// ---------------------------------------------------------------------------

export function AgentProgressBar({ steps, connected, onClear, reasoning }: AgentProgressBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const runningStep = useMemo(() => [...steps].reverse().find(s => s.status === 'running'), [steps]);
  const isWorking = !!runningStep;
  const doneCount = useMemo(() => steps.filter(s => s.status === 'done').length, [steps]);
  const errorCount = useMemo(() => steps.filter(s => s.status === 'error').length, [steps]);
  const totalCount = steps.length;
  const progressPercent = useMemo(
    () => totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0,
    [doneCount, totalCount]
  );

  /** Total session duration */
  const totalDuration = useMemo(() => {
    if (steps.length === 0) return '0s';
    const first = new Date(steps[0].timestamp);
    const last = new Date(steps[steps.length - 1].timestamp);
    return elapsedBetween(first, isWorking ? new Date() : last);
  }, [steps, isWorking]);

  /** Average step duration (only completed steps with endTimestamp) */
  const avgDuration = useMemo(() => {
    const completed = steps.filter(s => s.endTimestamp);
    if (completed.length === 0) return null;
    const totalMs = completed.reduce((acc, s) => {
      return acc + (new Date(s.endTimestamp!).getTime() - new Date(s.timestamp).getTime());
    }, 0);
    const avg = totalMs / completed.length;
    if (avg < 1000) return `${Math.round(avg)}ms`;
    return `${(avg / 1000).toFixed(1)}s`;
  }, [steps]);

  const toggleExpand = useCallback(() => setExpanded(v => !v), []);
  const [, setTick] = useState<number>(0);

  // Auto-scroll to bottom when new steps arrive
  useEffect(() => {
    if (expanded && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [steps.length, expanded]);

  // Auto-expand when agent starts working
  useEffect(() => {
    if (isWorking && steps.length <= 2) setExpanded(true);
  }, [isWorking, steps.length]);

  // Keep live progress timestamps updating while working
  useEffect(() => {
    if (!isWorking) return;
    const id = setInterval(() => {
      // force rerender via state update when working
      setTick(t => t + 1);
    }, 500);
    return () => clearInterval(id);
  }, [isWorking]);

  if (!connected || steps.length === 0) return null;

  const activeColor = isWorking ? 'var(--accent-primary)' : 'var(--color-success)';

  return (
    <div
      className="border-t select-none"
      style={{
        borderColor: 'var(--border-base)',
        background: 'linear-gradient(180deg, var(--bg-panel), rgba(0,0,0,0.02))',
        boxShadow: '0 -4px 12px rgba(0,0,0,0.12)',
      }}
    >
      {/* Thin progress bar at very top */}
      <div className="relative h-[2px] w-full overflow-hidden" style={{ backgroundColor: 'var(--border-base)', opacity: 0.35 }}>
        <motion.div
          className="absolute inset-y-0 left-0"
          style={{ backgroundColor: activeColor }}
          initial={{ width: '0%' }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
        {isWorking && (
          <motion.div
            className="absolute inset-y-0 w-12"
            style={{ background: `linear-gradient(90deg, transparent, var(--accent-primary), transparent)` }}
            animate={{ left: ['-10%', '110%'] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>

      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-3">
        <div
          className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer p-2 rounded-md hover:bg-[rgba(255,255,255,0.02)]"
          onClick={toggleExpand}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(); }}}
          tabIndex={0}
          role="button"
          aria-expanded={expanded}
          aria-label="Afficher les détails de progression"
        >
          {/* Progress ring */}
          <ProgressRing percent={progressPercent} isWorking={isWorking} size={22} />

          {/* Status icon */}
          {isWorking ? (
            <div className="relative flex-shrink-0 w-5 h-5 flex items-center justify-center">
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: 'var(--accent-primary)', opacity: 0.08 }}
                animate={{ scale: [1, 1.7, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
              <Loader2 className="w-4 h-4 animate-spin relative" style={{ color: 'var(--accent-primary)' }} />
            </div>
          ) : errorCount > 0 ? (
            <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-warning)' }} />
          ) : (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-success)' }} />
          )}

          {/* Summary text */}
          <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
            {isWorking ? (
              <>
                <div className="flex items-center gap-1.5 min-w-0">
                  <ToolCategoryIcon tool={runningStep.tool} size={10} />
                  <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {runningStep.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[9px] px-1.5 py-px rounded font-mono leading-none"
                    style={{
                      backgroundColor: CATEGORY_COLORS[getToolCategory(runningStep.tool)] + '22',
                      color: CATEGORY_COLORS[getToolCategory(runningStep.tool)],
                      border: `1px solid ${CATEGORY_COLORS[getToolCategory(runningStep.tool)]}44`,
                    }}
                  >
                    {formatToolName(runningStep.tool)}
                  </span>
                  <span className="text-[9px] tabular-nums font-mono" style={{ color: 'var(--text-muted)' }}>
                    {elapsed(runningStep.timestamp)}
                  </span>
                </div>
              </>
            ) : (
              <>
                <span className="text-[11px] font-semibold" style={{ color: 'var(--color-success)' }}>
                  Exécution terminée
                </span>
                <span className="text-[9px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {doneCount}/{totalCount} • {totalDuration}
                  {errorCount > 0 && (
                    <span style={{ color: 'var(--color-error)' }}> • {errorCount} erreur{errorCount > 1 ? 's' : ''}</span>
                  )}
                </span>
              </>
            )}
          </div>

          {/* Step counter badge */}
          <span
            className="text-[10px] font-mono tabular-nums px-2 py-1 flex-shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              borderRadius: '8px',
              border: '1px solid var(--border-base)',
              boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.03)'
            }}
          >
            {doneCount}/{totalCount}
          </span>

          {/* Expand chevron */}
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-dimmed)' }} />
            : <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-dimmed)' }} />
          }
        </div>

        {/* Clear button */}
        {!isWorking && onClear && (
          <button
            onClick={onClear}
            className="flex-shrink-0 p-1.5 rounded-md transition-colors hover:bg-[rgba(255,255,255,0.04)]"
            title="Effacer l'historique"
            aria-label="Effacer l'historique des étapes"
            style={{ borderRadius: 'var(--radius-sm)', color: 'var(--text-dimmed)' }}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <StatsBar
              doneCount={doneCount}
              errorCount={errorCount}
              totalCount={totalCount}
              totalDuration={totalDuration}
              avgDuration={avgDuration}
            />

            {/* Timeline */}
            <div ref={listRef} className="px-3 py-2 max-h-60 overflow-y-auto custom-scrollbar">
              <div className="flex flex-col">
                {steps.map((step, i) => {
                  const status = getStepStatus(step);
                  const isLast = i === steps.length - 1;
                  const isStepExpanded = expandedStepId === step.id;
                  const catColor = CATEGORY_COLORS[getToolCategory(step.tool)];
                  const dur = stepDuration(step);

                  return (
                    <div key={step.id} className="flex gap-2 min-h-[28px]">
                      {/* Timeline column */}
                      <div className="flex flex-col items-center flex-shrink-0 w-4 pt-[5px]">
                        <StepIcon status={status} tool={step.tool} />
                        {!isLast && (
                          <div
                            className="w-px flex-1 mt-0.5"
                            style={{
                              background: status === 'done'
                                ? `linear-gradient(to bottom, ${catColor}55, var(--border-base)44)`
                                : status === 'error'
                                  ? 'rgba(239,68,68,0.3)'
                                  : 'var(--border-base)',
                              opacity: 0.6,
                            }}
                          />
                        )}
                      </div>

                      {/* Step content */}
                      <div
                        className="flex-1 min-w-0 pb-2 cursor-pointer group rounded-md transition-colors hover:bg-[rgba(255,255,255,0.03)]"
                        onClick={() => setExpandedStepId(isStepExpanded ? null : step.id)}
                        style={{ padding: '6px 8px', marginLeft: '-6px' }}
                      >
                        {/* Main label row */}
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span
                            className="text-[11px] flex-1 truncate leading-tight"
                            style={{
                              color: status === 'running'
                                ? 'var(--text-primary)'
                                : status === 'error'
                                  ? 'var(--color-error)'
                                  : 'var(--text-secondary)',
                              fontWeight: status === 'running' ? 600 : 400,
                            }}
                          >
                            {step.label}
                          </span>
                          {/* Duration or elapsed */}
                          {dur ? (
                            <span
                              className="text-[9px] tabular-nums font-mono flex-shrink-0"
                              style={{ color: 'var(--text-dimmed)', opacity: 0.7 }}
                            >
                              {dur}
                            </span>
                          ) : status === 'running' ? (
                            <span
                              className="text-[9px] tabular-nums font-mono flex-shrink-0"
                              style={{ color: catColor, opacity: 0.8 }}
                            >
                              {elapsed(step.timestamp)}
                            </span>
                          ) : null}
                        </div>

                        {/* Tool tag row */}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <ToolCategoryIcon tool={step.tool} size={9} />
                          <span
                            className="text-[9px] font-mono truncate"
                            style={{ color: catColor, opacity: 0.7 }}
                          >
                            {formatToolName(step.tool)}
                          </span>
                          {step.detail && (
                            <Info
                              style={{ width: 9, height: 9, flexShrink: 0, color: 'var(--text-dimmed)' }}
                              className="opacity-0 group-hover:opacity-50 transition-opacity"
                            />
                          )}
                        </div>

                        {/* Expanded detail */}
                        <AnimatePresence>
                          {isStepExpanded && step.detail && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.12 }}
                              className="overflow-hidden"
                            >
                              <pre
                                className="mt-1.5 p-2 text-[10px] leading-relaxed whitespace-pre-wrap break-all font-mono"
                                style={{
                                  color: 'var(--text-muted)',
                                  backgroundColor: 'var(--bg-input)',
                                  border: '1px solid var(--border-base)',
                                  borderRadius: 'var(--radius-sm)',
                                }}
                              >
                                {step.detail}
                              </pre>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Category legend */}
            <CategoryLegend steps={steps} />
            {reasoning && <ReasoningPanel reasoning={reasoning} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
