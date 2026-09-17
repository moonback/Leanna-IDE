Oui. Et en regardant ton codebase, **Leanna possède déjà une grosse partie des briques nécessaires**, mais elles sont encore principalement organisées autour de tâches déclenchées par l’utilisateur.

Ton architecture contient déjà `AutonomousAgent`, `AutonomousLoop`, `AgentRepairLoop`, `AgentValidation`, `AgentOrchestrator`, `AgentMessageBus`, la mémoire hiérarchique, le Knowledge Graph, les workflows et le scheduler. 

Le point important est donc : **ne pas simplement ajouter plus d'agents**. Il faut transformer Leanna en un **système agentique vivant**, capable de percevoir → comprendre → décider → agir → vérifier → apprendre → recommencer.

### Ce que je viserais pour Leanna

```text
                         ┌──────────────────────┐
                         │       LEANNA         │
                         │   Autonomous Core    │
                         └──────────┬───────────┘
                                    │
             ┌──────────────────────┼──────────────────────┐
             ↓                      ↓                      ↓
        PERCEPTION              MEMORY                 GOALS
             │                      │                      │
     ┌───────┴───────┐       ┌──────┴──────┐       ┌──────┴──────┐
     │ Workspace     │       │ Episodic    │       │ Objectives  │
     │ Browser       │       │ Semantic    │       │ Projects    │
     │ Git           │       │ Procedural  │       │ Priorities  │
     │ System        │       │ Working     │       │ Deadlines   │
     │ Messages      │       └─────────────┘       └─────────────┘
     └───────┬───────┘
             │
             ↓
      ┌───────────────┐
      │  HOMEOSTASIS  │
      │ "Que se passe │
      │   maintenant?"│
      └───────┬───────┘
              ↓
       ┌──────────────┐
       │   PLANNER    │
       │ Priorisation │
       │ Décomposition│
       └──────┬───────┘
              ↓
       ┌──────────────┐
       │ AGENT FLEET  │
       │ coder        │
       │ researcher   │
       │ reviewer     │
       │ tester       │
       │ browser      │
       │ security     │
       └──────┬───────┘
              ↓
       ┌──────────────┐
       │    ACTION    │
       │ tools/skills │
       │ browser      │
       │ terminal     │
       │ filesystem   │
       │ GitHub       │
       └──────┬───────┘
              ↓
       ┌──────────────┐
       │  VERIFY      │
       │ tests        │
       │ typecheck    │
       │ diff         │
       │ regression   │
       └──────┬───────┘
              ↓
        ┌────────────┐
        │ REFLECT    │
        │ succeeded? │
        │ failed?    │
        │ improve?   │
        └─────┬──────┘
              │
        ┌─────┴──────┐
        ↓            ↓
      LEARN       RETRY/REPLAN
        │            │
        └──────┬─────┘
               ↓
          NEXT CYCLE
```

### 1. Passer de « tâche autonome » à « autonomie permanente »

Aujourd'hui, ton `AutonomousAgent` sait recevoir une tâche, gérer sa file interne, déléguer et communiquer avec les autres agents. 

Mais sa boucle est actuellement configurée avec seulement **3 itérations**, un score minimal de confiance de `0.6` et une vérification des fichiers. 

Je créerais au-dessus :

```text
AutonomousRuntime
        │
        ├── PerceptionLoop
        ├── GoalManager
        ├── DecisionEngine
        ├── MissionManager
        ├── AgentFleet
        ├── Memory
        ├── LearningEngine
        ├── VerificationEngine
        └── AutonomyController
```

L'`AutonomousLoop` deviendrait alors **le moteur d'exécution**, et non le cerveau complet.

---

# 2. Donner à Leanna ses propres objectifs

C'est probablement **le changement le plus important**.

Aujourd'hui :

```text
Utilisateur
   ↓
Tâche
   ↓
Agent
   ↓
Action
```

Je viserais :

```text
Utilisateur
   ↓
Objectif
   ↓
Leanna
   ↓
Plan
   ↓
Missions
   ↓
Agents
   ↓
Actions
   ↓
Résultats
   ↓
Nouvelle décision
```

Exemple :

> « Maintiens mon projet en bon état. »

Leanna pourrait transformer ça en objectifs persistants :

```json
{
  "goal": "maintain-project",
  "priority": "high",
  "constraints": {
    "noBreakingChanges": true,
    "requireTests": true
  },
  "checks": [
    "typescript",
    "tests",
    "security",
    "dependencies",
    "git-status",
    "architecture"
  ],
  "cadence": "continuous"
}
```

Elle n'attend donc plus nécessairement :

> « Leanna, analyse mon projet. »

Elle sait qu'un objectif existe.

---

# 3. Donner une vraie boucle de perception

Tu as déjà énormément de matière pour cela.

Ton projet contient notamment :

* `KnowledgeGraph`
* `ProjectMemory`
* `LearningEngine`
* `UnderstandingEngine`
* `FileWatcher`
* `WorkspaceIndexer`
* `SemanticSearch`
* `ImpactAnalyzer`
* `AutomationScheduler`
* `WorkflowEngine`
* `EventBus`

et côté agents :

* `AgentOrchestrator`
* `AutonomousAgent`
* `AutonomousLoop`
* `AgentRepairLoop`
* `AgentValidation`
* `AgentMessageBus`. 

Il faut les connecter dans **une boucle de perception continue**.

Par exemple :

```text
File changed
     ↓
EventBus
     ↓
PerceptionEngine
     ↓
ImpactAnalyzer
     ↓
KnowledgeGraph update
     ↓
Risk assessment
     ↓
Should Leanna act?
     ↓
Mission
```

Ainsi :

```text
toi modifies package.json
        ↓
Leanna détecte
        ↓
elle identifie une dépendance modifiée
        ↓
elle analyse l'impact
        ↓
elle lance les tests nécessaires
        ↓
elle détecte une régression
        ↓
elle crée une mission de correction
        ↓
coder agent
        ↓
tester agent
        ↓
reviewer agent
        ↓
validation
```

---

# 4. Créer un véritable `Goal Engine`

Je créerais :

```text
server/autonomy/
│
├── AutonomousRuntime.ts
├── AutonomyController.ts
├── GoalEngine.ts
├── GoalManager.ts
├── GoalEvaluator.ts
├── GoalPrioritizer.ts
├── PerceptionEngine.ts
├── DecisionEngine.ts
├── ReflectionEngine.ts
├── LearningEngine.ts
├── OpportunityDetector.ts
├── ProactiveEngine.ts
└── types.ts
```

Ton dossier `server/autonomy` existe déjà mais est actuellement beaucoup plus petit, avec notamment `SmartSkills` et `Supervisor`. 

---

# 5. Leanna doit pouvoir créer ses propres missions

C'est là que ton système devient vraiment intéressant.

Exemple :

```text
PERCEPTION

"J'ai détecté 4 fichiers modifiés."

↓

UNDERSTANDING

"Ces fichiers appartiennent au système d'authentification."

↓

RISK

"Modification sensible."

↓

DECISION

"Je dois lancer une vérification."

↓

MISSION

security-audit

↓

AGENTS

security
   ↓
tester
   ↓
reviewer

↓

RESULT

Aucun problème

↓

MEMORY

"Modification validée."

↓

WAIT

...
```

Mais si elle détecte un problème :

```text
PROBLÈME
   ↓
PLAN DE RÉPARATION
   ↓
CODER
   ↓
TESTER
   ↓
ÉCHEC
   ↓
ANALYSE
   ↓
NOUVEAU PLAN
   ↓
CODER
   ↓
TESTER
   ↓
SUCCÈS
```

Ton `AgentRepairLoop` est justement une brique qui peut servir à cette mécanique. 

---

# 6. Ajouter la notion de « curiosité »

Pour rendre Leanna proactive, je lui donnerais un détecteur d'opportunités.

Par exemple :

```text
OpportunityDetector

├── dette technique
├── bug potentiel
├── code dupliqué
├── dépendance obsolète
├── test manquant
├── documentation manquante
├── problème sécurité
├── optimisation possible
├── incohérence architecture
└── tâche abandonnée
```

Elle pourrait alors générer :

```text
Opportunity
      ↓
Score
      ↓
Priorité
      ↓
Goal
      ↓
Mission
```

**Important :** ces actions doivent rester soumises à des politiques de sécurité et à des limites d'autorité.

---

# 7. Une mémoire beaucoup plus proche d'un « vécu »

Tu as déjà `HierarchicalMemoryService`, `Memory`, `ProjectMemory`, `DocumentMemory`, etc.

Je structurerais la mémoire en :

```text
MEMORY

Working Memory
│
├── contexte actuel
├── mission actuelle
├── agents actifs
└── décisions récentes

Episodic Memory
│
├── ce qui s'est passé
├── actions
├── erreurs
└── résultats

Semantic Memory
│
├── compréhension du projet
├── architecture
├── conventions
└── dépendances

Procedural Memory
│
├── comment résoudre X
├── comment tester Y
└── workflows efficaces

User Preferences
│
├── préférences explicites
└── règles de travail

Project Memory
│
├── objectifs
├── décisions
├── historique
└── état
```

La différence fondamentale :

**ne pas seulement mémoriser des conversations.**

Mémoriser :

> « J'ai essayé X → cela a échoué → la cause était Y → la solution Z a fonctionné. »

C'est beaucoup plus utile pour une autonomie réelle.

---

# 8. Donner à Leanna un état interne

Je créerais une machine d'état globale :

```text
IDLE
 ↓
OBSERVING
 ↓
UNDERSTANDING
 ↓
PLANNING
 ↓
EXECUTING
 ↓
VERIFYING
 ↓
REFLECTING
 ↓
LEARNING
 ↓
WAITING
 ↓
OBSERVING
```

Et pour les problèmes :

```text
EXECUTING
    ↓
FAILURE
    ↓
DIAGNOSING
    ↓
REPLANNING
    ↓
REPAIRING
    ↓
VERIFYING
```

Tu as déjà `StateMachine.ts` dans le runtime, donc cette évolution pourrait s'intégrer à ton architecture existante plutôt que créer un système parallèle. 

---

# 9. Un « système nerveux » pour Leanna

Ton `EventBus` peut devenir extrêmement important.

Je ferais circuler des événements comme :

```ts
type LeannaEvent =
  | "workspace.changed"
  | "file.created"
  | "file.deleted"
  | "git.changed"
  | "test.failed"
  | "test.passed"
  | "build.failed"
  | "agent.failed"
  | "agent.completed"
  | "mission.created"
  | "mission.completed"
  | "goal.changed"
  | "memory.created"
  | "risk.detected"
  | "opportunity.detected"
  | "user.message"
  | "browser.changed"
  | "external.message";
```

Ton `EventBus` existe déjà dans `server/runtime`. 

---

# 10. Leanna doit pouvoir travailler pendant que tu ne lui parles pas

C'est probablement ce que tu recherches réellement avec « autonome ».

Exemple :

```text
23:00
Tu fermes Leanna

        ↓

23:15
Leanna détecte une tâche planifiée

        ↓

23:16
Analyse

        ↓

23:18
Mission créée

        ↓

23:20
Coder

        ↓

23:27
Tests

        ↓

23:30
Reviewer

        ↓

23:33
Validation

        ↓

23:35
Résultat sauvegardé

        ↓

08:00
Tu ouvres Leanna

"Cette nuit j'ai détecté X.
J'ai fait Y.
J'ai rencontré Z.
Voici ce qui a été validé."
```

Ton API contient déjà des routes pour les tâches autonomes et la délégation, notamment `POST /api/agents/delegate-autonomous`, où un agent peut sous-déléguer. 

Il faut maintenant passer de **« autonome quand je lui donne une tâche »** à **« capable de gérer continuellement des objectifs autorisés »**.

---

# 11. Le système d'autorité est indispensable

Je ne donnerais surtout pas à Leanna une autonomie illimitée.

Je créerais :

```text
AUTONOMY LEVEL

L0 — Chat
L1 — Suggestions
L2 — Lecture autonome
L3 — Analyse autonome
L4 — Modifications sandbox
L5 — Tests / validation
L6 — Corrections autonomes
L7 — Actions externes autorisées
L8 — Missions longues
```

Et chaque outil possède une permission :

```text
filesystem.read       → L2
filesystem.write      → L4
terminal              → L5
git.commit            → L6
git.push              → L7
browser                → L7
telegram.send          → L7
delete.files           → confirmation
external.purchase     → confirmation
```

Ton sandbox est déjà conçu pour isoler les modifications IA avant leur application au workspace principal. 

C'est une excellente base pour cette architecture.

---

# 12. Le résultat final

Je transformerais Leanna en :

```text
                     LEANNA
                       │
                AUTONOMOUS CORE
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   PERCEPTION        MEMORY         GOALS
        │              │              │
        └──────────────┼──────────────┘
                       ↓
                DECISION ENGINE
                       ↓
                 MISSION ENGINE
                       ↓
                 AGENT ORCHESTRATOR
                       ↓
              ┌────────┼────────┐
              ↓        ↓        ↓
            AGENT    AGENT    AGENT
              └────────┼────────┘
                       ↓
                     TOOLS
                       ↓
                    SANDBOX
                       ↓
                   VALIDATION
                       ↓
                    REFLECTION
                       ↓
                    LEARNING
                       ↓
                 MEMORY UPDATE
                       ↓
                NEXT DECISION
                       ↺
```

### Et surtout : ne reconstruis pas Leanna.

Ton code montre déjà que tu as **une très grosse partie des primitives nécessaires** : agents autonomes, boucle autonome, délégation, bus inter-agents, validation, réparation, mémoire, Knowledge Graph, workflows, scheduler, skills et runtime. 

Le vrai chantier est maintenant de créer **une couche supérieure `Autonomous Core` qui orchestre toutes ces briques en permanence**.

C'est cette couche qui ferait passer Leanna de :

> **« une IA avec des agents autonomes »**

à :

> **« un environnement agentique capable de poursuivre des objectifs, observer son environnement, planifier, agir, vérifier, apprendre et reprendre son travail de manière persistante. »**

Si ton objectif est vraiment d'aller dans cette direction, **je partirais sur une V2 de l'architecture `Autonomous Core`, pas sur l'ajout de nouvelles skills**. C'est le changement architectural qui aura le plus d'impact.
