/**
 * SlidePreviewModal — Générer et prévisualiser une présentation Reveal.js
 * à partir d'un document Markdown généré dans le notebook.
 *
 * Fonctionnalités :
 * - Sélection du thème (9 thèmes dont Leanna custom)
 * - Sélection de la transition et du ratio
 * - Aperçu live dans un iframe
 * - Téléchargement HTML + ouverture dans un nouvel onglet
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import {
  Presentation, Download, ExternalLink,
  Monitor, Maximize2, ChevronRight,
} from 'lucide-react';
import { useToast } from '../ui/Toast.js';
import { api } from './api/client.js';
import { NbModal, NbButton, NbBadge, NbSectionLabel } from './ui/primitives.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GeneratedDoc {
  id: string;
  type: string;
  title: string;
  content: string;
  createdAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  notebookId: string;
  doc: GeneratedDoc;
}

// ─── Configuration ────────────────────────────────────────────────────────────

const THEMES = [
  { key: 'Leanna',  label: 'Leanna',  emoji: '🤖', desc: 'Dark bleu/violet custom' },
  { key: 'black',   label: 'Black',   emoji: '⬛', desc: 'Sombre minimaliste' },
  { key: 'white',   label: 'White',   emoji: '⬜', desc: 'Clair et épuré' },
  { key: 'moon',    label: 'Moon',    emoji: '🌙', desc: 'Sombre doux, bleuté' },
  { key: 'league',  label: 'League',  emoji: '🏛️', desc: 'Classique, serif élégant' },
  { key: 'sky',     label: 'Sky',     emoji: '☁️', desc: 'Clair, bleu ciel' },
  { key: 'beige',   label: 'Beige',   emoji: '🟤', desc: 'Naturel, tons chauds' },
  { key: 'serif',   label: 'Serif',   emoji: '📰', desc: 'Typographie classique' },
  { key: 'simple',  label: 'Simple',  emoji: '🔘', desc: 'Sobre et universel' },
] as const;

type ThemeKey = typeof THEMES[number]['key'];

const TRANSITIONS = [
  { key: 'slide',   label: 'Glissement' },
  { key: 'fade',    label: 'Fondu' },
  { key: 'zoom',    label: 'Zoom' },
  { key: 'convex',  label: 'Convexe' },
  { key: 'concave', label: 'Concave' },
  { key: 'none',    label: 'Aucune' },
] as const;

type TransitionKey = typeof TRANSITIONS[number]['key'];

const RATIOS = [
  { key: '16:9', label: '16:9', desc: 'Widescreen' },
  { key: '4:3',  label: '4:3',  desc: 'Standard' },
] as const;

type RatioKey = typeof RATIOS[number]['key'];

const DENSITIES = [
  {
    key: 'compact',
    label: 'Résumé',
    emoji: '⚡',
    desc: '3 pts / slide',
    hint: 'Plus de slides, texte court',
  },
  {
    key: 'normal',
    label: 'Équilibré',
    emoji: '⚖️',
    desc: '4 pts / slide',
    hint: 'Recommandé — découpe auto',
  },
  {
    key: 'detailed',
    label: 'Détaillé',
    emoji: '📋',
    desc: '5 pts / slide',
    hint: 'Contenu complet, plus de slides',
  },
] as const;

type DensityKey = typeof DENSITIES[number]['key'];

/** Option sélectionnable (thème, transition, format, densité). */
function optionClass(selected: boolean, shape: string) {
  return clsx(
    'border text-xs font-medium transition-colors',
    shape,
    selected
      ? 'border-[var(--notebook-accent)] bg-[var(--notebook-accent-surface)] text-[var(--notebook-accent)]'
      : 'border-[var(--notebook-border)] bg-[var(--notebook-canvas)] text-[var(--text-muted)] hover:bg-[var(--notebook-surface-muted)] hover:text-[var(--text-primary)]',
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SlidePreviewModal({ open, onClose, notebookId, doc }: Props) {
  const { error: toastError } = useToast();

  // Options
  const [theme, setTheme]           = useState<ThemeKey>('Leanna');
  const [transition, setTransition] = useState<TransitionKey>('slide');
  const [ratio, setRatio]           = useState<RatioKey>('16:9');
  const [density, setDensity]       = useState<DensityKey>('normal');

  // Generation state
  const [loading, setLoading]       = useState(false);
  const [htmlBlob, setHtmlBlob]     = useState<string | null>(null);
  const [slidesCount, setSlidesCount] = useState<number>(0);
  const [blobUrl, setBlobUrl]       = useState<string | null>(null);

  // Preview panel
  const [showPreview, setShowPreview] = useState(false);
  const prevBlobRef = useRef<string | null>(null);

  // Clean up blob URLs on unmount / change
  useEffect(() => {
    return () => {
      if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
    };
  }, []);

  // Reset when modal opens with a new doc
  useEffect(() => {
    if (open) {
      setHtmlBlob(null);
      setBlobUrl(null);
      setShowPreview(false);
      setSlidesCount(0);
    }
  }, [open, doc.id]);

  // Generate or regenerate presentation
  const handleGenerate = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ html: string; slidesCount?: number }>(
        `/api/notebooks/${notebookId}/generated/${doc.id}/slides`,
        { method: 'POST', json: { theme, transition, ratio, density } },
      );
      const html: string = data.html;
      const count: number = data.slidesCount ?? 0;

      // Revoke previous blob URL before creating new one
      if (prevBlobRef.current) {
        URL.revokeObjectURL(prevBlobRef.current);
      }
      const newBlobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      prevBlobRef.current = newBlobUrl;

      setHtmlBlob(html);
      setBlobUrl(newBlobUrl);
      setSlidesCount(count);
      setShowPreview(true);
    } catch (e: any) {
      toastError(e.message);
    } finally {
      setLoading(false);
    }
  }, [notebookId, doc.id, theme, transition, ratio, density, toastError]);

  // Download as .html file
  const handleDownload = useCallback(() => {
    if (!htmlBlob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([htmlBlob], { type: 'text/html' }));
    a.download = `${doc.title.replace(/[^a-zA-Z0-9\s-]/g, '').trim()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // No revoke — the element is clicked synchronously
  }, [htmlBlob, doc.title]);

  // Open in new tab
  const handleOpenTab = useCallback(() => {
    if (!blobUrl) return;
    window.open(blobUrl, '_blank');
  }, [blobUrl]);

  return (
    <NbModal
      open={open}
      onClose={onClose}
      size="md"
      className={clsx(
        'max-h-[90vh] transition-[max-width] duration-300 ease-out',
        showPreview ? '!max-w-[92vw]' : '!max-w-[540px]',
      )}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <NbModal.Header>
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--notebook-accent)_30%,transparent)] bg-[var(--notebook-accent-surface)]">
          <Presentation className="h-4 w-4 text-[var(--notebook-accent)]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
            Présentation Reveal.js
          </h3>
          <p className="mt-0.5 truncate text-xs text-[var(--text-dimmed)]">
            {doc.title}
            {slidesCount > 0 && (
              <NbBadge tone="accent" className="ml-2">
                {slidesCount} slides
              </NbBadge>
            )}
          </p>
        </div>
      </NbModal.Header>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <NbModal.Body noPadding className="flex !overflow-hidden">

        {/* Options sidebar */}
        <div
          className={clsx(
            'custom-scrollbar flex-shrink-0 overflow-y-auto px-6 py-5',
            showPreview ? 'w-[280px] border-r border-[var(--notebook-border)]' : 'w-full',
          )}
        >
          <div className="space-y-5">

            {/* Theme selector */}
            <div className="space-y-2">
              <NbSectionLabel>Thème</NbSectionLabel>
              <div className="grid grid-cols-3 gap-2">
                {THEMES.map(t => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTheme(t.key)}
                    title={t.desc}
                    className={optionClass(theme === t.key, 'flex flex-col items-center gap-1 rounded-xl px-2 py-2')}
                  >
                    <span className="text-base leading-none">{t.emoji}</span>
                    <span className="font-semibold">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Transition selector */}
            <div className="space-y-2">
              <NbSectionLabel>Transition</NbSectionLabel>
              <div className="grid grid-cols-3 gap-2">
                {TRANSITIONS.map(t => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTransition(t.key)}
                    className={optionClass(transition === t.key, 'rounded-full px-2 py-2 text-center')}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Ratio selector */}
            <div className="space-y-2">
              <NbSectionLabel>Format</NbSectionLabel>
              <div className="flex gap-2">
                {RATIOS.map(r => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRatio(r.key)}
                    className={optionClass(ratio === r.key, 'flex flex-1 flex-col items-center gap-0.5 rounded-xl px-3 py-2')}
                  >
                    <Monitor className="mb-0.5 h-3.5 w-3.5" aria-hidden />
                    <span className="font-semibold">{r.label}</span>
                    <span className="text-xs opacity-60">{r.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Density selector */}
            <div className="space-y-2">
              <NbSectionLabel>Densité du contenu</NbSectionLabel>
              <div className="grid grid-cols-3 gap-2">
                {DENSITIES.map(d => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setDensity(d.key)}
                    title={d.hint}
                    className={optionClass(density === d.key, 'flex flex-col items-center gap-1 rounded-xl px-2 py-2')}
                  >
                    <span className="text-base leading-none">{d.emoji}</span>
                    <span className="font-semibold">{d.label}</span>
                    <span className="text-center text-xs leading-tight opacity-60">{d.desc}</span>
                  </button>
                ))}
              </div>
              {density === 'compact' && (
                <p className="rounded-lg border border-[color-mix(in_srgb,var(--notebook-accent)_25%,transparent)] bg-[var(--notebook-accent-surface)] px-3 py-2 text-xs text-[var(--notebook-accent)]">
                  💡 Le contenu est découpé en plusieurs slides — rien n&apos;est masqué ni supprimé.
                </p>
              )}
            </div>

            {/* Note about excluded types */}
            {(doc.type === 'infographic' || doc.type === 'mindmap') && (
              <p className="rounded-lg border border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)] bg-[var(--color-warning-subtle)] px-3 py-2 text-xs leading-relaxed text-[var(--color-warning)]">
                ⚠️ Ce type de document peut produire des slides limitées. Les types Résumé, FAQ, Rapport donnent de meilleurs résultats.
              </p>
            )}

          </div>
        </div>

        {/* Preview panel */}
        <AnimatePresence>
          {showPreview && blobUrl && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: '100%' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="flex min-h-[420px] min-w-0 flex-1 flex-col overflow-hidden"
            >
              {/* Preview toolbar */}
              <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--notebook-border)] bg-[var(--notebook-surface-muted)] px-4 py-2">
                <span className="notebook-eyebrow">
                  APERÇU
                </span>
                <NbButton
                  size="sm"
                  icon={Maximize2}
                  onClick={handleOpenTab}
                  title="Ouvrir en plein écran dans un nouvel onglet"
                >
                  Plein écran
                </NbButton>
              </div>

              {/* iFrame — fond noir : surface du lecteur Reveal.js */}
              <div className="relative flex-1 bg-black">
                <iframe
                  key={blobUrl}
                  src={blobUrl}
                  className="absolute inset-0 h-full w-full border-0"
                  title="Aperçu présentation Reveal.js"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </NbModal.Body>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <NbModal.Footer align="between" className="px-6">
        {/* Left — secondary actions (visible once generated) */}
        <div className="flex items-center gap-2">
          {htmlBlob && (
            <>
              <NbButton
                size="sm"
                icon={Download}
                onClick={handleDownload}
                title="Télécharger le fichier HTML"
              >
                Télécharger HTML
              </NbButton>
              <NbButton
                size="sm"
                icon={ExternalLink}
                onClick={handleOpenTab}
                title="Ouvrir dans un nouvel onglet"
              >
                Ouvrir
              </NbButton>
            </>
          )}
        </div>

        {/* Right — cancel + generate */}
        <div className="ml-auto flex items-center gap-2">
          <NbButton variant="ghost" onClick={onClose}>
            Fermer
          </NbButton>
          <NbButton
            variant="primary"
            icon={Presentation}
            loading={loading}
            onClick={handleGenerate}
          >
            {loading ? 'Génération…' : htmlBlob ? 'Régénérer' : 'Générer les slides'}
            {!loading && <ChevronRight className="h-3 w-3 opacity-70" aria-hidden />}
          </NbButton>
        </div>
      </NbModal.Footer>
    </NbModal>
  );
}
