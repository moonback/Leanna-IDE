import { useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, Plus, Shield, Trash2 } from 'lucide-react';
import { useToast } from '../ui/Toast.js';
import type { BudgetConfig, BudgetStatus } from './types.js';
import { fmt, fmtCost } from './format.js';

// ═══════════════════════════════════════════════════════════════════════════════
// BudgetPanel — configuration et vérification des plafonds (tokens / coût) par
// mission, avec arrêt automatique au dépassement côté runtime.
// ═══════════════════════════════════════════════════════════════════════════════

export function BudgetPanel() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [missionId, setMissionId] = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [maxCostUsd, setMaxCostUsd] = useState('');
  const [checking, setChecking] = useState('');
  const [status, setStatus] = useState<{ missionId: string; budget: BudgetStatus } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSetBudget = useCallback(async () => {
    if (!missionId.trim()) return;
    const body: BudgetConfig = {};
    if (maxTokens) body.maxTokens = parseInt(maxTokens, 10);
    if (maxCostUsd) body.maxCostUsd = parseFloat(maxCostUsd);
    if (!body.maxTokens && !body.maxCostUsd) {
      toastError('Fournissez au moins une limite (tokens ou coût).');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/observability/budget/${missionId.trim()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toastSuccess('Budget configuré avec succès.');
        setMissionId('');
        setMaxTokens('');
        setMaxCostUsd('');
      } else {
        toastError(data.error || 'Erreur lors de la configuration du budget.');
      }
    } catch {
      toastError('Erreur réseau.');
    } finally {
      setSaving(false);
    }
  }, [missionId, maxTokens, maxCostUsd, toastSuccess, toastError]);

  const handleCheck = useCallback(async () => {
    if (!checking.trim()) return;
    try {
      const res = await fetch(`/api/observability/budget/${checking.trim()}`);
      const data = await res.json();
      if (data.success) setStatus(data);
      else toastError(data.error || 'Mission introuvable.');
    } catch {
      toastError('Erreur réseau.');
    }
  }, [checking, toastError]);

  const handleClear = useCallback(async (mid: string) => {
    try {
      await fetch(`/api/observability/budget/${mid}`, { method: 'DELETE' });
      setStatus(null);
      toastSuccess('Budget supprimé.');
    } catch {
      toastError('Erreur réseau.');
    }
  }, [toastSuccess, toastError]);

  return (
    <div className="rounded-xl border p-4 flex flex-col gap-4" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}>
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4" style={{ color: 'var(--accent-secondary)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Budget Guardrails</span>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-secondary)' }}>
          Arrêt automatique au dépassement
        </span>
      </div>

      {/* Configurer un budget */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Configurer un plafond de mission</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            value={missionId}
            onChange={e => setMissionId(e.target.value)}
            placeholder="ID de mission"
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
          />
          <input
            value={maxTokens}
            onChange={e => setMaxTokens(e.target.value)}
            placeholder="Max tokens (ex: 100000)"
            type="number"
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
          />
          <input
            value={maxCostUsd}
            onChange={e => setMaxCostUsd(e.target.value)}
            placeholder="Max coût USD (ex: 1.50)"
            type="number"
            step="0.01"
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
          />
        </div>
        <button
          onClick={handleSetBudget}
          disabled={saving || !missionId.trim()}
          className="self-start flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent-secondary)', color: 'var(--bg-base)' }}
        >
          <Plus className="h-3.5 w-3.5" />
          {saving ? 'Enregistrement…' : 'Appliquer le budget'}
        </button>
      </div>

      {/* Vérifier un budget */}
      <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--border-base)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Vérifier le statut d'un budget</span>
        <div className="flex gap-2">
          <input
            value={checking}
            onChange={e => setChecking(e.target.value)}
            placeholder="ID de mission"
            className="flex-1 rounded-lg border px-3 py-1.5 text-xs"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
          />
          <button
            onClick={handleCheck}
            disabled={!checking.trim()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-50"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-base)' }}
          >
            Vérifier
          </button>
        </div>

        {status && (
          <div
            className="rounded-lg border p-3 flex flex-col gap-1.5"
            style={{
              borderColor: status.budget.exceeded ? 'var(--color-red-500, #ef4444)' : 'var(--border-base)',
              backgroundColor: status.budget.exceeded ? 'rgba(239,68,68,0.07)' : 'var(--bg-secondary)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {status.budget.exceeded
                  ? <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  Mission: {status.missionId.slice(0, 12)}…
                </span>
              </div>
              <button onClick={() => handleClear(status.missionId)} title="Supprimer le budget">
                <Trash2 className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            <div className="text-xs grid grid-cols-2 gap-1" style={{ color: 'var(--text-muted)' }}>
              <span>Tokens consommés : <strong style={{ color: 'var(--text-primary)' }}>{fmt(status.budget.tokensUsed)}</strong></span>
              <span>Coût : <strong style={{ color: 'var(--accent-secondary)' }}>{fmtCost(status.budget.costUsd)}</strong></span>
            </div>
            {status.budget.exceeded && status.budget.reason && (
              <span className="text-xs text-red-400">{status.budget.reason}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
