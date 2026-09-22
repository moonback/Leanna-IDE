/**
 * ToolCallCard — Carte visuelle enrichie de l'appel d'outil ACTIF.
 *
 * Complément de l'AgentProgressBar (timeline compacte). Cette carte met en
 * avant, au moment du `tool_start`, quel outil Leanna exécute et sur quelle
 * cible (fichier, requête, URL, rôle…), avec un code couleur par catégorie et
 * un statut animé « en cours ». Elle s'alimente du même flux `activity`
 * (ActivityStep[]) que l'AgentProgressBar : aucune plomberie WebSocket dédiée.
 *
 * Rendu : la carte n'apparaît que lorsqu'un step est en cours d'exécution
 * (`status === 'running'`) ; sinon elle disparaît proprement (AnimatePresence).
 */

import { memo, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import type { ActivityStep } from '../../hooks/useLiveAPI.js';
import { getCat, CAT_COLOR, CAT_ICON, CAT_LABEL } from './toolCategories.js';

/** Nom d'outil lisible : « read_project_file » → « read project file ». */
function humanizeTool(tool: string): string {
  return tool.replace(/_/g, ' ');
}

/** Met une majuscule en tête (les libellés partagés sont en minuscules). */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Composant ────────────────────────────────────────────────────────────────

export interface ToolCallCardProps {
  /** Flux d'activité partagé avec l'AgentProgressBar. */
  steps: ActivityStep[];
  /** Masquer la carte quand le socket n'est pas connecté. */
  connected?: boolean;
}

export const ToolCallCard = memo(function ToolCallCard({ steps, connected = true }: ToolCallCardProps) {
  const reduceMotion = useReducedMotion();

  // Appel actif = dernier step en cours d'exécution.
  const active = useMemo(
    () => [...steps].reverse().find(s => s.status === 'running'),
    [steps],
  );

  const show = connected && !!active;

  return (
    <AnimatePresence>
      {show && active && (
        <ToolCallCardInner key={active.id} step={active} reduceMotion={!!reduceMotion} />
      )}
    </AnimatePresence>
  );
});

function ToolCallCardInner({ step, reduceMotion }: { step: ActivityStep; reduceMotion: boolean }) {
  const cat = getCat(step.tool);
  const color = CAT_COLOR[cat];
  const Icon = CAT_ICON[cat];
  const catLabel = capitalize(CAT_LABEL[cat]);

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="mx-3 my-2 rounded-xl overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label={`Exécution de l'outil ${humanizeTool(step.tool)}${step.detail ? ` sur ${step.detail}` : ''}`}
      style={{
        backgroundColor: 'var(--bg-panel)',
        border: `1px solid color-mix(in srgb, ${color} 30%, var(--border-base))`,
        boxShadow: `0 0 12px color-mix(in srgb, ${color} 15%, transparent)`,
      }}
    >
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        {/* Icône catégorie sur pastille colorée */}
        <div
          className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{
            width: 30, height: 30,
            backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
          }}
        >
          <Icon size={15} style={{ color }} />
        </div>

        {/* Corps : catégorie + nom d'outil, cible en évidence */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color }}
            >
              {catLabel}
            </span>
            <span
              className="text-xs font-mono truncate"
              style={{ color: 'var(--text-dimmed)' }}
            >
              {humanizeTool(step.tool)}
            </span>
          </div>
          {step.detail && (
            <div
              className="text-sm font-mono truncate mt-0.5"
              style={{ color: 'var(--text-primary)' }}
              title={step.detail}
            >
              {step.detail}
            </div>
          )}
        </div>

        {/* Statut animé « en cours » */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Loader2
            size={13}
            className={reduceMotion ? undefined : 'animate-spin'}
            style={{ color }}
          />
          <span className="text-xs font-medium" style={{ color: 'var(--text-dimmed)' }}>
            en cours
          </span>
        </div>
      </div>
    </motion.div>
  );
}
