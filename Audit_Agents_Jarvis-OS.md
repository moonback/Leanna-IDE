# Audit du système multi-agents — Jarvis-OS

*Analyse basée sur l'export complet du dossier `server/` (263 fichiers, ~76 500 lignes).*

## 0. Constat préliminaire : combien d'agents avez-vous réellement ?

Vous parlez de « 14 agents », mais le registre actif (`agents/roles.ts` → `AGENT_REGISTRY`) en définit **15** :

| # | Rôle | Domaine | Écriture fichiers | Concurrence max |
|---|------|---------|:---:|:---:|
| 1 | `coder` | Code | ✅ | 3 |
| 2 | `refactor` | Code | ✅ | 2 |
| 3 | `debugger` | Code | ✅ | 2 |
| 4 | `reviewer` | Code | ❌ lecture seule | 2 |
| 5 | `tester` | Code | ✅ | 2 |
| 6 | `security` | Code | ❌ lecture seule | 2 |
| 7 | `architect` | Code | ✅ | 1 |
| 8 | `vision` | UI/Web | ❌ | 2 |
| 9 | `writer` | Rédaction | ✅ | 3 |
| 10 | `formatter` | Rédaction | ✅ | 2 |
| 11 | `researcher` | Rédaction | ❌ lecture seule | 2 |
| 12 | `proofreader` | Rédaction | ✅ | 2 |
| 13 | `translator` | Rédaction | ✅ | 2 |
| 14 | `summarizer` | Rédaction | ✅ | 2 |
| 15 | `planner` | Rédaction | ✅ | 1 |

**Point important et non anodin** : il existe un **second système d'agents en parallèle**, `runtime/agents/*.agent.ts`, avec son propre `SystemPromptBuilder` et son propre router (`runtime/routes/agents.ts`). Le commentaire dans le code y est explicite :

> « API compatible avec l'ancien router mais routée via le runtime. Ce fichier peut remplacer `server/routes/agents.ts` une fois la migration complète. »

Ce runtime v2 ne réimplémente que **7 des 15 agents** (writer, formatter, researcher, proofreader, translator, summarizer, planner — tous les agents « code » manquent : coder, refactor, debugger, reviewer, tester, security, architect, vision).

**Conséquence directe pour vous** : vous maintenez deux architectures d'agents en parallèle, deux façons de construire un system prompt (`agents/PromptBuilder.ts` déjà marqué « Stub de compatibilité » vs `runtime/prompts/SystemPromptBuilder.ts`), et deux routers API. C'est la première source de dette et de confusion à trancher avant d'optimiser quoi que ce soit d'autre.

---

## 1. Les 5 problèmes qui coûtent le plus cher en contexte / tokens / performance

### 🔴 1.1 — Croissance quasi-quadratique du contexte pendant la boucle d'outils

Dans `agents/AgentExecutor.ts`, la boucle `executeToolLoop` (max **8 tours**, `MAX_TOOL_TURNS = 8`) reconstruit à **chaque tour** un bloc `## Fichiers en mémoire` qui contient le **contenu intégral de tous les fichiers lus jusque-là** (`state.fileSnapshots`), chacun pouvant peser jusqu'à `MAX_FILE_CONTEXT_CHARS = 200 000` caractères, plus jusqu'à `MAX_OBSERVATION_CHARS = 240 000` caractères d'observations cumulées par tour.

Concrètement : si un agent lit 4 fichiers moyens au tour 1, ces 4 fichiers sont **ré-envoyés en entier** au tour 2, au tour 3, etc. — jusqu'à 8 fois. Le coût en tokens ne croît pas linéairement avec le travail réalisé, il croît avec le carré du nombre de tours. C'est probablement votre plus gros poste de coût et de latence caché, et il touche les **15 agents** puisque `executeToolLoop` est partagé par tous.

**Pourquoi c'est fait ainsi (bonne intention, mauvais coût)** : le commentaire indique que ce bloc sert d'« état autoritaire » pour que `apply_patch` opère sur la bonne version du fichier, ce qui est légitime — mais l'implémentation actuelle paie ce besoin en re-transmission complète plutôt qu'en diff incrémental.

### 🔴 1.2 — Aucune utilisation du prompt caching

Recherche exhaustive sur `cache_control` / `ephemeral` / `prompt_caching` dans tout le dossier : **zéro résultat**. Or vos `MODEL_BUDGETS` (`utils/tokenOptimizer.ts`) montrent que vous ciblez explicitement `anthropic/claude-sonnet-4`, `openai/gpt-4o`, `gemini-2.5-*` — tous des modèles qui supportent le cache de prompt.

Chaque agent a un system prompt composé de `BASE_SYSTEM_PROMPT` (identique pour les 15 agents, ~40 lignes) + un bloc spécifique très structuré (`SECTION_IDENTITY` + `SECTION_MISSION` + `SECTION_PROCESS` + `SECTION_RULES` + `SECTION_INTERDICTIONS` + `SECTION_CRITERES` + `SECTION_OUTPUT_FORMAT`, souvent 60-100 lignes). Ce bloc est **statique par rôle** et pourtant renvoyé texte brut à chaque appel, à chaque tour de boucle, sans jamais être marqué comme cache-able.

Sur un système à 15 agents qui s'enchaînent par délégation, c'est un system prompt volumineux payé en entier à chaque étape de la chaîne — c'est le levier de réduction de coût/latence le plus simple à activer, sans rien changer au comportement des agents.

### 🟠 1.3 — Délégations en cascade sans détection de cycle ni limite de profondeur

`AgentExecutor.dispatchDelegations` → `sendDelegation` envoie chaque délégation sur `AgentMessageBus`, en parallèle (`Promise.allSettled`), **sans** :
- limite de profondeur de délégation (contrairement à `mission/` qui a un `maxDepth: 5` explicite sur `goalStack`),
- détection de cycle (contrairement à `knowledge/DependencyGraph.ts` qui implémente `detectCycles()` pour le code, mais rien d'équivalent pour les délégations d'agents).

Le prompt système interdit textuellement à `coder` de faire de la revue et pousse `reviewer` → délègue vers x, x → délègue vers y, etc. Rien n'empêche aujourd'hui un cycle A→B→A si deux agents se renvoient mutuellement une tâche (ce qui peut arriver avec des règles de délégation « automatiques recommandées » qui se chevauchent, ex. coder→tester/reviewer, reviewer peut à son tour recommander refactor, qui peut recommander tester, etc.).

**Risque concret** : un run qui explose en dizaines de sous-tâches, chacune ré-ouvrant sa propre boucle de 8 tours avec re-transmission de fichiers (cf. 1.1) → coût multiplicatif difficile à borner.

### 🟠 1.4 — Budget mémoire projet (`ProjectMemory`) très étroit et scoring qui peut égarer l'important

`DEFAULT_BUDGET_GEMINI.memory = 2_000` tokens, et même pour Claude Sonnet 4 : `memory: 3_000` tokens seulement (sur un budget total de 200k). `optimizeMemories()` classe les souvenirs avec un score = récence + bonus de pertinence − pénalité de longueur, ce qui veut dire qu'**une mémoire longue mais critique** (ex. une décision d'architecture bien expliquée) peut être évincée au profit de plusieurs mémoires courtes et récentes mais moins importantes. Avec 15 agents qui persistent tous des faits via `knowledge_memory_add` dans les mêmes catégories (stack, architecture, convention, decision...), ce budget de 2-3k tokens se remplit vite et rien ne garantit que les faits structurants survivent au tri.

### 🟡 1.5 — System prompts très verbeux, redondants entre agents

Chaque agent reçoit `BASE_SYSTEM_PROMPT` (règles générales + règles de délégation + formats supportés) **puis** son bloc spécifique qui répète une bonne partie de la même structure (identité / mission / process / règles / interdictions / critères / format de sortie) à chaque fois, sous forme de texte intégral généré dynamiquement par `buildAgentPrompt()`. Rien n'est mutualisé au-delà de `BASE_SYSTEM_PROMPT` : les sections `SECTION_RULES`, `SECTION_INTERDICTIONS`, etc. sont ré-écrites intégralement pour chacun des 15 rôles. C'est lisible et maintenable côté code, mais ça gonfle chaque appel (et se cumule avec 1.1 pendant la boucle d'outils).

---

## 2. Ce qui est déjà bien fait (à ne pas casser en optimisant)

- **`SemanticSearch` (`knowledge/SemanticSearch.ts`)** est un vrai moteur de RAG sélectif : scoring composite entité/chemin/contenu, seuil de pertinence minimal (`MIN_RELEVANCE_THRESHOLD = 0.15`), limite à `MAX_RESULTS = 10` fichiers, expansion par synonymes FR/EN. C'est déjà pensé pour éviter le remplissage de contexte inutile — le commentaire cite même une « Optimisation Leanna #2 : RAG Sélectif », signe qu'un travail d'optimisation a déjà eu lieu ici.
- **`tokenOptimizer.ts`** a une vraie logique de budget par modèle (`MODEL_BUDGETS`) et un estimateur de tokens avec repli heuristique intelligent (densité de symboles de code) si `tiktoken` n'est pas installé.
- **Boucle d'outils bornée** (`MAX_TOOL_TURNS = 8`) et garde-fou anti-stagnation (« Tu as lu N fois le fichier sans avoir émis de apply_patch ») : bonne intention anti-boucle-infinie, même si le coût par tour reste trop élevé (cf. 1.1).
- **Séparation stricte lecture/écriture par agent** (`reviewer` et `security` sont explicitement lecture seule dans leurs capacités et leurs règles) : bon principe de moindre privilège qui limite les risques d'écriture involontaire.

---

## 3. Recommandations priorisées (impact × effort)

### Priorité 1 — Gains rapides, effort modéré

1. **Activer le prompt caching** sur `BASE_SYSTEM_PROMPT` + le bloc spécifique par agent (statiques). C'est le changement au meilleur ratio gain/effort : aucune logique métier à toucher, juste marquer ces segments comme cache-ables dans l'appel API. Impact attendu : réduction significative de la latence et du coût sur les appels répétés (boucle d'outils + chaînes de délégation).
2. **Remplacer la ré-injection complète des `fileSnapshots` par un diff incrémental** : n'envoyer au tour N que ce qui a changé depuis le tour N-1 (fichiers nouvellement lus ou modifiés), en gardant un résumé/pointeur pour le reste plutôt que le contenu intégral. C'est le correctif direct du problème 1.1.
3. **Ajouter une limite de profondeur + détection de cycle sur les délégations**, sur le modèle de ce qui existe déjà dans `mission/` (`maxDepth`) et `knowledge/DependencyGraph.ts` (`detectCycles()`). Simple à porter : garder une pile de rôles déjà traversés dans la chaîne de délégation et refuser/alerter en cas de retour sur un rôle déjà présent, ou au-delà d'une profondeur de 3-4.

### Priorité 2 — Structurel, effort plus élevé mais fort impact à moyen terme

4. **Trancher la double architecture agents/ vs runtime/** : soit finir la migration vers `runtime/` en portant les 8 agents « code » manquants, soit geler `runtime/` et documenter que `agents/` est la seule voie active. Le maintenir « à moitié migré » coûte en confusion pour vous (et en tokens si jamais les deux systèmes sont chargés simultanément côté bootstrap).
5. **Revoir le budget mémoire projet** : passer de 2-3k tokens fixes à un budget proportionnel à la fenêtre de contexte du modèle utilisé (déjà calculé dans `MODEL_BUDGETS`, mais pas relié à `optimizeMemories`), et pondérer le scoring pour ne pas systématiquement pénaliser les mémoires longues à haute valeur (ex. plancher de protection pour les catégories `architecture` et `decision`).
6. **Factoriser les sections communes des 15 system prompts** (`SECTION_RULES`, `SECTION_INTERDICTIONS`, etc. contiennent des formulations redondantes d'un agent à l'autre) en un socle commun plus court, avec seulement les deltas réellement spécifiques par rôle en clair.

### Priorité 3 — Amélioration continue

7. **Instrumenter le coût réel par agent et par tour** (vous avez déjà `estimateTokens` et des logs `[TokenOptimizer]` — il manque un agrégat par tâche/orchestration pour voir concrètement quels agents/rôles consomment le plus, et valider l'effet des optimisations ci-dessus après coup).
8. **Envisager des embeddings vectoriels en complément du TF-IDF** de `SemanticSearch` uniquement si la base de code grossit significativement (le TF-IDF actuel avec expansion de synonymes est déjà un bon compromis coût/qualité pour la taille actuelle du projet — ne pas le remplacer par précaution, seulement si les mesures du point 7 montrent une perte de pertinence).

---

## 4. Ordre d'attaque suggéré

1. Prompt caching (quasi gratuit, gain immédiat).
2. Diff incrémental des `fileSnapshots` dans `executeToolLoop`.
3. Garde-fou anti-cycle/profondeur sur les délégations.
4. Décision architecturale agents/ vs runtime/ (à trancher en équipe, pas un pur sujet technique).
5. Ajustement du budget/scoring de `ProjectMemory`.

Les points 1 à 3 peuvent être faits sans toucher aux 15 prompts d'agents eux-mêmes : c'est la plomberie d'exécution (`AgentExecutor`, `AgentOrchestrator`) qui porte l'essentiel du problème de contexte, pas la qualité de rédaction des prompts.
