import { ProjectFact, ProjectKnowledgeCategory } from '../../../../../server/knowledge/types';

export interface ReindexResult {
  success: boolean;
  stats?: {
    totalFiles: number;
    totalEntities: number;
    durationMs: number;
  };
  error?: string;
}

export interface AddFactInput {
  content: string;
  category: ProjectKnowledgeCategory;
  tags?: string[];
  sourceFile?: string;
  confidence?: number;
}

export interface AddFactResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface FixCycleResult {
  success: boolean;
  suggestion?: string;
  error?: string;
}

export interface ExportOptions {
  format: 'json' | 'csv';
  sections?: ('graph' | 'memory' | 'health' | 'patterns')[];
}

export interface ExportResult {
  success: boolean;
  data?: string;
  filename?: string;
  error?: string;
}

const API_BASE = '/api/knowledge';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('jarvis_api_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'x-jarvis-token': token } : {}),
    ...(options?.headers as Record<string, string>),
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useDashboardActions() {
  // ── Reindex complet du Knowledge Graph ─────────────────────────────────────
  const reindex = async (): Promise<ReindexResult> => {
    try {
      const data = await fetchJson<{ status: string; stats: ReindexResult['stats'] }>(
        `${API_BASE}/reindex`,
        { method: 'POST' }
      );
      return { success: data.status === 'success', stats: data.stats };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  // ── Ajouter un fait à la ProjectMemory ────────────────────────────────────
  const addFact = async (input: AddFactInput): Promise<AddFactResult> => {
    try {
      const data = await fetchJson<{ status: string; id: string }>(`${API_BASE}/memory`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return { success: data.status === 'success', id: data.id };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  // ── Mettre à jour un fait existant ────────────────────────────────────────
  const updateFact = async (id: string, patch: Partial<AddFactInput>): Promise<AddFactResult> => {
    try {
      const data = await fetchJson<{ status: string }>(`${API_BASE}/memory/${id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      return { success: data.status === 'success' };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  // ── Supprimer un fait ─────────────────────────────────────────────────────
  const deleteFact = async (id: string): Promise<AddFactResult> => {
    try {
      const data = await fetchJson<{ status: string }>(`${API_BASE}/memory/${id}`, {
        method: 'DELETE',
      });
      return { success: data.status === 'success' };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  // ── Obtenir une suggestion pour casser un cycle de dépendance ─────────────
  const fixCycle = async (cycleFiles: string[]): Promise<FixCycleResult> => {
    try {
      const data = await fetchJson<{ status: string; suggestion: string }>(
        `${API_BASE}/cycles/fix`,
        { method: 'POST', body: JSON.stringify({ files: cycleFiles }) }
      );
      return { success: data.status === 'success', suggestion: data.suggestion };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  // ── Exporter le dashboard (JSON ou CSV) ───────────────────────────────────
  const exportDashboard = async (options: ExportOptions): Promise<ExportResult> => {
    try {
      const params = new URLSearchParams({
        format: options.format,
        ...(options.sections ? { sections: options.sections.join(',') } : {}),
      });
      const res = await fetch(`${API_BASE}/export?${params}`, {
        headers: { 'x-jarvis-token': localStorage.getItem('jarvis_api_token') || '' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const filename = `knowledge-dashboard-${Date.now()}.${options.format}`;
      return { success: true, data: url, filename };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  // ── Recherche unifiée (fichiers + faits + patterns) ───────────────────────
  const search = async (query: string, limit = 20) => {
    try {
      const data = await fetchJson<{ status: string; results: any[] }>(
        `${API_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`
      );
      return { success: data.status === 'success', results: data.results };
    } catch (e: any) {
      return { success: false, error: e.message, results: [] };
    }
  };

  return {
    reindex,
    addFact,
    updateFact,
    deleteFact,
    fixCycle,
    exportDashboard,
    search,
  };
}