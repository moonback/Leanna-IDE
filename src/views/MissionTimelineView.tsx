import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  History, RefreshCw, Loader2, FlagTriangleRight, Search, Wrench,
  AlertTriangle, RotateCcw, CheckCircle2, CircleDot, Target, ShieldAlert,
  Pause, Play, XCircle, Trash2,
} from 'lucide-react';
import { ViewHeader } from '../components/ui/ViewHeader.js';
import { missionApi } from '../services/ideApi.js';

// ─── Types mirrored from the MissionTimeTravel engine ────────────────────────

type TimelineEventType =
  | 'plan' | 'goal_start' | 'analyze' | 'action' | 'reflect'
  | 'failure' | 'replan' | 'escalate' | 'goal_complete' | 'success' | 'end';

interface StepSnapshot {
  skillName?: string;
  args?: Record<string, unknown>;
  rationale?: string;
  score?: number;
  status?: string;
  result?: unknown;
  decision?: string;
  reasoning?: string;
  confidence?: number;
  observation?: string;
  success?: string | null;
  failure?: string | null;
}
interface TimelineEvent {
  index: number;
  type: TimelineEventType;
  at?: string;
  label: string;
  goalTitle?: string;
  snapshot?: StepSnapshot;
}
interface MissionTimeline {
  missionId: string;
  title: string;
  status: string;
  events: TimelineEvent[];
}
interface MissionListItem {
  id: string;
  title: string;
  status: string;
  /** Pause suivie côté Executor (le statut reste "in_progress" pendant une pause). */
  paused?: boolean;
}

/** Statuts terminaux : plus d'action de pilotage, seule la suppression reste. */
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

const EVENT_META: Record<TimelineEventType, { icon: React.FC<{ size?: number; style?: React.CSSProperties }>; color: string }> = {
  plan:          { icon: FlagTriangleRight, color: 'var(--accent-primary)' },
  goal_start:    { icon: Search,            color: 'var(--color-info)' },
  analyze:       { icon: Search,            color: 'var(--color-info)' },
  action:        { icon: Wrench,            color: 'var(--accent-secondary)' },
  reflect:       { icon: CircleDot,         color: 'var(--text-muted)' },
  failure:       { icon: AlertTriangle,     color: 'var(--color-error)' },
  replan:        { icon: RotateCcw,         color: 'var(--color-warning)' },
  escalate:      { icon: ShieldAlert,       color: 'var(--color-warning)' },
  goal_complete: { icon: CheckCircle2,      color: 'var(--color-success)' },
  success:       { icon: CheckCircle2,      color: 'var(--color-success)' },
  end:           { icon: Target,            color: 'var(--text-muted)' },
};

function timeOf(at?: string): string {
  if (!at) return '';
  try { return new Date(at).toISOString().slice(11, 19); } catch { return ''; }
}

export default function MissionTimelineView() {
  const reduceMotion = useReducedMotion();
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<MissionTimeline | null>(null);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const loadMissions = useCallback(async () => {
    try {
      const data = await fetch('/api/missions').then((r) => r.json()).catch(() => null);
      const list: MissionListItem[] = (data?.missions ?? []).map((m: any) => ({ id: m.id, title: m.title, status: m.status, paused: m.paused === true }));
      setMissions(list);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
    } catch { /* best-effort */ }
  }, []);

  const loadTimeline = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await fetch(`/api/missions/${id}/timeline`).then((r) => r.json()).catch(() => null);
      if (data?.timeline) {
        setTimeline(data.timeline as MissionTimeline);
        setSelectedStep(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Exécute une action de pilotage (pause/resume/cancel/delete) avec mise à jour
   * optimiste : on reflète l'état cible localement, puis on resynchronise depuis
   * le serveur (source de vérité). En cas d'échec, le `loadMissions` final remet
   * la liste dans l'état réel — pas de rollback manuel fragile.
   */
  const runMissionAction = useCallback(
    async (
      missionId: string,
      op: 'pause' | 'resume' | 'cancel' | 'delete',
      optimistic: (m: MissionListItem) => MissionListItem | null,
    ) => {
      setBusyIds((prev) => new Set(prev).add(missionId));
      // Optimiste : applique la transition visuelle immédiatement.
      setMissions((prev) =>
        prev
          .map((m) => (m.id === missionId ? optimistic(m) : m))
          .filter((m): m is MissionListItem => m !== null),
      );
      try {
        if (op === 'pause') await missionApi.pauseMission(missionId);
        else if (op === 'resume') await missionApi.resumeMission(missionId);
        else if (op === 'cancel') await missionApi.cancelMission(missionId);
        else await missionApi.deleteMission(missionId);
      } finally {
        // Resynchronise avec l'état serveur (succès comme échec).
        await loadMissions();
        if (op === 'delete' && selectedIdRef.current === missionId) {
          setSelectedId(null);
          setTimeline(null);
        }
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(missionId);
          return next;
        });
      }
    },
    [loadMissions],
  );

  useEffect(() => { void loadMissions(); }, [loadMissions]);
  useEffect(() => { if (selectedId) void loadTimeline(selectedId); }, [selectedId, loadTimeline]);

  // Live refresh: when the selected mission emits an event, reload its timeline.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { missionId?: string } | undefined;
      if (!detail?.missionId) return;
      void loadMissions();
      if (detail.missionId === selectedIdRef.current) void loadTimeline(detail.missionId);
    };
    window.addEventListener('Leanna-mission-event', handler);
    return () => window.removeEventListener('Leanna-mission-event', handler);
  }, [loadMissions, loadTimeline]);

  const selectedEvent = timeline && selectedStep !== null ? timeline.events[selectedStep] : null;

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      <ViewHeader
        title="Mission Timeline"
        icon={History}
        description="Parcours chronologique d'une mission — clique une étape pour inspecter décision, outil et résultat"
        badge="Time Travel"
        actions={
          <button
            type="button"
            onClick={() => { void loadMissions(); if (selectedId) void loadTimeline(selectedId); }}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-60"
            style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Actualiser
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-6xl gap-4 px-4 py-4 lg:px-6">

          {/* Left — mission picker */}
          <aside className="flex w-56 flex-shrink-0 flex-col gap-1.5 overflow-y-auto" aria-label="Liste des missions">
            {missions.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Aucune mission. Lancez une mission pour voir sa timeline.</p>
            ) : missions.map((m) => (
              <MissionPickerItem
                key={m.id}
                mission={m}
                active={m.id === selectedId}
                busy={busyIds.has(m.id)}
                onSelect={() => setSelectedId(m.id)}
                onAction={runMissionAction}
              />
            ))}
          </aside>

          {/* Middle — timeline */}
          <section className="min-w-0 flex-1 overflow-y-auto rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
            {loading && !timeline ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Reconstruction de la timeline…</p>
            ) : timeline && timeline.events.length > 0 ? (
              <ol className="relative flex flex-col gap-0.5">
                {timeline.events.map((ev, i) => {
                  const meta = EVENT_META[ev.type] ?? EVENT_META.action;
                  const Icon = meta.icon;
                  const active = selectedStep === ev.index;
                  const clickable = !!ev.snapshot;
                  return (
                    <li key={ev.index} className="relative pl-6">
                      {/* connector line */}
                      {i < timeline.events.length - 1 && (
                        <span aria-hidden className="absolute left-[7px] top-5 h-full w-px" style={{ backgroundColor: 'var(--border-base)' }} />
                      )}
                      <span aria-hidden className="absolute left-0 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--bg-panel)' }}>
                        <Icon size={13} style={{ color: meta.color }} />
                      </span>
                      <button
                        type="button"
                        disabled={!clickable}
                        onClick={() => clickable && setSelectedStep(active ? null : ev.index)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:cursor-default"
                        style={{ backgroundColor: active ? 'var(--bg-active)' : 'transparent' }}
                      >
                        <span className="w-14 flex-shrink-0 text-xs tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{timeOf(ev.at)}</span>
                        <span className="truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{ev.label}</span>
                        {clickable && <span className="ml-auto flex-shrink-0 text-xs" style={{ color: 'var(--text-dimmed)' }}>détails</span>}
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Sélectionnez une mission pour afficher sa timeline.</p>
            )}
          </section>

          {/* Right — step detail */}
          <aside className="w-80 flex-shrink-0 overflow-y-auto rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }} aria-label="Détail de l'étape">
            {selectedEvent ? (
              <StepDetail event={selectedEvent} reduceMotion={!!reduceMotion} />
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Clique une étape de la timeline pour « revenir » à cet instant : décision, outil, arguments, résultat et raisonnement.</p>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

// ─── Mission picker item + contextual controls ──────────────────────────────

/** Petit bouton d'action de pilotage (pause/reprise/annulation/suppression). */
function ControlButton({ title, icon: Icon, tone, disabled, onClick }: {
  title: string;
  icon: React.FC<{ size?: number; style?: React.CSSProperties }>;
  tone: 'neutral' | 'danger';
  disabled: boolean;
  onClick: () => void;
}) {
  const color = tone === 'danger' ? 'var(--color-error)' : 'var(--accent-secondary)';
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-40"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 22%, transparent)` }}
    >
      <Icon size={12} />
    </button>
  );
}

function MissionPickerItem({ mission, active, busy, onSelect, onAction }: {
  mission: MissionListItem;
  active: boolean;
  busy: boolean;
  onSelect: () => void;
  onAction: (
    id: string,
    op: 'pause' | 'resume' | 'cancel' | 'delete',
    optimistic: (m: MissionListItem) => MissionListItem | null,
  ) => void;
}) {
  const terminal = TERMINAL_STATUSES.has(mission.status);
  const statusLabel = mission.paused && !terminal ? 'en pause' : mission.status;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      className="cursor-pointer rounded-md px-2.5 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
      style={{
        backgroundColor: active ? 'var(--bg-active)' : 'var(--bg-panel)',
        border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-base)'}`,
        color: 'var(--text-primary)',
      }}
    >
      <span className="block truncate font-medium">{mission.title}</span>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="truncate text-xs capitalize" style={{ color: 'var(--text-muted)' }}>
          {busy ? <Loader2 size={11} className="inline animate-spin" /> : statusLabel}
        </span>
        <div className="flex flex-shrink-0 items-center gap-1">
          {terminal ? (
            <ControlButton
              title="Supprimer la mission"
              icon={Trash2}
              tone="danger"
              disabled={busy}
              onClick={() => onAction(mission.id, 'delete', () => null)}
            />
          ) : (
            <>
              {mission.paused ? (
                <ControlButton
                  title="Reprendre"
                  icon={Play}
                  tone="neutral"
                  disabled={busy}
                  onClick={() => onAction(mission.id, 'resume', (m) => ({ ...m, paused: false }))}
                />
              ) : (
                <ControlButton
                  title="Mettre en pause"
                  icon={Pause}
                  tone="neutral"
                  disabled={busy}
                  onClick={() => onAction(mission.id, 'pause', (m) => ({ ...m, paused: true }))}
                />
              )}
              <ControlButton
                title="Annuler la mission"
                icon={XCircle}
                tone="danger"
                disabled={busy}
                onClick={() => onAction(mission.id, 'cancel', (m) => ({ ...m, status: 'cancelled', paused: false }))}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StepDetail({ event, reduceMotion }: { event: TimelineEvent; reduceMotion: boolean }) {
  const s = event.snapshot ?? {};
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="mb-2.5">
      <p className="mb-0.5 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-dimmed)' }}>{label}</p>
      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{children}</div>
    </div>
  );
  return (
    <motion.div
      key={event.index}
      initial={reduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.15 }}
    >
      <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{event.label}</h2>
      {s.skillName && <Row label="Outil"><code>{s.skillName}</code>{s.status ? <span className="ml-1" style={{ color: 'var(--text-muted)' }}>({s.status})</span> : null}</Row>}
      {typeof s.confidence === 'number' && <Row label="Confiance">{Math.round(s.confidence * 100)}%</Row>}
      {s.decision && <Row label="Décision">{s.decision}</Row>}
      {s.rationale && <Row label="Justification">{s.rationale}</Row>}
      {s.reasoning && <Row label="Raisonnement">{s.reasoning}</Row>}
      {s.observation && <Row label="Observation">{s.observation}</Row>}
      {s.failure && <Row label="Échec"><span style={{ color: 'var(--color-error)' }}>{s.failure}</span></Row>}
      {s.success && <Row label="Succès"><span style={{ color: 'var(--color-success)' }}>{s.success}</span></Row>}
      {s.args && Object.keys(s.args).length > 0 && (
        <Row label="Arguments">
          <pre className="overflow-x-auto rounded-md p-2 text-xs" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
            {JSON.stringify(s.args, null, 2)}
          </pre>
        </Row>
      )}
      {s.result !== undefined && s.result !== null && (
        <Row label="Résultat">
          <pre className="max-h-40 overflow-auto rounded-md p-2 text-xs" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
            {typeof s.result === 'string' ? s.result : JSON.stringify(s.result, null, 2)}
          </pre>
        </Row>
      )}
    </motion.div>
  );
}
