
# Tooltip Migration Analysis Report

## 📊 Summary

| Metric | Count |
|--------|-------|
| Total `title=` attributes | 317 |
| Total `aria-label` attributes | 177 |
| `title=` without nearby `aria-label` | 258 |
| Button elements with `title=` only | 0 |
| Files needing migration | 78 |

## 🚨 Critical Issues (Buttons with title only)

Buttons with `title=` but no `aria-label` are **not announced properly** by screen readers.




## 📁 Files Needing Migration

### components\FloatingOrb.tsx
- `title=` count: 1
- `aria-label` count: 1
- Need migration: 1

### components\ide\Breadcrumb.tsx
- `title=` count: 2
- `aria-label` count: 1
- Need migration: 2

### components\ide\CheckpointPanel.tsx
- `title=` count: 3
- `aria-label` count: 0
- Need migration: 3

### components\ide\CommandPalette.tsx
- `title=` count: 3
- `aria-label` count: 0
- Need migration: 3

### components\ide\ContextMenu.tsx
- `title=` count: 2
- `aria-label` count: 0
- Need migration: 2

### components\ide\DiffViewer.tsx
- `title=` count: 5
- `aria-label` count: 0
- Need migration: 5

### components\ide\EditorTabs.tsx
- `title=` count: 9
- `aria-label` count: 0
- Need migration: 9

### components\ide\EmptyEditorState.tsx
- `title=` count: 3
- `aria-label` count: 3
- Need migration: 3

### components\ide\FileExplorer.tsx
- `title=` count: 4
- `aria-label` count: 0
- Need migration: 4

### components\ide\FileExplorerVirtualized.tsx
- `title=` count: 18
- `aria-label` count: 0
- Need migration: 18

### components\ide\IdeModal.tsx
- `title=` count: 1
- `aria-label` count: 1
- Need migration: 1

### components\ide\LiveSkillsMonitor.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\ide\MultiAgentIndicator.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\ide\NotebookPickerModal.tsx
- `title=` count: 1
- `aria-label` count: 2
- Need migration: 1

### components\ide\RichDocumentViewer.tsx
- `title=` count: 19
- `aria-label` count: 0
- Need migration: 19

### components\ide\SelfEditBanner.tsx
- `title=` count: 2
- `aria-label` count: 0
- Need migration: 2

### components\ide\sidebar\SidebarSection.tsx
- `title=` count: 2
- `aria-label` count: 0
- Need migration: 2

### components\ide\StatusBar.tsx
- `title=` count: 9
- `aria-label` count: 2
- Need migration: 9

### components\ide\TokenDetailModal.tsx
- `title=` count: 1
- `aria-label` count: 3
- Need migration: 1

### components\ide\WorkflowPanel.tsx
- `title=` count: 4
- `aria-label` count: 6
- Need migration: 1

### components\knowledge\KnowledgeHealthDashboard.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\notebooks\AudioOverviewPanel.tsx
- `title=` count: 9
- `aria-label` count: 0
- Need migration: 9

### components\notebooks\GeneratedDocsPanel.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\notebooks\GeneratePanel.tsx
- `title=` count: 11
- `aria-label` count: 0
- Need migration: 11

### components\notebooks\NotebookChat.tsx
- `title=` count: 18
- `aria-label` count: 10
- Need migration: 9

### components\notebooks\NotebookDetail.tsx
- `title=` count: 6
- `aria-label` count: 6
- Need migration: 2

### components\notebooks\NotebookList.tsx
- `title=` count: 3
- `aria-label` count: 2
- Need migration: 1

### components\notebooks\NotesPanel.tsx
- `title=` count: 11
- `aria-label` count: 0
- Need migration: 11

### components\notebooks\SlidePreviewModal.tsx
- `title=` count: 6
- `aria-label` count: 0
- Need migration: 6

### components\notebooks\SourcePanel.tsx
- `title=` count: 12
- `aria-label` count: 12
- Need migration: 6

### components\notebooks\SourcesSummaryCard.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\notebooks\SourceViewer.tsx
- `title=` count: 3
- `aria-label` count: 0
- Need migration: 3

### components\panels\AgentFleetPanel.tsx
- `title=` count: 5
- `aria-label` count: 1
- Need migration: 5

### components\panels\AgentPanel.tsx
- `title=` count: 1
- `aria-label` count: 2
- Need migration: 1

### components\panels\AuditPanel.tsx
- `title=` count: 3
- `aria-label` count: 0
- Need migration: 3

### components\panels\BrowserPanel.tsx
- `title=` count: 7
- `aria-label` count: 29
- Need migration: 1

### components\panels\DocumentPanel.tsx
- `title=` count: 5
- `aria-label` count: 0
- Need migration: 5

### components\panels\McpPanel.tsx
- `title=` count: 8
- `aria-label` count: 0
- Need migration: 8

### components\panels\MissionPanel.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\panels\SandboxPanel.tsx
- `title=` count: 2
- `aria-label` count: 2
- Need migration: 1

### components\panels\ScheduledTasksPanel.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\panels\ScreenSharePanel.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\panels\SessionTranscriptPanel.tsx
- `title=` count: 1
- `aria-label` count: 2
- Need migration: 1

### components\panels\SkillsPanel.tsx
- `title=` count: 1
- `aria-label` count: 1
- Need migration: 1

### components\panels\SystemHealthDashboard.tsx
- `title=` count: 3
- `aria-label` count: 0
- Need migration: 3

### components\panels\SystemLogsPanel.tsx
- `title=` count: 1
- `aria-label` count: 2
- Need migration: 1

### components\panels\TerminalPanel.tsx
- `title=` count: 21
- `aria-label` count: 1
- Need migration: 20

### components\panels\VisionPanel.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\panels\WorkflowsPanel.tsx
- `title=` count: 4
- `aria-label` count: 3
- Need migration: 3

### components\panels\WorkspacePanel.tsx
- `title=` count: 2
- `aria-label` count: 3
- Need migration: 1

### components\sandbox\SandboxDiffViewer.tsx
- `title=` count: 10
- `aria-label` count: 1
- Need migration: 9

### components\settings\AgentsSection.tsx
- `title=` count: 2
- `aria-label` count: 3
- Need migration: 2

### components\settings\AiSection.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\settings\AppearanceSection.tsx
- `title=` count: 2
- `aria-label` count: 2
- Need migration: 1

### components\settings\AuditSection.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\settings\BehaviorSection.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\settings\CustomSkillsSection.tsx
- `title=` count: 4
- `aria-label` count: 0
- Need migration: 4

### components\settings\DataSection.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\settings\ModelSection.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\settings\OpenRouterSection.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\settings\ProfileSection.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\settings\SafeguardsSection.tsx
- `title=` count: 2
- `aria-label` count: 0
- Need migration: 2

### components\settings\SelfRootSection.tsx
- `title=` count: 2
- `aria-label` count: 0
- Need migration: 2

### components\settings\SystemPromptSection.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\settings\TokensSection.tsx
- `title=` count: 4
- `aria-label` count: 0
- Need migration: 4

### components\sidebar\AgentStatusBlock.tsx
- `title=` count: 1
- `aria-label` count: 3
- Need migration: 1

### components\StartupProjectModal.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### components\TokenCounter.tsx
- `title=` count: 1
- `aria-label` count: 1
- Need migration: 1

### components\ui\SidePanel.tsx
- `title=` count: 2
- `aria-label` count: 3
- Need migration: 1

### components\UnifiedSidebar.tsx
- `title=` count: 4
- `aria-label` count: 5
- Need migration: 3

### components\workflows\VisualWorkflowBuilder.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### main.tsx
- `title=` count: 2
- `aria-label` count: 0
- Need migration: 2

### views\AutomationView.tsx
- `title=` count: 4
- `aria-label` count: 0
- Need migration: 4

### views\DocumentsView.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### views\GitHubView.tsx
- `title=` count: 4
- `aria-label` count: 8
- Need migration: 1

### views\HistoryView.tsx
- `title=` count: 1
- `aria-label` count: 3
- Need migration: 1

### views\ListsView.tsx
- `title=` count: 1
- `aria-label` count: 0
- Need migration: 1

### views\MemoriesView.tsx
- `title=` count: 1
- `aria-label` count: 2
- Need migration: 1


## 🛠️ Migration Strategy

### For button elements:
Replace:
```tsx
<button onClick={handler} title="Description"><Icon /></button>
```

With:
```tsx
<Tooltip content="Description" as="button" onClick={handler}>
  <Icon />
</Tooltip>
```

Or if you need to keep the button element:
```tsx
<button onClick={handler} aria-label="Description"><Icon /></button>
<Tooltip content="Description"><button onClick={handler} aria-label="Description"><Icon /></button></Tooltip>
```

### For non-interactive elements:
Replace:
```tsx
<span title="Description">Text</span>
```

With:
```tsx
<Tooltip content="Description"><span>Text</span></Tooltip>
```

## 📝 Full List of title= Without aria-label

- **undefined** (line 61): `unknown`
- **undefined** (line 52): `unknown`
- **undefined** (line 69): `Modifications non sauvegardées`
- **undefined** (line 82): `Valider le build (tsc)`
- **undefined** (line 90): `Actualiser`
- **undefined** (line 178): `unknown`
- **undefined** (line 266): `Rechercher un fichier (Ctrl+P)`
- **undefined** (line 277): `Exécuter une commande (Ctrl+Shift+P)`
- **undefined** (line 286): `Fermer (Escape)`
- **undefined** (line 128): `unknown`
- **undefined** (line 163): `unknown`
- **undefined** (line 122): `Accepter les modifications`
- **undefined** (line 140): `Revenir à la version sauvegardée`
- **undefined** (line 151): `Actualiser`
- **undefined** (line 160): `Fermer (Escape)`
- **undefined** (line 187): `Réessayer le chargement`
- **undefined** (line 93): `unknown`
- **undefined** (line 136): `Fermer (Ctrl+W)`
- **undefined** (line 153): `unknown`
- **undefined** (line 167): `unknown`
- **undefined** (line 176): `Basculer la minimap`
- **undefined** (line 184): `Basculer le retour à la ligne automatique (Alt+Z)`
- **undefined** (line 192): `Formater le document (Shift+Alt+F)`
- **undefined** (line 201): `Bibliothèque de Templates & Modèles`
- **undefined** (line 211): `Enregistrer le fichier (Ctrl+S)`
- **undefined** (line 634): `Nouveau fichier`
- **undefined** (line 640): `Rechercher`
- **undefined** (line 646): `Notebooks`
- **undefined** (line 324): `unknown`
- **undefined** (line 399): `Mode Sandbox actif — les modifications sont isolées`
- **undefined** (line 408): `Mode Sandbox inactif — modifications directes sur les fichiers locaux`
- **undefined** (line 454): `unknown`
- **undefined** (line 328): `unknown`
- **undefined** (line 349): `unknown`
- **undefined** (line 362): `unknown`
- **undefined** (line 745): `Changer de projet racine`
- **undefined** (line 756): `unknown`
- **undefined** (line 776): `Remonter d'un niveau`
- **undefined** (line 791): `Mode Sandbox actif`
- **undefined** (line 804): `Mode Sandbox inactif`
- **undefined** (line 824): `Rechercher (Ctrl/Cmd+Shift+F)`
- **undefined** (line 832): `unknown`
- **undefined** (line 840): `unknown`
- **undefined** (line 849): `Nouveau fichier`
- **undefined** (line 856): `Actualiser`
- **undefined** (line 891): `Effacer`
- **undefined** (line 899): `Fermer la recherche`
- **undefined** (line 940): `Réinitialiser le tri`
- **undefined** (line 1065): `Cliquez sur un fichier pour examiner et valider les modifications`
- **undefined** (line 1078): `Tous les fichiers sont validés et synchronisés sur le workspace réel`
- **undefined** (line 100): `unknown`
- **undefined** (line 334): `unknown`
- **undefined** (line 289): `unknown`
- **undefined** (line 278): `unknown`
- **undefined** (line 311): `unknown`
- **undefined** (line 336): `Exporter en CSV`
- **undefined** (line 384): `Cliquer pour copier`
- **undefined** (line 419): `unknown`
- **undefined** (line 474): `unknown`
- **undefined** (line 521): `unknown`
- **undefined** (line 599): `unknown`
- **undefined** (line 738): `unknown`
- **undefined** (line 797): `unknown`
- **undefined** (line 802): `unknown`
- **undefined** (line 831): `unknown`
- **undefined** (line 844): `unknown`
- **undefined** (line 871): `unknown`
- **undefined** (line 932): `unknown`
- **undefined** (line 1018): `unknown`
- **undefined** (line 1438): `unknown`
- **undefined** (line 1448): `Enregistrer dans le workspace`
- **undefined** (line 1458): `Télécharger en JSON`
- **undefined** (line 1467): `Fermer`
- **undefined** (line 64): `Annuler ce changement`
- **undefined** (line 75): `Accepter le changement`
- **undefined** (line 61): `unknown`
- **undefined** (line 124): `unknown`
- **undefined** (line 197): `unknown`
- **undefined** (line 220): `Changer de modèle IA`
- **undefined** (line 235): `unknown`
- **undefined** (line 250): `Ouvrir le panneau Agents`
- **undefined** (line 263): `Ouvrir la flotte d'agents`
- **undefined** (line 275): `Ouvrir les logs de l'assistant et des agents`
- **undefined** (line 326): `unknown`
- **undefined** (line 352): `Aller à la ligne...`
- **undefined** (line 370): `Réinitialiser le sandbox`
- **undefined** (line 360): `Valeur exacte`
- **undefined** (line 485): `unknown`
- **undefined** (line 237): `Rafraîchir les métriques`
- **undefined** (line 585): `Supprimer`
- **undefined** (line 633): `Arrêter la lecture`
- **undefined** (line 648): `Écouter le podcast (TTS)`
- **undefined** (line 668): `Enregistrer dans la sandbox`
- **undefined** (line 682): `Régénérer`
- **undefined** (line 695): `Supprimer`
- **undefined** (line 772): `Changer la vitesse`
- **undefined** (line 796): `Vitesse de lecture`
- **undefined** (line 804): `Télécharger le script`
- **undefined** (line 286): `Supprimer`
- **undefined** (line 172): `Copier`
- **undefined** (line 1289): `Réessayer`
- **undefined** (line 1301): `Annuler`
- **undefined** (line 1410): `Choisir un type de rapport • Suggestions IA incluses`
- **undefined** (line 1453): `unknown`
- **undefined** (line 1574): `Importer dans le workspace`
- **undefined** (line 1583): `Régénérer`
- **undefined** (line 1591): `Exporter en Markdown`
- **undefined** (line 1599): `Copier`
- **undefined** (line 1608): `Générer une présentation Reveal.js`
- **undefined** (line 1751): `Demander de nouvelles suggestions`
- **undefined** (line 1412): `Estimation des tokens utilisés dans cette conversation`
- **undefined** (line 1425): `Nouvelle conversation`
- **undefined** (line 2122): `Filtrer les sources`
- **undefined** (line 2162): `Deep Dive — exploration approfondie`
- **undefined** (line 2174): `Extraire les insights clés`
- **undefined** (line 2187): `Comparer les sources`
- **undefined** (line 2201): `Demandes avec contexte complet`
- **undefined** (line 2320): `Exporter en Markdown`
- **undefined** (line 2328): `Effacer l'historique`
- **undefined** (line 433): `Sources (Ctrl+1 / ⌘1)`
- **undefined** (line 443): `Chat (Ctrl+2 / ⌘2)`
- **undefined** (line 243): `unknown`
- **undefined** (line 309): `Nouvelle note`
- **undefined** (line 318): `Rechercher`
- **undefined** (line 329): `Modèles`
- **undefined** (line 369): `Tri`
- **undefined** (line 380): `Exporter`
- **undefined** (line 394): `Liste`
- **undefined** (line 405): `Canvas`
- **undefined** (line 652): `unknown`
- **undefined** (line 666): `unknown`
- **undefined** (line 673): `Modifier`
- **undefined** (line 680): `Supprimer`
- **undefined** (line 278): `unknown`
- **undefined** (line 351): `unknown`
- **undefined** (line 409): `Ouvrir en plein écran dans un nouvel onglet`
- **undefined** (line 423): `Aperçu présentation Reveal.js`
- **undefined** (line 445): `Télécharger le fichier HTML`
- **undefined** (line 454): `Ouvrir dans un nouvel onglet`
- **undefined** (line 827): `unknown`
- **undefined** (line 881): `Coller depuis le presse-papier`
- **undefined** (line 892): `Importer le codebase du workspace`
- **undefined** (line 904): `unknown`
- **undefined** (line 1322): `Cliquer pour retirer`
- **undefined** (line 1354): `Ajouter un tag`
- **undefined** (line 96): `Regénérer`
- **undefined** (line 157): `Recharger le contenu`
- **undefined** (line 164): `Fermer`
- **undefined** (line 266): `unknown`
- **undefined** (line 300): `unknown`
- **undefined** (line 309): `Rafraîchir`
- **undefined** (line 330): `Flotte non initialisée`
- **undefined** (line 344): `Aucun message`
- **undefined** (line 353): `Aucune donnée`
- **undefined** (line 319): `Agents`
- **undefined** (line 108): `Audit système`
- **undefined** (line 123): `Lancer l'audit système`
- **undefined** (line 138): `Ouvrir OpenRouter`
- **undefined** (line 1363): `unknown`
- **undefined** (line 249): `Rafraîchir`
- **undefined** (line 257): `Uploader un document`
- **undefined** (line 342): `Analyser les liens entre les documents sélectionnés`
- **undefined** (line 352): `Générer une synthèse croisée`
- **undefined** (line 540): `Supprimer`
- **undefined** (line 417): `Rafraîchir`
- **undefined** (line 425): `Ajouter un serveur`
- **undefined** (line 656): `Tags séparés par virgule (ex: docs,api)`
- **undefined** (line 663): `Timeout en millisecondes (défaut: 30000)`
- **undefined** (line 670): `Nombre max de reconnexions (défaut: 5, 0=désactivé)`
- **undefined** (line 809): `Reconnecter`
- **undefined** (line 817): `unknown`
- **undefined** (line 824): `Supprimer`
- **undefined** (line 305): `Missions`
- **undefined** (line 583): `unknown`
- **undefined** (line 48): `Tâches planifiées`
- **undefined** (line 8): `Partage d'écran`
- **undefined** (line 31): `Session`
- **undefined** (line 63): `Skills`
- **undefined** (line 292): `Rafraîchir`
- **undefined** (line 303): `Actualisation auto toutes les 30s`
- **undefined** (line 321): `Fermer`
- **undefined** (line 41): `System Logs`
- **undefined** (line 244): `Précédent (Flèche haut)`
- **undefined** (line 271): `Suivant (Flèche bas)`
- **undefined** (line 298): `Fermer (Échap)`
- **undefined** (line 635): `Valider`
- **undefined** (line 650): `Annuler`
- **undefined** (line 667): `Renommer`
- **undefined** (line 692): `Copier la sélection (Ctrl+C)`
- **undefined** (line 714): `Effacer (Ctrl+L)`
- **undefined** (line 881): `Effacer l'entrée`
- **undefined** (line 1339): `Nouvel onglet (Ctrl+T)`
- **undefined** (line 1375): `Changer de shell`
- **undefined** (line 1449): `unknown`
- **undefined** (line 1469): `unknown`
- **undefined** (line 1545): `unknown`
- **undefined** (line 1566): `Commandes favorites`
- **undefined** (line 1659): `Retirer des favoris`
- **undefined** (line 1760): `Rechercher (Ctrl+F)`
- **undefined** (line 1785): `unknown`
- **undefined** (line 1803): `unknown`
- **undefined** (line 1826): `Fermer`
- **undefined** (line 13): `Votre caméra`
- **undefined** (line 283): `unknown`
- **undefined** (line 373): `Workflows`
- **undefined** (line 380): `Créer un workflow visuel low-code`
- **undefined** (line 120): `Workspace`
- **undefined** (line 836): `unknown`
- **undefined** (line 849): `Changement précédent (P)`
- **undefined** (line 860): `Changement suivant (N)`
- **undefined** (line 878): `Accepter toutes les modifications`
- **undefined** (line 893): `Rejeter toutes les modifications`
- **undefined** (line 902): `Rafraîchir`
- **undefined** (line 909): `Raccourcis clavier (?)`
- **undefined** (line 1037): `Accepter ce fichier (A)`
- **undefined** (line 1051): `Rejeter ce fichier (R)`
- **undefined** (line 133): `Système Multi-Agents`
- **undefined** (line 237): `Recharger les agents personnalisés`
- **undefined** (line 13): `Identité de l'IA`
- **undefined** (line 27): `Apparence`
- **undefined** (line 26): `Journal d'audit`
- **undefined** (line 10): `Comportement`
- **undefined** (line 399): `Skills personnalisés`
- **undefined** (line 738): `unknown`
- **undefined** (line 747): `Modifier`
- **undefined** (line 755): `Supprimer`
- **undefined** (line 37): `Gestion des données`
- **undefined** (line 73): `Hyperparamètres du modèle`
- **undefined** (line 80): `Multi-Modèle (OpenRouter)`
- **undefined** (line 11): `Qui êtes-vous ?`
- **undefined** (line 107): `Garde-fous auto-modification`
- **undefined** (line 253): `Revenir à ce checkpoint`
- **undefined** (line 138): `Périmètre du repo`
- **undefined** (line 168): `Parcourir`
- **undefined** (line 26): `Prompt Système`
- **undefined** (line 106): `Tokens & Clés API`
- **undefined** (line 117): `Tokens & Clés API`
- **undefined** (line 193): `unknown`
- **undefined** (line 201): `Supprimer`
- **undefined** (line 117): `unknown`
- **undefined** (line 187): `Quitter`
- **undefined** (line 148): `unknown`
- **undefined** (line 182): `Redimensionner`
- **undefined** (line 228): `Quitter Leanna `
- **undefined** (line 411): `Historique · Mémoires · Tâches`
- **undefined** (line 479): `Paramètres`
- **undefined** (line 259): `Supprimer cette étape`
- **undefined** (line 365): `Changer de source`
- **undefined** (line 374): `Arrêter le partage`
- **undefined** (line 103): `Automatisations & Workflows`
- **undefined** (line 189): `Lancer maintenant`
- **undefined** (line 194): `unknown`
- **undefined** (line 199): `Supprimer`
- **undefined** (line 164): `Knowledge System`
- **undefined** (line 256): `unknown`
- **undefined** (line 110): `Historique`
- **undefined** (line 153): `Snippets`
- **undefined** (line 64): `Mémoire`
