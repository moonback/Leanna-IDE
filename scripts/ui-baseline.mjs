#!/usr/bin/env node
/**
 * ui-baseline.mjs — Mesure du poids du bundle front (refonte UI v3, phase 0).
 *
 * Lit dist/ (produit par `vite build`) et calcule, en brut et en gzip -9 :
 *   - le bundle initial (scripts et CSS référencés par dist/index.html,
 *     modulepreload compris) ;
 *   - le total JS / CSS ;
 *   - les plus gros chunks.
 *
 * Usage :
 *   node scripts/ui-baseline.mjs            # affiche les mesures
 *   node scripts/ui-baseline.mjs --save     # écrit docs/generated/ui-baseline.json
 *   node scripts/ui-baseline.mjs --compare  # compare à ui-baseline.json (budget
 *                                           # du plan : bundle initial ≤ +40 kB gz)
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';

const DIST = 'dist';
const ASSETS = join(DIST, 'assets');
const OUT = join('docs', 'generated', 'ui-baseline.json');
const INITIAL_BUDGET_GZ_KB = 40;

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html introuvable : lancez d\'abord `npx vite build`.');
  process.exit(1);
}

const kb = n => Math.round((n / 1024) * 10) / 10;

const files = readdirSync(ASSETS)
  .filter(f => /\.(js|css)$/.test(f))
  .map(f => {
    const buf = readFileSync(join(ASSETS, f));
    return { file: f, raw: buf.length, gz: gzipSync(buf, { level: 9 }).length };
  })
  .sort((a, b) => b.gz - a.gz);

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const initialNames = new Set([...html.matchAll(/assets\/([^"']+\.(?:js|css))/g)].map(m => m[1]));
const initial = files.filter(f => initialNames.has(f.file));

const sum = list => list.reduce((a, f) => ({ raw: a.raw + f.raw, gz: a.gz + f.gz }), { raw: 0, gz: 0 });
// Les noms de chunks contiennent un hash : on le retire pour comparer d'un build à l'autre.
const stem = f => f.replace(/-[\w-]{8}\.(js|css)$/, '.$1');

const report = {
  measuredAt: new Date().toISOString(),
  initial: { files: initial.map(f => stem(f.file)), rawKB: kb(sum(initial).raw), gzKB: kb(sum(initial).gz) },
  js: { count: files.filter(f => f.file.endsWith('.js')).length, rawKB: kb(sum(files.filter(f => f.file.endsWith('.js'))).raw), gzKB: kb(sum(files.filter(f => f.file.endsWith('.js'))).gz) },
  css: { count: files.filter(f => f.file.endsWith('.css')).length, rawKB: kb(sum(files.filter(f => f.file.endsWith('.css'))).raw), gzKB: kb(sum(files.filter(f => f.file.endsWith('.css'))).gz) },
  topChunks: files.slice(0, 15).map(f => ({ chunk: stem(f.file), rawKB: kb(f.raw), gzKB: kb(f.gz) })),
};

const args = process.argv.slice(2);

console.log(`Bundle initial : ${report.initial.files.length} fichiers, ${report.initial.rawKB} kB brut, ${report.initial.gzKB} kB gz`);
console.log(`JS total       : ${report.js.count} fichiers, ${report.js.rawKB} kB brut, ${report.js.gzKB} kB gz`);
console.log(`CSS total      : ${report.css.count} fichiers, ${report.css.rawKB} kB brut, ${report.css.gzKB} kB gz`);
console.log('Plus gros chunks (gz) :');
for (const c of report.topChunks) console.log(`  ${c.chunk.padEnd(40)} ${String(c.gzKB).padStart(7)} kB`);

if (args.includes('--save')) {
  writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
  console.log(`\n→ écrit dans ${OUT}`);
}

if (args.includes('--compare')) {
  if (!existsSync(OUT)) {
    console.error(`\n${OUT} introuvable : lancez d'abord --save sur la baseline.`);
    process.exit(1);
  }
  const base = JSON.parse(readFileSync(OUT, 'utf8'));
  const delta = Math.round((report.initial.gzKB - base.initial.gzKB) * 10) / 10;
  console.log(`\nBundle initial : ${base.initial.gzKB} → ${report.initial.gzKB} kB gz (${delta >= 0 ? '+' : ''}${delta} kB, budget +${INITIAL_BUDGET_GZ_KB} kB)`);
  if (delta > INITIAL_BUDGET_GZ_KB) {
    console.error('✗ Budget du bundle initial dépassé.');
    process.exit(1);
  }
  console.log('✓ Budget respecté.');
}
