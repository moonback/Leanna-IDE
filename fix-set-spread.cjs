#!/usr/bin/env node

/**
 * Script pour corriger les erreurs TS2802 dans le codebase
 * Remplace [...new Set(...)] par Array.from(new Set(...))
 * Remplace [...new Map(...)] par Array.from(new Map(...))
 * Corrige les for...of sur Set/Map/values()/etc.
 */

const fs = require('fs');
const path = require('path');

// Fichiers à corriger
const filesToFix = [
  'server/agents/AgentExecutor.ts',
  'server/agents/AgentMessageBus.ts',
  'server/agents/AgentRepairLoop.ts',
  'server/agents/DelegationParser.ts',
  'server/agents/WorkspaceState.ts',
  'server/utils/postEditValidator.ts'
];

let totalReplacements = 0;

console.log('🔧 Début de la correction des erreurs TS2802...\n');

for (const filePath of filesToFix) {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  Fichier non trouvé: ${filePath}`);
    continue;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  const originalContent = content;
  
  // Compteur de remplacements pour ce fichier
  let fileReplacements = 0;
  
  // Remplacer [...new Set(...)] par Array.from(new Set(...))
  // Pattern: [...new Set(array)]
  const setPattern1 = /\[\.\.\.new Set\(([^)]+)\)\]/g;
  let match;
  while ((match = setPattern1.exec(originalContent)) !== null) {
    fileReplacements++;
  }
  content = content.replace(setPattern1, 'Array.from(new Set($1))');
  
  // Remplacer [...new Map(...)] par Array.from(new Map(...))
  const mapPattern = /\[\.\.\.new Map\(([^)]+)\)\]/g;
  content = content.replace(mapPattern, 'Array.from(new Map($1))');
  
  // Remplacer for...of sur Set/Map
  // Pattern: for (const [x, y] of mySet)
  content = content.replace(
    /for \(const \[([^\]]+)\] of ([a-zA-Z_][a-zA-Z0-9_]*)\)/g,
    (match, keys, iterableVar) => {
      // Vérifier si la variable est un Set ou Map
      // On ne peut pas vérifier ici, on va juste remplacer les cas évidents
      return `for (const [${keys}] of Array.from(${iterableVar}))`;
    }
  );
  
  // Remplacer for...of sur .values()
  content = content.replace(
    /for \(const ([^ ]+) of ([^)]+)\.values\(\)\)/g,
    'for (const $1 of Array.from($2.values()))'
  );
  
  // Remplacer for...of sur .keys()
  content = content.replace(
    /for \(const ([^ ]+) of ([^)]+)\.keys\(\)\)/g,
    'for (const $1 of Array.from($2.keys()))'
  );
  
  // Remplacer for...of sur .entries()
  content = content.replace(
    /for \(const ([^ ]+) of ([^)]+)\.entries\(\)\)/g,
    'for (const $1 of Array.from($2.entries()))'
  );
  
  // Remplacer les valeurs directes: [...Set]
  content = content.replace(
    /\[\.\.\.([a-zA-Z_][a-zA-Z0-9_]*)\]/g,
    (match, varName) => {
      // Vérifier si c'est un Set ou Map
      if (/^[A-Z]/.test(varName) || varName.includes('Set') || varName.includes('Map')) {
        return `Array.from(${varName})`;
      }
      return match;
    }
  );
  
  // Écrire le fichier si des modifications ont été faites
  if (content !== originalContent) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ ${filePath}: ${fileReplacements} modifications effectuées`);
    totalReplacements += fileReplacements;
  } else {
    console.log(`ℹ️  ${filePath}: aucun remplacement nécessaire`);
  }
}

console.log(`\n📊 Total: ${totalReplacements} modifications effectuées`);
console.log('✅ Correction terminée!');
