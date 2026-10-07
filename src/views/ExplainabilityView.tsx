import { useCallback, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  HelpCircle, Loader2, Lightbulb, CheckCircle2, AlertTriangle, ListOrdered, Target,
} from 'lucide-react';
import { ViewHeader } from '../components/ui/ViewHeader.js';

// ─── Types mirrored from POST /api/knowledge/explain ─────────────────────────

type FactorTone = 'positive' | 'warning' | 'neutral';
interface Factor { label: string; detail: string; tone: FactorTone }
interface Prediction {
  successPercent: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendedStrategy: string[];
  playbookId?: string;
  risks: string[];
  confidence: number;
  weakestStep?: { skillName: string; failureRisk: number };
}
interface ExplainResponse {
  factors: Factor[];
  prediction: Prediction;
}

function toneColor(tone: FactorTone): string {
  return tone === 'positive' ? 'var(--color-success)' : tone === 'warning' ? 'var(--color-warning)' : 'var(--color-info)';
}
function riskColor(level: Prediction['riskLevel']): string {
  switch (level) {
    case 'critical': return 'var(--color-error)';
    case 'high': return 'var(--color-warning)';
    case 'medium': return 'var(--color-info)';
    default: return 'var(--color-success)';
  }
}

export default function ExplainabilityView() {
  const reduceMotion = useReducedMotion();
  const [objective, setObjective] = useState('');
  const [data, setData] = useState<ExplainResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const explain = useCallback(async () => {
    if (!objective.trim()) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch('/api/knowledge/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective: objective.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) { setError(json?.error ?? "Échec de l'explication."); return; }
      setData({ factors: json.factors ?? [], prediction: json.prediction });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [objective]);

  const p = data?.prediction;

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      <ViewHeader
        title="Explainability — Pourquoi ?"
        icon={HelpCircle}
        description="Les facteurs décisionnels derrière les choix de Leanna : probabilité, stratégie, historique, risques"
        badge="Décision"
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">

          {/* Objective input */}
          <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
            <label htmlFor="explain-objective" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-dimmed)' }}>Objectif à expliquer</label>
            <textarea
              id="explain-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Ex : Corriger les erreurs TypeScript du module auth"
              rows={2}
              className="w-full resize-none rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-base)' }}
            />
            <div className="mt-3 flex items-center justify-end">
              <button
                type="button"
                onClick={() => void explain()}
                disabled={loading || !objective.trim()}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--bg-base)' }}
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <HelpCircle size={13} />}
                Expliquer
              </button>
            </div>
          </section>

          {error && (
            <div className="flex items-center gap-2 rounded-md p-3 text-xs" style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {data && p && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
              className="flex flex-col gap-4"
            >
              {/* Success probability + risk */}
              <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
                <div className="flex items-center gap-4">
                  <div className="text-2xl font-bold" style={{ color: p.successPercent >= 70 ? 'var(--color-success)' : p.successPercent >= 50 ? 'var(--color-info)' : 'var(--color-error)' }}>
                    {p.successPercent}<span className="text-sm" style={{ color: 'var(--text-dimmed)' }}>%</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Probabilité de réussite estimée</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Confiance {Math.round(p.confidence * 100)}% · risque <span style={{ color: riskColor(p.riskLevel) }}>{p.riskLevel}</span></p>
                  </div>
                </div>
              </section>

              {/* Decision factors — the "pourquoi" */}
              <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
                <h2 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-dimmed)' }}>
                  <Lightbulb size={12} style={{ color: 'var(--accent-primary)' }} /> Facteurs décisionnels
                </h2>
                {data.factors.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Aucun facteur distinctif — décision basée sur l'estimation standard.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {data.factors.map((f, i) => {
                      const Icon = f.tone === 'warning' ? AlertTriangle : CheckCircle2;
                      const color = toneColor(f.tone);
                      return (
                        <li key={i} className="flex items-start gap-2">
                          <Icon size={14} style={{ color, marginTop: 1 }} />
                          <div className="min-w-0">
                            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{f.label}</span>
                            <span className="ml-1 text-xs" style={{ color: 'var(--text-muted)' }}>— {f.detail}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* Recommended strategy */}
              {p.recommendedStrategy.length > 0 && (
                <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
                  <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-dimmed)' }}>
                    <ListOrdered size={12} style={{ color: 'var(--accent-primary)' }} /> Stratégie recommandée{p.playbookId ? ` (${p.playbookId})` : ''}
                  </h2>
                  <ol className="flex flex-col gap-1">
                    {p.recommendedStrategy.map((step, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-xs font-semibold" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}>{i + 1}</span>
                        <code>{step}</code>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {/* Weakest step */}
              {p.weakestStep && (
                <div className="flex items-center gap-2 rounded-md px-3 py-2 text-xs" style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}>
                  <Target size={14} /> Étape la plus fragile : <code>{p.weakestStep.skillName}</code> ({Math.round(p.weakestStep.failureRisk * 100)}% de risque) — à adapter avant exécution.
                </div>
              )}

              {/* Risks */}
              {p.risks.length > 0 && (
                <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-dimmed)' }}>Risques identifiés</h2>
                  <ul className="flex flex-col gap-1">
                    {p.risks.map((r, i) => (
                      <li key={i} className="text-xs" style={{ color: 'var(--text-secondary)' }}>{r}</li>
                    ))}
                  </ul>
                </section>
              )}

              <p className="text-xs italic" style={{ color: 'var(--text-dimmed)' }}>
                Facteurs décisionnels exploitables — pas le raisonnement interne du modèle.
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
