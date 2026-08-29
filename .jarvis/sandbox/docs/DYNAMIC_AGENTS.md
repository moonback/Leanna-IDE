# Système d'Agents Dynamiques pour Jarvis-OS

## Problème Résolu

Auparavant, l'**Agent Builder** pouvait générer des configurations d'agents personnalisés, mais ces agents n'étaient **pas accessibles** pour la délégation et l'exécution par les autres agents du système.

Le problème était que :
1. Les rôles d'agents étaient **statiques** (`AGENT_ROLES` dans `types.ts`)
2. Le `AGENT_REGISTRY` dans `roles.ts` était un objet statique
3. Les nouveaux agents créés n'étaient pas enregistrés dans le système
4. `AgentRegistry.initialize()` ne créait que les agents statiques
5. `getAgentDefinition()` ne trouvait pas les agents dynamiques

## Solution Implémentée

### 1. **DynamicAgentRegistry** (`server/agents/DynamicAgentRegistry.ts`)

Nouveau module qui gère l'enregistrement dynamique des agents :

```typescript
// Enregistrer un nouvel agent
const role = dynamicAgentRegistry.registerAgent({
  role: 'mon_agent_personnalise',
  name: 'Mon Agent',
  description: 'Description de mon agent',
  systemPrompt: 'Tu es un agent spécialisé...',
  capabilities: ['read_project_file', 'write_project_file'],
  maxConcurrency: 2,
  defaultTimeoutMs: 60000,
});

// Vérifier si un agent existe
dynamicAgentRegistry.hasAgent('mon_agent_personnalise'); // true

// Obtenir la définition
dynamicAgentRegistry.getAgent('mon_agent_personnalise');

// Lister tous les agents dynamiques
dynamicAgentRegistry.getAllAgents();
```

**Fonctionnalités :**
- Enregistrement/suppression d'agents dynamiques
- Activation/désactivation d'agents
- Recherche par nom, description ou rôle
- Statistiques du registre
- Singleton pour accès global

### 2. **Modifications de `types.ts`**

Le type `AgentRole` supporte maintenant les rôles dynamiques :

```typescript
// Avant : seul les rôles statiques étaient autorisés
export type AgentRole = (typeof AGENT_ROLES)[number];

// Maintenant : supporte les rôles statiques ET dynamiques
export type AgentRole = (typeof STATIC_AGENT_ROLES)[number] | string;

// Nouveau : vérification si un rôle est statique
export function isStaticAgentRole(role: string): boolean;
```

Le schéma Zod `agentRoleSchema` accepte maintenant :
- Les rôles statiques (enum)
- Les alias approuvés (enum)
- Les rôles dynamiques valides (string avec validation regex)

### 3. **Modifications de `roles.ts`**

Nouvelle architecture à deux niveaux :

```typescript
// Registry statique (inchangé, agents prédéfinis)
export const STATIC_AGENT_REGISTRY = { coder, refactor, debugger, ... };

// Fonction de lookup intelligente
export function getAgentDefinition(role: string): AgentDefinition | undefined {
  // 1. D'abord vérifier le registre dynamique
  const dynamicAgent = dynamicAgentRegistry.getAgent(role);
  if (dynamicAgent) return dynamicAgent;
  
  // 2. Puis vérifier le registre statique
  return STATIC_AGENT_REGISTRY[role];
}

// Avec version « or throw »
export function getAgentDefinitionOrThrow(role: string): AgentDefinition;

// Lister tous les agents (statiques + dynamiques)
export function listAgentDefinitions(): AgentDefinition[];
export function listAgentRoles(): string[];
export function hasAgent(role: string): boolean;
```

### 4. **Modifications de `AgentRegistry.ts`**

Le registry gère maintenant les agents dynamiques :

```typescript
// Initialisation : charge les agents statiques + dynamiques
initialize(skillHandler: SkillHandler): void {
  const allRoles = listAgentRoles(); // inclut dynamiques
  for (const role of allRoles) {
    const agent = new AutonomousAgent(role, this.executor, this.bus, loopConfig);
    this.agents.set(role, agent);
    agent.start();
  }
}

// Nouveaux méthodes pour la gestion dynamique
registerAndStartDynamicAgent(role: string, loopConfig?: {...}): boolean;
registerAndStartDynamicAgents(roles: string[], loopConfigByRole?: {...}): {...};
unregisterDynamicAgent(role: string): boolean;
```

### 5. **Modifications de `AgentExecutor.ts`**

Vérification que l'agent existe (statique ou dynamique) avant exécution :

```typescript
async execute(task: AgentTask): Promise<void> {
  const role = task.role;
  
  // Vérifier si l'agent existe
  if (!hasAgent(role)) {
    task.status = "failed";
    task.result = {
      success: false,
      summary: `Agent "${role}" introuvable`,
      error: `Agent "${role}" non enregistré. Utilisez l'Agent Builder pour créer et enregistrer cet agent d'abord.`,
      durationMs: 0,
    };
    return;
  }
  
  const agent = getAgentDefinitionOrThrow(role);
  // ... suite de l'exécution
}
```

### 6. **Modifications de `DelegationParser.ts`**

Le parser de délégation utilise maintenant `listAgentRoles()` pour obtenir la liste complète des rôles valides (statiques + dynamiques) :

```typescript
function getValidRoles(): Set<string> {
  const roles = listAgentRoles(); // inclut dynamiques
  return new Set(roles);
}
```

### 7. **Nouvelle API REST** (`/api/agent-registration`)

Nouvelles endpoints pour la gestion des agents :

```bash
# Enregistrer un nouvel agent dynamique
POST /api/agent-registration/register
{
  "role": "mon_agent",
  "name": "Mon Agent",
  "description": "Description",
  "systemPrompt": "Instructions système...",
  "capabilities": ["read_project_file", "write_project_file"],
  "maxConcurrency": 2,
  "defaultTimeoutMs": 60000
}

# Lister les agents dynamiques
GET /api/agent-registration/list

# Lister tous les agents (statiques + dynamiques)
GET /api/agent-registration/list/all

# Vérifier si un agent existe
GET /api/agent-registration/check/:role

# Supprimer un agent dynamique
DELETE /api/agent-registration/:role

# Démarrer un agent dynamique
POST /api/agent-registration/:role/start

# Arrêter un agent dynamique
POST /api/agent-registration/:role/stop

# Statistiques
GET /api/agent-registration/stats
```

### 8. **Intégration avec l'Agent Builder existant**

Le système `custom-agents.ts` (utilisé par l'API `/api/custom-agents`) a été modifié pour :

1. **Enregistrer automatiquement** les agents créés dans le `DynamicAgentRegistry`
2. **Démarrer automatiquement** l'agent dans le `AgentRegistry` (si initialisé)
3. **Désenregistrer automatiquement** lors de la suppression
4. **Charger les agents personnalisés** au démarrage via `initCustomAgents()`

```typescript
// Dans handleCreateAgent
after (agent créé dans le fichier JSON) {
  // Enregistrer dans le registre dynamique
  dynamicAgentRegistry.registerAgent({
    role: draft.role,
    name: draft.name,
    description: draft.description || '',
    systemPrompt: draft.systemPrompt || '',
    capabilities: draft.capabilities || draft.tools || [],
    maxConcurrency: draft.maxConcurrency ?? 2,
    defaultTimeoutMs: draft.defaultTimeoutMs ?? 60_000,
  });
  
  // Démarrer l'agent si le AgentRegistry est initialisé
  if (agentRegistry.isReady) {
    agentRegistry.registerAndStartDynamicAgent(draft.role);
  }
}
```

## Architecture Finale

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Système d'Agents Jarvis-OS                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────┐     ┌──────────────────┐                      │
│  │ STATIC_AGENT_    │     │ DYNAMIC_AGENT_   │                      │
│  │ REGISTRY         │     │ REGISTRY         │                      │
│  │                  │     │ (singleton)       │                      │
│  │ - coder          │     │ - mon_agent      │                      │
│  │ - refactor       │     │ - autre_agent    │                      │
│  │ - debugger       │     │ - custom_xxx     │                      │
│  │ - ...            │     │                  │                      │
│  └──────────────────┘     └──────────────────┘                      │
│            ▲                      ▲                               │
│            └──────────────────┬───┘                               │
│                               │                                   │
│                    ┌──────────▼──────────┐                        │
│                    │  getAgentDefinition │                        │
│                    │  (cherche d'abord    │                        │
│                    │   dynamique, puis    │                        │
│                    │   statique)         │                        │
│                    └──────────┬──────────┘                        │
│                               │                                   │
│                    ┌──────────▼──────────┐                        │
│                    │  AgentRegistry       │                        │
│                    │  (gère les instances│                        │
│                    │   AutonomousAgent)  │                        │
│                    └──────────┬──────────┘                        │
│                               │                                   │
│                    ┌──────────▼──────────┐                        │
│                    │  AgentExecutor       │                        │
│                    │  (exécute les tâches │                        │
│                    │   avec vérification  │                        │
│                    │   que l'agent existe)│                        │
│                    └──────────────────────┘                        │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

Flow de création via Agent Builder :
┌─────────────────────────────────────────────────────────────────────┐
│  1. UI → POST /api/custom-agents (AgentBuilderPanel)                  │
│  2. handleCreateAgent enregistre dans .jarvis/custom-agents.json      │
│  3. handleCreateAgent → dynamicAgentRegistry.registerAgent()        │
│  4. Si AgentRegistry.isReady → registerAndStartDynamicAgent()       │
│  5. Agent est maintenant disponible pour délégation/exécution        │
└─────────────────────────────────────────────────────────────────────┘

Flow de délégation avec agent dynamique :
┌─────────────────────────────────────────────────────────────────────┐
│  1. Agent A génère : ## DÉLÉGATION → mon_agent                      │
│  2. DelegationParser.parse() → getValidRoles() inclut dynamiques     │
│  3. Validation OK → délégation acceptée                              │
│  4. sendDelegation() → getAgentDefinition('mon_agent') trouve       │
│  5. AgentExecutor.execute() → hasAgent('mon_agent') = true         │
│  6. Tâche exécutée par l'agent dynamique                             │
└─────────────────────────────────────────────────────────────────────┘
```

## Utilisation

### Créer un agent via l'UI (Agent Builder)

1. Ouvrir l'Agent Builder via l'interface
2. Décrire l'agent que vous voulez créer
3. Cliquer sur "Générer avec IA"
4. Valider et sauvegarder
5. **L'agent est automatiquement enregistré et démarré**

### Créer un agent via l'API

```bash
# Créer via l'API custom-agents (méthode recommandée)
curl -X POST /api/custom-agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mon Agent Spécial",
    "role": "mon_agent",
    "description": "Un agent personnalisé",
    "systemPrompt": "Tu es un expert en...",
    "capabilities": ["read_project_file", "write_project_file"],
    "maxConcurrency": 2,
    "defaultTimeoutMs": 60000
  }'

# Ou via l'API d'enregistrement direct
curl -X POST /api/agent-registration/register \
  -H "Content-Type: application/json" \
  -d '{
    "role": "mon_agent",
    "name": "Mon Agent",
    "description": "Description",
    "systemPrompt": "Instructions...",
    "capabilities": ["read_project_file"]
  }'
```

### Vérifier les agents disponibles

```bash
# Lister tous les agents (statiques + dynamiques)
curl /api/agent-registration/list/all

# Vérifier si un agent spécifique existe
curl /api/agent-registration/check/mon_agent
```

### Déléguer à un agent dynamique

Dans votre code ou via un agent :

```markdown
## DÉLÉGATION
- CIBLE: mon_agent
- RAISON: Tâche spécifique à réaliser
- FICHIERS: src/file.ts
- PRIORITÉ: high
```

## Persistance

Les agents personnalisés sont persistance dans :
- `.jarvis/custom-agents.json` (configuration)
- `DynamicAgentRegistry` (en mémoire, rechargé au démarrage)

## Sécurité

- Impossible de remplacer un agent statique
- Impossible de supprimer un agent statique
- Validation des noms de rôles (format valide)
- Pas de duplication de rôles

## Performances

- Lookup en O(1) via Map dans DynamicAgentRegistry
- Pas d'impact sur les agents statiques existants
- Chargement lazy des agents dynamiques au démarrage

## Compatibilité

- ✅ Compatible avec tous les agents statiques existants
- ✅ Compatible avec le système de délégation existant
- ✅ Compatible avec AgentMessageBus
- ✅ Compatible avec le système de persistance
- ✅ Compatible avec l'Agent Builder UI

## Fichiers Modifiés

```
Nouveaux fichiers :
- server/agents/DynamicAgentRegistry.ts
- server/routes/agent-registration.ts

Fichiers modifiés :
- server/agents/types.ts
- server/agents/roles.ts
- server/agents/AgentExecutor.ts
- server/agents/AgentRegistry.ts
- server/agents/AgentOrchestrator.ts
- server/agents/DelegationParser.ts
- server/agents/AgentCommunication.ts
- server/agents/index.ts
- server/routes/custom-agents.ts
- server.ts
```

## Tests

Le système a été testé avec :
- Compilation TypeScript ✅
- Build esbuild ✅
- Intégration avec l'Agent Builder existant ✅
- Vérification des imports/exports ✅

## Prochaines Étapes (Optionnel)

1. Ajouter une interface UI pour visualiser les agents dynamiques
2. Implémenter un système de versioning des agents
3. Ajouter des tests unitaires pour DynamicAgentRegistry
4. Implémenter un système de backup/restore des agents dynamiques
5. Ajouter des métriques de performance par agent
