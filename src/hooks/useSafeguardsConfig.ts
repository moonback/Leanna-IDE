/**
 * useSafeguardsConfig — lecture/écriture de la configuration des garde-fous et
 * du niveau d'autonomie (`/api/safeguards/config`).
 *
 * Extrait pour être partagé entre `SafeguardsSection` (réglages détaillés) et le
 * « Centre de contrôle Autonomie » (vue consolidée), qui doivent refléter et
 * modifier le même état sans dupliquer la logique de fetch.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type AutonomyLevel = 'manual' | 'semi' | 'autonomous';

export interface SafeguardsConfig {
  autoCheckpoint: boolean;
  postEditValidation: boolean;
  criticalFileConfirm: boolean;
  autoRestart: boolean;
  criticalFiles: string[];
  autonomyLevel?: AutonomyLevel;
}

export const DEFAULT_SAFEGUARDS_CONFIG: SafeguardsConfig = {
  autoCheckpoint: true,
  postEditValidation: true,
  criticalFileConfirm: true,
  autoRestart: true,
  criticalFiles: ['server.ts', 'server/security.ts', '.env', '.env.local', 'package.json'],
  autonomyLevel: 'manual',
};

interface UseSafeguardsConfigResult {
  config: SafeguardsConfig;
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** Applique et persiste une mise à jour partielle de la configuration. */
  update: (patch: Partial<SafeguardsConfig>) => Promise<void>;
  reload: () => Promise<void>;
}

export function useSafeguardsConfig(): UseSafeguardsConfigResult {
  const [config, setConfig] = useState<SafeguardsConfig>(DEFAULT_SAFEGUARDS_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);
  const configRef = useRef<SafeguardsConfig>(DEFAULT_SAFEGUARDS_CONFIG);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingSaves = useRef(0);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/safeguards/config');
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.config || typeof data.config !== 'object') {
        throw new Error(typeof data?.error === 'string' ? data.error : `Impossible de charger la configuration (HTTP ${res.status}).`);
      }
      const loaded = { ...DEFAULT_SAFEGUARDS_CONFIG, ...data.config };
      if (!Array.isArray(loaded.criticalFiles)) loaded.criticalFiles = DEFAULT_SAFEGUARDS_CONFIG.criticalFiles;
      configRef.current = loaded;
      setConfig(loaded);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les garde-fous.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    void reload();
  }, [reload]);

  const update = useCallback((patch: Partial<SafeguardsConfig>) => {
    const next = { ...configRef.current, ...patch };
    configRef.current = next;
    setConfig(next);
    setError(null);
    pendingSaves.current += 1;
    setSaving(true);

    const save = saveQueue.current.catch(() => undefined).then(async () => {
      const res = await fetch('/api/safeguards/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || (data && data.status === 'error')) {
        throw new Error(typeof data?.error === 'string' ? data.error : `Échec de sauvegarde des garde-fous (HTTP ${res.status}).`);
      }
    });

    saveQueue.current = save;
    return save.catch(err => {
      const message = err instanceof Error ? err.message : 'Impossible de sauvegarder les garde-fous.';
      setError(message);
      throw err;
    }).finally(() => {
      pendingSaves.current = Math.max(0, pendingSaves.current - 1);
      setSaving(pendingSaves.current > 0);
    });
  }, []);

  return { config, loading, saving, error, update, reload };
}
