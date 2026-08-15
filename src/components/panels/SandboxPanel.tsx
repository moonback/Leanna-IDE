import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Box, RefreshCw, Upload, Trash2, Loader2, CheckCircle2,
  XCircle, Power, Lock, ShieldCheck,
  GitCompareArrows, FileCode2,
  AlertTriangle, AlertOctagon, Play, ChevronDown,
  Bot, RotateCcw,
} from 'lucide-react';
import { useSandboxWatcher } from '../../hooks/useSandboxWatcher';
import { useLiveAPIContext } from '../../context/LiveAPIContext';

interface SandboxStatus {
  active: boolean;
  path: string;
  modifiedFiles: string[];
  modifiedCount: number;
  lastSync: string | null;
  exists: boolean;
}

interface TscDiagnostic {
  file: string | null;
  line: number | null;
  column: number | null;
  code: string | null;
  severity: 'error' | 'warning' | 'info';
  message: string;
  raw: string;
}

interface ValidationState {
  loading: boolean;
  ran: boolean;
  valid: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errorCount: number;
  warningCount: number;
  diagnostics: TscDiagnostic[];
  globalDiagnostics: TscDiagnostic[];
  errorsByFile: Record<string, TscDiagnostic[]>;
  rawOutput: string;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('jarvis_api_token');
  return token ? { 'x-jarvis-token': token } : {};
}

interface SandboxPanelProps {
  onOpenDiff: (initialFile: string | null) => void;
}

/**
 * SandboxPanel — Panneau de contrôle du workspace sandbox.
 * Design épuré, suivi d'état clair, tooltips, fichiers cliquables.
 */
export function SandboxPanel({ onOpenDiff }: SandboxPanelProps) {
  const [status, setStatus] = useState<SandboxStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [securityCode, setSecurityCode] = useState('');
  const [showResetCodeInput, setShowResetCodeInput] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const codeInputRef = useRef<HTMLInputElement>(null);
  const resetCodeRef = useRef<HTMLInputElement>(null);
  const hasFetched = useRef(false);
  const [expandedErrors, setExpandedErrors] = useState(false);
  const [showModifiedFiles, setShowModifiedFiles] = useState(false);
  const [showAdvancedActions, setShowAdvancedActions] = useState(false);
  const [askingAI, setAskingAI] = useState(false);
  const [validation, setValidation] = useState<ValidationState>({
    loading: false,
    ran: false,
    valid: true,
    exitCode: null,
    stdout: '',
    stderr: '',
    errorCount: 0,
    warningCount: 0,
    diagnostics: [],
    globalDiagnostics: [],
    errorsByFile: {},
    rawOutput: '',
  });

  const liveAPI = useLiveAPIContext();

  const applyValidationResult = useCallback((data: any) => {
    setValidation({
      loading: false,
      ran: true,
      valid: !!data.valid,
      exitCode: typeof data.exitCode === 'number' ? data.exitCode : null,
      stdout: typeof data.stdout === 'string' ? data.stdout : '',
      stderr: typeof data.stderr === 'string' ? data.stderr : '',
      errorCount: data.errorCount ?? 0,
      warningCount: data.warningCount ?? 0,
      diagnostics: Array.isArray(data.diagnostics) ? data.diagnostics : [],
      globalDiagnostics: Array.isArray(data.globalDiagnostics) ? data.globalDiagnostics : [],
      errorsByFile: (data.errorsByFile && typeof data.errorsByFile === 'object') ? data.errorsByFile : {},
      rawOutput: data.rawOutput ?? data.errors ?? '',
    });
  }, []);

  const runValidation = useCallback(async () => {
    setValidation(v => ({ ...v, loading: true }));
    try {
      const res = await fetch('/api/sandbox/validate', { method: 'POST', headers: authHeaders() });
      if (!res.ok) {
        setValidation(v => ({ ...v, loading: false, ran: true, valid: false, errorCount: 0, warningCount: 0, diagnostics: [], errorsByFile: {}, rawOutput: `HTTP ${res.status}` }));
        return;
      }
      const data = await res.json();
      applyValidationResult(data);
    } catch {
      setValidation(v => ({ ...v, loading: false, ran: true, valid: false, errorCount: 0, warningCount: 0, diagnostics: [], errorsByFile: {}, rawOutput: 'Erreur réseau' }));
    }
  }, [applyValidationResult]);

  const askAIToFix = useCallback(async () => {
    if (!validation.ran) {
      await runValidation();
    }
    const filesWithIssues = Object.entries(validation.errorsByFile ?? {});
    const hasGlobalIssues = (validation.globalDiagnostics ?? []).length > 0;
    if (filesWithIssues.length === 0 && !hasGlobalIssues) {
      setFeedback({ type: 'success', msg: 'Aucune erreur — rien à corriger' });
      return;
    }
    if (!liveAPI.connected) {
      setFeedback({ type: 'error', msg: 'Connecte d\'abord l\'assistant vocal (bouton orb)' });
      return;
    }
    setAskingAI(true);
    try {
      const fetched: string[] = [];
      for (const [file] of filesWithIssues) {
        try {
          const r = await fetch(`/api/sandbox/file-diff?path=${encodeURIComponent(file)}`, { headers: authHeaders() });
          if (r.ok) {
            const d = await r.json();
            if (typeof d.modified === 'string') {
              fetched.push(file + '||' + d.modified);
            }
          }
        } catch { /* skip */ }
      }

      const diagBlocks: string[] = [];
      for (const [file, diags] of filesWithIssues) {
        const list = (diags as TscDiagnostic[]).map(d =>
          `  • [${d.severity.toUpperCase()} ${d.code ?? ''}] L${d.line}${d.column !== null ? `:C${d.column}` : ''} — ${d.message}`
        ).join('\n');
        diagBlocks.push(`### Erreurs dans ${file} :\n${list}`);
      }
      if (hasGlobalIssues) {
        const list = validation.globalDiagnostics.map(d =>
          `  • [${d.severity.toUpperCase()} ${d.code ?? ''}] ${d.message}`
        ).join('\n');
        diagBlocks.push(`### Erreurs globales tsc :\n${list}`);
      }

      const codeBlocks: string[] = [];
      for (const entry of fetched) {
        const [file, ...rest] = entry.split('||');
        const content = rest.join('||');
        codeBlocks.push(`### Contenu sandbox de ${file} :\n\`\`\`${file.endsWith('.tsx') || file.endsWith('.ts') ? 'typescript' : file.endsWith('.json') ? 'json' : ''}\n${content}\n\`\`\``);
      }

      const prompt = [
        '## DEMANDE : Corriger les erreurs TypeScript du SANDBOX',
        '',
        'Contexte : Les modifications ci-dessous se trouvent DANS LE SANDBOX (`.jarvis/sandbox/`) et ont été validées par `tsc --noEmit`. Il faut corriger uniquement les erreurs listées dans CHAQUE FICHIER, en respectant strictement l\'intention du code original. Ecris dans le sandbox via les outils `read_project_file`/`modify_project_file`/`write_project_file` en utilisant le path sandbox comme WORKSPACE TEMPORAIRE (le vrai workspace racine est le dossier contenant `.jarvis/sandbox/`).',
        '',
        '## Liste des erreurs TSC :',
        ...diagBlocks,
        '',
        '## Code sandbox complet (contenu modifié actuel) :',
        ...codeBlocks,
        '',
        'Règles à suivre OBLIGATOIREMENT :',
        '1. Lis d\'abord chaque fichier concerné dans le sandbox avant de le modifier.',
        '2. Corriger UNIQUEMENT les erreurs listées ci-dessus — ne PAS faire de refactoring, ne PAS toucher aux lignes non concernées. Toute correction doit être un patch minimal et réversible.',
        '3. Conserver strictement le style, la structure DOM, l’ordre des blocs, les noms de variables/fonctions et le comportement existants.',
        '4. Ne pas remplacer tout le fichier pour une erreur locale. Ne pas modifier className, styles inline, imports d’icônes ou layout sauf si le diagnostic cible précisément cette ligne.',
        '5. Préserver les classes Tailwind existantes (ne pas introduire de classe arbitraire comme border-slate-8) et ne pas convertir les styles existants vers une autre approche.',
        '6. Après chaque modification : déclencher une re-validation via Valider (côté utilisateur) ou re-tenter tsc --noEmit.',
        '7. Si une erreur implique un fichier hors sandbox (dépendance du workspace principal), lire le fichier original pour comprendre l’API attendue.',
        '8. Ne PAS synchroniser auto vers le workspace principal — laisse l’utilisateur valider chaque changement.',
        '',
        'Commence par résumer brièvement ce que tu vas faire, puis applique les corrections fichier par fichier.',
      ].join('\n');

      liveAPI.sendTextMessage(prompt);
      window.dispatchEvent(new CustomEvent('jarvis-ide-action', { detail: { type: 'open-ide' } }));
      setFeedback({ type: 'success', msg: `Demande envoyée — ${filesWithIssues.length} fichier(s) à corriger` });
    } catch (e: any) {
      setFeedback({ type: 'error', msg: e.message || 'Échec envoi' });
    } finally {
      setAskingAI(false);
    }
  }, [validation.errorsByFile, validation.ran, liveAPI, runValidation]);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sandbox/status', { headers: authHeaders() });
      const data = await res.json();
      if (data.status === 'success') setStatus(data.sandbox);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (showCodeInput && codeInputRef.current) {
      codeInputRef.current.focus();
      return;
    }
    if (showResetCodeInput && resetCodeRef.current) {
      resetCodeRef.current.focus();
    }
  }, [showCodeInput, showResetCodeInput]);

  useEffect(() => {
    if (!status?.active) return;
    if (validation.ran) return;
    runValidation();
  }, [status?.active, validation.ran, runValidation]);

  useSandboxWatcher({
    enabled: status?.active ?? false,
    onFileChanged: useCallback((_rp: string) => {
      fetchStatus();
    }, [fetchStatus]),
    onTreeChanged: useCallback(() => {
      fetchStatus();
      window.dispatchEvent(new CustomEvent('jarvis-sandbox-changed'));
    }, [fetchStatus]),
    onFileDeleted: useCallback((_rp: string) => {
      fetchStatus();
      window.dispatchEvent(new CustomEvent('jarvis-sandbox-changed'));
    }, [fetchStatus]),
  });

  const doAction = useCallback(async (action: string, method = 'POST', body?: object) => {
    setBusy(action);
    setFeedback(null);
    try {
      const headers: Record<string, string> = {
        ...authHeaders(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      };
      const res = await fetch(`/api/sandbox/${action}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await res.json();
      if (data.status === 'success') {
        setFeedback({ type: 'success', msg: actionMessages[action] || 'OK' });
        window.dispatchEvent(new CustomEvent('jarvis-sandbox-changed'));
        setShowCodeInput(false);
        setSecurityCode('');
        // Si sync réussit : reset validation à "clean"
                if (action === 'sync' || action === 'discard') {
                  applyValidationResult({ valid: true, errorCount: 0, warningCount: 0, diagnostics: [], errorsByFile: {}, rawOutput: '' });
                }
                if (action === 'init' || action === 'activate' || action === 'reset') {
                  runValidation();
                }
      } else if (data.status === 'validation_failed') {
        applyValidationResult(data);
        const filesInError = Object.keys(data.errorsByFile || {}).length;
        const errCount = data.errorCount ?? 0;
        let msg: string;
        if (errCount === 0 && filesInError === 0) {
          // Échec tsc sans erreurs parsées — problème de config ou chemin
          const raw = (data.rawOutput || data.errors || '').trim();
          msg = raw
            ? `Échec build (config tsc) — ${raw.slice(0, 120)}${raw.length > 120 ? '…' : ''}`
            : 'Échec build — vérifiez la config tsc du sandbox';
        } else {
          msg = `${errCount} erreur(s) dans ${filesInError} fichier(s) — voir les différences`;
        }
        setFeedback({ type: 'error', msg });
      } else {
        setFeedback({ type: 'error', msg: data.error || 'Erreur' });
      }
      await fetchStatus();
    } catch (e: any) {
      setFeedback({ type: 'error', msg: e.message || 'Erreur réseau' });
    } finally { setBusy(null); }
  }, [fetchStatus, applyValidationResult, runValidation]);

  const handleDeactivate = useCallback(() => {
    if (!showCodeInput) {
      setShowCodeInput(true);
      setSecurityCode('');
      setShowResetCodeInput(false);
      setFeedback(null);
      return;
    }
    if (securityCode.length !== 6) {
      setFeedback({ type: 'error', msg: '6 chiffres requis' });
      return;
    }
    doAction('deactivate', 'POST', { code: securityCode });
  }, [showCodeInput, securityCode, doAction]);

  const handleReset = useCallback(() => {
    if (!showResetCodeInput) {
      setShowResetCodeInput(true);
      setResetCode('');
      setShowCodeInput(false);
      setFeedback(null);
      return;
    }
    if (resetCode.length !== 6) {
      setFeedback({ type: 'error', msg: '6 chiffres requis' });
      return;
    }
    doAction('reset', 'POST', { code: resetCode });
  }, [showResetCodeInput, resetCode, doAction]);

  const actionMessages: Record<string, string> = {
      init: 'Sandbox initialisé',
      activate: 'Sandbox activé',
      deactivate: 'Sandbox désactivé',
      sync: 'Synchronisation réussie',
      discard: 'Modifications abandonnées',
      reset: 'Sandbox réinitialisé',
    };

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center gap-2 py-10" style={{ color: 'var(--text-dimmed)' }}>
        <Loader2 size={14} className="animate-spin" />
        <span className="text-[11px]">Chargement…</span>
      </div>
    );
  }

  return (
    <>
    <div className="flex flex-col gap-3 p-3">

      {/* ═══ Vue d'ensemble ═══ */}
      <div
        className="rounded-xl border px-3 py-3 flex items-center gap-3"
        style={{
          borderColor: status?.active ? 'rgba(74,222,128,0.24)' : 'var(--border-base)',
          backgroundColor: status?.active ? 'rgba(74,222,128,0.045)' : 'var(--bg-input)',
        }}
      >
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: status?.active ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.04)' }}
        >
          <Box size={15} style={{ color: status?.active ? 'var(--color-success)' : 'var(--text-dimmed)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              {status?.active ? 'Sandbox actif' : 'Sandbox inactif'}
            </span>
            {status?.active && <ShieldCheck size={12} style={{ color: 'var(--color-success)' }} />}
          </div>
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {status?.modifiedCount ?? 0} modification{(status?.modifiedCount ?? 0) > 1 ? 's' : ''}
          </p>
        </div>
        {validation.ran && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold flex-shrink-0"
            style={{
              backgroundColor: validation.valid ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
              color: validation.valid ? 'var(--color-success)' : '#f87171',
            }}
            title={validation.valid ? 'Build sandbox valide' : `Build sandbox invalide — ${validation.errorCount} erreurs`}
          >
            {validation.loading
              ? <><Loader2 size={10} className="animate-spin" /> Validation</>
              : validation.valid
              ? <><CheckCircle2 size={10} /> Prêt</>
              : <><AlertOctagon size={10} /> {validation.errorCount} erreur{validation.errorCount > 1 ? 's' : ''}</>}
          </span>
        )}
        <button
          type="button"
          onClick={fetchStatus}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          title="Rafraîchir l'état du sandbox"
          aria-label="Rafraîchir l'état du sandbox"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* ═══ Quick actions — compact row ═══ */}
      <div className="flex flex-col gap-1.5">

        {/* Deactivate */}
        {status?.active && (
          <ActionRow
            icon={<Lock size={12} />}
            label="Désactiver"
            color="var(--color-warning)"
            onClick={handleDeactivate}
            busy={busy === 'deactivate'}
            tooltip="Entrez un code à 6 chiffres pour désactiver le sandbox"
          />
        )}

        {/* Activate */}
        {status?.exists && !status.active && (
          <ActionRow
            icon={<Power size={12} />}
            label="Activer"
            color="var(--color-success)"
            onClick={() => doAction('activate')}
            busy={busy === 'activate'}
            tooltip="Isoler les écritures dans le sandbox"
          />
        )}

        {/* Init */}
        {!status?.exists && (
          <ActionRow
            icon={<Box size={12} />}
            label="Initialiser"
            color="var(--accent-primary)"
            onClick={() => doAction('init')}
            busy={busy === 'init'}
            tooltip="Copier le code source dans un espace isolé"
          />
        )}

        {/* Validate build */}
        {status?.active && (
          <ActionRow
            icon={validation.loading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            label={validation.ran
              ? validation.valid
                ? `Build valide${validation.warningCount ? ` · ${validation.warningCount} warn` : ''}`
                : `Corriger ${validation.errorCount} erreur${validation.errorCount > 1 ? 's' : ''}`
              : 'Valider le build'}
            color={validation.ran && !validation.valid ? 'var(--color-error)' : 'var(--accent-primary)'}
            onClick={runValidation}
            busy={validation.loading}
            tooltip="Lancer TypeScript --noEmit sur le sandbox pour détecter erreurs et avertissements"
          />
        )}

        {/* Ask AI to fix */}
        {status?.active && validation.ran && (validation.errorCount + validation.warningCount) > 0 && (
          <ActionRow
            icon={askingAI ? <Loader2 size={12} className="animate-spin" /> : <Bot size={12} />}
            label={askingAI
              ? 'Envoi en cours…'
              : `Demander à l'IA de corriger (${Object.keys(validation.errorsByFile).length} fichier${Object.keys(validation.errorsByFile).length > 1 ? 's' : ''})`}
            color="var(--color-purple, #a78bfa)"
            onClick={askAIToFix}
            busy={askingAI}
            tooltip="Envoyer à l'assistant IA le code sandbox complet + toutes les erreurs TSC, avec instruction de ne corriger que ces erreurs"
          />
        )}

        {/* Security code input */}
        <AnimatePresence>
          {showCodeInput && status?.active && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--bg-input)' }}>
                <input
                  ref={codeInputRef}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Code 6 chiffres"
                  value={securityCode}
                  onChange={(e) => setSecurityCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleDeactivate();
                    if (e.key === 'Escape') { setShowCodeInput(false); setSecurityCode(''); }
                  }}
                  className="flex-1 bg-transparent outline-none text-[11px] font-mono tracking-[0.25em] text-center"
                  style={{ color: 'var(--text-primary)' }}
                />
                <button
                  onClick={handleDeactivate}
                  disabled={securityCode.length !== 6}
                  className="text-[9px] font-bold px-2 py-1 rounded transition-opacity disabled:opacity-30"
                  style={{ color: 'var(--color-warning)' }}
                >
                  OK
                </button>
                <button
                  onClick={() => { setShowCodeInput(false); setSecurityCode(''); }}
                  className="text-[9px] px-1 py-0.5 rounded hover:bg-white/10"
                  style={{ color: 'var(--text-dimmed)' }}
                >
                  ✕
                </button>
              </div>
            </motion.div>
          )}
          {showResetCodeInput && status?.exists && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--bg-input)' }}>
                <input
                  ref={resetCodeRef}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Code 6 chiffres"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleReset();
                    if (e.key === 'Escape') { setShowResetCodeInput(false); setResetCode(''); }
                  }}
                  className="flex-1 bg-transparent outline-none text-[11px] font-mono tracking-[0.25em] text-center"
                  style={{ color: 'var(--text-primary)' }}
                />
                <button
                  onClick={handleReset}
                  disabled={resetCode.length !== 6}
                  className="text-[9px] font-bold px-2 py-1 rounded transition-opacity disabled:opacity-30"
                  style={{ color: 'var(--color-warning)' }}
                >
                  OK
                </button>
                <button
                  onClick={() => { setShowResetCodeInput(false); setResetCode(''); }}
                  className="text-[9px] px-1 py-0.5 rounded hover:bg-white/10"
                  style={{ color: 'var(--text-dimmed)' }}
                >
                  ✕
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ Changements ═══ */}
        {status?.active && status.modifiedCount > 0 && (
          <>
            <div className="h-px my-1" style={{ backgroundColor: 'var(--border-base)' }} />
            <ActionRow
              icon={<GitCompareArrows size={12} />}
              label="Examiner les modifications"
              color="var(--color-info)"
              onClick={() => onOpenDiff(null)}
              busy={false}
              tooltip="Comparer avant/après, accepter ou rejeter fichier par fichier"
              highlight
            />
          </>
        )}

        {/* ═══ Actions avancées ═══ */}
        {status?.exists && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvancedActions(value => !value)}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[11px] font-medium transition-colors hover:bg-white/5"
              style={{ color: 'var(--text-muted)' }}
              aria-expanded={showAdvancedActions}
            >
              <span>Actions avancées</span>
              <ChevronDown
                size={13}
                style={{ transform: showAdvancedActions ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .15s' }}
              />
            </button>
            <AnimatePresence initial={false}>
              {showAdvancedActions && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-1 pt-1">
                    {status.active && status.modifiedCount > 0 && (
                      <ActionRow
                        icon={<Upload size={12} />}
                        label="Synchroniser tout"
                        color="var(--color-success)"
                        onClick={() => doAction('sync')}
                        busy={busy === 'sync'}
                        tooltip="Valider le build puis appliquer toutes les modifications au repo principal"
                      />
                    )}
                    {status.active && status.modifiedCount > 0 && (
                      <ActionRow
                        icon={<Trash2 size={12} />}
                        label="Tout rejeter"
                        color="var(--color-error)"
                        onClick={() => doAction('discard')}
                        busy={busy === 'discard'}
                        tooltip="Supprimer toutes les modifications et réinitialiser le sandbox"
                      />
                    )}
                    <ActionRow
                      icon={<RotateCcw size={12} />}
                      label="Réinitialiser le sandbox"
                      color="var(--color-warning)"
                      onClick={handleReset}
                      busy={busy === 'reset'}
                      tooltip="Écraser le sandbox avec une copie fraîche du code source (code requis)"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ═══ Modified files — clickable to open diff ═══ */}
      {status?.active && status.modifiedFiles.length > 0 && (
        <div className="mt-1 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-base)' }}>
          <button
            type="button"
            onClick={() => setShowModifiedFiles(value => !value)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-white/5"
            aria-expanded={showModifiedFiles}
          >
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Fichiers modifiés
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-input)' }}>
                {status.modifiedFiles.length}
              </span>
              <ChevronDown size={13} style={{ color: 'var(--text-dimmed)', transform: showModifiedFiles ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .15s' }} />
            </span>
          </button>
          {showModifiedFiles && (
            <div className="space-y-0.5 max-h-44 overflow-y-auto custom-scrollbar px-1.5 pb-1.5">
            {status.modifiedFiles.map(f => {
              const Icon = FileCode2;
              const fileDiags = validation.ran ? (validation.errorsByFile[f] ?? []) : [];
              const errCount = fileDiags.filter(d => d.severity === 'error').length;
              const warnCount = fileDiags.filter(d => d.severity === 'warning').length;
              const hasIssues = errCount > 0 || warnCount > 0;
              const iconColor = hasIssues ? '#f87171' : 'var(--accent-primary)';

              return (
                <button
                  key={f}
                  onClick={() => onOpenDiff(f)}
                  className="group w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all hover:bg-white/5"
                  style={{
                    borderLeft: hasIssues ? `2px solid rgba(248,113,113,0.45)` : '2px solid transparent',
                  }}
                  title={hasIssues
                    ? `${f} — ${errCount} erreur(s), ${warnCount} avertissement(s)`
                    : `Cliquer pour voir les modifications de ${f}`}
                >
                  <Icon size={11} style={{ color: iconColor, flexShrink: 0 }} />
                  <span className="text-[10px] font-mono truncate flex-1 transition-colors group-hover:text-[var(--text-primary)]" style={{ color: 'var(--text-secondary)' }}>
                    {f}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {errCount > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full px-1 py-[1px] text-[8px] font-bold"
                        style={{ backgroundColor: 'rgba(248,113,113,0.15)', color: '#f87171' }}
                      >
                        <AlertOctagon size={7} />
                        {errCount}
                      </span>
                    )}
                    {warnCount > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full px-1 py-[1px] text-[8px] font-bold"
                        style={{ backgroundColor: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}
                      >
                        <AlertTriangle size={7} />
                        {warnCount}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            </div>
          )}
        </div>
      )}

      {/* ═══ Validation errors panel — fichier par fichier ═══ */}

  {/* Cas tsc config/global error : afficher stdout/stderr même sans diagnostic rattaché à un fichier */}
      {validation.ran && !validation.valid && Object.keys(validation.errorsByFile).length === 0 && validation.rawOutput && (
        <div
          className="rounded-lg overflow-hidden border"
          style={{ borderColor: 'rgba(248,113,113,0.25)', backgroundColor: 'rgba(248,113,113,0.04)' }}
        >
          <div className="flex items-center gap-1.5 px-2.5 py-1.5">
            <AlertOctagon size={11} style={{ color: '#f87171' }} />
            <span className="text-[10px] font-bold" style={{ color: '#f87171' }}>
              Échec build{validation.exitCode !== null ? ` (code ${validation.exitCode})` : ''} (configuration ou diagnostic global tsc)
            </span>
          </div>
          <div className="px-2.5 pb-2.5">
            <pre
              className="text-[9.5px] font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto custom-scrollbar rounded p-2"
              style={{ backgroundColor: 'rgba(0,0,0,0.2)', color: '#fca5a5' }}
            >
              {validation.exitCode !== null && `exitCode: ${validation.exitCode}\n`}
              {validation.stdout && `stdout:\n${validation.stdout}\n`}
              {validation.stderr && `stderr:\n${validation.stderr}\n`}
              {!validation.stdout && !validation.stderr && validation.rawOutput}
            </pre>
          </div>
        </div>
      )}

      {validation.ran && validation.errorCount + validation.warningCount > 0 && (
        <div
          className="rounded-lg overflow-hidden border"
          style={{
            borderColor: validation.errorCount > 0 ? 'rgba(248,113,113,0.25)' : 'rgba(251,191,36,0.25)',
            backgroundColor: validation.errorCount > 0 ? 'rgba(248,113,113,0.04)' : 'rgba(251,191,36,0.04)',
          }}
        >
          <div
            className="flex items-center justify-between px-2.5 py-1.5 cursor-pointer select-none"
            onClick={() => setExpandedErrors(v => !v)}
          >
            <div className="flex items-center gap-1.5">
              {validation.errorCount > 0 ? (
                <AlertOctagon size={11} style={{ color: '#f87171' }} />
              ) : (
                <AlertTriangle size={11} style={{ color: '#fbbf24' }} />
              )}
              <span className="text-[10px] font-bold" style={{ color: validation.errorCount > 0 ? '#f87171' : '#fbbf24' }}>
                {validation.errorCount} erreur{validation.errorCount > 1 ? 's' : ''}
                {validation.warningCount > 0 && ` · ${validation.warningCount} avertissement${validation.warningCount > 1 ? 's' : ''}`}
              </span>
              <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
                dans {Object.keys(validation.errorsByFile).length} fichier{Object.keys(validation.errorsByFile).length > 1 ? 's' : ''}
              </span>
            </div>
            <ChevronDown size={12} style={{ color: 'var(--text-dimmed)', transform: expandedErrors ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .15s' }} />
          </div>
          <AnimatePresence initial={false}>
            {expandedErrors && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="divide-y max-h-64 overflow-y-auto custom-scrollbar" style={{ borderColor: 'var(--border-base)' }}>
                  {Object.entries(validation.errorsByFile).map(([file, diags]) => {
                    const errs = (diags as TscDiagnostic[]).filter(d => d.severity === 'error').length;
                    const warns = (diags as TscDiagnostic[]).filter(d => d.severity === 'warning').length;
                    return (
                      <div key={file} className="px-2.5 py-2">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <FileCode2 size={9} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                          <span className="text-[9.5px] font-mono truncate flex-1" style={{ color: 'var(--text-secondary)' }}>
                            {file}
                          </span>
                          {errs > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded-full px-1 py-[1px] text-[8px] font-bold"
                              style={{ backgroundColor: 'rgba(248,113,113,0.15)', color: '#f87171' }}
                            >
                              <AlertOctagon size={6} />{errs}
                            </span>
                          )}
                          {warns > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded-full px-1 py-[1px] text-[8px] font-bold"
                              style={{ backgroundColor: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}
                            >
                              <AlertTriangle size={6} />{warns}
                            </span>
                          )}
                        </div>
                        <ul className="space-y-0.5 font-mono pl-2.5">
                          {(diags as TscDiagnostic[]).map((d, i) => (
                            <li key={i} className="flex gap-1.5 text-[9.5px] leading-snug">
                              <span
                                className="flex-shrink-0 w-20 text-right tabular-nums"
                                style={{ color: 'var(--text-dimmed)' }}
                              >
                                {d.line !== null
                                  ? `L${d.line}${d.column !== null ? `:C${d.column}` : ''}`
                                  : 'global'}
                              </span>
                              <span
                                className="flex-shrink-0 w-14 font-bold uppercase tracking-wider"
                                style={{
                                  color:
                                    d.severity === 'error' ? '#f87171' :
                                    d.severity === 'warning' ? '#fbbf24' :
                                    'var(--text-muted)',
                                }}
                              >
                                {d.code ?? d.severity}
                              </span>
                              <span style={{ color: 'var(--text-primary)' }} className="flex-1">
                                {d.message}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ═══ Last sync ═══ */}
      {status?.lastSync && (
        <p className="text-[9px] text-center mt-1" style={{ color: 'var(--text-dimmed)' }}>
          Sync : {new Date(status.lastSync).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
        </p>
      )}

      {/* ═══ Feedback ═══ */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[10px] font-medium"
            style={{
              backgroundColor: feedback.type === 'success'
                ? 'color-mix(in srgb, var(--color-success) 8%, transparent)'
                : 'color-mix(in srgb, var(--color-error) 8%, transparent)',
              color: feedback.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            }}
          >
            {feedback.type === 'success' ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
            <span>{feedback.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </>
  );
}

// ── ActionRow — compact button with icon, label, tooltip ─────────────────────

function ActionRow({ icon, label, color, onClick, busy, tooltip, highlight }: {
  icon: React.ReactNode;
  label: string;
  color: string;
  onClick: () => void;
  busy: boolean;
  tooltip: string;
  highlight?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={busy}
      whileTap={{ scale: 0.98 }}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all disabled:opacity-50 w-full group"
      style={{
        backgroundColor: highlight
          ? `color-mix(in srgb, ${color} 10%, transparent)`
          : 'transparent',
        border: highlight
          ? `1px solid color-mix(in srgb, ${color} 22%, transparent)`
          : '1px solid transparent',
      }}
      title={tooltip}
    >
      <div
        className="flex h-6 w-6 items-center justify-center rounded-md flex-shrink-0 transition-transform group-hover:scale-110"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
      >
        {busy ? <Loader2 size={11} className="animate-spin" /> : icon}
      </div>
      <span className="text-[11px] font-medium transition-colors group-hover:text-[var(--text-primary)]" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
    </motion.button>
  );
}
