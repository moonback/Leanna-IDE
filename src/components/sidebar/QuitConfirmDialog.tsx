/**
 * QuitConfirmDialog — Modale de confirmation pour quitter l'application Electron.
 * Design aligné sur l'identité visuelle du splash screen.
 * Thème entièrement piloté par les variables CSS du projet.
 *
 * Migration lot 3c : utilise <Modal layer="critical"> pour la gestion
 * standardisée de l'empilement, du focus-trap et du scroll-lock.
 * Les animations CSS spécifiques (orb, blink) sont conservées dans le contenu.
 */

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal.js';
import { Button } from '../ui/Button.js';

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
  const prefersReducedMotion      = useReducedMotion();
  const prefersReducedTransparency = useMediaQuery('(prefers-reduced-transparency: reduce)');

  return (
    <>
      {/* CSS keyframes scoped to this component */}
      <style>{`
        @keyframes qd-breathe { 50% { transform: scale(1.06); } }
        @keyframes qd-blink   { to  { opacity: .35; } }
        @media (prefers-reduced-motion: reduce) {
          .qd-orb, .qd-dot { animation: none !important; }
        }
      `}</style>

      {/* Modal gère : overlay, focus-trap, scroll-lock, Escape, portail */}
      <Modal
        open={open}
        onClose={onClose}
        size="xs"
        tone="danger"
        layer="critical"
        hideClose
      >
        <Modal.Body>
          {/* Shimmer décoratif */}
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

          {/* Header interne */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {/* Orb animé */}
              <div
                aria-hidden="true"
                className="qd-orb"
                style={{
                  width: 40, height: 40,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: 'var(--accent-gradient, linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)))',
                  boxShadow: '0 0 0 1px rgba(255,255,255,.12) inset, 0 10px 30px var(--accent-glow)',
                  animation: prefersReducedMotion ? 'none' : 'qd-breathe 3.4s ease-in-out infinite',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" />
                  <line x1="12" y1="2" x2="12" y2="12" />
                </svg>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
                  Leanna
                </p>
                <p style={{ margin: 0, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  Intelligence Core
                </p>
              </div>
            </div>

            {/* Badge Shutdown */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 8px', borderRadius: 999,
              backgroundColor: 'var(--color-error-subtle)',
              border: '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)',
              color: 'var(--color-error)',
              fontFamily: 'var(--font-mono)', fontSize: 7, fontWeight: 600,
              letterSpacing: '.08em', textTransform: 'uppercase',
            }}>
              <span
                aria-hidden="true"
                className="qd-dot"
                style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: 'var(--color-error)',
                  boxShadow: '0 0 6px var(--color-error)',
                  animation: prefersReducedMotion ? 'none' : 'qd-blink .9s ease-in-out infinite alternate',
                }}
              />
              Shutdown
            </div>
          </div>

          <hr style={{ border: 0, height: 1, background: 'var(--border-base)', margin: '0 0 16px' }} />

          {/* Corps */}
          <div className="space-y-3">
            {/* Warning card */}
            <div style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'var(--color-warning-subtle)',
              border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
            }}>
              <p style={{ margin: '0 0 4px', fontSize: 8, fontWeight: 600, letterSpacing: '.10em', color: 'var(--color-warning)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                Warning
              </p>
              <p id="quit-desc" style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>
                Les modifications non enregistrées pourraient être perdues.
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{" Confirmer l'arrêt du système ?"}</span>
              </p>
            </div>

            {/* Status line */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 10,
              background: 'var(--bg-input)',
              border: '1px solid var(--border-base)',
            }}>
              <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: '50%', flexShrink: 0, background: 'var(--color-success)', boxShadow: '0 0 6px var(--color-success)' }} />
              <span style={{ flex: 1, fontSize: 8, color: 'var(--text-dimmed)', fontFamily: 'var(--font-mono)', fontWeight: 500, letterSpacing: '.04em' }}>
                SECURE · AES-256-GCM · SESSION ACTIVE
              </span>
              <span style={{ fontSize: 7, color: 'var(--color-success)', fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                Online
              </span>
            </div>
          </div>
        </Modal.Body>

        <Modal.Footer>
          {/* Annuler reçoit le focus auto via Modal.Body → first focusable */}
          <Button variant="secondary" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" />
              <line x1="12" y1="2" x2="12" y2="12" />
            </svg>
            Quitter
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
