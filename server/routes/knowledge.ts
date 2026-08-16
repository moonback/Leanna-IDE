import { Router, Request, Response } from 'express';
import { knowledgeGraph, projectIndexer, projectMemory, understandingEngine, dependencyGraph, learningEngine, fileWatcher } from '../knowledge';
import { SELF_ROOT } from '../utils/selfRoot';
import { isSandboxActive, getSandboxRoot } from '../utils/sandbox';

const router = Router();

// GET /api/knowledge/status
router.get('/status', (_req: Request, res: Response) => {
  try {
    const kgStats = knowledgeGraph.getStats();
    res.json({
      status: 'success',
      knowledgeGraph: {
        indexedFiles: kgStats.totalFiles,
        totalEntities: kgStats.totalEntities,
        totalLines: kgStats.totalLines,
        totalExports: kgStats.totalExports,
        totalImports: kgStats.totalImports,
        lastIndexed: knowledgeGraph.getLastIndexed(),
        filesByExtension: kgStats.filesByExtension,
        entitiesByType: kgStats.entitiesByType,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/knowledge/health
router.get('/health', (_req: Request, res: Response) => {
  try {
    const healthScan = understandingEngine.scanKnowledgeHealth();
    const kgStats = knowledgeGraph.getStats();
    const allFacts = projectMemory.getAllFacts();
    const cycles = dependencyGraph.detectCycles();
    const sandboxActive = isSandboxActive();
    const activeWorkspace = sandboxActive ? getSandboxRoot() : SELF_ROOT;

    const categoryBreakdown: Record<string, number> = {};
    let structuralCount = 0;

    for (const fact of allFacts) {
      categoryBreakdown[fact.category] = (categoryBreakdown[fact.category] || 0) + 1;
      if (fact.isStructural) structuralCount++;
    }

    const overallStatus =
      healthScan.warnings.length === 0
        ? 'healthy'
        : healthScan.warnings.some((w) => w.includes('non initialisé') || w.includes('indisponible'))
        ? 'degraded'
        : 'warning';

    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      health: {
        overall: overallStatus,
        isInitialized: knowledgeGraph.isInitialized(),
        lastIndexed: knowledgeGraph.getLastIndexed(),
        warnings: healthScan.warnings,
      },
      knowledgeGraph: {
        totalFiles: kgStats.totalFiles,
        totalEntities: kgStats.totalEntities,
        totalLines: kgStats.totalLines,
        totalExports: kgStats.totalExports,
        totalImports: kgStats.totalImports,
        averageFileSize: kgStats.averageFileSize,
      },
      dependencyGraph: {
        cycleCount: cycles.length,
        cycles: cycles.slice(0, 5),
      },
      projectMemory: {
        totalFacts: allFacts.length,
        structuralFacts: structuralCount,
        categoryBreakdown,
        maxFacts: 500,
      },
      workspace: {
        selfRoot: SELF_ROOT,
        activeWorkspace,
        sandboxActive,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/knowledge/dashboard
router.get('/dashboard', (_req: Request, res: Response) => {
  try {
    // 1. KnowledgeGraph stats
    const kgStats = knowledgeGraph.getStats();
    const allFiles = knowledgeGraph.getAllFiles();
    const lastIndexed = knowledgeGraph.getLastIndexed();
    const allRelations = knowledgeGraph.getRelations();
    const relationsByType: Record<string, number> = {};
    for (const relation of allRelations) {
      relationsByType[relation.relationType] = (relationsByType[relation.relationType] || 0) + 1;
    }
    const structuralEntities = {
      // Entités documentaires
      sections: kgStats.entitiesByType.section || 0,
      todos: kgStats.entitiesByType.todo || 0,
      frontmatter: kgStats.entitiesByType.frontmatter || 0,
      alerts: kgStats.entitiesByType.alert || 0,
      docLinks: kgStats.entitiesByType.doc_link || 0,
      codeBlocks: kgStats.entitiesByType.code_block || 0,
      // Entités de code
      routes: kgStats.entitiesByType.route || 0,
      databaseTables: kgStats.entitiesByType.db_table || 0,
      environmentVariables: kgStats.entitiesByType.env_var || 0,
      tests: kgStats.entitiesByType.test || 0,
      symbols: kgStats.entitiesByType.symbol || 0,
    };

    // 2. DependencyGraph : cycles + fichiers les plus couplés
    const cycles = dependencyGraph.detectCycles();
    const couplingRanking = allFiles
      .map((f) => {
        const deps = knowledgeGraph.getDependencies(f.path).length;
        const dependents = knowledgeGraph.getDependents(f.path).length;
        return {
          path: f.path,
          dependencies: deps,
          dependents,
          totalEdges: deps + dependents,
        };
      })
      .sort((a, b) => b.totalEdges - a.totalEdges)
      .slice(0, 15);

    // Top fichiers les plus impactés (le plus grand nombre de dependents)
    const topImpacted = allFiles
      .map((f) => ({
        path: f.path,
        impacted: knowledgeGraph.getDependents(f.path).length,
      }))
      .sort((a, b) => b.impacted - a.impacted)
      .slice(0, 10)
      .filter((x) => x.impacted > 0);

    // 3. ProjectMemory : catégories, tags, top utilisés
    const allFacts = projectMemory.getAllFacts();
    const factByCategory: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    const topUsedFacts = [...allFacts]
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10);

    for (const fact of allFacts) {
      factByCategory[fact.category] = (factByCategory[fact.category] || 0) + 1;
      for (const tag of fact.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }));

    // Factes récents (10 derniers par updatedAt DESC)
    const recentFacts = [...allFacts]
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, 10);

    // 4. UnderstandingEngine : health scan
    const health = understandingEngine.scanKnowledgeHealth();

    // 5. LearningEngine : patterns history
    const patterns = learningEngine.getPatternsHistory(5);

    // 6. Stats de top fichiers par taille/lignes
    const topLargest = [...allFiles]
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 10)
      .map((f) => ({
        path: f.path,
        lines: f.lines,
        size: f.size,
        entities: f.entities.length,
      }));

    const topEntityDense = [...allFiles]
      .sort((a, b) => b.entities.length - a.entities.length)
      .slice(0, 10)
      .map((f) => ({
        path: f.path,
        entities: f.entities.length,
        lines: f.lines,
      }));

    // 7. Sandbox status
    const sandboxActive = isSandboxActive();
    const workspaceUsed = sandboxActive ? getSandboxRoot() : SELF_ROOT;

    res.json({
      status: 'success',
      generatedAt: new Date().toISOString(),
      workspace: {
        selfRoot: SELF_ROOT,
        activeWorkspace: workspaceUsed,
        sandboxActive,
      },
      graph: {
        lastIndexed,
        totalFiles: kgStats.totalFiles,
        totalLines: kgStats.totalLines,
        totalEntities: kgStats.totalEntities,
        totalExports: kgStats.totalExports,
        totalImports: kgStats.totalImports,
        averageFileSize: kgStats.averageFileSize,
        filesByExtension: kgStats.filesByExtension,
        entitiesByType: kgStats.entitiesByType,
        structuralEntities,
        relations: {
          total: allRelations.length,
          byType: relationsByType,
        },
        topLargest,
        topEntityDense,
        topImpacted,
        couplingRanking,
        cycleCount: cycles.length,
        cycles: cycles.slice(0, 10),
      },
      memory: {
        totalFacts: allFacts.length,
        factByCategory,
        topTags,
        topUsedFacts,
        recentFacts,
      },
      health,
      patterns,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/knowledge/reindex
router.post('/reindex', async (_req: Request, res: Response) => {
  try {
    const stats = await projectIndexer.scanAll();
    res.json({
      status: 'success',
      stats: {
        totalFiles: stats.totalFiles,
        totalEntities: stats.totalEntities,
        durationMs: stats.durationMs,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/knowledge/search
router.get('/search', (req: Request, res: Response) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) {
      return res.status(400).json({ error: 'Le paramètre "q" est requis.' });
    }
    const results = knowledgeGraph.searchEntities(query);
    res.json({ status: 'success', results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/knowledge/relations — Relations sémantiques entre entités
router.get('/relations', (req: Request, res: Response) => {
  try {
    const entity = typeof req.query.entity === 'string' ? req.query.entity.trim() : '';
    const file = typeof req.query.file === 'string' ? req.query.file.trim() : '';
    const type = typeof req.query.type === 'string' ? req.query.type.trim() : '';

    let relations = knowledgeGraph.getRelations();

    if (entity) {
      relations = relations.filter(r => r.source.name === entity || r.target.name === entity);
    }
    if (file) {
      relations = relations.filter(r => r.source.filePath.includes(file) || r.target.filePath.includes(file));
    }
    if (type) {
      relations = relations.filter(r => r.relationType === type);
    }

    res.json({
      status: 'success',
      count: relations.length,
      relations: relations.slice(0, 100),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/knowledge/memory/purge — Purge les faits bruyants
router.post('/memory/purge', (_req: Request, res: Response) => {
  try {
    const removed = projectMemory.purgeNoisyFacts();
    res.json({
      status: 'success',
      removed,
      remaining: projectMemory.size,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/knowledge/watcher — Statut du FileWatcher
router.get('/watcher', (_req: Request, res: Response) => {
  try {
    const stats = fileWatcher.getStats();
    res.json({ status: 'success', watcher: stats });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;