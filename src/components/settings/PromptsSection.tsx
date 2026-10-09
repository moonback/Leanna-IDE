import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileCog, FileText, Save, RotateCcw, RefreshCw, Search,
  AlertTriangle, Check, Loader2, Undo2, PencilLine, Code2, Eye,
  Copy, Download, Hash, Sparkles, Wand2, X, ArrowDown,
  GitCompare, Columns2, Rows2,
} from 'lucide-react';
import { Section } from './SettingsPrimitives.js';
import { Modal } from '../ui/Modal.js';
import { useToast } from '../ui/Toast.js';
import { useProfile } from '../../context/UserProfileContext.js';
import { MarkdownPromptEditor } from './MarkdownPromptEditor.js';
import { MarkdownPromptDiff } from './MarkdownPromptDiff.js';
import { renderChatMarkdown } from '../../utils/chatMarkdown.js';
import { sanitizeMarkdownHtml } from '../../utils/sanitizeMarkdownHtml.js';
import { formatTokenCount, formatExactTokenCount } from '../../utils/tokenFormatting.js';

// Thèmes de l'app considérés comme sombres (pour accorder l'éditeur Monaco).
const DARK_THEMES = new Set(['dark', 'cyberpunk', 'high-contrast']);

// Objectifs d'optimisation IA proposés à l'utilisateur.
const OPTIMIZE_GOALS: { id: string; label: string; hint: string }[] = [
  { id: 'general', label: 'Amélioration générale', hint: 'Clarté, structure et concision sans changer l\'intention' },
  { id: 'clarity', label: 'Clarté', hint: 'Lever les ambiguïtés et contradictions' },
  { id: 'concise', label: 'Concision', hint: 'Supprimer les redondances, rester complet' },
  { id: 'robust', label: 'Robustesse', hint: 'Renforcer garde-fous et cas limites' },
  { id: 'tokens', label: 'Moins de tokens', hint: 'Compacter sans perdre de règles' },
];

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
  // Version PAR DÉFAUT (prompt bundlé d'origine) : sert de référence au diff,
  // y compris après enregistrement, pour voir l'écart cumulé vs l'original.
  const [defaultContent, setDefaultContent] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'diff'>('edit');
  // Affichage du diff : côte à côte (true) ou en ligne/unifié (false).
  const [diffSideBySide, setDiffSideBySide] = useState(true);

  // Optimisation IA
  const [optimizing, setOptimizing] = useState(false);
  const [optimizePanelOpen, setOptimizePanelOpen] = useState(false);
  const [optimizeGoal, setOptimizeGoal] = useState('general');
  const [optimizeInstructions, setOptimizeInstructions] = useState('');
  // Dernier résultat IA (pour afficher le gain de tokens et pouvoir annuler).
  const [optimizeResult, setOptimizeResult] = useState<{
    before: string;
    tokensBefore: number;
    tokensAfter: number;
    provider: string;
    model: string;
  } | null>(null);

  // Modal « demande précise » pour l'optimisation d'une sélection (remplace
  // window.prompt, indisponible dans Electron).
  const [selModalOpen, setSelModalOpen] = useState(false);
  const [selModalText, setSelModalText] = useState('');
  const [selModalPreview, setSelModalPreview] = useState('');
  // Résout la saisie du modal : chaîne = instruction (vide = libre), null = annulé.
  const selModalResolver = useRef<((v: string | null) => void) | null>(null);

  /** Ouvre le modal et renvoie une promesse résolue à la validation / annulation. */
  const askSelectionInstruction = useCallback((selection: string): Promise<string | null> => {
    setSelModalPreview(selection);
    setSelModalText('');
    setSelModalOpen(true);
    return new Promise<string | null>((resolve) => {
      selModalResolver.current = resolve;
    });
  }, []);

  const resolveSelModal = useCallback((value: string | null) => {
    selModalOpen && setSelModalOpen(false);
    const r = selModalResolver.current;
    selModalResolver.current = null;
    r?.(value);
  }, [selModalOpen]);

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
      setOptimizeResult(null); // nouvelle lecture → oublier toute proposition IA en cours
      // Charge en parallèle le contenu effectif (override si présent) ET la
      // version par défaut (bundlée) qui sert de référence permanente au diff.
      const [res, baseRes] = await Promise.all([
        fetch(`/api/prompts/${encodeURIComponent(name)}`),
        fetch(`/api/prompts/${encodeURIComponent(name)}?base=1`),
      ]);
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setContent(data.content ?? '');
      setOriginalContent(data.content ?? '');

      // Version par défaut : si l'appel échoue (ex: fichier uniquement en
      // override sans base), on retombe sur le contenu effectif.
      if (baseRes.ok) {
        const baseData = await baseRes.json().catch(() => null);
        setDefaultContent(baseData?.content ?? data.content ?? '');
      } else {
        setDefaultContent(data.content ?? '');
      }
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
      setOptimizeResult(null); // la proposition est désormais enregistrée
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
    setOptimizeResult(null);
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

  // ── Optimisation IA ────────────────────────────────────────────────────────

  const handleOptimize = useCallback(async () => {
    if (!selected || !content.trim()) return;
    try {
      setOptimizing(true);
      const res = await fetch(`/api/prompts/${encodeURIComponent(selected)}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          goal: optimizeGoal,
          instructions: optimizeInstructions.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.optimized) throw new Error('Réponse IA vide.');

      // On remplace le contenu de l'éditeur par la proposition : elle devient
      // "dirty", l'utilisateur la relit puis Enregistre (ou Annule pour revenir).
      setOptimizeResult({
        before: content,
        tokensBefore: data.tokensBefore ?? 0,
        tokensAfter: data.tokensAfter ?? 0,
        provider: data.provider ?? '',
        model: data.model ?? '',
      });
      setContent(data.optimized);
      // Bascule directement sur le diff pour voir ce que l'IA a changé.
      setViewMode('diff');
      setOptimizePanelOpen(false);
      const delta = (data.tokensBefore ?? 0) - (data.tokensAfter ?? 0);
      const deltaTxt = delta > 0 ? `−${delta} tokens` : delta < 0 ? `+${-delta} tokens` : 'tokens stables';
      success(`Proposition générée (${data.model || data.provider}) · ${deltaTxt}. Relis puis Enregistre.`);
    } catch (err: any) {
      toastError(`Optimisation impossible : ${err.message}`);
    } finally {
      setOptimizing(false);
    }
  }, [selected, content, optimizeGoal, optimizeInstructions, success, toastError]);

  // Optimise un extrait sélectionné (déclenché par le menu contextuel de
  // l'éditeur). Renvoie le texte de remplacement, ou null si annulé/échec.
  const optimizeSelection = useCallback(async ({ selection, mode }: { selection: string; mode: 'auto' | 'manual' }): Promise<string | null> => {
    if (!selected || !selection.trim()) return null;

    let instructions: string | undefined;
    if (mode === 'manual') {
      // Modal in-app (window.prompt n'existe pas dans Electron).
      const answer = await askSelectionInstruction(selection);
      // Annulation (Échap / bouton Annuler) → on abandonne. Chaîne vide → libre.
      if (answer === null) return null;
      instructions = answer.trim() || undefined;
    }

    try {
      setOptimizing(true);
      const res = await fetch(`/api/prompts/${encodeURIComponent(selected)}/optimize-selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selection, context: content, instructions }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.optimized) throw new Error('Réponse IA vide.');
      success(`Sélection optimisée (${data.model || data.provider}).`);
      return data.optimized as string;
    } catch (err: any) {
      toastError(`Optimisation de la sélection impossible : ${err.message}`);
      return null;
    } finally {
      setOptimizing(false);
    }
  }, [selected, content, success, toastError, askSelectionInstruction]);

  // Annule la proposition IA et restaure le contenu d'avant optimisation.
  const handleDiscardOptimization = useCallback(() => {
    if (!optimizeResult) return;
    setContent(optimizeResult.before);
    setOptimizeResult(null);
  }, [optimizeResult]);

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

  // Référence de comparaison pour la vue Diff : TOUJOURS la version par défaut
  // (prompt bundlé d'origine). Ainsi, même après enregistrement, le diff montre
  // l'écart cumulé par rapport à l'original, pas seulement la dernière édition.
  const diffBase = defaultContent;

  // Bilan des lignes ajoutées / retirées entre la référence et le contenu courant.
  const diffStats = useMemo(() => {
    if (diffBase === content) return { added: 0, removed: 0 };
    const baseLines = diffBase.split('\n');
    const curLines = content.split('\n');
    // Multiset des lignes de base pour un comptage simple et robuste.
    const baseCount = new Map<string, number>();
    for (const l of baseLines) baseCount.set(l, (baseCount.get(l) ?? 0) + 1);
    const curCount = new Map<string, number>();
    for (const l of curLines) curCount.set(l, (curCount.get(l) ?? 0) + 1);
    let added = 0;
    for (const [l, n] of curCount) added += Math.max(0, n - (baseCount.get(l) ?? 0));
    let removed = 0;
    for (const [l, n] of baseCount) removed += Math.max(0, n - (curCount.get(l) ?? 0));
    return { added, removed };
  }, [diffBase, content]);

  const hasDiff = diffBase !== content;

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
                    <button
                      type="button"
                      onClick={() => setViewMode('diff')}
                      title="Comparer les modifications (lignes ajoutées / retirées)"
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all"
                      style={{
                        backgroundColor: viewMode === 'diff' ? 'var(--accent-primary)' : 'transparent',
                        color: viewMode === 'diff' ? '#fff' : 'var(--text-muted)',
                      }}
                    >
                      <GitCompare className="h-3 w-3" /> Diff
                      {hasDiff && viewMode !== 'diff' && (
                        <span
                          className="ml-0.5 h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: 'var(--color-warning)' }}
                        />
                      )}
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

                  {/* Optimiser avec l'IA */}
                  <motion.button
                    type="button"
                    onClick={() => setOptimizePanelOpen(o => !o)}
                    whileTap={{ scale: 0.95 }}
                    disabled={optimizing || saving}
                    title="Améliorer / optimiser ce prompt avec l'IA"
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all disabled:opacity-40"
                    style={{
                      backgroundColor: optimizePanelOpen ? 'var(--accent-subtle)' : 'color-mix(in srgb, var(--accent-primary) 14%, transparent)',
                      border: `1px solid ${optimizePanelOpen ? 'var(--accent-primary)' : 'color-mix(in srgb, var(--accent-primary) 40%, transparent)'}`,
                      color: 'var(--accent-primary)',
                    }}
                  >
                    {optimizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    Optimiser (IA)
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

              {/* Panneau d'optimisation IA */}
              <AnimatePresence>
                {optimizePanelOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="flex flex-col gap-3 rounded-xl border p-3"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--accent-primary) 5%, var(--bg-secondary))',
                        borderColor: 'color-mix(in srgb, var(--accent-primary) 35%, var(--border-base))',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>
                          <Wand2 className="h-3.5 w-3.5" /> Optimisation par IA
                        </span>
                        <button
                          type="button"
                          onClick={() => setOptimizePanelOpen(false)}
                          className="rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
                        >
                          <X className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                        </button>
                      </div>

                      {/* Objectifs */}
                      <div className="flex flex-wrap gap-1.5">
                        {OPTIMIZE_GOALS.map(g => {
                          const active = optimizeGoal === g.id;
                          return (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => setOptimizeGoal(g.id)}
                              title={g.hint}
                              className="rounded-full border px-2.5 py-1 text-xs font-medium transition-all"
                              style={{
                                backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-panel)',
                                borderColor: active ? 'var(--accent-primary)' : 'var(--border-base)',
                                color: active ? '#fff' : 'var(--text-muted)',
                              }}
                            >
                              {g.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Consignes libres */}
                      <textarea
                        value={optimizeInstructions}
                        onChange={e => setOptimizeInstructions(e.target.value)}
                        placeholder="Consignes supplémentaires (optionnel) — ex : « garde un ton très direct », « ajoute une règle sur les secrets »…"
                        rows={2}
                        className="w-full resize-y rounded-lg px-2.5 py-2 text-xs outline-none"
                        style={{
                          backgroundColor: 'var(--bg-input)',
                          border: '1px solid var(--border-base)',
                          color: 'var(--text-primary)',
                          minHeight: '48px',
                        }}
                      />

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                          La proposition remplace le texte dans l'éditeur. Rien n'est enregistré tant que tu ne cliques pas sur « Enregistrer ».
                        </span>
                        <motion.button
                          type="button"
                          onClick={handleOptimize}
                          whileTap={{ scale: 0.97 }}
                          disabled={optimizing || !content.trim()}
                          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-40"
                          style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
                        >
                          {optimizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          {optimizing ? 'Optimisation…' : 'Générer la proposition'}
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bandeau résultat IA (proposition en attente de relecture) */}
              <AnimatePresence>
                {optimizeResult && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--accent-primary) 8%, var(--bg-secondary))',
                      borderColor: 'color-mix(in srgb, var(--accent-primary) 35%, var(--border-base))',
                    }}
                  >
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <Sparkles className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
                      <span>
                        Proposition IA ({optimizeResult.model || optimizeResult.provider}) ·{' '}
                        <span className="font-mono tabular-nums">
                          {formatTokenCount(optimizeResult.tokensBefore)}
                          <ArrowDown className="mx-0.5 inline h-3 w-3" />
                          {formatTokenCount(optimizeResult.tokensAfter)} tokens
                        </span>
                        {' · '}Relis puis <strong>Enregistre</strong>, ou annule.
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={handleDiscardOptimization}
                      className="flex flex-shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-all hover:opacity-80"
                      style={{ borderColor: 'var(--border-base)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-panel)' }}
                    >
                      <Undo2 className="h-3 w-3" /> Annuler l'optimisation
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

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

                {viewMode === 'edit' && (
                  <MarkdownPromptEditor
                    value={content}
                    onChange={setContent}
                    dark={dark}
                    height="420px"
                    readOnly={loadingFile}
                    onSave={handleSave}
                    onOptimizeSelection={optimizeSelection}
                  />
                )}

                {viewMode === 'preview' && (
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

                {viewMode === 'diff' && (
                  <div className="flex flex-col gap-2">
                    {/* Barre d'info du diff : légende + bascule côte-à-côte / unifié */}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-3" style={{ color: 'var(--text-dimmed)' }}>
                        <span className="flex items-center gap-1">
                          <span className="font-mono font-semibold" style={{ color: 'var(--color-success)' }}>+{diffStats.added}</span>
                          ajout{diffStats.added !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="font-mono font-semibold" style={{ color: 'var(--color-error)' }}>−{diffStats.removed}</span>
                          retrait{diffStats.removed !== 1 ? 's' : ''}
                        </span>
                        <span style={{ color: 'var(--text-dimmed)' }}>
                          · Gauche : version par défaut · Droite : version courante (éditable)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDiffSideBySide(s => !s)}
                        title={diffSideBySide ? 'Affichage unifié (en ligne)' : 'Affichage côte à côte'}
                        className="flex items-center gap-1 rounded-lg border px-2 py-1 font-medium transition-all hover:opacity-80"
                        style={{ borderColor: 'var(--border-base)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
                      >
                        {diffSideBySide ? <Rows2 className="h-3 w-3" /> : <Columns2 className="h-3 w-3" />}
                        {diffSideBySide ? 'Unifié' : 'Côte à côte'}
                      </button>
                    </div>

                    {hasDiff ? (
                      <MarkdownPromptDiff
                        original={diffBase}
                        modified={content}
                        onChange={setContent}
                        dark={dark}
                        height="420px"
                        sideBySide={diffSideBySide}
                      />
                    ) : (
                      <div
                        className="flex items-center justify-center rounded-xl border text-xs"
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          borderColor: 'var(--border-base)',
                          color: 'var(--text-dimmed)',
                          height: '420px',
                        }}
                      >
                        Ce fichier est identique à sa version par défaut.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Astuce : optimisation d'une sélection via clic droit (mode édition seulement) */}
              {viewMode === 'edit' && (
                <p className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-dimmed)' }}>
                  <Sparkles className="h-3 w-3" style={{ color: 'var(--accent-primary)' }} />
                  Astuce : sélectionne du texte puis clic droit → « Optimiser la sélection » (auto ou avec une demande précise).
                </p>
              )}

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

      {/* Modal : demande précise pour optimiser la sélection */}
      <Modal
        open={selModalOpen}
        onClose={() => resolveSelModal(null)}
        title="Optimiser la sélection"
        size="md"
      >
        <Modal.Body>
          <div className="flex flex-col gap-3">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Décris ce que l'IA doit faire sur l'extrait sélectionné. Laisse vide pour une
              amélioration générale (clarté, concision, robustesse) sans changer le sens.
            </p>

            {/* Aperçu de l'extrait sélectionné */}
            <div
              className="max-h-28 overflow-y-auto custom-scrollbar rounded-lg px-3 py-2 text-xs font-mono whitespace-pre-wrap"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-dimmed)' }}
            >
              {selModalPreview.length > 600 ? selModalPreview.slice(0, 600) + '…' : selModalPreview}
            </div>

            <textarea
              value={selModalText}
              onChange={e => setSelModalText(e.target.value)}
              autoFocus
              placeholder="ex : « rends la consigne plus stricte », « simplifie », « ajoute un exemple concret »…"
              rows={3}
              onKeyDown={e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  resolveSelModal(selModalText);
                }
              }}
              className="w-full resize-y rounded-lg px-3 py-2 text-xs outline-none"
              style={{
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-base)',
                color: 'var(--text-primary)',
                minHeight: '64px',
              }}
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            onClick={() => resolveSelModal(null)}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:opacity-80"
            style={{ borderColor: 'var(--border-base)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => resolveSelModal(selModalText)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
            style={{ backgroundColor: 'var(--accent-primary)', color: '#fff' }}
          >
            <Sparkles className="h-3 w-3" />
            Optimiser {selModalText.trim() ? '' : '(auto)'}
          </button>
        </Modal.Footer>
      </Modal>
    </Section>
  );
}
