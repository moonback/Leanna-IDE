import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Pause, Check, X, Clock, Zap } from 'lucide-react';
import { Modal } from './ui/Modal.js';
import { Button } from './ui/Button.js';
import { usePendingApprovals, clearPendingApproval } from '../hooks/usePendingApprovals.js';
import { skillLabel } from '../utils/skillLabels.js';

/**
 * MissionApprovalModal — Modale globale pour les demandes d'approbation des missions.
 * Affiche la plus ancienne demande en attente ; les suivantes s'enchaînent une fois
 * la première résolue. Sans réponse, le serveur applique le refus « fail-closed ».
 */
export function MissionApprovalModal() {
  const approvals = usePendingApprovals();
  const approval = approvals[0] ?? null;
  const [resolving, setResolving] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!approval) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [approval]);

  const respond = useCallback(async (approved: boolean) => {
    if (!approval) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/missions/${approval.missionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: approval.actionId, approved }),
      });
      // Qu'elle réussisse ou ait expiré côté serveur, on retire la demande localement.
      if (res.ok || res.status === 404) clearPendingApproval(approval.actionId);
    } catch (err) {
      console.error('[MissionApprovalModal] Échec de résolution d\'approbation:', err);
    } finally {
      setResolving(false);
    }
  }, [approval]);

  const totalMs = approval ? Math.max(1, approval.expiresAt - approval.requestedAt) : 1;
  const remainingMs = approval ? Math.max(0, approval.expiresAt - now) : 0;
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const progressPct = Math.min(100, Math.round((remainingMs / totalMs) * 100));
  const timerColor = secondsLeft <= 10 ? 'var(--color-error)' : 'var(--color-warning)';
  const argsPreview = approval?.args && Object.keys(approval.args).length > 0
    ? JSON.stringify(approval.args, null, 2)
    : null;

  return (
    <Modal
      open={approval !== null}
      onClose={() => respond(false)}
      size="sm"
      tone="warning"
      layer="critical"
      disableBackdropClick
    >
      <Modal.Header>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--color-warning-subtle)' }}
          >
            <Pause className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Approbation requise
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Une mission attend votre validation
              {approvals.length > 1 && ` · ${approvals.length - 1} autre(s) en attente`}
            </p>
          </div>
        </div>
      </Modal.Header>

      <Modal.Body>
        {approval && (
          <div className="space-y-4">
            <div
              className="rounded-xl p-4 space-y-2"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Action</span>
                <span
                  className="text-xs font-semibold rounded-lg px-2 py-0.5 flex items-center gap-1"
                  style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}
                  title={approval.skill}
                >
                  <Zap className="w-3 h-3" /> {skillLabel(approval.skill)}
                </span>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{approval.reason}</p>
              {argsPreview && (
                <pre
                  className="text-xs font-mono max-h-40 overflow-auto whitespace-pre-wrap break-all opacity-80"
                  style={{ color: 'var(--text-dimmed)' }}
                >
                  {argsPreview}
                </pre>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: timerColor }} />
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: timerColor }}
                  initial={false}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.5, ease: 'linear' }}
                />
              </div>
              <span className="text-sm font-mono min-w-[2.5rem] text-right tabular-nums" style={{ color: timerColor }}>
                {secondsLeft}s
              </span>
            </div>

            <p className="text-xs text-center" style={{ color: 'var(--text-dimmed)' }}>
              Sans réponse, l'action sera automatiquement refusée.
            </p>
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" size="sm" disabled={resolving} onClick={() => respond(false)}>
          <X className="w-3.5 h-3.5" />
          Refuser
        </Button>
        <Button
          size="sm"
          disabled={resolving}
          onClick={() => respond(true)}
          style={{ backgroundColor: 'var(--color-warning)', color: 'white' } as React.CSSProperties}
        >
          <Check className="w-3.5 h-3.5" />
          Approuver
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
