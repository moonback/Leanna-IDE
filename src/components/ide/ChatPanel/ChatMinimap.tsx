import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import type { TranscriptEntry } from '../../../hooks/useLiveAPI.js';

// ─── Mini-carte de la conversation (feature #4) ──────────────────────────────
//
// Barre verticale sur le bord droit du fil qui résume sa structure : un segment
// par message, coloré selon son type (image / code / texte) et son auteur, de
// hauteur proportionnelle à la place réelle occupée dans le fil. Un indicateur
// de viewport montre la portion visible ; cliquer ou glisser déplace le défilement.
//
// Les positions sont mesurées sur le DOM réel (via `data-message-id`) plutôt
// que devinées, pour rester exactes malgré le markdown, les images et le code.

type MessageKind = 'image' | 'code' | 'text';

interface Segment {
  id: string;
  role: TranscriptEntry['role'];
  kind: MessageKind;
  /** Fractions [0..1] de la hauteur totale du contenu défilable. */
  top: number;
  height: number;
}

export interface ChatMinimapProps {
  transcript: TranscriptEntry[];
  /** Conteneur défilant du fil (messagesRef de useChatScroll). */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  reduceMotion?: boolean;
  /** En dessous de ce nombre de messages, la minimap reste masquée. */
  minMessages?: number;
}

/** Classe un message par son contenu dominant (pour la couleur du segment). */
function classify(entry: TranscriptEntry): MessageKind {
  if (entry.pending === 'image' || entry.pending === 'image-error') return 'image';
  const text = entry.text ?? '';
  // Image markdown ou bloc de code → types « riches » mis en avant.
  if (/!\[[^\]]*\]\([^)]*\)/.test(text)) return 'image';
  if (text.includes('```')) return 'code';
  return 'text';
}

/** Couleur d'un segment selon le type de contenu et l'auteur. */
function segmentColor(role: TranscriptEntry['role'], kind: MessageKind): string {
  if (kind === 'code') return 'var(--accent-primary)';
  if (kind === 'image') return 'var(--color-success, #4ade80)';
  // Texte : assistant plus marqué que l'utilisateur.
  return role === 'assistant'
    ? 'color-mix(in srgb, var(--text-muted) 70%, transparent)'
    : 'color-mix(in srgb, var(--text-muted) 38%, transparent)';
}

const MINIMAP_WIDTH = 10; // px — largeur de la piste

export function ChatMinimap({
  transcript, scrollRef, reduceMotion = false, minMessages = 6,
}: ChatMinimapProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Géométrie mesurée du conteneur défilant.
  const [geom, setGeom] = useState({ scrollTop: 0, scrollHeight: 1, clientHeight: 1 });
  const [segments, setSegments] = useState<Segment[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);

  const kinds = useMemo(
    () => transcript.map(e => ({ id: e.id, role: e.role, kind: classify(e) })),
    [transcript],
  );

  // Recalcule les positions des segments à partir du DOM réel.
  const measure = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const scrollHeight = container.scrollHeight || 1;
    const clientHeight = container.clientHeight || 1;
    const scrollTop = container.scrollTop;

    // Position du conteneur pour convertir les rects en coordonnées de contenu
    // (robuste quel que soit le contexte de positionnement, contrairement à
    // offsetTop qui dépend de l'offsetParent).
    const containerRect = container.getBoundingClientRect();

    const next: Segment[] = [];
    for (const { id, role, kind } of kinds) {
      const el = container.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      // Décalage dans le contenu défilable = (haut de l'élément − haut visible
      // du conteneur) + défilement courant.
      const top = (rect.top - containerRect.top) + scrollTop;
      const height = rect.height;
      next.push({
        id,
        role,
        kind,
        top: top / scrollHeight,
        height: Math.max(height / scrollHeight, 0.006), // plancher visuel
      });
    }
    setSegments(next);
    setGeom({ scrollTop, scrollHeight, clientHeight });
  }, [kinds, scrollRef]);

  // Mesure initiale + à chaque changement de transcript.
  useLayoutEffect(() => { measure(); }, [measure]);

  // Suivre le défilement (position du viewport) et les redimensionnements.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setGeom(g => ({ ...g, scrollTop: container.scrollTop }));
      });
    };
    container.addEventListener('scroll', onScroll, { passive: true });

    const ro = new ResizeObserver(() => measure());
    ro.observe(container);
    // Le contenu interne grandit (streaming, images) : observer le premier enfant.
    const inner = container.firstElementChild;
    if (inner) ro.observe(inner);

    return () => {
      container.removeEventListener('scroll', onScroll);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [measure, scrollRef]);

  // ── Navigation : clic / glissement sur la piste → défilement ─────────────
  const scrollToFraction = useCallback((fraction: number, smooth: boolean) => {
    const container = scrollRef.current;
    if (!container) return;
    const max = container.scrollHeight - container.clientHeight;
    const clamped = Math.max(0, Math.min(1, fraction));
    // Centre le viewport sur le point cliqué pour un geste naturel.
    const target = clamped * container.scrollHeight - container.clientHeight / 2;
    container.scrollTo({
      top: Math.max(0, Math.min(max, target)),
      behavior: smooth && !reduceMotion ? 'smooth' : 'auto',
    });
  }, [scrollRef, reduceMotion]);

  const fractionFromEvent = useCallback((clientY: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return (clientY - rect.top) / Math.max(1, rect.height);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    scrollToFraction(fractionFromEvent(e.clientY), false);
  }, [fractionFromEvent, scrollToFraction]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    scrollToFraction(fractionFromEvent(e.clientY), false);
  }, [fractionFromEvent, scrollToFraction]);

  const endDrag = useCallback((e: React.PointerEvent) => {
    draggingRef.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, []);

  const jumpToMessage = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const container = scrollRef.current;
    const el = container?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
    if (!container || !el) return;
    const offset = (el.getBoundingClientRect().top - container.getBoundingClientRect().top) + container.scrollTop;
    container.scrollTo({
      top: Math.max(0, offset - 12),
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [scrollRef, reduceMotion]);

  // Masquée pour les fils courts (aucune valeur ajoutée).
  if (transcript.length < minMessages) return null;

  const viewTop = geom.scrollTop / geom.scrollHeight;
  const viewHeight = geom.clientHeight / geom.scrollHeight;

  return (
    <div
      ref={trackRef}
      className="absolute top-2 bottom-2 right-1 z-20 cursor-pointer select-none"
      style={{ width: MINIMAP_WIDTH }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="group"
      aria-label="Mini-carte de la conversation : cliquer ou glisser pour naviguer"
    >
      {/* Piste de fond */}
      <div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-full"
        style={{ width: 4, backgroundColor: 'color-mix(in srgb, var(--border-base) 55%, transparent)' }}
      />

      {/* Segments de messages */}
      {segments.map((seg) => {
        const isHovered = hovered === seg.id;
        const wide = seg.kind !== 'text' || isHovered;
        return (
          <button
            key={seg.id}
            type="button"
            onClick={(e) => jumpToMessage(seg.id, e)}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseEnter={() => setHovered(seg.id)}
            onMouseLeave={() => setHovered(h => (h === seg.id ? null : h))}
            className="absolute left-1/2 -translate-x-1/2 rounded-full"
            style={{
              top: `${seg.top * 100}%`,
              height: `${seg.height * 100}%`,
              width: wide ? MINIMAP_WIDTH : 4,
              minHeight: 3,
              backgroundColor: segmentColor(seg.role, seg.kind),
              opacity: isHovered ? 1 : 0.85,
              transition: reduceMotion ? undefined : 'width 120ms ease, opacity 120ms ease',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
            title={`${seg.role === 'assistant' ? 'Assistant' : 'Vous'} · ${
              seg.kind === 'code' ? 'code' : seg.kind === 'image' ? 'image' : 'texte'
            }`}
            aria-label={`Aller au message ${seg.role === 'assistant' ? 'de l\'assistant' : 'utilisateur'}`}
          />
        );
      })}

      {/* Indicateur de viewport (portion visible) */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-md pointer-events-none"
        style={{
          top: `${Math.max(0, Math.min(1, viewTop)) * 100}%`,
          height: `${Math.max(0.04, Math.min(1, viewHeight)) * 100}%`,
          width: MINIMAP_WIDTH + 2,
          backgroundColor: 'color-mix(in srgb, var(--accent-primary) 16%, transparent)',
          border: '1px solid color-mix(in srgb, var(--accent-primary) 55%, transparent)',
          boxShadow: '0 0 8px color-mix(in srgb, var(--accent-primary) 25%, transparent)',
        }}
      />
    </div>
  );
}
