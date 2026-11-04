import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, Check, Clock3, Loader2, Pause, Play, RefreshCw, ShieldAlert, X, XCircle } from 'lucide-react';
import { useConfirm } from '../ui/ConfirmDialog.js';

type MissionStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked' | 'paused' | 'cancelled' | 'incomplete';
interface MissionItem {
  id: string;
  title: string;
  description?: string;
  status: MissionStatus;
  priority: string;
  createdAt: string;
  updatedAt?: string;
  metrics?: { totalActions: number; successfulActions: number; failedActions: number };
  lastError?: { action: string; error?: string };
  errorCount?: number;
}
interface ApprovalItem {
  actionId: string;
  missionId: string;
  goalId: string;
  skill: string;
  args: Record<string, unknown>;
  reason: string;
  requestedAt: string;
  timeoutAt: string;
}
interface ResumeItem {
  missionId: string;
  title: string;
  priority: string;
  status: string;
  updatedAt: string;
}

const LIVE = new Set<MissionStatus>(['pending', 'in_progress', 'paused', 'blocked']);

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'En attente', in_progress: 'En cours', paused: 'En pause',
    blocked: 'Bloquée', completed: 'Terminée', failed: 'Échouée',
    cancelled: 'Annulée', incomplete: 'Incomplète',
  };
  return labels[status] ?? 'État inconnu';
}
function statusColor(status: string): string {
  if (status === 'completed') return 'var(--color-success)';
  if (status === 'failed' || status === 'incomplete') return 'var(--color-error)';
  if (status === 'blocked' || status === 'paused') return 'var(--color-warning)';
  if (status === 'in_progress') return 'var(--accent-secondary)';
  return 'var(--text-muted)';
}
function safeArgs(args: Record<string, unknown>): string {
  try {
    const text = JSON.stringify(args, null, 2);
    return text.length > 900 ? text.slice(0, 900) + '…' : text;
  } catch {
    return '[Arguments non sérialisables]';
  }
}

export default function MissionOperationsPanel() {
  const [missions, setMissions] = useState<MissionItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm } = useConfirm();

  const refresh = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const [missionRes, approvalRes, resumeRes] = await Promise.all([
        fetch('/api/missions'),
        fetch('/api/missions/pending-approvals'),
        fetch('/api/missions/pending-resumes'),
      ]);
      const [missionData, approvalData, resumeData] = await Promise.all([
        missionRes.json().catch(() => ({})),
        approvalRes.json().catch(() => ({})),
        resumeRes.json().catch(() => ({})),
      ]);
      if (!missionRes.ok) throw new Error(missionData?.error ?? `Chargement des missions impossible (${missionRes.status}).`);
      if (!approvalRes.ok) throw new Error(approvalData?.error ?? `Chargement des approbations impossible (${approvalRes.status}).`);
      if (!resumeRes.ok) throw new Error(resumeData?.error ?? `Chargement des reprises impossible (${resumeRes.status}).`);
      setMissions(Array.isArray(missionData.missions) ? missionData.missions : []);
      setApprovals(Array.isArray(approvalData.pending) ? approvalData.pending.filter((item: unknown): item is ApprovalItem => !!item && typeof item === 'object') : []);
      setResumes(Array.isArray(resumeData.pending) ? resumeData.pending : []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(true); }, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const liveMissions = useMemo(() => missions.filter((mission) => LIVE.has(mission.status)), [missions]);
  const completedCount = missions.filter((mission) => mission.status === 'completed').length;
  const failedCount = missions.filter((mission) => mission.status === 'failed' || mission.status === 'incomplete').length;

  const control = useCallback(async (missionId: string, action: 'pause' | 'resume' | 'cancel') => {
    if (action === 'cancel') {
      const ok = await confirm({
        title: 'Annuler cette mission ?',
        message: 'L’exécution sera interrompue. Les modifications déjà effectuées ne sont pas nécessairement annulées.',
        confirmLabel: 'Annuler la mission',
        variant: 'warning',
      });
      if (!ok) return;
    }
    setBusyKey(missionId);
    try {
      const res = await fetch(`/api/missions/${encodeURIComponent(missionId)}/${action}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Action impossible (${res.status}).`);
      await refresh(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyKey(null);
    }
  }, [confirm, refresh]);

  const decideApproval = useCallback(async (item: ApprovalItem, approved: boolean) => {
    const key = `approval:${item.actionId}`;
    setBusyKey(key);
    try {
      const res = await fetch(`/api/missions/${encodeURIComponent(item.missionId)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: item.actionId, approved }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Décision impossible (${res.status}).`);
      await refresh(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyKey(null);
    }
  }, [refresh]);

  const decideResume = useCallback(async (item: ResumeItem, decision: 'reactivate' | 'delete') => {
    if (decision === 'delete') {
      const ok = await confirm({
        title: 'Effacer cette mission interrompue ?',
        message: 'La mission sera supprimée de la file de reprise et ne pourra plus être réactivée depuis cette interface.',
        confirmLabel: 'Effacer définitivement',
        variant: 'danger',
      });
      if (!ok) return;
    }
    const key = `resume:${item.missionId}`;
    setBusyKey(key);
    try {
      const res = await fetch(`/api/missions/${encodeURIComponent(item.missionId)}/resume-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Décision impossible (${res.status}).`);
      await refresh(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyKey(null);
    }
  }, [confirm, refresh]);

  return (
    <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }} aria-labelledby="mission-operations-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity size={15} style={{ color: 'var(--accent-primary)' }} />
          <h2 id="mission-operations-title" className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-primary)' }}>Centre opérationnel des missions</h2>
        </div>
        <button type="button" onClick={() => void refresh(true)} disabled={refreshing} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-60" style={{ borderColor: 'var(--border-base)', color: 'var(--text-secondary)' }}>
          {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Actualiser
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Actives" value={liveMissions.length} />
        <Metric label="À approuver" value={approvals.length} />
        <Metric label="À reprendre" value={resumes.length} />
        <Metric label="Terminées / échouées" value={`${completedCount} / ${failedCount}`} />
      </div>

      {error && <p role="alert" className="mb-3 rounded-md border px-3 py-2 text-xs" style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}>{error}</p>}
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-xs" style={{ color: 'var(--text-muted)' }}><Loader2 size={14} className="animate-spin" /> Chargement des missions…</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Exécutions actives</h3>
            {liveMissions.length === 0 ? <Empty> Aucune mission active.</Empty> : liveMissions.map((mission) => (
              <article key={mission.id} className="rounded-md border p-3" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-base)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{mission.title}</p>
                    <p className="mt-1 text-[11px]" style={{ color: statusColor(mission.status) }}>{statusLabel(mission.status)} · priorité {mission.priority}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    {mission.status === 'paused'
                      ? <SmallButton label="Reprendre" disabled={busyKey === mission.id} onClick={() => void control(mission.id, 'resume')}><Play size={12} /></SmallButton>
                      : <SmallButton label="Pause" disabled={busyKey === mission.id || mission.status === 'blocked'} onClick={() => void control(mission.id, 'pause')}><Pause size={12} /></SmallButton>}
                    <SmallButton label="Annuler" danger disabled={busyKey === mission.id} onClick={() => void control(mission.id, 'cancel')}><XCircle size={12} /></SmallButton>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  <span>{mission.metrics?.totalActions ?? 0} action(s)</span>
                  <span>{mission.metrics?.successfulActions ?? 0} réussie(s)</span>
                  <span>{mission.errorCount ?? 0} erreur(s)</span>
                  <span>{new Date(mission.createdAt).toLocaleString()}</span>
                </div>
                {mission.lastError?.error && <p className="mt-2 text-xs" style={{ color: 'var(--color-error)' }}>{mission.lastError.error}</p>}
              </article>
            ))}
          </div>

          <div className="space-y-4">
            <section className="space-y-2" aria-labelledby="mission-approvals-title">
              <h3 id="mission-approvals-title" className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}><ShieldAlert size={13} /> Approbations humaines</h3>
              {approvals.length === 0 ? <Empty>Aucune approbation en attente.</Empty> : approvals.map((item) => (
                <article key={item.actionId} className="rounded-md border p-3" style={{ borderColor: 'var(--color-warning)', backgroundColor: 'var(--bg-base)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.skill}</p>
                      <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>Mission {item.missionId.slice(0, 8)} · objectif {item.goalId.slice(0, 8)}</p>
                    </div>
                    <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--color-warning)' }}><Clock3 size={11} /> {new Date(item.timeoutAt).toLocaleTimeString()}</span>
                  </div>
                  {item.reason && <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{item.reason}</p>}
                  <pre className="mt-2 max-h-28 overflow-auto rounded bg-black/5 p-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>{safeArgs(item.args ?? {})}</pre>
                  <div className="mt-2 flex justify-end gap-2">
                    <SmallButton label="Refuser" danger disabled={busyKey === `approval:${item.actionId}`} onClick={() => void decideApproval(item, false)}><X size={12} /></SmallButton>
                    <SmallButton label="Approuver" disabled={busyKey === `approval:${item.actionId}`} onClick={() => void decideApproval(item, true)}><Check size={12} /></SmallButton>
                  </div>
                </article>
              ))}
            </section>

            <section className="space-y-2" aria-labelledby="mission-resumes-title">
              <h3 id="mission-resumes-title" className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Missions interrompues</h3>
              {resumes.length === 0 ? <Empty>Aucune mission à reprendre.</Empty> : resumes.map((item) => (
                <article key={item.missionId} className="rounded-md border p-3" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-base)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.title}</p>
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>État précédent : {statusLabel(item.status)} · {new Date(item.updatedAt).toLocaleString()}</p>
                  <div className="mt-2 flex justify-end gap-2">
                    <SmallButton label="Effacer" danger disabled={busyKey === `resume:${item.missionId}`} onClick={() => void decideResume(item, 'delete')}><X size={12} /></SmallButton>
                    <SmallButton label="Réactiver" disabled={busyKey === `resume:${item.missionId}`} onClick={() => void decideResume(item, 'reactivate')}><Play size={12} /></SmallButton>
                  </div>
                </article>
              ))}
            </section>
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-md px-3 py-2" style={{ backgroundColor: 'var(--bg-base)' }}><p className="text-lg font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}</p><p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</p></div>;
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed px-3 py-4 text-xs" style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}>{children}</p>;
}
function SmallButton({ children, label, disabled, danger, onClick }: { children: ReactNode; label: string; disabled?: boolean; danger?: boolean; onClick: () => void }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-50" style={{ borderColor: danger ? 'var(--color-error)' : 'var(--border-base)', color: danger ? 'var(--color-error)' : 'var(--text-secondary)' }}>{children}<span>{label}</span></button>;
}
