# Rapport d'Audit Technique & Plan de Refactoring : Système Agentique Leanna (v1.3.0)

**Date d'évaluation :** Septembre 2026  
**Cible :** Architecture globale, runtime agentique, système de mémoire et sécurité  
**Version analysée :** Leanna v1.3.0  

---

## 1. Synthèse Exécutive

Leanna est un environnement d'exécution autonome et IDE augmenté pour l'ingénierie logicielle [12, 76]. Au fil des itérations majeures (notamment l'introduction du runtime agentique `AGENTIC_RUNTIME` et des mécanismes d'autonomie `LEANNA_AUTONOMY_IMPLEMENTATION`), le système a évolué vers une boucle transactionnelle fermée (`plan → act → verify → recover`) [12, 20].

Cependant, l'examen croisé du code exécuté (`server/`), de la configuration (`package.json`, `metadata.json`) et de la documentation interne (`AUTONOMOUS_AGENT_AUDIT.md`, `LEANNA_EXECUTION_REALITY_AUDIT.md`, `attributionAudit.ts`) révèle plusieurs **incohérences structurelles**, des **redondances architecturales** et des **ruptures d'isolation**.

Ce rapport détaille ces incohérences et propose un plan de refactoring opérationnel par phases.

---

## 2. Diagnostic Détaillé des Incohérences

### 2.1. Dualité du Registre d'Agents et de l'Exécution Runtime
* **Constat :** Les 15 rôles d'agents statiques (`coder`, `refactor`, `debugger`, `reviewer`, `tester`, `security`, `architect`, `vision`, `writer`, `formatter`, `researcher`, `proofreader`, `translator`, `summarizer`, `planner`) sont définis dans `server/agents/roles.ts` [7, 93]. Historiquement, seuls les 7 rôles d'édition documentaire possédaient un plugin `AgentPlugin` au niveau de l' `AgentRuntime` [128, 129].
* **Incohérence :** Les 8 rôles d'ingénierie ont dû être raccordés via un pont intermédiaire (`engineering.agents.ts` / `agenticBridge.ts` / `runViaAgentic`) pour pouvoir être invoqués via `AgentRuntime.submit()` sans dupliquer la logique d'exécution [127, 128]. Il existe ainsi deux voies parallèles d'instanciation et de déclenchement d'un agent : via l' `AgentOrchestrator` / `AgentTaskRunner` d'un côté, et via `AgentRuntime.submit()` de l'autre [83, 86, 126, 128].
* **Impact :** Complexité de maintenance et risque d'écarts de comportement si les métadonnées de `roles.ts` et les plugins d' `AgentRuntime` divergent.

### 2.2. Fragmentation de la Chaîne d'Attribution d'Outils et "Outils Fantômes" (*Ghost Tools*)
* **Constat :** Sur plus de 200 outils exécutables enregistrés dans le `ToolRegistry`, seule une fraction dispose d'une attribution directe et explicite à un agent [88]. Le reste retombe sur des règles heuristiques par catégorie ou sur le rôle neutre `system` (`UNATTRIBUTED_ROLE`) [88, 94].
* **Outils Fantômes :** Un test de cohérence dédié (`roleCapabilities.test.ts`) met en évidence les décalages entre les `capabilities` déclarées dans la définition d'un rôle (`roles.ts`) et la liste `EXECUTABLE_AGENT_TOOLS` de l' `AgentExecutor` [92]. Si une capacité est déclarée dans le rôle mais absente de l'allowlist d'exécution, l'outil est immédiatement rejeté lors de l'appel [92].
* **Impact :** Faux positifs dans les profils d'agents et échecs d'exécution silencieux ou brutaux lorsqu'un agent sollicite un outil déclaré mais bloqué à l'exécution.

### 2.3. Cloisonnement des Couches de Mémoire et Feedback Réintroduit
* **Constat :** Leanna accumule au moins 5 abstractions ou sous-systèmes de mémoire :
  1. `Memory` (working / session) [126, 137]
  2. `HierarchicalMemoryService` (3 tiers : session, project, longterm) [135]
  3. `ProjectMemory` (`.project-memory.json`) [105]
  4. `StrategyMemory` (fiabilité chiffrée des outils/skills sur disque) [20, 109]
  5. `SupabaseMemories` (mémoire vectorielle distante) [11, 135]
* **Incohérence :** Comme documenté dans `LEANNA_AUTONOMY_MASTER_AUDIT.md`, les leçons extraites par le `ReflectionEngine` et le `LearningEngine` étaient enregistrées dans la mémoire projet sous forme de prose, mais n'étaient jamais relues par le planificateur (`Planner`) ni par le `SkillScorer` lors des missions suivantes [20, 21]. La création de `StrategyMemory` a comblé ce trou pour les métriques d'outils, mais la coexistence de multiples magasins crée une redondance conceptuelle [20, 109].
* **Impact :** Dispersion des états contextuels et risques de désynchronisation entre les connaissances textuelles et les scores de fiabilité des compétences.

### 2.4. Multiplication des Couches Decisionnelles et d'Autonomie
* **Constat :** La chaîne décisionnelle comporte une superposition importante de composants :
  - `PerceptionEngine` (classification déterministe des événements) [100]
  - `AutonomousExecutive` (arbitrage par `PriorityEngine` : IGNORE, STORE, MONITOR, INVESTIGATE, ACT, ESCALATE) [96]
  - `LeannaCore` & `TaskManager` (queue, déduplication, circuit breaker) [99, 101]
  - `AgentBrain` / `BrainScheduler` (planification DAG et vérification par `BrainVerifier`) [14, 72, 73]
  - `AgentOrchestrator` / `Supervisor` / `Mission.Executor` [14, 83, 97]
* **Incohérence :** Chaque couche possède ses propres compteurs d'essais, ses timeouts et ses règles de déduplication ou d'escalade. 
* **Impact :** Difficulté d'audit des décisions en direct, risques de boucles de rétractation secondaires et surcoût cognitif lors du débogage des pannes d'autonomie.

### 2.5. Fausses Promesses d'Isolation du Bac à Sable (`.Leanna/sandbox`)
* **Constat :** Leanna fait la promotion de son bac à sable `.Leanna/sandbox` pour isoler toutes les modifications de fichiers avant synchronisation vers le dépôt principal [76, 139].
* **Incohérence :** Si les outils d'écriture directe de fichiers (`write_project_file`, `modify_project_file`, `patch_project_file`) écrivent effectivement dans la sandbox [139, 151], plusieurs outils majeurs échappent à cette isolation :
  - `system_execute_command` exécute des commandes shell directement avec `SELF_ROOT` ou le répertoire hôte [151].
  - Les scripts d'automatisation de navigateur (`automationBrowser` via Puppeteer) et les appels réseau externes frappent le réseau hôte [143, 144].
  - L' `AuthorizationGate` et la `PermissionPolicy` régulent l'accès, mais n'offrent pas de véritable conteneurisation au niveau OS [132, 133].
* **Impact :** Risque de sécurité si l'utilisateur pense que l'agent est totalement confiné alors que les commandes shell et le réseau s'exécutent en direct sur la machine hôte.

### 2.6. Incohérences de Nommage et Dette de Métadonnées
* **Nom de produit dans `package.json` :** La clé `build.productName` est configurée à `"Leanna "` avec un espace blanc superflu à la fin [75].
* **Nom de produit dans `metadata.json` :** La clé `name` contient également un espace superflu (`"Leanna "`) [74].
* **Traces résiduelles de nommage :** Plusieurs scripts de configuration et en-têtes font encore référence à l'ancien nom de code `Jarvis-OS` (notamment dans `OPENROUTER_REFERER="https://jarvis-os.local"` et le nom du dépôt GitHub) [6, 178].

---

## 3. Tableau Récapitulatif des Incohérences

| Domaine | composant / Fichier | Incohérence constatée | Priorité |
| :--- | :--- | :--- | :--- |
| **Agents** | `roles.ts` vs `engineering.agents.ts` | Décalage entre rôles de délégation et plugins `AgentRuntime` [128] | **P1** |
| **Outils** | `roles.ts` vs `AgentExecutor.ts` | "Outils fantômes" déclarés dans l'agent mais absents de `EXECUTABLE_AGENT_TOOLS` [92] | **P0** |
| **Mémoire** | `ProjectMemory` vs `StrategyMemory` | Multiplication des magasins de mémoire et fragmentation de la boucle de feedback [20, 21] | **P1** |
| **Orchestration** | `LeannaCore` / `AutonomousExecutive` / `AgentBrain` | Multiplication des niveaux de décision et des files d'attente d'autonomie [13, 14] | **P2** |
| **Sandbox** | `.Leanna/sandbox` vs `system.ts` | `system_execute_command` et Puppeteer s'exécutent hors sandbox sur l'hôte [144, 151] | **P1** |
| **Métadonnées** | `package.json`, `metadata.json` | Espace superflu dans `productName` (`"Leanna "`) et références `Jarvis-OS` [6, 74, 75] | **P3** |

---

## 4. Plan de Refactoring & Recommandations Architecturales

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      PLAN DE REFACTORING LEANNA                         │
├─────────────────────────┬───────────────────────────────────────────────┤
│ Phase 1 : Alignement    │ • Corriger l'espace blanc dans package.json   │
│           & Métadonnées │ • Supprimer les "outils fantômes" (roles.ts)  │
├─────────────────────────┼───────────────────────────────────────────────┤
│ Phase 2 : Registre      │ • Unifier la source de vérité des agents      │
│           d'Agents      │ • Harmoniser AgentTaskRunner et AgentRuntime  │
├─────────────────────────┼───────────────────────────────────────────────┤
│ Phase 3 : Consolidation │ • Fusionner la mémoire sous HierarchicalMemory│
│           Mémoire       │ • Raccorder la réflexion à StrategyMemory     │
├─────────────────────────┼───────────────────────────────────────────────┤
│ Phase 4 : Sécurité      │ • Clarifier le périmètre du sandbox (.Leanna) │
│           & Isolation   │ • Restreindre system_execute_command          │
└─────────────────────────┴───────────────────────────────────────────────┘
```

### Phase 1 : Corrections Immédiates & Métadonnées (P0 / P3)
1. **Nettoyage des Métadonnées :** Corriger la chaîne `"Leanna "` dans `package.json` et `metadata.json` pour supprimer l'espace final [74, 75].
2. **Élimination des Outils Fantômes :** Exécuter `roleCapabilities.test.ts` et synchroniser strictement la liste des `capabilities` dans `roles.ts` avec les définitions réelles dans `EXECUTABLE_AGENT_TOOLS` et `ToolRegistry` [88, 92].

### Phase 2 : Unification du Registre d'Agents (P1)
1. **Source de Vérité Unique :** Faire de `roles.ts` (ou un registre unifié) l'unique déclrateur de métadonnées pour les agents de rédaction ET d'ingénierie [93, 128].
2. **Passerelle d'Exécution Unique :** Harmoniser le passage de tâches à travers le contrat unique `AgentTaskRunner`, garantissant que `AgentRuntime.submit()` et `AgentOrchestrator` empruntent les mêmes garde-fous transactionnels [86, 128].

### Phase 3 : Rationalisation de la Mémoire et du Feedback (P1)
1. **Unification des Faits et des Métriques :** Intégrer formellement `StrategyMemory` comme le module de métriques de `HierarchicalMemoryService` [109, 135].
2. **Boucle de Rétroaction Automatique :** Veiller à ce que l'extraction de leçons post-mission par le `LearningEngine` mette systématiquement à jour le `SkillScorer` et influence le `Planner` lors de la décomposition des objectifs futurs [20, 22].

### Phase 4 : Transparence et Renforcement du Sandbox (P1 / P2)
1. **Clarification dans l'UI/Doc :** Indiquer explicitement dans l'interface que l'isolation du sandbox `.Leanna/sandbox` concerne les fichiers du workspace, mais que le terminal et la navigation réseau s'exécutent sur l'hôte sous le contrôle de l' `AuthorizationGate` et de la `PermissionPolicy` [132, 133, 151].
2. **Garde-Fous Terminal :** Restreindre le répertoire de travail par défaut de `system_execute_command` au dossier sandbox lorsque la sandbox est active (`getProjectRoot()`) [151].
