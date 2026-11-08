import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BrainCircuit, Clock3, FileSearch, GitBranch, RefreshCw, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { ViewHeader } from '../components/ui/ViewHeader.js';
import ContextKnowledgeGraph, { type GraphRelation } from '../components/knowledge/ContextKnowledgeGraph.js';
import { viewHeaderProps } from '../config/navigation.js';

type Tab = 'overview' | 'inspector' | 'diff' | 'memory' | 'timeline' | 'graph' | 'alerts' | 'approval';
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
  { id: 'diff', label: 'Comparateur', icon: GitBranch },
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
  const [tab, setTab] = useState<Tab>('graph');
  const [query, setQuery] = useState('');
  const [memoryQuery, setMemoryQuery] = useState('');
  const [facts, setFacts] = useState<Fact[]>([]);
  const [memoryResults, setMemoryResults] = useState<Fact[] | null>(null);
  const [memorySearching, setMemorySearching] = useState(false);
  const [relations, setRelations] = useState<GraphRelation[]>([]);
  const [relationTotal, setRelationTotal] = useState(0);
  const [graphQuery, setGraphQuery] = useState('');
  const [graphRelationType, setGraphRelationType] = useState('all');
  const [loadingRelations, setLoadingRelations] = useState(false);
  const [context, setContext] = useState<ContextResult | null>(null);
  const [previousContext, setPreviousContext] = useState<ContextResult | null>(null);
  const [inspectionHistory, setInspectionHistory] = useState<ContextResult[]>([]);
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

  useEffect(() => {
    const term = memoryQuery.trim();
    if (!term) { setMemoryResults(null); setMemorySearching(false); return; }
    let active = true;
    const timer = setTimeout(async () => {
      setMemorySearching(true);
      try {
        const response = await fetch('/api/knowledge/memory/search?q=' + encodeURIComponent(term) + '&limit=50');
        const data = await response.json();
        if (!response.ok || data.status !== 'success' || !Array.isArray(data.results)) throw new Error(data.error || 'Recherche mémoire indisponible');
        if (active) setMemoryResults(data.results);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Erreur de recherche mémoire');
      } finally {
        if (active) setMemorySearching(false);
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [memoryQuery]);

  useEffect(() => {
    if (tab !== 'graph') return;
    let active = true;
    setLoadingRelations(true);
    fetch('/api/knowledge/relations')
      .then(async response => {
        const data = await response.json();
        if (!response.ok || data.status !== 'success' || !Array.isArray(data.relations)) throw new Error(data.error || 'Graphe indisponible');
        if (active) {
          setRelations(data.relations);
          setRelationTotal(typeof data.count === 'number' ? data.count : data.relations.length);
        }
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Erreur de chargement du graphe'); })
      .finally(() => { if (active) setLoadingRelations(false); });
    return () => { active = false; };
  }, [tab]);

  const inspectContext = useCallback(async () => {
    if (!query.trim()) return;
    setBuilding(true);
    setError(null);
    try {
      const response = await fetch('/api/knowledge/understanding/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          strategy: 'balanced',
          detail: 'standard',
          maxFiles: 6,
          maxFacts: 7,
          maxTokenBudget: 3000,
          includeRisk: false,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status !== 'success' || !data.context) {
        const detail = typeof data.error === 'string' ? data.error : 'Réponse serveur invalide';
        const diagnostic = typeof data.errorId === 'string' ? ' (diagnostic ' + data.errorId + ')' : '';
        throw new Error(detail + diagnostic);
      }
      setPreviousContext(context);
      setContext(data.context as ContextResult);
      setInspectionHistory(previous => [...previous, data.context as ContextResult].slice(-20));
      setTab('inspector');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erreur pendant l’inspection');
    } finally {
      setBuilding(false);
    }
  }, [query, context]);

  const visibleFacts = useMemo(() => memoryResults ?? facts.filter(fact => {
    const term = memoryQuery.trim().toLocaleLowerCase();
    return !term || [fact.content, fact.category, fact.sourceFile ?? ''].join(' ').toLocaleLowerCase().includes(term);
  }), [memoryResults, facts, memoryQuery]);

  const { addedFacts, removedFacts, addedFiles, removedFiles } = useMemo(() => {
    const currentFactIds = new Set(context?.batch.facts.map(f => f.id) ?? []);
    const previousFactIds = new Set(previousContext?.batch.facts.map(f => f.id) ?? []);
    const currentFiles = new Set(context?.batch.files.map(f => f.filePath) ?? []);
    const previousFiles = new Set(previousContext?.batch.files.map(f => f.filePath) ?? []);
    return {
      addedFacts: context?.batch.facts.filter(f => !previousFactIds.has(f.id)) ?? [],
      removedFacts: previousContext?.batch.facts.filter(f => !currentFactIds.has(f.id)) ?? [],
      addedFiles: context?.batch.files.filter(f => !previousFiles.has(f.filePath)) ?? [],
      removedFiles: previousContext?.batch.files.filter(f => !currentFiles.has(f.filePath)) ?? [],
    };
  }, [context, previousContext]);
  const estimatedPromptTokens = context ? Math.ceil(context.systemPromptInject.length / 4) : 0;
  const previousEstimatedTokens = previousContext ? Math.ceil(previousContext.systemPromptInject.length / 4) : 0;
  const tokenDelta = estimatedPromptTokens - previousEstimatedTokens;
  const memoryHealthScore = context
    ? Math.round(Math.max(0, Math.min(1, context.health.freshness)) * 50 + Math.max(0, Math.min(1, context.batch.quality.averageConfidence)) * 50)
    : null;
  const relationTypes = useMemo(
    () => [...new Set(relations.map(relation => relation.relationType))].sort(),
    [relations],
  );
  const visibleRelations = useMemo(() => {
    const term = graphQuery.trim().toLocaleLowerCase();
    return relations
      .filter(relation => graphRelationType === 'all' || relation.relationType === graphRelationType)
      .filter(relation => !term || [relation.source.name, relation.source.filePath, relation.target.name, relation.target.filePath, relation.relationType].join(' ').toLocaleLowerCase().includes(term))
      .sort((a, b) => b.confidence - a.confidence);
  }, [relations, graphRelationType, graphQuery]);
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, Fact[]>();
    for (const fact of facts) {
      const normalized = fact.content.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
      if (!normalized) continue;
      const group = groups.get(normalized) ?? [];
      group.push(fact);
      groups.set(normalized, group);
    }
    return [...groups.values()].filter(group => group.length > 1);
  }, [facts]);
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
              <Stat label="Santé du contexte" value={memoryHealthScore === null ? "—" : memoryHealthScore + "/100"} hint="50 % fraîcheur · 50 % confiance moyenne" />
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

          {tab === 'diff' && <div className="space-y-3">
            {!context || !previousContext ? <div className="rounded-xl border p-5 text-xs" style={{ ...panelStyle, ...mutedStyle }}>Le comparateur devient disponible après deux inspections successives. La comparaison porte sur les identifiants de faits et chemins de fichiers retournés par UnderstandingEngine.</div> : <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Stat label="Faits ajoutés" value={addedFacts.length}/><Stat label="Faits retirés" value={removedFacts.length}/><Stat label="Fichiers ajoutés" value={addedFiles.length}/><Stat label="Fichiers retirés" value={removedFiles.length}/><Stat label="Écart tokens estimés" value={(tokenDelta > 0 ? "+" : "") + fmt(tokenDelta)} hint="Estimation caractères / 4" /></div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border p-3" style={panelStyle}><h3 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Nouveaux éléments</h3><p className="mt-2 text-[11px]" style={mutedStyle}>Faits</p>{addedFacts.map(f => <p key={f.id} className="border-b py-2 text-xs last:border-0" style={{ borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}>{f.content}</p>)}<p className="mt-2 text-[11px]" style={mutedStyle}>Fichiers</p>{addedFiles.map(f => <p key={f.filePath} className="py-1 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{f.filePath}</p>)}</div>
                <div className="rounded-xl border p-3" style={panelStyle}><h3 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Éléments retirés</h3><p className="mt-2 text-[11px]" style={mutedStyle}>Faits</p>{removedFacts.map(f => <p key={f.id} className="border-b py-2 text-xs last:border-0" style={{ borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}>{f.content}</p>)}<p className="mt-2 text-[11px]" style={mutedStyle}>Fichiers</p>{removedFiles.map(f => <p key={f.filePath} className="py-1 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{f.filePath}</p>)}</div>
              </div>
              <p className="text-[10px]" style={mutedStyle}>Comparaison entre les deux derniers aperçus construits, pas entre deux prompts réellement envoyés à un fournisseur.</p>
            </>}
          </div>}

          {tab === 'memory' && <section className="space-y-3"><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={mutedStyle}/><input value={memoryQuery} onChange={e => setMemoryQuery(e.target.value)} placeholder="Rechercher un fait, une catégorie ou un fichier source…" className="w-full rounded-lg border py-2 pl-9 pr-3 text-xs" style={{ ...panelStyle, color: 'var(--text-primary)' }}/></div>{loadingFacts || memorySearching ? <p className="text-xs" style={mutedStyle}>Recherche…</p> : visibleFacts.map(fact => <article key={fact.id} className="rounded-xl border p-3" style={panelStyle}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] font-semibold uppercase" style={{ color: 'var(--accent-secondary)' }}>{fact.category}</span><span className="text-[11px]" style={mutedStyle}>Confiance {Math.round(fact.confidence * 100)}% · {fact.usageCount} utilisation(s)</span></div><p className="mt-2 text-xs" style={{ color: 'var(--text-primary)' }}>{fact.content}</p><p className="mt-2 truncate font-mono text-[10px]" style={mutedStyle}>{fact.sourceFile || 'Source non renseignée'}</p></article>)}{!loadingFacts && visibleFacts.length === 0 && <p className="py-6 text-center text-xs" style={mutedStyle}>Aucun fait correspondant.</p>}
            <div className="rounded-xl border p-3" style={panelStyle}><div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Doublons exacts potentiels</h3><span className="text-xs" style={mutedStyle}>{duplicateGroups.length} groupe(s)</span></div><p className="mt-1 text-[10px]" style={mutedStyle}>Regroupement local sur le texte normalisé ; les similarités sémantiques ne sont pas évaluées et aucune fusion n'est automatique.</p>{duplicateGroups.map(group => <div key={group[0].id} className="mt-2 rounded-lg p-2 text-xs" style={{ backgroundColor: 'var(--bg-secondary)' }}><p style={{ color: 'var(--text-primary)' }}>{group[0].content}</p><p className="mt-1 text-[10px]" style={mutedStyle}>{group.length} occurrences · {group.map(f => f.sourceFile || 'source inconnue').join(' · ')}</p></div>)}</div>
          </section>}

          {tab === 'timeline' && <div className="space-y-2">
            <div className="rounded-xl border p-4" style={panelStyle}><h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Historique des inspections de cette session</h3><p className="mt-1 text-xs" style={mutedStyle}>Les 20 dernières inspections sont conservées en mémoire dans cette vue. Cet historique n'est pas persistant après fermeture ou rechargement.</p></div>
            {inspectionHistory.slice().reverse().map((entry,index) => <button key={entry.generatedAt + ':' + index} type="button" onClick={() => { setPreviousContext(inspectionHistory[Math.max(0, inspectionHistory.length - 2 - index)] ?? null); setContext(entry); setQuery(entry.query); setTab('inspector'); }} className="w-full rounded-lg border p-3 text-left" style={panelStyle}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{entry.query}</span><span className="text-[10px]" style={mutedStyle}>{new Date(entry.generatedAt).toLocaleString('fr-FR')}</span></div><p className="mt-1 text-[11px]" style={mutedStyle}>{entry.batch.facts.length} faits · {entry.batch.files.length} fichiers · {entry.computationMs} ms</p></button>)}
            {inspectionHistory.length === 0 && <p className="rounded-xl border p-5 text-xs" style={{ ...panelStyle, ...mutedStyle }}>Aucune inspection dans cette session.</p>}
          </div>}

          {tab === 'graph' && <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Nœuds visibles" value={fmt(new Set(visibleRelations.flatMap(relation => [relation.source.filePath + ':' + relation.source.name, relation.target.filePath + ':' + relation.target.name])).size)} hint="Entités distinctes" />
              <Stat label="Relations chargées" value={fmt(relations.length)} hint={relationTotal > relations.length ? "Échantillon API limité" : "Relations disponibles"} />
              <Stat label="Confiance moyenne" value={relations.length ? Math.round(relations.reduce((sum, relation) => sum + relation.confidence, 0) / relations.length * 100) + "%" : "—"} hint="Sur les relations chargées" />
              <Stat label="Types de relations" value={relationTypes.length} hint="Catégories détectées" />
            </div>
            <ContextKnowledgeGraph
              relations={visibleRelations}
              loading={loadingRelations}
              query={graphQuery}
              onQueryChange={setGraphQuery}
              relationType={graphRelationType}
              onRelationTypeChange={setGraphRelationType}
              relationTypes={relationTypes}
              totalRelations={relationTotal}
            />
          </div>}

          {tab === 'alerts' && <div className="space-y-2">{(context?.health.warnings ?? []).map((warning, index) => <div key={index} className="flex gap-2 rounded-lg border p-3 text-xs" style={{ ...panelStyle, color: 'var(--color-warning)' }}><AlertTriangle size={14}/>{warning}</div>)}{(!context || context.health.warnings.length === 0) && <p className="rounded-xl border p-5 text-xs" style={{ ...panelStyle, ...mutedStyle }}>{context ? 'Aucune alerte remontée par le diagnostic de santé.' : 'Les alertes apparaîtront après une inspection.'}</p>}</div>}

          {tab === 'approval' && <div className="rounded-xl border p-5" style={panelStyle}><div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}><ShieldCheck size={15}/> Apprentissage sous contrôle humain</div><p className="mt-2 text-xs" style={mutedStyle}>Les candidats d’apprentissage du moteur v3 restent consultatifs. Le flux d’approbation persistant et les actions de validation ne sont pas exposés par l’API actuelle ; aucune modification de mémoire n’est effectuée depuis cet écran.</p></div>}
        </div>
      </div>
    </div>
  );
}
