/**
 * Tests du chunking sémantique de SourceIngester.
 *
 * Le découpage (`chunkText`) est une fonction PURE (aucun appel réseau/LLM) :
 * on la teste directement via un cast, sans passer par l'ingestion complète
 * (qui déclencherait embeddings + résumé LLM).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceIngester } from './SourceIngester.js';
import type { SourceChunk, SourceType } from './types.js';

// Accès à la méthode privée `chunkText` (pure) pour un test unitaire ciblé.
type Chunker = (text: string, sourceId: string, type: SourceType) => SourceChunk[];
const chunkText: Chunker = (sourceIngester as unknown as { chunkText: Chunker }).chunkText.bind(sourceIngester);

// Constantes miroir de SourceIngester (gardées synchronisées manuellement).
const CHUNK_MAX_SIZE = 2000;
const MAX_CHUNKS = 300;

test('chunking: texte vide ne produit aucun chunk', () => {
  assert.deepEqual(chunkText('', 'src-empty', 'text'), []);
  assert.deepEqual(chunkText('   \n  \n ', 'src-ws', 'text'), []);
});

test('chunking: texte court produit un seul chunk avec métadonnées', () => {
  const text = 'Une phrase simple et courte sur un sujet unique.';
  const chunks = chunkText(text, 'src-1', 'text');

  assert.equal(chunks.length, 1);
  const c = chunks[0];
  assert.equal(c.sourceId, 'src-1');
  assert.equal(c.index, 0);
  assert.ok(c.content.includes('phrase simple'));
  assert.equal(typeof c.metadata.startChar, 'number');
  assert.equal(typeof c.metadata.endChar, 'number');
  assert.ok(c.id.length > 0);
});

test('chunking: les index sont séquentiels et contigus', () => {
  // Génère un texte long multi-paragraphes pour forcer plusieurs chunks.
  const para = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor. ';
  const text = Array.from({ length: 60 }, (_, i) => `Paragraphe ${i}. ${para.repeat(3)}`).join('\n\n');

  const chunks = chunkText(text, 'src-seq', 'text');

  assert.ok(chunks.length > 1, 'devrait produire plusieurs chunks');
  chunks.forEach((c, i) => {
    assert.equal(c.index, i, `index ${i} attendu`);
    assert.equal(c.sourceId, 'src-seq');
  });
});

test('chunking: aucun chunk ne dépasse grossièrement la taille max (avec overlap)', () => {
  const sentence = 'Ceci est une phrase de test raisonnablement longue pour peupler le contenu. ';
  const text = sentence.repeat(400); // ~30k chars → forcément subdivisé

  const chunks = chunkText(text, 'src-big', 'text');

  assert.ok(chunks.length > 1);
  // Tolérance pour l'overlap contextuel ajouté en tête de chunk (≤ ~300 chars).
  for (const c of chunks) {
    assert.ok(
      c.content.length <= CHUNK_MAX_SIZE + 400,
      `chunk ${c.index} trop grand: ${c.content.length}`,
    );
  }
});

test('chunking: le nombre de chunks est plafonné à MAX_CHUNKS', () => {
  // Beaucoup de petits paragraphes distincts → potentiellement > 300 chunks.
  const text = Array.from({ length: 5000 }, (_, i) =>
    `Section numéro ${i} avec un contenu distinct et suffisamment long pour tenir seul dans un chunk séparé afin de multiplier les blocs.`,
  ).join('\n\n');

  const chunks = chunkText(text, 'src-cap', 'text');
  assert.ok(chunks.length <= MAX_CHUNKS, `attendu <= ${MAX_CHUNKS}, obtenu ${chunks.length}`);
});

test('chunking markdown: capture les titres de section dans les métadonnées', () => {
  // Chaque section est volumineuse pour forcer plusieurs chunks et donc exposer
  // plusieurs titres de section distincts dans les métadonnées.
  const body = 'Phrase de contenu détaillée répétée pour atteindre une taille significative. '.repeat(30);
  const md = [
    '# Titre principal',
    '',
    '## Introduction',
    body,
    '',
    '## Méthodologie détaillée',
    body,
    '',
    '## Résultats observés',
    body,
  ].join('\n');

  const chunks = chunkText(md, 'src-md', 'markdown');

  assert.ok(chunks.length >= 1);
  const sections = chunks
    .map(c => c.metadata.section)
    .filter((s): s is string => typeof s === 'string');

  // Au moins une section markdown (un titre `#`/`##`) doit être renseignée.
  assert.ok(sections.length >= 1, 'au moins une section markdown attendue');
  const joined = sections.join(' | ');
  assert.ok(
    /Titre principal|Introduction|Méthodologie|Résultats/.test(joined),
    `sections inattendues: ${joined}`,
  );
});

test('chunking pdf: renseigne le numéro de page via les sauts de page (form feed)', () => {
  const page1 = 'Contenu de la première page avec plusieurs phrases distinctes pour le test.';
  const page2 = 'Contenu de la seconde page, également suffisamment long pour être conservé.';
  const page3 = 'Troisième page avec encore du texte afin de vérifier la pagination correcte.';
  const pdfText = [page1, page2, page3].join('\f'); // form feed = saut de page

  const chunks = chunkText(pdfText, 'src-pdf', 'pdf');

  assert.ok(chunks.length >= 1);
  const pages = chunks
    .map(c => c.metadata.page)
    .filter((p): p is number => typeof p === 'number');

  assert.ok(pages.length >= 1, 'au moins un numéro de page attendu');
  // Les numéros de page commencent à 1.
  assert.ok(pages.every(p => p >= 1), 'les pages doivent être >= 1');
});

test('chunking: les ids de chunk sont uniques', () => {
  const text = Array.from({ length: 30 }, (_, i) =>
    `Bloc ${i} avec du contenu suffisant pour générer plusieurs chunks distincts dans le test unitaire.`,
  ).join('\n\n');

  const chunks = chunkText(text, 'src-ids', 'text');
  const ids = new Set(chunks.map(c => c.id));
  assert.equal(ids.size, chunks.length, 'tous les ids de chunk doivent être uniques');
});
