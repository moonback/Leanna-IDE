# Registre des Outils — Vue d'Ensemble

## Problème Initial

Le système Leanna OS utilisait plusieurs registres d'outils qui pouvaient être désynchronisés :

- **ToolRegistry** (`runtime.tools`) : ~208 outils (nouveau système)
- **SkillManager** (`skillManager.getToolDeclarations()`) : ~203 outils (legacy)
- **MCP Servers** : ~34 outils (servers externes)

Cette discordance causait de la confusion et des bugs potentiels.

## Solution

### Architecture Unifiée

Tous les outils passent désormais par un seul registre central :

```
┌─────────────────────────────────────────────────────────────┐
│                      ToolRegistry                            │
│                   (Source de vérité)                         │
└───────────────────┬─────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
   Runtime    SkillManagerV2   MCP
  (nouveau)    (wrapper)     (bridge)
```

### Composants

1. **ToolRegistry** (`server/runtime/ToolRegistry.ts`)
   - Registre central de tous les outils
   - Gère les définitions, métriques et validation
   - Source unique de vérité

2. **SkillManagerV2** (`server/runtime/compat/SkillManagerV2.ts`)
   - Wrapper de compatibilité autour du ToolRegistry
   - Expose l'interface legacy pour ne pas casser le code existant
   - Partage le même ToolRegistry que le Runtime

3. **Bootstrap** (`server/runtime/bootstrap.ts`)
   - Initialise Runtime et SkillManagerV2 avec le même ToolRegistry
   - Garantit qu'il n'y a qu'une seule instance

### Vérification

Endpoint de diagnostic : `GET /api/tools/registry`

Retourne :
```json
{
  "totalTools": 208,
  "runtime": {
    "count": 208,
    "tools": ["read_project_file", "write_project_file", ...]
  },
  "skillManager": {
    "count": 208,
    "tools": ["read_project_file", "write_project_file", ...]
  },
  "mcp": {
    "count": 34,
    "servers": [
      {
        "id": "filesystem",
        "toolCount": 8,
        "tools": ["read_file", "write_file", ...]
      }
    ]
  },
  "duplicates": {
    "count": 0,
    "tools": []
  },
  "sync": {
    "timestamp": "2026-09-17T...",
    "runtimeToolsMatchSkillManager": true,
    "allSourcesAligned": true
  }
}
```

### Points Clés

✅ **Runtime et SkillManager partagent le même ToolRegistry**
- `runtime.tools === skillManager.registry`
- Même source, donc toujours synchronisés

✅ **MCP est isolé**
- Les outils MCP sont fournis par des serveurs externes
- Comptés séparément dans le diagnostic

✅ **Pas de duplication**
- Chaque outil n'est enregistré qu'une seule fois
- Le système détecte automatiquement les doublons

## Migration

### Avant (ancien système)

```typescript
// Registres séparés pouvant être désynchronisés
const oldSkillManager = new SkillManager();
oldSkillManager.registerSkills(skills);

// Outils séparés
const tools1 = oldSkillManager.getTools();      // 203 outils
const tools2 = runtime.getTools();              // 208 outils
// ❌ Différence de 5 outils !
```

### Après (nouveau système)

```typescript
// Bootstrap crée un registre partagé
const { runtime, skillManager } = bootstrapRuntime({ skills });

// Même source
const tools1 = skillManager.getToolDeclarations();  // 208 outils
const tools2 = runtime.tools.getDefinitions();      // 208 outils
// ✅ Toujours synchronisés !
```

## Débogage

Si vous constatez une désynchronisation :

1. **Vérifier le bootstrap**
   ```bash
   # Le log au démarrage doit afficher
   [Bootstrap] Runtime initialisé — 208 outils, ...
   ```

2. **Appeler l'endpoint de diagnostic**
   ```bash
   curl http://localhost:4000/api/tools/registry
   ```

3. **Vérifier les flags**
   - `runtimeToolsMatchSkillManager` doit être `true`
   - `allSourcesAligned` doit être `true`
   - `duplicates.count` doit être `0`

4. **Si désynchronisé**
   - Redémarrer le serveur (force la réinitialisation)
   - Vérifier qu'il n'y a qu'un seul appel à `bootstrapRuntime()`
   - Vérifier que personne ne crée un ToolRegistry séparé

## Références

- [ToolRegistry.ts](server/runtime/ToolRegistry.ts) - Registre central
- [SkillManagerV2.ts](server/runtime/compat/SkillManagerV2.ts) - Wrapper legacy
- [bootstrap.ts](server/runtime/bootstrap.ts) - Initialisation unifiée
- [tools-registry.ts](server/routes/tools-registry.ts) - Endpoint de diagnostic
