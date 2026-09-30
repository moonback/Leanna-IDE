# Graph Report - Leanna-ide  (2026-09-30)

## Corpus Check
- 242 files · ~296,001 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1961 nodes · 2592 edges · 200 communities (137 shown, 50 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 65 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `60b0c1e2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Modal.tsx
- AutonomyTimeline.tsx
- constants.ts
- PM2StatusPanel.tsx
- useLiveAPI.ts
- SkillsPanel.tsx
- Field.tsx
- ObservabilityView.tsx
- Tabs.tsx
- IdeView.tsx
- logger.ts
- TelegramStatusModal.tsx
- DESIGN_TOKENS.md
- AsyncState.tsx
- MarketplacePanel.tsx
- main.tsx
- audit.md
- ../components/ide/RichDocumentViewer.js
- Button.tsx
- 3. Couleurs sémantiques
- MemoriesView.tsx
- useTerminal.ts
- 15. Outils de vérification
- useWebSocket.ts
- AgentPanel.tsx
- getColor
- FlyoutMenu.tsx
- 14.1 StatusBadge
- 2.2 Règles
- customSkillsAccess.ts
- ../components/ide/DiffViewer.js
- FileIcon.tsx
- AgentBuilderPanel.tsx
- LauncherModal.tsx
- CreateNotebookModal.tsx
- UnifiedSidebar.tsx
- ImportToNotebookButton.tsx
- NotesCanvas.tsx
- WorkspacePanel.tsx
- StatusBar.tsx
- IconButton.tsx
- 13. Plan de migration
- SidePanel.tsx
- 10. Accessibilité
- 4. Classes utilitaires sémantiques
- 5. Rayons
- WebviewElement
- ListsView.tsx
- McpDirectory.tsx
- RootErrorBoundary
- LeannaIgnoreModal.tsx
- NotebookPickerModal.tsx
- realtimeCache.ts
- PdfPreview.tsx
- ShortcutsModal.tsx
- KnowledgeHealthDashboard.tsx
- EnvSection.tsx
- BrowserToolbar.tsx
- P0 — obligatoire
- AgentsSection.tsx
- OpenRouterSection.tsx
- TelegramSection.tsx
- TokensSection.tsx
- AgentTaskCard.tsx
- ThemeContext.tsx
- Règles
- 8. Animation
- cleanup.ts
- AIConnectionBanner.tsx
- Breadcrumb.tsx
- CheckpointPanel.tsx
- AutomationView.tsx
- ModelPickerModal.tsx
- RenameInput.tsx
- TerminalPanel.tsx
- TextRenderer
- AgentFleetPanel.tsx
- SelfEditBanner.tsx
- BrowserExternalOverlay.tsx
- ModeToggleButton.tsx
- SkillsDocModal.tsx
- EmptyState.tsx
- Panel.tsx
- Tooltip.tsx
- ViewHeader.tsx
- WebcamCapture
- 9. États interactifs
- ./DocumentsView.js
- react-window-tree.d.ts
- sanitizeMarkdownHtml.ts
- ScreenSharePanel.tsx
- DataSection.tsx
- ChatPanel.tsx
- agentActivityStore.ts
- ./SandboxDiffViewer.js
- EditorTabs.tsx
- ../components/ide/GitHubPanel.js
- SettingsView.tsx
- getAgentTasks
- FileExplorerVirtualized.tsx
- ide.ts
- useAudio.ts
- LiveAPIContext.tsx
- 22. P1 — autonomie avancée
- MissionPanel.tsx
- SourceViewer.tsx
- InlineApproval.tsx
- ExplorerDock.tsx
- 17. Recovery : il faut distinguer quatre niveaux
- 9. Le cycle d'apprentissage
- TranscriptEntry
- useFileSystem.ts
- BottomDock.tsx
- ../components/panels/VisionPanel.js
- RightDock.tsx
- MissionCreatedPrompt.tsx
- 13. Le système de permissions est déjà bien pensé
- 1. Verdict global
- AgentProgressBar.tsx
- 27. Mon plan de transformation
- useChatPersistence.ts
- CustomSkillsSection.tsx
- useSupabaseMemories.ts
- 5.1 ToolRegistry
- 8. Le deuxième gros problème : autonomie ≠ simple exécution automatique
- 2. Ce que Leanna est réellement aujourd'hui
- 3. Le problème majeur : Leanna possède trop de “cerveaux”
- 4. Architecture cible que je recommande
- 7. Le vrai gros manque : le transactionnel
- UserProfileContext.tsx
- sandboxApi.ts
- ChatCards.tsx
- HistoryView.tsx
- SystemHealthDashboard.tsx
- EmptyEditorState.tsx
- GeneratePanel.tsx
- ImportToNotebookExample.tsx
- WorkflowsPanel.tsx
- LiveSkillsMonitor.tsx
- WorkflowPanel.tsx
- GitHubRepositoryImportModal.tsx
- SlidePreviewModal.tsx
- TemplateSelectorModal.tsx
- GitHubView.tsx
- ideApi.ts
- FileExplorer.tsx
- AuditPanel.tsx
- McpPanel.tsx
- Skeleton.tsx
- notebook.ts
- CommandPalette.tsx
- SourcePanel.tsx
- TokenCounter.tsx
- Toast.tsx
- DocumentUpload.tsx
- GeneratedDocsPanel.tsx
- NotebookDetail.tsx
- NotebookList.tsx
- AssistantLogsPanel.tsx
- AudioOverviewPanel.tsx
- ScreenShareContext.tsx
- useToken.ts
- SystemLogsPanel.tsx
- ContextMenu.tsx
- GlobalSearch.tsx
- ASTCallGraphExplorer.tsx
- ConfirmDialog.tsx
- CriticalEditConfirm.tsx
- SkillsDocumentation.tsx
- NotesPanel.tsx
- ScheduledTasksPanel.tsx
- StatusBadge.tsx
- global.d.ts
- vite-env.d.ts
- useOrbState.ts
- MermaidDiagram.tsx
- ModelSection.tsx
- WorkspacePublishPanel.tsx
- IdeModal.tsx
- ImagePreview.tsx
- VisualWorkflowBuilder.tsx
- HierarchicalMemorySection.tsx
- QuitConfirmDialog.tsx
- SidebarItem.tsx
- Toggle.tsx
- electron.d.ts
- FixedSizeTree

## God Nodes (most connected - your core abstractions)
1. `../components/ide/RichDocumentViewer.js` - 50 edges
2. `./DocumentsView.js` - 22 edges
3. `../components/ide/GitHubPanel.js` - 21 edges
4. `./SandboxDiffViewer.js` - 19 edges
5. `FileExplorer` - 18 edges
6. `MarketplacePanel()` - 14 edges
7. `../panels/SandboxPanel.js` - 13 edges
8. `ActivityStep` - 12 edges
9. `sanitizeMarkdownHtml()` - 12 edges
10. `WebviewElement` - 11 edges

## Surprising Connections (you probably didn't know these)
- `StatusBar` --indirect_call--> `getAgentTasks()`  [INFERRED]
  src/components/ide/StatusBar.tsx → src/stores/agentActivityStore.ts
- `UnifiedTimeline()` --indirect_call--> `getAgentTasks()`  [INFERRED]
  src/components/ide/UnifiedTimeline.tsx → src/stores/agentActivityStore.ts
- `UnifiedTimeline()` --indirect_call--> `subscribe()`  [INFERRED]
  src/components/ide/UnifiedTimeline.tsx → src/stores/agentActivityStore.ts
- `AgentPanel()` --indirect_call--> `getToolActivities()`  [INFERRED]
  src/components/panels/AgentPanel.tsx → src/stores/agentActivityStore.ts
- `ActivityFeedProps` --references--> `ActivityStep`  [EXTRACTED]
  src/components/ide/ActivityFeed.tsx → src/hooks/useActivity.ts

## Import Cycles
- None detected.

## Communities (200 total, 50 thin omitted)

### Community 0 - "Modal.tsx"
Cohesion: 0.07
Nodes (31): FOOTER_ALIGN, getPortalTarget(), LAYER_Z, Modal, ModalBody(), ModalBodyProps, ModalContext, ModalContextValue (+23 more)

### Community 1 - "AutonomyTimeline.tsx"
Cohesion: 0.12
Nodes (19): autonomyScope(), AutonomyTimeline(), AutonomyTimelineProps, describeEvent(), EVENT_LABELS, eventColor(), EventIcon(), timeAgo() (+11 more)

### Community 2 - "constants.ts"
Cohesion: 0.17
Nodes (7): EXTENDED_ACCENTS, ACCENTS, AuditEntry, CATEGORIES, LANGUAGES, RESPONSE_STYLES, VOICES

### Community 3 - "PM2StatusPanel.tsx"
Cohesion: 0.16
Nodes (17): AppCard(), AppCardProps, cpuColor(), formatMB(), formatUptimeSeconds(), memColor(), PM2StatusPanel(), PM2StatusPanelProps (+9 more)

### Community 4 - "useLiveAPI.ts"
Cohesion: 0.26
Nodes (11): ModifiedFile, ReasoningStep, toolLabel(), useActivity(), LogType, useLiveAPI(), useToken(), ContextSource (+3 more)

### Community 5 - "SkillsPanel.tsx"
Cohesion: 0.40
Nodes (4): iconMap, Skill, SkillsPanel, SkillsPanelProps

### Community 6 - "Field.tsx"
Cohesion: 0.16
Nodes (15): FieldContext, FieldContextValue, FieldGroupProps, FieldProps, Input, INPUT_BASE, inputBaseStyle, inputErrorStyle (+7 more)

### Community 7 - "ObservabilityView.tsx"
Cohesion: 0.17
Nodes (15): ObservabilityView, AgentStat, BarRow(), BudgetConfig, BudgetPanel(), BudgetStatus, Dashboard, DashboardOverview (+7 more)

### Community 8 - "Tabs.tsx"
Cohesion: 0.16
Nodes (13): Tab(), TabPanel(), TabPanelProps, TabProps, Tabs, TabsContext, TabsContextValue, TabsList() (+5 more)

### Community 9 - "IdeView.tsx"
Cohesion: 0.17
Nodes (10): useEditorActions(), NotebooksView, DocumentsView, IdeView(), _importMeta, MonacoEditor, NotebooksView, RichDocumentViewerLazy (+2 more)

### Community 10 - "logger.ts"
Cohesion: 0.17
Nodes (9): consoleWrapper, defaultConfig, devLog(), log, LOG_LEVELS, logger, LoggerConfig, LogLevel (+1 more)

### Community 11 - "TelegramStatusModal.tsx"
Cohesion: 0.17
Nodes (5): TelegramBotInfo, TelegramDockedPanelProps, TelegramStatus, TelegramStatusModal, TelegramStatusModalProps

### Community 12 - "DESIGN_TOKENS.md"
Cohesion: 0.17
Nodes (11): 11. Conventions de composants, 12. Checklist de recette par composant, 16. Critères de validation finale, 17. Références, 1. Principes fondamentaux, 2.0.0 — 20 septembre 2026, 7. Backdrop Blur, Historique (+3 more)

### Community 13 - "AsyncState.tsx"
Cohesion: 0.18
Nodes (6): AsyncEmptyProps, AsyncErrorProps, AsyncLoadingProps, AsyncState, AsyncStateAction, AsyncStateProps

### Community 14 - "MarketplacePanel.tsx"
Cohesion: 0.08
Nodes (48): CATEGORY_ICONS, CATEGORY_LABELS, fmt(), ImportDropzone(), MarketplacePanel(), MarketplacePanelProps, PackageCard(), PackageDetail() (+40 more)

### Community 15 - "main.tsx"
Cohesion: 0.10
Nodes (10): dispatchAgentEvent(), useAgentEventStream(), AppWindow, configuredApiToken, DocumentsView, IdeView, InflightEntry, Layout() (+2 more)

### Community 16 - "audit.md"
Cohesion: 0.12
Nodes (16): 10. Le système multi-agent, 11. Le Brain doit devenir un composant de planification, pas un deuxième runtime, 12. Vérification : passer de “succès technique” à “preuve”, 14. Le mode `auto` doit être beaucoup plus intelligent, 15. La persistance doit devenir obligatoire pour une vraie production, 16. Idempotency, 18. Heartbeat : très bonne base, mais attention, 19. Le vrai “Supervisor” qu'il manque (+8 more)

### Community 17 - "../components/ide/RichDocumentViewer.js"
Cohesion: 0.05
Nodes (27): ../components/ide/RichDocumentViewer.js, AreaChartBlock, BarChartBlock, CardBlock, CardField, CHART_COLORS, CHART_HEIGHTS, ChartDataPoint (+19 more)

### Community 18 - "Button.tsx"
Cohesion: 0.20
Nodes (9): BASE, Button, ButtonProps, ButtonSize, ButtonVariant, SIZE_STYLES, VARIANT_INLINE, VARIANT_STYLES (+1 more)

### Community 19 - "3. Couleurs sémantiques"
Cohesion: 0.20
Nodes (10): 3.1 Tokens existants, 3.2.1 Surfaces interactives (hover / active), 3.2 Tokens subtils, 3.3 Règles, 3. Couleurs sémantiques, Autorisé, Autorisé, Direction visuelle (v2.1.0) (+2 more)

### Community 20 - "MemoriesView.tsx"
Cohesion: 0.28
Nodes (6): MemoriesView, MemoryPanelProps, MemoriesView, MemoriesView(), Memory, timeAgo()

### Community 21 - "useTerminal.ts"
Cohesion: 0.33
Nodes (8): getServerPort(), getTerminalWebSocketUrl(), isElectron(), TerminalActions, TerminalMessage, TerminalSize, TerminalState, useTerminal()

### Community 22 - "15. Outils de vérification"
Cohesion: 0.25
Nodes (8): 15.1 Tailles typographiques arbitraires, 15.2 Couleurs hexadécimales, 15.3 Rayons arbitraires, 15.4 Ombres arbitraires, 15.5 Ancienne librairie d'animation, 15.6 Backdrop blur non standard, 15.7 Valeurs RGB/RGBA en dur, 15. Outils de vérification

### Community 23 - "useWebSocket.ts"
Cohesion: 0.36
Nodes (5): ConnectionStatus, useWebSocket(), UseWebSocketOptions, getAudioContext(), playSessionStartSound()

### Community 24 - "AgentPanel.tsx"
Cohesion: 0.14
Nodes (12): AGENT_ROSTER, AgentGroupCard(), AgentPanelProps, DelegatedTaskCard(), formatArgs(), formatDuration(), getRoleMeta(), ROLE_META (+4 more)

### Community 25 - "getColor"
Cohesion: 0.29
Nodes (7): AreaChartRenderer(), BarChartRenderer(), getColor(), LineChartRenderer(), PieChartRenderer(), ProgressRenderer(), StatGridRenderer()

### Community 27 - "14.1 StatusBadge"
Cohesion: 0.29
Nodes (7): 14.1 StatusBadge, 14.2 Toast, 14. Exemples de migration, Après, Après, Avant, Avant

### Community 28 - "2.2 Règles"
Cohesion: 0.29
Nodes (7): 2.1 Paliers standardisés, 2.2 Règles, 2.3 Poids typographiques, 2. Échelle typographique, Autorisé, Interdit, Migration

### Community 29 - "customSkillsAccess.ts"
Cohesion: 0.38
Nodes (4): supabase, CustomSkill, customSkillsAccessSkill, databaseSkill

### Community 30 - "../components/ide/DiffViewer.js"
Cohesion: 0.50
Nodes (5): ../components/ide/DiffViewer.js, DiffViewer(), DiffViewerProps, getAuthHeaders(), DiffViewer

### Community 31 - "FileIcon.tsx"
Cohesion: 0.50
Nodes (4): EXT_COLOR, FileIcon(), FileIconProps, pickIcon()

### Community 32 - "AgentBuilderPanel.tsx"
Cohesion: 0.09
Nodes (28): AgentBuilderPanel(), AgentBuilderPanelProps, AVAILABLE_TOOLS, AVATAR_OPTIONS, CAPABILITY_PRESETS, COLOR_OPTIONS, EMPTY_DRAFT, MODEL_OPTIONS (+20 more)

### Community 34 - "CreateNotebookModal.tsx"
Cohesion: 0.40
Nodes (3): CreateNotebookModalProps, SPRING_MOMENTUM, SPRING_UI

### Community 35 - "UnifiedSidebar.tsx"
Cohesion: 0.10
Nodes (19): SidebarSectionProps, SubmenuItemProps, AgentStatusBlockProps, AGENT_ITEM_IDS, buildAIMenuItems(), AIMenuItem, AssistantActions, AssistantState (+11 more)

### Community 37 - "NotesCanvas.tsx"
Cohesion: 0.50
Nodes (4): NoteItem, NotesCanvas(), Props, timeAgo()

### Community 38 - "WorkspacePanel.tsx"
Cohesion: 0.60
Nodes (4): getElectronAPI(), webSelectFolder(), WorkspacePanel, WorkspaceState

### Community 39 - "StatusBar.tsx"
Cohesion: 0.16
Nodes (12): getModifierKey(), StatusBar, StatusBarProps, ToolsMenuItem, OptimizationData, timeAgo(), TokenDetailModal(), TokenDetailModalProps (+4 more)

### Community 40 - "IconButton.tsx"
Cohesion: 0.50
Nodes (4): IconButton(), IconButtonProps, IconButtonVariant, iconButtonVariants

### Community 41 - "13. Plan de migration"
Cohesion: 0.25
Nodes (8): 13. Plan de migration, Notebooks, Panels, Phase 1 — Fondations, Phase 2 — Primitives UI, Phase 3 — Coquille applicative, Phase 4 — Modules fonctionnels, Phase 5 — Réglages et modales

### Community 42 - "SidePanel.tsx"
Cohesion: 0.40
Nodes (3): SidePanelMode, SidePanelPosition, SidePanelProps

### Community 43 - "10. Accessibilité"
Cohesion: 0.40
Nodes (5): 10.1 Contraste, 10.2 Focus, 10.3 Couleur, 10.4 Thèmes, 10. Accessibilité

### Community 44 - "4. Classes utilitaires sémantiques"
Cohesion: 0.40
Nodes (5): 4.1 Success, 4.2 Error, 4.3 Warning, 4.4 Info, 4. Classes utilitaires sémantiques

### Community 45 - "5. Rayons"
Cohesion: 0.40
Nodes (5): 5. Rayons, Autorisé, Hiérarchie, Interdit, Règles

### Community 46 - "WebviewElement"
Cohesion: 0.19
Nodes (8): BROWSER_HOME_URL, BrowserPanel(), normalizeUrl(), BrowserPanelProps, WebviewElement, WebviewFailLoadEvent, WebviewNavigateEvent, WebviewTitleEvent

### Community 47 - "ListsView.tsx"
Cohesion: 0.40
Nodes (3): ListsView, SnippetDetails, SnippetSummary

### Community 48 - "McpDirectory.tsx"
Cohesion: 0.28
Nodes (8): authHeaders(), DirectoryMetadata, DirectoryServer, McpDirectory(), McpDirectoryProps, originLabel(), ServerCard(), TransportFilter

### Community 52 - "realtimeCache.ts"
Cohesion: 0.10
Nodes (24): TreeEntry, CacheConfig, CacheEntry, cleanupRealtimeCacheListeners(), DEFAULT_CONFIG, EventCallback, eventCallbacks, FileEvent (+16 more)

### Community 53 - "PdfPreview.tsx"
Cohesion: 0.67
Nodes (3): getAuthHeaders(), PdfPreview(), Props

### Community 56 - "EnvSection.tsx"
Cohesion: 0.22
Nodes (6): EnvApiResponse, EnvFieldType, EnvSectionData, EnvSelectOption, EnvVarMeta, TYPE_ICON

### Community 58 - "P0 — obligatoire"
Cohesion: 0.25
Nodes (8): 21. Priorités exactes, P0.1 — Unifier le runtime, P0.2 — Mission State Machine durable, P0.3 — Action Execution Ledger, P0.4 — Checkpoint + rollback, P0.5 — Evidence Engine, P0.6 — Supervisor central, P0 — obligatoire

### Community 65 - "Règles"
Cohesion: 0.50
Nodes (4): 6. Ombres et élévation, Autorisé, Interdit, Règles

### Community 66 - "8. Animation"
Cohesion: 0.50
Nodes (4): 8.1 Librairie, 8.2 Migration, 8.3 Accessibilité, 8. Animation

### Community 71 - "AutomationView.tsx"
Cohesion: 0.29
Nodes (4): AutomationPanelProps, AutomationView, AutomationView, ScheduledTask

### Community 74 - "TerminalPanel.tsx"
Cohesion: 0.15
Nodes (15): DEFAULT_COMMANDS, ExecutionMode, FavoriteCommand, formatAnsiText(), loadFavoriteCommands(), saveFavoriteCommands(), SearchBar, SearchBarProps (+7 more)

### Community 75 - "TextRenderer"
Cohesion: 0.67
Nodes (3): CodeRenderer(), TextRenderer(), useCopy()

### Community 76 - "AgentFleetPanel.tsx"
Cohesion: 0.09
Nodes (15): AgentFleetPanel(), AgentFleetPanelProps, AgentStat, apiHeaders(), BusMessage, BusMetrics, fetchJSON(), FleetStatus (+7 more)

### Community 86 - "9. États interactifs"
Cohesion: 0.67
Nodes (3): 9. États interactifs, Disabled, Focus

### Community 87 - "./DocumentsView.js"
Cohesion: 0.12
Nodes (15): ./DocumentsView.js, CATEGORY_COLORS, DocumentItem, DocumentsTab(), FactItem, MemoryTab(), ProjectFactItem, RelationItem (+7 more)

### Community 89 - "sanitizeMarkdownHtml.ts"
Cohesion: 0.18
Nodes (13): ChatMarkdown, MarkdownPreview, MarkdownPreviewProps, Props, SourcesSummaryCard(), RenderedContent(), ALLOWED_ATTRIBUTES, ALLOWED_TAGS (+5 more)

### Community 97 - "ChatPanel.tsx"
Cohesion: 0.06
Nodes (38): BreathingDots, BUBBLE_STYLES, ChatMessage, ChatPanel(), ChatPanelProps, clampWithRubberband(), DragSession, InputArea() (+30 more)

### Community 98 - "agentActivityStore.ts"
Cohesion: 0.16
Nodes (23): agentTasks, cleanup(), clearCompletedTasks(), clearCompletedTools(), destroyActivityStore(), FALLBACK_TOOL_TO_AGENT, formatToolLabel(), getAgentForTool() (+15 more)

### Community 100 - "./SandboxDiffViewer.js"
Cohesion: 0.07
Nodes (30): ../panels/SandboxPanel.js, authHeaders(), SandboxPanel(), SandboxPanelProps, SandboxStatus, ./SandboxDiffViewer.js, computeDiff(), computeWordDiff() (+22 more)

### Community 104 - "EditorTabs.tsx"
Cohesion: 0.43
Nodes (5): EditorTabs(), EditorTabsProps, getHostnameDisplay(), fileName(), LANGUAGE_BY_EXT

### Community 105 - "../components/ide/GitHubPanel.js"
Cohesion: 0.11
Nodes (19): ../components/ide/GitHubPanel.js, Commit, CommitDetail, CommitDetailPanel(), CommitFile, FILE_STATUS, GitHubPanel(), GitHubPanelProps (+11 more)

### Community 106 - "SettingsView.tsx"
Cohesion: 0.38
Nodes (5): SettingsView, getActiveLabel(), getSectionDescription(), NAV_GROUPS, SettingsView()

### Community 107 - "getAgentTasks"
Cohesion: 0.27
Nodes (10): AgentActivity, AgentActivityOverlay(), AgentActivityOverlayProps, MissionActivity, AgentsSidebarButton(), AgentsSidebarButtonProps, AgentPanel(), AgentTaskEntry (+2 more)

### Community 108 - "FileExplorerVirtualized.tsx"
Cohesion: 0.05
Nodes (56): buildNodes(), canDropInto(), collator, collectDirChangeCounts(), collectSearchExpanded(), countFiles(), createDiffLookup(), DataNode (+48 more)

### Community 109 - "ide.ts"
Cohesion: 0.32
Nodes (4): useIdeSettings(), DEFAULT_IDE_SETTINGS, IdeSettings, OpenFile

### Community 110 - "useAudio.ts"
Cohesion: 0.60
Nodes (4): floatToPcm16(), getAudioWorkletModuleUrl(), useAudio(), UseAudioOptions

### Community 112 - "22. P1 — autonomie avancée"
Cohesion: 0.29
Nodes (7): 22. P1 — autonomie avancée, P1.1, P1.2, P1.3, P1.4, P1.5, P1.6

### Community 113 - "MissionPanel.tsx"
Cohesion: 0.05
Nodes (50): AUTONOMY_LEVEL_OPTIONS, AutonomyLevelSelectorProps, ActionEntry, ActionRow(), ApprovalCard(), confidenceColor(), confidenceIcon(), decisionBadge() (+42 more)

### Community 114 - "SourceViewer.tsx"
Cohesion: 0.29
Nodes (4): Props, SourceData, TYPE_COLORS, TYPE_ICONS

### Community 115 - "InlineApproval.tsx"
Cohesion: 0.33
Nodes (4): ConfirmRequest, InlineApproval(), InlineApprovalProps, OPERATION_LABELS

### Community 117 - "17. Recovery : il faut distinguer quatre niveaux"
Cohesion: 0.40
Nodes (5): 17. Recovery : il faut distinguer quatre niveaux, Niveau 1 — Retry, Niveau 2 — Repair, Niveau 3 — Replan, Niveau 4 — Escalation

### Community 118 - "9. Le cycle d'apprentissage"
Cohesion: 0.40
Nodes (5): 9. Le cycle d'apprentissage, Learning, Memory, Policy, Strategy

### Community 119 - "TranscriptEntry"
Cohesion: 0.60
Nodes (4): SessionTranscriptPanel, SessionTranscriptPanelProps, timeLabel(), TranscriptEntry

### Community 120 - "useFileSystem.ts"
Cohesion: 0.60
Nodes (4): DiffInfo, replaceDirectoryChildren(), useFileSystem(), getLanguage()

### Community 121 - "BottomDock.tsx"
Cohesion: 0.67
Nodes (3): BottomDock(), BottomDockProps, getBottomDockHeight()

### Community 122 - "../components/panels/VisionPanel.js"
Cohesion: 0.50
Nodes (4): ../components/panels/VisionPanel.js, VisionPanel, VisionPanelProps, VisionPanel

### Community 125 - "13. Le système de permissions est déjà bien pensé"
Cohesion: 0.67
Nodes (3): 13. Le système de permissions est déjà bien pensé, Capability attenuation, Mais il manque une notion essentielle :

### Community 126 - "1. Verdict global"
Cohesion: 0.67
Nodes (3): 1. Verdict global, Mon diagnostic, État actuel de Leanna

### Community 127 - "AgentProgressBar.tsx"
Cohesion: 0.05
Nodes (50): ActivityFeed(), ActivityFeedProps, classifyTool(), deduplicateSteps(), FeedEntry, FeedRow(), getColor(), getIcon() (+42 more)

### Community 128 - "27. Mon plan de transformation"
Cohesion: 0.67
Nodes (3): 27. Mon plan de transformation, Conclusion, Et surtout :

### Community 129 - "useChatPersistence.ts"
Cohesion: 0.53
Nodes (5): getStorageKey(), parseTranscript(), PersistedTranscriptEntry, stripInlineImages(), useChatPersistence()

### Community 130 - "CustomSkillsSection.tsx"
Cohesion: 0.19
Nodes (18): apiCall(), CATEGORIES, CustomSkill, CustomSkillsSection(), extractParamsFromProperties(), fetchAutoSkill(), FormMode, normalizeParams() (+10 more)

### Community 131 - "useSupabaseMemories.ts"
Cohesion: 0.36
Nodes (5): Memory, useSupabaseMemories(), memoryManagerSkill, supabase, getSupabaseClient()

### Community 132 - "5.1 ToolRegistry"
Cohesion: 0.67
Nodes (3): 5.1 ToolRegistry, 5. Ce qui est déjà très bon, À conserver absolument.

### Community 133 - "8. Le deuxième gros problème : autonomie ≠ simple exécution automatique"
Cohesion: 0.67
Nodes (3): 8. Le deuxième gros problème : autonomie ≠ simple exécution automatique, Autonomie, Réaction

### Community 139 - "UserProfileContext.tsx"
Cohesion: 0.13
Nodes (14): AgentRole, AgentsConfig, AIProvider, CustomAgentConfig, DEFAULT_PROFILE, Language, load(), ProfileContext (+6 more)

### Community 140 - "sandboxApi.ts"
Cohesion: 0.20
Nodes (15): cachedGet(), CacheEntry, CacheKey, caches, cleanupSandboxListeners(), fetchWithRetry(), getAuthHeaders(), handleSandboxChanged() (+7 more)

### Community 144 - "ChatCards.tsx"
Cohesion: 0.16
Nodes (12): actionColors, badgeStyles(), cardStyles, ChangesSummaryProps, CommandCard(), CommandCardProps, DiffCardProps, FileCard() (+4 more)

### Community 145 - "HistoryView.tsx"
Cohesion: 0.19
Nodes (12): HistoryPanelProps, HistoryView, HistoryView, Conversation, ConversationMessage, formatDate(), formatMessageContent(), getDateLabel() (+4 more)

### Community 146 - "SystemHealthDashboard.tsx"
Cohesion: 0.18
Nodes (12): AuditReport, formatBytes(), formatUptime(), HealthScoreRing(), MemBar(), memColor(), relativeTime(), scoreColor() (+4 more)

### Community 153 - "EmptyEditorState.tsx"
Cohesion: 0.20
Nodes (11): CompactActionCard, EmptyEditorState, EmptyEditorStateProps, ENTRANCE_SPRING, Kbd, QuickLink, useFocusTrap(), useGitInfo() (+3 more)

### Community 154 - "GeneratePanel.tsx"
Cohesion: 0.21
Nodes (12): CODE_THEMES, DOC_TYPES, GeneratedDoc, GeneratePanel(), Props, QueuedGeneration, renderGeneratedContent(), renderInfographicContent() (+4 more)

### Community 155 - "ImportToNotebookExample.tsx"
Cohesion: 0.22
Nodes (6): UseNotebookIdExample(), NotebookSummary, useEnsureNotebook(), UseEnsureNotebookOptions, UseEnsureNotebookResult, useNotebookId()

### Community 156 - "WorkflowsPanel.tsx"
Cohesion: 0.26
Nodes (13): ActiveRunTracker(), formatElapsed(), formatRelativeTime(), statusColor(), statusIcon(), statusLabel(), stepStatusIcon(), WorkflowRunState (+5 more)

### Community 159 - "LiveSkillsMonitor.tsx"
Cohesion: 0.21
Nodes (11): fmtDuration(), fmtTime(), LiveSkillsMonitor(), SKILL_META, SkillMeta, SkillRow(), SkillRowProps, SkillUsage (+3 more)

### Community 161 - "WorkflowPanel.tsx"
Cohesion: 0.23
Nodes (12): ActiveRun, formatElapsed(), statusColor(), statusIcon(), statusLabel(), StepRunState, stepStatusIcon(), timeAgo() (+4 more)

### Community 167 - "GitHubRepositoryImportModal.tsx"
Cohesion: 0.17
Nodes (10): DEFAULT_CODE_EXTENSIONS, DEFAULT_EXTENSIONS, GitHubRepositoryImportModalProps, GitHubUser, LANGUAGE_COLORS, Notebook, PRESET_EXTENSIONS, Repository (+2 more)

### Community 168 - "SlidePreviewModal.tsx"
Cohesion: 0.17
Nodes (10): DENSITIES, DensityKey, GeneratedDoc, Props, RatioKey, RATIOS, ThemeKey, THEMES (+2 more)

### Community 169 - "TemplateSelectorModal.tsx"
Cohesion: 0.30
Nodes (9): ICON_MAP, Props, TemplateSelectorModal(), DOCUMENT_TEMPLATES, DocumentTemplate, extractVariables(), getDefaultVariableValues(), renderTemplate() (+1 more)

### Community 170 - "GitHubView.tsx"
Cohesion: 0.20
Nodes (11): GitHubView, Commit, CommitDetail, CommitFile, GitHubView(), Issue, openExternal(), PullRequest (+3 more)

### Community 177 - "ideApi.ts"
Cohesion: 0.06
Nodes (33): MentionDropdownProps, ChatMessage, Citation, NotebookChat(), Props, QueuedChatRequest, renderInlineMarkdown(), renderMessageContent() (+25 more)

### Community 178 - "FileExplorer.tsx"
Cohesion: 0.27
Nodes (8): countEntries(), FileExplorer, FileExplorerProps, filterTree(), nextSort(), sortEntries(), sortLabel(), SortMode

### Community 180 - "AuditPanel.tsx"
Cohesion: 0.20
Nodes (9): AuditPanel, AuditPanelProps, scoreColor(), statusIcon(), stepIcon(), AuditReport, AuditStep, AuditStepStatus (+1 more)

### Community 181 - "McpPanel.tsx"
Cohesion: 0.20
Nodes (10): EMPTY_FORM, formatTimestamp(), McpMetric, McpMetricsSummary, McpPanel(), McpServer, McpTool, NewServerForm (+2 more)

### Community 184 - "notebook.ts"
Cohesion: 0.20
Nodes (9): AudioOverview, ChatMessage, Citation, GeneratedDoc, NotebookData, NotebookSummary, NoteItem, SourceItem (+1 more)

### Community 194 - "CommandPalette.tsx"
Cohesion: 0.31
Nodes (8): CommandEntry, CommandPalette(), CommandPaletteProps, FileEntry, fuzzyMatch(), fuzzyScore(), getAuthHeaders(), PaletteMode

### Community 195 - "SourcePanel.tsx"
Cohesion: 0.22
Nodes (7): Props, SourceItem, SPRING_SNAPPY, SPRING_UI, TYPE_COLORS, TYPE_ICONS, UploadFileStatus

### Community 197 - "TokenCounter.tsx"
Cohesion: 0.36
Nodes (5): formatNumber(), OptimizationData, timeAgo(), TokenCounter(), TokenUsageRow()

### Community 198 - "Toast.tsx"
Cohesion: 0.22
Nodes (6): COLORS, ICONS, ToastContext, ToastContextValue, ToastItem, ToastType

### Community 204 - "DocumentUpload.tsx"
Cohesion: 0.25
Nodes (4): DocumentResult, DocumentUploadProps, DropZoneOverlayProps, UseDocumentDropOptions

### Community 206 - "GeneratedDocsPanel.tsx"
Cohesion: 0.29
Nodes (7): DOC_TYPES, GeneratedDoc, GeneratedDocsPanel(), Props, REPORT_TYPES, SourceItem, useFluidTransition()

### Community 207 - "NotebookDetail.tsx"
Cohesion: 0.32
Nodes (7): NotebookData, NotebookDetail(), NoteEditorCenter(), Props, StudioTab, Tab, useFluidTransition()

### Community 208 - "NotebookList.tsx"
Cohesion: 0.29
Nodes (7): NotebookList(), NotebookSummary, Props, SortBy, SPRING_MOMENTUM, SPRING_UI, timeAgo()

### Community 209 - "AssistantLogsPanel.tsx"
Cohesion: 0.29
Nodes (7): AssistantLogsPanel(), AssistantLogsPanelProps, formatTime(), LEVEL_COLORS, LogLevel, LogScope, RuntimeLogEntry

### Community 210 - "AudioOverviewPanel.tsx"
Cohesion: 0.33
Nodes (4): AudioOverview, Props, Source, Tone

### Community 211 - "ScreenShareContext.tsx"
Cohesion: 0.29
Nodes (5): ScreenShareContext, ScreenShareContextValue, ScreenShareProviderProps, ScreenShareState, ScreenSource

### Community 217 - "useToken.ts"
Cohesion: 0.21
Nodes (10): formatTokens(), LEVEL_STYLES, PromptContextIndicator(), PromptContextIndicatorProps, ContextAlertLevel, INITIAL_PROMPT_CONTEXT, INITIAL_TOKEN_USAGE, PromptContextState (+2 more)

### Community 220 - "SystemLogsPanel.tsx"
Cohesion: 0.40
Nodes (5): LOG_COLORS, LOG_PREFIXES, SystemLogsPanel, SystemLogsPanelProps, LogEntry

### Community 221 - "ContextMenu.tsx"
Cohesion: 0.33
Nodes (6): ClipboardEntry, ContextMenu(), ContextMenuAction, ContextMenuProps, ContextTarget, getActions()

### Community 222 - "GlobalSearch.tsx"
Cohesion: 0.33
Nodes (5): getAuthHeaders(), GlobalSearch(), GlobalSearchProps, SearchMatch, SearchResultGroup

### Community 224 - "ASTCallGraphExplorer.tsx"
Cohesion: 0.29
Nodes (5): ASTStats, CallChainNode, CallChainResult, CallEdge, FunctionItem

### Community 225 - "ConfirmDialog.tsx"
Cohesion: 0.29
Nodes (4): ConfirmDialogContext, ConfirmDialogContextValue, ConfirmDialogState, ConfirmOptions

### Community 227 - "CriticalEditConfirm.tsx"
Cohesion: 0.33
Nodes (4): ConfirmRequest, CriticalEditConfirm(), OPERATION_LABELS, Props

### Community 228 - "SkillsDocumentation.tsx"
Cohesion: 0.22
Nodes (6): ICON_MAP, SkillDoc, SkillsDocResponse, SkillsDocumentationProps, ToolDoc, ToolParamDoc

### Community 229 - "NotesPanel.tsx"
Cohesion: 0.40
Nodes (5): NoteEditorData, NoteItem, NotesPanel(), Props, timeAgo()

### Community 230 - "ScheduledTasksPanel.tsx"
Cohesion: 0.47
Nodes (5): formatInterval(), formatRelative(), ScheduledTasksPanel, ScheduledTasksPanelProps, ScheduledTaskViewModel

### Community 231 - "StatusBadge.tsx"
Cohesion: 0.33
Nodes (4): STATUS_MAP, StatusBadgeProps, StatusConfig, StatusType

### Community 232 - "global.d.ts"
Cohesion: 0.33
Nodes (4): CustomEventMap, react-window-tree, TreeNodeData, Window

### Community 233 - "vite-env.d.ts"
Cohesion: 0.25
Nodes (7): *.jpeg, *.jpg, *.mp4, *.png, *.svg, *.webm, *.webp

### Community 234 - "useOrbState.ts"
Cohesion: 0.47
Nodes (4): FloatingOrb(), OrbState, OrbStatus, useOrbState()

### Community 237 - "MermaidDiagram.tsx"
Cohesion: 0.67
Nodes (3): initMermaid(), MermaidDiagram, Props

### Community 247 - "ImagePreview.tsx"
Cohesion: 0.67
Nodes (3): getAuthHeaders(), ImagePreview(), Props

### Community 248 - "VisualWorkflowBuilder.tsx"
Cohesion: 0.40
Nodes (3): COMMON_ACTIONS, VisualWorkflowBuilderProps, WorkflowStepForm

### Community 249 - "HierarchicalMemorySection.tsx"
Cohesion: 0.33
Nodes (4): HierarchicalMemoryItem, HierarchicalStats, HierarchicalTier, TIER_COLORS

## Knowledge Gaps
- **799 isolated node(s):** `EVENT_LABELS`, `AutonomyTimelineProps`, `ConfirmRequest`, `OPERATION_LABELS`, `Props` (+794 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1082 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **50 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `../components/ide/RichDocumentViewer.js` connect `../components/ide/RichDocumentViewer.js` to `sanitizeMarkdownHtml.ts`, `getColor`, `TextRenderer`, `IdeView.tsx`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `./DocumentsView.js` connect `./DocumentsView.js` to `IdeView.tsx`, `main.tsx`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `FileExplorer` (e.g. with `nextSort()` and `readPrefs()`) actually correct?**
  _`FileExplorer` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `EVENT_LABELS`, `AutonomyTimelineProps`, `ConfirmRequest` to the rest of the system?**
  _799 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Modal.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07394957983193277 - nodes in this community are weakly interconnected._
- **Should `AutonomyTimeline.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11857707509881422 - nodes in this community are weakly interconnected._
- **Should `MarketplacePanel.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07966457023060797 - nodes in this community are weakly interconnected._