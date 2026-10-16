#!/usr/bin/env node
/**
 * check-bundle-secrets.cjs — Échoue si un secret du .env se retrouve dans dist/ (AUDIT-001).
 *
 * Vite inline au build les variables `VITE_*` référencées : un jeton exposé
 * ainsi part dans chaque installateur. On cherche chaque valeur secrète du
 * .env local (jamais affichée) dans tous les fichiers du build.
 */

const fs = require("fs");
const path = require("path");

const SECRET_KEY = /(TOKEN|SECRET|PASSWORD|_KEY)$/i;
// Publiques par conception (clé anonyme Supabase protégée par RLS).
const PUBLIC_KEYS = new Set(["VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_URL"]);

function parseEnv(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

function secretValues(env) {
  const publicValues = new Set([...PUBLIC_KEYS].map((k) => env[k]).filter(Boolean));
  return Object.entries(env)
    .filter(([k, v]) => SECRET_KEY.test(k) && !PUBLIC_KEYS.has(k) && v.length >= 16 && !publicValues.has(v))
    .map(([k, v]) => ({ key: k, value: v }));
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

/** Retourne la liste des fuites { key, file } (valeurs jamais renvoyées). */
function findLeaks(distDir, env) {
  const secrets = secretValues(env);
  const leaks = [];
  if (!secrets.length || !fs.existsSync(distDir)) return leaks;
  for (const file of walk(distDir)) {
    const content = fs.readFileSync(file, "latin1");
    for (const { key, value } of secrets) {
      if (content.includes(value)) leaks.push({ key, file: path.relative(distDir, file) });
    }
  }
  return leaks;
}

module.exports = { findLeaks, parseEnv };

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const env = {};
  for (const name of [".env", ".env.local"]) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) Object.assign(env, parseEnv(fs.readFileSync(p, "utf8")));
  }
  const leaks = findLeaks(path.join(root, "dist"), env);
  if (leaks.length) {
    for (const { key, file } of leaks) console.error(`[check-bundle-secrets] ✖ valeur de ${key} trouvée dans dist/${file}`);
    process.exit(1);
  }
  console.log("[check-bundle-secrets] ✓ aucun secret du .env dans dist/");
}
