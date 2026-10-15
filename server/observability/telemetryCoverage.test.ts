/**
 * Garde-fou de couverture (audit 2026-10-15) : tout appel fournisseur IA brut
 * doit se trouver dans un module instrumenté (télémétrie + budget). Un nouvel
 * appel ajouté ailleurs fait échouer ce test au lieu d'échapper silencieusement
 * au suivi des coûts. Pour l'ajouter : passer par generateText /
 * generateTextStream / trackedGeminiEmbed, ou par reserveModelCallBudget +
 * recordModelCallUsage, puis l'inscrire ci-dessous avec sa justification.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

/** Fichier → justification de la présence d'appels fournisseurs bruts. */
const INSTRUMENTED: Record<string, string> = {
  'server/utils/textGeneration.ts': 'wrapper central (generateText, streams, trackedGeminiEmbed)',
  'server/utils/openrouterEmbeddings.ts': 'reserveModelCallBudget + recordModelCallUsage (embedding)',
  'server/utils/geminiTTS.ts': 'reserveModelCallBudget + recordModelCallUsage (tts)',
  'server/utils/imageGeneration.ts': 'reserveModelCallBudget + recordModelCallUsage (image)',
  'server/utils/jevDecisions.ts': 'recordTokenUsage propre ; hors budget volontairement (porte de sécurité)',
  'server/routes/openrouter.ts': '/chat, /test, /test-image instrumentés ; /models non facturable',
  'server/routes/upload-document.ts': 'branche OpenRouter multimodale via les helpers',
  'server/routes/profile.ts': 'GET /models (validation de clé, non facturable)',
  'server/live/LiveSocketHandler.ts': 'usageMetadata enregistré par requête (live)',
  'server/live/NotebookLiveSocketHandler.ts': 'usageMetadata enregistré par requête (live)',
  'server/live/VoicePresence.ts': 'usageMetadata enregistré par requête (live)',
};

const RAW_CALL = /models\.(generateContent|generateContentStream|embedContent|generateImages|generateVideos)\(|\blive\.connect\(|live\?\.connect|openrouter\.ai\/api|OPENROUTER_BASE_URL\}\//;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) yield full;
  }
}

function rawCallLines(file: string): number[] {
  const lines = readFileSync(file, 'utf8').split('\n');
  const hits: number[] = [];
  lines.forEach((line, i) => {
    const code = line.trim();
    if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
    if (RAW_CALL.test(line)) hits.push(i + 1);
  });
  return hits;
}

test('every raw AI provider call lives in an instrumented module', () => {
  const offenders: string[] = [];
  const files = [...walk(join(ROOT, 'server')), join(ROOT, 'server.ts')];
  for (const file of files) {
    const rel = relative(ROOT, file).split('\\').join('/');
    const hits = rawCallLines(file);
    if (hits.length > 0 && !INSTRUMENTED[rel]) offenders.push(`${rel}:${hits.join(',')}`);
  }
  assert.deepEqual(offenders, [], `Appels fournisseurs non instrumentés :\n${offenders.join('\n')}`);
});

test('allowlist has no stale entries (each file still contains a raw call)', () => {
  const stale = Object.keys(INSTRUMENTED).filter((rel) => rawCallLines(join(ROOT, rel)).length === 0);
  assert.deepEqual(stale, []);
});
