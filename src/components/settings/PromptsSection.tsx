import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileCog, FileText, Save, RotateCcw, RefreshCw, Search,
  AlertTriangle, Check, Loader2, Undo2, PencilLine, Code2, Eye,
  Copy, Download, Hash,
} from 'lucide-react';
import { Section } from './SettingsPrimitives.js';
import { useToast } from '../ui/Toast.js';
import { useProfile } from '../../context/UserProfileContext.js';
import { MarkdownPromptEditor } from './MarkdownPromptEditor.js';
import { renderChatMarkdown } from '../../utils/chatMarkdown.js';
import { sanitizeMarkdownHtml } from '../../utils/sanitizeMarkdownHtml.js';
import { formatTokenCount, formatExactTokenCount } from '../../utils/tokenFormatting.js';

// Thèmes de l'app considérés comme sombres (pour accorder l'éditeur Monaco).
const DARK_THEMES = new Set(['dark', 'cyberpunk', 'high-contrast']);

// ─── Types ──────────────────────────────────────────────────────────────────

interface PromptFileMeta {
  name: string;
  size: number;
  modified: string;
  /** Estimation du nombre de tokens (fournie par le serveur via tiktoken). */
  tokens?: number;
  /** Nombre de lignes du fichier. */
  lines?: number;
  /** true si le fichier a été personnalisé (override enregistré). */
  overridden?: boolean;
}

/**
 * Estimation locale des tokens pendant la frappe (le serveur recalcule la
 * valeur exacte à la sauvegarde). Heuristique ~4 caractères/token, cohérente
 * avec le reste de l'app.
 */
function estimateTokensLocal(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  return `${(bytes / 1024).toFixed(1)} Ko`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Libellé lisible dérivé du nom de fichier (ex: "agents-system.md" → "Agents System"). */
function prettyLabel(name: string): string {
  return name
    .replace(/\.md$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function PromptsSection() {
  const { success, error: toastError } = useToast();
  const { profile } = useProfile();
  const dark = DARK_THEMES.has(profile.theme);

  const [files, setFiles] = useState<PromptFileMeta[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');

  const dirty = content !== originalContent;

  // ── Chargement de la liste ──────────────────────────────────────────────────

  const loadList = useCallback(async () => {
    try {
      setLoadingList(true);
      const res = await fetch('/api/prompts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: PromptFileMeta[] = data.files ?? [];
      setFiles(list);
      // Sélectionne le premier fichier par défaut si rien n'est sélectionné.
      setSelected(prev => prev ?? list[0]?.name ?? null);
    } catch (err: any) {
      toastError(`Impossible de lister les prompts : ${err.message}`);
    } finally {
      setLoadingList(false);
    }
  }, [toastError]);

  useEffect(() => { loadList(); }, [loadList]);

  // ── Chargement du fichier sélectionné ─────────────────────────────────────────

  const loadFile = useCallback(async (name: string) => {
    try {
      setLoadingFile(true);
      const res = await fetch(`/api/prompts/${encodeURIComponent(name)}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setContent(data.content ?? '');
      setOriginalContent(data.content ?? '');
      // Synchronise l'état renvoyé par le serveur (override, tokens, lignes).
      setFiles(prev => prev.map(f => f.name === name
        ? {
            ...f,
            overridden: typeof data.overridden === 'boolean' ? data.overridden : f.overridden,
            tokens: typeof data.tokens === 'number' ? data.tokens : f.tokens,
            lines: typeof data.lines === 'number' ? data.lines : f.lines,
          }
        : f));
    } catch (err: any) {
      toastError(`Lecture impossible : ${err.message}`);
      setContent('');
      setOriginalContent('');
    } finally {
      setLoadingFile(false);
    }
  }, [toastError]);

  useEffect(() => {
    if (selected) loadFile(selected);
  }, [selected, loadFile]);

  // ── Sélection d'un fichier (confirme si modifications non enregistrées) ───────

  const selectFile = useCallback((name: string) => {
    if (name === selected) return;
    if (dirty && !window.confirm('Modifications non enregistrées. Changer de fichier et les perdre ?')) {
      return;
    }
    setSelected(name);
  }, [selected, dirty]);

  // ── Sauvegarde ────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!selected || !dirty) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/prompts/${encodeURIComponent(selected)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setOriginalContent(content);
      // Rafraîchit les métadonnées (taille / date / tokens / lignes / override).
      setFiles(prev => prev.map(f => f.name === selected
        ? {
            ...f,
            size: data.size ?? f.size,
            modified: data.modified ?? f.modified,
            tokens: typeof data.tokens === 'number' ? data.tokens : f.tokens,
            lines: typeof data.lines === 'number' ? data.lines : f.lines,
            overridden: true,
          }
        : f));
      success(`"${selected}" enregistré ✓ — effectif au prochain démarrage de session.`);
    } catch (err: any) {
      toastError(`Enregistrement impossible : ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [selected, content, dirty, success, toastError]);

  // ── Réinitialisation (suppression de l'override → version par défaut) ─────────

  const handleReset = useCallback(async () => {
    if (!selected) return;
    if (!window.confirm(`Réinitialiser "${selected}" à sa version par défaut ? La personnalisation sera supprimée.`)) {
      return;
    }
    try {
      setResetting(true);
      const res = await fetch(`/api/prompts/${encodeURIComponent(selected)}`, { method: 'DELETE' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      setFiles(prev => prev.map(f => f.name === selected ? { ...f, overridden: false } : f));
      await loadFile(selected); // recharge la version bundlée
      success(`"${selected}" réinitialisé à sa version par défaut.`);
    } catch (err: any) {
      toastError(`Réinitialisation impossible : ${err.message}`);
    } finally {
      setResetting(false);
    }
  }, [selected, loadFile, success, toastError]);

  const handleRevert = useCallback(() => {
    setContent(originalContent);
  }, [originalContent]);

  // ── Copier le contenu dans le presse-papier ───────────────────────────────────

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      success('Contenu copié dans le presse-papier.');
    } catch {
      toastError('Copie impossible (presse-papier indisponible).');
    }
  }, [content, success, toastError]);

  // ── Télécharger le fichier .md ─────────────────────────────────────────────────

  const handleDownload = useCallback(() => {
    if (!selected) return;
    try {
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = selected;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toastError('Téléchargement impossible.');
    }
  }, [selected, content, toastError]);

  // Aperçu rendu (pipeline sûr identique au chat : marked + sanitize).
  const previewHtml = useMemo(() => {
    if (viewMode !== 'preview') return '';
    try {
      return sanitizeMarkdownHtml(renderChatMarkdown(content));
    } catch {
      return '<p>Erreur lors du rendu Markdown.</p>';
    }
  }, [viewMode, content]);

  // ── Liste filtrée ─────────────────────────────────────────────────────────────

  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter(f =>
      f.name.toLowerCase().includes(q) || prettyLabel(f.name).toLowerCase().includes(q));
  }, [files, query]);

  const selectedMeta = files.find(f => f.name === selected);
  const lineCount = content ? content.split('\n').length : 0;
  const charCount = content.length;

  // Tokens du fichier affiché : valeur serveur (exacte) quand rien n'est modifié,
  // estimation locale pendant la frappe.
  const liveTokens = dirty
    ? estimateTokensLocal(content)
    : (selectedMeta?.tokens ?? estimateTokensLocal(content));

  // Total des tokens de tous les fichiers (pour le badge de section).
  const totalTokens = useMemo(
    () => files.reduce((sum, f) => sum + (f.tokens ?? 0), 0),
    [files],
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Section
      icon={FileCog}
      title="Prompts Système (.md)"
      description="Affichez et modifiez les fichiers Markdown qui composent le prompt système de l'assistant"
      badge={`${files.length} fichier${files.length !== 1 ? 's' : ''} · ~${formatTokenCount(totalTokens)} tokens`}
    >
      {/* Avertissement : contenu sensible */}
      <div
        className="flex items-start gap-2 rounded-xl border p-3"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-warning) 8%, var(--bg-secondary))',
          borderColor: 'color-mix(in srgb, var(--color-warning) 40%, var(--border-base))',
        }}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: 'var(--color-warning)' }} />
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
           comportement de base de l'assistant (sécurité, autonomie, persona…).
          Une modification s'applique au prochain démarrage de session. Modifiez avec précaution.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,240px)_1fr]">
        {/* ── Liste des fichiers ──────────────────────────────────────────── */}
        <div
          className="flex flex-col rounded-xl border overflow-hidden"
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)' }}
        >
          {/* Recherche + refresh */}
          <div className="flex items-center gap-1.5 p-2" style={{ borderBottom: '1px solid var(--border-base)' }}>
            <div className="relative flex flex-1 items-center">
              <Search className="absolute left-2 h-3 w-3 opacity-50" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Filtrer…"
                className="w-full rounded-lg py-1 pl-7 pr-2 text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-base)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <button
              type="button"
              onClick={loadList}
              title="Rafraîchir la liste"
              className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors hover:opacity-80"
              style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}
            >
              <RefreshCw className={`h-3 w-3 ${loadingList ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Items */}
          <div className="flex max-h-[420px] flex-col gap-0.5 overflow-y-auto custom-scrollbar p-1.5">
            {loadingList && files.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-6 text-xs" style={{ color: 'var(--text-dimmed)' }}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
              </div>
            )}
            {!loadingList && filteredFiles.length === 0 && (
              <p className="py-6 text-center text-xs" style={{ color: 'var(--text-dimmed)' }}>
                Aucun fichier
              </p>
            )}
            {filteredFiles.map(f => {
              const isActive = f.name === selected;
              const isDirtyFile = isActive && dirty;
              return (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => selectFile(f.name)}
                  className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all"
                  style={{
                    backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
                    border: `1px solid ${isActive ? 'var(--accent-primary)' : 'transparent'}`,
                  }}
                >
                  <FileText
                    className="h-3.5 w-3.5 flex-shrink-0"
                    style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className="truncate text-xs font-medium"
                      style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                      title={f.name}
                    >
                      {f.name}
                    </span>
                    {typeof f.tokens === 'number' && (
                      <span
                        className="flex items-center gap-0.5 text-[10px] font-mono tabular-nums"
                        style={{ color: 'var(--text-dimmed)' }}
                        title={`${formatExactTokenCount(f.tokens)} tokens estimés`}
                      >
                        <Hash className="h-2.5 w-2.5 opacity-60" />
                        {formatTokenCount(f.tokens)} tokens
                      </span>
                    )}
                  </span>
                  {f.overridden && !isDirtyFile && (
                    <PencilLine
                      className="h-3 w-3 flex-shrink-0"
                      style={{ color: 'var(--accent-primary)' }}
                    />
                  )}
                  {isDirtyFile && (
                    <span
                      className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: 'var(--color-warning)' }}
                      title="Modifications non enregistrées"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Éditeur ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          {!selected ? (
            <div
              className="flex flex-1 items-center justify-center rounded-xl border py-12 text-xs"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-base)', color: 'var(--text-dimmed)' }}
            >
              Sélectionnez un fichier à gauche pour l'éditer.
            </div>
          ) : (
            <>
              {/* En-tête fichier */}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {prettyLabel(selected)}
                    <span className="ml-1.5 font-mono font-normal" style={{ color: 'var(--text-dimmed)' }}>
                      {selected}
                    </span>
                  </p>
                  {selectedMeta && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-dimmed)' }}>
                      <span>{formatSize(selectedMeta.size)} · modifié le {formatDate(selectedMeta.modified)}</span>
                      {selectedMeta.overridden && (
                        <span
                          className="flex items-center gap-0.5 rounded px-1 py-0.5 font-medium"
                          style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
                        >
                          <PencilLine className="h-2.5 w-2.5" /> personnalisé
                        </span>
                      )}
                    </p>
                  )}
                </div>

                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {/* Bascule Éditer / Aperçu */}
                  <div
                    className="flex items-center rounded-lg p-0.5"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}
                  >
                    <button
                      type="button"
                      onClick={() => setViewMode('edit')}
                      title="Éditer (coloration syntaxique)"
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all"
                      style={{
                        backgroundColor: viewMode === 'edit' ? 'var(--accent-primary)' : 'transparent',
                        color: viewMode === 'edit' ? '#fff' : 'var(--text-muted)',
                      }}
                    >
                      <Code2 className="h-3 w-3" /> Éditer
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('preview')}
                      title="Aperçu du Markdown rendu"
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all"
                      style={{
                        backgroundColor: viewMode === 'preview' ? 'var(--accent-primary)' : 'transparent',
                        color: viewMode === 'preview' ? '#fff' : 'var(--text-muted)',
                      }}
                    >
                      <Eye className="h-3 w-3" /> Aperçu
                    </button>
                  </div>

                  {/* Copier */}
                  <motion.button
                    type="button"
                    onClick={handleCopy}
                    whileTap={{ scale: 0.95 }}
                    title="Copier le contenu dans le presse-papier"
                    className="flex items-center justify-center rounded-lg border px-2 py-1 text-xs font-medium transition-all hover:opacity-80"
                    style={{ borderColor: 'var(--border-base)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
                  >
                    <Copy className="h-3 w-3" />
                  </motion.button>

                  {/* Télécharger */}
                  <motion.button
                    type="button"
                    onClick={handleDownload}
                    whileTap={{ scale: 0.95 }}
                    title="Télécharger le fichier .md"
                    className="flex items-center justify-center rounded-lg border px-2 py-1 text-xs font-medium transition-all hover:opacity-80"
                    style={{ borderColor: 'var(--border-base)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
                  >
                    <Download className="h-3 w-3" />
                  </motion.button>

                  {selectedMeta?.overridden && (
                    <motion.button
                      type="button"
                      onClick={handleReset}
                      whileTap={{ scale: 0.95 }}
                      disabled={saving || resetting}
                      title="Supprimer la personnalisation et revenir à la version par défaut"
                      className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-all disabled:opacity-30"
                      style={{ borderColor: 'var(--border-base)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
                    >
                      {resetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                      Par défaut
                    </motion.button>
                  )}
                  <motion.button
                    type="button"
                    onClick={handleRevert}
                    whileTap={{ scale: 0.95 }}
                    disabled={!dirty || saving}
                    className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-all disabled:opacity-30"
                    style={{ borderColor: 'var(--border-base)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Annuler
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={handleSave}
                    whileTap={{ scale: 0.95 }}
                    disabled={!dirty || saving}
                    className="flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold transition-all disabled:opacity-40"
                    style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    {saving ? 'Enregistrement…' : 'Enregistrer'}
                  </motion.button>
                </div>
              </div>

              {/* Zone d'édition / aperçu */}
              <div className="relative">
                {loadingFile && (
                  <div
                    className="absolute inset-0 z-10 flex items-center justify-center rounded-xl"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--bg-base) 70%, transparent)' }}
                  >
                    <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--accent-primary)' }} />
                  </div>
                )}

                {viewMode === 'edit' ? (
                  <MarkdownPromptEditor
                    value={content}
                    onChange={setContent}
                    dark={dark}
                    height="420px"
                    readOnly={loadingFile}
                    onSave={handleSave}
                  />
                ) : (
                  <div
                    className="markdown-body overflow-y-auto custom-scrollbar rounded-xl px-5 py-4"
                    style={{
                      backgroundColor: 'var(--bg-base)',
                      border: '1px solid var(--border-base)',
                      color: 'var(--text-primary)',
                      height: '420px',
                    }}
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML assaini via sanitizeMarkdownHtml
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                )}
              </div>

              {/* Barre d'état */}
              <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-dimmed)' }}>
                <span className="flex items-center gap-2 font-mono tabular-nums">
                  <span>{lineCount} lignes · {charCount} car.</span>
                  <span
                    className="flex items-center gap-0.5"
                    style={{ color: 'var(--accent-primary)' }}
                    title={`${formatExactTokenCount(liveTokens)} tokens${dirty ? ' (estimation en cours de frappe)' : ' (estimation serveur)'}`}
                  >
                    <Hash className="h-3 w-3 opacity-70" />
                    {dirty ? '~' : ''}{formatTokenCount(liveTokens)} tokens
                  </span>
                </span>
                <AnimatePresence mode="wait">
                  {dirty ? (
                    <motion.span
                      key="dirty"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex items-center gap-1 font-medium"
                      style={{ color: 'var(--color-warning)' }}
                    >
                      <AlertTriangle className="h-3 w-3" /> Non enregistré · Ctrl+S
                    </motion.span>
                  ) : (
                    <motion.span
                      key="saved"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex items-center gap-1 font-medium"
                      style={{ color: 'var(--color-success)' }}
                    >
                      <Check className="h-3 w-3" /> À jour
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </div>
    </Section>
  );
}
