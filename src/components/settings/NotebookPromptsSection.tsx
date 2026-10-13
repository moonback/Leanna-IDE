/**
 * NotebookPromptsSection — édition des prompts système des notebooks.
 *
 * Liste tous les prompts exposés par /api/notebooks/prompts (chat, génération,
 * rapports, RAG, voix), permet de les éditer, sauvegarder (override), et
 * réinitialiser à leur valeur par défaut. Les placeholders {{var}} disponibles
 * sont rappelés sous l'éditeur.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  BookText, Save, RotateCcw, RefreshCw, Search, Loader2,
  PencilLine, Undo2, Braces, Code2, Eye, Hash,
} from 'lucide-react';
import { Section } from './SettingsPrimitives.js';
import { useToast } from '../ui/Toast.js';
import { useConfirm } from '../ui/ConfirmDialog.js';
import { renderChatMarkdown } from '../../utils/chatMarkdown.js';
import { sanitizeMarkdownHtml } from '../../utils/sanitizeMarkdownHtml.js';
import { formatTokenCount, formatExactTokenCount } from '../../utils/tokenFormatting.js';

/**
 * Estimation locale des tokens (~4 caractères/token), cohérente avec le reste
 * de l'app. Suffisant pour un repère visuel pendant l'édition.
 */
function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

// ─── Types ──────────────────────────────────────────────────────────────────

type PromptCategory = 'chat' | 'generation' | 'report' | 'rag' | 'voice';

interface PromptPlaceholder {
  name: string;
  description: string;
}

interface NotebookPrompt {
  id: string;
  label: string;
  description: string;
  category: PromptCategory;
  placeholders: PromptPlaceholder[];
  default: string;
  content: string;
  overridden: boolean;
}

const CATEGORY_LABELS: Record<PromptCategory, string> = {
  chat: 'Chat',
  generation: 'Génération de documents',
  report: 'Rapports',
  rag: 'Recherche (RAG)',
  voice: 'Assistant vocal',
};

const CATEGORY_ORDER: PromptCategory[] = ['chat', 'generation', 'report', 'rag', 'voice'];

// ─── Composant ──────────────────────────────────────────────────────────────

export function NotebookPromptsSection() {
  const { success, error: toastError } = useToast();
  const { confirm } = useConfirm();

  const [prompts, setPrompts] = useState<NotebookPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');

  const dirty = content !== originalContent;

  // Aperçu Markdown rendu (pipeline sûr identique au chat : marked + sanitize).
  // Les placeholders {{var}} restent affichés tels quels — c'est volontaire,
  // ils signalent où le contenu dynamique sera injecté.
  const previewHtml = useMemo(() => {
    if (viewMode !== 'preview') return '';
    try {
      return sanitizeMarkdownHtml(renderChatMarkdown(content));
    } catch {
      return '<p>Erreur lors du rendu Markdown.</p>';
    }
  }, [viewMode, content]);

  // Tokens du prompt courant (estimation locale, live pendant la frappe).
  const liveTokens = useMemo(() => estimateTokens(content), [content]);

  // Total estimé de tous les prompts (badge de section).
  const totalTokens = useMemo(
    () => prompts.reduce((sum, p) => sum + estimateTokens(p.content), 0),
    [prompts],
  );

  // ── Chargement de la liste ─────────────────────────────────────────────────
  const loadPrompts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/notebooks/prompts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: NotebookPrompt[] = data.prompts ?? [];
      setPrompts(list);
      setSelectedId(prev => prev ?? list[0]?.id ?? null);
    } catch (err: any) {
      toastError(`Impossible de charger les prompts : ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { loadPrompts(); }, [loadPrompts]);

  const selected = useMemo(
    () => prompts.find(p => p.id === selectedId) ?? null,
    [prompts, selectedId],
  );

  // Synchronise l'éditeur quand on change de prompt sélectionné.
  useEffect(() => {
    if (selected) {
      setContent(selected.content);
      setOriginalContent(selected.content);
    } else {
      setContent('');
      setOriginalContent('');
    }
  }, [selected]);

  const selectPrompt = useCallback(async (id: string) => {
    if (id === selectedId) return;
    if (dirty) {
      const ok = await confirm({
        title: 'Modifications non enregistrées',
        message: 'Changer de prompt et perdre les modifications en cours ?',
        confirmLabel: 'Changer',
        variant: 'warning',
      });
      if (!ok) return;
    }
    setSelectedId(id);
  }, [selectedId, dirty, confirm]);

  // ── Sauvegarde ─────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedId || !dirty) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/notebooks/prompts/${encodeURIComponent(selectedId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const updated: NotebookPrompt | undefined = data.prompt;
      if (updated) {
        setPrompts(prev => prev.map(p => (p.id === updated.id ? updated : p)));
        setOriginalContent(updated.content);
        setContent(updated.content);
      } else {
        setOriginalContent(content);
      }
      success('Prompt enregistré ✓');
    } catch (err: any) {
      toastError(`Enregistrement impossible : ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [selectedId, content, dirty, success, toastError]);

  // ── Réinitialisation (suppression de l'override) ───────────────────────────
  const handleReset = useCallback(async () => {
    if (!selectedId || !selected) return;
    const ok = await confirm({
      title: 'Réinitialiser le prompt',
      message: `Réinitialiser « ${selected.label} » à sa valeur par défaut ? La personnalisation sera supprimée.`,
      confirmLabel: 'Réinitialiser',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      setResetting(true);
      const res = await fetch(`/api/notebooks/prompts/${encodeURIComponent(selectedId)}`, { method: 'DELETE' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const updated: NotebookPrompt | undefined = data.prompt;
      if (updated) {
        setPrompts(prev => prev.map(p => (p.id === updated.id ? updated : p)));
        setOriginalContent(updated.content);
        setContent(updated.content);
      }
      success('Prompt réinitialisé à sa valeur par défaut.');
    } catch (err: any) {
      toastError(`Réinitialisation impossible : ${err.message}`);
    } finally {
      setResetting(false);
    }
  }, [selectedId, selected, confirm, success, toastError]);

  const handleRevert = useCallback(() => {
    setContent(originalContent);
  }, [originalContent]);

  const handleResetAll = useCallback(async () => {
    const ok = await confirm({
      title: 'Tout réinitialiser',
      message: 'Réinitialiser TOUS les prompts des notebooks à leurs valeurs par défaut ? Toutes vos personnalisations seront supprimées.',
      confirmLabel: 'Tout réinitialiser',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch('/api/notebooks/prompts/reset-all', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: NotebookPrompt[] = data.prompts ?? [];
      setPrompts(list);
      const cur = list.find(p => p.id === selectedId);
      if (cur) { setContent(cur.content); setOriginalContent(cur.content); }
      success('Tous les prompts ont été réinitialisés.');
    } catch (err: any) {
      toastError(`Réinitialisation impossible : ${err.message}`);
    }
  }, [confirm, selectedId, success, toastError]);

  // ── Liste filtrée + groupée par catégorie ──────────────────────────────────
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? prompts.filter(p =>
          p.label.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q))
      : prompts;
    const by: Record<string, NotebookPrompt[]> = {};
    for (const p of filtered) (by[p.category] ??= []).push(p);
    return CATEGORY_ORDER
      .filter(c => by[c]?.length)
      .map(c => ({ category: c, items: by[c] }));
  }, [prompts, query]);

  const overriddenCount = useMemo(() => prompts.filter(p => p.overridden).length, [prompts]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Section
      icon={BookText}
      title="Prompts Notebooks"
      description="Personnalisez tous les prompts système utilisés par les notebooks (chat, génération de documents, rapports, recherche RAG, assistant vocal)."
      badge={`${prompts.length} prompts · ~${formatTokenCount(totalTokens)} tokens${overriddenCount > 0 ? ` · ${overriddenCount} modifié${overriddenCount > 1 ? 's' : ''}` : ''}`}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,260px)_1fr]">
        {/* ── Liste ──────────────────────────────────────────────────────── */}
        <div
          className="flex flex-col rounded-xl border overflow-hidden"
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)' }}
        >
          <div className="flex items-center gap-1.5 p-2" style={{ borderBottom: '1px solid var(--border-base)' }}>
            <div className="relative flex flex-1 items-center">
              <Search className="absolute left-2 h-3 w-3 opacity-50" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Filtrer…"
                className="w-full rounded-lg py-1 pl-7 pr-2 text-xs outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
              />
            </div>
            <button
              type="button"
              onClick={loadPrompts}
              title="Rafraîchir"
              className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors hover:opacity-80"
              style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex max-h-[460px] flex-col gap-2 overflow-y-auto custom-scrollbar p-1.5">
            {loading && prompts.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-6 text-xs" style={{ color: 'var(--text-dimmed)' }}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
              </div>
            )}
            {!loading && grouped.length === 0 && (
              <p className="py-6 text-center text-xs" style={{ color: 'var(--text-dimmed)' }}>Aucun prompt</p>
            )}
            {grouped.map(group => (
              <div key={group.category} className="flex flex-col gap-0.5">
                <p className="px-2 pt-1 pb-0.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                  {CATEGORY_LABELS[group.category]}
                </p>
                {group.items.map(p => {
                  const isActive = p.id === selectedId;
                  const isDirtyItem = isActive && dirty;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPrompt(p.id)}
                      className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all"
                      style={{
                        backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
                        border: `1px solid ${isActive ? 'var(--accent-primary)' : 'transparent'}`,
                      }}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs font-medium"
                          style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                          title={p.label}
                        >
                          {p.label}
                        </span>
                        <span className="flex items-center gap-0.5 text-xs font-mono tabular-nums" style={{ color: 'var(--text-dimmed)' }}>
                          <Hash className="h-2.5 w-2.5 opacity-60" />
                          {formatTokenCount(estimateTokens(p.content))} tokens
                        </span>
                      </span>
                      {p.overridden && !isDirtyItem && (
                        <PencilLine className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
                      )}
                      {isDirtyItem && (
                        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: 'var(--color-warning)' }} title="Non enregistré" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {overriddenCount > 0 && (
            <div className="p-2" style={{ borderTop: '1px solid var(--border-base)' }}>
              <button
                type="button"
                onClick={handleResetAll}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
                style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}
              >
                <RotateCcw className="h-3 w-3" /> Tout réinitialiser
              </button>
            </div>
          )}
        </div>

        {/* ── Éditeur ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          {!selected ? (
            <div
              className="flex flex-1 items-center justify-center rounded-xl border py-12 text-xs"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)', color: 'var(--text-dimmed)' }}
            >
              Sélectionnez un prompt à gauche pour l'éditer.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {selected.label}
                    <span className="ml-1.5 font-mono font-normal" style={{ color: 'var(--text-dimmed)' }}>{selected.id}</span>
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    {selected.description}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs font-mono tabular-nums" style={{ color: 'var(--text-dimmed)' }}
                    title={`${formatExactTokenCount(liveTokens)} tokens estimés`}>
                    <Hash className="h-2.5 w-2.5 opacity-60" />
                    ~{formatTokenCount(liveTokens)} tokens
                    {selected.overridden && (
                      <span className="ml-1.5 flex items-center gap-0.5 rounded px-1 py-0.5 font-sans font-medium"
                        style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
                        <PencilLine className="h-2.5 w-2.5" /> personnalisé
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {/* Bascule Éditer / Aperçu */}
                  <div className="flex items-center rounded-lg p-0.5"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}>
                    <button
                      type="button"
                      onClick={() => setViewMode('edit')}
                      title="Éditer"
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all"
                      style={{ backgroundColor: viewMode === 'edit' ? 'var(--accent-primary)' : 'transparent', color: viewMode === 'edit' ? '#fff' : 'var(--text-muted)' }}
                    >
                      <Code2 className="h-3 w-3" /> Éditer
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('preview')}
                      title="Aperçu du Markdown rendu"
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all"
                      style={{ backgroundColor: viewMode === 'preview' ? 'var(--accent-primary)' : 'transparent', color: viewMode === 'preview' ? '#fff' : 'var(--text-muted)' }}
                    >
                      <Eye className="h-3 w-3" /> Aperçu
                    </button>
                  </div>
                  {dirty && (
                    <motion.button
                      type="button"
                      onClick={handleRevert}
                      whileTap={{ scale: 0.95 }}
                      title="Annuler les modifications non enregistrées"
                      className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium"
                      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
                    >
                      <Undo2 className="h-3 w-3" /> Annuler
                    </motion.button>
                  )}
                  <motion.button
                    type="button"
                    onClick={handleReset}
                    disabled={resetting || (!selected.overridden && !dirty)}
                    whileTap={{ scale: 0.95 }}
                    title="Réinitialiser à la valeur par défaut"
                    className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium disabled:opacity-40"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
                  >
                    {resetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Défaut
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !dirty}
                    whileTap={{ scale: 0.95 }}
                    title="Enregistrer"
                    className="flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Enregistrer
                  </motion.button>
                </div>
              </div>

              {viewMode === 'edit' ? (
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  spellCheck={false}
                  className="min-h-[360px] w-full flex-1 resize-y rounded-xl border p-3 text-xs leading-relaxed outline-none font-mono custom-scrollbar"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: dirty ? 'var(--color-warning)' : 'var(--border-base)', color: 'var(--text-primary)' }}
                />
              ) : (
                <div
                  className="markdown-body min-h-[360px] w-full flex-1 overflow-auto rounded-xl border p-4 text-sm leading-relaxed custom-scrollbar"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}

              {/* Placeholders disponibles */}
              {selected.placeholders.length > 0 && (
                <div
                  className="rounded-xl border p-3"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)' }}
                >
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    <Braces className="h-3 w-3" style={{ color: 'var(--accent-primary)' }} />
                    Variables disponibles
                  </p>
                  <div className="flex flex-col gap-1">
                    {selected.placeholders.map(ph => (
                      <div key={ph.name} className="flex items-start gap-2 text-xs">
                        <code
                          className="flex-shrink-0 rounded px-1.5 py-0.5 font-mono"
                          style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
                        >
                          {`{{${ph.name}}}`}
                        </code>
                        <span style={{ color: 'var(--text-muted)' }}>{ph.description}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs" style={{ color: 'var(--text-dimmed)' }}>
                    Insérez ces variables dans le texte avec la syntaxe {`{{nom}}`}. Elles sont remplacées automatiquement à l'exécution.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Section>
  );
}
