import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BrainCircuit, Clock3, FileSearch, GitBranch, RefreshCw, Search, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { ViewHeader } from '../components/ui/ViewHeader.js';
import { viewHeaderProps } from '../config/navigation.js';

type Tab = 'overview' | 'inspector' | 'memory' | 'timeline' | 'graph' | 'alerts' | 'approval';
type Fact = { id: string; content: string; category: string; confidence: number; usageCount: number; sourceFile?: string; createdAt: string; updatedAt: string };
type ContextResult = {
  query: string;
  systemPromptInject: string;
  computationMs: number;
  generatedAt: string;
  batch: {
    facts: Fact[];
    files: Array<{ filePath: string; relevance: number; reason: string }>;
    memoryGovernance?: { assessed: number; included: number; withheld: number; counts: Record<string, number> };
    quality: { totalFiles: number; averageConfidence: number; sufficient: boolean };
  };
  health: { fileCount: number; factCount: number; freshness: number; lastIndexed?: string; warnings: string[] };
};

const TABS: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
  { id: 'overview', label: 'Vue globale', icon: Activity },
  { id: 'inspector', label: 'Context Inspector', icon: FileSearch },
  { id: 'memory', label: 'Mémoire', icon: BrainCircuit },
  { id: 'timeline', label: 'Historique', icon: Clock3 },
  { id: 'graph', label: 'Graphe', icon: GitBranch },
  { id: 'alerts', label: 'Alertes', icon: AlertTriangle },
  { id: 'approval', label: 'Validation', icon: ShieldCheck },
];

const panelStyle = { backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' };
const mutedStyle = { color: 'var(--text-muted)' };
const fmt = (value: number) => new Intl.NumberFormat('fr-FR').format(value);

export default function ContextIntelligenceView() {
  const [tab, setTab] = useState<Tab>('overview');
  const [query, setQuery] = useState('');
  const [memoryQuery, setMemoryQuery] = useState('');
  const [facts, setFacts] = useState<Fact[]>([]);
  const [context, setContext] = useState<ContextResult | null>(null);
  const [loadingFacts, setLoadingFacts] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFacts = useCallback(async () => {
    setLoadingFacts(true);
    try {
      const response = await fetch('/api/knowledge/memory');
      const data = await response.json();
      if (!response.ok || data.status !== 'success' || !Array.isArray(data.facts)) throw new Error(data.error || 'Réponse mémoire invalide');
      setFacts(data.facts);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de charger la mémoire');
    } finally {
      setLoadingFacts(false);
    }
  }, []);

  useEffect(() => { void loadFacts(); }, [loadFacts]);

  const inspectContext = useCallback(async () => {
    if (!query.trim()) return;
    setBuilding(true);
    setError(null);
    try {
      const response = await fetch('/api/knowledge/understanding/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), strategy: 'balanced', detail: 'standard', includeRisk: true }),
      });
      const data = await response.json();
      if (!response.ok || data.status !== 'success' || !data.context) throw new Error(data.error || 'Impossible de construire le contexte');
      setContext(data.context as ContextResult);
      setTab('inspector');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erreur pendant l’inspection');
    } finally {
      setBuilding(false);
    }
  }, [query]);

  const visibleFacts = useMemo(() => {
    const term = memoryQuery.trim().toLocaleLowerCase();
    return term ? facts.filter(f => [f.content, f.category, f.sourceFile ?? ''].join(' ').toLocaleLowerCase().includes(term)) : facts;
  }, [facts, memoryQuery]);

  const estimatedPromptTokens = context ? Math.ceil(context.systemPromptInject.length / 4) : 0;
  const governance = context?.batch.memoryGovernance;
  const Stat = ({ label, value, hint }: { label: string; value: string | number; hint?: string }) => (
    <div className="min-w-0 rounded-xl border p-3" style={panelStyle}>
      <div className="text-xs" style={mutedStyle}>{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}</div>
      {hint && <div className="mt-1 text-[11px]" style={mutedStyle}>{hint}</div>}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ViewHeader {...viewHeaderProps('observability')} title="Intelligence du contexte" description="Pilotage de la mémoire, inspection du contexte et qualité des connaissances" badge="Context Intelligence" />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-3" style={{ borderColor: 'var(--border-base)' }} role="tablist" aria-label="Sections Context Intelligence">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className="flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors"
              style={{ borderBottomColor: tab === id ? 'var(--accent-secondary)' : 'transparent', color: tab === id ? 'var(--accent-secondary)' : 'var(--text-muted)' }}>
              <Icon size={13} />{label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {error && <div role="alert" className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}>{error}</div>}
          <section className="rounded-xl border p-3" style={panelStyle}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Inspecter un contexte de mission</div><p className="text-xs" style={mutedStyle}>Construit un aperçu via UnderstandingEngine, sans envoyer de requête au modèle.</p></div>
              <button type="button" onClick={() => void loadFacts()} disabled={loadingFacts} className="rounded-lg border p-2" style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }} aria-label="Actualiser la mémoire"><RefreshCw size={14} className={loadingFacts ? 'animate-spin' : ''} /></button>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void inspectContext(); }} placeholder="Ex. Optimiser le panneau de supervision multi-agents…" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs outline-none" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }} />
              <button type="button" onClick={() => void inspectContext()} disabled={building || !query.trim()} className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}><Search size={13}/>{building ? 'Analyse…' : 'Analyser'}</button>
            </div>
          </section>

          {tab === 'overview' && <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Stat label="Faits en mémoire" value={fmt(facts.length)} hint="Source : ProjectMemory" />
              <Stat label="Faits évalués" value={governance?.assessed ?? '—'} hint="Dernière inspection" />
              <Stat label="Faits injectés" value={governance?.included ?? '—'} hint="Dernière inspection" />
              <Stat label="Faits écartés" value={governance?.withheld ?? '—'} hint="Dernière inspection" />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border p-4" style={panelStyle}><h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Décisions du moteur</h3><div className="mt-3 grid grid-cols-2 gap-2">{['transmit','keep','verify','refresh','merge','discard'].map(key => <div key={key} className="flex justify-between rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: 'var(--bg-secondary)' }}><span style={mutedStyle}>{key}</span><strong style={{ color: 'var(--text-primary)' }}>{governance?.counts?.[key] ?? '—'}</strong></div>)}</div></div>
              <div className="rounded-xl border p-4" style={panelStyle}><h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Santé des connaissances</h3><div className="mt-3 space-y-2 text-xs" style={mutedStyle}><p>Fichiers indexés : <strong style={{ color: 'var(--text-primary)' }}>{context?.health.fileCount ?? '—'}</strong></p><p>Faits connus : <strong style={{ color: 'var(--text-primary)' }}>{context?.health.factCount ?? facts.length}</strong></p><p>Fraîcheur estimée : <strong style={{ color: 'var(--text-primary)' }}>{context ? Math.round(context.health.freshness * 100) + '%' : '—'}</strong></p><p>Dernière indexation : {context?.health.lastIndexed ? new Date(context.health.lastIndexed).toLocaleString('fr-FR') : 'Non disponible'}</p></div></div>
            </div>
            {!context && <p className="py-8 text-center text-xs" style={mutedStyle}>Lance une inspection pour afficher les métriques de gouvernance réelles.</p>}
          </>}

          {tab === 'inspector' && <div className="space-y-3">
            {!context ? <p className="rounded-xl border p-6 text-center text-xs" style={{ ...panelStyle, ...mutedStyle }}>Aucun contexte inspecté. Saisis une mission ci-dessus.</p> : <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Stat label="Durée de calcul" value={context.computationMs + ' ms'} /><Stat label="Tokens estimés" value={fmt(estimatedPromptTokens)} hint="Estimation caractères / 4, pas un comptage provider" /><Stat label="Faits retenus" value={context.batch.facts.length} /><Stat label="Fichiers pertinents" value={context.batch.files.length} /></div>
              <div className="rounded-xl border p-4" style={panelStyle}><div className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}><Sparkles size={14}/> Aperçu du prompt construit</div><pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-lg p-3 text-xs" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>{context.systemPromptInject || 'Aucun prompt généré.'}</pre></div>
              <div className="rounded-xl border p-4" style={panelStyle}><h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Fichiers sélectionnés</h3>{context.batch.files.map(file => <div key={file.filePath} className="flex flex-wrap justify-between gap-2 border-b py-2 text-xs last:border-0" style={{ borderColor: 'var(--border-base)' }}><span className="font-mono" style={{ color: 'var(--text-primary)' }}>{file.filePath}</span><span style={mutedStyle}>{Math.round(file.relevance * 100)}% · {file.reason}</span></div>)}</div>
            </>}
          </div>}

          {tab === 'memory' && <section className="space-y-3"><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={mutedStyle}/><input value={memoryQuery} onChange={e => setMemoryQuery(e.target.value)} placeholder="Rechercher un fait, une catégorie ou un fichier source…" className="w-full rounded-lg border py-2 pl-9 pr-3 text-xs" style={{ ...panelStyle, color: 'var(--text-primary)' }}/></div>{loadingFacts ? <p className="text-xs" style={mutedStyle}>Chargement…</p> : visibleFacts.map(fact => <article key={fact.id} className="rounded-xl border p-3" style={panelStyle}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] font-semibold uppercase" style={{ color: 'var(--accent-secondary)' }}>{fact.category}</span><span className="text-[11px]" style={mutedStyle}>Confiance {Math.round(fact.confidence * 100)}% · {fact.usageCount} utilisation(s)</span></div><p className="mt-2 text-xs" style={{ color: 'var(--text-primary)' }}>{fact.content}</p><p className="mt-2 truncate font-mono text-[10px]" style={mutedStyle}>{fact.sourceFile || 'Source non renseignée'}</p></article>)}{!loadingFacts && visibleFacts.length === 0 && <p className="py-6 text-center text-xs" style={mutedStyle}>Aucun fait correspondant.</p>}</section>}

          {tab === 'timeline' && <div className="rounded-xl border p-5" style={panelStyle}><h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Historique de la dernière inspection</h3>{context ? <div className="mt-3 space-y-2 text-xs" style={mutedStyle}><p>{new Date(context.generatedAt).toLocaleString('fr-FR')} — Contexte construit en {context.computationMs} ms.</p><p>{context.batch.memoryGovernance?.assessed ?? 0} fait(s) évalué(s), {context.batch.memoryGovernance?.included ?? 0} inclus, {context.batch.memoryGovernance?.withheld ?? 0} écartés.</p></div> : <p className="mt-2 text-xs" style={mutedStyle}>L'historique persistant des décisions n'est pas encore exposé par l'API. Les événements de cette session seront visibles après inspection.</p>}</div>}

          {tab === 'graph' && <div className="rounded-xl border p-5" style={panelStyle}><h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Fichiers liés au contexte</h3><p className="mt-1 text-xs" style={mutedStyle}>Vue de voisinage issue des fichiers sélectionnés par UnderstandingEngine ; ce n'est pas encore une visualisation complète du KnowledgeGraph.</p>{context?.batch.files.map(file => <div key={file.filePath} className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}><GitBranch size={12}/><span className="truncate font-mono">{file.filePath}</span></div>) ?? <p className="mt-3 text-xs" style={mutedStyle}>Inspecte une mission pour afficher les fichiers.</p>}</div>}

          {tab === 'alerts' && <div className="space-y-2">{(context?.health.warnings ?? []).map((warning, index) => <div key={index} className="flex gap-2 rounded-lg border p-3 text-xs" style={{ ...panelStyle, color: 'var(--color-warning)' }}><AlertTriangle size={14}/>{warning}</div>)}{(!context || context.health.warnings.length === 0) && <p className="rounded-xl border p-5 text-xs" style={{ ...panelStyle, ...mutedStyle }}>{context ? 'Aucune alerte remontée par le diagnostic de santé.' : 'Les alertes apparaîtront après une inspection.'}</p>}</div>}

          {tab === 'approval' && <div className="rounded-xl border p-5" style={panelStyle}><div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}><ShieldCheck size={15}/> Apprentissage sous contrôle humain</div><p className="mt-2 text-xs" style={mutedStyle}>Les candidats d’apprentissage du moteur v3 restent consultatifs. Le flux d’approbation persistant et les actions de validation ne sont pas exposés par l’API actuelle ; aucune modification de mémoire n’est effectuée depuis cet écran.</p></div>}
        </div>
      </div>
    </div>
  );
}
