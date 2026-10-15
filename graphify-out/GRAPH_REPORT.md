# Graph Report - Leanna-ide  (2026-10-15)

## Corpus Check
- 375 files · ~390,347 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2656 nodes · 4117 edges · 218 communities (148 shown, 54 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 92 edges (avg confidence: 0.84)
- Token cost: 116,012 input · 0 output

## Community Hubs (Navigation)
- Virtualized File Explorer
- Marketplace Panel & Store
- Sandbox Diff & Workspace
- Rich Document Viewer
- API Client & Notebook Data
- Notebook Sources & Motion Types
- Agent Activity Store
- Design Tokens & Agentic Audit
- Modal & Overlay System
- Chat Composer & Thread
- Custom Agent Builder
- SSE Streaming & API Types
- Notebook Generation Panel
- Code Impact Model
- Mission Panel Approvals
- Chat Header & Export
- Realtime Cache
- Empty Editor Home
- Agent Fleet Panel
- Global Sidebar Navigation
- Status Bar & Activity Overlay
- Budget Panel & Metrics
- App Entry & Agent Events
- Live API & Tokens
- Automation & Swarm Views
- Mission Detail View
- Mission Timeline Pilotage
- Activity Phases & Progress
- Agent Roster Panel
- Autonomy Timeline
- Agent Activity Types
- Interrupted Mission Resume
- PM2 Process Status
- Pending Approvals
- Mission Control View
- GitHub Panel (IDE)
- Browser Webview Types
- Chat Markdown & Sources
- Proactive Suggestions
- Audio Generation & TTS
- Notebook Live Context
- Documents View
- Input Area & Mentions
- Notebook UI Primitives
- Custom Skills Settings
- Terminal Panel
- Form Field Components
- User Profile Context
- Editor Tabs & File System
- Code Map Impact Hook
- AI & Appearance Settings
- Activity Tool Categories
- Chat Panel Core
- Skill Picker
- Token Detail & Prompts
- Chat Theme & Draggable Panel
- History View
- GitHub Repo Import
- System Health Dashboard
- Tabs Component
- Sandbox API Cache
- Autonomy Safeguards
- Floating Orb Mascot
- Markdown Preview & Sanitize
- Slide Preview Modal
- Workflows Panel
- Vite Asset Typings
- Chat Minimap
- Live Skills Monitor
- Workflow Run Panel
- Startup Project Modal
- Logger
- Explainability View
- Mission Simulation View
- Agent Status Bar
- Telegram Status Modal
- Browser Tabs & Extensions
- Document Templates
- Chat Persistence
- GitHub View
- IDE API Client
- Mission Timeline Types
- Monaco Prompt Editor
- Env Setup Keys
- File Explorer (Classic)
- Browser Tab View
- MCP Panel
- Env Settings Section
- Async State UI
- Skeleton Loaders
- Behavior Profiles
- Browser Toolbar & Profiles
- Button Component
- Notebook Types
- Mermaid Diagrams
- Chat Message List
- Inline Diff Editor
- Inline Edits Parser
- Command Palette
- Global Search
- Memory Panel
- Browser Tab Handle
- MCP Directory
- Settings View
- Prompts Section
- Skills Documentation
- Toast Notifications
- Terminal Hook
- IDE Remote Bridge
- GlobalCommandPalette
- ChangeLogPanel
- ChatMessage
- DocumentUpload
- AssistantLogsPanel
- types
- ScreenShareContext
- sound
- helpers
- ContextMenu
- PromptInspectorPanel
- ASTCallGraphExplorer
- KnowledgeHealthDashboard
- NotebookVoicePanel
- useBrowserProfiles
- SelfRootSection
- ConfirmDialog
- useEnsureNotebook
- customSkillsAccess
- electron Typings
- CriticalEditConfirm
- InlineApproval
- ScheduledTasksPanel
- HierarchicalMemorySection
- StatusBadge
- global Typings
- DiffViewer
- ExplorerDock
- FileIcon
- BrowserTabStrip
- AgentsSection
- ModelSection
- IconButton
- SidePanel
- VisualWorkflowBuilder
- useActivity
- NotebooksView
- main
- index
- setup
- WorkspacePublishPanel
- BottomDock
- EmptyState
- IdeModal
- ImagePreview
- LeannaIgnoreModal
- ModelPickerModal
- NotebookPickerModal
- PdfPreview
- ShortcutsModal
- InfographicModal
- renderInfographic
- OpenRouterSection
- ProfileSection
- TelegramSection
- TokensSection
- AgentTaskCard
- LiveAPIContext
- ThemeContext
- BreathingDots
- MenuButton
- SearchBar
- Toast
- RightDock
- SelfEditBanner
- MissionCreatedPrompt
- BrowserExtensionsMenu
- BrowserExternalOverlay
- BrowserFindBar
- MissionPanel
- MissionPanel Tests
- DataSection
- SystemPromptSection
- QuitConfirmDialog
- SkillsDocModal
- ConnectionBanner
- EmptyState (2)
- Panel
- Toggle
- Tooltip
- ViewHeader
- WebcamCapture
- fetchDedup
- react-window-tree Typings
- QuickPrompts
- ShortcutsOverlay
- CommandPalette.impact Tests
- AudioOverviewPanel Tests
- Agentic Ledger & State Machine
- GeneratePanel Tests
- MissionDetail Tests
- AmbientBackdrop
- global Typings (2)

## God Nodes (most connected - your core abstractions)
1. `../components/ide/RichDocumentViewer.js` - 52 edges
2. `./SandboxDiffViewer.js` - 32 edges
3. `./MissionControlView.js` - 29 edges
4. `viewHeaderProps()` - 25 edges
5. `./DocumentsView.js` - 24 edges
6. `WebviewElement` - 23 edges
7. `./MissionTimelineView.js` - 23 edges
8. `api()` - 22 edges
9. `apiVoid()` - 22 edges
10. `FileExplorer` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Evidence Engine / EvidenceBundle` --semantically_similar_to--> `Design Violation Grep Checks`  [AMBIGUOUS] [semantically similar]
  src/components/notebooks/audit.md → src/DESIGN_TOKENS.md
- `UnifiedTimeline()` --indirect_call--> `getAgentTasks()`  [INFERRED]
  src/components/ide/UnifiedTimeline.tsx → src/stores/agentActivityStore.ts
- `UnifiedTimeline()` --indirect_call--> `subscribe()`  [INFERRED]
  src/components/ide/UnifiedTimeline.tsx → src/stores/agentActivityStore.ts
- `GitHubRepositoryImportModal()` --calls--> `errorMessage()`  [EXTRACTED]
  src/components/notebooks/GitHubRepositoryImportModal.tsx → src/components/notebooks/utils.ts
- `AgentFleetPanel()` --indirect_call--> `getAgentTasks()`  [INFERRED]
  src/components/panels/AgentFleetPanel.tsx → src/stores/agentActivityStore.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **P0 Core Industrialization (runtime, state machine, ledger, rollback, evidence, supervisor)** — src_components_notebooks_audit_canonical_agentic_runtime, src_components_notebooks_audit_durable_mission_state_machine, src_components_notebooks_audit_action_execution_ledger, src_components_notebooks_audit_checkpoint_rollback, src_components_notebooks_audit_evidence_engine, src_components_notebooks_audit_leanna_supervisor [EXTRACTED 1.00]
- **Standardized Visual Primitives enforced by migration checklist** — src_design_tokens_typography_scale, src_design_tokens_semantic_color_tokens, src_design_tokens_radius_scale, src_design_tokens_shadow_elevation, src_design_tokens_backdrop_blur_rule, src_design_tokens_component_migration_checklist [EXTRACTED 1.00]
- **Motion Pro Animation System** — src_design_tokens_motion_pro_layer, src_design_tokens_motion_timing_tokens, src_design_tokens_pointer_spotlight, src_design_tokens_ambient_backdrop, src_design_tokens_lea_utility_classes [EXTRACTED 1.00]

## Communities (218 total, 54 thin omitted)

### Community 0 - "Virtualized File Explorer"
Cohesion: 0.05
Nodes (60): ancestorsOf(), buildNodes(), canDropInto(), collator, collectDirChangeCounts(), collectSearchExpanded(), countFiles(), createDiffLookup() (+52 more)

### Community 1 - "Marketplace Panel & Store"
Cohesion: 0.08
Nodes (48): CATEGORY_ICONS, CATEGORY_LABELS, fmt(), ImportDropzone(), MarketplacePanel(), MarketplacePanelProps, PackageCard(), PackageDetail() (+40 more)

### Community 2 - "Sandbox Diff & Workspace"
Cohesion: 0.05
Nodes (43): ../panels/SandboxPanel.js, authHeaders(), FILE_STATUS_META, FileStatus, relativeTime(), SandboxPanel(), SandboxPanelProps, SandboxStatus (+35 more)

### Community 3 - "Rich Document Viewer"
Cohesion: 0.05
Nodes (38): ../components/ide/RichDocumentViewer.js, AreaChartBlock, AreaChartRenderer(), BarChartBlock, BarChartRenderer(), CardBlock, CardField, CHART_COLORS (+30 more)

### Community 4 - "API Client & Notebook Data"
Cohesion: 0.07
Nodes (37): api(), ApiError, ApiOptions, apiVoid(), extractErrorMessage(), safeJson(), useResource(), UseResourceOptions (+29 more)

### Community 5 - "Notebook Sources & Motion Types"
Cohesion: 0.08
Nodes (32): ScrimStyle, SpringTransition, TapScaleProps, Props, SourcePanel(), ACCEPTED_EXTENSIONS, SourceItem, TYPE_COLORS (+24 more)

### Community 6 - "Agent Activity Store"
Cohesion: 0.08
Nodes (39): buildImpactRef(), toWorkspacePath(), ../components/panels/VisionPanel.js, VisionPanel, VisionPanelProps, useEditorActions(), useIdeSettings(), SandboxFileEvent (+31 more)

### Community 7 - "Design Tokens & Agentic Audit"
Cohesion: 0.06
Nodes (43): Leanna Agentic Architecture Audit, AgentBrain as Planning Component (not a second runtime), AgenticRuntime as Canonical Agentic Kernel, Capability Attenuation, Checkpoint + Rollback (transactional execution), Evidence Engine / EvidenceBundle, Four-Level Recovery (Retry/Repair/Replan/Escalate), Graduated Autonomy / Risk Engine (+35 more)

### Community 8 - "Modal & Overlay System"
Cohesion: 0.06
Nodes (37): FOOTER_ALIGN, getPortalTarget(), LAYER_Z, Modal, ModalBody(), ModalBodyProps, ModalContext, ModalContextValue (+29 more)

### Community 9 - "Chat Composer & Thread"
Cohesion: 0.09
Nodes (25): ChatThread, Props, Personality, Props, MessageItem, Props, Props, CitationLinks (+17 more)

### Community 10 - "Custom Agent Builder"
Cohesion: 0.09
Nodes (28): AgentBuilderPanel(), AgentBuilderPanelProps, AVAILABLE_TOOLS, AVATAR_OPTIONS, CAPABILITY_PRESETS, COLOR_OPTIONS, EMPTY_DRAFT, MODEL_OPTIONS (+20 more)

### Community 11 - "SSE Streaming & API Types"
Cohesion: 0.12
Nodes (28): streamSSE(), StreamSSEOptions, ChatMessage, ChatStreamData, Citation, DeepDiveStreamData, GeneratedDoc, GenerateStreamData (+20 more)

### Community 12 - "Notebook Generation Panel"
Cohesion: 0.12
Nodes (26): GeneratePanel(), Props, Suggestion, CODE_THEMES, DOC_TYPES, DocTypeEntry, getDocTypeColor(), getDocTypeLabel() (+18 more)

### Community 13 - "Code Impact Model"
Cohesion: 0.13
Nodes (27): buildTestCommands(), countImpactedSources(), DistanceGroup, distanceLabel(), firstLineFor(), groupByDistance(), importedSymbolRef(), isAnalyzableTarget() (+19 more)

### Community 14 - "Mission Panel Approvals"
Cohesion: 0.09
Nodes (28): ActionEntry, ActionRow(), ApprovalCard(), confidenceColor(), confidenceIcon(), decisionBadge(), DONE_STATUSES, formatDuration() (+20 more)

### Community 15 - "Chat Header & Export"
Cohesion: 0.12
Nodes (26): ChatHeaderProps, ActivityLike, buildJson(), buildMarkdown(), buildPrintableHtml(), computeStats(), ConversationStats, countWords() (+18 more)

### Community 16 - "Realtime Cache"
Cohesion: 0.08
Nodes (26): TreeEntry, CacheConfig, CacheEntry, cleanupRealtimeCacheListeners(), DEFAULT_CONFIG, EventCallback, eventCallbacks, FileEvent (+18 more)

### Community 17 - "Empty Editor Home"
Cohesion: 0.09
Nodes (24): ActionCard, EmptyEditorState, EmptyEditorStateProps, GeminiStatus, GitInfo, IconType, INSIGHT_COLS, INSIGHT_STYLE (+16 more)

### Community 18 - "Agent Fleet Panel"
Cohesion: 0.08
Nodes (18): AgentFleetPanel(), AgentFleetPanelProps, AgentStat, apiHeaders(), BusMessage, BusMetrics, fetchJSON(), FleetStatus (+10 more)

### Community 19 - "Global Sidebar Navigation"
Cohesion: 0.09
Nodes (21): buildToolGroups(), Ctrl(), GlobalSidebar(), GlobalSidebarProps, IconButton(), NavButton(), SidebarContext, SidebarCtx (+13 more)

### Community 20 - "Status Bar & Activity Overlay"
Cohesion: 0.11
Nodes (19): AgentActivityOverlay(), AgentActivityOverlayProps, MissionActivity, CONNECTION_LABEL, getElectronQuitAPI(), getModifierKey(), StatusBar, StatusBarProps (+11 more)

### Community 21 - "Budget Panel & Metrics"
Cohesion: 0.15
Nodes (21): BudgetPanel(), BarRow(), failureColor(), fmt(), fmtCost(), fmtDuration(), fmtUptime(), timeAgo() (+13 more)

### Community 22 - "App Entry & Agent Events"
Cohesion: 0.09
Nodes (10): dispatchAgentEvent(), useAgentEventStream(), usePointerSpotlight(), AppWindow, configuredApiToken, IdeView, InflightEntry, Layout() (+2 more)

### Community 23 - "Live API & Tokens"
Cohesion: 0.12
Nodes (23): LogEntry, LogType, useLiveAPI(), ContextAlertLevel, INITIAL_PROMPT_CONTEXT, INITIAL_TOKEN_USAGE, PromptContextState, TokenUsage (+15 more)

### Community 24 - "Automation & Swarm Views"
Cohesion: 0.09
Nodes (21): AutomationPanelProps, AutomationView, viewHeaderProps(), AutomationView, ListsView, ./AgentSwarmView.js, AgentSwarmView(), PRESETS (+13 more)

### Community 25 - "Mission Detail View"
Cohesion: 0.12
Nodes (22): apiHeaders(), clock(), countBy(), DelegationCard(), ExecutionTrace, FileList(), formatMs(), LaunchState (+14 more)

### Community 26 - "Mission Timeline Pilotage"
Cohesion: 0.09
Nodes (19): PilotageView, missionApi, ./MissionTimelineView.js, EVENT_META, humanDuration(), MissionListItem, MissionPickerItem(), MissionTimeline (+11 more)

### Community 27 - "Activity Phases & Progress"
Cohesion: 0.16
Nodes (18): Phase, PHASE_META, PHASE_ORDER, toolToPhase(), AgentProgressBar(), AgentProgressBarProps, StepFilter, COMPLEXITY_LABEL (+10 more)

### Community 28 - "Agent Roster Panel"
Cohesion: 0.12
Nodes (16): AGENT_ROSTER, AgentGroupCard(), AgentPanelProps, DelegatedTab(), DelegatedTaskCard(), formatArgs(), formatDuration(), getRoleMeta() (+8 more)

### Community 29 - "Autonomy Timeline"
Cohesion: 0.11
Nodes (19): autonomyScope(), AutonomyTimeline(), AutonomyTimelineProps, describeEvent(), EVENT_LABELS, eventColor(), EventIcon(), timeAgo() (+11 more)

### Community 30 - "Agent Activity Types"
Cohesion: 0.18
Nodes (15): AgentActivity, AgentTaskEntry, getAgentDisplayName(), ToolActivityEntry, formatClock(), formatDuration(), MissionActivity, MissionEventLog (+7 more)

### Community 31 - "Interrupted Mission Resume"
Cohesion: 0.15
Nodes (21): InterruptedMissionsSection, finalizeGoals(), fromServer(), MissionPanel(), sortMissions(), clearResumeConfirmation(), confirmations, emit() (+13 more)

### Community 32 - "PM2 Process Status"
Cohesion: 0.16
Nodes (17): AppCard(), AppCardProps, cpuColor(), formatMB(), formatUptimeSeconds(), memColor(), PM2StatusPanel(), PM2StatusPanelProps (+9 more)

### Community 33 - "Pending Approvals"
Cohesion: 0.16
Nodes (20): approvals, clearPendingApproval(), emit(), EMPTY, ensureInitialized(), ensureSweeper(), getServerSnapshot(), getSnapshot() (+12 more)

### Community 34 - "Mission Control View"
Cohesion: 0.11
Nodes (17): ./MissionControlView.js, ActionStatus, BriefingReport, DiagnoseResult, DIMENSION_LABELS, HealthDimension, HealthDimensionsCard(), HealthGlobalCard() (+9 more)

### Community 35 - "GitHub Panel (IDE)"
Cohesion: 0.11
Nodes (19): ../components/ide/GitHubPanel.js, Commit, CommitDetail, CommitDetailPanel(), CommitFile, FILE_STATUS, GitHubPanel(), GitHubPanelProps (+11 more)

### Community 36 - "Browser Webview Types"
Cohesion: 0.15
Nodes (3): BrowserPanel(), normalizeUrl(), WebviewElement

### Community 37 - "Chat Markdown & Sources"
Cohesion: 0.13
Nodes (14): ChatMarkdown, ChatMarkdownProps, Props, RenderedContent(), SourceData, TYPE_COLORS, TYPE_ICONS, ensureConfigured() (+6 more)

### Community 38 - "Proactive Suggestions"
Cohesion: 0.14
Nodes (14): InputAreaProps, basename(), buildProactiveSuggestions(), endsWithOffer(), ProactiveSuggestion, STARTER_SUGGESTIONS, STARTERS, SuggestionKind (+6 more)

### Community 39 - "Audio Generation & TTS"
Cohesion: 0.20
Nodes (13): TtsStreamData, AudioGenerator(), optionClass(), Props, Props, AudioOverview, AudioSource, Tone (+5 more)

### Community 40 - "Notebook Live Context"
Cohesion: 0.13
Nodes (15): GeneratedDocInfo, NotebookLive, NotebookLiveContext, NotebookLiveContextValue, NotebookLiveProvider(), NotebookVoiceConfig, GeneratedDocInfo, NotebookLiveStatus (+7 more)

### Community 41 - "Documents View"
Cohesion: 0.12
Nodes (17): DocumentsView, ./DocumentsView.js, CATEGORY_COLORS, DocumentItem, DocumentsTab(), FactItem, MemoryTab(), ProjectFactItem (+9 more)

### Community 42 - "Input Area & Mentions"
Cohesion: 0.16
Nodes (10): InputArea, InputAreaHandle, setCursorPosition(), MentionDropdownProps, SlashCommandDropdownProps, MentionSuggestion, useFileMention(), AVAILABLE_SKILLS (+2 more)

### Community 43 - "Notebook UI Primitives"
Cohesion: 0.11
Nodes (13): BUTTON_VARIANT, NbButton, NbButtonProps, NbButtonSize, NbButtonVariant, NbEmptyStateProps, NbIconButton, NbIconButtonProps (+5 more)

### Community 44 - "Custom Skills Settings"
Cohesion: 0.19
Nodes (18): apiCall(), CATEGORIES, CustomSkill, CustomSkillsSection(), extractParamsFromProperties(), fetchAutoSkill(), FormMode, normalizeParams() (+10 more)

### Community 45 - "Terminal Panel"
Cohesion: 0.14
Nodes (17): DEFAULT_COMMANDS, deriveShellLabel(), ExecutionMode, FavoriteCommand, formatAnsiText(), loadFavoriteCommands(), saveFavoriteCommands(), SearchBar (+9 more)

### Community 46 - "Form Field Components"
Cohesion: 0.16
Nodes (15): FieldContext, FieldContextValue, FieldGroupProps, FieldProps, Input, INPUT_BASE, inputBaseStyle, inputErrorStyle (+7 more)

### Community 47 - "User Profile Context"
Cohesion: 0.12
Nodes (16): AgentRole, AgentsConfig, AIProvider, CustomAgentConfig, DEFAULT_PROFILE, Language, load(), ProfileContext (+8 more)

### Community 48 - "Editor Tabs & File System"
Cohesion: 0.20
Nodes (12): EditorTabs(), EditorTabsProps, getHostnameDisplay(), DiffInfo, replaceDirectoryChildren(), useFileSystem(), DEFAULT_IDE_SETTINGS, IdeSettings (+4 more)

### Community 49 - "Code Map Impact Hook"
Cohesion: 0.16
Nodes (9): hookState, authHeaders(), cache, cacheGet(), cacheSet(), __clearImpactCache(), CodeMapImpactState, useCodeMapImpact() (+1 more)

### Community 50 - "AI & Appearance Settings"
Cohesion: 0.16
Nodes (8): EXTENDED_ACCENTS, ACCENTS, AuditEntry, CATEGORIES, FONTS, LANGUAGES, RESPONSE_STYLES, VOICES

### Community 51 - "Activity Tool Categories"
Cohesion: 0.16
Nodes (13): CAT_COLOR, CAT_LABEL, CatIcon, formatMs(), getCat(), msBetween(), msElapsed(), stepDuration() (+5 more)

### Community 52 - "Chat Panel Core"
Cohesion: 0.28
Nodes (12): ChatPanel(), deriveModifiedFiles(), STORAGE_KEYS, useChangeLog(), useChatScroll(), UseChatScrollOptions, useChatSearch(), useMessageQueue() (+4 more)

### Community 53 - "Skill Picker"
Cohesion: 0.19
Nodes (12): CATEGORY_ICONS, getCategoryIcon(), SkillPicker(), SkillPickerProps, StatusRowProps, SystemModal(), SystemModalProps, TelegramInfo (+4 more)

### Community 54 - "Token Detail & Prompts"
Cohesion: 0.21
Nodes (13): OptimizationData, timeAgo(), TokenDetailModal(), TokenDetailModalProps, CATEGORY_LABELS, CATEGORY_ORDER, estimateTokens(), NotebookPrompt (+5 more)

### Community 55 - "Chat Theme & Draggable Panel"
Cohesion: 0.19
Nodes (12): BUBBLE_STYLES, CHAR_LIMIT, DRAG_HYSTERESIS, EDGE_MARGIN, MAX_WIDTH, MIN_WIDTH, RADII, clampWithRubberband() (+4 more)

### Community 56 - "History View"
Cohesion: 0.19
Nodes (12): HistoryPanelProps, HistoryView, HistoryView, Conversation, ConversationMessage, formatDate(), formatMessageContent(), getDateLabel() (+4 more)

### Community 57 - "GitHub Repo Import"
Cohesion: 0.14
Nodes (13): ./GitHubRepositoryImportModal.js, DEFAULT_CODE_EXTENSIONS, DEFAULT_EXTENSIONS, GitHubRepositoryImportModal(), GitHubRepositoryImportModalProps, GitHubUser, LANGUAGE_COLORS, Notebook (+5 more)

### Community 58 - "System Health Dashboard"
Cohesion: 0.18
Nodes (12): AuditReport, formatBytes(), formatUptime(), HealthScoreRing(), MemBar(), memColor(), relativeTime(), scoreColor() (+4 more)

### Community 59 - "Tabs Component"
Cohesion: 0.16
Nodes (13): Tab(), TabPanel(), TabPanelProps, TabProps, Tabs, TabsContext, TabsContextValue, TabsList() (+5 more)

### Community 60 - "Sandbox API Cache"
Cohesion: 0.22
Nodes (14): cachedGet(), CacheEntry, CacheKey, caches, cleanupSandboxListeners(), fetchWithRetry(), getAuthHeaders(), handleSandboxChanged() (+6 more)

### Community 61 - "Autonomy Safeguards"
Cohesion: 0.20
Nodes (10): AUTONOMY_LEVEL_OPTIONS, AutonomyLevelSelectorProps, Checkpoint, SafeguardsSection(), AutonomyLevel, DEFAULT_SAFEGUARDS_CONFIG, SafeguardsConfig, useSafeguardsConfig() (+2 more)

### Community 62 - "Floating Orb Mascot"
Cohesion: 0.21
Nodes (9): FloatingOrb(), OrbState, OrbStatus, useOrbState(), Mascot(), MascotMood, moodFromStatus(), useBlink() (+1 more)

### Community 63 - "Markdown Preview & Sanitize"
Cohesion: 0.22
Nodes (11): MarkdownPreview, MarkdownPreviewProps, Props, SourcesSummaryCard(), ALLOWED_ATTRIBUTES, ALLOWED_TAGS, isSafeHref(), isSafeImageSrc() (+3 more)

### Community 64 - "Slide Preview Modal"
Cohesion: 0.15
Nodes (13): SlidePreviewModal, DENSITIES, DensityKey, GeneratedDoc, optionClass(), Props, RatioKey, RATIOS (+5 more)

### Community 65 - "Workflows Panel"
Cohesion: 0.26
Nodes (13): ActiveRunTracker(), formatElapsed(), formatRelativeTime(), statusColor(), statusIcon(), statusLabel(), stepStatusIcon(), WorkflowRunState (+5 more)

### Community 66 - "Vite Asset Typings"
Cohesion: 0.14
Nodes (13): *.css, *.jpeg, *.jpg, *.less, *.module.css, *.module.scss, *.mp4, *.png (+5 more)

### Community 67 - "Chat Minimap"
Cohesion: 0.22
Nodes (9): ChatMinimap(), ChatMinimapProps, classify(), MessageKind, Segment, segmentColor(), SuggestionContext, UseChatSearchOptions (+1 more)

### Community 68 - "Live Skills Monitor"
Cohesion: 0.21
Nodes (11): fmtDuration(), fmtTime(), LiveSkillsMonitor(), SKILL_META, SkillMeta, SkillRow(), SkillRowProps, SkillUsage (+3 more)

### Community 69 - "Workflow Run Panel"
Cohesion: 0.23
Nodes (12): ActiveRun, formatElapsed(), statusColor(), statusIcon(), statusLabel(), StepRunState, stepStatusIcon(), timeAgo() (+4 more)

### Community 70 - "Startup Project Modal"
Cohesion: 0.22
Nodes (12): formatDate(), getElectronAPI(), getElectronQuitAPI(), getWorkspaceColor(), getWorkspaceInitials(), MODAL_SPRING, OVERLAY_FADE, StartupProjectModal() (+4 more)

### Community 71 - "Logger"
Cohesion: 0.17
Nodes (9): consoleWrapper, defaultConfig, devLog(), log, LOG_LEVELS, logger, LoggerConfig, LogLevel (+1 more)

### Community 72 - "Explainability View"
Cohesion: 0.18
Nodes (12): ./ExplainabilityView.js, ExplainabilityView(), ExplainResponse, Factor, FactorTone, Prediction, PRESETS, RISK_META (+4 more)

### Community 73 - "Mission Simulation View"
Cohesion: 0.17
Nodes (9): ./MissionSimulationView.js, formatDuration(), MissionSimulationView(), PRESETS, RISK_META, RiskLevel, SimulatedStep, SimulationReport (+1 more)

### Community 74 - "Agent Status Bar"
Cohesion: 0.26
Nodes (10): AgentStatusBar(), STATE_ICON, AgentState, AgentStatus, fromAutonomy(), fromMissionEvent(), MissionSignal, STATE_META (+2 more)

### Community 75 - "Telegram Status Modal"
Cohesion: 0.17
Nodes (5): TelegramBotInfo, TelegramDockedPanelProps, TelegramStatus, TelegramStatusModal, TelegramStatusModalProps

### Community 76 - "Browser Tabs & Extensions"
Cohesion: 0.24
Nodes (9): BROWSER_HOME_URL, BrowserTab, newTabId(), useBrowserExtensions(), UseBrowserExtensionsResult, isTrackableUrl(), loadHistory(), persistHistory() (+1 more)

### Community 77 - "Document Templates"
Cohesion: 0.30
Nodes (9): ICON_MAP, Props, TemplateSelectorModal(), DOCUMENT_TEMPLATES, DocumentTemplate, extractVariables(), getDefaultVariableValues(), renderTemplate() (+1 more)

### Community 78 - "Chat Persistence"
Cohesion: 0.26
Nodes (9): getStorageKey(), parseTranscript(), PersistedTranscriptEntry, stripInlineImages(), useChatPersistence(), TranscriptRole, useTranscript(), formatTime() (+1 more)

### Community 79 - "GitHub View"
Cohesion: 0.20
Nodes (11): GitHubView, Commit, CommitDetail, CommitFile, GitHubView(), Issue, openExternal(), PullRequest (+3 more)

### Community 80 - "IDE API Client"
Cohesion: 0.21
Nodes (11): CacheEntry, fetchWithRetry(), FileContentResponse, FileCountResponse, getAuthHeaders(), missionAction(), MissionActionResult, readFileCache (+3 more)

### Community 81 - "Mission Timeline Types"
Cohesion: 0.17
Nodes (8): EVENT_META, IconComp, MissionListItem, MissionTimeline, StepSnapshot, TERMINAL_STATUSES, TimelineEvent, TimelineEventType

### Community 82 - "Monaco Prompt Editor"
Cohesion: 0.22
Nodes (6): DiffEditorLazy, MarkdownPromptDiffProps, defineThemes(), MarkdownPromptEditor(), MarkdownPromptEditorProps, MonacoEditor

### Community 83 - "Env Setup Keys"
Cohesion: 0.24
Nodes (8): ALL_SPECS, KEY_GROUPS, KeySpec, REQUIRED_KEYS, EnvApiResponse, EnvSectionData, EnvVarMeta, OVERLAY_FADE

### Community 84 - "File Explorer (Classic)"
Cohesion: 0.27
Nodes (8): countEntries(), FileExplorer, FileExplorerProps, filterTree(), nextSort(), sortEntries(), sortLabel(), SortMode

### Community 85 - "Browser Tab View"
Cohesion: 0.25
Nodes (9): BrowserTabViewProps, ConsoleEntry, TabStatePatch, BrowserPanelProps, WebviewFailLoadEvent, WebviewFaviconEvent, WebviewFoundInPageEvent, WebviewNavigateEvent (+1 more)

### Community 86 - "MCP Panel"
Cohesion: 0.20
Nodes (10): EMPTY_FORM, formatTimestamp(), McpMetric, McpMetricsSummary, McpPanel(), McpServer, McpTool, NewServerForm (+2 more)

### Community 87 - "Env Settings Section"
Cohesion: 0.18
Nodes (7): EnvApiResponse, EnvFieldType, EnvSectionData, EnvSelectOption, EnvVarMeta, TYPE_ICON, TYPE_LABEL

### Community 88 - "Async State UI"
Cohesion: 0.18
Nodes (6): AsyncEmptyProps, AsyncErrorProps, AsyncLoadingProps, AsyncState, AsyncStateAction, AsyncStateProps

### Community 90 - "Behavior Profiles"
Cohesion: 0.31
Nodes (8): BEHAVIOR_PROFILES, BehaviorProfile, DEFAULT_PROFILE_ID, getProfile(), ProfileIcon, ICONS, ProfileSwitcher(), ProfileSwitcherProps

### Community 91 - "Browser Toolbar & Profiles"
Cohesion: 0.29
Nodes (6): BrowserProfileSwitcherProps, BrowserToolbar(), BrowserToolbarProps, prettifyUrl(), BrowserHistoryEntry, BrowserProfile

### Community 93 - "Button Component"
Cohesion: 0.20
Nodes (9): BASE, Button, ButtonProps, ButtonSize, ButtonVariant, SIZE_STYLES, VARIANT_INLINE, VARIANT_STYLES (+1 more)

### Community 94 - "Notebook Types"
Cohesion: 0.20
Nodes (9): AudioOverview, ChatMessage, Citation, GeneratedDoc, NotebookData, NotebookSummary, NoteItem, SourceItem (+1 more)

### Community 95 - "Mermaid Diagrams"
Cohesion: 0.31
Nodes (7): initMermaid(), loadMermaid(), Mermaid, MermaidDiagram, MermaidTheme, Props, resolveMermaidTheme()

### Community 96 - "Chat Message List"
Cohesion: 0.42
Nodes (3): ChatMessageListProps, ChatPanelProps, PendingChatMessage

### Community 97 - "Inline Diff Editor"
Cohesion: 0.31
Nodes (8): countLineDelta(), DiffEditorLazy, InlineDiffEditor(), InlineDiffEditorProps, isLightTheme(), isTestFile(), Status, TestRunResult

### Community 98 - "Inline Edits Parser"
Cohesion: 0.33
Nodes (8): EditSegment, hasInlineEdits(), languageFromPath(), MessageSegment, parseInfoString(), parseMessageSegments(), ProseSegment, unquote()

### Community 99 - "Command Palette"
Cohesion: 0.31
Nodes (8): CommandEntry, CommandPalette(), CommandPaletteProps, FileEntry, fuzzyMatch(), fuzzyScore(), getAuthHeaders(), PaletteMode

### Community 100 - "Global Search"
Cohesion: 0.28
Nodes (7): buildFlatItems(), FlatItem, getAuthHeaders(), GlobalSearch(), GlobalSearchProps, SearchMatch, SearchResultGroup

### Community 101 - "Memory Panel"
Cohesion: 0.28
Nodes (6): MemoriesView, MemoryPanelProps, MemoriesView, MemoriesView(), Memory, timeAgo()

### Community 103 - "MCP Directory"
Cohesion: 0.28
Nodes (8): authHeaders(), DirectoryMetadata, DirectoryServer, McpDirectory(), McpDirectoryProps, originLabel(), ServerCard(), TransportFilter

### Community 104 - "Settings View"
Cohesion: 0.28
Nodes (6): SettingsView, getActiveLabel(), getSectionDescription(), NAV_GROUPS, SECURE_ITEMS, SettingsView()

### Community 105 - "Prompts Section"
Cohesion: 0.33
Nodes (8): DARK_THEMES, estimateTokensLocal(), formatDate(), formatSize(), OPTIMIZE_GOALS, prettyLabel(), PromptFileMeta, PromptsSection()

### Community 106 - "Skills Documentation"
Cohesion: 0.22
Nodes (6): ICON_MAP, SkillDoc, SkillsDocResponse, SkillsDocumentationProps, ToolDoc, ToolParamDoc

### Community 107 - "Toast Notifications"
Cohesion: 0.22
Nodes (6): COLORS, ICONS, ToastContext, ToastContextValue, ToastItem, ToastType

### Community 108 - "Terminal Hook"
Cohesion: 0.33
Nodes (8): getServerPort(), getTerminalWebSocketUrl(), isElectron(), TerminalActions, TerminalMessage, TerminalSize, TerminalState, useTerminal()

### Community 109 - "IDE Remote Bridge"
Cohesion: 0.31
Nodes (8): ElectronBridgeAPI, FOCUS_IDE_EVENTS, FORWARDED_IDE_EVENTS, getElectronAPI(), installIdeRemoteForwarder(), installIdeRemoteReceiver(), isRemoteBridgeAvailable(), OrbLiveWindow()

### Community 110 - "GlobalCommandPalette"
Cohesion: 0.36
Nodes (7): buildItems(), GlobalCommandPalette(), KEYWORDS, norm(), PaletteItem, score(), ROUTES

### Community 111 - "ChangeLogPanel"
Cohesion: 0.36
Nodes (6): ChangeLogPanel(), ChangeLogPanelProps, relativeTime(), ChangeLogEntry, FILE_WRITTEN_EVENT, FileWrittenDetail

### Community 112 - "ChatMessage"
Cohesion: 0.32
Nodes (5): ChatMessage, ChatMessageProps, highlightText(), TRANSITIONS, ContextSource

### Community 113 - "DocumentUpload"
Cohesion: 0.25
Nodes (4): DocumentResult, DocumentUploadProps, DropZoneOverlayProps, UseDocumentDropOptions

### Community 114 - "AssistantLogsPanel"
Cohesion: 0.29
Nodes (7): AssistantLogsPanel(), AssistantLogsPanelProps, formatTime(), LEVEL_COLORS, LogLevel, LogScope, RuntimeLogEntry

### Community 115 - "types"
Cohesion: 0.25
Nodes (7): AIMenuItem, AssistantActions, AssistantState, IDEPanelActions, IDEPanelState, SidebarContext, UnifiedSidebarProps

### Community 116 - "ScreenShareContext"
Cohesion: 0.29
Nodes (5): ScreenShareContext, ScreenShareContextValue, ScreenShareProviderProps, ScreenShareState, ScreenSource

### Community 117 - "sound"
Cohesion: 0.36
Nodes (5): ConnectionStatus, useWebSocket(), UseWebSocketOptions, getAudioContext(), playSessionStartSound()

### Community 118 - "helpers"
Cohesion: 0.32
Nodes (5): AllProviders(), jsonResponse(), mockFetchRouter(), renderWithProviders(), RouteHandler

### Community 119 - "ContextMenu"
Cohesion: 0.33
Nodes (6): ClipboardEntry, ContextMenu(), ContextMenuAction, ContextMenuProps, ContextTarget, getActions()

### Community 120 - "PromptInspectorPanel"
Cohesion: 0.38
Nodes (6): formatChars(), PromptInspectorPanel(), PromptInspectorPanelProps, TabDef, TabId, PromptDebugState

### Community 121 - "ASTCallGraphExplorer"
Cohesion: 0.29
Nodes (5): ASTStats, CallChainNode, CallChainResult, CallEdge, FunctionItem

### Community 122 - "KnowledgeHealthDashboard"
Cohesion: 0.29
Nodes (5): DocumentsData, HealthData, PHASE_LABELS, ReindexProgress, TabId

### Community 123 - "NotebookVoicePanel"
Cohesion: 0.29
Nodes (5): BAR_JITTER, Props, STATE_COLOR, STATE_LABEL, VoiceState

### Community 124 - "useBrowserProfiles"
Cohesion: 0.48
Nodes (6): DEFAULT_PROFILE, loadActiveId(), loadProfiles(), partitionFor(), persist(), useBrowserProfiles()

### Community 125 - "SelfRootSection"
Cohesion: 0.33
Nodes (6): FALLBACK_STATUS, getElectronAPI(), SelfRootSection(), SelfRootStatus, WorkspaceItem, ideApi

### Community 126 - "ConfirmDialog"
Cohesion: 0.29
Nodes (4): ConfirmDialogContext, ConfirmDialogContextValue, ConfirmDialogState, ConfirmOptions

### Community 127 - "useEnsureNotebook"
Cohesion: 0.43
Nodes (5): NotebookSummary, useEnsureNotebook(), UseEnsureNotebookOptions, UseEnsureNotebookResult, useNotebookId()

### Community 128 - "customSkillsAccess"
Cohesion: 0.38
Nodes (4): supabase, CustomSkill, customSkillsAccessSkill, databaseSkill

### Community 129 - "electron Typings"
Cohesion: 0.29
Nodes (6): BrowserExtensionInfo, BrowserExtensionsListResult, BrowserExtensionsLoadResult, BrowserExtensionsRemoveResult, ElectronAPI, Window

### Community 130 - "CriticalEditConfirm"
Cohesion: 0.33
Nodes (4): ConfirmRequest, CriticalEditConfirm(), OPERATION_LABELS, Props

### Community 131 - "InlineApproval"
Cohesion: 0.33
Nodes (4): ConfirmRequest, InlineApproval(), InlineApprovalProps, OPERATION_LABELS

### Community 132 - "ScheduledTasksPanel"
Cohesion: 0.47
Nodes (5): formatInterval(), formatRelative(), ScheduledTasksPanel, ScheduledTasksPanelProps, ScheduledTaskViewModel

### Community 133 - "HierarchicalMemorySection"
Cohesion: 0.33
Nodes (4): HierarchicalMemoryItem, HierarchicalStats, HierarchicalTier, TIER_COLORS

### Community 134 - "StatusBadge"
Cohesion: 0.33
Nodes (4): STATUS_MAP, StatusBadgeProps, StatusConfig, StatusType

### Community 135 - "global Typings"
Cohesion: 0.33
Nodes (4): CustomEventMap, react-window-tree, TreeNodeData, Window

### Community 137 - "DiffViewer"
Cohesion: 0.50
Nodes (5): ../components/ide/DiffViewer.js, DiffViewer(), DiffViewerProps, getAuthHeaders(), DiffViewer

### Community 139 - "FileIcon"
Cohesion: 0.50
Nodes (4): EXT_COLOR, FileIcon(), FileIconProps, pickIcon()

### Community 140 - "BrowserTabStrip"
Cohesion: 0.50
Nodes (4): BrowserTabStrip(), BrowserTabStripProps, tabLabel(), TabStripItem

### Community 143 - "IconButton"
Cohesion: 0.50
Nodes (4): IconButton(), IconButtonProps, IconButtonVariant, iconButtonVariants

### Community 144 - "SidePanel"
Cohesion: 0.40
Nodes (3): SidePanelMode, SidePanelPosition, SidePanelProps

### Community 145 - "VisualWorkflowBuilder"
Cohesion: 0.40
Nodes (3): COMMON_ACTIONS, VisualWorkflowBuilderProps, WorkflowStepForm

### Community 146 - "useActivity"
Cohesion: 0.50
Nodes (4): ModifiedFile, ReasoningStep, toolLabel(), useActivity()

### Community 147 - "NotebooksView"
Cohesion: 0.50
Nodes (4): NotebooksView, NotebooksView, getNotebookIdFromHash(), NotebooksView()

### Community 149 - "index"
Cohesion: 0.50
Nodes (3): memoryManagerSkill, supabase, getSupabaseClient()

### Community 152 - "BottomDock"
Cohesion: 0.67
Nodes (3): BottomDock(), BottomDockProps, getBottomDockHeight()

### Community 155 - "ImagePreview"
Cohesion: 0.67
Nodes (3): getAuthHeaders(), ImagePreview(), Props

### Community 157 - "ModelPickerModal"
Cohesion: 0.50
Nodes (3): ModelPickerModal, ModelPickerModalProps, PickerTab

### Community 159 - "PdfPreview"
Cohesion: 0.67
Nodes (3): getAuthHeaders(), PdfPreview(), Props

### Community 161 - "InfographicModal"
Cohesion: 0.67
Nodes (3): InfographicModal(), optionClass(), Props

### Community 164 - "ProfileSection"
Cohesion: 0.67
Nodes (3): initials(), ProfileSection(), QUICK_ROLES

## Ambiguous Edges - Review These
- `Design Violation Grep Checks` → `Evidence Engine / EvidenceBundle`  [AMBIGUOUS]
  src/components/notebooks/audit.md · relation: semantically_similar_to

## Knowledge Gaps
- **910 isolated node(s):** `STATE_ICON`, `EVENT_LABELS`, `AutonomyTimelineProps`, `ConfirmRequest`, `OPERATION_LABELS` (+905 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1275 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **54 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Design Violation Grep Checks` and `Evidence Engine / EvidenceBundle`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `./MissionTimelineView.js` connect `Mission Timeline Pilotage` to `Automation & Swarm Views`, `IDE API Client`, `Global Sidebar Navigation`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `../components/ide/RichDocumentViewer.js` connect `Rich Document Viewer` to `Chat Markdown & Sources`, `Agent Activity Store`, `Markdown Preview & Sanitize`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `./AutonomyView.js` connect `Pending Approvals` to `Automation & Swarm Views`, `Mission Timeline Pilotage`, `Global Sidebar Navigation`, `Autonomy Safeguards`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `STATE_ICON`, `EVENT_LABELS`, `AutonomyTimelineProps` to the rest of the system?**
  _910 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Virtualized File Explorer` be split into smaller, more focused modules?**
  _Cohesion score 0.05009920634920635 - nodes in this community are weakly interconnected._
- **Should `Marketplace Panel & Store` be split into smaller, more focused modules?**
  _Cohesion score 0.07966457023060797 - nodes in this community are weakly interconnected._