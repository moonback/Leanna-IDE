/**
 * Tests du RAGEngine — composantes déterministes et hors-ligne :
 *   - Recherche lexicale TF-IDF (search() est synchrone, sans embeddings ni LLM)
 *   - Correction du scoring (df par token, pas par sous-chaîne)
 *   - Extraction des citations [SOURCE N] + repli top-3
 *   - Construction du contexte
 *
 * NB : searchHybrid() (expansion LLM + embeddings + re-ranking) n'est pas testé
 * ici car il dépend du réseau ; la logique TF-IDF sous-jacente l'est via search().
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ragEngine } from './RAGEngine.js';
import type { Source, SourceChunk, SourceType, RAGSearchResult } from './types.js';

// ─── Helpers de fabrication ───────────────────────────────────────────────

let chunkCounter = 0;
function makeChunk(sourceId: string, content: string): SourceChunk {
  return {
    id: `chunk-${sourceId}-${chunkCounter++}`,
    sourceId,
    content,
    index: 0,
    metadata: { startChar: 0, endChar: content.length },
  };
}

function makeSource(id: string, title: string, chunkContents: string[], type: SourceType = 'text'): Source {
  const chunks = chunkContents.map(c => makeChunk(id, c));
  return {
    id,
    notebookId: 'nb-test',
    title,
    type,
    origin: `origin://${id}`,
    rawText: chunkContents.join('\n'),
    summary: '',
    keywords: [],
    chunks,
    wordCount: chunkContents.join(' ').split(/\s+/).length,
    language: 'fr',
    addedAt: new Date().toISOString(),
    originalSize: 0,
  };
}

// ─── TF-IDF : pertinence et classement ────────────────────────────────────

test('TF-IDF: remonte le chunk qui contient le terme recherché', () => {
  const src = makeSource('s1', 'Doc', [
    'Les chats domestiques dorment beaucoup pendant la journée.',
    'La photosynthèse convertit la lumière en énergie chimique.',
    'Le chat chasse les souris la nuit dans le jardin.',
  ]);

  const results = ragEngine.search('chat', [src], { minRelevance: 0 });

  assert.ok(results.length >= 1, 'devrait trouver au moins un chunk');
  // Les deux premiers résultats doivent concerner les chats, pas la photosynthèse.
  const top = results[0];
  assert.ok(/chat/i.test(top.chunk.content), `top inattendu: ${top.chunk.content}`);
});

test('TF-IDF: df par TOKEN et non par sous-chaîne (cat ≠ category)', () => {
  // "cat" apparaît en tant que MOT uniquement dans le chunk A.
  // "category" / "catalogue" ne doivent PAS compter comme occurrences de "cat".
  const src = makeSource('s2', 'Doc', [
    'A cat sat on the mat and the cat was happy.',          // contient le mot "cat"
    'This category and that catalogue list many catalogued items.', // "cat" en sous-chaîne seulement
  ]);

  const results = ragEngine.search('cat', [src], { minRelevance: 0 });

  assert.ok(results.length >= 1);
  // Le chunk gagnant doit être celui qui contient réellement le MOT "cat".
  assert.ok(
    /\bcat\b/i.test(results[0].chunk.content),
    `attendu le chunk avec le mot "cat", obtenu: ${results[0].chunk.content}`,
  );
  // Le chunk "category/catalogue" ne doit PAS matcher la requête "cat".
  const matchedCategoryOnly = results.find(r => /category/i.test(r.chunk.content) && !/\bcat\b/i.test(r.chunk.content));
  assert.equal(matchedCategoryOnly, undefined, 'un chunk sans le mot "cat" ne doit pas matcher');
});

test('TF-IDF: respecte maxChunks et le tri décroissant par pertinence', () => {
  const contents = Array.from({ length: 10 }, (_, i) =>
    i % 2 === 0
      ? `Document pertinent numéro ${i} au sujet des algorithmes de recherche.`
      : `Texte sans rapport ${i} sur la cuisine et les recettes de desserts.`,
  );
  const src = makeSource('s3', 'Doc', contents);

  const results = ragEngine.search('algorithmes recherche', [src], { maxChunks: 3, minRelevance: 0 });

  assert.ok(results.length <= 3, 'ne doit pas dépasser maxChunks');
  for (let i = 1; i < results.length; i++) {
    assert.ok(
      results[i - 1].relevance >= results[i].relevance,
      'les résultats doivent être triés par pertinence décroissante',
    );
  }
});

test('TF-IDF: filtre les sources via sourceIds', () => {
  const a = makeSource('sa', 'A', ['le renard roux traverse la forêt enneigée']);
  const b = makeSource('sb', 'B', ['le renard roux dort dans son terrier profond']);

  const onlyB = ragEngine.search('renard', [a, b], { sourceIds: ['sb'], minRelevance: 0 });
  assert.ok(onlyB.length >= 1);
  assert.ok(onlyB.every(r => r.source.id === 'sb'), 'seule la source sb doit être retournée');
});

test('TF-IDF: requête sans correspondance renvoie un tableau vide', () => {
  const src = makeSource('s4', 'Doc', ['contenu totalement différent sur la météorologie']);
  const results = ragEngine.search('zzzxxx_terme_inexistant', [src], { minRelevance: 0 });
  assert.deepEqual(results, []);
});

test('TF-IDF: un filtre de sources explicitement vide ne retourne aucune source', () => {
  const a = makeSource('s-empty-a', 'A', ['contenu secret du document A']);
  const b = makeSource('s-empty-b', 'B', ['contenu secret du document B']);
  const results = ragEngine.search('contenu secret', [a, b], { sourceIds: [], minRelevance: 0 });
  assert.deepEqual(results, [], 'un filtre vide ne doit jamais être interprété comme une recherche globale');
});

// ─── buildContext ──────────────────────────────────────────────────────────

test('buildContext: numérote les sources et encadre le contenu', () => {
  const src = makeSource('s5', 'Mon Titre', ['premier passage', 'second passage']);
  const results: RAGSearchResult[] = src.chunks.map((chunk, i) => ({
    chunk,
    source: src,
    relevance: 1 - i * 0.1,
  }));

  const ctx = ragEngine.buildContext(results);
  assert.ok(ctx.includes('[SOURCE 1:'), 'doit numéroter SOURCE 1');
  assert.ok(ctx.includes('[SOURCE 2:'), 'doit numéroter SOURCE 2');
  assert.ok(ctx.includes('Mon Titre'), 'doit inclure le titre de la source');
  assert.ok(ctx.includes('premier passage'));
});

test('buildContext: message par défaut si aucun résultat', () => {
  const ctx = ragEngine.buildContext([]);
  assert.match(ctx, /Aucun contenu pertinent/i);
});

// ─── extractCitations ────────────────────────────────────────────────────────

function makeResults(src: Source, relevances: number[]): RAGSearchResult[] {
  return src.chunks.map((chunk, i) => ({ chunk, source: src, relevance: relevances[i] ?? 0.5 }));
}

test('extractCitations: extrait les références [SOURCE N] explicites', () => {
  const src = makeSource('s6', 'Doc', ['passage un', 'passage deux', 'passage trois']);
  const results = makeResults(src, [0.9, 0.8, 0.7]);

  const response = 'Selon [SOURCE 1], le point est confirmé, et [SOURCE 3] le complète.';
  const citations = ragEngine.extractCitations(response, results);

  assert.equal(citations.length, 2);
  const chunkIds = citations.map(c => c.chunkId);
  assert.deepEqual(chunkIds, [results[0].chunk.id, results[2].chunk.id]);
  assert.equal(citations[0].sourceTitle, 'Doc');
});

test('extractCitations: accepte le format court [N]', () => {
  const src = makeSource('s7', 'Doc', ['alpha', 'beta']);
  const results = makeResults(src, [0.9, 0.8]);

  const citations = ragEngine.extractCitations('La preuve est en [2].', results);
  assert.equal(citations.length, 1);
  assert.equal(citations[0].chunkId, results[1].chunk.id);
});

test('extractCitations: dédoublonne les références répétées', () => {
  const src = makeSource('s8', 'Doc', ['alpha', 'beta']);
  const results = makeResults(src, [0.9, 0.8]);

  const citations = ragEngine.extractCitations('[SOURCE 1] puis encore [SOURCE 1] et [1].', results);
  assert.equal(citations.length, 1, 'une seule citation malgré les répétitions');
});

test('extractCitations: ignore les index hors limites (pas de citation explicite)', () => {
  // Résultats sous le seuil 0.3 pour neutraliser le repli top-3 et isoler le
  // comportement "index hors limites" : [SOURCE 5] et [0] ne doivent rien citer.
  const src = makeSource('s9', 'Doc', ['alpha']);
  const results = makeResults(src, [0.2]);

  const citations = ragEngine.extractCitations('Voir [SOURCE 5] et [0].', results);
  assert.equal(citations.length, 0, 'aucun index valide → aucune citation (fallback neutralisé)');
});

test('extractCitations: ne remplace pas une référence explicite invalide par des citations implicites', () => {
  const src = makeSource('s9-invalid', 'Doc', ['passage fiable un', 'passage fiable deux', 'passage fiable trois']);
  const results = makeResults(src, [0.95, 0.9, 0.85]);
  const citations = ragEngine.extractCitations('La preuve est [SOURCE 99].', results);
  assert.deepEqual(citations, [], 'une référence explicite hors limites ne doit pas être remplacée par des citations non demandées');
});

test('extractCitations: repli top-3 quand aucune citation explicite (si pertinence >= 0.3)', () => {
  const src = makeSource('s10', 'Doc', ['a', 'b', 'c', 'd']);
  const results = makeResults(src, [0.9, 0.8, 0.7, 0.6]);

  const citations = ragEngine.extractCitations('Réponse sans aucune référence explicite.', results);
  assert.equal(citations.length, 3, 'repli sur les 3 premiers résultats');
});

test('extractCitations: repli top-3 exclut les résultats sous le seuil 0.3', () => {
  const src = makeSource('s11', 'Doc', ['a', 'b', 'c']);
  const results = makeResults(src, [0.9, 0.2, 0.1]); // seul le premier passe le seuil

  const citations = ragEngine.extractCitations('Réponse sans référence.', results);
  assert.equal(citations.length, 1);
  assert.equal(citations[0].chunkId, results[0].chunk.id);
});

test('extractCitations: aucune citation si aucun résultat', () => {
  const citations = ragEngine.extractCitations('Peu importe [SOURCE 1].', []);
  assert.deepEqual(citations, []);
});

// ─── Audit de traçabilité des citations ──────────────────────────────────────

test('auditCitations: mesure la couverture et détecte les références invalides', () => {
  const src = makeSource('audit-a', 'Document A', ['preuve alpha', 'preuve beta', 'preuve gamma']);
  const results = makeResults(src, [0.95, 0.9, 0.85]);
  const response = 'Le premier point [SOURCE 1] est établi. Le second [SOURCE 99] est à vérifier.';
  const citations = ragEngine.extractCitations(response, results);
  const audit = ragEngine.auditCitations(response, results, citations);

  assert.equal(audit.retrievedChunks, 3);
  assert.equal(audit.citedChunks, 1);
  assert.equal(audit.citedSources, 1);
  assert.equal(audit.explicitReferences, 2);
  assert.equal(audit.validReferences, 1);
  assert.equal(audit.invalidReferences, 1);
  assert.equal(audit.retrievalCoveragePercent, 33);
  assert.equal(audit.status, 'partial');
});

test('auditCitations: distingue les citations implicites des références explicites', () => {
  const src = makeSource('audit-b', 'Document B', ['preuve un', 'preuve deux']);
  const results = makeResults(src, [0.9, 0.8]);
  const response = 'Voici une réponse sans marqueur de citation.';
  const citations = ragEngine.extractCitations(response, results);
  const audit = ragEngine.auditCitations(response, results, citations);

  assert.equal(audit.status, 'implicit');
  assert.equal(audit.explicitReferences, 0);
  assert.equal(audit.citedChunks, 2);
  assert.equal(audit.retrievalCoveragePercent, 100);
});

test('auditCitations: signale une réponse sans citation exploitable', () => {
  const src = makeSource('audit-c', 'Document C', ['preuve peu pertinente']);
  const results = makeResults(src, [0.2]);
  const response = 'Réponse sans citation.';
  const citations = ragEngine.extractCitations(response, results);
  const audit = ragEngine.auditCitations(response, results, citations);

  assert.equal(audit.status, 'missing');
  assert.equal(audit.citedChunks, 0);
  assert.equal(audit.retrievalCoveragePercent, 0);
});
