import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Check, RefreshCw, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { useToast } from '../ui/Toast.js';
import { Field, Section } from './SettingsPrimitives.js';

interface Metric {
  toolName: string;
  calls: number;
  failures: number;
  successRate: number;
  averageDurationMs: number;
  feedback: { correct: number; incorrect: number; needsImprovement: number };
}

interface Proposal {
  id: string;
  toolName: string;
  status: 'proposed' | 'approved' | 'rejected';
  hypothesis: string;
  evidence: Record<string, unknown>;
  expectedMetric: string;
  confidence: number;
}

interface Revision {
  id: string;
  skillId: string;
  skillName: string;
  createdAt: string;
  rolledBackAt?: string;
}

interface CustomSkill {
  id: string;
  name: string;
  updated_at: string;
}

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? 'Requête impossible.');
  return body as T;
}

export function SkillTuningSection() {
  const { success, error: toastError } = useToast();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [skills, setSkills] = useState<CustomSkill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState('');
  const [updates, setUpdates] = useState('{\n  "instruction": ""\n}');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [metricsResponse, proposalsResponse, revisionsResponse, skillsResponse] = await Promise.all([
        requestJson<{ metrics: Metric[] }>('/api/skill-tuning/metrics?limit=100'),
        requestJson<{ proposals: Proposal[] }>('/api/skill-tuning/proposals?limit=100'),
        requestJson<{ revisions: Revision[] }>('/api/skill-tuning/revisions'),
        requestJson<{ skills: CustomSkill[] }>('/api/custom-skills', { method: 'POST', body: JSON.stringify({ action: 'list' }) }),
      ]);
      setMetrics(metricsResponse.metrics ?? []);
      setProposals(proposalsResponse.proposals ?? []);
      setRevisions(revisionsResponse.revisions ?? []);
      setSkills(skillsResponse.skills ?? []);
      setSelectedSkill(current => current || skillsResponse.skills?.[0]?.id || '');
    } catch (loadError: any) {
      toastError(loadError.message);
    } finally {
      setBusy(false);
    }
  }, [toastError]);

  useEffect(() => { void load(); }, [load]);

  const reviewProposal = async (proposalId: string, status: 'approved' | 'rejected') => {
    try {
      await requestJson(`/api/skill-tuning/proposals/${proposalId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setProposals(current => current.map(proposal => proposal.id === proposalId ? { ...proposal, status } : proposal));
      success(status === 'approved' ? 'Proposition approuvée.' : 'Proposition rejetée.');
    } catch (reviewError: any) { toastError(reviewError.message); }
  };

  const applyProposal = async (proposalId: string) => {
    if (!selectedSkill) return toastError('Sélectionnez un custom skill.');
    try {
      const parsedUpdates = JSON.parse(updates);
      await requestJson(`/api/skill-tuning/proposals/${proposalId}/apply`, {
        method: 'POST',
        body: JSON.stringify({ skillId: selectedSkill, updates: parsedUpdates }),
      });
      success('Modification appliquée avec snapshot.');
      await load();
    } catch (applyError: any) { toastError(applyError.message); }
  };

  const rollback = async (revisionId: string) => {
    try {
      await requestJson(`/api/skill-tuning/revisions/${revisionId}/rollback`, { method: 'POST' });
      success('Révision restaurée.');
      await load();
    } catch (rollbackError: any) { toastError(rollbackError.message); }
  };

  return (
    <Section icon={BarChart3} title="Tuning des skills" description="Analysez les interactions et contrôlez les améliorations proposées." badge={`${proposals.filter(p => p.status === 'proposed').length} à revoir`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Aucune modification n'est appliquée sans approbation.</p>
        <button type="button" onClick={() => void load()} disabled={busy} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}>
          <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} /> Actualiser
        </button>
      </div>

      <Field label="Performance observée">
        <div className="grid gap-2 sm:grid-cols-2">
          {metrics.length === 0 && <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>Aucune interaction persistée.</p>}
          {metrics.map(metric => (
            <div key={metric.toolName} className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}>
              <div className="flex items-center justify-between gap-2"><strong className="truncate text-xs" style={{ color: 'var(--text-primary)' }}>{metric.toolName}</strong><span className="font-mono text-xs" style={{ color: metric.successRate < 0.8 ? 'var(--color-warning)' : 'var(--color-success)' }}>{Math.round(metric.successRate * 100)}%</span></div>
              <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>{metric.calls} appels · {metric.failures} échecs · {metric.averageDurationMs} ms</p>
            </div>
          ))}
        </div>
      </Field>

      <Field label="Propositions">
        <div className="space-y-2">
          {proposals.length === 0 && <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>Aucune proposition disponible.</p>}
          {proposals.map(proposal => (
            <div key={proposal.id} className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}>
              <div className="flex items-start justify-between gap-3"><div><strong className="text-xs" style={{ color: 'var(--text-primary)' }}>{proposal.toolName}</strong><p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>{proposal.hypothesis}</p></div><span className="rounded px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-secondary)' }}>{Math.round(proposal.confidence * 100)}%</span></div>
              <p className="mt-2 text-[11px]" style={{ color: 'var(--text-dimmed)' }}>{proposal.expectedMetric}</p>
              {proposal.status === 'proposed' && <div className="mt-3 flex gap-2"><button type="button" onClick={() => void reviewProposal(proposal.id, 'approved')} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px]" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}><Check className="h-3 w-3" /> Approuver</button><button type="button" onClick={() => void reviewProposal(proposal.id, 'rejected')} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px]" style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}><X className="h-3 w-3" /> Rejeter</button></div>}
              {proposal.status === 'approved' && <div className="mt-3 space-y-2"><select value={selectedSkill} onChange={event => setSelectedSkill(event.target.value)} className="w-full rounded-lg border px-2 py-1.5 text-xs" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', borderColor: 'var(--border-base)' }}><option value="">Choisir le custom skill</option>{skills.map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select><textarea value={updates} onChange={event => setUpdates(event.target.value)} rows={4} className="w-full rounded-lg border p-2 font-mono text-[11px]" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', borderColor: 'var(--border-base)' }} /><button type="button" onClick={() => void applyProposal(proposal.id)} className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold" style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}>Appliquer avec snapshot</button></div>}
            </div>
          ))}
        </div>
      </Field>

      <Field label="Révisions restaurables">
        <div className="space-y-2">{revisions.filter(revision => !revision.rolledBackAt).map(revision => <div key={revision.id} className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}><div className="min-w-0"><strong className="block truncate text-xs" style={{ color: 'var(--text-primary)' }}>{revision.skillName}</strong><span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{new Date(revision.createdAt).toLocaleString('fr-FR')}</span></div><button type="button" onClick={() => void rollback(revision.id)} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px]" style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}><RotateCcw className="h-3 w-3" /> Restaurer</button></div>)}{revisions.length === 0 && <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>Aucune révision disponible.</p>}</div>
      </Field>

      <div className="flex items-start gap-2 rounded-xl p-3" style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p className="text-[11px]">Les instructions custom restent du contenu utilisateur non fiable. Vérifiez toujours le diff et les tests avant activation.</p></div>
    </Section>
  );
}