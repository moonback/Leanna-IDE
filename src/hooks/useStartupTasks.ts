import { useEffect, useState } from 'react';

export type StartupTaskStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export interface StartupTask {
  id: string;
  label: string;
  group: 'knowledge' | 'documents' | 'agents' | 'workflows' | 'system';
  status: StartupTaskStatus;
  current?: number;
  total?: number;
  detail?: string;
  error?: string;
  startedAt?: number;
  endedAt?: number;
}

/**
 * Suit les tâches d'arrière-plan lancées à l'ouverture d'un projet.
 * Snapshot initial via REST (les événements émis avant la connexion du
 * WebSocket seraient perdus), puis mises à jour via 'Leanna-startup-task'.
 */
export function useStartupTasks(): StartupTask[] {
  const [tasks, setTasks] = useState<Map<string, StartupTask>>(new Map());

  useEffect(() => {
    let cancelled = false;

    // Les événements WS sont plus frais que le snapshot : celui-ci ne sert qu'à
    // combler les tâches inconnues ou d'une exécution plus récente.
    const merge = (incoming: StartupTask[], fromSnapshot = false) =>
      setTasks(prev => {
        const next = new Map(prev);
        for (const t of incoming) {
          const old = next.get(t.id);
          if (old) {
            const oldStart = old.startedAt ?? 0;
            const newStart = t.startedAt ?? 0;
            if (newStart < oldStart) continue;
            if (fromSnapshot && newStart === oldStart) continue;
          }
          next.set(t.id, t);
        }
        return next;
      });

    const loadSnapshot = async () => {
      try {
        const res = await fetch('/api/startup/tasks');
        if (!res.ok) return;
        const data = (await res.json()) as { tasks?: StartupTask[] };
        if (!cancelled && Array.isArray(data.tasks)) merge(data.tasks, true);
      } catch { /* serveur pas encore prêt : les événements WS prendront le relais */ }
    };

    const handler = (e: Event) => merge([(e as CustomEvent).detail as StartupTask]);

    window.addEventListener('Leanna-startup-task', handler);
    void loadSnapshot();
    // Un second snapshot comble la fenêtre entre le fetch initial et la connexion WS.
    const retry = setTimeout(loadSnapshot, 3000);

    return () => {
      cancelled = true;
      clearTimeout(retry);
      window.removeEventListener('Leanna-startup-task', handler);
    };
  }, []);

  return [...tasks.values()];
}
