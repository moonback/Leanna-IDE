import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, WheelEvent } from 'react';
import { Maximize2, Network, Search, ZoomIn, ZoomOut } from 'lucide-react';

export type GraphRelation = {
  source: { name: string; filePath: string; type?: string };
  target: { name: string; filePath: string; type?: string };
  relationType: string;
  confidence: number;
  sourceLine?: number;
};

type GraphNode = {
  id: string;
  name: string;
  filePath: string;
  type: string;
  x: number;
  y: number;
  degree: number;
};

type GraphEdge = { source: number; target: number; relation: GraphRelation };
type Props = {
  relations: GraphRelation[];
  loadedRelations: number;
  loading: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  relationType: string;
  onRelationTypeChange: (value: string) => void;
  relationTypes: string[];
  totalRelations: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
};

const COLORS: Record<string, string> = {
  class: '#9B8CFF', interface: '#A78BFA', type: '#A78BFA', enum: '#A78BFA',
  function: '#42B9F4', method: '#42B9F4', component: '#35D5C4',
  route: '#F4B860', test: '#70D69A', db_table: '#E5A2D5',
  env_var: '#F28B82', constant: '#7DD3FC', variable: '#7DD3FC',
  symbol: '#8FB4D9', import: '#8FB4D9', export: '#8FB4D9',
};

const panelStyle = { backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' };
const mutedStyle = { color: 'var(--text-muted)' };

export function buildContextGraphLayout(relations: GraphRelation[]) {
  const nodeMap = new Map<string, GraphNode>();
  const rawEdges: Array<{ source: string; target: string; relation: GraphRelation }> = [];

  const ensureNode = (entity: GraphRelation['source']) => {
    const id = entity.filePath + '\\0' + entity.name;
    let node = nodeMap.get(id);
    if (!node) {
      node = { id, name: entity.name, filePath: entity.filePath, type: entity.type ?? 'symbol', x: 0, y: 0, degree: 0 };
      nodeMap.set(id, node);
    }
    return id;
  };

  for (const relation of relations) {
    const source = ensureNode(relation.source);
    const target = ensureNode(relation.target);
    if (source === target) continue;
    rawEdges.push({ source, target, relation });
  }

  const nodes = [...nodeMap.values()];
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const edges: GraphEdge[] = rawEdges.flatMap(edge => {
    const source = indexById.get(edge.source);
    const target = indexById.get(edge.target);
    if (source === undefined || target === undefined) return [];
    nodes[source].degree += 1;
    nodes[target].degree += 1;
    return [{ source, target, relation: edge.relation }];
  });

  // Initialisation déterministe puis relaxation force-directed légère.
  const radius = Math.max(100, Math.min(260, 35 * Math.sqrt(Math.max(1, nodes.length))));
  nodes.forEach((node, index) => {
    const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
    node.x = Math.cos(angle) * radius;
    node.y = Math.sin(angle) * radius;
  });

  const desiredLength = Math.max(55, Math.min(125, 360 / Math.sqrt(Math.max(1, nodes.length))));
  for (let iteration = 0; iteration < 90; iteration += 1) {
    const forces = nodes.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const distanceSq = Math.max(36, dx * dx + dy * dy);
        const distance = Math.sqrt(distanceSq);
        const force = Math.min(2.8, 1700 / distanceSq);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        forces[i].x += fx; forces[i].y += fy;
        forces[j].x -= fx; forces[j].y -= fy;
      }
    }
    for (const edge of edges) {
      const a = nodes[edge.source], b = nodes[edge.target];
      const dx = b.x - a.x, dy = b.y - a.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const force = (distance - desiredLength) * 0.012;
      const fx = (dx / distance) * force, fy = (dy / distance) * force;
      forces[edge.source].x += fx; forces[edge.source].y += fy;
      forces[edge.target].x -= fx; forces[edge.target].y -= fy;
    }
    const cooling = 0.72 * (1 - iteration / 125);
    nodes.forEach((node, index) => {
      forces[index].x -= node.x * 0.0018;
      forces[index].y -= node.y * 0.0018;
      node.x += Math.max(-7, Math.min(7, forces[index].x)) * cooling;
      node.y += Math.max(-7, Math.min(7, forces[index].y)) * cooling;
    });
  }
  return { nodes, edges };
}

export default function ContextKnowledgeGraph({
  relations, loading, query, onQueryChange, relationType, onRelationTypeChange, relationTypes, totalRelations,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const dragRef = useRef<{ kind: 'node' | 'pan'; pointerX: number; pointerY: number; nodeIndex?: number } | null>(null);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const layout = useMemo(() => buildContextGraphLayout(relations), [relations]);
  useEffect(() => {
    nodesRef.current = layout.nodes.map(node => ({ ...node }));
    setSelectedId(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [layout]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: Math.max(320, rect.width), height: Math.max(360, rect.height) });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const selectedNode = nodesRef.current.find(node => node.id === selectedId) ?? null;
  const connectedEdges = selectedNode
    ? layout.edges.filter(edge => layout.nodes[edge.source].id === selectedNode.id || layout.nodes[edge.target].id === selectedNode.id)
    : [];

  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    const nodes = nodesRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(size.width * dpr);
    const pixelHeight = Math.round(size.height * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    const baseScale = Math.min(size.width / 1050, size.height / 650);
    const scale = baseScale * zoom;
    ctx.save();
    ctx.translate(size.width / 2 + pan.x, size.height / 2 + pan.y);
    ctx.scale(scale, scale);

    // Grille technique discrète.
    ctx.strokeStyle = 'rgba(130, 160, 200, 0.055)';
    ctx.lineWidth = 1 / scale;
    for (let x = -600; x <= 600; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, -400); ctx.lineTo(x, 400); ctx.stroke();
    }
    for (let y = -400; y <= 400; y += 40) {
      ctx.beginPath(); ctx.moveTo(-700, y); ctx.lineTo(700, y); ctx.stroke();
    }

    const selectedIndex = nodes.findIndex(node => node.id === selectedId);
    const activeNeighborIds = new Set<string>();
    if (selectedIndex >= 0) {
      for (const edge of layout.edges) {
        if (edge.source === selectedIndex) {
          const neighbor = nodes[edge.target];
          if (neighbor) activeNeighborIds.add(neighbor.id);
        }
        if (edge.target === selectedIndex) {
          const neighbor = nodes[edge.source];
          if (neighbor) activeNeighborIds.add(neighbor.id);
        }
      }
    }

    for (const edge of layout.edges) {
      const a = nodes[edge.source], b = nodes[edge.target];
      if (!a || !b) continue;
      const active = selectedIndex < 0 || edge.source === selectedIndex || edge.target === selectedIndex;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = active ? 'rgba(91, 169, 226, ' + (0.16 + Math.max(0, Math.min(1, edge.relation.confidence)) * 0.38) + ')' : 'rgba(110, 130, 160, 0.055)';
      ctx.lineWidth = (active ? 1.15 : 0.7) / scale;
      ctx.stroke();
      if (active) {
        const phase = (performance.now() / 2600 + edge.source * 0.137 + edge.target * 0.071) % 1;
        const px = a.x + (b.x - a.x) * phase;
        const py = a.y + (b.y - a.y) * phase;
        ctx.beginPath(); ctx.arc(px, py, 2.2 / scale, 0, Math.PI * 2);
        ctx.fillStyle = '#73D9FF'; ctx.fill();
      }
    }

    for (const node of nodes) {
      const color = COLORS[node.type] ?? '#8FA8C7';
      const active = selectedIndex < 0 || node.id === selectedId || activeNeighborIds.has(node.id);
      const radius = Math.min(13, 5.2 + Math.log2(node.degree + 1) * 1.6);
      if (node.id === selectedId) {
        ctx.beginPath(); ctx.arc(node.x, node.y, radius + 9, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(111, 207, 255, 0.75)'; ctx.lineWidth = 1.5 / scale; ctx.stroke();
      }
      const glow = ctx.createRadialGradient(node.x, node.y, 1, node.x, node.y, radius * 3.2);
      glow.addColorStop(0, color + (active ? '45' : '12'));
      glow.addColorStop(1, color + '00');
      ctx.beginPath(); ctx.arc(node.x, node.y, radius * 3.2, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();
      ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = active ? color : '#526174'; ctx.fill();
      ctx.strokeStyle = node.id === selectedId ? '#E6F7FF' : 'rgba(255,255,255,0.55)';
      ctx.lineWidth = (node.id === selectedId ? 2 : 0.8) / scale; ctx.stroke();

      if (active && (node.id === selectedId || node.degree >= 2 || nodes.length < 24)) {
        ctx.font = (node.id === selectedId ? '600 13px' : '11px') + ' Inter, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = node.id === selectedId ? '#F4FAFF' : 'rgba(210, 224, 241, 0.84)';
        const label = node.name.length > 25 ? node.name.slice(0, 23) + '…' : node.name;
        ctx.fillText(label, node.x, node.y + radius + 6, 180);
      }
    }
    ctx.restore();
  }, [layout.edges, selectedId, size, zoom, pan]);

  useEffect(() => {
    let frame = 0;
    let lastDraw = 0;
    const render = (time: number) => {
      if (time - lastDraw >= 40) {
        drawGraph();
        lastDraw = time;
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [drawGraph]);

  const worldPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const baseScale = Math.min(size.width / 1050, size.height / 650) * zoom;
    return {
      x: (event.clientX - rect.left - size.width / 2 - pan.x) / baseScale,
      y: (event.clientY - rect.top - size.height / 2 - pan.y) / baseScale,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = worldPoint(event);
    const nodes = nodesRef.current;
    let hit = -1;
    let best = 20 / (Math.min(size.width / 1050, size.height / 650) * zoom);
    nodes.forEach((node, index) => {
      const distance = Math.hypot(node.x - point.x, node.y - point.y);
      if (distance < best) { best = distance; hit = index; }
    });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (hit >= 0) {
      setSelectedId(nodes[hit].id);
      dragRef.current = { kind: 'node', pointerX: point.x, pointerY: point.y, nodeIndex: hit };
    } else {
      dragRef.current = { kind: 'pan', pointerX: event.clientX, pointerY: event.clientY };
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === 'node' && drag.nodeIndex !== undefined) {
      const point = worldPoint(event);
      const node = nodesRef.current[drag.nodeIndex];
      if (node) { node.x = point.x; node.y = point.y; }
    } else {
      setPan(current => ({ x: current.x + event.clientX - drag.pointerX, y: current.y + event.clientY - drag.pointerY }));
      drag.pointerX = event.clientX; drag.pointerY = event.clientY;
    }
  };

  const onWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    setZoom(current => Math.max(0.45, Math.min(2.8, current * (event.deltaY < 0 ? 1.12 : 1 / 1.12))));
  };

  const onPointerUp = () => { dragRef.current = null; };

  const focusGraph = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const focusNode = (node: GraphNode) => {
    setSelectedId(node.id);
    setPan({ x: -node.x * Math.min(size.width / 1050, size.height / 650) * zoom, y: -node.y * Math.min(size.width / 1050, size.height / 650) * zoom });
  };

  return (
    <section className="overflow-hidden rounded-2xl border" style={panelStyle}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--border-base)' }}>
        <div className="flex min-w-0 items-center gap-2">
          <div className="rounded-lg p-2" style={{ background: 'rgba(55, 160, 220, 0.12)', color: '#58BCEB' }}><Network size={16}/></div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Knowledge Graph</h3>
            <p className="text-[11px]" style={mutedStyle}>Réseau de dépendances et de relations sémantiques réelles</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px]" style={mutedStyle}>
          <span className="h-2 w-2 rounded-full" style={{ background: '#58D49A', boxShadow: '0 0 10px #58D49A' }}/>
          {loading ? 'Synchronisation…' : 'Données indexées'}
          <span className="tabular-nums">{layout.nodes.length} nœuds · {layout.edges.length} liens</span>
        </div>
      </div>

      <div className="grid gap-2 border-b p-3 lg:grid-cols-[minmax(0,1fr)_210px]" style={{ borderColor: 'var(--border-base)' }}>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={mutedStyle}/>
          <input value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Rechercher une entité, un fichier…" aria-label="Rechercher dans le graphe" className="w-full rounded-lg border py-2 pl-9 pr-3 text-xs" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}/>
        </div>
        <select value={relationType} onChange={event => onRelationTypeChange(event.target.value)} aria-label="Filtrer les relations" className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}>
          <option value="all">Toutes les relations</option>
          {relationTypes.map(type => <option key={type} value={type}>{type}</option>)}
        </select>
      </div>

      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="relative min-w-0" ref={hostRef} style={{ height: 'clamp(360px, calc(100vh - 360px), 620px)', background: 'radial-gradient(ellipse at 50% 45%, rgba(24, 65, 105, 0.24), rgba(7, 14, 26, 0.97) 72%)' }}>
          <canvas ref={canvasRef} className="h-full w-full touch-none cursor-grab active:cursor-grabbing" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel} aria-label="Graphe interactif. Glisser un nœud pour le déplacer, glisser le fond pour déplacer la vue."/>
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
            {Object.entries({ class: 'Classe', function: 'Fonction', component: 'Composant', route: 'Route', test: 'Test' }).map(([type, label]) => (
              <span key={type} className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px]" style={{ background: 'rgba(8, 17, 31, 0.78)', borderColor: 'rgba(140,170,200,0.16)', color: '#C5D3E4' }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: COLORS[type] }}/>{label}
              </span>
            ))}
          </div>
          <div className="absolute right-3 top-3 flex gap-1">
            <button type="button" onClick={() => setZoom(value => Math.min(2.8, value * 1.2))} className="rounded-lg border p-2 text-white" style={{ background: 'rgba(8,17,31,.82)', borderColor: 'rgba(140,170,200,.2)' }} aria-label="Zoom avant"><ZoomIn size={14}/></button>
            <button type="button" onClick={() => setZoom(value => Math.max(0.45, value / 1.2))} className="rounded-lg border p-2 text-white" style={{ background: 'rgba(8,17,31,.82)', borderColor: 'rgba(140,170,200,.2)' }} aria-label="Zoom arrière"><ZoomOut size={14}/></button>
            <button type="button" onClick={focusGraph} className="rounded-lg border p-2 text-white" style={{ background: 'rgba(8,17,31,.82)', borderColor: 'rgba(140,170,200,.2)' }} aria-label="Centrer le graphe"><Maximize2 size={14}/></button>
          </div>
          {loading && <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: '#AFC4DC', background: 'rgba(5,12,22,.35)' }}>Chargement des relations…</div>}
          {!loading && layout.edges.length === 0 && <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-xs" style={{ color: '#AFC4DC' }}>Aucune relation indexée ne correspond à ces filtres.</div>}
        </div>

        <aside className="min-w-0 border-t p-4 lg:border-l lg:border-t-0" style={{ borderColor: 'var(--border-base)' }}>
          {selectedNode ? <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#58BCEB' }}>Nœud sélectionné</p>
                <h4 className="mt-1 break-words text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedNode.name}</h4>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} className="rounded-md px-2 py-1 text-xs" style={mutedStyle}>Fermer</button>
            </div>
            <span className="mt-3 inline-flex rounded-md px-2 py-1 text-[10px]" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>{selectedNode.type}</span>
            <p className="mt-3 break-all font-mono text-[10px]" style={mutedStyle}>{selectedNode.filePath}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg p-2" style={{ background: 'var(--bg-secondary)' }}><p className="text-[10px]" style={mutedStyle}>Connexions</p><strong className="text-lg tabular-nums" style={{ color: 'var(--text-primary)' }}>{selectedNode.degree}</strong></div>
              <div className="rounded-lg p-2" style={{ background: 'var(--bg-secondary)' }}><p className="text-[10px]" style={mutedStyle}>Relations</p><strong className="text-lg tabular-nums" style={{ color: 'var(--text-primary)' }}>{connectedEdges.length}</strong></div>
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={mutedStyle}>Relations connectées</p>
              {connectedEdges.slice(0, 8).map((edge, index) => {
                const outgoing = layout.nodes[edge.source]?.id === selectedNode.id;
                const other = layout.nodes[outgoing ? edge.target : edge.source];
                return <button key={edge.relation.relationType + ':' + index} type="button" onClick={() => other && focusNode(other)} className="w-full rounded-lg border p-2 text-left" style={{ ...panelStyle, borderColor: 'var(--border-base)' }}>
                  <span className="block text-[10px]" style={{ color: '#65BDE9' }}>{outgoing ? '→ ' : '← '}{edge.relation.relationType}</span>
                  <span className="mt-1 block truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{other?.name ?? 'Entité inconnue'}</span>
                  <span className="mt-1 block text-[10px] tabular-nums" style={mutedStyle}>Confiance {Math.round(edge.relation.confidence * 100)}%</span>
                </button>;
              })}
              {connectedEdges.length > 8 && <p className="text-[10px]" style={mutedStyle}>+ {connectedEdges.length - 8} autres relations</p>}
            </div>
          </> : <>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#58BCEB' }}>Explorateur</p>
            <h4 className="mt-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Sélectionne un nœud</h4>
            <p className="mt-2 text-xs leading-relaxed" style={mutedStyle}>Clique sur un élément pour isoler ses connexions et inspecter son origine, son type et ses relations.</p>
            <div className="mt-5 space-y-2 text-[11px]" style={mutedStyle}>
              <p>• Glisser un nœud : déplacer</p><p>• Glisser le fond : naviguer</p><p>• Zoom : boutons en haut à droite</p>
            </div>
          </>}
        </aside>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-[10px]" style={{ borderColor: 'var(--border-base)', ...mutedStyle }}>
        <span>{loadedRelations} relation(s) chargée(s) / {totalRelations} au total</span>
        <div className="flex items-center gap-3">
          {hasMore && <button type="button" onClick={onLoadMore} disabled={loadingMore} className="rounded-md border px-2 py-1 font-medium disabled:opacity-50" style={{ borderColor: 'var(--border-base)', color: 'var(--accent-secondary)' }}>{loadingMore ? 'Chargement…' : 'Charger 100 relations suivantes'}</button>}
          <span>Simulation locale · données source inchangées</span>
        </div>
      </div>
    </section>
  );
}
