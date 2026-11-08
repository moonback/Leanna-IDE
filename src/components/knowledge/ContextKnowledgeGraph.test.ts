import { describe, expect, it } from 'vitest';
import { buildContextGraphLayout, type GraphRelation } from './ContextKnowledgeGraph.js';

const relation = (
  sourceName: string,
  sourceFile: string,
  targetName: string,
  targetFile: string,
  relationType = 'calls',
): GraphRelation => ({
  source: { name: sourceName, filePath: sourceFile, type: 'function' },
  target: { name: targetName, filePath: targetFile, type: 'class' },
  relationType,
  confidence: 0.92,
});

describe('buildContextGraphLayout', () => {
  it('construit des nœuds distincts par entité et conserve les relations source', () => {
    const graph = buildContextGraphLayout([
      relation('execute', 'src/a.ts', 'Runner', 'src/runner.ts', 'uses'),
      relation('execute', 'src/a.ts', 'Runner', 'src/runner.ts', 'calls'),
    ]);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(2);
    expect(graph.nodes.find(node => node.name === 'execute')?.degree).toBe(2);
    expect(graph.edges.map(edge => edge.relation.relationType)).toEqual(['uses', 'calls']);
    expect(graph.edges[0].relation.confidence).toBe(0.92);
  });

  it('distingue deux entités de même nom provenant de fichiers différents', () => {
    const graph = buildContextGraphLayout([
      relation('Controller', 'src/api.ts', 'Service', 'src/service.ts'),
      relation('Controller', 'src/admin.ts', 'Service', 'src/service.ts'),
    ]);

    expect(graph.nodes.filter(node => node.name === 'Controller')).toHaveLength(2);
    expect(graph.nodes).toHaveLength(3);
  });

  it('retourne un graphe vide sans fabriquer de nœuds ou de relations', () => {
    expect(buildContextGraphLayout([])).toEqual({ nodes: [], edges: [] });
  });
});
