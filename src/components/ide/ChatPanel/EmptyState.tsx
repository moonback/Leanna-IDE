import { motion } from 'motion/react';
import { Bot, Sparkles } from 'lucide-react';

export interface EmptyStateProps {
  connected: boolean;
  reduceMotion: boolean;
  aiName: string;
}

const TIPS: { key: string; label: string }[] = [
  { key: '@', label: 'mentionner un fichier' },
  { key: '/', label: 'lancer une commande' },
  { key: '⇧ Enter', label: 'saut de ligne' },
];

/** État vide du fil de discussion (accueil connecté / hors ligne). */
export function EmptyState({ connected, reduceMotion, aiName }: EmptyStateProps) {
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center py-12 gap-5"
    >
      {/* Orbe XL avec halo tournant (masqué hors ligne et en motion réduite) */}
      <div className="lea-chat-hero-orb" data-offline={!connected || reduceMotion ? 'true' : undefined}>
        <span
          className="lea-orb"
          data-state={connected ? 'online' : 'offline'}
          style={{ width: 64, height: 64 }}
          aria-hidden="true"
        >
          {connected ? <Sparkles size={26} /> : <Bot size={26} />}
        </span>
      </div>

      <div className="text-center space-y-1.5 px-4">
        <p className="text-base font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {connected ? `Bonjour, je suis ${aiName}` : 'Agent hors ligne'}
        </p>
        <p className="text-xs leading-relaxed max-w-[280px] mx-auto" style={{ color: 'var(--text-muted)' }}>
          {connected
            ? 'Posez une question, confiez une tâche ou demandez une revue de code.'
            : 'Connectez-vous via le bouton ⏻ pour démarrer.'
          }
        </p>
      </div>

      {connected && (
        <ul className="lea-stagger flex flex-wrap justify-center gap-1.5 px-4 m-0 p-0 list-none" aria-label="Astuces">
          {TIPS.map(tip => (
            <li
              key={tip.key}
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full"
              style={{
                color: 'var(--text-muted)',
                backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
                border: '1px solid var(--border-base)',
              }}
            >
              <kbd className="kbd" style={{ height: '1.25rem', minWidth: '1.25rem' }}>{tip.key}</kbd>
              {tip.label}
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
