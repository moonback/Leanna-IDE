/**
 * NotesCanvas — Vue spatiale des notes (type Obsidian Canvas)
 *
 * Espace 2D pour positionner librement les notes, les relier,
 * zoomer/dézoomer, et drag & drop.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Pin, Move, Link2 } from 'lucide-react';
import { timeAgo } from './utils.js';
import { NbIconButton } from './ui/primitives.js';

interface NoteItem {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  notes: NoteItem[];
  onSelectNote?: (noteId: string) => void;
}

export function NotesCanvas({ notes, onSelectNote }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragId, setDragId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const dragStartRef = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 });
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Initialize positions in a grid layout
  useEffect(() => {
    const cols = Math.max(2, Math.ceil(Math.sqrt(notes.length)));
    const newPos: Record<string, { x: number; y: number }> = {};
    let needsInit = false;

    notes.forEach((note, i) => {
      if (!positions[note.id]) {
        needsInit = true;
        const col = i % cols;
        const row = Math.floor(i / cols);
        newPos[note.id] = { x: col * 270 + 30, y: row * 180 + 30 };
      } else {
        newPos[note.id] = positions[note.id];
      }
    });

    if (needsInit) setPositions(newPos);
  }, [notes.length]);

  // ─── Backlinks detection ──────────────────────────────────────────────────

  const connections = useMemo(() => {
    const links: { from: string; to: string }[] = [];
    notes.forEach(note => {
      notes.forEach(other => {
        if (note.id === other.id) return;
        if (other.title.length < 3) return;
        if (note.content.toLowerCase().includes(other.title.toLowerCase())) {
          if (!links.some(l => (l.from === note.id && l.to === other.id) || (l.from === other.id && l.to === note.id))) {
            links.push({ from: note.id, to: other.id });
          }
        }
      });
    });
    return links;
  }, [notes]);

  // ─── Mouse handlers (window-level for reliable drag) ───────────────────────

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (dragId) {
        const dx = (e.clientX - dragStartRef.current.x) / zoom;
        const dy = (e.clientY - dragStartRef.current.y) / zoom;
        setPositions(prev => ({
          ...prev,
          [dragId]: {
            x: dragStartRef.current.nodeX + dx,
            y: dragStartRef.current.nodeY + dy,
          },
        }));
      } else if (isPanning) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setPan({
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy,
        });
      }
    };

    const handleUp = () => {
      setDragId(null);
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragId, isPanning, zoom]);

  const startDrag = useCallback((e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const pos = positions[noteId] || { x: 0, y: 0 };
    dragStartRef.current = { x: e.clientX, y: e.clientY, nodeX: pos.x, nodeY: pos.y };
    setDragId(noteId);
  }, [positions]);

  const startPan = useCallback((e: React.MouseEvent) => {
    // Only pan if clicking on the background
    if ((e.target as HTMLElement).closest('[data-note-card]')) return;
    e.preventDefault();
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    setIsPanning(true);
  }, [pan]);

  // ─── Zoom ─────────────────────────────────────────────────────────────────

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom(prev => Math.max(0.3, Math.min(2.5, prev + delta)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden select-none bg-[var(--notebook-canvas)]"
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      onMouseDown={startPan}
    >
      {/* Grid pattern background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle, var(--text-primary) 1px, transparent 1px)`,
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${pan.x % (20 * zoom)}px ${pan.y % (20 * zoom)}px`,
        }}
      />

      {/* Toolbar */}
      <div
        className="absolute top-3 right-3 z-30 flex items-center gap-1 rounded-full border border-[var(--notebook-border)] bg-[color-mix(in_srgb,var(--notebook-surface)_90%,transparent)] p-1 shadow-lg backdrop-blur-sm"
      >
        <NbIconButton
          icon={ZoomIn}
          size="sm"
          label="Zoom avant"
          onClick={() => setZoom(prev => Math.min(2.5, prev + 0.2))}
        />
        <span className="min-w-[36px] text-center font-mono text-xs text-[var(--text-dimmed)]">
          {Math.round(zoom * 100)}%
        </span>
        <NbIconButton
          icon={ZoomOut}
          size="sm"
          label="Zoom arrière"
          onClick={() => setZoom(prev => Math.max(0.3, prev - 0.2))}
        />
        <div className="mx-1 h-4 w-px bg-[var(--notebook-border)]" />
        <NbIconButton
          icon={Maximize2}
          size="sm"
          label="Réinitialiser la vue"
          onClick={resetView}
        />
      </div>

      {/* Info bar */}
      <div
        className="absolute bottom-3 left-3 z-30 rounded-full border border-[var(--notebook-border)] bg-[color-mix(in_srgb,var(--notebook-surface)_90%,transparent)] px-3 py-1 text-xs text-[var(--text-dimmed)] backdrop-blur-sm"
      >
        {notes.length} notes • {connections.length} lien{connections.length !== 1 ? 's' : ''} • Glissez les cartes • Molette = zoom
      </div>

      {/* Transformed layer */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          position: 'absolute',
          inset: 0,
        }}
      >
        {/* Connection lines */}
        <svg className="pointer-events-none absolute inset-0 h-[4000px] w-[4000px] overflow-visible" aria-hidden>
          {connections.map(({ from, to }, i) => {
            const fromPos = positions[from];
            const toPos = positions[to];
            if (!fromPos || !toPos) return null;

            const x1 = fromPos.x + 120;
            const y1 = fromPos.y + 45;
            const x2 = toPos.x + 120;
            const y2 = toPos.y + 45;
            const mx = (x1 + x2) / 2;

            return (
              <g key={i}>
                <path
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="var(--notebook-accent)"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                  opacity={0.35}
                />
                {/* Dot at connection point */}
                <circle cx={x1} cy={y1} r="3" fill="var(--notebook-accent)" opacity={0.5} />
                <circle cx={x2} cy={y2} r="3" fill="var(--notebook-accent)" opacity={0.5} />
              </g>
            );
          })}
        </svg>

        {/* Note cards */}
        {notes.map(note => {
          const pos = positions[note.id] || { x: 0, y: 0 };
          const isConnected = connections.some(c => c.from === note.id || c.to === note.id);
          const isDragging = dragId === note.id;

          return (
            <div
              key={note.id}
              data-note-card="true"
              className="absolute"
              style={{
                left: pos.x,
                top: pos.y,
                width: 240,
                zIndex: isDragging ? 50 : 10,
                transition: isDragging ? 'none' : 'box-shadow 0.2s',
              }}
            >
              <div
                className={`rounded-xl border bg-[var(--notebook-card-bg)] p-3 transition-shadow ${isConnected ? 'border-[var(--notebook-accent)]' : 'border-[var(--notebook-border)]'} ${isDragging ? 'cursor-grabbing shadow-2xl ring-2 ring-[var(--notebook-accent)]' : 'cursor-default shadow-sm hover:shadow-md'}`}
              >
                {/* Drag bar */}
                <div
                  className="mb-2 flex cursor-grab items-center gap-1 border-b border-[var(--notebook-border)] pb-2 active:cursor-grabbing"
                  onMouseDown={(e) => startDrag(e, note.id)}
                >
                  <Move className="h-3 w-3 flex-shrink-0 text-[var(--text-dimmed)]" aria-hidden />
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    {note.pinned && <Pin className="h-3 w-3 flex-shrink-0 text-[var(--notebook-accent)]" aria-hidden />}
                    <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
                      {note.title}
                    </span>
                  </div>
                  {isConnected && (
                    <Link2 className="h-3 w-3 flex-shrink-0 text-[var(--notebook-accent)]" aria-hidden />
                  )}
                </div>

                {/* Content preview — clickable */}
                <div
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => onSelectNote?.(note.id)}
                >
                  <p className="line-clamp-4 text-xs leading-relaxed text-[var(--text-muted)]">
                    {note.content || 'Note vide — cliquez pour éditer'}
                  </p>
                </div>

                {/* Meta */}
                <div className="mt-2 flex items-center gap-2 border-t border-[var(--notebook-border)] pt-2">
                  <span className="text-xs text-[var(--text-dimmed)]">
                    {timeAgo(note.updatedAt)}
                  </span>
                  <span className="text-xs text-[var(--text-dimmed)]">
                    {note.content.length} car.
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
