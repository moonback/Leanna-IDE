import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Lightbulb, X } from 'lucide-react';
import type { ThoughtStreamState } from '../../hooks/useLiveAPI.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ThoughtStreamProps {
  thought?: ThoughtStreamState;
  onClear?: () => void;
}

/**
 * ThoughtStream — panneau DÉDIÉ aux "thought summaries" du modèle
 * extended-thinking (Live API).
 *
 * Volontairement distinct du <AgentProgressBar /> (raisonnement structuré / CoT) :
 * teinte indigo/violet, icône ampoule, texte en italique façon monologue interne.
 * Il affiche en direct ce que l'assistant "réfléchit" avant de répondre.
 */
export default function ThoughtStream({ thought, onClear }: ThoughtStreamProps) {
  const reduceMotion = useReducedMotion();

  const text = thought?.text?.trim() ?? '';
  // On garde le panneau visible tant qu'il y a du texte (même inactif) pour
  // laisser l'utilisateur lire, mais on masque complètement s'il est vide.
  if (!thought || !text) return null;

  const active = thought.active;
  // Teinte dédiée : indigo/violet, différente de l'accent du raisonnement.
  const accent = 'var(--color-thought, #8b5cf6)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
      className="rounded-lg px-3 py-2"
      style={{
        backgroundColor: 'color-mix(in srgb, #8b5cf6 10%, transparent)',
        border: '1px solid color-mix(in srgb, #8b5cf6 35%, transparent)',
      }}
      role="status"
      aria-live="polite"
    >
      {/* En-tête */}
      <div className="flex items-center gap-2">
        <motion.div
          animate={active && !reduceMotion ? { scale: [1, 1.18, 1], opacity: [0.7, 1, 0.7] } : {}}
          transition={active && !reduceMotion ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : {}}
          className="flex items-center justify-center"
        >
          <Lightbulb style={{ width: 14, height: 14, color: accent }} />
        </motion.div>

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            className="text-sm font-semibold tracking-wide truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            Réflexion
          </span>
          <span
            className="text-[10px] uppercase tracking-wider font-semibold"
            style={{ color: accent }}
          >
            {active ? 'En cours' : 'Terminée'}
          </span>
        </div>

        {onClear && (
          <button
            onClick={onClear}
            className="p-0.5 rounded hover:bg-white/5 active:scale-90 transition-all"
            title="Masquer la réflexion"
            aria-label="Masquer la réflexion"
          >
            <X style={{ width: 12, height: 12, color: 'var(--text-muted)' }} />
          </button>
        )}
      </div>

      {/* Flux de pensée — italique, façon monologue interne */}
      <div
        className="mt-1.5 max-h-24 overflow-hidden text-[11px] italic leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}
      >
        {/* On n'affiche que la fin du flux pour rester compact */}
        {text.slice(-600)}
        {active ? <span style={{ color: accent }}> ▍</span> : null}
      </div>
    </motion.div>
  );
}

// Wrapper avec AnimatePresence pour animer l'apparition/disparition.
export function ThoughtStreamContainer(props: ThoughtStreamProps) {
  const visible = !!props.thought && !!props.thought.text?.trim();
  return (
    <AnimatePresence>
      {visible ? <ThoughtStream key="thought-stream" {...props} /> : null}
    </AnimatePresence>
  );
}
