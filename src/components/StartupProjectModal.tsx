import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FolderOpen, Upload, ShieldAlert, Loader2,
  FolderX, FilePlus, FolderInput, Rocket, Check, Terminal,
} from 'lucide-react';
import { ideApi } from '../services/ideApi';

function getElectronAPI(): { selectFolder: () => Promise<string | null> } | null {
  const w = window as any;
  return w.electronAPI?.selectFolder ? w.electronAPI : null;
}

type Tab = 'open' | 'new' | 'framework';

interface Framework {
  id: string;
  label: string;
  description: string;
  icon: string;
}

const FRAMEWORKS: Framework[] = [
  { id: 'react-vite',    label: 'React + Vite',      description: 'TypeScript — recommandé', icon: '⚡' },
  { id: 'react-vite-js', label: 'React + Vite',      description: 'JavaScript',              icon: '⚡' },
  { id: 'next',          label: 'Next.js',            description: 'TypeScript + App Router', icon: '▲' },
  { id: 'react-router',  label: 'React Router v7',   description: 'TypeScript — full-stack', icon: '🔀' },
];

interface LogLine {
  level: 'info' | 'warn' | 'error';
  message: string;
}

export function StartupProjectModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('open');

  // Onglet "Ouvrir"
  const [inputPath, setInputPath] = useState('');

  // Onglet "Nouveau vierge"
  const [newName, setNewName] = useState('');
  const [newParentPath, setNewParentPath] = useState('');

  // Onglet "Framework"
  const [selectedFramework, setSelectedFramework] = useState('react-vite');
  const [frameworkName, setFrameworkName] = useState('');
  const [frameworkParentPath, setFrameworkParentPath] = useState('');
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [scaffolding, setScaffolding] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/self-root/status')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.noProject || !data?.rootPath) {
          setCurrentPath(null);
          setIsOpen(true);
        } else {
          setCurrentPath(data.rootPath);
          setIsOpen(false);
        }
      })
      .catch(() => setIsOpen(true));
  }, []);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const activate = useCallback(async (newRoot: string) => {
    ideApi.invalidateCache();
    window.dispatchEvent(new CustomEvent('jarvis-sandbox-changed'));
    window.dispatchEvent(new CustomEvent('jarvis-workspace-changed', { detail: { workspace: newRoot } }));
    setIsOpen(false);
  }, []);

  const handleBrowse = async (target: 'open' | 'new' | 'framework') => {
    const setter =
      target === 'open' ? setInputPath :
      target === 'new'  ? setNewParentPath :
                          setFrameworkParentPath;
    const electronAPI = getElectronAPI();
    if (electronAPI) {
      const selected = await electronAPI.selectFolder();
      if (selected) { setter(selected); setError(null); }
    } else {
      try {
        // @ts-ignore Web Directory Picker
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        if (handle?.name) { setter(handle.name); setError(null); }
      } catch { /* cancelled */ }
    }
  };

  const handleOpenProject = useCallback(async () => {
    const trimmed = inputPath.trim();
    if (!trimmed) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/self-root/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: trimmed, userConfirmed: true }),
      });
      const data = await res.json();
      if (data.status === 'success') await activate(data.newRoot);
      else setError(data.error || 'Erreur lors du changement de répertoire');
    } catch (e: any) { setError(e.message || 'Erreur réseau'); }
    finally { setLoading(false); }
  }, [inputPath, activate]);

  const handleNewProject = useCallback(async () => {
    const name = newName.trim();
    if (!name) { setError('Le nom du projet est requis.'); return; }
    setLoading(true); setError(null);
    let body: Record<string, string>;
    if (newParentPath.trim()) {
      const sep = newParentPath.trim().endsWith('\\') || newParentPath.trim().endsWith('/') ? '' : '\\';
      body = { path: newParentPath.trim() + sep + name };
    } else {
      body = { name };
    }
    try {
      const res = await fetch('/api/self-root/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.status === 'success') await activate(data.newRoot);
      else setError(data.error || 'Erreur lors de la création du projet');
    } catch (e: any) { setError(e.message || 'Erreur réseau'); }
    finally { setLoading(false); }
  }, [newName, newParentPath, activate]);

  /**
   * Scaffold via SSE — lit le stream ligne par ligne et affiche les logs en direct.
   */
  const handleScaffold = useCallback(async () => {
    const name = frameworkName.trim();
    if (!name) { setError('Le nom du projet est requis.'); return; }

    setScaffolding(true);
    setLogs([]);
    setError(null);

    const body: Record<string, string> = { name, framework: selectedFramework };
    if (frameworkParentPath.trim()) body.parent_path = frameworkParentPath.trim();

    try {
      const res = await fetch('/api/self-root/scaffold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.body) {
        setError('Le serveur ne supporte pas le streaming.');
        setScaffolding(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const dataLine = part.split('\n').find(l => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.slice(6));
            if (event.type === 'log') {
              setLogs(prev => [...prev, { level: event.level ?? 'info', message: event.message }]);
            } else if (event.type === 'done') {
              await activate(event.newRoot);
              return;
            } else if (event.type === 'error') {
              setError(event.error ?? 'Erreur de scaffolding');
            }
          } catch { /* JSON parse error, skip */ }
        }
      }
    } catch (e: any) {
      setError(e.message || 'Erreur réseau');
    } finally {
      setScaffolding(false);
    }
  }, [frameworkName, frameworkParentPath, selectedFramework, activate]);

  const canBrowse = !!getElectronAPI() || typeof (window as any).showDirectoryPicker === 'function';

  if (!isOpen) return null;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'open',      label: 'Ouvrir',          icon: <FolderInput className="w-3.5 h-3.5" /> },
    { id: 'new',       label: 'Projet vierge',   icon: <FilePlus    className="w-3.5 h-3.5" /> },
    { id: 'framework', label: 'Framework React', icon: <Rocket      className="w-3.5 h-3.5" /> },
  ];

  const isWorking = loading || scaffolding;

  const logColor = (level: LogLine['level']) => {
    if (level === 'error') return '#f87171';
    if (level === 'warn')  return '#fbbf24';
    return '#a3e635';
  };

  const frameworkPreviewPath = frameworkParentPath.trim()
    ? `${frameworkParentPath.trim()}\\${frameworkName.trim()}`
    : `Documents\\Jarvis-Projects\\${frameworkName.trim()}`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99999] flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)' }}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          className="w-full max-w-lg rounded-2xl p-6 shadow-2xl"
          style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)' }}>
              <FolderOpen className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Workspace Jarvis-OS</h2>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Ouvrez un projet existant, créez-en un vierge ou démarrez avec un framework.
              </p>
            </div>
          </div>

          {/* Avertissement aucun projet */}
          {!currentPath && (
            <div className="rounded-xl p-3 mb-4 flex items-center gap-2"
              style={{ backgroundColor: 'color-mix(in srgb, #f59e0b 8%, transparent)', border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)' }}>
              <FolderX className="w-4 h-4 flex-shrink-0" style={{ color: '#f59e0b' }} />
              <span className="text-[11px] font-medium" style={{ color: '#f59e0b' }}>
                Aucun projet actif — sélectionnez ou créez un projet pour continuer.
              </span>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 rounded-xl p-1 mb-5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            {tabs.map(t => (
              <button key={t.id} type="button"
                onClick={() => { if (!isWorking) { setTab(t.id); setError(null); setLogs([]); } }}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
                style={{
                  backgroundColor: tab === t.id ? 'var(--bg-panel)' : 'transparent',
                  color: tab === t.id ? 'var(--accent-primary)' : 'var(--text-muted)',
                  boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                  cursor: isWorking ? 'not-allowed' : 'pointer',
                  opacity: isWorking && tab !== t.id ? 0.5 : 1,
                }}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* ── Contenu ── */}
          <div className="space-y-3 mb-5">

            {/* Ouvrir */}
            {tab === 'open' && (
              <div>
                <label className="text-[11px] font-medium block mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  Chemin du projet existant
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <FolderOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-dimmed)' }} />
                    <input type="text" value={inputPath}
                      onChange={e => { setInputPath(e.target.value); setError(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') handleOpenProject(); }}
                      placeholder="C:\Users\...\votre-projet"
                      className="w-full rounded-lg border pl-8 pr-3 py-2 text-[11px] font-mono focus:ring-1 focus:ring-[var(--accent-primary)]"
                      style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)', outline: 'none' }}
                      autoFocus spellCheck={false} />
                  </div>
                  {canBrowse && (
                    <button type="button" onClick={() => handleBrowse('open')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-semibold hover:opacity-80 flex-shrink-0"
                      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)', color: 'var(--accent-primary)' }}>
                      <Upload className="w-3.5 h-3.5" />Parcourir
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Projet vierge */}
            {tab === 'new' && (
              <>
                <div>
                  <label className="text-[11px] font-medium block mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Nom du projet <span style={{ color: '#f87171' }}>*</span>
                  </label>
                  <input type="text" value={newName}
                    onChange={e => { setNewName(e.target.value); setError(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleNewProject(); }}
                    placeholder="mon-nouveau-projet"
                    className="w-full rounded-lg border px-3 py-2 text-[11px] font-mono focus:ring-1 focus:ring-[var(--accent-primary)]"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)', outline: 'none' }}
                    autoFocus spellCheck={false} />
                </div>
                <div>
                  <label className="text-[11px] font-medium block mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Dossier parent <span className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>(optionnel — défaut : Documents/Jarvis-Projects)</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <FolderOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-dimmed)' }} />
                      <input type="text" value={newParentPath}
                        onChange={e => { setNewParentPath(e.target.value); setError(null); }}
                        placeholder="C:\Users\...\mes-projets"
                        className="w-full rounded-lg border pl-8 pr-3 py-2 text-[11px] font-mono focus:ring-1 focus:ring-[var(--accent-primary)]"
                        style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)', outline: 'none' }}
                        spellCheck={false} />
                    </div>
                    {canBrowse && (
                      <button type="button" onClick={() => handleBrowse('new')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-semibold hover:opacity-80 flex-shrink-0"
                        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)', color: 'var(--accent-primary)' }}>
                        <Upload className="w-3.5 h-3.5" />Parcourir
                      </button>
                    )}
                  </div>
                  {newName.trim() && (
                    <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                      Créera : <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>
                        {newParentPath.trim() ? `${newParentPath.trim()}\\${newName.trim()}` : `Documents\\Jarvis-Projects\\${newName.trim()}`}
                      </span>
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Framework React */}
            {tab === 'framework' && (
              <>
                {/* Grille frameworks */}
                <div>
                  <label className="text-[11px] font-medium block mb-2" style={{ color: 'var(--text-primary)' }}>Template</label>
                  <div className="grid grid-cols-2 gap-2">
                    {FRAMEWORKS.map(fw => (
                      <button key={fw.id} type="button"
                        disabled={scaffolding}
                        onClick={() => { setSelectedFramework(fw.id); setError(null); }}
                        className="flex items-start gap-2.5 p-3 rounded-xl text-left transition-all hover:opacity-90 disabled:opacity-60"
                        style={{
                          backgroundColor: selectedFramework === fw.id
                            ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)'
                            : 'var(--bg-secondary)',
                          border: selectedFramework === fw.id
                            ? '1.5px solid var(--accent-primary)'
                            : '1.5px solid var(--border-base)',
                        }}>
                        <span className="text-lg leading-none mt-0.5">{fw.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{fw.label}</p>
                          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{fw.description}</p>
                        </div>
                        {selectedFramework === fw.id && (
                          <Check className="w-3.5 h-3.5 ml-auto flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-primary)' }} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Nom */}
                <div>
                  <label className="text-[11px] font-medium block mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Nom du projet <span style={{ color: '#f87171' }}>*</span>
                  </label>
                  <input type="text" value={frameworkName}
                    disabled={scaffolding}
                    onChange={e => { setFrameworkName(e.target.value); setError(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleScaffold(); }}
                    placeholder="my-react-app"
                    className="w-full rounded-lg border px-3 py-2 text-[11px] font-mono focus:ring-1 focus:ring-[var(--accent-primary)] disabled:opacity-60"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)', outline: 'none' }}
                    autoFocus spellCheck={false} />
                </div>

                {/* Dossier parent */}
                <div>
                  <label className="text-[11px] font-medium block mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Dossier parent <span className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>(optionnel — défaut : Documents/Jarvis-Projects)</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <FolderOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-dimmed)' }} />
                      <input type="text" value={frameworkParentPath}
                        disabled={scaffolding}
                        onChange={e => { setFrameworkParentPath(e.target.value); setError(null); }}
                        placeholder="C:\Users\...\mes-projets"
                        className="w-full rounded-lg border pl-8 pr-3 py-2 text-[11px] font-mono focus:ring-1 focus:ring-[var(--accent-primary)] disabled:opacity-60"
                        style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)', outline: 'none' }}
                        spellCheck={false} />
                    </div>
                    {canBrowse && (
                      <button type="button" onClick={() => handleBrowse('framework')} disabled={scaffolding}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-semibold hover:opacity-80 flex-shrink-0 disabled:opacity-50"
                        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)', color: 'var(--accent-primary)' }}>
                        <Upload className="w-3.5 h-3.5" />Parcourir
                      </button>
                    )}
                  </div>
                  {frameworkName.trim() && !scaffolding && (
                    <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                      Créera : <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>{frameworkPreviewPath}</span>
                    </p>
                  )}
                </div>

                {/* Zone de logs live */}
                {logs.length > 0 && (
                  <div
                    className="rounded-xl overflow-hidden"
                    style={{ border: '1px solid var(--border-base)' }}
                  >
                    {/* Header logs */}
                    <div className="flex items-center gap-2 px-3 py-1.5"
                      style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-base)' }}>
                      <Terminal className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                        Logs — scaffolding en cours…
                      </span>
                      {scaffolding && <Loader2 className="w-3 h-3 animate-spin ml-auto" style={{ color: 'var(--accent-primary)' }} />}
                    </div>
                    {/* Corps */}
                    <div
                      className="p-3 overflow-y-auto"
                      style={{
                        maxHeight: '180px',
                        backgroundColor: '#0d1117',
                        fontFamily: 'monospace',
                      }}
                    >
                      {logs.map((line, i) => (
                        <div key={i} className="text-[10px] leading-relaxed whitespace-pre-wrap break-all"
                          style={{ color: logColor(line.level) }}>
                          {line.message}
                        </div>
                      ))}
                      <div ref={logEndRef} />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Erreur */}
            {error && (
              <div className="rounded-lg px-3 py-2 text-[11px] font-medium flex items-center gap-2"
                style={{ backgroundColor: 'color-mix(in srgb, #f87171 10%, transparent)', color: '#f87171' }}>
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Action */}
          <div className="flex justify-end">
            <motion.button
              type="button"
              onClick={
                tab === 'open'      ? handleOpenProject :
                tab === 'new'       ? handleNewProject  :
                                      handleScaffold
              }
              disabled={
                isWorking ||
                (tab === 'open'      && !inputPath.trim()) ||
                (tab === 'new'       && !newName.trim()) ||
                (tab === 'framework' && !frameworkName.trim())
              }
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              {isWorking
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : tab === 'open'
                  ? <FolderInput className="w-4 h-4" />
                  : tab === 'new'
                    ? <FilePlus className="w-4 h-4" />
                    : <Rocket className="w-4 h-4" />
              }
              {tab === 'open'      ? 'Ouvrir le projet'    :
               tab === 'new'       ? 'Créer le projet'     :
               scaffolding         ? 'Scaffolding…'        :
                                     'Scaffolder le projet'}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
