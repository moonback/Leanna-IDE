import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  CheckCircle2, AlertCircle, Loader2, ChevronDown, X, Clock,
} from 'lucide-react';
// (icône Filter non utilisée : les chips suffisent visuellement)
import type { ActivityStep, ReasoningState } from '../../hooks/useLiveAPI.js';
import { type Phase, PHASE_ORDER, toolToPhase } from './activityPhases.js';
import {
  type ToolCategory, CatIcon, CAT_COLOR, CAT_LABEL,
  getCat, toolLabel, msElapsed, formatMs,
} from './activityTools.js';
import { StepRow, PhaseSection, FilterChip } from './TimelineSteps.js';
import { ReasoningPanel } from './ReasoningPanel.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentProgressBarProps {
  steps: ActivityStep[];
  connected: boolean;
  onClear?: () => void;
  reasoning?: ReasoningState;
}

// ─── Main component ───────────────────────────────────────────────────────────

type StepFilter = 'all' | 'errors' | ToolCategory;

export function AgentProgressBar({ steps, connected, onClear, reasoning }: AgentProgressBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StepFilter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyFailedId, setCopyFailedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Horloge vivante : incrémentée à chaque tick pendant l'exécution. Sert de
  // dépendance aux durées « en cours » pour qu'elles se rafraîchissent réellement.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReducedMotion();

  const runningStep = useMemo(() => [...steps].reverse().find(s => s.status === 'running'), [steps]);
  const isWorking   = !!runningStep;
  const doneCount   = useMemo(() => steps.filter(s => s.status === 'done').length, [steps]);
  const errorCount  = useMemo(() => steps.filter(s => s.status === 'error').length, [steps]);
  const total       = steps.length;
  const pct         = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Catégories présentes dans les étapes, pour construire les chips de filtre dynamiquement.
  const presentCats = useMemo(() => {
    const set = new Set<ToolCategory>();
    for (const s of steps) set.add(getCat(s.tool));
    return [...set];
  }, [steps]);

  const visibleSteps = useMemo(() => {
    if (filter === 'all') return steps;
    if (filter === 'errors') return steps.filter(s => s.status === 'error');
    return steps.filter(s => getCat(s.tool) === filter);
  }, [steps, filter]);

  // Regroupement par phase du cycle agentique, pour la vue « Tout ».
  const phaseGroups = useMemo(() => {
    const grouped: Record<Phase, ActivityStep[]> = { planning: [], writing: [], verification: [] };
    for (const s of steps) grouped[toolToPhase(s.tool)].push(s);
    return grouped;
  }, [steps]);

  // Revenir à "Tout" si le filtre actif ne correspond plus à aucune étape.
  useEffect(() => {
    if (filter === 'all') return;
    if (filter === 'errors' && errorCount === 0) setFilter('all');
    else if (filter !== 'errors' && !presentCats.includes(filter)) setFilter('all');
  }, [filter, errorCount, presentCats]);

  const copyDetail = useCallback(async (step: ActivityStep) => {
    const text = step.detail ?? step.label;
    const flash = (ok: boolean) => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (ok) { setCopiedId(step.id); setCopyFailedId(null); }
      else { setCopyFailedId(step.id); setCopiedId(null); }
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedId(c => (c === step.id ? null : c));
        setCopyFailedId(c => (c === step.id ? null : c));
        copyTimeoutRef.current = null;
      }, 1400);
    };
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(text);
      flash(true);
    } catch {
      flash(false);
    }
  }, []);

  // Nettoie le timeout du retour visuel de copie au démontage.
  useEffect(() => () => {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
  }, []);

  // Dépend de nowTick : pendant l'exécution, le tick (toutes les 500ms) force
  // le recalcul avec l'horloge courante, donc la durée globale avance réellement.
  const totalDur = useMemo(() => {
    if (!steps.length) return '0s';
    const first = new Date(steps[0].timestamp).getTime();
    const end   = isWorking ? nowTick : new Date(steps[steps.length - 1].timestamp).getTime();
    return formatMs(Math.max(0, end - first));
  }, [steps, isWorking, nowTick]);

  // Progression indéterminée : on travaille mais aucune étape n'est encore
  // terminée (ou une seule étape longue tourne). On préfère une barre animée
  // sans valeur plutôt qu'un faux pourcentage immobile.
  const indeterminate = isWorking && doneCount === 0;

  // Nombre d'outils actuellement en cours — alimente le résumé « N outils actifs ».
  const activeCount = useMemo(() => steps.filter(s => s.status === 'running').length, [steps]);

  // Résumé de l'état terminé : « 7 réussies », ou mention des erreurs si présentes.
  const doneSummary = errorCount > 0
    ? `${doneCount} réussie${doneCount > 1 ? 's' : ''} · ${errorCount} échec${errorCount > 1 ? 's' : ''}`
    : `${doneCount} étape${doneCount > 1 ? 's' : ''} terminée${doneCount > 1 ? 's' : ''}`;

  // Critically-damped default spring for state-driven UI (§4 / Quick Reference).
  // Reduced motion gets a short, non-bouncy fade/step instead of a spring.
  const uiSpring = reduceMotion
    ? { duration: 0.12, ease: 'linear' as const }
    : { type: 'spring' as const, bounce: 0, duration: 0.35 };

  const toggleExpand = useCallback(() => setExpanded(v => !v), []);

  useEffect(() => {
    if (expanded && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [steps.length, expanded]);

  // En cas d'erreur, pré-sélectionner la première étape échouée pour qu'elle
  // soit dépliée dès que l'utilisateur ouvre le tiroir — sans forcer l'ouverture,
  // la barre reste réduite par défaut.
  useEffect(() => {
    if (errorCount === 0) return;
    const firstError = steps.find(s => s.status === 'error' && s.detail);
    if (firstError) {
      setExpandedStepId(prev => prev ?? firstError.id);
    }
  }, [errorCount, steps]);

  useEffect(() => {
    if (!isWorking) return;
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(id);
  }, [isWorking]);

  if (!connected || steps.length === 0) return null;

  const accentColor = isWorking ? 'var(--accent-primary)' : errorCount > 0 ? 'var(--color-warning)' : 'var(--color-success)';

  return (
    <div
      className="border-t select-none"
      style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
    >
      {/* ── Splash-style progress bar ── */}
      <div
        className="relative h-[5px] w-full overflow-hidden rounded"
        style={{ backgroundColor: 'color-mix(in srgb, var(--text-primary) 6%, transparent)' }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : pct}
        aria-valuetext={indeterminate ? 'Progression en cours, pourcentage inconnu' : `${pct}%`}
        aria-label="Progression de l'agent"
      >
        {indeterminate ? (
          /* Progression réelle inconnue : barre indéterminée (balayage animé),
             jamais un pourcentage inventé. */
          reduceMotion ? (
            <div
              className="absolute inset-y-0 left-0 rounded"
              style={{ width: '40%', backgroundColor: accentColor, opacity: 0.7 }}
            />
          ) : (
            <motion.div
              className="absolute inset-y-0 rounded"
              style={{ width: '40%', backgroundColor: accentColor }}
              animate={{ left: ['-40%', '100%'] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          )
        ) : (
          <>
            <motion.div
              className="absolute inset-y-0 left-0 rounded"
              style={{ backgroundColor: accentColor }}
              animate={{ width: `${pct}%` }}
              transition={uiSpring}
            />
            {/* Portion d'erreur : segment rouge superposé, proportionnel aux échecs. */}
            {errorCount > 0 && total > 0 && (
              <motion.div
                className="absolute inset-y-0 right-0 rounded"
                style={{ backgroundColor: 'var(--color-error)', opacity: 0.85 }}
                animate={{ width: `${Math.round((errorCount / total) * 100)}%` }}
                transition={uiSpring}
              />
            )}
            {/* Splash-style shimmer sweep, omitted when motion is reduced. */}
            {isWorking && !reduceMotion && (
              <motion.div
                className="absolute inset-y-0 w-1/4"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent)' }}
                animate={{ left: ['-25%', '100%'] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
              />
            )}
          </>
        )}
      </div>

      {/* ── Compact header (single row, ~32px tall) ── */}
      <motion.div
        className="flex items-center gap-2 px-3 min-h-8 py-1 cursor-pointer group"
        onClick={toggleExpand}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(); }}}
        tabIndex={0}
        role="button"
        aria-expanded={expanded}
        aria-label="Historique agent"
        whileTap={reduceMotion ? undefined : { scale: 0.985 }}
        whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
        transition={{ duration: 0.1 }}
      >
        {/* Status dot / spinner */}
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[color-mix(in_srgb,var(--bg-surface)_80%,transparent)] border border-[var(--border-base)] shadow-sm">
          {isWorking ? (
            <Loader2
              className={reduceMotion ? 'flex-shrink-0' : 'animate-spin flex-shrink-0'}
              style={{ width: 12, height: 12, color: 'var(--accent-primary)' }}
            />
          ) : errorCount > 0 ? (
            <AlertCircle style={{ width: 12, height: 12, color: 'var(--color-warning)', flexShrink: 0 }} />
          ) : (
            <CheckCircle2 style={{ width: 12, height: 12, color: 'var(--color-success)', flexShrink: 0 }} />
          )}
        </div>

        {/* Main label — centre d'activité : action + résumé sur deux lignes */}
        <div className="flex-1 min-w-0">
          {isWorking ? (
            <>
              <div className="flex items-center gap-1.5 min-w-0">
                <CatIcon tool={runningStep.tool} size={10} />
                <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {runningStep.label}
                </span>
                <span
                  className="text-xs tracking-wide font-mono px-1 py-px rounded flex-shrink-0"
                  style={{
                    backgroundColor: 'color-mix(in srgb, ' + CAT_COLOR[getCat(runningStep.tool)] + ' 10%, transparent)',
                    color: CAT_COLOR[getCat(runningStep.tool)],
                  }}
                >
                  {toolLabel(runningStep.tool)}
                </span>
              </div>
              {/* Résumé compact : progression + outils actifs. Ex. « 8/14 étapes · 2 outils actifs » */}
              <div className="text-[10px] leading-tight truncate font-mono tabular-nums" style={{ color: 'var(--text-dimmed)' }}>
                {total > 0 && <>{doneCount}/{total} étapes</>}
                {activeCount > 0 && <> · {activeCount} outil{activeCount > 1 ? 's' : ''} actif{activeCount > 1 ? 's' : ''}</>}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-medium truncate" style={{ color: errorCount > 0 ? 'var(--color-warning)' : 'var(--text-secondary)' }}>
                {errorCount > 0 ? 'Terminé avec erreurs' : 'Terminé'}
              </span>
              <span className="text-[10px] truncate font-mono tabular-nums" style={{ color: 'var(--text-dimmed)' }}>
                {doneSummary}
              </span>
            </div>
          )}
        </div>

        {/* Right-side meta */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isWorking && (
            <span className="text-xs tracking-wide tabular-nums font-mono" style={{ color: 'var(--text-dimmed)' }}>
              {msElapsed(runningStep.timestamp)}
            </span>
          )}
          <span
            className="text-xs tracking-wide tabular-nums font-mono px-1.5 py-px rounded"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: errorCount > 0 ? 'var(--color-warning)' : 'var(--text-muted)',
              border: '1px solid var(--border-base)',
            }}
          >
            {doneCount}/{total}
            {errorCount > 0 && <span style={{ color: 'var(--color-error)' }}> ·{errorCount}err</span>}
          </span>
          {!isWorking && (
            <span className="text-xs tracking-wide tabular-nums" style={{ color: 'var(--text-dimmed)' }}>
              {totalDur}
            </span>
          )}
          <ChevronDown
            className="transition-transform duration-150"
            style={{
              width: 12, height: 12,
              color: 'var(--text-dimmed)',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
          {!isWorking && onClear && (
            <button
              onClick={e => { e.stopPropagation(); setFilter('all'); setExpandedStepId(null); onClear(); }}
              className="p-0.5 rounded hover:bg-[var(--bg-hover)] active:bg-[var(--bg-active)] active:scale-90 transition-all"
              title="Effacer"
              aria-label="Effacer l'historique"
              style={{ color: 'var(--text-dimmed)' }}
            >
              <X style={{ width: 11, height: 11 }} />
            </button>
          )}
        </div>
      </motion.div>

      {/* ── Expandable drawer ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={uiSpring}
            style={{ overflow: 'hidden' }}
          >
            {/* Stats strip */}
            <div
              className="flex items-center gap-3 px-3 py-1 border-y text-xs tracking-wide font-mono tabular-nums"
              style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-dimmed)' }}
            >
              <span style={{ color: 'var(--color-success)' }}>{doneCount} ok</span>
              {errorCount > 0 && <span style={{ color: 'var(--color-error)' }}>{errorCount} err</span>}
              <span>{total} étape{total > 1 ? 's' : ''}</span>
              <span className="ml-auto flex items-center gap-1">
                <Clock style={{ width: 9, height: 9 }} />
                {totalDur}
              </span>
            </div>

            {/* Filtres : affichés seulement s'il y a de quoi filtrer */}
            {(presentCats.length > 1 || errorCount > 0) && (
              <div
                className="flex items-center gap-1 px-2 py-1 overflow-x-auto border-b"
                style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-surface)' }}
                role="group"
                aria-label="Filtrer les étapes"
              >
                <FilterChip
                  label="Tout" count={total} active={filter === 'all'}
                  onClick={() => setFilter('all')}
                />
                {errorCount > 0 && (
                  <FilterChip
                    label="Erreurs" count={errorCount} active={filter === 'errors'}
                    color="var(--color-error)" onClick={() => setFilter('errors')}
                  />
                )}
                {presentCats.map(cat => (
                  <FilterChip
                    key={cat}
                    label={CAT_LABEL[cat]}
                    count={steps.filter(s => getCat(s.tool) === cat).length}
                    active={filter === cat}
                    color={CAT_COLOR[cat]}
                    onClick={() => setFilter(cat)}
                  />
                ))}
              </div>
            )}

            {/* Timeline */}
            <div
              ref={listRef}
              className="overflow-y-auto px-2 py-1"
              style={{ maxHeight: '220px' }}
            >
              {visibleSteps.length === 0 && (
                <div className="px-2 py-3 text-xs text-center" style={{ color: 'var(--text-dimmed)' }}>
                  Aucune étape pour ce filtre
                </div>
              )}

              {/* Vue par phases quand aucun filtre spécifique n'est actif : on
                  regroupe en Planification → Écriture → Vérification pour lire le
                  déroulement d'un coup d'œil. Les filtres (catégorie / erreurs)
                  gardent la liste à plat, car ils ciblent déjà un sous-ensemble. */}
              {filter === 'all'
                ? PHASE_ORDER.map(phase => {
                    const phaseSteps = phaseGroups[phase];
                    if (phaseSteps.length === 0) return null;
                    return (
                      <PhaseSection
                        key={phase}
                        phase={phase}
                        steps={phaseSteps}
                        expandedStepId={expandedStepId}
                        copiedId={copiedId}
                        copyFailedId={copyFailedId}
                        reduceMotion={reduceMotion}
                        uiSpring={uiSpring}
                        onToggleStep={id => setExpandedStepId(prev => (prev === id ? null : id))}
                        onCopy={copyDetail}
                      />
                    );
                  })
                : visibleSteps.map((step, i) => (
                    <StepRow
                      key={step.id}
                      step={step}
                      isLast={i === visibleSteps.length - 1}
                      isExp={expandedStepId === step.id}
                      copiedId={copiedId}
                      copyFailedId={copyFailedId}
                      reduceMotion={reduceMotion}
                      uiSpring={uiSpring}
                      onToggle={() => setExpandedStepId(prev => (prev === step.id ? null : step.id))}
                      onCopy={copyDetail}
                    />
                  ))
              }
            </div>

            {/* Reasoning */}
            {reasoning && <ReasoningPanel reasoning={reasoning} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}