# 📊 État d'implémentation

> Mis à jour automatiquement par l'agent. Chaque fonctionnalité est déterministe,
> réutilise le runtime existant, et livrée avec tests + typecheck au vert.

### ✅ P0 — Terminé (5/5)

| Fonctionnalité | Module(s) | Tests |
| --- | --- | --- |
| 🧠 **Anticipation Engine** | `server/autonomy/AnticipationEngine.ts` (+ wiring `LeannaCore`, event `autonomy:anticipation`) | 9 ✅ |
| 📚 **Playbooks appris** | `server/knowledge/PlaybookStore.ts` (+ hook `Executor.finalizeMission`) | 10 ✅ |
| 👤 **Project Intelligence Profile** | `server/knowledge/ProjectProfile.ts` (+ refresh workspace/mission) | 7 ✅ |
| 🔍 **AI Project Doctor** | `server/knowledge/ProjectDoctor.ts` (+ skill `knowledge_project_doctor`) | 9 ✅ |
| 🧪 **Mission Simulator** | `server/mission/MissionSimulator.ts` (+ skill `mission_simulate`) | 9 ✅ |

### ✅ P1 — Terminé (5/5)

| Fonctionnalité | Module(s) | Statut |
| --- | --- | --- |
| 🔮 **Predictive Agent** | `server/knowledge/PredictionEngine.ts` (+ skill `knowledge_predict`) | ✅ 9 tests |
| 🔥 **Opportunity Engine** | `server/knowledge/OpportunityEngine.ts` (+ skill `knowledge_opportunities`) | ✅ 11 tests |
| 🤖 **Dynamic Agent Swarm** | `server/agents/SwarmComposer.ts` (+ skill `agent_compose_swarm`) | ✅ 10 tests |
| 🕰️ **Mission Time Travel** | `server/mission/MissionTimeTravel.ts` (+ skills `mission_timeline`/`mission_rewind`) | ✅ 10 tests |
| 👁️ **Computer Use Agent** | `server/autonomy/ComputerUseAgent.ts` (boucle observe→act→verify, gating par risque) | ✅ 10 tests |

### ✅ Bonus — Autres fonctionnalités du document (toutes implémentées)

| Fonctionnalité | Module(s) | Statut |
| --- | --- | --- |
| 🧬 **Mission Evolution** (#6) | `server/knowledge/MissionEvolution.ts` (+ skill `knowledge_mission_evolution`) | ✅ 7 tests |
| 🧠 **Self-Critique** (#10) | `server/mission/SelfEvaluation.ts` (+ skill `mission_self_critique`) | ✅ 8 tests |
| 🎙️ **Voice Agent** (#12) | `server/knowledge/VoiceCommandInterpreter.ts` (+ skill `knowledge_voice_command`) — cœur déterministe ; reste à brancher sur l'audio Gemini Live | ✅ 14 tests |
| 📡 **Daily AI Briefing** (#13) | `server/knowledge/DailyBriefing.ts` (+ skill `knowledge_daily_briefing`) | ✅ 9 tests |
| 🧩 **NL → Automation** (#15) | `server/knowledge/WorkflowCompiler.ts` (+ skill `knowledge_compile_workflow`) | ✅ 11 tests |

---

Leanna est déjà **très riche en briques IA** : runtime agentique, missions, mémoire, Knowledge Graph, RAG, agents spécialisés, navigateur, vision, voix, workflows, GitHub, apprentissage de fiabilité, sécurité et observabilité. 

Le point important est donc : **ne pas ajouter encore 50 outils**. Il faut ajouter des capacités qui rendent Leanna **plus intelligente, proactive et capable de travailler seule**.

## 🚀 Les fonctionnalités IA que je recommande

### 1. 🧠 Leanna Anticipation Engine — priorité P0

C'est celle que je mettrais en premier.

Aujourd'hui Leanna sait essentiellement :

> « Donne-moi un objectif → je l'exécute. »

Il faut passer à :

> **« J'observe ton environnement → je détecte ce qui mérite ton attention → je propose ou lance une mission. »**

Exemples :

```text
Leanna observe
      ↓
détection d'un événement
      ↓
analyse du contexte
      ↓
évaluation de l'importance
      ↓
détection d'une opportunité/problème
      ↓
proposition d'action
      ↓
mission
```

Exemples concrets :

* « Ton projet contient 17 erreurs TypeScript apparues depuis hier. »
* « Cette PR introduit une régression probable. »
* « Trois tâches récurrentes pourraient être automatisées. »
* « Cette dépendance possède une nouvelle version critique. »
* « Tu as corrigé ce problème 4 fois : je peux automatiser sa prévention. »
* « Cette mission échoue systématiquement avec cet outil ; voici une autre stratégie. »

**Différenciation : très forte.**

Leanna possède déjà `PerceptionEngine`, `HeartbeatService`, `TaskManager` et `AutonomousExecutive`; il faut les transformer en véritable moteur d'anticipation plutôt qu'en simple infrastructure d'exécution. 

---

# 2. 🔮 Predictive Agent — prédire avant d'agir

Je créerais un moteur :

```text
PredictionEngine
```

Avant chaque mission importante :

```text
Objectif
 ↓
Historique
 ↓
Contexte projet
 ↓
Fiabilité outils
 ↓
Risques connus
 ↓
Prédiction
```

Il pourrait produire :

```text
Probabilité de réussite : 87 %

Risques détectés :
🔴 modification de 14 fichiers
🟠 test e2e potentiellement fragile
🟡 dépendance externe

Durée estimée : 4m20
Coût estimé : $0.38

Stratégie recommandée :
1. analyser
2. modifier
3. typecheck
4. tests ciblés
5. tests complets
```

Encore mieux :

### prédiction de l'échec

```text
Étape 4
   ↓
"72 % de risque d'échec"
   ↓
Leanna modifie le plan AVANT l'exécution
```

Ça exploite directement `StrategyMemory`, qui mémorise déjà les performances et échecs des outils. 

---

# 3. 📚 Playbooks appris automatiquement — P0

C'est probablement **la meilleure fonctionnalité d'apprentissage à ajouter**.

Leanna termine une mission :

```text
Mission réussie
     ↓
analyse de la stratégie
     ↓
détection d'un pattern réutilisable
     ↓
création d'un Playbook
```

Exemple :

```text
PLAYBOOK
"Corriger erreur TypeScript"

Étape 1 : analyser compiler
Étape 2 : rechercher symboles
Étape 3 : analyser dépendances
Étape 4 : modifier
Étape 5 : typecheck
Étape 6 : tests
Étape 7 : rollback si échec
```

Puis un mois plus tard :

> « J'ai déjà résolu 6 problèmes similaires. Je vais utiliser le Playbook TS-ERROR-001. »

Ton propre document identifie déjà précisément les **Playbooks appris** comme une fonctionnalité manquante. 

---

# 4. 👤 Project Intelligence Profile

Chaque projet devrait avoir son propre cerveau.

Par exemple :

```text
Leanna
 ├── Projet A
 │    ├── conventions
 │    ├── architecture
 │    ├── préférences
 │    ├── patterns
 │    ├── erreurs connues
 │    └── stratégies efficaces
 │
 ├── Projet B
 │    └── ...
```

Leanna apprend automatiquement :

* conventions de code ;
* architecture ;
* frameworks ;
* style ;
* commandes de build ;
* tests ;
* règles Git ;
* fichiers sensibles ;
* préférences du projet ;
* stratégies qui fonctionnent ;
* stratégies qui échouent.

Ainsi :

> **Leanna ne repart jamais de zéro sur un projet.**

Cette idée apparaît déjà dans la roadmap sous la forme de **profils d'agent par projet**. 

---

# 5. 🔍 AI Project Doctor

Une fonctionnalité extrêmement intéressante pour ton positionnement.

Un bouton :

> **Diagnostiquer mon projet**

Leanna lance automatiquement :

```text
Architecture
      ↓
Code quality
      ↓
Security
      ↓
Dependencies
      ↓
Performance
      ↓
Tests
      ↓
Git
      ↓
Technical debt
      ↓
Autonomy
```

Puis produit :

### PROJECT HEALTH

```text
Architecture       86/100
Sécurité           91/100
Tests              74/100
Performance        81/100
Dette technique    68/100
Maintenabilité     79/100

GLOBAL             80/100
```

Mais surtout :

> **Leanna crée elle-même les missions nécessaires pour améliorer le score.**

```text
Score 80
 ↓
12 problèmes
 ↓
priorisation
 ↓
Plan d'amélioration
 ↓
missions
 ↓
vérification
 ↓
score 87
```

Ça transforme Leanna en **AI Engineering Operating System**.

---

# 6. 🧬 Mission Evolution

Très important pour ton concept d'autonomie.

Une mission ne doit pas seulement apprendre :

> « cette action a échoué ».

Elle doit apprendre :

> **« cette manière de résoudre ce type de problème est mauvaise. »**

Exemple :

```text
Mission 1
approche A → échec

Mission 2
approche A → échec

Mission 3
approche B → succès

Mission 4 similaire
      ↓
Leanna choisit automatiquement B
```

Tu as déjà une base avec `StrategyMemory`, `SkillScorer`, `LearningEngine` et les statistiques de fiabilité. 

Il faut monter d'un niveau :

```text
Tool learning
      ↓
Strategy learning
      ↓
Mission learning
      ↓
Goal learning
```

---

# 7. 🧪 Mission Simulator

Très fort pour Leanna.

Avant de réellement exécuter une mission :

> **SIMULER**

```text
MISSION
   ↓
simulation
   ↓
prévision
```

Leanna affiche :

```text
Simulation

14 fichiers seraient modifiés
3 commandes exécutées
2 agents impliqués
37 tool calls estimés

Temps : 5m12
Coût : $0.42

Risques :
🟠 migration DB
🔴 suppression potentielle
🟢 fichiers de test

[Modifier le plan]
[Exécuter]
[Annuler]
```

La roadmap indique déjà que le `DryRunController` existe mais que la simulation globale bout-en-bout reste à câbler. 

**Je la mettrais très haut.**

---

# 8. 🕰️ Time Travel Mission

Une fonctionnalité vraiment différenciante.

Pouvoir ouvrir une mission :

```text
Mission #1847

10:42 PLAN
10:43 ANALYZE
10:44 MODIFY
10:45 TEST
10:46 FAILURE
10:47 REPLAN
10:49 SUCCESS
```

Et cliquer :

> **Revenir à l'étape 4**

pour voir :

* état du workspace ;
* contexte ;
* prompt ;
* décision ;
* outil ;
* résultat ;
* preuve ;
* raisonnement résumé ;
* coût ;
* état mémoire.

La roadmap identifie déjà le **time-travel debugging** comme une idée R5. 

---

# 9. 🤖 Agent Swarm dynamique

Pas simplement :

```text
Coder
Reviewer
Tester
```

mais :

```text
                  LEANNA
                     │
              Mission Manager
                     │
        ┌────────────┼────────────┐
        ↓            ↓            ↓
    Researcher    Architect     Coder
        │            │            │
        └────────────┼────────────┘
                     ↓
                  Tester
                     ↓
                 Reviewer
                     ↓
                  Security
```

Et surtout :

### Leanna crée dynamiquement l'équipe.

Exemple :

> « Optimise les performances de mon application. »

Leanna décide :

```text
1 Performance Analyst
2 Code Architect
1 Coder
1 Benchmark Agent
1 Reviewer
```

Puis détruit cette équipe après la mission.

Tu possèdes déjà `AgentOrchestrator`, `DelegationManager`, `DynamicAgentRegistry` et les rôles spécialisés. 

Le manque est surtout **l'intelligence de composition dynamique**.

---

# 10. 🧠 Leanna Self-Critique

Après chaque mission :

```text
Mission terminée
       ↓
Reflection
       ↓
"Qu'aurais-je pu mieux faire ?"
       ↓
analyse
       ↓
amélioration
```

Mais attention : pas une simple réponse LLM.

Créer :

```text
SelfEvaluationEngine
```

qui compare :

```text
PLAN INITIAL
      vs
EXÉCUTION RÉELLE
      vs
RÉSULTAT
```

Puis :

```text
Plan accuracy       82 %
Tool efficiency     67 %
Recovery quality    91 %
Verification        88 %
Cost efficiency     71 %
```

Et :

> **« La prochaine mission similaire doit commencer par X. »**

---

# 11. 👁️ Computer Agent

Tu as déjà :

* screen share ;
* vision ;
* browser ;
* automation ;
* capture écran ;
* webcam ;
* Gemini Live. 

Je transformerais ça en véritable :

## Computer Use Agent

Exemple :

> « Regarde mon écran et règle le problème. »

Leanna :

```text
observe écran
 ↓
comprend UI
 ↓
identifie problème
 ↓
planifie
 ↓
clique
 ↓
observe
 ↓
corrige
 ↓
vérifie
```

Et avec confirmation selon le niveau de risque.

C'est beaucoup plus puissant qu'une simple fonction de vision.

---

# 12. 🎙️ Voice Agent permanent

Pas seulement :

> parler avec Leanna.

Mais :

> **piloter Leanna à la voix.**

Exemple :

> « Leanna, regarde mon projet. »

> « Trouve les trois problèmes les plus importants. »

> « Corrige le premier. »

> « Lance les tests. »

> « Si tout est bon, commit. »

La roadmap mentionne déjà le socle Gemini Live + partage d'écran. 

L'étape suivante est de faire de la voix **une interface de commande agentique complète**.

---

# 13. 📡 Daily AI Briefing

Chaque matin :

```text
☀️ Bonjour.

Voici ce que Leanna a détecté :

🔴 2 problèmes critiques
🟠 4 tâches en attente
🟢 3 améliorations possibles

Projet Leanna :
• 7 fichiers modifiés
• 2 erreurs nouvelles
• dépendance X obsolète
• test Y instable

Recommandation :
→ corriger X
→ mettre à jour Y
→ lancer audit sécurité
```

Et surtout :

> **Leanna peut préparer automatiquement les missions.**

Tu as déjà un système de heartbeat, tâches autonomes, observabilité et persistance. 

---

# 14. 🔥 Opportunity Engine

Encore plus intéressant que les notifications.

Leanna cherche activement :

```text
PROBLÈMES
OPPORTUNITÉS
OPTIMISATIONS
AUTOMATISATIONS
RISQUES
```

Exemple :

> « J'ai remarqué que tu fais manuellement cette opération 8 fois par semaine. Je peux créer un workflow. »

C'est une IA qui **cherche du travail utile**.

C'est une vraie différence entre :

### Assistant IA

> attend les demandes.

et

### Agent IA

> **cherche ce qui peut être amélioré.**

---

# 15. 🧩 Natural Language → Automation

Tu dis :

> « Tous les lundi matin, vérifie mes repositories, détecte les issues critiques et prépare-moi un rapport. »

Leanna construit :

```text
TRIGGER
Monday 08:00
   ↓
GitHub scan
   ↓
Issue analysis
   ↓
Priority classification
   ↓
Security check
   ↓
Report generation
   ↓
Notification
```

Et affiche le workflow généré graphiquement.

Ton application possède déjà `WorkflowEngine`, `VisualWorkflowBuilder`, automation et scheduled tasks. 

Il manque surtout le **compilateur langage naturel → workflow agentique robuste**.

---

# 🏆 Mon TOP 10 pour Leanna

Si je devais décider à ta place :

| Priorité | Fonctionnalité                   | Valeur |
| -------- | -------------------------------- | -----: |
| 🔴 P0    | **Anticipation Engine**          |  ⭐⭐⭐⭐⭐ |
| 🔴 P0    | **Playbooks appris**             |  ⭐⭐⭐⭐⭐ |
| 🔴 P0    | **Project Intelligence Profile** |  ⭐⭐⭐⭐⭐ |
| 🔴 P0    | **AI Project Doctor**            |  ⭐⭐⭐⭐⭐ |
| 🔴 P0    | **Mission Simulator**            |  ⭐⭐⭐⭐⭐ |
| 🟠 P1    | **Predictive Agent**             |  ⭐⭐⭐⭐⭐ |
| 🟠 P1    | **Opportunity Engine**           |  ⭐⭐⭐⭐⭐ |
| 🟠 P1    | **Dynamic Agent Swarm**          |   ⭐⭐⭐⭐ |
| 🟠 P1    | **Mission Time Travel**          |   ⭐⭐⭐⭐ |
| 🟠 P1    | **Computer Use Agent**           |  ⭐⭐⭐⭐⭐ |

---

# 🧠 Et surtout : je changerais le positionnement

Actuellement, Leanna ressemble conceptuellement à :

```text
AI IDE
+
Agent runtime
+
Notebook
+
Automation
+
Memory
+
Browser
+
Agents
```

C'est puissant, mais ça peut devenir difficile à comprendre.

Je positionnerais plutôt Leanna comme :

# **Leanna — AI Autonomous Work Environment**

```text
                  LEANNA
                     │
              ┌──────┴──────┐
              │             │
          UNDERSTAND      OBSERVE
              │             │
              └──────┬──────┘
                     ↓
                THINK / PLAN
                     ↓
              ┌──────┴──────┐
              ↓             ↓
           ACT             DELEGATE
              ↓             ↓
           VERIFY ←─────────┘
              ↓
           LEARN
              ↓
          ANTICIPATE
              ↓
        NEXT MISSION
```

Et là, **la mémoire, les agents, le navigateur, le Knowledge Graph, les notebooks, la voix, le screen share, les workflows et l'IDE deviennent les organes d'un même système**, au lieu d'apparaître comme une collection de fonctionnalités.

C'est particulièrement important parce que ton audit constate déjà que Leanna possède plusieurs moteurs agentiques parallèles — `AgentBrain`, `AgenticRuntime`, `Mission Planner`, `AutonomousExecutive`, `WorkflowEngine`, etc. 

### La fonctionnalité que je construirais en premier

**Leanna Anticipation Engine + Opportunity Engine + Project Intelligence Profile.**

Cela donnerait quelque chose de réellement nouveau :

> **Leanna observe ton environnement, comprend ton projet, apprend tes habitudes, détecte les problèmes/opportunités, propose des missions et devient progressivement meilleure pour les résoudre.**

C'est beaucoup plus différenciant que d'ajouter simplement « encore un agent » ou « encore un outil ».
