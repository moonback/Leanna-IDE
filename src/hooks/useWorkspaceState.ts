import { useState, useCallback, useEffect } from 'react';

export interface WorkspaceData {
  path: string;
  exists: boolean;
  selfReferential: boolean;
  /** Nom réel du projet (dernier segment de rootPath, pas du chemin sandbox). */
  projectName: string | null;
}

/**
 * Hook simplifié pour l'IDE .
 * Le workspace est verrouillé sur le propre code source de Leanna.
 * Plus de changement de workspace possible.
 */
export function useWorkspaceState() {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('Leanna_api_token');
      const headers: Record<string, string> = {};
      if (token) headers['x-Leanna-token'] = token;

      const [wsRes, statusRes] = await Promise.all([
        fetch('/api/workspace', { headers }),
        fetch('/api/self-root/status', { headers }),
      ]);

      if (!wsRes.ok) return;
      const data = await wsRes.json();

      // Récupérer le rootPath réel depuis /api/self-root/status pour éviter
      // d'afficher le chemin sandbox à la place du nom du projet.
      let projectName: string | null = null;
      if (statusRes.ok) {
        try {
          const statusData = await statusRes.json();
          const rootPath: string | null = statusData?.rootPath ?? null;
          if (rootPath) {
            projectName = rootPath.split(/[/\\]/).filter(Boolean).pop() ?? null;
          }
        } catch { /* silent — on retombe sur null */ }
      }

      // Fallback : si le status n'est pas dispo, on tente avec le path workspace
      // mais en ignorant les segments qui ressemblent à "sandbox".
      if (!projectName) {
        const segments = (data.workspace as string).split(/[/\\]/).filter(Boolean);
        const filtered = segments.filter(s => !/sandbox/i.test(s));
        projectName = (filtered.length > 0 ? filtered : segments).pop() ?? null;
      }

      setWorkspace({
        path: data.workspace,
        exists: data.exists,
        selfReferential: data.selfReferential ?? true,
        projectName,
      });
    } catch {
      setError('Impossible de récupérer le workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchWorkspace(); }, [fetchWorkspace]);

  // Rafraîchir quand le projet actif change (ouverture, changement, clear) ou
  // au retour sur la fenêtre. Sans cela, le hook reste figé sur l'état du
  // montage : si l'écran est monté avant qu'un projet soit connecté, il affiche
  // « aucun workspace » même une fois le projet ouvert.
  useEffect(() => {
    const onWorkspaceChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail as { workspace?: string | null } | undefined;
      // Workspace explicitement désactivé → vider sans refetch.
      if (detail && detail.workspace === null) {
        setWorkspace(null);
        return;
      }
      // Laisser le serveur basculer SELF_ROOT avant de relire /api/workspace.
      setTimeout(() => { void fetchWorkspace(); }, 150);
    };
    const onFocus = () => { void fetchWorkspace(); };

    window.addEventListener('Leanna-workspace-changed', onWorkspaceChanged as EventListener);
    window.addEventListener('Leanna-sandbox-changed', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('Leanna-workspace-changed', onWorkspaceChanged as EventListener);
      window.removeEventListener('Leanna-sandbox-changed', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchWorkspace]);

  return {
    workspace,
    loading,
    error,
    refresh: fetchWorkspace,
  };
}
