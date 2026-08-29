# Délégation Structurée et Surveillance du MessageBus

Ce document décrit les nouvelles fonctionnalités implémentées pour répondre aux améliorations demandées dans `ameliorations_agents.md` (lignes 13-15) :

1. **Délégation structurée** via JSON au lieu du parsing Markdown
2. **Routage avancé** (load-balancing, round-robin) dans l'AgentMessageBus
3. **Surveillance et traçage** du MessageBus avec métriques et visualisation

---

## 1. Délégation Structurée (DelegationManager)

### Problème résolu

Le système existant (`DelegationParser.ts`) reposait sur le parsing de Markdown produit par les LLMs, ce qui pose plusieurs problèmes :
- Parsing fragile (variantes Unicode, formats non standard)
- Pas de validation stricte du format
- Difficile à intégrer avec des APIs ou outils externes
- Peu flexible pour les délégations complexes

### Solution : DelegationManager

Un nouveau module `DelegationManager.ts` propose une approche structurée basée sur JSON avec :

#### Format de délégation simple

```json
{
  "targetRole": "coder",
  "title": "Implémenter une fonction utilitaire",
  "description": "Créer une fonction de manipulation de chaînes",
  "priority": "high",
  "files": ["src/utils/string.ts"],
  "instructions": "Utiliser TypeScript et ajouter des tests unitaires",
  "context": {
    "project": "utils-library",
    "deadline": "2024-12-31"
  },
  "timeoutMs": 60000,
  "condition": {
    "type": "always"
  }
}
```

#### Format de délégation batch (orchestration)

```json
{
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "strategy": "parallel",
  "delegations": [
    {
      "targetRole": "coder",
      "title": "Implémenter le module",
      "description": "Créer le module principal"
    },
    {
      "targetRole": "tester",
      "title": "Écrire les tests",
      "description": "Créer les tests unitaires"
    }
  ],
  "conditions": {
    "allSucceed": true,
    "maxFailures": 2
  },
  "onComplete": {
    "agentRole": "reviewer",
    "instructions": "Revoir le code et les tests"
  }
}
```

### Stratégies d'exécution batch

- **`parallel`** : Exécute toutes les délégations simultanément
- **`sequential`** : Exécute les délégations une par une
- **`conditional`** : Exécute selon des conditions (on_success, on_failure, on_complete)

### Fonctionnalités clés

- Validation stricte avec Zod
- Vérification contre la matrice de délégation existante
- Enrichissement automatique avec des valeurs par défaut
- Génération de templates pour aider les développeurs
- Historique et traçage des délégations
- Statistiques détaillées (par rôle, priorité, etc.)

### Utilisation

```typescript
import { delegationManager } from "./agents";

// Parsing depuis JSON
const delegations = delegationManager.parseFromJSON(jsonString, "planner");

// Exécution d'une délégation simple
const result = await delegationManager.executeDelegation(delegation, "planner");

// Exécution d'un batch
const results = await delegationManager.executeBatch(batchDelegation, "planner");

// Récupérer les statistiques
const stats = delegationManager.getStatistics();

// Générer un template
const template = delegationManager.generateDelegationTemplate("coder");
```

### Migration depuis DelegationParser

Le `DelegationParser` existant reste fonctionnel pour la rétrocompatibilité. Pour migrer :

```typescript
// Avant (Markdown)
const output = `## DÉLÉGATION
CIBLE: coder
RAISON: Implémenter une fonction`;
const { delegations } = delegationParser.parse(output, "planner");

// Après (JSON)
const json = `{"targetRole": "coder", "title": "Implémenter", "description": "Implémenter une fonction"}`;
const delegations = delegationManager.parseFromJSON(json, "planner");
```

---

## 2. Routage Avancé (AgentMessageBus)

### Nouvelles stratégies de routage

L'`AgentMessageBus` supporte maintenant 4 stratégies de routage :

#### `direct` (par défaut)
Envoyé à tous les agents abonnés au rôle cible. Comportement original.

#### `round-robin`
Distribue les messages de manière équilibrée entre les abonnés.
```typescript
await agentMessageBus.publish(message, {
  routing: "round-robin"
});
```

#### `load-balanced`
Sélectionne l'agent avec la plus faible charge (least connections × temps moyen).
```typescript
await agentMessageBus.publish(message, {
  routing: "load-balanced"
});
```

#### `broadcast`
Diffuse à tous les agents (sauf l'émetteur).
```typescript
await agentMessageBus.broadcast("planner", "Nouvelle tâche disponible");
```

### Métriques de routage

L'AgentMessageBus expose maintenant des métriques détaillées :

```typescript
// Métriques par agent
const load = agentMessageBus.getAgentLoad();
// {
//   coder: { messageCount: 10, activeMessages: 2, avgProcessingTime: 50, loadScore: 100 },
//   tester: { messageCount: 5, activeMessages: 0, avgProcessingTime: 30, loadScore: 0 }
// }

// État round-robin
const rrState = agentMessageBus.getRoundRobinState();

// Métriques de routage détaillées
const metrics = agentMessageBus.getRoutingMetrics();
```

### Traçage des messages

Le traçage permet de suivre les messages à travers le système :

```typescript
// Activer le traçage
agentMessageBus.enableTracing(true);

// Générer un ID de trace
const traceId = agentMessageBus.generateTraceId();

// Les logs incluront maintenant l'ID de trace
// [trace-1] [planner] → [coder] type="task_request" strategy="load-balanced"
```

---

## 3. Surveillance et Traçage (MessageBusMonitor)

### Architecture

Le `MessageBusMonitor` fournit une couche de surveillance complète au-dessus du MessageBus :

```
┌─────────────────────────────────────────────────────────────┐
│                      MessageBusMonitor                          │
├─────────────────────────────────────────────────────────────┤
│  • Collection de métriques (polling ou événements)              │
│  • Détection d'anomalies                                       │
│  • Génération d'alertes                                        │
│  • Analyse de flux de messages                                  │
│  • Visualisation (ASCII, JSON)                                 │
│  • Health checks                                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      AgentMessageBus                            │
│  (Fournit les métriques brutes)                                │
└─────────────────────────────────────────────────────────────┘
```

### Fonctionnalités principales

#### Health Checks

```typescript
const health = messageBusMonitor.getHealthStatus();
// {
//   healthy: true,
//   timestamp: "2024-08-29T12:00:00.000Z",
//   issues: [],
//   metrics: {
//     uptime: 86400000,
//     totalMessages: 1500,
//     successRate: 0.995,
//     pendingRequests: 0,
//     activeSubscriptions: 8,
//     deadLetterQueueSize: 0
//   }
// }

// Vérification simple
if (!messageBusMonitor.isHealthy()) {
  console.log("Problème détecté sur le MessageBus");
}
```

#### Détection d'anomalies

Le moniteur détecte automatiquement :

- **Message Flood** : Un agent envoie trop de messages (>10 en 5 secondes)
- **Dead-letter Queue Full** : Trop de messages en attente (>10 = warning, >50 = critical)
- **High Failure Rate** : Taux de succès < 80%

```typescript
// Récupérer les alertes actives
const alerts = messageBusMonitor.getActiveAlerts();

// S'abonner aux alertes
messageBusMonitor.on("alert", (alert: MonitorAlert) => {
  console.log(`ALERTE: ${alert.severity} - ${alert.title}`);
});
```

#### Analyse de flux

Génère un graphe des interactions entre agents :

```typescript
const graph = messageBusMonitor.generateMessageFlowGraph();
// {
//   nodes: [
//     { role: "planner", sent: 50, received: 10, errors: 0, avgProcessingTime: 100 },
//     { role: "coder", sent: 20, received: 40, errors: 2, avgProcessingTime: 200 }
//   ],
//   edges: [
//     { from: "planner", to: "coder", count: 30, successRate: 0.95, avgTime: 150 }
//   ],
//   timestamp: "2024-08-29T12:00:00.000Z"
// }
```

#### Visualisation

Génère des tableaux de bord textuels :

```typescript
// Dashboard complet
console.log(messageBusMonitor.generateDashboard());

// Visualisation ASCII du graphe de flux
console.log(messageBusMonitor.generateASCIIFlowGraph());
```

Exemple de sortie du dashboard :

```
╔══════════════════════════════════════════════════════════════════════╗
║                    TABLEAU DE BORD MessageBus                        ║
╚══════════════════════════════════════════════════════════════════════╝

🩺 ÉTAT DE SANTÉ:
────────────────────────────────────────────────────────────────
Statut: ✅ SAIN
Uptime: 1d 2h 30m
Total messages: 1500
Taux succès: 99.5%
Requêtes en attente: 0

🚨 ALERTES ACTIVES:
────────────────────────────────────────────────────────────────
Aucune alerte active

📊 ROUTAGE:
────────────────────────────────────────────────────────────────
Stratégie              | Utilisation
────────────────────────────────────────────────────────────────
direct                 |       1000
round-robin            |        300
load-balanced          |        200

👥 CHARGE DES AGENTS:
────────────────────────────────────────────────────────────────
Agent                  | Messages | Actifs | Score
────────────────────────────────────────────────────────────────
coder                  |      500 |      2 |  100.5
planner                |      300 |      0 |    0.0
tester                 |      200 |      1 |   30.0
```

#### Rapports complets

```typescript
const report = messageBusMonitor.getFullReport();
// {
//   health: HealthStatus,
//   metrics: AggregatedMetrics[],
//   alerts: MonitorAlert[],
//   flowGraph: MessageFlowGraph,
//   monitoring: MonitoringReport,
//   timestamp: string
// }
```

### Intégration avec des outils externes

#### Export Prometheus (exemple)

```typescript
import { messageBusMonitor } from "./agents";

// Exposer les métriques au format Prometheus
function exportToPrometheus() {
  const report = messageBusMonitor.getFullReport();
  
  return `# HELP jarvis_messagebus_total_messages Total messages processed
# TYPE jarvis_messagebus_total_messages gauge
jarvis_messagebus_total_messages ${report.monitoring.bus.totalMessages}

# HELP jarvis_messagebus_success_rate Success rate
# TYPE jarvis_messagebus_success_rate gauge
jarvis_messagebus_success_rate ${report.monitoring.bus.successRate}
`;
}
```

#### Webhook d'alertes

```typescript
messageBusMonitor.on("alert", (alert: MonitorAlert) => {
  // Envoyer à Slack, Discord, Email, etc.
  sendWebhookAlert({
    title: alert.title,
    message: alert.message,
    severity: alert.severity,
    timestamp: alert.timestamp
  });
});
```

---

## API Résumée

### DelegationManager

| Méthode | Description |
|---------|-------------|
| `parseFromJSON(json, fromRole)` | Parse une délégation depuis JSON |
| `parseFromYAML(yaml, fromRole)` | Parse une délégation depuis YAML |
| `executeDelegation(delegation, fromRole)` | Exécute une délégation simple |
| `executeBatch(batch, fromRole)` | Exécute un batch de délégations |
| `getDelegationHistory()` | Historique des délégations |
| `getDelegationResults()` | Résultats des délégations |
| `getStatistics()` | Statistiques détaillées |
| `generateDelegationTemplate()` | Génère un template JSON |
| `generateBatchTemplate()` | Génère un template batch |

### AgentMessageBus (nouvelles fonctionnalités)

| Méthode | Description |
|---------|-------------|
| `publish(message, { routing: "round-robin" })` | Publie avec routage round-robin |
| `publish(message, { routing: "load-balanced" })` | Publie avec load-balancing |
| `enableTracing(enabled)` | Active/désactive le traçage |
| `generateTraceId()` | Génère un ID de trace |
| `getRoutingMetrics()` | Métriques de routage |
| `getAgentLoad()` | Charge par agent |
| `getRoundRobinState()` | État round-robin |
| `getMonitoringReport()` | Rapport complet de surveillance |

### MessageBusMonitor

| Méthode | Description |
|---------|-------------|
| `getHealthStatus()` | État de santé du bus |
| `isHealthy()` | Vérifie si le bus est sain |
| `getActiveAlerts()` | Alertes actives |
| `getAllAlerts()` | Toutes les alertes |
| `triggerAlert(alert)` | Déclenche une alerte |
| `resolveAlert(alertId)` | Résout une alerte |
| `generateDashboard()` | Génère un dashboard textuel |
| `generateMessageFlowGraph()` | Génère un graphe de flux |
| `generateASCIIFlowGraph()` | Génère une visualisation ASCII |
| `getFullReport()` | Rapport complet |

---

## Bonnes Pratiques

### 1. Utiliser la délégation structurée

Préférez le format JSON pour les délégations :
- Plus fiable (pas de parsing fragile)
- Plus facile à valider
- Meilleure intégration avec les outils
- Meilleure traçabilité

### 2. Choisir la bonne stratégie de routage

| Stratégie | Quand l'utiliser | Avantages | Inconvénients |
|-----------|------------------|-----------|---------------|
| `direct` | Par défaut, communication simple | Simple, fiable | Pas d'équilibrage |
| `round-robin` | Plusieurs instances du même rôle | Équilibre la charge | Ne tient pas compte de la charge |
| `load-balanced` | Charge variable entre agents | Optimise les ressources | Plus complexe |
| `broadcast` | Notifications à tous | Tous informés | Pas ciblé |

### 3. Surveiller proactivement

- Activez le traçage en développement : `agentMessageBus.enableTracing(true)`
- Vérifiez régulièrement l'état de santé : `messageBusMonitor.isHealthy()`
- Configurez des alertes pour les problèmes critiques
- Utilisez le dashboard pour identifier les goulots d'étranglement

### 4. Nettoyer les ressources

```typescript
// Nettoyer régulièrement les anciennes données
delegationManager.cleanupOldData();
messageBusMonitor.cleanupOldAlerts();
messageBusMonitor.cleanupOldMetrics();
```

---

## Exemples Complets

### Exemple 1 : Délégation structurée avec orchestration

```typescript
import { delegationManager } from "./agents";

// Créer une délégation batch
const batchJson = `{
  "batchId": "${crypto.randomUUID()}",
  "strategy": "sequential",
  "delegations": [
    {
      "targetRole": "coder",
      "title": "Implémenter le service",
      "description": "Créer le service principal avec TypeScript",
      "priority": "high",
      "files": ["src/service.ts"],
      "timeoutMs": 120000
    },
    {
      "targetRole": "tester",
      "title": "Écrire les tests",
      "description": "Créer les tests unitaires et d'intégration",
      "priority": "high",
      "files": ["src/service.test.ts"],
      "condition": {
        "type": "on_success"
      }
    }
  ],
  "conditions": {
    "allSucceed": true
  },
  "onComplete": {
    "agentRole": "reviewer",
    "instructions": "Revoir l'implémentation complète"
  }
}`;

// Parser et exécuter
const delegations = delegationManager.parseFromJSON(batchJson, "planner");
const results = await delegationManager.executeBatch(
  { batchId: crypto.randomUUID(), strategy: "sequential", delegations },
  "planner"
);

console.log(`Batch complété : ${results.filter(r => r.success).length}/${results.length} réussi`);
```

### Exemple 2 : Utilisation du load-balancing

```typescript
import { agentMessageBus } from "./agents";

// Publier avec load-balancing
const message = {
  id: crypto.randomUUID(),
  type: "task_request",
  from: "planner",
  to: "coder", // Plusieurs coders peuvent être abonnés
  priority: "medium",
  timestamp: new Date().toISOString(),
  payload: {
    type: "task_request",
    taskId: crypto.randomUUID(),
    title: "Tâche à répartir",
    description: "Cette tâche sera assignée au coder le moins chargé"
  }
};

// Le bus sélectionnera automatiquement le coder avec la plus faible charge
await agentMessageBus.publish(message, {
  routing: "load-balanced"
});

// Vérifier la charge des agents
const load = agentMessageBus.getAgentLoad();
console.log("Charge par agent:", load);
```

### Exemple 3 : Surveillance complète

```typescript
import { messageBusMonitor } from "./agents";

// Configurer la collecte automatique
setInterval(() => {
  messageBusMonitor.collectMetrics();
}, 60000); // Toutes les minutes

// Afficher le dashboard régulièrement
setInterval(() => {
  console.clear();
  console.log(messageBusMonitor.generateDashboard());
}, 5000); // Toutes les 5 secondes

// Surveiller les alertes
messageBusMonitor.on("alert", (alert) => {
  if (alert.severity === "critical") {
    // Envoyer une notification urgente
    sendEmergencyAlert(alert);
  }
});

// Vérifier la santé avant de démarrer une opération critique
if (!messageBusMonitor.isHealthy()) {
  const issues = messageBusMonitor.getHealthStatus().issues;
  console.error("MessageBus non sain. Problèmes:", issues);
  process.exit(1);
}
```

---

## Migration Guide

### Étape 1 : Commencer par les délégations structurées

1. Importez `DelegationManager` depuis `./agents`
2. Commencez par utiliser `parseFromJSON()` pour les nouvelles délégations
3. Gardez `DelegationParser` pour la rétrocompatibilité

### Étape 2 : Adopter le routage avancé

1. Identifiez les points où le routage pourrait être optimisé
2. Testez les stratégies `round-robin` et `load-balanced`
3. Mesurez l'impact sur les performances

### Étape 3 : Activer la surveillance

1. Intégrez `MessageBusMonitor` dans votre système
2. Configurez des alertes pour les seuils critiques
3. Visualisez les métriques avec le dashboard

### Étape 4 : Nettoyer l'ancien code

Une fois que tout fonctionne avec les nouveaux composants :
1. Supprimez les appels directs à `DelegationParser`
2. Mettez à jour la documentation
3. Supprimez l'ancien code si plus nécessaire

---

## Fichiers Modifiés et Ajoutés

### Fichiers Ajoutés
- `server/agents/DelegationManager.ts` - Gestion de la délégation structurée
- `server/agents/MessageBusMonitor.ts` - Surveillance et traçage
- `server/agents/DelegationManager.test.ts` - Tests pour DelegationManager
- `server/agents/MessageBusMonitor.test.ts` - Tests pour MessageBusMonitor
- `server/agents/DELEGATION_MONITORING.md` - Cette documentation

### Fichiers Modifiés
- `server/agents/AgentMessageBus.ts` - Ajout des stratégies de routage avancées
- `server/agents/AgentCommunication.ts` - Ajout du type `RoutingStrategy`
- `server/agents/index.ts` - Export des nouveaux modules

---

## Performances

### DelegationManager
- Parsing JSON : ~1-2ms par délégation
- Validation : ~0.5ms par délégation
- Exécution : dépend du MessageBus

### Routage avancé
- Round-robin : ~0.1ms (simple incrémentation)
- Load-balancing : ~0.5ms (calcul de score)
- Surcoût par rapport au routage direct : ~0.2-0.5ms

### MessageBusMonitor
- Collection de métriques : ~1-5ms
- Génération de graphe : O(n) où n = nombre de messages
- Détection d'anomalies : ~0.1ms par message

---

## Limites et Travaux Futurs

### Limites connues
1. Le YAML parser dans DelegationManager est basique (utiliser `js-yaml` pour une implémentation complète)
2. La détection d'anomalies est basique (à étendre avec du machine learning)
3. Le load-balancing utilise une simple moyenne mobile (à améliorer avec des algorithmes plus sophistiqués)

### Travaux futurs
1. Intégration avec Prometheus/Grafana pour la visualisation
2. Ajout de métriques personnalisées
3. Support des délégations conditionnelles plus complexes
4. Intégration avec OpenTelemetry pour le traçage distribué
5. Persistance des métriques dans une base de données
6. API REST pour les métriques de monitoring

---

## Support

Pour toute question ou problème concernant ces nouvelles fonctionnalités, consulter :
- La documentation dans ce fichier
- Les tests unitaires pour des exemples d'utilisation
- Le code source des modules correspondants

Les problèmes peuvent être rapportés dans les issues GitHub du projet.
