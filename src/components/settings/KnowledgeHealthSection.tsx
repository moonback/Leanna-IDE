import { useState, useEffect, useCallback } from 'react';
import { FileText } from 'lucide-react';
import { KnowledgeHealthDashboard } from '../knowledge/KnowledgeHealthDashboard.js';
import { ToggleSwitch } from './SettingsPrimitives.js';
import { useToast } from '../ui/Toast.js';

/**
 * Toggle serveur : active/désactive l'extraction documentaire automatique
 * (WorkspaceIndexer → DocumentStore). L'état est persisté côté serveur
 * (knowledge-settings.json) et respecté au démarrage et à l'activation projet.
 */
function DocumentExtractionToggle() {
  const { success, error: toastError } = useToast();
  // Désactivée par défaut (aligné sur le défaut serveur) tant que l'API n'a pas répondu.
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Charger l'état courant au montage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/knowledge/document-extraction');
        const data = await res.json();
        if (!cancelled && typeof data?.enabled === 'boolean') {
          setEnabled(data.enabled);
        }
      } catch {
        /* best-effort : conserver la valeur par défaut */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleChange = useCallback(async (next: boolean) => {
    if (saving) return;
    setSaving(true);
    // Optimistic update
    const previous = enabled;
    setEnabled(next);
    try {
      const res = await fetch('/api/knowledge/document-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error('request failed');
      const data = await res.json();
      const effective = typeof data?.enabled === 'boolean' ? data.enabled : next;
      setEnabled(effective);
      if (effective) {
        success(data?.reextracted
          ? 'Extraction documentaire activée — ré-extraction lancée ✓'
          : 'Extraction documentaire activée ✓');
      } else {
        success('Extraction documentaire désactivée ✓');
      }
    } catch {
      setEnabled(previous); // rollback
      toastError('Impossible de mettre à jour le réglage');
    } finally {
      setSaving(false);
    }
  }, [enabled, saving, success, toastError]);

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}>
      <div className="flex items-center gap-2.5 min-w-0">
        <FileText size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <div className="min-w-0">
          <span className="text-sm font-medium leading-none" style={{ color: 'var(--text-primary)' }}>
            Extraction documentaire
          </span>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
            Indexation auto .md · .txt · .pdf · .csv → DocumentStore
          </p>
        </div>
      </div>
      <ToggleSwitch
        value={enabled}
        onChange={handleChange}
        label={loading ? 'Chargement…' : ''}
      />
    </div>
  );
}

export function KnowledgeHealthSection() {
  return (
    <div className="space-y-6">
      <div className="border-b pb-4" style={{ borderColor: 'var(--border-base)' }}>
        <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
          Knowledge System & Extraction Documentaire
        </h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Supervisez l'indexation du workspace, l'extraction automatique des documents, la mémoire projet et les métriques temps réel.
        </p>
      </div>

      <DocumentExtractionToggle />

      <KnowledgeHealthDashboard />
    </div>
  );
}
