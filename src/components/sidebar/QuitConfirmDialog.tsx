/**
 * QuitConfirmDialog — Modale de confirmation pour quitter l'application Electron.
 * Design aligné sur l'identité visuelle du splash screen.
 * Thème entièrement piloté par les variables CSS du projet (data-theme sur <html>).
 * Compatible : dark · light · cyberpunk · sepia · high-contrast
 */

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';

interface QuitConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function QuitConfirmDialog({ open, onClose, onConfirm }: QuitConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => confirmButtonRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <AnimatePresence mode="wait">
      {open && (
        <>
          {/* ── Keyframes ── */}
          <style>{`
            @keyframes qd-breathe { 50% { transform: scale(1.06); } }
            @keyframes qd-blink   { to  { opacity: .35; } }
          `}</style>

          {/* ── Overlay ── */}
          <motion.div
            key="quit-overlay"
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{
              background: 'color-mix(in srgb, var(--bg-base) 55%, transparent)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            role="presentation"
          >
            {/* ── Panel ── */}
            <motion.div
              key="quit-panel"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="quit-title"
              aria-describedby="quit-desc"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.90, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.90, y: 18 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
              style={{
                position: 'relative',
                width: 'min(400px, calc(100vw - 32px))',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-strong)',
                borderRadius: '26px',
                boxShadow: 'var(--shadow-xl)',
                backdropFilter: 'blur(28px) saturate(1.3)',
                WebkitBackdropFilter: 'blur(28px) saturate(1.3)',
                overflow: 'hidden',
              }}
            >
              {/* Shimmer interne (haut-gauche) */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 'inherit',
                  pointerEvents: 'none',
                  background: 'linear-gradient(135deg, rgba(255,255,255,.06), transparent 40%)',
                }}
              />

              {/* ── Header ── */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {/* Logo + titre */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Orbe accent */}
                  <div
                    aria-hidden="true"
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      flexShrink: 0,
                      background:
                        'radial-gradient(circle at 32% 28%, color-mix(in srgb, var(--accent-primary) 60%, white), var(--accent-primary) 72%)',
                      boxShadow:
                        '0 0 0 1px rgba(255,255,255,.12) inset, 0 10px 30px var(--accent-glow)',
                      animation: 'qd-breathe 3.4s ease-in-out infinite',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {/* Icône Power */}
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" />
                      <line x1="12" y1="2" x2="12" y2="12" />
                    </svg>
                  </div>

                  <div>
                    <p
                      id="quit-title"
                      style={{
                        margin: 0,
                        fontSize: '15px',
                        fontWeight: 700,
                        letterSpacing: '-0.03em',
                        color: 'var(--text-primary)',
                        fontFamily: '"DM Sans", system-ui, sans-serif',
                      }}
                    >
                      JARVIS OS
                    </p>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '9px',
                        letterSpacing: '.14em',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                        fontFamily: '"JetBrains Mono", monospace',
                        fontWeight: 600,
                      }}
                    >
                      Intelligence Core
                    </p>
                  </div>
                </div>

                {/* Badge SHUTDOWN */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    borderRadius: '999px',
                    background: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
                    color: 'var(--color-error)',
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: '8px',
                    fontWeight: 600,
                    letterSpacing: '.10em',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      background: 'var(--color-error)',
                      boxShadow: '0 0 7px var(--color-error)',
                      animation: 'qd-blink .9s ease-in-out infinite alternate',
                    }}
                  />
                  SHUTDOWN
                </div>
              </div>

              {/* ── Divider ── */}
              <hr
                style={{
                  border: 0,
                  height: '1px',
                  background: 'var(--border-base)',
                  margin: 0,
                }}
              />

              {/* ── Body ── */}
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
                    padding: '14px 16px',
                    borderRadius: '14px',
                    background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)',
                  }}
                >
                  <p
                    style={{
                      margin: '0 0 6px',
                      fontSize: '9px',
                      fontWeight: 600,
                      letterSpacing: '.12em',
                      color: 'var(--color-warning)',
                      fontFamily: '"JetBrains Mono", monospace',
                      textTransform: 'uppercase',
                    }}
                  >
                    ⚠ Avertissement
                  </p>
                  <p
                    id="quit-desc"
                    style={{
                      margin: 0,
                      fontSize: '12px',
                      lineHeight: 1.6,
                      color: 'var(--text-secondary)',
                      fontFamily: '"DM Sans", system-ui, sans-serif',
                    }}
                  >
                    Les modifications non enregistrées pourraient être perdues.{' '}
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      Confirmer l'arrêt du système ?
                    </span>
                  </p>
                </div>

                {/* Ligne de statut système */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-base)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: 'var(--color-success)',
                      boxShadow: '0 0 8px var(--color-success)',
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      fontSize: '9px',
                      color: 'var(--text-dimmed)',
                      fontFamily: '"JetBrains Mono", monospace',
                      fontWeight: 500,
                      letterSpacing: '.06em',
                    }}
                  >
                    SECURE · AES-256-GCM · SESSION ACTIVE
                  </span>
                  <span
                    style={{
                      fontSize: '8px',
                      color: 'var(--color-success)',
                      fontFamily: '"JetBrains Mono", monospace',
                      fontWeight: 600,
                      letterSpacing: '.10em',
                    }}
                  >
                    ONLINE
                  </span>
                </div>
              </div>

              {/* ── Actions ── */}
              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  justifyContent: 'flex-end',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {/* Annuler */}
                <button
                  type="button"
                  onClick={onClose}
                  className="transition-opacity hover:opacity-75 active:scale-[.97]"
                  style={{
                    padding: '9px 20px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-base)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: '"DM Sans", system-ui, sans-serif',
                    cursor: 'pointer',
                    letterSpacing: '-.01em',
                  }}
                >
                  Annuler
                </button>

                {/* Quitter */}
                <button
                  ref={confirmButtonRef}
                  type="button"
                  onClick={onConfirm}
                  className="transition-opacity hover:opacity-85 active:scale-[.97]"
                  style={{
                    padding: '9px 20px',
                    borderRadius: '12px',
                    border: '1px solid color-mix(in srgb, var(--color-error) 35%, transparent)',
                    background:
                      'linear-gradient(135deg, var(--color-error), color-mix(in srgb, var(--color-error) 75%, black))',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 700,
                    fontFamily: '"DM Sans", system-ui, sans-serif',
                    cursor: 'pointer',
                    letterSpacing: '-.01em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 8px 24px -8px color-mix(in srgb, var(--color-error) 55%, transparent)',
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

              {/* ── Footer ── */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  paddingTop: '2px',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <span
                  style={{
                    fontSize: '8px',
                    fontFamily: '"JetBrains Mono", monospace',
                    fontWeight: 500,
                    color: 'var(--text-dimmed)',
                    letterSpacing: '.08em',
                  }}
                >
                  v0.4.0 · JARVIS OS
                </span>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
