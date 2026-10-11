Je commence par analyser la structure du front et chercher les doublons.Je suis en train d'analyser le front (routage, deux sidebars, vues de missions) pour repérer les doublons. Je regarde maintenant les routes et la navigation.J'ai analysé le front (345 fichiers) et les doublons côté serveur. Je ne peux pas modifier votre dépôt directement, mais je peux produire les fichiers et les diffs à appliquer.

## Ce que j'ai vérifié dans le code

**Doublons côté serveur :**
- Deux `AgentRuntime` (455 et 1204 lignes).
- Quatre exécuteurs : `mission/Executor` (2744 lignes), `AgentExecutor` (1239), `AgentRuntimeExecutor` et `AgenticMissionRunner`.
- Deux superviseurs : `autonomy/Supervisor` et `core/LeannaSupervisor`.
- Trois stores de missions.
- Deux `imageGeneration`.
- Sept fichiers de routes pour les agents.
- `env.ts` et `environment.ts`.
- Trois implémentations de mémoire hiérarchique.
- Deux `useChatPersistence`.

**À confirmer (déduit des noms et des tailles, pas lu en détail) :**
- Mémoire : `MemoriesView`, `MemoryPanel` et `HierarchicalMemorySection`.
- Historique : `HistoryView` et `HistoryPanel`.
- GitHub : `GitHubView`, `GitHubPanel` et `WorkspacePublishPanel`.
- Automatisation : `AutomationView`, `ScheduledTasksPanel`, `WorkflowsPanel` et `WorkflowPanel`.
- Santé et observabilité : `SystemHealthDashboard`, `KnowledgeHealthDashboard` et `ObservabilityView`.

**Fichiers trop gros :**
- `IdeView` (1460 lignes) et `DocumentsView` (1409).
- `ChatPanel`, `TerminalPanel`, `BrowserPanel` et `StartupProjectModal` (70 à 80 Ko chacun).
- `index.css` (81 Ko).

## Structure cible proposée

| Hub | Contenu |
|---|---|
| **Pilotage** | Mission Control, avec onglets Timeline, Simulation, Pourquoi ? et Autonomie (6 pages deviennent 1) |
| **Agents** | Swarm, flotte, builder, marketplace, MCP, skills |
| **Travail** | IDE, Notebooks, Documents, GitHub |
| **Mémoire** | Mémoires, Historique, Listes |
| **Système** | Coûts et tokens, santé, logs, audit, sandbox |
| **Paramètres** | Regroupés en 4 ou 5 catégories (il y a aujourd'hui 22 sections) |

Il faudrait aussi une seule config de navigation partagée par toutes les sidebars, et une boîte de réception unique pour les approbations humaines. Les approbations sont le cœur de votre sécurité, mais leur UI est aujourd'hui dispersée.

## Plan par risque croissant


1. **Fusion des vues** : Pilotage en une page à onglets, avec le composant `ui/Tabs` que vous avez déjà.
2. **Serveur** : choisir un runtime, un exécuteur et un superviseur de référence, puis migrer et supprimer les autres. C'est l'étape la plus risquée, à faire derrière vos 1193 tests.
3. **UX** : états vides, onboarding, palette de commandes globale, découpage des gros fichiers.
