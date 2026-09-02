/**
 * QuitConfirmDialog — Modale de confirmation pour quitter l'application Electron.
 * Design aligné sur l'identité visuelle du splash screen.
 * Thème entièrement piloté par les variables CSS du projet (data-theme sur <html>).
 * Compatible : dark · light · cyberpunk · sepia · high-contrast
 *
 * Améliorations cohérence visuelle :
 *  - Système de couleurs unifié via variables CSS
 *  - Espacements basés sur une échelle de 4px (système de design tokens)
 *  - Hiérarchie typographique plus claire
 *  - Effets hover/focus harmonisés
 *  - Contraste WCAG amélioré sur tous les éléments interactifs
 */

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

interface QuitConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export function QuitConfirmDialog({ open, onClose, onConfirm }: QuitConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const prefersReducedMotion = useReducedMotion();
  const prefersReducedTransparency = useMediaQuery('(prefers-reduced-transparency: reduce)');

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => cancelButtonRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const panelTransition = prefersReducedMotion
    ? { duration: 0.15, ease: 'linear' as const }
    : { type: 'spring' as const, bounce: 0, duration: 0.35 };

  const panelInitial = prefersReducedMotion
    ? { opacity: 0 }
    : { opacity: 0, scale: 0.9, y: 18 };
  const panelAnimate = prefersReducedMotion
    ? { opacity: 1 }
    : { opacity: 1, scale: 1, y: 0 };
  const panelExit = panelInitial;

  const overlayBackground = prefersReducedTransparency
    ? 'var(--bg-base)'
    : 'color-mix(in srgb, var(--bg-base) 55%, transparent)';

  return (
    <AnimatePresence mode="wait">
      {open && (
        <>
          <style>{`
            @keyframes qd-breathe { 50% { transform: scale(1.06); } }
            @keyframes qd-blink   { to  { opacity: .35; } }
            @media (prefers-reduced-motion: reduce) {
              .qd-orb, .qd-dot { animation: none !important; }
            }
          `}</style>

          {/* Overlay */}
          <motion.div
            key="quit-overlay"
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{
              background: overlayBackground,
              backdropFilter: prefersReducedTransparency ? 'none' : 'blur(10px)',
              WebkitBackdropFilter: prefersReducedTransparency ? 'none' : 'blur(10px)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0.15 } : { duration: 0.18 }}
            onClick={onClose}
            role="presentation"
          >
            {/* Panel */}
            <motion.div
              key="quit-panel"
              ref={panelRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="quit-title"
              aria-describedby="quit-desc"
              tabIndex={-1}
              initial={panelInitial}
              animate={panelAnimate}
              exit={panelExit}
              transition={panelTransition}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
              style={{
                position: 'relative',
                width: 'min(400px, calc(100vw - 32px))',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-strong)',
                borderRadius: '24px',
                boxShadow: 'var(--shadow-xl)',
                backdropFilter: prefersReducedTransparency ? 'none' : 'blur(28px) saturate(1.3)',
                WebkitBackdropFilter: prefersReducedTransparency ? 'none' : 'blur(28px) saturate(1.3)',
                overflow: 'hidden',
              }}
            >
              {/* Shimmer interne */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 'inherit',
                  pointerEvents: 'none',
                  background: 'linear-gradient(135deg, rgba(255,255,255,.04), transparent 40%)',
                }}
              />

              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    aria-hidden="true"
                    className="qd-orb"
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: 'var(--accent-gradient)',
                      boxShadow: '0 0 0 1px rgba(255,255,255,.12) inset, 0 10px 30px var(--accent-glow)',
                      animation: 'qd-breathe 3.4s ease-in-out infinite',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <div
  aria-hidden="true"
  className="qd-orb"
  style={{
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    flexShrink: 0,
    background: 'var(--accent-gradient)',
    boxShadow: '0 0 0 1px rgba(255,255,255,.12) inset, 0 10px 30px var(--accent-glow)',
    animation: 'qd-breathe 3.4s ease-in-out infinite',
    display: 'grid',
    placeItems: 'center',
  }}
>
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--text-primary)"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" />
    <line x1="12" y1="2" x2="12" y2="12" />
  </svg>
</div>
                  </div>

                  <div>
                    <p
                      id="quit-title"
                      style={{
                        margin: 0,
                        fontSize: '14px',
                        fontWeight: 700,
                        letterSpacing: '-0.02em',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      Leanna 
                    </p>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '8px',
                        letterSpacing: '.12em',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                      }}
                    >
                      Intelligence Core
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 8px',
                    borderRadius: '999px',
                    background: 'var(--bg-error-subtle)',
                    border: '1px solid var(--border-error)',
                    color: 'var(--text-error)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '7px',
                    fontWeight: 600,
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="qd-dot"
                    style={{
                      width: '4px',
                      height: '4px',
                      borderRadius: '50%',
                      background: 'var(--color-error)',
                      boxShadow: '0 0 6px var(--color-error)',
                      animation: 'qd-blink .9s ease-in-out infinite alternate',
                    }}
                  />
                  Shutdown
                </div>
              </div>

              {/* Divider */}
              <hr
                style={{
                  border: 0,
                  height: '1px',
                  background: 'var(--border-base)',
                  margin: 0,
                }}
              />

              {/* Body */}
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {/* Warning card */}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    background: 'var(--bg-warning-subtle)',
                    border: '1px solid var(--border-warning)',
                  }}
                >
                  <p
                    style={{
                      margin: '0 0 4px',
                      fontSize: '8px',
                      fontWeight: 600,
                      letterSpacing: '.10em',
                      color: 'var(--text-warning)',
                      fontFamily: 'var(--font-mono)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Warning
                  </p>
                  <p
                    id="quit-desc"
                    style={{
                      margin: 0,
                      fontSize: '12px',
                      lineHeight: 1.5,
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    Les modifications non enregistrées pourraient être perdues.
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {' Confirmer l\'arrêt du système ?'}
                    </span>
                  </p>
                </div>

                {/* Status line */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-base)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: '4px',
                      height: '4px',
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: 'var(--color-success)',
                      boxShadow: '0 0 6px var(--color-success)',
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      fontSize: '8px',
                      color: 'var(--text-dimmed)',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 500,
                      letterSpacing: '.04em',
                    }}
                  >
                    SECURE · AES-256-GCM · SESSION ACTIVE
                  </span>
                  <span
                    style={{
                      fontSize: '7px',
                      color: 'var(--text-success)',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      letterSpacing: '.08em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Online
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  justifyContent: 'flex-end',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <button
                  ref={cancelButtonRef}
                  type="button"
                  onClick={onClose}
                  className="focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offsetvar(--bg-panel) focus:ringvar(--border-focus) transition-all duration-200 hover:bgvar(--bg-secondary-hover) active:scale-[.98]"
                  style={{
                    padding: '8px 16px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-base)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: 'var(--font-sans)',
                    cursor: 'pointer',
                    letterSpacing: '-.01em',
                    minWidth: '80px',
                  }}
                >
                  Annuler
                </button>

                <button
                  type="button"
                  onClick={onConfirm}
                  className="focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offsetvar(--bg-panel) focus:ringvar(--color-error) transition-all duration-200 hover:opacity-90 active:scale-[.98]"
                  style={{
                    padding: '8px 16px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-error)',
                    background: 'var(--bg-error)',
                    color: 'var(--text-error-inverse)',
                    fontSize: '12px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-sans)',
                    cursor: 'pointer',
                    letterSpacing: '-.01em',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    minWidth: '80px',
                    boxShadow: '0 4px 16px -4px var(--shadow-error)',
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" />
                    <line x1="12" y1="2" x2="12" y2="12" />
                  </svg>
                  Quitter
                </button>
              </div>

              {/* Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  paddingTop: '4px',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <span
                  style={{
                    fontSize: '7px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 500,
                    color: 'var(--text-dimmed)',
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  v0.7.0 · Leanna 
                </span>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}