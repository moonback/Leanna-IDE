import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ClipboardList, X } from 'lucide-react';
import { ChatMarkdown } from './ChatMarkdown.js';

interface PlanPanelProps {
  plan: string;
  onDismiss: () => void;
}

/**
 * PlanPanel — s'affiche dans le ChatPanel dès que Leanna appelle `set_plan`.
 *
 * Affiche le plan Markdown (liste numérotée d'étapes) dans un bloc repliable
 * persistant, positionné entre la UnifiedTimeline et les messages. L'utilisateur
 * peut le réduire ou le fermer (clearPlan).
 */
export const PlanPanel = memo(function PlanPanel({ plan, onDismiss }: PlanPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <AnimatePresence>
      <motion.div
        key="plan-panel"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="mx-3 my-2 rounded-xl overflow-hidden flex-shrink-0"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--accent-primary) 6%, var(--bg-panel))',
          border: '1px solid color-mix(in srgb, var(--accent-primary) 28%, transparent)',
        }}
        role="region"
        aria-label="Plan d'exécution"
      >
        {/* ── En-tête ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-3 py-2">
          <ClipboardList
            size={13}
            style={{ color: 'var(--accent-primary)', flexShrink: 0 }}
            aria-hidden
          />
          <button
            type="button"
            onClick={() => setCollapsed(v => !v)}
            className="flex items-center gap-1.5 flex-1 text-left"
            aria-expanded={!collapsed}
            aria-controls="plan-panel-body"
          >
            <span
              className="text-xs font-semibold tracking-wide uppercase"
              style={{ color: 'var(--accent-primary)', letterSpacing: '0.06em' }}
            >
              Plan d'exécution
            </span>
            <ChevronDown
              size={11}
              aria-hidden
              className={`transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
              style={{ color: 'var(--accent-primary)' }}
            />
          </button>

          {/* Bouton fermeture */}
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded-md hover:bg-[var(--bg-active)] transition-colors"
            title="Fermer le plan"
            aria-label="Fermer le plan d'exécution"
          >
            <X size={11} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* ── Corps repliable ────────────────────────────────────────────── */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              id="plan-panel-body"
              key="plan-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div
                className="px-4 pb-3 text-sm"
                style={{
                  borderTop: '1px solid color-mix(in srgb, var(--accent-primary) 15%, transparent)',
                  paddingTop: '10px',
                  color: 'var(--text-primary)',
                }}
              >
                {/* ChatMarkdown rend la liste numérotée avec le CSS existant */}
                <ChatMarkdown text={plan} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
});
