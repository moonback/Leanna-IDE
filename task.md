# MISSION — TRANSFORMER LEANNA EN AGENT AUTONOME RÉEL DE NIVEAU PRODUCTION

Tu travailles directement dans le dépôt du projet Leanna.

## OBJECTIF PRINCIPAL

Leanna doit devenir un véritable agent autonome de niveau production.

Ne considère jamais qu'une fonctionnalité est réellement autonome simplement parce que :

* elle porte le mot `autonomous`,
* elle possède une classe `AutonomousAgent`,
* un log affiche `plan → act → verify`,
* un workflow est déclaré autonome,
* un outil est enregistré,
* une permission est déclarée,
* ou qu'un composant existe dans l'architecture.

L'autonomie doit être démontrée par le comportement réel du système.

L'objectif de cette mission est donc de :

1. auditer l'architecture actuelle ;
2. identifier les fausses autonomies et les chemins legacy ;
3. corriger les problèmes structurels ;
4. renforcer l'orchestration réelle ;
5. rendre le routage outil/agent déterministe et explicite ;
6. réduire les coûts de contexte ;
7. instrumenter entièrement les missions ;
8. tester une mission réelle de bout en bout ;
9. démontrer qu'un agent peut planifier, agir, observer, vérifier, échouer, récupérer et terminer une mission sans intervention humaine inutile.

---

# CONTEXTE OBSERVÉ DANS LEANNA 1.4.0

Le dernier démarrage montre notamment :

* 15 agents autonomes ;
* 206 outils dans SkillManagerV2 ;
* 210 outils/skills dans Mission System ;
* permissions runtime en mode `enforce` ;
* permissions `[read, write, network, exec]` ;
* Idempotence P0 activée ;
* Safety Gate activé ;
* AgentRuntime avec `plan → act → verify` ;
* sandbox READY après sélection du workspace ;
* 792 fichiers dans le KnowledgeGraph ;
* 16 286 entités ;
* 6 561 relations ;
* 91/210 outils chargés par TokenOptimizer ;
* économie estimée de 9 547 tokens ;
* 33 outils explicitement associés à des capacités/agents ;
* 172 outils affectés par heuristiques sémantiques ;
* 5 outils non assignés et envoyés au système ;
* 0 serveur MCP actif ;
* mode autonomie `auto`.

Le log montre également un cycle :

AgentRegistry initialisé
→ 15 agents online
→ changement de moteur d'exécution
→ 15 agents offline
→ 15 agents online

Ce comportement doit être analysé et supprimé si le runner peut être finalisé avant le démarrage de la flotte.

Le log montre également plusieurs initialisations de `agentActivityStore`.

Enfin, le système annonce `plan → act → verify`, mais le log ne constitue pas une preuve qu'une mission complexe est effectivement exécutée jusqu'à son succès.

---

# RÈGLE ABSOLUE

NE PAS FAIRE UN SIMPLE REFACTOR COSMÉTIQUE.

Avant chaque modification importante :

1. rechercher les implémentations existantes ;
2. identifier le chemin d'exécution réellement utilisé ;
3. déterminer les dépendances ;
4. déterminer les chemins legacy ;
5. modifier le minimum nécessaire ;
6. lancer les tests/typecheck ;
7. vérifier que le nouveau chemin est réellement utilisé.

NE PAS :

* supprimer du code simplement parce qu'il semble ancien ;
* remplacer une architecture fonctionnelle par une abstraction inutile ;
* créer un deuxième système d'orchestration ;
* créer un deuxième système de permissions ;
* créer un deuxième système de mémoire ;
* contourner les Safety Gates ;
* utiliser `any` pour masquer un problème architectural ;
* considérer un log comme une preuve de comportement ;
* déclarer une mission réussie si la vérification finale n'a pas réellement validé le résultat.

---

# PHASE 0 — CARTOGRAPHIE COMPLÈTE

Avant de modifier le code, construis une cartographie du runtime.

Recherche notamment :

* `AgentRuntime`
* `AgentRegistry`
* `AutonomousAgent`
* `AutonomousLoop`
* `AgentExecutor`
* `AgentTaskRunner`
* `AgentOrchestrator`
* `WorkflowEngine`
* `Mission System`
* `SkillManagerV2`
* `ToolRegistry`
* `ToolAgentMapper`
* `AutonomyPolicy`
* `PermissionPolicy`
* `Safety Gate`
* `Idempotence`
* `DryRun`
* `Sandbox`
* `KnowledgeGraph`
* `ProjectMemory`
* `AgentPersistence`
* `AutonomyPersistence`
* `TokenOptimizer`
* `promptInjectionGuard`

Identifie :

### A. Point d'entrée d'une mission

```text
User/Mission
    ↓
?
    ↓
Mission
    ↓
?
```

### B. Création du plan

```text
Goal
 ↓
Planner
 ↓
Plan
```

### C. Sélection de l'agent

```text
Plan step
 ↓
Agent selection
 ↓
AgentRuntime
```

### D. Sélection de l'outil

```text
Agent
 ↓
Tool selection
 ↓
ToolRegistry / SkillManager
```

### E. Exécution

```text
Tool
 ↓
Permission
 ↓
Safety Gate
 ↓
Sandbox
 ↓
Execution
```

### F. Observation

```text
Execution result
 ↓
Observation
 ↓
State update
```

### G. Vérification

```text
Observation
 ↓
Verification
 ↓
Success / Failure
```

### H. Récupération

```text
Failure
 ↓
Diagnosis
 ↓
Recovery
 ↓
Re-plan
 ↓
Retry
```

### I. Finalisation

```text
Final verification
 ↓
Mission completion
 ↓
Persistence
```

Documente ce chemin dans un fichier :

```text
docs/AUTONOMY_RUNTIME_MAP.md
```

---

# PHASE 1 — ÉLIMINER LE DOUBLE DÉMARRAGE DES AGENTS

Le log montre :

```text
AgentRegistry initialized
15 agents online

switch execution engine

15 agents offline

15 agents online
```

Détermine pourquoi cela arrive.

Objectif architectural :

```text
configure dependencies
        ↓
configure runner
        ↓
configure policies
        ↓
create AgentRegistry
        ↓
create agents
        ↓
start agents
```

et non :

```text
create agents
↓
start agents
↓
replace runner
↓
stop agents
↓
restart agents
```

Si le runner peut être injecté avant la création de la flotte :

* faire cette correction ;
* supprimer le cycle offline/online inutile ;
* ajouter un test de non-régression.

Le démarrage doit être idempotent.

---

# PHASE 2 — UNIFIER LE CHEMIN D'EXÉCUTION

Vérifie que tous les chemins suivants utilisent réellement le même contrat :

```text
Mission
Workflow
Orchestration
Delegation
AutonomousLoop
AutonomousAgent
AgentRegistry
AgentRuntime
```

Il ne doit pas exister :

```text
chemin moderne → AgentTaskRunner
chemin legacy → AgentExecutor
```

pour une même classe de mission.

Si `AgentExecutor` reste nécessaire pour compatibilité, il doit être explicitement encapsulé derrière le contrat commun.

Architecture cible :

```text
                 ┌─────────────────────┐
                 │      Mission        │
                 └──────────┬──────────┘
                            ↓
                 ┌─────────────────────┐
                 │    Orchestrator     │
                 └──────────┬──────────┘
                            ↓
                 ┌─────────────────────┐
                 │    AgentRuntime     │
                 └──────────┬──────────┘
                            ↓
                 ┌─────────────────────┐
                 │  AgentTaskRunner    │
                 └──────────┬──────────┘
                            ↓
                 ┌─────────────────────┐
                 │ Tool execution      │
                 └─────────────────────┘
```

Aucun chemin critique ne doit contourner `AgentRuntime` ou `AgentTaskRunner` sans justification documentée.

---

# PHASE 3 — ROUTAGE DES 210 OUTILS

Le log indique :

```text
0 explicit
33 role capabilities
172 semantic heuristics
5 unassigned → system
```

C'est insuffisant pour un agent de production.

Les heuristiques sémantiques peuvent aider à découvrir ou suggérer un outil, mais elles ne doivent pas être la seule source de vérité pour les outils sensibles.

Créer ou renforcer un manifeste explicite des outils.

Chaque outil doit avoir au minimum :

```ts
interface ToolMetadata {
  name: string;
  description: string;

  category: string;

  allowedAgents: string[];

  requiredPermissions: string[];

  riskLevel: "low" | "medium" | "high" | "critical";

  sideEffects: boolean;

  requiresConfirmation: boolean;

  idempotent: boolean;

  sandboxCompatible: boolean;

  networkRequired: boolean;

  executable: boolean;
}
```

Adapter les types au code existant si une structure équivalente existe déjà.

Classer les 210 outils.

Aucun outil critique ne doit dépendre uniquement d'une heuristique sémantique.

Les outils suivants doivent notamment être explicitement analysés :

```text
assistant_logs
generate_codebase_markdown
project_scaffold
quality_loop
update_custom_skill
```

Mais ne pas se limiter à eux.

Créer un rapport :

```text
docs/TOOL_OWNERSHIP_MATRIX.md
```

---

# PHASE 4 — ROUTAGE AGENTIQUE DÉTERMINISTE

Le système possède 15 rôles :

```text
coder
refactor
debugger
reviewer
tester
security
architect
vision
writer
formatter
researcher
proofreader
translator
summarizer
planner
```

Vérifie que chaque agent possède :

1. capacités explicites ;
2. outils autorisés ;
3. permissions ;
4. limites d'exécution ;
5. critères de succès ;
6. stratégie de vérification.

Évite :

```text
tool → semantic similarity → random agent
```

Préférer :

```text
mission step
 ↓
required capability
 ↓
eligible agents
 ↓
policy filtering
 ↓
agent selection
 ↓
tool selection
```

La sélection doit être observable dans les logs.

---

# PHASE 5 — VRAI PLAN → ACT → OBSERVE → VERIFY

Le système ne doit pas simplement afficher :

```text
plan → act → verify
```

Il doit réellement produire un état machine vérifiable.

Créer un modèle d'exécution similaire à :

```ts
type MissionStepState =
  | "pending"
  | "planned"
  | "executing"
  | "observing"
  | "verifying"
  | "succeeded"
  | "failed"
  | "recovering"
  | "replanned"
  | "blocked";
```

Chaque étape doit avoir :

```text
goal
input
plan
selectedAgent
selectedTool
arguments
permissionDecision
safetyDecision
execution
observation
verification
failure
recovery
retryCount
finalState
```

Les noms doivent être adaptés aux conventions existantes.

---

# PHASE 6 — RECOVERY AUTONOME

Une autonomie réelle doit survivre aux erreurs.

Implémenter ou vérifier :

```text
Tool failure
 ↓
classify failure
 ↓
determine recoverability
 ↓
attempt recovery
 ↓
retry if allowed
 ↓
re-plan if necessary
 ↓
verify
```

Exemples :

### Erreur de fichier

```text
read failure
→ inspect workspace
→ correct path
→ retry
```

### Erreur TypeScript

```text
typecheck failure
→ inspect diagnostic
→ locate source
→ modify
→ typecheck
→ verify
```

### Outil indisponible

```text
tool unavailable
→ find compatible tool
→ update plan
→ continue
```

### Permission refusée

```text
permission denied
→ STOP
→ no bypass
→ report blocked state
```

Une permission refusée ne doit jamais être transformée automatiquement en permission accordée.

---

# PHASE 7 — VÉRIFICATION INDÉPENDANTE

Une action ne doit jamais être considérée comme réussie simplement parce que l'outil a retourné :

```text
success: true
```

Exemple :

```text
write_file
→ success
```

ne signifie pas :

```text
mission step successful
```

La vérification doit contrôler l'état réel.

Pour une modification de code :

```text
write
↓
file exists
↓
content correct
↓
typecheck
↓
tests
↓
final verification
```

Pour une mission générique :

```text
action result
↓
postcondition
↓
verification tool
↓
state transition
```

Ajouter des postconditions explicites aux étapes importantes.

---

# PHASE 8 — OBSERVABILITÉ COMPLÈTE DES MISSIONS

Ajouter une télémétrie structurée.

Chaque mission doit avoir :

```text
missionId
parentMissionId
goal
createdAt
startedAt
completedAt
status
currentStep
totalSteps
agent
tool
retryCount
tokenUsage
duration
permissionDecision
safetyDecision
verificationResult
failureReason
recoveryAction
```

Événements recommandés :

```text
mission.created
mission.planned
step.started
agent.selected
tool.selected
permission.checked
safety.checked
tool.started
tool.completed
observation.created
verification.started
verification.completed
step.failed
recovery.started
recovery.completed
replan.created
mission.completed
mission.failed
mission.blocked
```

Ne pas seulement logger du texte libre.

Créer des événements structurés exploitables par l'UI et les tests.

---

# PHASE 9 — CONTEXTE ET TOKENS

Le log montre :

```text
prompt ≈ 26 240 tokens
```

par tour.

Le TokenOptimizer réduit le contexte outil, mais le contexte global reste élevé.

Objectif : ne pas envoyer systématiquement tout l'état au modèle.

Implémenter ou renforcer une stratégie :

```text
L0 — instruction système
L1 — objectif courant
L2 — état de mission
L3 — étape courante
L4 — contexte pertinent
L5 — résultats récents
L6 — mémoire récupérée
L7 — historique compressé
```

Ne charger que ce qui est nécessaire.

Utiliser :

```text
delta state
summaries
relevant memory
tool schema filtering
step-local context
```

Conserver l'information importante sans conserver inutilement tout l'historique brut.

Ajouter des métriques :

```text
contextTokens
toolSchemaTokens
memoryTokens
historyTokens
systemTokens
totalTokens
```

Objectif : réduire significativement les ~26k tokens par tour sans perdre les informations nécessaires à la mission.

Ne pas casser la qualité du raisonnement uniquement pour réduire le nombre de tokens.

---

# PHASE 10 — AGENT ACTIVITY STORE

Le log montre plusieurs initialisations :

```text
agentActivityStore initialized
...
agentActivityStore initialized
```

Identifier la cause exacte.

Objectif :

```text
single lifecycle
single source of truth
```

Si plusieurs instances sont intentionnelles, documenter pourquoi.

Sinon :

* rendre l'initialisation idempotente ;
* utiliser un singleton ou un provider contrôlé ;
* empêcher les doublons côté renderer/backend.

Ajouter un test.

---

# PHASE 11 — PERMISSIONS ET SAFETY

Conserver le modèle :

```text
permissions = enforce
Safety Gate = active
Idempotence = active
Sandbox = active
```

Mais vérifier leur enforcement réel.

Créer des tests qui prouvent :

### Lecture

```text
read allowed → execute
```

### Écriture

```text
write allowed → sandbox only
```

### Network

```text
network denied → request blocked
```

### Exec

```text
exec denied → process blocked
```

### Dangerous action

```text
dangerous denied → action blocked
```

### Prompt injection

```text
malicious instruction
→ guard
→ policy
→ block/escalate
```

Aucun agent ne doit pouvoir contourner directement :

```text
PermissionPolicy
AutonomyPolicy
SafetyGate
Sandbox
```

---

# PHASE 12 — SANDBOX

Le log montre :

```text
878 files copied
sandbox READY
agent writes isolated in sandbox
```

Vérifier que cette isolation est réellement appliquée au niveau des outils.

Tester :

```text
agent write
→ sandbox path
→ original workspace unchanged
```

Puis :

```text
verification
→ tests
→ promotion/commit uniquement si autorisé
```

Le sandbox ne doit pas être seulement un état affiché dans l'UI.

---

# PHASE 13 — MISSION DE TEST RÉELLE

Créer un test d'intégration autonome contrôlé.

La mission doit être suffisamment complexe pour démontrer l'autonomie.

Exemple :

```text
MISSION :

Dans un projet de test sandboxé :

1. détecte volontairement une erreur TypeScript ;
2. analyse le diagnostic ;
3. localise le fichier concerné ;
4. formule un plan ;
5. sélectionne le debugger/coder ;
6. modifie le fichier ;
7. exécute le typecheck ;
8. observe le résultat ;
9. si échec, diagnostique ;
10. corrige ;
11. relance le typecheck ;
12. exécute les tests ;
13. vérifie le résultat final ;
14. termine la mission.
```

La mission doit pouvoir nécessiter plusieurs boucles :

```text
PLAN
 ↓
ACT
 ↓
OBSERVE
 ↓
VERIFY
 ↓
FAIL
 ↓
RECOVER
 ↓
REPLAN
 ↓
ACT
 ↓
VERIFY
 ↓
SUCCESS
```

Le test doit échouer si une intervention humaine est nécessaire alors qu'elle n'est pas explicitement requise par la policy.

---

# PHASE 14 — CRITÈRES DE SUCCÈS D'UNE MISSION

Une mission ne peut être marquée `completed` que si :

```text
goal satisfied
AND
all mandatory steps verified
AND
no unresolved failure
AND
final verification passed
```

Pas simplement :

```text
last tool returned success
```

Créer une fonction centrale de décision si elle n'existe pas déjà.

---

# PHASE 15 — GESTION DES BUDGETS

Les anciens logs ont montré un cas :

```text
41 tool calls
max 30
22 files read
max 20
```

Le système doit gérer proprement :

```text
max tool calls
max tokens
max files
max execution time
max retries
max recursion depth
```

Quand une limite est atteinte :

```text
stop
→ diagnose
→ checkpoint
→ recover/replan
```

Ne jamais continuer silencieusement au-delà d'un budget.

---

# PHASE 16 — ÉVITER LES BOUCLES D'AUTONOMIE

Détecter :

```text
agent → tool → agent → tool → ...
```

sans progrès.

Ajouter si nécessaire :

```text
progress detector
state fingerprint
repeated action detector
repeated tool detector
repeated failure detector
```

Si le système répète la même action sans changement d'état :

```text
STOP / REPLAN
```

---

# PHASE 17 — MCP

Le log indique :

```text
0 MCP servers
0 MCP tools
```

Ne pas activer artificiellement MCP.

Vérifier simplement que l'architecture permet :

```text
MCP tool
→ ToolRegistry
→ Permission
→ Safety
→ Agent
```

sans créer un chemin d'exécution parallèle non contrôlé.

Ajouter un test d'intégration simulé si l'architecture le permet.

---

# PHASE 18 — ELECTRON CSP

Le log contient :

```text
Electron Security Warning
No Content Security Policy
unsafe-eval
```

Analyser la configuration Electron.

En développement, conserver uniquement les exceptions nécessaires.

En production, appliquer une CSP stricte.

Identifier précisément :

```text
unsafe-eval
unsafe-inline
connect-src
script-src
style-src
```

Ne pas supprimer une restriction uniquement pour faire disparaître le warning.

Créer une configuration cohérente :

```text
development CSP
production CSP
```

---

# PHASE 19 — TESTS

Après modifications :

```bash
npm run typecheck
npm test
```

Puis découvrir les scripts réellement disponibles dans `package.json`.

Exécuter également les tests pertinents existants.

Ajouter :

```text
unit tests
integration tests
autonomy tests
permission tests
sandbox tests
routing tests
recovery tests
```

Ne pas créer des tests qui vérifient uniquement les logs.

Les tests doivent vérifier les comportements et les états.

---

# PHASE 20 — TEST FINAL END-TO-END

Créer un scénario automatisé :

```text
Mission
 ↓
Planner
 ↓
Agent selection
 ↓
Tool selection
 ↓
Permission
 ↓
Safety
 ↓
Sandbox
 ↓
Action
 ↓
Observation
 ↓
Verification
 ↓
Failure
 ↓
Recovery
 ↓
Replan
 ↓
Action
 ↓
Verification
 ↓
Mission completion
```

Le test doit produire un rapport structuré.

Exemple :

```json
{
  "mission": "...",
  "status": "completed",
  "steps": 8,
  "agentsUsed": ["planner", "debugger", "tester"],
  "toolsUsed": ["...", "..."],
  "retries": 1,
  "recoveries": 1,
  "verificationPassed": true,
  "humanInterventionRequired": false
}
```

Adapter le format au projet existant.

---

# DOCUMENTATION À PRODUIRE

Créer ou mettre à jour :

```text
docs/AUTONOMY_RUNTIME_MAP.md
docs/AUTONOMY_CONTRACT.md
docs/TOOL_OWNERSHIP_MATRIX.md
docs/AUTONOMY_TEST_PLAN.md
docs/AUTONOMY_AUDIT.md
```

`AUTONOMY_AUDIT.md` doit distinguer explicitement :

## VERIFIED

Ce qui est démontré par :

* tests ;
* exécution réelle ;
* invariants ;
* telemetry.

## IMPLEMENTED

Ce qui existe dans le code mais n'est pas encore démontré end-to-end.

## PARTIAL

Ce qui fonctionne mais dépend encore :

* heuristiques ;
* fallback legacy ;
* intervention humaine ;
* contexte excessif ;
* chemins non vérifiés.

## MISSING

Ce qui n'existe pas.

## RISK

Ce qui pourrait empêcher Leanna d'être réellement autonome.

Ne jamais écrire :

```text
production ready
```

simplement parce que les tests passent.

---

# RÈGLE IMPORTANTE SUR LES MODIFICATIONS

Avant de modifier un fichier :

1. lire le fichier ;
2. comprendre son rôle ;
3. rechercher ses usages ;
4. rechercher les interfaces associées ;
5. vérifier les tests existants ;
6. modifier ;
7. typecheck ;
8. tests ;
9. vérifier le comportement.

Éviter les modifications massives non justifiées.

---

# PRIORITÉS

## P0 — CRITIQUE

Corriger en premier :

1. chemins d'exécution divergents ;
2. bypass des permissions ;
3. bypass du Safety Gate ;
4. fausse vérification de succès ;
5. absence de recovery/replan ;
6. absence de preuve end-to-end ;
7. outils sensibles uniquement routés par heuristique ;
8. boucles autonomes non bornées.

## P1 — IMPORTANT

Puis :

1. double démarrage AgentRegistry ;
2. double initialization agentActivityStore ;
3. budgets ;
4. observabilité structurée ;
5. sandbox enforcement ;
6. réduction du contexte ;
7. tests d'intégration.

## P2 — OPTIMISATION

Enfin :

1. optimisation tokens ;
2. optimisation startup ;
3. MCP ;
4. CSP fine tuning ;
5. ergonomie des logs.

---

# CONTRAINTE MAJEURE

NE PAS SE CONTENTER D'ANALYSER.

Tu dois :

```text
AUDIT
→ IMPLEMENT
→ TEST
→ VERIFY
→ DOCUMENT
```

Pour chaque problème identifié :

```text
Problem
↓
Evidence
↓
Root cause
↓
Fix
↓
Test
↓
Result
```

---

# RAPPORT FINAL OBLIGATOIRE

À la fin, retourne un rapport précis :

## 1. Architecture actuelle

Décrire le véritable chemin runtime.

## 2. Corrections effectuées

Fichier par fichier.

## 3. Tests exécutés

Commande + résultat.

## 4. Mission end-to-end

Décrire exactement la mission exécutée.

## 5. Preuve d'autonomie

Présenter :

```text
plan
agent selection
tool selection
permission
action
observation
verification
failure
recovery
replan
final verification
completion
```

## 6. Points encore non prouvés

Être honnête.

## 7. Dette technique restante

Classée P0/P1/P2.

## 8. Métriques

Inclure si disponibles :

```text
mission duration
tool calls
agent switches
retries
recoveries
tokens
context size
verification count
failures
human interventions
```

## 9. Verdict technique

Ne donne pas un simple "autonome : oui".

Utilise plutôt :

```text
AUTONOMY VERIFIED:
- ...
AUTONOMY PARTIAL:
- ...
AUTONOMY NOT VERIFIED:
- ...
```

---

# OBJECTIF FINAL

À la fin de cette mission, Leanna doit pouvoir démontrer :

```text
                 USER GOAL
                     │
                     ▼
                  MISSION
                     │
                     ▼
                   PLAN
                     │
                     ▼
              AGENT SELECTION
                     │
                     ▼
               TOOL SELECTION
                     │
                     ▼
          PERMISSION + SAFETY
                     │
                     ▼
                  ACTION
                     │
                     ▼
                OBSERVATION
                     │
                     ▼
               VERIFICATION
                  │       │
               PASS       FAIL
                │           │
                ▼           ▼
             NEXT       DIAGNOSE
                            │
                            ▼
                         RECOVER
                            │
                            ▼
                         REPLAN
                            │
                            ▼
                          ACTION
                            │
                            ▼
                       VERIFICATION
                            │
                            ▼
                     FINAL VERIFICATION
                            │
                            ▼
                    MISSION COMPLETED
```

Leanna ne doit pas seulement avoir cette architecture sur le papier.

**Elle doit l'exécuter réellement, de manière observable, contrôlée, récupérable et testée.**

Commence maintenant par la cartographie du runtime et l'audit du chemin d'exécution réel avant toute modification.
