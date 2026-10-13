import { motion } from 'motion/react';
import { Bot, Sparkles } from 'lucide-react';

export interface EmptyStateProps {
  connected: boolean;
  reduceMotion: boolean;
  aiName: string;
}

/** État vide du fil de discussion (accueil connecté / hors ligne). */
export function EmptyState({ connected, reduceMotion, aiName }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center py-12 gap-5"
    >
      <div className="relative">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center relative overflow-hidden"
          style={{
            background: connected
              ? 'linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 16%, transparent), color-mix(in srgb, var(--accent-secondary) 10%, transparent))'
              : 'color-mix(in srgb, var(--text-muted) 8%, transparent)',
            border: `1px solid ${connected ? 'color-mix(in srgb, var(--accent-primary) 28%, transparent)' : 'var(--border-base)'}`,
            boxShadow: connected
              ? '0 0 36px color-mix(in srgb, var(--accent-primary) 22%, transparent), inset 0 1px 0 rgba(255,255,255,0.08)'
              : 'none',
          }}
        >
          {connected
            ? <Sparkles size={26} style={{ color: 'var(--accent-primary)' }} />
            : <Bot size={26} style={{ color: 'var(--text-muted)' }} />
          }
        </div>
        {connected && !reduceMotion && (
          <>
            <motion.div
              className="absolute inset-0 rounded-2xl"
              style={{ border: '2px solid color-mix(in srgb, var(--accent-primary) 35%, transparent)' }}
              animate={{ scale: [1, 1.22], opacity: [0.8, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
            />
            <motion.div
              className="absolute inset-0 rounded-2xl"
              style={{ border: '1px solid color-mix(in srgb, var(--accent-secondary) 30%, transparent)' }}
              animate={{ scale: [1, 1.35], opacity: [0.5, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut', delay: 0.6 }}
            />
          </>
        )}
      </div>

      <div className="text-center space-y-1.5 px-4">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {connected ? `Bonjour, je suis ${aiName}` : 'Agent hors ligne'}
        </p>
        <p className="text-xs leading-relaxed max-w-[260px]" style={{ color: 'var(--text-muted)' }}>
          {connected
            ? 'Posez une question, mentionnez un @fichier ou tapez une /commande.'
            : 'Connectez-vous via le bouton ⏻ pour démarrer.'
          }
        </p>
      </div>
    </motion.div>
  );
}
